#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fitmeet-agent-release-audit-test.XXXXXX")"
LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/fitmeet-agent-release-audit-logs.XXXXXX")"

cleanup() {
  rm -rf "${TMP_DIR}"
  rm -rf "${LOG_DIR}"
}
trap cleanup EXIT

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

assert_file_contains_line() {
  local file="$1"
  local expected="$2"
  if ! grep -Fxq -- "${expected}" "${file}"; then
    printf '[FAIL] Expected %s to contain exact line: %s\n' "${file}" "${expected}" >&2
    printf '--- %s ---\n' "${file}" >&2
    sed -n '1,120p' "${file}" >&2 || true
    exit 1
  fi
}

assert_file_contains() {
  local file="$1"
  local expected="$2"
  if ! grep -Fq -- "${expected}" "${file}"; then
    printf '[FAIL] Expected %s to contain: %s\n' "${file}" "${expected}" >&2
    sed -n '1,120p' "${file}" >&2 || true
    exit 1
  fi
}

mkdir -p "${TMP_DIR}/scripts" \
  "${TMP_DIR}/backend/src/social-requests" \
  "${TMP_DIR}/docs" \
  "${TMP_DIR}/frontend/src/api" \
  "${TMP_DIR}/frontend/src/components/agent-loop" \
  "${TMP_DIR}/frontend/src/data" \
  "${TMP_DIR}/frontend/src/lib" \
  "${TMP_DIR}/frontend/src/pages" \
  "${TMP_DIR}/frontend/src/test"
cp "${ROOT_DIR}/scripts/agent-release-worktree-audit.sh" \
  "${TMP_DIR}/scripts/agent-release-worktree-audit.sh"
cp "${ROOT_DIR}/scripts/stage-agent-release-bucket.sh" \
  "${TMP_DIR}/scripts/stage-agent-release-bucket.sh"
chmod +x "${TMP_DIR}/scripts/agent-release-worktree-audit.sh"
chmod +x "${TMP_DIR}/scripts/stage-agent-release-bucket.sh"

cd "${TMP_DIR}"
git init -q
git config user.email fitmeet-release-audit@example.test
git config user.name 'FitMeet Release Audit Test'

cat > frontend/src/data/agentMockData.ts <<'EOF'
export const legacyAgentMockData = [];
EOF
cat > frontend/src/data/mockContent.ts <<'EOF'
export const legacyMockContent = [];
EOF
cat > frontend/src/test/mockContent.test.ts <<'EOF'
it('legacy mock content placeholder', () => {});
EOF
cat > scripts/fix-loginmodal.mjs <<'EOF'
console.log('legacy one-off script');
EOF
cat > backend/src/social-requests/social-requests.service.ts <<'EOF'
export class SocialRequestsService {}
EOF
cat > frontend/src/api/socialRequestsApi.ts <<'EOF'
export const socialRequestsApi = {};
EOF
cat > frontend/src/components/agent-loop/AgentApprovalCard.tsx <<'EOF'
export function AgentApprovalCard() { return null; }
EOF
cat > frontend/src/lib/agentApprovalCopy.ts <<'EOF'
export const approvalCopyReady = true;
EOF
cat > frontend/src/pages/AgentControlCenterPage.tsx <<'EOF'
export function AgentControlCenterPage() { return null; }
EOF

git add .
git commit -qm 'seed legacy release files'

git mv frontend/src/data/agentMockData.ts frontend/src/data/agentStaticContent.ts
git mv frontend/src/data/mockContent.ts frontend/src/data/discoverContent.ts
git mv frontend/src/test/mockContent.test.ts frontend/src/test/discoverContent.test.ts
printf '\nexport const discoverContentReady = true;\n' >> frontend/src/data/discoverContent.ts
printf '\nit("discover content replacement", () => {});\n' >> frontend/src/test/discoverContent.test.ts
printf '\nexport const socialRequestsReady = true;\n' >> backend/src/social-requests/social-requests.service.ts
printf '\nexport const socialRequestsApiReady = true;\n' >> frontend/src/api/socialRequestsApi.ts
printf '\nexport const agentApprovalCardReady = true;\n' >> frontend/src/components/agent-loop/AgentApprovalCard.tsx
printf '\nexport const agentApprovalCopyReady2 = true;\n' >> frontend/src/lib/agentApprovalCopy.ts
printf '\nexport const agentControlCenterReady = true;\n' >> frontend/src/pages/AgentControlCenterPage.tsx

AGENT_RELEASE_AUDIT_OUT_DIR="${LOG_DIR}/audit-out" \
  scripts/agent-release-worktree-audit.sh --review --show-files \
  > "${LOG_DIR}/review.out" \
  2> "${LOG_DIR}/review.err"

assert_file_contains "${LOG_DIR}/review.out" 'mode                           review'
assert_file_contains "${LOG_DIR}/audit-out/discover-profile-closure.status.txt" \
  'frontend/src/data/agentMockData.ts'
assert_file_contains_line "${LOG_DIR}/audit-out/discover-profile-closure.paths.txt" \
  'frontend/src/data/agentStaticContent.ts'
assert_file_contains "${LOG_DIR}/audit-out/discover-profile-closure.status.txt" \
  'frontend/src/data/mockContent.ts'
assert_file_contains_line "${LOG_DIR}/audit-out/discover-profile-closure.paths.txt" \
  'frontend/src/data/discoverContent.ts'
assert_file_contains "${LOG_DIR}/audit-out/discover-profile-closure.status.txt" \
  'frontend/src/test/mockContent.test.ts'
assert_file_contains_line "${LOG_DIR}/audit-out/discover-profile-closure.paths.txt" \
  'frontend/src/test/discoverContent.test.ts'
assert_file_contains "${LOG_DIR}/audit-out/stage-discover-profile-closure.sh" \
  'git add -A --pathspec-from-file='
assert_file_contains "${LOG_DIR}/audit-out/COMMIT_PLAN.md" \
  'FitMeet Agent Release Commit Plan'
assert_file_contains "${LOG_DIR}/audit-out/COMMIT_PLAN.md" \
  'stage-discover-profile-closure.sh'
assert_file_contains "${LOG_DIR}/audit-out/COMMIT_PLAN.md" \
  'scripts/agent-release-worktree-audit.sh --strict'
assert_file_contains_line "${LOG_DIR}/audit-out/discover-profile-closure.paths.txt" \
  'backend/src/social-requests/social-requests.service.ts'
assert_file_contains_line "${LOG_DIR}/audit-out/discover-profile-closure.paths.txt" \
  'frontend/src/api/socialRequestsApi.ts'
assert_file_contains_line "${LOG_DIR}/audit-out/agent-frontend-assistant-ui.paths.txt" \
  'frontend/src/components/agent-loop/AgentApprovalCard.tsx'
assert_file_contains_line "${LOG_DIR}/audit-out/agent-frontend-assistant-ui.paths.txt" \
  'frontend/src/lib/agentApprovalCopy.ts'
assert_file_contains_line "${LOG_DIR}/audit-out/agent-frontend-assistant-ui.paths.txt" \
  'frontend/src/pages/AgentControlCenterPage.tsx'
assert_file_contains "${LOG_DIR}/review.out" \
  'uncategorized                  0'

if scripts/agent-release-worktree-audit.sh --strict \
  > "${LOG_DIR}/strict.out" \
  2> "${LOG_DIR}/strict.err"; then
  fail 'strict audit unexpectedly passed with mixed rename changes'
fi
assert_file_contains "${LOG_DIR}/strict.err" \
  'Mixed staged/unstaged entries are not allowed for a strict release.'

scripts/stage-agent-release-bucket.sh discover-profile-closure \
  --out-dir "${LOG_DIR}/stage-out" \
  > "${LOG_DIR}/stage.out" \
  2> "${LOG_DIR}/stage.err"
assert_file_contains "${LOG_DIR}/stage.out" \
  '[OK] Staged discover-profile-closure.'
git diff --cached --name-status > "${LOG_DIR}/cached.status"
assert_file_contains "${LOG_DIR}/cached.status" \
  'frontend/src/data/agentMockData.ts'
assert_file_contains "${LOG_DIR}/cached.status" \
  'frontend/src/data/agentStaticContent.ts'
assert_file_contains "${LOG_DIR}/cached.status" \
  'frontend/src/data/mockContent.ts'
assert_file_contains "${LOG_DIR}/cached.status" \
  'frontend/src/data/discoverContent.ts'

git reset --hard -q HEAD
cat > frontend/src/unreviewedReleaseLeak.ts <<'EOF'
export const shouldBeClassifiedBeforeRelease = true;
EOF
git add frontend/src/unreviewedReleaseLeak.ts
git commit -qm 'seed tracked uncategorized release file'
printf '\nexport const modifiedBeforeRelease = true;\n' >> frontend/src/unreviewedReleaseLeak.ts
if scripts/stage-agent-release-bucket.sh agent-frontend-assistant-ui \
  --out-dir "${LOG_DIR}/uncategorized-stage-out" \
  > "${LOG_DIR}/uncategorized-stage.out" \
  2> "${LOG_DIR}/uncategorized-stage.err"; then
  fail 'stage helper unexpectedly allowed uncategorized source files'
fi
assert_file_contains "${LOG_DIR}/uncategorized-stage.err" \
  'Refusing to stage agent-frontend-assistant-ui until uncategorized entries are classified or removed.'
git reset --hard -q HEAD~1

printf '\nconsole.log("accidentally restored");\n' >> scripts/fix-loginmodal.mjs
if scripts/agent-release-worktree-audit.sh --review \
  > "${LOG_DIR}/legacy.out" \
  2> "${LOG_DIR}/legacy.err"; then
  fail 'review audit unexpectedly allowed a modified legacy one-off script'
fi
assert_file_contains "${LOG_DIR}/legacy.err" \
  'Legacy Agent artifact changed in a non-delete state.'

git reset --hard -q HEAD
cat > docs/stale-agent-context.md <<'EOF'
SOCIAL_AGENT_CONTEXT_TURN_LIMIT=40
EOF
if scripts/agent-release-worktree-audit.sh --review \
  > "${LOG_DIR}/stale-context.out" \
  2> "${LOG_DIR}/stale-context.err"; then
  fail 'review audit unexpectedly allowed stale Agent context limit docs'
fi
assert_file_contains "${LOG_DIR}/stale-context.err" \
  'SOCIAL_AGENT_CONTEXT_TURN_LIMIT=40 weakens DeepSeek context.'

git reset --hard -q HEAD
rm -f docs/stale-agent-context.md
cat > docs/stale-agent-model.md <<'EOF'
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_FAST_MODEL=deepseek-v4-flash
EOF
if scripts/agent-release-worktree-audit.sh --review \
  > "${LOG_DIR}/stale-model.out" \
  2> "${LOG_DIR}/stale-model.err"; then
  fail 'review audit unexpectedly allowed stale generic DeepSeek model docs'
fi
assert_file_contains "${LOG_DIR}/stale-model.err" \
  'DEEPSEEK_MODEL=deepseek-v4-flash downgrades shared DeepSeek fallback paths.'

printf '[OK] agent-release-worktree-audit self-test passed\n'
