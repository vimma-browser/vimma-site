#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Regenerates assets/img/ from Vimma's 512px logo (docs/assets/vimma-logo.png in the main repo).
# The results are committed, so building the site needs neither this script nor its tools
# (ImageMagick 7 and avifenc from libavif).
#
#   scripts/optimize-logo.sh ../VimHerdr/docs/assets/vimma-logo.png
set -eu
src=${1:?usage: optimize-logo.sh path/to/vimma-logo.png}
out=$(dirname "$0")/../assets/img
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for s in 256 512; do
  magick "$src" -resize "${s}x${s}" -strip -quality 82 "$out/vimma-logo-$s.webp"
  magick "$src" -resize "${s}x${s}" -strip +dither -colors 64 -define png:compression-level=9 \
    "PNG8:$out/vimma-logo-$s.png"
  magick "$src" -resize "${s}x${s}" -strip "$tmp/logo-$s.png"
  avifenc -q 60 -s 4 "$tmp/logo-$s.png" "$out/vimma-logo-$s.avif" >/dev/null
done
magick "$src" -resize 64x64 -strip PNG8:"$out/favicon.png"
magick "$src" -resize 180x180 -strip -colors 128 PNG8:"$out/apple-touch-icon.png"
ls -l "$out"
