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

# GraphDB 10.x requires JSON API — the old TTL multipart format is no longer supported.
# POST JSON config to create the repository (repo ID is injected dynamically).
curl -f -s -X POST "${GRAPHDB_URL}/rest/repositories" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"${REPO_ID}\",
    \"type\": \"graphdb\",
    \"title\": \"HILO Semantics Repository\",
    \"params\": {
      \"id\":                        {\"name\":\"id\",                        \"label\":\"Repository ID\",                                  \"value\":\"${REPO_ID}\"},
      \"title\":                     {\"name\":\"title\",                     \"label\":\"Repository description\",                         \"value\":\"HILO Semantics Repository\"},
      \"baseURL\":                   {\"name\":\"baseURL\",                   \"label\":\"Base URL\",                                       \"value\":\"http://hilo.semantics.io/\"},
      \"defaultNS\":                 {\"name\":\"defaultNS\",                 \"label\":\"Default namespaces for imports(';' delimited)\",   \"value\":\"\"},
      \"imports\":                   {\"name\":\"imports\",                   \"label\":\"Imported RDF files(';' delimited)\",               \"value\":\"\"},
      \"storageFolder\":             {\"name\":\"storageFolder\",             \"label\":\"Storage folder\",                                 \"value\":\"storage\"},
      \"entityIndexSize\":           {\"name\":\"entityIndexSize\",           \"label\":\"Entity index size\",                              \"value\":\"10000000\"},
      \"entityIdSize\":              {\"name\":\"entityIdSize\",              \"label\":\"Entity ID size\",                                 \"value\":\"32\"},
      \"ruleset\":                   {\"name\":\"ruleset\",                   \"label\":\"Ruleset\",                                        \"value\":\"rdfsplus-optimized\"},
      \"repositoryType\":            {\"name\":\"repositoryType\",            \"label\":\"Repository type\",                               \"value\":\"file-repository\"},
      \"enableContextIndex\":        {\"name\":\"enableContextIndex\",        \"label\":\"Enable context index\",                          \"value\":\"false\"},
      \"enablePredicateList\":       {\"name\":\"enablePredicateList\",       \"label\":\"Enable predicate list index\",                   \"value\":\"true\"},
      \"enableLiteralIndex\":        {\"name\":\"enableLiteralIndex\",        \"label\":\"Enable literal index\",                          \"value\":\"true\"},
      \"inMemoryLiteralProperties\": {\"name\":\"inMemoryLiteralProperties\", \"label\":\"Cache literal language tags\",                   \"value\":\"true\"},
      \"disableSameAs\":             {\"name\":\"disableSameAs\",             \"label\":\"Disable owl:sameAs\",                            \"value\":\"true\"},
      \"isShacl\":                   {\"name\":\"isShacl\",                   \"label\":\"Enable SHACL validation\",                       \"value\":\"false\"},
      \"readOnly\":                  {\"name\":\"readOnly\",                   \"label\":\"Read-only\",                                     \"value\":\"false\"},
      \"queryTimeout\":              {\"name\":\"queryTimeout\",              \"label\":\"Query timeout (seconds)\",                       \"value\":\"0\"},
      \"queryLimitResults\":         {\"name\":\"queryLimitResults\",         \"label\":\"Limit query results\",                           \"value\":\"0\"},
      \"enableFtsIndex\":            {\"name\":\"enableFtsIndex\",            \"label\":\"Enable full-text search (FTS) index\",           \"value\":\"false\"},
      \"cacheSelectNodes\":          {\"name\":\"cacheSelectNodes\",          \"label\":\"Cache select nodes\",                            \"value\":\"true\"}
    }
  }"

echo ""
echo "[graphdb-init] Repository '${REPO_ID}' created successfully."
