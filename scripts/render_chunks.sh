#!/bin/bash
# Resumable chunked render.  scripts/render_chunks.sh <film_dir> [seconds_per_chunk=20]
# Starts the engine dev server for this film (PORT, default 5190) if it is not already up, renders
# <film>/out/chunks/seg_XXX.mp4 and skips chunks that already exist: if it dies, just run it again.
# Delete one seg file to re-render only that stretch after fixing the scene.
set -e
FILM="$(cd "$1" && pwd)"; SEG=${2:-20}; PORT=${PORT:-5190}; export PORT
ENG="$(cd "$(dirname "$0")/../engine" && pwd)"
DUR=$(python3 -c "import json;print(json.load(open('$FILM/data/timeline.json'))['duration'])")
mkdir -p "$FILM/out/chunks"
if ! curl -s -o /dev/null "http://localhost:$PORT/index.html"; then
  (cd "$ENG" && FILM_DIR="$FILM" NO_HMR=1 nohup npx vite > "$FILM/out/vite.log" 2>&1 &)
  for i in $(seq 1 60); do curl -s -o /dev/null "http://localhost:$PORT/index.html" && break; sleep 1; done
fi
i=0
for from in $(python3 -c "import math;print(' '.join(str(x) for x in range(0, math.ceil($DUR), $SEG)))"); do
  to=$(python3 -c "print(min($from+$SEG, $DUR))")
  f="$FILM/out/chunks/seg_$(printf %03d $i).mp4"
  if [ ! -s "$f" ]; then
    echo "render $from-$to -> $f"
    (cd "$ENG" && bun scripts/render.ts video --from $from --to $to --crf 16 --out "$f.tmp.mp4") && mv "$f.tmp.mp4" "$f"
  fi
  i=$((i+1))
done
echo ALLDONE
