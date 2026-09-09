#!/usr/bin/env bash
# Run the mod's regression checks. Starts a static server, runs the scripts,
# shuts the server down again.
#
#   ./tests/run.sh                  # everything
#   ./tests/run.sh audit realbal    # only those
#   PORT=9000 ./tests/run.sh        # different port
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
PORT="${PORT:-8080}"

if [ ! -f "$ROOT/index.html" ]; then
  echo "error: no index.html in $ROOT — run this from inside the game folder" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  TESTS=("$@")
else
  TESTS=(audit audit2 earlybal combat allareas fightsmoke fullbal econ settings-boxes savecompat saveslots actionlock freeactions perkcoverage titles capreach areagate)
fi

echo "serving $ROOT on port $PORT"
npx --yes http-server -p "$PORT" -s "$ROOT" >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT

# wait for it to answer rather than sleeping a guessed number of seconds
for _ in $(seq 1 30); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/index.html"; then break; fi
  sleep 0.5
done
if ! curl -fsS -o /dev/null "http://127.0.0.1:$PORT/index.html"; then
  echo "error: server never came up on port $PORT" >&2
  exit 1
fi

FAILED=()
for t in "${TESTS[@]}"; do
  f="$HERE/${t%.mjs}.mjs"
  if [ ! -f "$f" ]; then echo "skipping $t — no such script"; continue; fi
  echo
  echo "=============================================================="
  echo "  $t"
  echo "=============================================================="
  if ! PORT="$PORT" node "$f"; then FAILED+=("$t"); fi
done

echo
if [ "${#FAILED[@]}" -eq 0 ]; then
  echo "all checks ran"
else
  echo "these threw: ${FAILED[*]}"
  exit 1
fi
