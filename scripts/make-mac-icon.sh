#!/usr/bin/env bash
set -euo pipefail

src_path="${1:-src/renderer/assets/logo.png}"
out_dir="${2:-build}"
background="000000"
inner_size=940
contrast="1.35"

if [[ ! -f "$src_path" ]]; then
  echo "Logo not found: $src_path" >&2
  echo "Place the logo PNG at src/renderer/assets/logo.png or pass a path as the first arg." >&2
  exit 1
fi

if ! command -v sips >/dev/null 2>&1; then
  echo "sips not found (macOS required)." >&2
  exit 1
fi

app_builder=$(node -p "require('app-builder-bin').appBuilderPath" 2>/dev/null || true)
if [[ -z "$app_builder" || ! -x "$app_builder" ]]; then
  echo "app-builder not found (install dependencies first)." >&2
  exit 1
fi

mkdir -p "$out_dir"
rm -f "$out_dir/icon.png" "$out_dir/icon.public.png" "$out_dir/icon.icns" >/dev/null 2>&1 || true
rm -rf "$out_dir/icon.iconset" >/dev/null 2>&1 || true
temp_icon="$out_dir/icon.source.png"
contrast_icon="$out_dir/icon.contrast.png"
rm -f "$temp_icon" >/dev/null 2>&1 || true
rm -f "$contrast_icon" >/dev/null 2>&1 || true

sips -Z "$inner_size" "$src_path" --out "$temp_icon" >/dev/null
node scripts/contrast-png.js "$temp_icon" "$contrast_icon" "$contrast"
sips -p 1024 1024 --padColor "$background" "$contrast_icon" --out "$out_dir/icon.png" >/dev/null
rm -f "$temp_icon" "$contrast_icon" >/dev/null 2>&1 || true

icon_png="$out_dir/icon.png"
icns_path="$out_dir/icon.icns"

if [[ ! -f "$icon_png" ]]; then
  echo "Failed to render $icon_png" >&2
  exit 1
fi

temp_dir=$(mktemp -d)
cp -f "$icon_png" "$temp_dir/icon.png"
"$app_builder" icon --input "$temp_dir/icon.png" --format icns --out "$temp_dir" >/dev/null
if [[ ! -f "$temp_dir/icon.icns" ]]; then
  rm -rf "$temp_dir"
  echo "Failed to render $icns_path" >&2
  exit 1
fi
cp -f "$temp_dir/icon.icns" "$icns_path"
rm -rf "$temp_dir"

echo "Wrote $out_dir/icon.png"
echo "Wrote $out_dir/icon.icns"
