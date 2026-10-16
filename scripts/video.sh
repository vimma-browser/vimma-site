#!/bin/sh
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

# Puts the promo video on the home page: copies the 16:9 cut into assets/video/ with the moov
# atom first (+faststart, so playback starts before the whole file is in; a remux, never a
# re-encode) and makes a WebP poster from one frame. Phones get the same cut as desktops. The results are committed, so
# building the site needs neither this script nor its tools (ffmpeg with libwebp, ffprobe).
#
#   scripts/video.sh ~/Videos/vimma/v2/vimma-promo-1080p.mp4
#
# The poster frame is seconds into the cut: live grep with its preview. Override it for a
# re-cut where it moved:
#
#   WIDE_AT=61.8 scripts/video.sh wide.mp4
#
# The markup in src/pages/index.html and the VideoObject in scripts/seo.ts assume 1920x1080 at
# the duration in seo.ts; the script stops if the size differs, and prints the duration to
# compare.
set -eu
usage="usage: video.sh path/to/vimma-promo-1080p.mp4"
wide=${1:?$usage}
wide_at=${WIDE_AT:-61.8}
out=$(dirname "$0")/../assets/video
mkdir -p "$out"

size() { ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x "$1"; }
[ "$(size "$wide")" = 1920x1080 ] || { echo "$wide is $(size "$wide"), not 1920x1080" >&2; exit 1; }

# one NAME SOURCE POSTER_SECONDS POSTER_WxH
one() {
  ffmpeg -v error -y -i "$2" -map 0 -c copy -movflags +faststart "$out/$1.mp4"
  ffmpeg -v error -y -ss "$3" -i "$2" -frames:v 1 -vf "scale=$4:flags=lanczos" \
    -c:v libwebp -quality 72 -compression_level 6 "$out/$1.webp"
  printf '%s.mp4: %s s\n' "$1" "$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$out/$1.mp4")"
}
one vimma-promo-1080p "$wide" "$wide_at" 1280:720
ls -l "$out"
