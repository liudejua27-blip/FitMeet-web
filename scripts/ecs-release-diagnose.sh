#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/FitMeet-web}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-.env.production}"
PUBLIC_API_BASE_URL="${PUBLIC_API_BASE_URL:-https://www.ourfitmeet.cn/api}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-15}"

cd "$APP_DIR"

COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE")

read_release_json() {
  if [ ! -f release.json ]; then
    printf 'unknown'
    return
  fi
  node -e "const fs=require('fs');const r=JSON.parse(fs.readFileSync('release.json','utf8'));process.stdout.write(String(r.commit||'unknown'))"
}

print_health_release() {
  local label="$1"
  local body="$2"
  node - "$label" "$body" <<'NODE'
const label = process.argv[2];
const body = process.argv[3] || '';
try {
  const health = JSON.parse(body);
  const release = health.release && typeof health.release === 'object' ? health.release : {};
  const commit = String(release.commit || 'unknown');
  const source = String(release.source || 'unknown');
  const builtAt = release.builtAt ? String(release.builtAt) : '';
  console.log(`[release] ${label}: commit=${commit} source=${source}${builtAt ? ` builtAt=${builtAt}` : ''}`);
} catch (error) {
  console.log(`[release] ${label}: unable to parse health JSON`);
}
NODE
}

expected_commit="${EXPECTED_RELEASE_COMMIT:-$(read_release_json)}"

echo "[diagnose] app_dir=$APP_DIR"
echo "[diagnose] compose_file=$COMPOSE_FILE env_file=$ENV_FILE"
echo "[diagnose] expected_release_commit=$expected_commit"

if [ ! -f release.json ]; then
  echo "[FAIL] release.json is missing in $APP_DIR. The release zip was not installed into this directory." >&2
  exit 1
fi

echo "[diagnose] release.json:"
cat release.json
echo

echo "[diagnose] docker compose services:"
"${COMPOSE[@]}" ps

echo "[diagnose] backend container environment release values:"
if ! "${COMPOSE[@]}" exec -T backend sh -lc 'printf "FITMEET_RELEASE_COMMIT=%s\nFITMEET_RELEASE_SOURCE=%s\nFITMEET_RELEASE_BUILT_AT=%s\n" "$FITMEET_RELEASE_COMMIT" "$FITMEET_RELEASE_SOURCE" "$FITMEET_RELEASE_BUILT_AT"'; then
  echo "[FAIL] Unable to exec into backend container. Is the backend service running?" >&2
  exit 1
fi

echo "[diagnose] backend container internal /api/health:"
container_health="$(
  "${COMPOSE[@]}" exec -T backend node -e "const http=require('http');http.get('http://127.0.0.1:3000/api/health',(r)=>{let b='';r.on('data',(c)=>b+=c);r.on('end',()=>{process.stdout.write(b);});}).on('error',(e)=>{console.error(e.message);process.exit(1);});"
)"
printf '%s\n' "$container_health"
print_health_release "backend-container" "$container_health"

echo "[diagnose] public /api/health:"
public_health="$(curl -fsS -m "$TIMEOUT_SECONDS" "${PUBLIC_API_BASE_URL%/}/health")"
printf '%s\n' "$public_health"
print_health_release "public" "$public_health"

node - "$expected_commit" "$container_health" "$public_health" <<'NODE'
const expected = String(process.argv[2] || 'unknown');
const containerHealth = JSON.parse(process.argv[3] || '{}');
const publicHealth = JSON.parse(process.argv[4] || '{}');
const containerCommit = String(containerHealth.release?.commit || 'unknown');
const publicCommit = String(publicHealth.release?.commit || 'unknown');
const matches = (actual) =>
  expected !== 'unknown' && actual !== 'unknown' && (actual.startsWith(expected) || expected.startsWith(actual));
if (!matches(containerCommit)) {
  console.error(`[FAIL] backend container release mismatch: got ${containerCommit}, expected ${expected}`);
  process.exit(1);
}
if (!matches(publicCommit)) {
  console.error(`[FAIL] public API release mismatch: got ${publicCommit}, expected ${expected}`);
  console.error('[hint] If the container matches but public does not, check nginx/upstream routing or whether another stack is serving www.ourfitmeet.cn.');
  process.exit(1);
}
console.log('[OK] backend container and public API expose the expected release commit.');
NODE

