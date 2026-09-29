#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 build/fetch_originals.py
python3 build/extract.py
python3 build/flood_verdicts.py
python3 build/make_jobs.py
for k in 0 1 2; do node build/maps.mjs "build/jobs-$k.json" & done
wait
python3 build/postfix.py
UIDS=$(python3 -c "import json;print(' '.join(sorted(json.load(open('build/filenames.json')))))")
for u in $UIDS; do python3 build/pkg.py "$u"; done
node build/print.mjs $UIDS
python3 build/assemble.py $UIDS
