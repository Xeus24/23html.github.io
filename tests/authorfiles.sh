#!/usr/bin/env bash
# The author's files, against his repository. Two rules, both in CLAUDE.md:
#
#   changelog/changelog.html   byte-identical to his
#   index.html                 his, plus the one script tag and nothing else
#
#   ./tests/authorfiles.sh                    against the `upstream` remote
#   UPSTREAM_REF=<ref> ./tests/authorfiles.sh against a ref already fetched
#
# With no `upstream` remote (a CI checkout) it fetches his main branch once,
# read-only, into FETCH_HEAD.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

REF="${UPSTREAM_REF:-}"
if [ -z "$REF" ]; then
  if git remote get-url upstream >/dev/null 2>&1; then
    git fetch -q upstream main
    REF=upstream/main
  else
    git fetch -q --depth=1 https://github.com/23html/23html.github.io.git main
    REF=FETCH_HEAD
  fi
fi

fail=0
if git diff --quiet "$REF" -- changelog/changelog.html; then
  echo "ok    changelog/changelog.html is the author's, byte for byte"
else
  echo "FAIL  changelog/changelog.html differs from the author's ($REF)"; fail=1
fi

diff_out="$(git diff "$REF" -- index.html)"
added="$(printf '%s\n' "$diff_out" | grep '^+' | grep -v '^+++' || true)"
removed="$(printf '%s\n' "$diff_out" | grep '^-' | grep -v '^---' || true)"
expected=$'+\n+<!-- local mod: remove this line to disable -->\n+<script src="mod.js"></script>'
if [ -z "$removed" ] && [ "$added" == "$expected" ]; then
  echo "ok    index.html is the author's plus the one script tag"
else
  echo "FAIL  index.html changes more than the script tag against $REF:"
  printf '%s\n' "$diff_out" | head -40
  fail=1
fi
exit $fail
