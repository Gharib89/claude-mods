#!/usr/bin/env bash
# Claude Code at the build `.claude-code-version` pins, the one CI's mods.yml
# installs, so a local check accepts only what CI accepts: validate refuses
# more on some builds than on others.
#
#   scripts/claude-pinned.sh <claude args>...
set -euo pipefail
pin=$(cat "$(git rev-parse --show-toplevel)/.claude-code-version")
# A build npx cannot fetch exits 127, which check.sh reads as unavailable, not
# as the mod failing (npx itself exits 1 for it).
npx -y "@anthropic-ai/claude-code@$pin" --version > /dev/null 2>&1 || exit 127
exec npx -y "@anthropic-ai/claude-code@$pin" "$@"
