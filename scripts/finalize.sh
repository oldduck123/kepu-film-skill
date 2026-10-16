#!/bin/bash
# Concatenate chunks, add the mix, normalise loudness.  scripts/finalize.sh <film_dir> <output name, no extension>
# Target: -14 LUFS integrated, true peak <= -1.5 dBTP (AAC overshoots, so we ask loudnorm for -2.0).
set -e
FILM="$(cd "$1" && pwd)"; NAME="$2"; O="$FILM/out"
ls "$O"/chunks/seg_*.mp4 | sed "s/.*/file '&'/" > "$O/concat.txt"
ffmpeg -v error -y -f concat -safe 0 -i "$O/concat.txt" -i "$O/mix.wav" -map 0:v -map 1:a -c:v copy \
  -af loudnorm=I=-14:TP=-2.0:LRA=9 -ar 48000 -c:a aac -b:a 256k -shortest -movflags +faststart "$O/$NAME.mp4"
ffprobe -v error -show_entries format=duration -of csv=p=0 "$O/$NAME.mp4"
ffmpeg -hide_banner -i "$O/$NAME.mp4" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):"
echo "wrote $O/$NAME.mp4"
