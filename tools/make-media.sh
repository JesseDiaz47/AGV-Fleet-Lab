#!/usr/bin/env bash
# Turn the raw capture (docs/media/raw/tour.webm) into the two assets the
# README actually uses. Run after `node capture.js`.
#
# Why two formats: GitHub will not play a committed video file inline in a
# README, so the hero has to be a GIF. The MP4 is committed for anyone who
# wants the full tour and clicks through to it.
set -euo pipefail
cd "$(dirname "$0")/.."

RAW=docs/media/raw/tour.webm
OUT=docs/media

# The live-sim segment, per the marks capture.js prints (live-sim-start 1.9s).
GIF_START=2.5
GIF_LEN=9
# Crop to the live track card. Scaled down to a README column, the full 1380px
# viewport renders the vehicles as unreadable dots — the loop is the subject.
GIF_CROP="crop=890:500:418:132"

# Full tour, H.264 so it plays everywhere; +faststart so it streams rather
# than requiring the whole file before the first frame.
ffmpeg -y -loglevel error -i "$RAW" \
  -vf "scale=1100:-2:flags=lanczos" \
  -c:v libx264 -preset slow -crf 30 -pix_fmt yuv420p -movflags +faststart -an \
  "$OUT/tour.mp4"

# Hero GIF: two-pass palette, or the dark control-room palette bands badly.
ffmpeg -y -loglevel error -ss "$GIF_START" -t "$GIF_LEN" -i "$RAW" \
  -vf "$GIF_CROP,fps=12,scale=820:-1:flags=lanczos,palettegen=stats_mode=diff" \
  "$OUT/raw/palette.png"
ffmpeg -y -loglevel error -ss "$GIF_START" -t "$GIF_LEN" -i "$RAW" -i "$OUT/raw/palette.png" \
  -lavfi "$GIF_CROP,fps=12,scale=820:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=3" \
  -loop 0 "$OUT/live-sim.gif"

ls -lh "$OUT/tour.mp4" "$OUT/live-sim.gif" | awk '{print $5, $9}'
