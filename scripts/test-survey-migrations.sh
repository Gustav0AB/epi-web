#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
epi_container="epi-migrations-test-$$-$(date +%s)"
docker run --rm -d --name "$epi_container" -p 127.0.0.1::5432 -e POSTGRES_PASSWORD=disposable-test postgres:16-alpine >/dev/null
trap 'docker rm -fv "$epi_container" >/dev/null' EXIT
for attempt in $(seq 1 40); do
 if docker exec "$epi_container" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1; then break; fi
 sleep 1
done
docker exec "$epi_container" createdb -U postgres epi_setup_test
epi_port=$(docker port "$epi_container" 5432/tcp | cut -d: -f2)
export DATABASE_URL="postgresql://postgres:disposable-test@127.0.0.1:$epi_port/epi_setup_test"
export JWT_SECRET=integration-test-secret-1234567890abcdef
export NODE_ENV=test
npm run build -w packages/shared
node node_modules/prisma/build/index.js generate --schema apps/api/prisma/schema.prisma
node node_modules/prisma/build/index.js migrate deploy --schema apps/api/prisma/schema.prisma
node node_modules/prisma/build/index.js migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel apps/api/prisma/schema.prisma --exit-code
npm run test:setup-integration -w apps/api
npm run test:categories-integration -w apps/api
npm run test:courses-integration -w apps/api
npm run test:results-integration -w apps/api
npm run test:publications-integration -w apps/api
