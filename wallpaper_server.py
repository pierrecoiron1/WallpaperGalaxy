#!/usr/bin/env python3
"""Local backend for Desktop Wallpaper.

Serves the static HTML/JS files on http://127.0.0.1:43117 and holds the
"current tracked system" seed that both monitor panes agree on. The galaxy
pane POSTs /api/rotate when its reticle drifts off screen; the chart pane
polls /api/current and re-renders when the seed changes.

Standard library only — no external dependencies.
"""

import http.server
import json
import os
import random
import threading
from functools import partial
from http import HTTPStatus


HOST = "127.0.0.1"
PORT = 43117
SERVE_DIR = os.path.dirname(os.path.abspath(__file__))

_state_lock = threading.Lock()
_current_seed = random.getrandbits(32)


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
        if self.path.startswith("/api/current"):
            with _state_lock:
                self._send_json({"seed": _current_seed})
            return
        super().do_GET()

    def do_POST(self):
        global _current_seed
        if self.path.startswith("/api/rotate"):
            with _state_lock:
                _current_seed = random.getrandbits(32)
                seed = _current_seed
            self._send_json({"seed": seed})
            return
        self.send_response(HTTPStatus.NOT_FOUND)
        self.end_headers()


def main():
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
