#!/bin/bash
set -euo pipefail
# No arguments only checks locally. Publishing requires --publish and the
# user's deployment authorization; the script cannot grant that authorization.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node "${SCRIPT_DIR}/scripts/deploy.mjs" "$@"
