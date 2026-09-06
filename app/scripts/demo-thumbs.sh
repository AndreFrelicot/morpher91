#!/usr/bin/env bash
# Regenerates the demo-asset thumbnails committed under public/demo/thumbs/.
# Images: 320px-wide WebP. Videos: first-frame poster, 320px-wide WebP.
# Run from app/: ./scripts/demo-thumbs.sh   (requires ffmpeg)
set -euo pipefail
cd "$(dirname "$0")/../public/demo"

for f in images/*.png; do
  name="$(basename "${f%.png}")"
  ffmpeg -y -loglevel error -i "$f" -vf scale=320:-1 "thumbs/${name}.webp"
done

for f in videos/*.mp4; do
  name="$(basename "${f%.mp4}")"
  ffmpeg -y -loglevel error -ss 0 -i "$f" -vframes 1 -vf scale=320:-1 "thumbs/${name}.webp"
done

echo "Thumbnails written to public/demo/thumbs/"
