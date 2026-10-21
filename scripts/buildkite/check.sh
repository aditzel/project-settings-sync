#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 || ( "$1" != "test-linux" && "$1" != "build-linux" ) ]]; then
  echo "Usage: $0 {test-linux|build-linux}" >&2
  exit 2
fi

cd "$(dirname "${BASH_SOURCE[0]}")/../.."

if [[ "$(bun --version)" != "1.3.14" ]]; then
  echo "Shadow CI requires Bun 1.3.14." >&2
  exit 1
fi

export CI=true

# Preserve the existing workflow's install command in each fresh job checkout.
bun install

case "$1" in
  test-linux)
    bun run typecheck
    bun run lint
    bun run format:check
    bun test
    ;;
  build-linux)
    bun run build
    ;;
esac
