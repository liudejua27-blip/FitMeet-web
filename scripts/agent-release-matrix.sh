#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_AGENT_BROWSER_QA="${RUN_AGENT_BROWSER_QA:-true}"
RUN_AGENT_RELEASE_BUILD="${RUN_AGENT_RELEASE_BUILD:-false}"
AGENT_RELEASE_EVIDENCE_DIR="${AGENT_RELEASE_EVIDENCE_DIR:-${ROOT_DIR}/artifacts/agent-release-evidence}"

# shellcheck source=scripts/lib/toolchain.sh
source "${ROOT_DIR}/scripts/lib/toolchain.sh"
fitmeet_bootstrap_toolchain
fitmeet_activate_pnpm

usage() {
  cat <<'EOF'
Usage: scripts/agent-release-matrix.sh [options]

Runs the FitMeet Agent release matrix from docs/agent-release-e2e-matrix.md.
The default path is non-mutating except local/browser checks.

Options:
  --skip-browser-qa              Skip Playwright QA for /agent/chat.
  --build                        Also run frontend and backend production builds.
  --evidence-dir DIR             Write release evidence artifacts under DIR.
  --help                         Show this help.

Environment:
  RUN_AGENT_BROWSER_QA=false
  RUN_AGENT_RELEASE_BUILD=true
  AGENT_RELEASE_EVIDENCE_DIR=artifacts/agent-release-evidence
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-browser-qa)
      RUN_AGENT_BROWSER_QA=false
      ;;
    --build)
      RUN_AGENT_RELEASE_BUILD=true
      ;;
    --evidence-dir)
      shift
      [[ $# -gt 0 ]] || {
        echo "--evidence-dir requires a directory" >&2
        exit 2
      }
      AGENT_RELEASE_EVIDENCE_DIR="$1"
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

step() {
  printf '\n==> %s\n' "$1"
}

cd "${ROOT_DIR}"
mkdir -p "${AGENT_RELEASE_EVIDENCE_DIR}"
agent_skill_eval_report="${AGENT_SKILL_EVAL_REPORT_FILE:-${AGENT_RELEASE_EVIDENCE_DIR%/}/agent-skill-eval-$(date -u +%Y%m%dT%H%M%SZ).json}"

step "Run Agent release matrix verification"
"${ROOT_DIR}/scripts/agent-release-worktree-audit.sh"

step "Run Agent release functional verification"
RUN_AGENT_BROWSER_QA="${RUN_AGENT_BROWSER_QA}" \
  AGENT_SKILL_EVAL_REPORT_FILE="${agent_skill_eval_report}" \
  "${ROOT_DIR}/scripts/verify-agent-release.sh"

step "Agent release evidence"
printf 'Skill eval report: %s\n' "${agent_skill_eval_report}"

if [[ "${RUN_AGENT_RELEASE_BUILD}" == "true" ]]; then
  step "Build frontend production bundle"
  pnpm --dir "${ROOT_DIR}/frontend" run build

  step "Build backend production bundle"
  pnpm --dir "${ROOT_DIR}/backend" run build
fi

printf '\n[DONE] FitMeet Agent release matrix passed\n'
