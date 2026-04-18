#!/usr/bin/env python3
"""Cross-platform desktop GUI for Wallpaper Galaxy config.

Talks to the running wallpaper_server.py (http://127.0.0.1:43117) over
localhost HTTP — same endpoints as config.html. Python stdlib only:
tkinter ships with Python on Windows and macOS; on Ubuntu install with
`sudo apt install python3-tk`.

Run from anywhere (it's stateless, no staging needed):
    python3 config_gui.py

Requires the wallpaper backend to be running. Start it with the platform
script under platforms/linux/ or platforms/windows/.
"""

import json
import math
import tkinter as tk
import urllib.parse
import urllib.request
from tkinter import messagebox, ttk


SERVER = "http://127.0.0.1:43117"
TIMEOUT = 5


def api_get(path):
    with urllib.request.urlopen(f"{SERVER}{path}", timeout=TIMEOUT) as r:
        return json.loads(r.read())


def api_post(path, body):
    req = urllib.request.Request(
        f"{SERVER}{path}",
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return json.loads(r.read())


class ConfigApp:
    def __init__(self, root):
        self.root = root
        root.title("Wallpaper Galaxy · Config")
        root.geometry("560x640")
        root.minsize(480, 560)

        style = ttk.Style()
        try:
            style.theme_use("clam")   # consistent across platforms
        except tk.TclError:
            pass

        self._build_location_section(root)
        self._build_units_section(root)
        self._build_flight_section(root)
        self._build_density_section(root)
        self._build_weather_section(root)
        self._build_action_row(root)

        # Initial load
        self.refresh()

    # ---------- UI construction ----------

    def _build_location_section(self, parent):
        frame = ttk.LabelFrame(parent, text="LOCATION")
        frame.pack(fill="x", padx=12, pady=(12, 6))

        ttk.Label(frame, text="Search city").pack(anchor="w", padx=12, pady=(8, 2))
        search_row = ttk.Frame(frame)
        search_row.pack(fill="x", padx=12)
        self.search_var = tk.StringVar()
        entry = ttk.Entry(search_row, textvariable=self.search_var)
        entry.pack(side="left", fill="x", expand=True)
        entry.bind("<Return>", lambda _e: self.search())
        ttk.Button(search_row, text="Search", command=self.search).pack(
            side="left", padx=(6, 0)
        )

        self.results_listbox = tk.Listbox(frame, height=5, activestyle="dotbox")
        self.results_listbox.pack(fill="x", padx=12, pady=(6, 4))
        self.results_listbox.bind("<<ListboxSelect>>", self._on_result_select)
        self.geocode_results = []

        ttk.Label(frame, text="Current").pack(anchor="w", padx=12, pady=(6, 0))
        self.current_city_var = tk.StringVar(value="…")
        ttk.Label(
            frame, textvariable=self.current_city_var, foreground="#b48a3b"
        ).pack(anchor="w", padx=12, pady=(0, 4))

        ll_row = ttk.Frame(frame)
        ll_row.pack(fill="x", padx=12, pady=(4, 10))
        ttk.Label(ll_row, text="Lat").pack(side="left")
        self.lat_var = tk.StringVar()
        ttk.Entry(ll_row, textvariable=self.lat_var, width=12).pack(
            side="left", padx=(4, 12)
        )
        ttk.Label(ll_row, text="Lon").pack(side="left")
        self.lon_var = tk.StringVar()
        ttk.Entry(ll_row, textvariable=self.lon_var, width=12).pack(
            side="left", padx=(4, 0)
        )

    def _build_units_section(self, parent):
        frame = ttk.LabelFrame(parent, text="UNITS")
        frame.pack(fill="x", padx=12, pady=6)
        self.units_var = tk.StringVar(value="imperial")
        ttk.Radiobutton(
            frame, text="Imperial (°F)", variable=self.units_var, value="imperial"
        ).pack(anchor="w", padx=12, pady=(8, 0))
        ttk.Radiobutton(
            frame, text="Metric (°C)", variable=self.units_var, value="metric"
        ).pack(anchor="w", padx=12, pady=(0, 10))

    def _build_flight_section(self, parent):
        frame = ttk.LabelFrame(parent, text="FLIGHT SPEED")
        frame.pack(fill="x", padx=12, pady=6)
        self.flight_log_var = tk.DoubleVar(value=0.0)     # log2 space, center = 1×
        self.flight_display_var = tk.StringVar(value="1.00×")
        self._build_log_slider(frame, self.flight_log_var, self.flight_display_var)

    def _build_density_section(self, parent):
        frame = ttk.LabelFrame(parent, text="STELLAR DENSITY")
        frame.pack(fill="x", padx=12, pady=6)
        self.density_log_var = tk.DoubleVar(value=0.0)
        self.density_display_var = tk.StringVar(value="1.00×")
        self._build_log_slider(frame, self.density_log_var, self.density_display_var)

    def _build_log_slider(self, parent, log_var, display_var):
        """Shared helper — slider is log2(multiplier), so 0 ⇒ 1.0×."""
        row = ttk.Frame(parent)
        row.pack(fill="x", padx=12, pady=10)

        def update_label(*_):
            display_var.set(f"{2 ** log_var.get():.2f}×")

        scale = ttk.Scale(
            row, from_=-2.0, to=2.0, orient="horizontal",
            variable=log_var, command=lambda _v: update_label(),
        )
        scale.pack(side="left", fill="x", expand=True)
        ttk.Label(row, textvariable=display_var, width=8, anchor="e").pack(
            side="left", padx=(12, 0)
        )

    def _build_weather_section(self, parent):
        frame = ttk.LabelFrame(parent, text="CURRENT WEATHER")
        frame.pack(fill="x", padx=12, pady=6)
        self.wx_primary_var = tk.StringVar(value="…")
        self.wx_detail_var = tk.StringVar(value="…")
        ttk.Label(frame, textvariable=self.wx_primary_var).pack(
            anchor="w", padx=12, pady=(8, 0)
        )
        ttk.Label(frame, textvariable=self.wx_detail_var, foreground="#7a7a7a").pack(
            anchor="w", padx=12, pady=(0, 10)
        )

    def _build_action_row(self, parent):
        frame = ttk.Frame(parent)
        frame.pack(fill="x", padx=12, pady=(10, 12))
        ttk.Button(frame, text="Save", command=self.save).pack(side="left")
        ttk.Button(frame, text="Refresh", command=self.refresh).pack(
            side="left", padx=(6, 0)
        )
        self.status_var = tk.StringVar(value="")
        ttk.Label(
            frame, textvariable=self.status_var, foreground="#b48a3b"
        ).pack(side="left", padx=12)

    # ---------- Actions ----------

    def refresh(self):
        self.status_var.set("loading…")
        self.root.update_idletasks()
        try:
            cfg = api_get("/api/config")
        except Exception as e:
            self.status_var.set("")
            messagebox.showerror(
                "Backend unreachable",
                f"Could not reach {SERVER}.\n\n"
                "Start the wallpaper backend first:\n"
                "  • Linux:  platforms/linux/start_wallpaper.sh\n"
                "  • Windows: platforms/windows/start_server.ps1\n\n"
                f"Details: {e}",
            )
            return
        self.current_city_var.set(cfg.get("city", "(unset)"))
        self.lat_var.set(str(cfg.get("lat", "")))
        self.lon_var.set(str(cfg.get("lon", "")))
        self.units_var.set(cfg.get("units", "imperial"))
        # Sliders stored in log2 space so 1.0× is exactly centered.
        flight = cfg.get("flightSpeed", 1.0) or 1.0
        density = cfg.get("stellarDensity", 1.0) or 1.0
        self.flight_log_var.set(math.log2(flight))
        self.flight_display_var.set(f"{flight:.2f}×")
        self.density_log_var.set(math.log2(density))
        self.density_display_var.set(f"{density:.2f}×")

        try:
            wx = api_get("/api/weather")
        except Exception:
            wx = None
        if wx and "error" not in wx:
            deg = "°C" if wx.get("units") == "metric" else "°F"
            precip10 = round(wx.get("precip", 0) / 10) * 10
            self.wx_primary_var.set(
                f"{wx.get('temp', '?')}{deg} · {wx.get('condition', '?')}"
            )
            self.wx_detail_var.set(
                f"HI {wx.get('high', '?')} · LO {wx.get('low', '?')} · "
                f"PRECIP {precip10}%"
            )
        else:
            self.wx_primary_var.set("(weather not ready)")
            self.wx_detail_var.set("")
        self.status_var.set("")

    def search(self):
        q = self.search_var.get().strip()
        if not q:
            return
        self.results_listbox.delete(0, tk.END)
        self.geocode_results = []
        self.status_var.set("searching…")
        self.root.update_idletasks()
        try:
            data = api_get(f"/api/geocode?q={urllib.parse.quote(q)}")
        except Exception as e:
            self.status_var.set(f"search failed: {e}")
            return
        self.status_var.set("")
        results = data.get("results") or []
        if not results:
            self.results_listbox.insert(tk.END, "(no matches)")
            return
        for r in results:
            region = r.get("admin1") or r.get("admin2") or ""
            label = r["name"]
            if region:
                label += f", {region}"
            label += (
                f"  ·  {r.get('country', '')}  "
                f"({r['latitude']:.3f}, {r['longitude']:.3f})"
            )
            self.results_listbox.insert(tk.END, label)
            self.geocode_results.append(r)

    def _on_result_select(self, _event):
        sel = self.results_listbox.curselection()
        if not sel or sel[0] >= len(self.geocode_results):
            return
        r = self.geocode_results[sel[0]]
        self.lat_var.set(f"{r['latitude']:.4f}")
        self.lon_var.set(f"{r['longitude']:.4f}")
        region = r.get("admin1") or ""
        city = r["name"] + (f", {region}" if region else "")
        self.current_city_var.set(city)

    def save(self):
        try:
            lat = float(self.lat_var.get())
            lon = float(self.lon_var.get())
        except ValueError:
            self.status_var.set("need numeric lat/lon")
            return
        body = {
            "lat": lat,
            "lon": lon,
            "city": self.current_city_var.get(),
            "units": self.units_var.get(),
            "flightSpeed": 2 ** self.flight_log_var.get(),
            "stellarDensity": 2 ** self.density_log_var.get(),
        }
        self.status_var.set("saving…")
        self.root.update_idletasks()
        try:
            api_post("/api/config", body)
        except Exception as e:
            self.status_var.set(f"save failed: {e}")
            return
        self.status_var.set("saved")
        # Backend kicks off a weather refetch; give it ~2s then reload.
        self.root.after(2000, self.refresh)


def main():
    # className sets WM_CLASS so GNOME / other compositors can associate the
    # running window with its .desktop launcher (StartupWMClass=) and use
    # the app icon instead of a generic fallback.
    root = tk.Tk(className="WallpaperGalaxyConfig")
    ConfigApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
