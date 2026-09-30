#!/usr/bin/env bash
# Run the mod's regression checks. Starts a static server, runs the scripts,
# shuts the server down again.
#
#   ./tests/run.sh                  # everything
#   ./tests/run.sh audit realbal    # only those
#   PORT=9000 ./tests/run.sh        # different port
#   JOBS=1 ./tests/run.sh           # one script at a time, output live
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(dirname "$HERE")"
PORT="${PORT:-8080}"
# Scripts at once. Four keeps the timing-sensitive ones (actions run on real
# intervals) comfortably inside their windows on an ordinary laptop.
JOBS="${JOBS:-4}"

if [ ! -f "$ROOT/index.html" ]; then
  echo "error: no index.html in $ROOT — run this from inside the game folder" >&2
  exit 1
fi

if [ "$#" -gt 0 ]; then
  TESTS=("$@")
else
  TESTS=(docs audit audit2 earlybal combat allareas fightsmoke fullbal econ settings-boxes savecompat saveslots slotsettings actionlock freeactions perkcoverage titles titlepicker dojo cultivation places wiki marketplace ids capreach areagate ranks crafting names targets convergence vanilla polish backups pacing road basefixes baseline fights userscript tooltips small)
fi

echo "serving $ROOT on port $PORT"
# -c-1 disables caching. Without it http-server sends max-age=3600, and a
# browser can be handed a mod.js from before the edit you are testing — which
# shows up as a phantom failure that will not reproduce when you re-run the
# script on its own. Cost of the flag: nothing. Cost of not having it: an hour
# of chasing a bug that is already fixed.
npx --yes http-server -p "$PORT" -c-1 -s "$ROOT" >/dev/null 2>&1 &
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
TIMES=()
banner() {
  echo
  echo "=============================================================="
  echo "  $1"
  echo "=============================================================="
}

if [ "$JOBS" -le 1 ]; then
  # one at a time, output as it happens
  for t in "${TESTS[@]}"; do
    f="$HERE/${t%.mjs}.mjs"
    if [ ! -f "$f" ]; then echo "skipping $t — no such script"; continue; fi
    banner "$t"
    start=$SECONDS
    if ! PORT="$PORT" node "$f"; then FAILED+=("$t"); fi
    TIMES+=("$((SECONDS - start)) $t")
  done
else
  # JOBS at a time. Every script launches its own browser, and a fresh browser
  # is a fresh profile, so their saves cannot collide. Each writes to its own
  # log, printed in list order once all have finished.
  LOGS="$(mktemp -d)"
  trap 'kill $SERVER 2>/dev/null; rm -rf "$LOGS"' EXIT
  echo "running ${#TESTS[@]} scripts, $JOBS at a time (JOBS=1 for one at a time)"
  # Count and wait on these PIDs only: `jobs` and a bare `wait` would include
  # the server, which never exits.
  PIDS=()
  running() { local n=0 p; for p in "${PIDS[@]}"; do kill -0 "$p" 2>/dev/null && n=$((n + 1)); done; echo $n; }
  for t in "${TESTS[@]}"; do
    f="$HERE/${t%.mjs}.mjs"
    [ -f "$f" ] || continue
    while [ "$(running)" -ge "$JOBS" ]; do sleep 0.2; done
    (
      start=$SECONDS
      PORT="$PORT" node "$f" > "$LOGS/$t.log" 2>&1
      echo $? > "$LOGS/$t.rc"
      echo $((SECONDS - start)) > "$LOGS/$t.sec"
    ) &
    PIDS+=($!)
  done
  wait "${PIDS[@]}"
  for t in "${TESTS[@]}"; do
    f="$HERE/${t%.mjs}.mjs"
    if [ ! -f "$f" ]; then echo "skipping $t — no such script"; continue; fi
    banner "$t"
    cat "$LOGS/$t.log"
    [ "$(cat "$LOGS/$t.rc")" = "0" ] || FAILED+=("$t")
    TIMES+=("$(cat "$LOGS/$t.sec") $t")
  done
fi

# slowest first, so a script that has started to drag is visible
echo
echo "seconds per script:"
printf '%s\n' "${TIMES[@]}" | sort -rn | awk '{ printf "  %5ds  %s\n", $1, $2 }'

echo
if [ "${#FAILED[@]}" -eq 0 ]; then
  echo "all checks ran"
else
  echo "these threw: ${FAILED[*]}"
  exit 1
fi
