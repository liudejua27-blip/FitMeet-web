#!/usr/bin/env bash

fitmeet_prepend_path_dir() {
  local dir="$1"
  if [[ -n "${dir}" && -d "${dir}" ]]; then
    case ":${PATH}:" in
      *":${dir}:"*) ;;
      *) export PATH="${dir}:${PATH}" ;;
    esac
  fi
}

fitmeet_bootstrap_toolchain() {
  fitmeet_prepend_path_dir "${FITMEET_NODE_RUNTIME_DIR:-}"
  fitmeet_prepend_path_dir "/Users/liuchongjiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin"
  fitmeet_prepend_path_dir "/Users/liuchongjiang/.local/share/node-v24.14.0-darwin-arm64/bin"

  fitmeet_prepend_path_dir "${FITMEET_COREPACK_BIN_DIR:-}"
  fitmeet_prepend_path_dir "/Users/liuchongjiang/.local/share/node-v24.14.0-darwin-arm64/lib/node_modules/corepack/shims"

  fitmeet_prepend_path_dir "${FITMEET_PNPM_BIN_DIR:-}"
  fitmeet_prepend_path_dir "/Users/liuchongjiang/Library/pnpm"
}

fitmeet_activate_pnpm() {
  local pnpm_version="${FITMEET_PNPM_VERSION:-10.30.3}"
  if command -v corepack >/dev/null 2>&1; then
    corepack enable
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack prepare "pnpm@${pnpm_version}" --activate
  fi
}
