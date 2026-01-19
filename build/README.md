# Build Resources

This folder contains build resources that are required for packaging the app.

Current files:
- `icon.png` — 1024×1024 PNG with background `#bab1a4` (base source for other formats).
- `icon.icns` — macOS app icon generated from `icon.png`.

How to regenerate:
- Ensure `src/renderer/assets/logo.png` exists.
- Run `npm run icons:mac` (or `bash scripts/make-mac-icon.sh`).

