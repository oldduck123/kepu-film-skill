#!/bin/bash
# Contact sheets for review: one frame every N seconds, 5x4 per sheet.  scripts/qc_sheet.sh <video> [every=2] [start=0]
# Look at every sheet before delivering: empty frames, overlapping text, wrong labels, camera drifting off the subject.
set -e
V="$1"; EV=${2:-2}; ST=${3:-0}; D="$(dirname "$V")/qc"; rm -rf "$D"; mkdir -p "$D/f"
ffmpeg -v error -y -ss "$ST" -i "$V" -vf "fps=1/$EV,scale=384:-1" "$D/f/%04d.jpg"
n=$(ls "$D/f" | wc -l); s=1; k=1
while [ $s -le $n ]; do
  ffmpeg -v error -y -start_number $s -i "$D/f/%04d.jpg" -vf tile=5x4 -frames:v 1 "$D/sheet_$k.jpg"
  echo "$D/sheet_$k.jpg covers $(python3 -c "print(round($ST+($s-1)*$EV,1))")s onward"; s=$((s+20)); k=$((k+1))
done
