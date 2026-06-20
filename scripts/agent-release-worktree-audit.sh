#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ALLOW_DIRTY="${ALLOW_AGENT_RELEASE_DIRTY:-true}"
ALLOW_MIXED="${ALLOW_AGENT_RELEASE_MIXED:-true}"
SHOW_FILES="${SHOW_AGENT_RELEASE_FILES:-false}"
OUT_DIR="${AGENT_RELEASE_AUDIT_OUT_DIR:-}"
AUDIT_MODE="${AGENT_RELEASE_AUDIT_MODE:-review}"

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

warn() {
  printf '[WARN] %s\n' "$1" >&2
}

ok() {
  printf '[OK] %s\n' "$1"
}

usage() {
  cat <<'USAGE'
Usage: scripts/agent-release-worktree-audit.sh [--review|--strict] [--show-files] [--out-dir DIR]

Modes:
  --review   Group current worktree changes and block unsafe release artifacts. This is the default.
  --strict   Final release gate. Requires the worktree to be clean after commit splitting and blocks mixed staged/unstaged entries.

Environment overrides are still supported:
  ALLOW_AGENT_RELEASE_DIRTY=true|false
  ALLOW_AGENT_RELEASE_MIXED=true|false
  SHOW_AGENT_RELEASE_FILES=true|false
  AGENT_RELEASE_AUDIT_OUT_DIR=/path/to/out
USAGE
}

while (($# > 0)); do
  case "$1" in
    --review)
      AUDIT_MODE="review"
      ;;
    --strict)
      AUDIT_MODE="strict"
      ;;
    --show-files)
      SHOW_FILES="true"
      ;;
    --out-dir)
      shift
      [[ $# -gt 0 ]] || fail "--out-dir requires a directory"
      OUT_DIR="$1"
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

case "${AUDIT_MODE}" in
  review)
    ;;
  strict)
    ALLOW_DIRTY="false"
    ALLOW_MIXED="false"
    ;;
  *)
    fail "Unsupported AGENT_RELEASE_AUDIT_MODE: ${AUDIT_MODE}. Use review or strict."
    ;;
esac

cd "${ROOT_DIR}"

stale_context_limit_entries=()
stale_generic_model_entries=()
context_limit_files=(
  ".env.example"
  "backend/.env.example"
  "deploy"
  "docs"
)
for context_path in "${context_limit_files[@]}"; do
  [[ -e "${context_path}" ]] || continue
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    stale_context_limit_entries+=("${match}")
  done < <(
    grep -RIn --exclude-dir=node_modules --exclude-dir=dist \
      --include='*.example' \
      --include='*.env' \
      --include='*.md' \
      'SOCIAL_AGENT_CONTEXT_TURN_LIMIT=40' "${context_path}" 2>/dev/null || true
  )
done
if ((${#stale_context_limit_entries[@]} > 0)); then
  printf '\nStale Agent context limit references found:\n' >&2
  printf '  %s\n' "${stale_context_limit_entries[@]}" >&2
  fail 'SOCIAL_AGENT_CONTEXT_TURN_LIMIT=40 weakens DeepSeek context. Use 80+ in deploy docs/templates.'
fi
for context_path in "${context_limit_files[@]}"; do
  [[ -e "${context_path}" ]] || continue
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    stale_generic_model_entries+=("${match}")
  done < <(
    grep -RIn --exclude-dir=node_modules --exclude-dir=dist \
      --include='*.example' \
      --include='*.env' \
      --include='*.md' \
      'DEEPSEEK_MODEL=deepseek-v4-flash' "${context_path}" 2>/dev/null || true
  )
done
if ((${#stale_generic_model_entries[@]} > 0)); then
  printf '\nStale Agent generic model references found:\n' >&2
  printf '  %s\n' "${stale_generic_model_entries[@]}" >&2
  fail 'DEEPSEEK_MODEL=deepseek-v4-flash downgrades shared DeepSeek fallback paths. Use deepseek-v4-pro; keep flash only in DEEPSEEK_FAST_MODEL.'
fi

deepseek_legacy_alias_entries=()
for context_path in "${context_limit_files[@]}"; do
  [[ -e "${context_path}" ]] || continue
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    deepseek_legacy_alias_entries+=("${match}")
  done < <(
    grep -RIn --exclude-dir=node_modules --exclude-dir=dist \
      --include='*.example' \
      --include='*.env' \
      --include='*.md' \
      'DEEPSEEK_MODEL=deepseek-chat' "${context_path}" 2>/dev/null || true
  )
done
if ((${#deepseek_legacy_alias_entries[@]} > 0)); then
  printf '\nLegacy DeepSeek model aliases found:\n' >&2
  printf '  %s\n' "${deepseek_legacy_alias_entries[@]}" >&2
  fail 'DEEPSEEK_MODEL=deepseek-chat is a legacy alias. Production Agent routes must use explicit deepseek-v4-* models.'
fi

short_agent_timeout_config_entries=()
for context_path in "${context_limit_files[@]}"; do
  [[ -e "${context_path}" ]] || continue
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    short_agent_timeout_config_entries+=("${match}")
  done < <(
    grep -RInE --exclude-dir=node_modules --exclude-dir=dist \
      --include='*.example' \
      --include='*.env' \
      --include='*.md' \
      'SOCIAL_AGENT_[A-Z_]*(TIMEOUT|FIRST_CHUNK)[A-Z_]*_?MS=(2500|3500|5000|8000|10000|12000|15000|18000)([^0-9]|$)' \
      "${context_path}" 2>/dev/null || true
  )
done
if ((${#short_agent_timeout_config_entries[@]} > 0)); then
  printf '\nShort Agent timeout settings found in deploy docs/templates:\n' >&2
  printf '  %s\n' "${short_agent_timeout_config_entries[@]}" >&2
  fail 'Production Agent config must not fall back before DeepSeek can respond; use 20s+ first-chunk and 25s+ route/planner budgets.'
fi

weak_agent_model_routing_entries=()
for context_path in "${context_limit_files[@]}"; do
  [[ -e "${context_path}" ]] || continue
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    weak_agent_model_routing_entries+=("${match}")
  done < <(
    grep -RInE --exclude-dir=node_modules --exclude-dir=dist \
      --include='*.example' \
      --include='*.env' \
      --include='*.md' \
      '(SOCIAL_AGENT_MODEL_ROUTING_MODE=(fast|rules_only|rules-only)|SOCIAL_AGENT_INTENT_ROUTER_MODE=(rules_only|rules-only)|DEEPSEEK_CHAT_MODEL=deepseek-v4-flash|AGENT_(CASUAL_CHAT|FINAL_RESPONSE|PLANNER|EXTRACTOR|CARD|SAFETY)_MODEL=deepseek-v4-flash)' \
      "${context_path}" 2>/dev/null || true
  )
done
if ((${#weak_agent_model_routing_entries[@]} > 0)); then
  printf '\nWeak Agent model routing settings found in deploy docs/templates:\n' >&2
  printf '  %s\n' "${weak_agent_model_routing_entries[@]}" >&2
  fail 'Production Agent config must stay quality/llm_first and keep user-facing lanes on deepseek-v4-pro.'
fi

forbidden_legacy_paths=(
  "frontend/src/components/agent-workspace/CodexAntPet.tsx"
  "frontend/src/components/agent/ant-guide"
  "frontend/src/assets/agent/ant-guide"
  "frontend/src/components/ai-elements"
  "frontend/src/debug/agent-workbench"
  "frontend/src/pages/SocialAgentConsolePage.tsx"
  "frontend/src/pages/DemoAgentSocialLoopPage.tsx"
  "frontend/src/pages/DemoInvestorPage.tsx"
  "frontend/src/pages/HomePage.tsx"
  "frontend/src/pages/HomePage.legacy.tsx"
  "frontend/src/components/hero"
  "frontend/src/components/sections/EcosystemGateways.tsx"
  "frontend/src/components/sections/BrandPhilosophy.tsx"
  "frontend/src/components/sections/SymbiosisNetwork.tsx"
  "frontend/src/components/sections/VisionSection.tsx"
  "frontend/src/components/sections/FinalCTA.tsx"
  "frontend/src/components/showcase"
  "frontend/src/components/three/EarthScene.tsx"
  "frontend/src/components/ui/GatewayPortalCard.tsx"
  "frontend/src/components/ui/SectionHeading.tsx"
  "frontend/src/data/gateways.ts"
  "frontend/src/data/heroCopy.ts"
  "frontend/src/styles/agent-workspace.css"
  "frontend/src/styles/agent-gpt-copy-shell.css"
  "frontend/src/styles/fitmeet-assistant-ui.css"
)
existing_forbidden_paths=()
for legacy_path in "${forbidden_legacy_paths[@]}"; do
  if [[ -e "${legacy_path}" ]]; then
    existing_forbidden_paths+=("${legacy_path}")
  fi
done
if ((${#existing_forbidden_paths[@]} > 0)); then
  printf '\nLegacy Agent files still exist in the source tree:\n' >&2
  printf '  %s\n' "${existing_forbidden_paths[@]}" >&2
  fail 'Legacy Agent workbench/pet/custom-shell artifacts must not ship with the assistant-ui Agent mainline.'
fi

frontend_legacy_source_entries=()
if [[ -d frontend/src ]]; then
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    frontend_legacy_source_entries+=("${match}")
  done < <(
    grep -RIn --exclude-dir=node_modules --exclude-dir=dist \
      --exclude='*.test.ts' \
      --exclude='*.test.tsx' \
      --exclude='*.spec.ts' \
      --exclude='*.spec.tsx' \
      --include='*.ts' \
      --include='*.tsx' \
      --include='*.css' \
      -E 'agent-gpt-copy-shell|agent-workspace--gpt|agent-gpt-result-block|fitmeet-assistant-ui\.css|CodexAntPet|agent-workbench|SocialAgentConsolePage|DemoAgentSocialLoopPage|DemoInvestorPage' \
      frontend/src 2>/dev/null | grep -vE '/test/|\.test\.|\.spec\.' || true
  )
fi
if ((${#frontend_legacy_source_entries[@]} > 0)); then
  printf '\nLegacy Agent source references found outside tests:\n' >&2
  printf '  %s\n' "${frontend_legacy_source_entries[@]}" >&2
  fail 'Production /agent/chat must stay on the assistant-ui mainline without old shell, pet, or debug workbench references.'
fi

frontend_static_mock_import_entries=()
if [[ -d frontend/src ]]; then
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    frontend_static_mock_import_entries+=("${match}")
  done < <(
    grep -RIn --exclude-dir=node_modules --exclude-dir=dist \
      --exclude='*.test.ts' \
      --exclude='*.test.tsx' \
      --exclude='*.spec.ts' \
      --exclude='*.spec.tsx' \
      --include='*.ts' \
      --include='*.tsx' \
      -E "from ['\"][^'\"]*mockAgentAdapter['\"]|import[[:space:]]+[^;]*mockAgentAdapter" \
      frontend/src 2>/dev/null | grep -vE '/test/|\.test\.|\.spec\.' || true
  )
fi
if ((${#frontend_static_mock_import_entries[@]} > 0)); then
  printf '\nStatic mock Agent adapter imports found outside tests:\n' >&2
  printf '  %s\n' "${frontend_static_mock_import_entries[@]}" >&2
  fail 'Mock Agent adapter must remain behind explicit dynamic mock-mode loading so production cannot bundle the demo path.'
fi

critical_agent_context_files=(
  "backend/src/agent-gateway/social-agent-intent-router.service.ts"
  "backend/src/agent-gateway/social-agent-brain.service.ts"
  "backend/src/agent-gateway/social-agent-planner.service.ts"
  "backend/src/agent-gateway/social-agent-final-response.service.ts"
  "backend/src/agent-gateway/social-agent-model-router.service.ts"
  "backend/src/agent-gateway/social-agent-context-hydrator.service.ts"
  "backend/src/agent-gateway/social-agent-memory-context.service.ts"
  "backend/src/agent-gateway/social-agent-run-orchestrator.service.ts"
  "backend/src/agent-gateway/social-agent-route-agent-loop-runner.service.ts"
  "backend/src/agent-gateway/social-agent-context-window.ts"
)
critical_existing_files=()
for critical_file in "${critical_agent_context_files[@]}"; do
  [[ -f "${critical_file}" ]] && critical_existing_files+=("${critical_file}")
done

short_context_source_entries=()
if ((${#critical_existing_files[@]} > 0)); then
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    short_context_source_entries+=("${match}")
  done < <(
    grep -nE 'contextTurnLimit[[:space:]]*[:=][[:space:]]*(8|10|40)\b|slice[[:space:]]*\([[:space:]]*-[[:space:]]*(8|10|40)[[:space:]]*\)|recentMessages[[:space:]]*:[[:space:]]*(8|10|40)\b|conversationHistory[[:space:]]*:[[:space:]]*(8|10|40)\b' \
      "${critical_existing_files[@]}" 2>/dev/null || true
  )
fi
if ((${#short_context_source_entries[@]} > 0)); then
  printf '\nShort Agent context windows found in critical DeepSeek routes:\n' >&2
  printf '  %s\n' "${short_context_source_entries[@]}" >&2
  fail 'Critical Agent model routes must keep long conversation context; do not regress to 8/10/40-turn windows.'
fi

short_timeout_source_entries=()
if ((${#critical_existing_files[@]} > 0)); then
  while IFS= read -r match; do
    [[ -z "${match}" ]] && continue
    short_timeout_source_entries+=("${match}")
  done < <(
    grep -nE 'SOCIAL_AGENT_[A-Z_]*TIMEOUT[A-Z_]*[[:space:]]*[:=][^0-9]*2500\b|timeoutMs[[:space:]]*[:=][^0-9]*2500\b|intentTimeoutMs[[:space:]]*[:=][^0-9]*2500\b|plannerTimeoutMs[[:space:]]*[:=][^0-9]*2500\b' \
      "${critical_existing_files[@]}" 2>/dev/null || true
  )
fi
if ((${#short_timeout_source_entries[@]} > 0)); then
  printf '\nShort Agent model timeout budgets found in critical DeepSeek routes:\n' >&2
  printf '  %s\n' "${short_timeout_source_entries[@]}" >&2
  fail 'Critical Agent model routes must not fall back after the old 2.5s cap; use production-grade timeout budgets.'
fi

category_for_path() {
  local path="$1"
  case "${path}" in
    backend/src/agent-gateway/*|backend/src/ai/*|backend/src/common/deepseek.util.ts|backend/src/common/deepseek.util.spec.ts|backend/src/openapi/fitmeet-core.openapi.ts|backend/src/scripts/smoke-agent-*|backend/src/scripts/prepare-agent-smoke-seed.ts|backend/tsconfig.json)
      printf 'agent-backend-core'
      ;;
    frontend/src/components/agent-workspace/*|frontend/src/components/assistant-ui/*|frontend/src/components/ai-elements/*|frontend/src/components/agent-loop/AgentApprovalCard.tsx|frontend/src/components/agent/Agent*.tsx|frontend/src/components/agent/ant-guide/*|frontend/src/assets/agent/ant-guide/*|frontend/src/api/socialAgentApi.ts|frontend/src/api/socialAgentDebugApi.ts|frontend/src/lib/agentApprovalCopy.ts|frontend/src/lib/socialCodexProcessCopy.ts|frontend/src/pages/AgentControlCenterPage.tsx|frontend/src/pages/DemoAgentSocialLoopPage.tsx|frontend/src/pages/DemoInvestorPage.tsx|frontend/src/global.css)
      printf 'agent-frontend-assistant-ui'
      ;;
    backend/src/match/*|backend/src/social-requests/*|frontend/src/api/socialRequestsApi.ts|frontend/src/pages/DiscoverPage.tsx|frontend/src/pages/AiProfileBuilderPage.tsx|frontend/src/pages/HomePage.tsx|frontend/src/pages/HomePage.legacy.tsx|frontend/src/components/hero/*|frontend/src/components/sections/*|frontend/src/components/showcase/*|frontend/src/components/three/EarthScene.tsx|frontend/src/components/ui/GatewayPortalCard.tsx|frontend/src/components/ui/SectionHeading.tsx|frontend/src/data/*|frontend/src/styles/visual-upgrades.css|frontend/src/test/DiscoverClosure.test.ts|frontend/src/test/discoverContent.test.ts|frontend/src/routes/AppRoutes.tsx|frontend/src/types/index.ts)
      printf 'discover-profile-closure'
      ;;
    deploy/*|docker-compose.prod.yml|scripts/build-deploy-zip.*|scripts/ecs-*|scripts/verify-production.sh|scripts/verify-agent-goal-production.sh|scripts/verify-agent-release.sh|scripts/agent-release-matrix.sh|scripts/agent-release-worktree-audit.sh|backend/src/config/production-*|.env.example|backend/.env.example|frontend/.env.example)
      printf 'deploy-production'
      ;;
    docs/*|README.md|frontend/FRONTEND_ACCEPTANCE_CHECKLIST.md|frontend/scripts/*|frontend/src/test/*|frontend/src/test/utils/*|scripts/agent-remote-smoke-*|scripts/fix-*|scripts/verify-agent-release.sh|scripts/verify-agent-skills.mjs|scripts/run-agent-skill-evals.mjs|scripts/agent-release-matrix.sh|scripts/stage-agent-release-bucket.sh|scripts/test-agent-release-worktree-audit.sh)
      printf 'tests-docs'
      ;;
    *)
      printf 'uncategorized'
      ;;
  esac
}

status_output="$(git status --short)"

if [[ -z "${status_output}" ]]; then
  ok "Worktree clean"
  exit 0
fi

agent_backend_core_count=0
agent_frontend_assistant_ui_count=0
discover_profile_closure_count=0
deploy_production_count=0
tests_docs_count=0
uncategorized_count=0

uncategorized=()
untracked_source=()
artifact_entries=()
legacy_entries=()
mixed_entries=()
agent_backend_core_entries=()
agent_frontend_assistant_ui_entries=()
discover_profile_closure_entries=()
deploy_production_entries=()
tests_docs_entries=()
uncategorized_entries=()

add_category_entry() {
  local category="$1"
  local entry="$2"
  case "${category}" in
    agent-backend-core)
      agent_backend_core_entries+=("${entry}")
      ;;
    agent-frontend-assistant-ui)
      agent_frontend_assistant_ui_entries+=("${entry}")
      ;;
    discover-profile-closure)
      discover_profile_closure_entries+=("${entry}")
      ;;
    deploy-production)
      deploy_production_entries+=("${entry}")
      ;;
    tests-docs)
      tests_docs_entries+=("${entry}")
      ;;
    *)
      uncategorized_entries+=("${entry}")
      ;;
  esac
}

print_category_entries() {
  local label="$1"
  shift
  local entries=("$@")
  if ((${#entries[@]} == 0)); then
    return 0
  fi
  printf '\n%s:\n' "${label}"
  printf '  %s\n' "${entries[@]}"
}

write_category_manifest() {
  local name="$1"
  shift
  local entries=("$@")
  local status_file="${OUT_DIR}/${name}.status.txt"
  local paths_file="${OUT_DIR}/${name}.paths.txt"
  local stage_file="${OUT_DIR}/stage-${name}.sh"
  : > "${status_file}"
  : > "${paths_file}"
  if ((${#entries[@]} == 0)); then
    cat > "${stage_file}" <<STAGEEOF
#!/usr/bin/env bash
set -euo pipefail
echo "No ${name} paths to stage."
STAGEEOF
    chmod +x "${stage_file}"
    return 0
  fi
  printf '%s\n' "${entries[@]}" > "${status_file}"
  for entry in "${entries[@]}"; do
    local entry_status entry_path old_path new_path
    entry_status="${entry:0:2}"
    entry_path="${entry:3}"
    if [[ "${entry_status}" == R* || "${entry_status}" == *R ]]; then
      old_path="${entry_path%% -> *}"
      new_path="${entry_path#* -> }"
      # Git short status reports R/RM only after the old path deletion is already
      # represented in the index. Re-adding the missing old path as an explicit
      # pathspec fails on Apple Git, while staging the new path records any
      # worktree edits and keeps the indexed rename/delete intact.
      printf '%s\n' "${new_path}" >> "${paths_file}"
    else
      printf '%s\n' "${entry_path}" >> "${paths_file}"
    fi
  done
  cat > "${stage_file}" <<STAGEEOF
#!/usr/bin/env bash
set -euo pipefail
repo_root="\${FITMEET_REPO_ROOT:-\$(git rev-parse --show-toplevel)}"
cd "\${repo_root}"
git add -A --pathspec-from-file="${paths_file}"
echo "Staged ${name} paths from ${paths_file}"
STAGEEOF
  chmod +x "${stage_file}"
}

write_release_plan() {
  local plan_file="${OUT_DIR}/COMMIT_PLAN.md"
  cat > "${plan_file}" <<PLANEOF
# FitMeet Agent Release Commit Plan

Generated by \`scripts/agent-release-worktree-audit.sh --review\`.

Review every \`*.paths.txt\` file before running the stage helpers. The helpers
stage one release bucket at a time so the Agent release can be split into five
inspectable commits instead of one opaque change.

| Order | Bucket | Count | Stage helper | Suggested commit |
| --- | ---: | ---: | --- | --- |
| 1 | agent-backend-core | ${agent_backend_core_count} | \`stage-agent-backend-core.sh\` | \`feat(agent): harden Social Codex backend core\` |
| 2 | agent-frontend-assistant-ui | ${agent_frontend_assistant_ui_count} | \`stage-agent-frontend-assistant-ui.sh\` | \`feat(agent-ui): ship assistant-ui Social Codex shell\` |
| 3 | discover-profile-closure | ${discover_profile_closure_count} | \`stage-discover-profile-closure.sh\` | \`feat(discover): close public social intent and profile loops\` |
| 4 | deploy-production | ${deploy_production_count} | \`stage-deploy-production.sh\` | \`chore(deploy): harden ECS Agent release gates\` |
| 5 | tests-docs | ${tests_docs_count} | \`stage-tests-docs.sh\` | \`test(agent): document and verify release matrix\` |

If \`uncategorized\` is non-zero, do not package the release. Update the audit
classifier or remove the files after deciding whether they belong in the Agent
release.

After all five commits are split, run:

\`\`\`bash
scripts/agent-release-worktree-audit.sh --strict
\`\`\`

Only package the ECS zip after strict mode passes.
PLANEOF
}

while IFS= read -r line; do
  [[ -z "${line}" ]] && continue
  status="${line:0:2}"
  path="${line:3}"
  if [[ "${status}" == R* || "${status}" == *R ]]; then
    path="${line#* -> }"
  fi

  category="$(category_for_path "${path}")"
  add_category_entry "${category}" "${line}"
  case "${category}" in
    agent-backend-core)
      agent_backend_core_count=$((agent_backend_core_count + 1))
      ;;
    agent-frontend-assistant-ui)
      agent_frontend_assistant_ui_count=$((agent_frontend_assistant_ui_count + 1))
      ;;
    discover-profile-closure)
      discover_profile_closure_count=$((discover_profile_closure_count + 1))
      ;;
    deploy-production)
      deploy_production_count=$((deploy_production_count + 1))
      ;;
    tests-docs)
      tests_docs_count=$((tests_docs_count + 1))
      ;;
    *)
      uncategorized_count=$((uncategorized_count + 1))
      ;;
  esac
  if [[ "${category}" == "uncategorized" ]]; then
    uncategorized+=("${status} ${path}")
  fi

  index_status="${status:0:1}"
  worktree_status="${status:1:1}"
  if [[ "${status}" != "??" && "${index_status}" != " " && "${worktree_status}" != " " ]]; then
    mixed_entries+=("${status} ${path}")
  fi

  case "${line}" in
    '?? frontend/src/'*|'?? backend/src/'*|'?? scripts/'*|'?? deploy/'*|'?? docs/'*)
      untracked_source+=("${path}")
      ;;
  esac

  case "${path}" in
    artifacts/*|frontend/dist/*|*.zip|*.log|*.tmp|*.DS_Store|.DS_Store)
      artifact_entries+=("${status} ${path}")
      ;;
  esac

  case "${path}" in
    frontend/src/components/agent-workspace/CodexAntPet.tsx|\
    frontend/src/components/agent/ant-guide/*|\
    frontend/src/assets/agent/ant-guide/*|\
    frontend/src/components/ai-elements/*|\
    frontend/src/debug/*|\
    frontend/src/debug/agent-workbench/*|\
    frontend/src/pages/SocialAgentConsolePage.tsx|\
    frontend/src/pages/DemoAgentSocialLoopPage.tsx|\
    frontend/src/pages/DemoInvestorPage.tsx|\
    frontend/src/styles/agent-workspace.css|\
    frontend/src/styles/agent-gpt-copy-shell.css|\
    frontend/src/styles/fitmeet-assistant-ui.css|\
    frontend/src/data/agentMockData.ts|\
    frontend/src/data/mockContent.ts|\
    scripts/fix-aimatch.mjs|\
    scripts/fix-aimatch.ps1|\
    scripts/fix-loginmodal-v2.mjs|\
    scripts/fix-loginmodal-v3-css.mjs|\
    scripts/fix-loginmodal-v3-r2-css.mjs|\
    scripts/fix-loginmodal.mjs|\
    scripts/fix-meetmodal.mjs|\
    scripts/fix-postmodal.mjs)
      if [[ "${index_status}" != "D" && "${worktree_status}" != "D" && "${index_status}" != "R" && "${worktree_status}" != "R" ]]; then
        legacy_entries+=("${status} ${path}")
      fi
      ;;
  esac
done <<< "${status_output}"

printf '\nFitMeet Agent release worktree categories:\n'
printf '  %-30s %s\n' "mode" "${AUDIT_MODE}"
printf '  %-30s %s\n' "agent-backend-core" "${agent_backend_core_count}"
printf '  %-30s %s\n' "agent-frontend-assistant-ui" "${agent_frontend_assistant_ui_count}"
printf '  %-30s %s\n' "discover-profile-closure" "${discover_profile_closure_count}"
printf '  %-30s %s\n' "deploy-production" "${deploy_production_count}"
printf '  %-30s %s\n' "tests-docs" "${tests_docs_count}"
printf '  %-30s %s\n' "uncategorized" "${uncategorized_count}"

if [[ "${SHOW_FILES}" == "true" ]]; then
  if ((${#agent_backend_core_entries[@]} > 0)); then
    print_category_entries "agent-backend-core files" "${agent_backend_core_entries[@]}"
  fi
  if ((${#agent_frontend_assistant_ui_entries[@]} > 0)); then
    print_category_entries "agent-frontend-assistant-ui files" "${agent_frontend_assistant_ui_entries[@]}"
  fi
  if ((${#discover_profile_closure_entries[@]} > 0)); then
    print_category_entries "discover-profile-closure files" "${discover_profile_closure_entries[@]}"
  fi
  if ((${#deploy_production_entries[@]} > 0)); then
    print_category_entries "deploy-production files" "${deploy_production_entries[@]}"
  fi
  if ((${#tests_docs_entries[@]} > 0)); then
    print_category_entries "tests-docs files" "${tests_docs_entries[@]}"
  fi
  if ((${#uncategorized_entries[@]} > 0)); then
    print_category_entries "uncategorized files" "${uncategorized_entries[@]}"
  fi
fi

if [[ -n "${OUT_DIR}" ]]; then
  mkdir -p "${OUT_DIR}"
  if ((${#agent_backend_core_entries[@]} > 0)); then
    write_category_manifest "agent-backend-core" "${agent_backend_core_entries[@]}"
  else
    write_category_manifest "agent-backend-core"
  fi
  if ((${#agent_frontend_assistant_ui_entries[@]} > 0)); then
    write_category_manifest "agent-frontend-assistant-ui" "${agent_frontend_assistant_ui_entries[@]}"
  else
    write_category_manifest "agent-frontend-assistant-ui"
  fi
  if ((${#discover_profile_closure_entries[@]} > 0)); then
    write_category_manifest "discover-profile-closure" "${discover_profile_closure_entries[@]}"
  else
    write_category_manifest "discover-profile-closure"
  fi
  if ((${#deploy_production_entries[@]} > 0)); then
    write_category_manifest "deploy-production" "${deploy_production_entries[@]}"
  else
    write_category_manifest "deploy-production"
  fi
  if ((${#tests_docs_entries[@]} > 0)); then
    write_category_manifest "tests-docs" "${tests_docs_entries[@]}"
  else
    write_category_manifest "tests-docs"
  fi
  if ((${#uncategorized_entries[@]} > 0)); then
    write_category_manifest "uncategorized" "${uncategorized_entries[@]}"
  else
    write_category_manifest "uncategorized"
  fi
  write_release_plan
  printf '\nWrote release category manifests to %s\n' "${OUT_DIR}"
fi

if ((${#mixed_entries[@]} > 0)); then
  printf '\nMixed staged/unstaged entries need commit-splitting attention:\n' >&2
  printf '  %s\n' "${mixed_entries[@]}" >&2
  if [[ "${ALLOW_MIXED}" != "true" || "${ALLOW_DIRTY}" != "true" ]]; then
    fail "Mixed staged/unstaged entries are not allowed for a strict release."
  fi
  warn "Mixed staged/unstaged entries remain. Stage intentionally before creating release commits."
fi

if ((${#untracked_source[@]} > 0)); then
  printf '\nUntracked release-source files must be staged or removed:\n' >&2
  printf '  %s\n' "${untracked_source[@]}" >&2
  fail "Untracked source files would be missing from release/commit."
fi

if ((${#artifact_entries[@]} > 0)); then
  printf '\nGenerated artifacts should not be committed or packaged from git status:\n' >&2
  printf '  %s\n' "${artifact_entries[@]}" >&2
  fail "Generated artifact entries detected in worktree status."
fi

if ((${#legacy_entries[@]} > 0)); then
  printf '\nLegacy Agent files must stay deleted/renamed, not modified back into production:\n' >&2
  printf '  %s\n' "${legacy_entries[@]}" >&2
  fail "Legacy Agent artifact changed in a non-delete state."
fi

if ((${#uncategorized[@]} > 0)); then
  printf '\nUncategorized files need an explicit release decision:\n' >&2
  printf '  %s\n' "${uncategorized[@]}" >&2
  if [[ "${ALLOW_DIRTY}" != "true" ]]; then
    fail "Uncategorized worktree entries are not allowed for a strict release."
  fi
  warn "Uncategorized entries remain. Review before splitting commits."
fi

if [[ "${ALLOW_DIRTY}" != "true" ]]; then
  fail "Strict release mode requires a clean worktree after commit splitting."
fi

ok "Agent release worktree audit completed"
