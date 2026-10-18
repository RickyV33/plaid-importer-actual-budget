"""Serves the static demo copy written by scripts/screenshots.ts the way Fastify
serves the real app: /static/* as files, /api/<name> as the demo responses,
and every other path as the app's shell. Writes answer 204 and change nothing.

Usage: python3 scripts/screenshots_server.py <dir> <port>
"""

import http.server
import os
import sys

ROOT = os.path.abspath(sys.argv[1])
PORT = int(sys.argv[2])
TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".woff2": "font/woff2", ".json": "application/json", ".svg": "image/svg+xml"}


class Handler(http.server.BaseHTTPRequestHandler):
    def send_file(self, path):
        with open(path, "rb") as f:
            body = f.read()
        self.send_response(200)
        self.send_header("content-type", TYPES.get(os.path.splitext(path)[1], "application/octet-stream"))
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/static/"):
            file = os.path.abspath(os.path.join(ROOT, path.lstrip("/")))
            if file.startswith(ROOT) and os.path.isfile(file):
                return self.send_file(file)
            return self.send_error(404)
        if path.startswith("/api/"):
            # /api/profiles/new -> profiles_new.json, falling back to profiles.json.
            parts = path[len("/api/"):].strip("/").split("/")
            for name in ("_".join(parts), parts[0]):
                file = os.path.join(ROOT, "api", name + ".json")
                if os.path.isfile(file):
                    return self.send_file(file)
            return self.send_error(404)
        return self.send_file(os.path.join(ROOT, "static", "app", "index.html"))

    def do_POST(self):
        self.send_response(204)
        self.end_headers()

    do_PUT = do_POST
    do_DELETE = do_POST

    def log_message(self, *args):
        pass


http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
