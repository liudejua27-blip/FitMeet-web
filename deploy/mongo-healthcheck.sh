#!/usr/bin/env sh
set -eu

mongosh \
  --username "${MONGO_INITDB_ROOT_USERNAME:?MONGO_INITDB_ROOT_USERNAME is required}" \
  --password "${MONGO_INITDB_ROOT_PASSWORD:?MONGO_INITDB_ROOT_PASSWORD is required}" \
  --authenticationDatabase admin \
  --eval "db.adminCommand('ping')" \
  --quiet >/dev/null
