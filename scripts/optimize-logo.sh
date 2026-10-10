#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Regenerates assets/img/ from Vimma's transparent logos in the main repo: the square logo with
# the tagline (docs/assets/vimma-logo-square.png) for the home page, and the window+V mark
# (docs/assets/vimma-mark.png) for the favicons and the apple-touch-icon.
# The results are committed, so building the site needs neither this script nor its tools
# (ImageMagick 7 and avifenc from libavif).
#
#   scripts/optimize-logo.sh ../vimma/docs/assets/vimma-logo-square.png ../vimma/docs/assets/vimma-mark.png
set -eu
src=${1:?usage: optimize-logo.sh path/to/vimma-logo-square.png path/to/vimma-mark.png}
mark=${2:?usage: optimize-logo.sh path/to/vimma-logo-square.png path/to/vimma-mark.png}
out=$(dirname "$0")/../assets/img
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
# Trim the source's wide margin to a square with 6% a side, so the tagline stays legible at
# the 168px the home page shows it at.
side=$(magick "$src" -trim -format '%[fx:round(max(w,h)*1.12)]' info:)
magick "$src" -trim +repage -background none -gravity center -extent "${side}x${side}" \
  "$tmp/square.png"
src=$tmp/square.png
for s in 256 512; do
  magick "$src" -resize "${s}x${s}" -strip -quality 82 "$out/vimma-logo-$s.webp"
  magick "$src" -resize "${s}x${s}" -strip +dither -colors 64 -define png:compression-level=9 \
    "PNG8:$out/vimma-logo-$s.png"
  magick "$src" -resize "${s}x${s}" -strip "$tmp/logo-$s.png"
  avifenc -q 60 -s 4 "$tmp/logo-$s.png" "$out/vimma-logo-$s.avif" >/dev/null
done
for s in 16 32 48; do
  magick "$mark" -filter Lanczos -resize "${s}x${s}" -strip PNG32:"$out/favicon-$s.png"
done
magick "$mark" -filter Lanczos -resize 180x180 -strip -colors 128 PNG8:"$out/apple-touch-icon.png"
ls -l "$out"
