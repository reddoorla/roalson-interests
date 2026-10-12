#!/usr/bin/env bash
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
URL="$1"; WHO="$2"; DIR="$3"; shift 3
cd "$DIR"
F=("$@")
for ((i=0; i<${#F[@]}; i+=5)); do
  batch=("${F[@]:i:5}")
  echo "BATCH $i: ${batch[*]}"
  timeout 900 node "$HERE/frbatch.mjs" "$URL" "$WHO" "${batch[@]}" 2>&1 | grep -E 'WAITED|Error'
done
echo ALLDONE
