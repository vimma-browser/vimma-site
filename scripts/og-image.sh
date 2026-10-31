#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Makes assets/img/og-image.png, the 1200x630 picture link previews show (og:image): Vimma's
# logo on the site's teal-black, the tagline beside it in the site's monospace, aqua accents.
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
fg='#f5fffd'      # --fg-bright, the logo's wordmark
muted='#7f9a96'   # --fg-muted
border='#234040'  # --border

# The logo with its wordmark, trimmed and scaled to sit in the left half.
magick "$src" -trim +repage -resize 430x430 "$tmp/logo.png"

magick -size 1200x630 "xc:$bg" \
  -fill none -stroke "$border" -strokewidth 2 -draw 'rectangle 24,24 1175,605' \
  -stroke none \
  -font "$regular" -pointsize 24 -fill "$muted" -annotate +56+76 '~/vimma $' \
  -fill "$aqua" -annotate +200+76 'man vimma' \
  "$tmp/logo.png" -gravity northwest -geometry +56+124 -composite \
  -font "$bold" -pointsize 46 -fill "$fg" -interline-spacing 12 \
  -annotate +540+214 "A keyboard-first
browser for people
who live in Vim
and tmux" \
  -font "$regular" -pointsize 26 -fill "$aqua" -annotate +540+520 'vimma.dev' \
  -fill "$muted" -annotate +700+520 '· a Firefox fork for Linux' \
  -strip -define png:exclude-chunks=date,time,tIME \
  +dither -colors 64 -define png:compression-level=9 "PNG8:$out"
ls -l "$out"
