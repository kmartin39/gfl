# GFL Image Agent

Local HTTP agent that lets the web app save uploaded photo icons (PNG/JPG)
into `images/photos/` and keep `photo-catalog.json` up to date. A static
web page can't write files to disk on its own, so this small helper does it
instead.

Pure Python standard library — no dependencies, no `uv` needed.

## Running

```bash
python agent.py
```

Started automatically alongside the static server by `run-local.bat`.
Listens on `http://localhost:9101`. Stop with **Ctrl-C**.

## What it does

- `GET /status` — health check the app polls to show the agent-status dot
  next to the Upload button.
- `POST /upload` — accepts either:
  - `{ image_base64, filename, name, designation }` for a browsed or
    pasted image, or
  - `{ url, name, designation }` for an image-by-link (the agent fetches
    it server-side, so the browser never hits cross-origin restrictions).

  Saves the bytes to `images/photos/<id>.<ext>` (id derived from `name`,
  de-duplicated if it already exists) and appends an entry to
  `photo-catalog.json` at the repo root.

## Options

| Flag | Default | Description |
|------|---------|-------------|
| `--port PORT` | `9101` | Port to listen on |
| `--host HOST` | `127.0.0.1` | Address to bind |
