#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Makes assets/img/og-image.png, the 1200x630 picture link previews show (og:image): Vimma's
# logo on the site's teal-black, and beside it the home page's hero in the site's monospace:
# the eyebrow, the headline with "terminal" in the aqua-to-magenta gradient, and the address
# on the same baseline as the logo's own "< Vim and Tmux inspired >".
# The result is committed, so building the site needs neither this script nor its tools
# (ImageMagick 7, and JetBrains Mono or another monospace font that fontconfig can find).
# The same inputs and tools give the same bytes: no timestamps or other metadata are written.
#
#   scripts/og-image.sh ../vimma/docs/assets/vimma-logo-square.png
set -eu
src=${1:?usage: og-image.sh path/to/vimma-logo-square.png}
out=$(dirname "$0")/../assets/img/og-image.png
bold=$(fc-match -f '%{file}' 'JetBrains Mono:bold')
regular=$(fc-match -f '%{file}' 'JetBrains Mono')
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

bg='#071011'      # --bg
aqua='#2cf5d2'    # --accent, the logo's aqua
magenta='#ff4fb8' # --neon
fg='#f5fffd'      # --fg-bright, the logo's wordmark
muted='#7f9a96'   # --fg-muted
border='#234040'  # --border

# The logo with its wordmark, trimmed and scaled to sit in the left half: 430x392 at +56+124, so
# its tagline's baseline falls at y=510, where the address line goes.
magick "$src" -trim +repage -resize 430x430 "$tmp/logo.png"

# "terminal" filled top to bottom with the hero's gradient: the word as a mask over the canvas,
# a gradient the size of its box, and the box put back where the word was drawn.
magick -size 1200x630 xc:black -font "$bold" -pointsize 58 -fill white \
  -annotate +540+384 'terminal' "$tmp/mask.png"
box=$(magick "$tmp/mask.png" -trim -format '%wx%h%O' info:)
size=${box%%[+-]*}
offset=${box#"$size"}
magick "$tmp/mask.png" -crop "$box" +repage "$tmp/word-mask.png"
magick -size "$size" "gradient:$aqua-$magenta" "$tmp/word-mask.png" -alpha off \
  -compose CopyOpacity -composite "$tmp/word.png"

magick -size 1200x630 "xc:$bg" \
  -fill none -stroke "$border" -strokewidth 2 -draw 'rectangle 24,24 1175,605' \
  -stroke none \
  "$tmp/logo.png" -gravity northwest -geometry +56+124 -composite +gravity \
  -fill "$aqua" -draw 'rectangle 540,153 580,154' \
  -font "$regular" -pointsize 18 -kerning 3 -annotate +596+160 'A KEYBOARD-FIRST BROWSER' \
  -kerning 0 -font "$bold" -pointsize 58 -fill "$fg" \
  -annotate +540+240 'For people who' \
  -annotate +540+312 'live in the' \
  "$tmp/word.png" -geometry "$offset" -composite \
  -font "$regular" -pointsize 26 -fill "$aqua" -annotate +540+510 'vimma.dev' \
  -fill "$muted" -annotate +700+510 '· for Linux and macOS' \
  -strip -define png:exclude-chunks=date,time,tIME \
  +dither -colors 64 -define png:compression-level=9 "PNG8:$out"
ls -l "$out"
