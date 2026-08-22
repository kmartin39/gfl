#!/usr/bin/env python3
"""
Gridfinity Label - local image-catalog agent.

Lets the web app save uploaded photo icons (PNG/JPG) to disk and keep
photo-catalog.json up to date, which the browser alone cannot do (static
pages can't write to the filesystem). Pure standard library -- no
dependencies, no `uv run` needed.

Usage:
    python agent.py [--port 9101]

The agent listens on http://localhost:9101 and accepts requests from the
web app. It's started automatically by run-local.bat; keep it running while
uploading images. Stop with Ctrl-C.
"""

import argparse
import base64
import hashlib
import json
import mimetypes
import re
import sys
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

__version__ = "0.1.0"

REPO_ROOT = Path(__file__).resolve().parent.parent
PHOTOS_DIR = REPO_ROOT / "images" / "photos"
CATALOG_PATH = REPO_ROOT / "photo-catalog.json"

ALLOWED_ORIGIN = "*"

# Recognized image formats, keyed by the magic bytes at the start of the file.
MAGIC_SIGNATURES = [
    (b"\x89PNG\r\n\x1a\n", "png"),
    (b"\xff\xd8\xff", "jpg"),
]


def sniff_extension(data: bytes, fallback_name: str = "") -> str:
    for magic, ext in MAGIC_SIGNATURES:
        if data.startswith(magic):
            return ext
    # Fall back to the uploaded filename's extension if magic sniff fails.
    suffix = Path(fallback_name).suffix.lstrip(".").lower()
    if suffix in ("png", "jpg", "jpeg"):
        return "jpg" if suffix == "jpeg" else suffix
    raise ValueError("Not a recognized PNG or JPEG file")


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")
    return slug or "photo"


def unique_id(base_slug: str) -> str:
    if not CATALOG_PATH.exists():
        return base_slug
    catalog = load_catalog()
    existing_ids = {entry["id"] for entry in catalog}
    if base_slug not in existing_ids:
        return base_slug
    n = 2
    while f"{base_slug}-{n}" in existing_ids:
        n += 1
    return f"{base_slug}-{n}"


def load_catalog() -> list:
    if not CATALOG_PATH.exists():
        return []
    try:
        return json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def save_catalog(catalog: list) -> None:
    CATALOG_PATH.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")


def save_image_and_catalog(image_bytes: bytes, name: str, designation: str, source_filename: str = "") -> dict:
    ext = sniff_extension(image_bytes, source_filename)
    base_slug = slugify(name)
    entry_id = unique_id(base_slug)
    filename = f"{entry_id}.{ext}"

    PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
    (PHOTOS_DIR / filename).write_bytes(image_bytes)

    entry = {
        "id": entry_id,
        "file": filename,
        "name": name,
        "designation": designation or "",
        "addedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    catalog = load_catalog()
    catalog.append(entry)
    save_catalog(catalog)
    return entry


def fetch_url_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "gfl-image-agent/" + __version__})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = resp.read()
        if len(data) > 20 * 1024 * 1024:
            raise ValueError("Image too large (over 20MB)")
        return data


# ── HTTP server ───────────────────────────────────────────────────────────────

class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} {fmt % args}")

    def _cors(self, status: int, body: dict):
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", ALLOWED_ORIGIN)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self._cors(204, {})

    def do_GET(self):
        if self.path == "/status":
            self._cors(200, {"ready": True, "photosDir": str(PHOTOS_DIR)})
        else:
            self._cors(404, {"error": "Not found"})

    def do_POST(self):
        if self.path != "/upload":
            self._cors(404, {"error": "Not found"})
            return

        length = int(self.headers.get("Content-Length", 0))
        try:
            req = json.loads(self.rfile.read(length))
        except Exception as e:
            self._cors(400, {"error": f"Bad request: {e}"})
            return

        name = (req.get("name") or "").strip()
        designation = (req.get("designation") or "").strip()
        if not name:
            self._cors(400, {"error": "Name is required"})
            return

        try:
            if "url" in req and req["url"]:
                image_bytes = fetch_url_bytes(req["url"])
                source_filename = req["url"]
            elif "image_base64" in req:
                image_bytes = base64.b64decode(req["image_base64"])
                source_filename = req.get("filename", "")
            else:
                self._cors(400, {"error": "Provide image_base64 or url"})
                return

            entry = save_image_and_catalog(image_bytes, name, designation, source_filename)
            print(f"  -> saved {entry['file']} ({len(image_bytes):,} bytes) as \"{name}\"")
            self._cors(200, {"success": True, "entry": entry})
        except Exception as e:
            self._cors(500, {"success": False, "error": str(e)})


def main():
    p = argparse.ArgumentParser(description="GFL local image-catalog agent")
    p.add_argument("--port", type=int, default=9101)
    p.add_argument("--host", default="127.0.0.1")
    args = p.parse_args()

    print(f"GFL image agent v{__version__} - http://{args.host}:{args.port}")
    print(f"Saving photos to: {PHOTOS_DIR}")
    print("Waiting for uploads... (Ctrl-C to stop)")

    server = HTTPServer((args.host, args.port), Handler)
    server.daemon_threads = True
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass

    print("\nCtrl-C received, shutting down...")
    server.server_close()
    print("Stopped.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
