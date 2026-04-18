#!/usr/bin/env python3
"""Local backend for Desktop Wallpaper.

Serves the static HTML/JS files on http://127.0.0.1:43117 and holds:
  - the current tracked-system seed that both monitor panes sync against
  - user configuration (location, units) persisted at
    ~/.config/wallpaper-galaxy/config.json
  - a cached weather snapshot fetched from Open-Meteo

Endpoints
  GET  /api/current           → {seed: N}                (target star)
  POST /api/rotate            → {seed: N}                (new target star)
  GET  /api/weather           → {temp, high, low, precip, condition, ...}
  GET  /api/config            → current config
  POST /api/config            → merge + save + refetch weather
  GET  /api/geocode?q=...     → Open-Meteo geocoding proxy

Standard library only — no external dependencies.
"""

import http.server
import json
import os
import random
import threading
import time
import urllib.parse
import urllib.request
from functools import partial
from http import HTTPStatus
from pathlib import Path


HOST = "127.0.0.1"
PORT = 43117
SERVE_DIR = os.path.dirname(os.path.abspath(__file__))

CONFIG_PATH = Path(os.environ.get(
    "XDG_CONFIG_HOME", Path.home() / ".config"
)) / "wallpaper-galaxy" / "config.json"
WEATHER_REFRESH_SEC = 15 * 60

# Open-Meteo WMO weather codes → short uppercase label for the HUD.
WEATHER_CODE = {
    0: "CLEAR", 1: "MOSTLY CLEAR", 2: "PARTLY CLOUDY", 3: "OVERCAST",
    45: "FOG", 48: "FOG",
    51: "DRIZZLE", 53: "DRIZZLE", 55: "DRIZZLE",
    56: "FREEZING DRIZZLE", 57: "FREEZING DRIZZLE",
    61: "RAIN LIGHT", 63: "RAIN", 65: "RAIN HEAVY",
    66: "FREEZING RAIN", 67: "FREEZING RAIN",
    71: "SNOW LIGHT", 73: "SNOW", 75: "SNOW HEAVY", 77: "SNOW",
    80: "SHOWERS LIGHT", 81: "SHOWERS", 82: "SHOWERS HEAVY",
    85: "SNOW SHOWERS", 86: "SNOW SHOWERS",
    95: "THUNDERSTORM", 96: "THUNDERSTORM HAIL", 99: "THUNDERSTORM HAIL",
}

_state_lock = threading.Lock()
_current_seed = random.getrandbits(32)

_config_lock = threading.Lock()
_config = None

_weather_lock = threading.Lock()
_weather = None

_wake_weather = threading.Event()


def _default_config():
    return {
        "lat": 0.0,
        "lon": 0.0,
        "city": "UNKNOWN",
        "units": "imperial",  # imperial | metric
    }


def _bootstrap_from_ip():
    """Best-effort first-run location via free IP geolocation (no API key)."""
    cfg = _default_config()
    try:
        with urllib.request.urlopen("http://ip-api.com/json", timeout=5) as r:
            data = json.loads(r.read())
        if data.get("status") == "success":
            cfg["lat"] = float(data["lat"])
            cfg["lon"] = float(data["lon"])
            region = data.get("region", "") or data.get("country", "")
            cfg["city"] = (f"{data['city']}, {region}").strip(", ")
    except Exception:
        pass
    return cfg


def _load_config():
    if CONFIG_PATH.exists():
        try:
            cfg = json.loads(CONFIG_PATH.read_text())
            base = _default_config()
            base.update(cfg or {})
            return base
        except Exception:
            pass
    cfg = _bootstrap_from_ip()
    _save_config(cfg)
    return cfg


def _save_config(cfg):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))


def _fetch_weather(cfg):
    units = cfg.get("units", "imperial")
    temp_unit = "fahrenheit" if units == "imperial" else "celsius"
    url = (
        "https://api.open-meteo.com/v1/forecast"
        f"?latitude={cfg['lat']}&longitude={cfg['lon']}"
        "&current_weather=true"
        "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weathercode"
        f"&temperature_unit={temp_unit}"
        "&timezone=auto"
    )
    with urllib.request.urlopen(url, timeout=10) as r:
        data = json.loads(r.read())
    cw = data.get("current_weather") or {}
    daily = data.get("daily") or {}

    def _first(key, default=0):
        vals = daily.get(key) or [default]
        return vals[0] if vals else default

    return {
        "temp": round(cw.get("temperature", 0)),
        "high": round(_first("temperature_2m_max", 0) or 0),
        "low": round(_first("temperature_2m_min", 0) or 0),
        "precip": round(_first("precipitation_probability_max", 0) or 0),
        "condition": WEATHER_CODE.get(cw.get("weathercode", 0), "UNKNOWN"),
        "city": cfg.get("city", ""),
        "units": units,
        "updatedAt": int(time.time()),
    }


def _weather_worker():
    """Refresh weather every WEATHER_REFRESH_SEC, or sooner when woken."""
    global _weather
    while True:
        try:
            with _config_lock:
                cfg = dict(_config) if _config else None
            if cfg:
                w = _fetch_weather(cfg)
                with _weather_lock:
                    _weather = w
        except Exception:
            pass
        # Wait with early-wake support for config changes.
        _wake_weather.wait(timeout=WEATHER_REFRESH_SEC)
        _wake_weather.clear()


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass  # quiet

    def _send_json(self, payload, status=HTTPStatus.OK):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path

        if path == "/api/current":
            with _state_lock:
                self._send_json({"seed": _current_seed})
            return

        if path == "/api/weather":
            with _weather_lock:
                self._send_json(_weather or {"error": "not ready"})
            return

        if path == "/api/config":
            with _config_lock:
                self._send_json(_config)
            return

        if path == "/api/geocode":
            qs = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
            name = (qs.get("q") or [""])[0].strip()
            if not name:
                self._send_json({"results": []})
                return
            geo_url = (
                "https://geocoding-api.open-meteo.com/v1/search"
                f"?name={urllib.parse.quote(name)}&count=5&language=en&format=json"
            )
            try:
                with urllib.request.urlopen(geo_url, timeout=5) as r:
                    self._send_json(json.loads(r.read()))
            except Exception as e:
                self._send_json({"results": [], "error": str(e)},
                                status=HTTPStatus.BAD_GATEWAY)
            return

        super().do_GET()

    def do_POST(self):
        global _current_seed
        path = urllib.parse.urlparse(self.path).path

        if path == "/api/rotate":
            with _state_lock:
                _current_seed = random.getrandbits(32)
                seed = _current_seed
            self._send_json({"seed": seed})
            return

        if path == "/api/config":
            length = int(self.headers.get("Content-Length", 0) or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                incoming = json.loads(raw) if raw else {}
                if not isinstance(incoming, dict):
                    raise ValueError("config must be an object")
            except Exception:
                self.send_response(HTTPStatus.BAD_REQUEST)
                self.end_headers()
                return
            with _config_lock:
                _config.update(incoming)
                _save_config(_config)
                cfg_out = dict(_config)
            _wake_weather.set()  # refetch immediately
            self._send_json(cfg_out)
            return

        self.send_response(HTTPStatus.NOT_FOUND)
        self.end_headers()


def main():
    global _config
    _config = _load_config()

    threading.Thread(target=_weather_worker, daemon=True).start()

    handler = partial(Handler, directory=SERVE_DIR)
    server = http.server.ThreadingHTTPServer((HOST, PORT), handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
