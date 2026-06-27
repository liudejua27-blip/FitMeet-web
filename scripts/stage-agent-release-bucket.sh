#!/usr/bin/env bash
set -euo pipefail

# The generated stage helper uses: git add -A --pathspec-from-file.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUCKET="${1:-}"
OUT_DIR="${AGENT_RELEASE_AUDIT_OUT_DIR:-}"
SHOW_FILES="${SHOW_AGENT_RELEASE_FILES:-false}"

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: scripts/stage-agent-release-bucket.sh <bucket> [--out-dir DIR] [--show-files]

Buckets:
  agent-backend-core
  agent-frontend-assistant-ui
  discover-profile-closure
  deploy-production
  tests-docs

This helper runs scripts/agent-release-worktree-audit.sh --review, writes the
five-bucket manifest, then stages exactly one bucket with git add
--pathspec-from-file. Review the generated *.paths.txt before committing.
USAGE
}

if [[ -z "${BUCKET}" || "${BUCKET}" == "-h" || "${BUCKET}" == "--help" ]]; then
  usage
  exit 0
fi
shift || true

case "${BUCKET}" in
  agent-backend-core|agent-frontend-assistant-ui|discover-profile-closure|deploy-production|tests-docs)
    ;;
  *)
    usage >&2
    fail "Unknown Agent release bucket: ${BUCKET}"
    ;;
esac

while (($# > 0)); do
  case "$1" in
    --out-dir)
      shift
      [[ $# -gt 0 ]] || fail "--out-dir requires a directory"
      OUT_DIR="$1"
      ;;
    --show-files)
      SHOW_FILES="true"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      usage >&2
      fail "Unknown argument: $1"
      ;;
  esac
  shift
done

if [[ -z "${OUT_DIR}" ]]; then
  OUT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fitmeet-agent-release-stage.XXXXXX")"
fi

cd "${ROOT_DIR}"

printf '==> Generate Agent release manifest in %s\n' "${OUT_DIR}"
AGENT_RELEASE_AUDIT_OUT_DIR="${OUT_DIR}" \
SHOW_AGENT_RELEASE_FILES="${SHOW_FILES}" \
  "${ROOT_DIR}/scripts/agent-release-worktree-audit.sh" --review

stage_script="${OUT_DIR}/stage-${BUCKET}.sh"
paths_file="${OUT_DIR}/${BUCKET}.paths.txt"
uncategorized_paths_file="${OUT_DIR}/uncategorized.paths.txt"

[[ -x "${stage_script}" ]] || fail "Missing generated stage helper: ${stage_script}"
if [[ -s "${uncategorized_paths_file}" ]]; then
  printf '\nUncategorized release paths remain:\n' >&2
  sed 's/^/  /' "${uncategorized_paths_file}" >&2
  fail "Refusing to stage ${BUCKET} until uncategorized entries are classified or removed."
fi
[[ -s "${paths_file}" ]] || fail "No paths found for bucket ${BUCKET}: ${paths_file}"

printf '\n==> Stage Agent release bucket: %s\n' "${BUCKET}"
"${stage_script}"

printf '\n==> Staged paths for %s\n' "${BUCKET}"
git diff --cached --name-status --pathspec-from-file="${paths_file}" || true

printf '\n[OK] Staged %s. Review %s and commit this bucket before continuing.\n' \
  "${BUCKET}" "${paths_file}"
