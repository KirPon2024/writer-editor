# Assets

- Place the new logo image at `src/renderer/assets/logo.png` (the raw PNG from the chat works).
- For macOS build icon, generate `build/icon.png` from the logo:
  - `bash scripts/make-mac-icon.sh`

Notes:
- The UI renders the logo via CSS mask, so the PNG can have any background; the app background color is `#bab1a4`.
