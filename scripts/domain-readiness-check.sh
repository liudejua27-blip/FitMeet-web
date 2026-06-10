#!/usr/bin/env bash
set -euo pipefail

WEB_ORIGIN="${WEB_ORIGIN:-https://www.ourfitmeet.cn}"
API_BASE_URL_WAS_SET="${API_BASE_URL:-}"
API_BASE_URL="${API_BASE_URL:-https://www.ourfitmeet.cn/api}"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-12}"
FITMEET_LAUNCH_TOPOLOGY="${FITMEET_LAUNCH_TOPOLOGY:-vercel-railway}"
CHECK_VERCEL_WEB_DNS="${CHECK_VERCEL_WEB_DNS:-true}"
EXPECTED_VERCEL_APEX_A="${EXPECTED_VERCEL_APEX_A:-76.76.21.21}"
RAILWAY_API_DNS_TARGET="${RAILWAY_API_DNS_TARGET:-<copy Railway custom-domain CNAME target>}"
ECS_PUBLIC_IP="${ECS_PUBLIC_IP:-<your Aliyun ECS public IP>}"
PRINT_REQUIRED_DNS=false
FAILURES=0

usage() {
  cat <<'EOF'
Usage: scripts/domain-readiness-check.sh [--topology vercel-railway|ecs] [--web-origin https://www.ourfitmeet.cn] [--api-base-url https://www.ourfitmeet.cn/api] [--print-required-records]

Checks the public FitMeet DNS/TLS/API chain before the full production smoke:
  - Web apex DNS resolves.
  - Web apex DNS points at Vercel when topology is vercel-railway and CHECK_VERCEL_WEB_DNS=true.
  - API hostname DNS resolves.
  - Web HTTP is reachable or redirects.
  - Web HTTPS returns 200.
  - API /health returns 200 with {"status":"ok"}.

Environment:
  FITMEET_LAUNCH_TOPOLOGY
                   Launch topology: vercel-railway or ecs. Default: vercel-railway.
  WEB_ORIGIN       Public Web origin. Default: https://www.ourfitmeet.cn.
  API_BASE_URL     Public API base URL. Default: https://www.ourfitmeet.cn/api,
                   or <WEB_ORIGIN>/api when topology is ecs and API_BASE_URL is not set.
  TIMEOUT_SECONDS  Per-request timeout. Default: 12.
  CHECK_VERCEL_WEB_DNS
                   Require the Web domain to target Vercel DNS. Default: true.
  EXPECTED_VERCEL_APEX_A
                   Expected Vercel apex A record. Default: 76.76.21.21.
  RAILWAY_API_DNS_TARGET
                   Railway custom-domain CNAME target after adding the API domain
                   in Railway Settings -> Networking. Printed in the DNS plan.
  ECS_PUBLIC_IP    Aliyun ECS public IP printed in the ECS DNS plan.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --topology)
      FITMEET_LAUNCH_TOPOLOGY="${2:-}"
      shift
      ;;
    --web-origin)
      WEB_ORIGIN="${2:-}"
      shift
      ;;
    --api-base-url)
      API_BASE_URL="${2:-}"
      API_BASE_URL_WAS_SET="${API_BASE_URL}"
      shift
      ;;
    --print-required-records)
      PRINT_REQUIRED_DNS=true
      ;;
    --railway-api-dns-target)
      RAILWAY_API_DNS_TARGET="${2:-}"
      shift
      ;;
    --ecs-public-ip)
      ECS_PUBLIC_IP="${2:-}"
      shift
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

WEB_ORIGIN="${WEB_ORIGIN%/}"
if [[ "${FITMEET_LAUNCH_TOPOLOGY}" == "ecs" ]]; then
  CHECK_VERCEL_WEB_DNS=false
  if [[ -z "${API_BASE_URL_WAS_SET}" ]]; then
    API_BASE_URL="${WEB_ORIGIN}/api"
  fi
fi
API_BASE_URL="${API_BASE_URL%/}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "${TMP_DIR}"' EXIT
PRINTED_DNS_PLAN=false

ok() {
  printf '[OK] %s\n' "$1" >&2
}

fail() {
  printf '[FAIL] %s\n' "$1" >&2
  exit 1
}

record_failure() {
  FAILURES=$((FAILURES + 1))
  printf '[FAIL] %s\n' "$1" >&2
}

print_required_dns_records() {
  local web_host
  local api_host

  web_host="$(url_host "${WEB_ORIGIN}")"
  api_host="$(url_host "${API_BASE_URL}")"

  if [[ "${FITMEET_LAUNCH_TOPOLOGY}" == "ecs" ]]; then
    cat >&2 <<EOF

Required DNS records for the Aliyun ECS same-origin launch path:

DNS Host/Name       Type   Value                         Serves
@                   A      ${ECS_PUBLIC_IP}              ${web_host}
www                 CNAME  ${web_host}                   www.${web_host}

ECS topology expects the API to be served by the same host through Nginx:
  WEB_ORIGIN=${WEB_ORIGIN}
  API_BASE_URL=${API_BASE_URL}

Dashboard order:
1. Point the apex domain to the Aliyun ECS public IP.
2. Install the production certificate on ECS under nginx/ssl/.
3. Keep backend API reachable at ${WEB_ORIGIN}/api.
4. Rerun this script with --topology ecs, then run scripts/ecs-post-deploy-smoke.sh.

Do not buy Namecheap hosting, EasyWP, Spacemail, SSL, CDN, or website-builder add-ons for the ECS topology unless you intentionally want those separate services.
EOF
    return
  fi

  cat >&2 <<EOF

Required DNS records for the Vercel + Railway launch path:

Namecheap Host/Name  Type   Value                                      Serves
@                    A      ${EXPECTED_VERCEL_APEX_A}                         ${web_host}
www                  CNAME  cname.vercel-dns.com                       www.${web_host}
api                  CNAME  ${RAILWAY_API_DNS_TARGET}  ${api_host}

Dashboard order:
1. Add ${web_host} to the Vercel project before changing the apex DNS.
2. Add ${api_host} to the Railway backend service, then copy Railway's CNAME target into DNS.
3. Remove stale apex A records that still point to old AWS/OpenResty/ECS hosts unless ECS is the intentional fallback.
4. Wait for both platforms to show HTTPS ready, then rerun this script.

Do not buy Namecheap hosting, EasyWP, Spacemail, SSL, CDN, or website-builder add-ons for this Vercel/Railway topology.
EOF
}

print_dns_plan_once() {
  if [[ "${PRINTED_DNS_PLAN}" == "false" ]]; then
    print_required_dns_records
    PRINTED_DNS_PLAN=true
  fi
}

exit_if_failures() {
  if [[ "${FAILURES}" -gt 0 ]]; then
    print_dns_plan_once
    exit 1
  fi
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "$1 is required."
}

url_host() {
  node -e 'console.log(new URL(process.argv[1]).hostname)' "$1"
}

resolve_host() {
  local host="$1"
  local output

  output="$(dig +short "${host}" A "${host}" AAAA "${host}" CNAME | sed '/^$/d')"
  if [[ -z "${output}" ]]; then
    record_failure "${host} has no A, AAAA, or CNAME DNS answer. Add ${host} as a custom domain in its hosting platform, then create the DNS record that platform shows."
    return 1
  fi

  ok "${host} DNS resolves: $(printf '%s' "${output}" | tr '\n' ' ')"
  printf '%s\n' "${output}"
}

check_vercel_web_dns() {
  local host="$1"
  local dns_output="$2"
  local dns_one_line

  [[ "${CHECK_VERCEL_WEB_DNS}" == "true" ]] || return 0
  [[ "${host}" == "ourfitmeet.cn" || "${host}" == "www.ourfitmeet.cn" ]] || return 0

  dns_one_line="$(printf '%s' "${dns_output}" | tr '\n' ' ')"
  if printf '%s\n' "${dns_output}" | grep -Eq "(^|[[:space:]])${EXPECTED_VERCEL_APEX_A//./\\.}([[:space:]]|$)|vercel-dns\\.com\\.?$"; then
    ok "${host} DNS targets Vercel."
    return
  fi

  record_failure "${host} DNS resolves, but not to the expected Vercel target. Current DNS: ${dns_one_line}. Add the custom domain in Vercel, then set the apex A record to ${EXPECTED_VERCEL_APEX_A} or the CNAME/ALIAS target Vercel shows."
}

curl_expect() {
  local label="$1"
  local url="$2"
  local expected="$3"
  local body_file="${TMP_DIR}/$(echo "${label}" | tr -c 'A-Za-z0-9' '_').body"
  local error_file="${body_file}.err"
  local status

  if ! status="$(
    curl -sS -m "${TIMEOUT_SECONDS}" -o "${body_file}" -w '%{http_code}' \
      -H 'User-Agent: FitMeetDomainReadiness/1.0' \
      "${url}" 2>"${error_file}"
  )"; then
    status="000"
  fi

  if [[ ",${expected}," == *",${status},"* ]]; then
    ok "${label} -> ${status}"
    printf '%s\n' "${body_file}"
    return
  fi

  printf '[FAIL] %s -> %s, expected %s\n' "${label}" "${status}" "${expected}" >&2
  if [[ -s "${error_file}" ]]; then
    head -c 600 "${error_file}" >&2
    printf '\n' >&2
  elif [[ -s "${body_file}" ]]; then
    head -c 600 "${body_file}" >&2
    printf '\n' >&2
  fi
  exit 1
}

require_command curl
require_command dig
require_command node

if [[ "${FITMEET_LAUNCH_TOPOLOGY}" != "vercel-railway" && "${FITMEET_LAUNCH_TOPOLOGY}" != "ecs" ]]; then
  fail "FITMEET_LAUNCH_TOPOLOGY must be vercel-railway or ecs."
fi

if [[ "${PRINT_REQUIRED_DNS}" == "true" ]]; then
  print_required_dns_records
  exit 0
fi

web_host="$(url_host "${WEB_ORIGIN}")"
api_host="$(url_host "${API_BASE_URL}")"
web_http_origin="http://${web_host}"

web_dns="$(resolve_host "${web_host}" || true)"
api_dns="$(resolve_host "${api_host}" || true)"
if [[ -n "${web_dns}" ]]; then
  check_vercel_web_dns "${web_host}" "${web_dns}"
fi
if [[ "${FITMEET_LAUNCH_TOPOLOGY}" == "ecs" && "${web_host}" != "${api_host}" ]]; then
  record_failure "ECS topology expects API_BASE_URL to use the same host as WEB_ORIGIN. Current WEB_ORIGIN host=${web_host}, API_BASE_URL host=${api_host}. Use API_BASE_URL=${WEB_ORIGIN}/api or switch to --topology vercel-railway."
fi
exit_if_failures

curl_expect "Web HTTP reachability" "${web_http_origin}" "200,301,302,307,308" >/dev/null
curl_expect "Web HTTPS" "${WEB_ORIGIN}" "200" >/dev/null
api_health_body="$(curl_expect "API health" "${API_BASE_URL}/health" "200")"

node - "${api_health_body}" <<'NODE'
const fs = require('fs');
const payload = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (payload.status !== 'ok') {
  console.error(`Unexpected health payload: ${JSON.stringify(payload)}`);
  process.exit(1);
}
NODE
ok 'API health payload is status=ok'

printf '\nDomain readiness completed successfully for %s and %s\n' "${WEB_ORIGIN}" "${API_BASE_URL}"
