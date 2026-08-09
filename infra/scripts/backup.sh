#!/usr/bin/env sh
set -eu
: "${BACKUP_DIR:?}" "${DATABASE_URL:?}" "${BACKUP_AGE_RECIPIENT:?}" "${S3_BUCKET:?}"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
umask 077
pg_dump "$DATABASE_URL" --format=custom | age -r "$BACKUP_AGE_RECIPIENT" -o "$BACKUP_DIR/lex-db-$stamp.dump.age"
aws s3api head-bucket --bucket "$S3_BUCKET"
find "$BACKUP_DIR" -type f -name 'lex-db-*.dump.age' -mtime +35 -delete
sha256sum "$BACKUP_DIR/lex-db-$stamp.dump.age" > "$BACKUP_DIR/lex-db-$stamp.dump.age.sha256"
