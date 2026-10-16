#!/bin/bash
# Download the open-licensed (SIL OFL) fonts the engine uses into engine/fonts/. Run once.
set -e
D="$(cd "$(dirname "$0")/.." && pwd)/engine/fonts"; mkdir -p "$D"; cd "$D"
get() { [ -s "$2" ] || { echo "fetch $2"; curl -fsSL -o "$2" "$1"; }; }
N=https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC
G=https://github.com/google/fonts/raw/main/ofl
for w in Black Bold Medium; do get "$N/NotoSansSC-$w.otf" "NotoSansSC-$w.otf"; done
for w in Light Medium SemiBold; do get "$G/barlowcondensed/BarlowCondensed-$w.ttf" "BarlowCondensed-$w.ttf"; done
get "$G/inter/Inter%5Bopsz,wght%5D.ttf" Inter.ttf
ls -la "$D"
