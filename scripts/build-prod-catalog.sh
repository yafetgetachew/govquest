#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="${ROOT_DIR}/surreal/schema-and-seed.surql"
OUT="${ROOT_DIR}/surreal/catalog-prod.surql"
ENRICH_SCRIPT="${ROOT_DIR}/scripts/enrich-process-metadata.mjs"

if [[ ! -f "${SRC}" ]]; then
  echo "Source file not found: ${SRC}" >&2
  exit 1
fi

if [[ -f "${ENRICH_SCRIPT}" ]]; then
  node "${ENRICH_SCRIPT}" "${SRC}" >/dev/null
fi

{
  echo "-- Production catalog seed (idempotent)"
  echo "-- Source of truth: surreal/schema-and-seed.surql"
  echo "BEGIN TRANSACTION;"
  echo
  echo "-- Rebuild process/task graph edges to keep ordering and hierarchy in sync."
  echo "DELETE requires WHERE true;"
  echo
  awk '
    /^CREATE process:/ { started=1 }
    started {
      if ($0 ~ /^COMMIT TRANSACTION;/) exit
      print
    }
  ' "${SRC}" | sed -E 's/^CREATE process:/UPSERT process:/; s/^CREATE task:/UPSERT task:/'
  echo
  echo "COMMIT TRANSACTION;"
} > "${OUT}"

echo "Wrote ${OUT}"
