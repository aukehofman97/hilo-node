#!/bin/sh
# init-graphdb.sh
# Creates the HILO GraphDB repository on first boot if it doesn't exist yet.
# Runs once via the graphdb-init service in docker-compose after GraphDB is healthy.

set -e

GRAPHDB_URL="${GRAPHDB_URL:-http://graphdb:7200}"
REPO_ID="${REPO_ID:-hilo}"
CONFIG_FILE="/graphdb-config/hilo-repository-config.ttl"
TMP_CONFIG="/tmp/repo-config.ttl"

echo "[graphdb-init] URL        : ${GRAPHDB_URL}"
echo "[graphdb-init] Repository : ${REPO_ID}"

# Check if repo already exists (returns 200 if yes, 404 if not)
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  "${GRAPHDB_URL}/rest/repositories/${REPO_ID}")

if [ "$HTTP_STATUS" = "200" ]; then
  echo "[graphdb-init] Repository '${REPO_ID}' already exists — nothing to do."
  exit 0
fi

echo "[graphdb-init] Repository not found (HTTP ${HTTP_STATUS}). Creating..."

# Replace the repo ID in the config template.
# This lets node-b reuse the same TTL file with repo ID "hilo-b" instead of "hilo".
sed "s/repositoryID \"hilo\"/repositoryID \"${REPO_ID}\"/" \
  "$CONFIG_FILE" > "$TMP_CONFIG"

# POST the config to create the repository
curl -f -s -X POST "${GRAPHDB_URL}/rest/repositories" \
  -F "config=@${TMP_CONFIG}"

echo ""
echo "[graphdb-init] Repository '${REPO_ID}' created successfully."
