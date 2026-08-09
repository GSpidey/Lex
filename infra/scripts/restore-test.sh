#!/usr/bin/env sh
set -eu
: "${BACKUP_FILE:?}" "${AGE_IDENTITY_FILE:?}" "${RESTORE_DATABASE_URL:?}"
temporary="$(mktemp -d)"
trap 'rm -rf "$temporary"' EXIT
age -d -i "$AGE_IDENTITY_FILE" -o "$temporary/restore.dump" "$BACKUP_FILE"
pg_restore --clean --if-exists --no-owner --dbname "$RESTORE_DATABASE_URL" "$temporary/restore.dump"
psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c 'SELECT count(*) AS users FROM "User";' -c 'SELECT count(*) AS matters FROM "Matter";'
