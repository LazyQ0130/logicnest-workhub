#!/bin/sh
set -eu

umask 077

APP_DIR="${LOGICNEST_APP_DIR:-/opt/logicnest-workhub}"
BACKUP_DIR="$APP_DIR/backups"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL_PATH="$BACKUP_DIR/logicnest_$STAMP.sql"
TEMP_PATH="$BACKUP_DIR/.logicnest_$STAMP.sql.tmp"

mkdir -p "$BACKUP_DIR"
cd "$APP_DIR"

cleanup_temp() {
  if [ -f "$TEMP_PATH" ]; then
    rm -f -- "$TEMP_PATH"
  fi
}
trap cleanup_temp EXIT HUP INT TERM

docker compose --env-file .env -f docker-compose.yml exec -T mysql sh -c \
  'MYSQL_PWD="$MYSQL_PASSWORD" exec mysqldump --single-transaction --routines --triggers --events --no-tablespaces -u"$MYSQL_USER" "$MYSQL_DATABASE"' \
  > "$TEMP_PATH"

test -s "$TEMP_PATH"
chmod 600 "$TEMP_PATH"
mv "$TEMP_PATH" "$FINAL_PATH"
sha256sum "$FINAL_PATH" > "$FINAL_PATH.sha256"
chmod 600 "$FINAL_PATH.sha256"

trap - EXIT HUP INT TERM
printf 'Created database backup: %s\n' "$FINAL_PATH"
