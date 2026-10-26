#!/bin/sh
# Build a playable zip from the assembled delivery (this repository's pushed main + the artist's assets/).
# Usage: tools/package.sh <name>   -> dist/<name>.zip containing <name>/index.html, src/, assets/, README.md
set -e
name=${1:?usage: tools/package.sh <name>}
work=$(mktemp -d)
ht-role delivery --into "$work/$name" > "$work/delivery.json"
rm -rf "$work/$name/tests" "$work/$name/tools" "$work/$name/.gitignore"
mkdir -p dist
(cd "$work" && rm -f "$OLDPWD/dist/$name.zip" && python3 -m zipfile -c "$OLDPWD/dist/$name.zip" "$name")
python3 - "$work/delivery.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
revs = sorted({(f['repository'], f['commit']) for f in d['files']})
for r, c in revs: print('from', r, c)
PY
rm -rf "$work"
echo "dist/$name.zip"
