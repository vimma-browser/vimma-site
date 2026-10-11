#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Puts the promo video on the home page: copies the two cuts into assets/video/ with the moov
# atom first (+faststart, so playback starts before the whole file is in; a remux, never a
# re-encode) and makes a WebP poster for each from one frame. The results are committed, so
# building the site needs neither this script nor its tools (ffmpeg with libwebp, ffprobe).
#
#   scripts/video.sh ~/Videos/vimma/v2/vimma-promo-1080p.mp4 ~/Videos/vimma/v2/vimma-promo-vertical.mp4
#
# The poster frames are seconds into each cut: the dwindle spiral of four panes (16:9) and the
# main-horizontal layout (vertical). Override them for a re-cut where they moved:
#
#   WIDE_AT=28.4 TALL_AT=13 scripts/video.sh wide.mp4 tall.mp4
#
# The markup in src/pages/index.html and the VideoObject in scripts/seo.ts assume 1920x1080 and
# 1080x1920 at the durations in seo.ts; the script stops if the sizes differ, and prints the
# durations to compare.
set -eu
usage="usage: video.sh path/to/vimma-promo-1080p.mp4 path/to/vimma-promo-vertical.mp4"
wide=${1:?$usage}
tall=${2:?$usage}
wide_at=${WIDE_AT:-28.4}
tall_at=${TALL_AT:-13}
out=$(dirname "$0")/../assets/video
mkdir -p "$out"

size() { ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$1"; }
[ "$(size "$wide")" = 1920x1080 ] || { echo "$wide is $(size "$wide"), not 1920x1080" >&2; exit 1; }
[ "$(size "$tall")" = 1080x1920 ] || { echo "$tall is $(size "$tall"), not 1080x1920" >&2; exit 1; }

# one NAME SOURCE POSTER_SECONDS POSTER_WxH
one() {
  ffmpeg -v error -y -i "$2" -map 0 -c copy -movflags +faststart "$out/$1.mp4"
  ffmpeg -v error -y -ss "$3" -i "$2" -frames:v 1 -vf "scale=$4:flags=lanczos" \
    -c:v libwebp -quality 72 -compression_level 6 "$out/$1.webp"
  printf '%s.mp4: %s s\n' "$1" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/$1.mp4")"
}
one vimma-promo-1080p "$wide" "$wide_at" 1280:720
one vimma-promo-vertical "$tall" "$tall_at" 540:960
ls -l "$out"
