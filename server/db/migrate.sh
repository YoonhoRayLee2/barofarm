#!/bin/bash
# DB 스키마 + 전체 마이그레이션 순서대로 실행
set -e

HOST=${DB_HOST:-localhost}
USER=${DB_USER:-root}
PASS=${DB_PASS:-}
NAME=${DB_NAME:-barofarm}

run_sql() {
  if [ -z "$PASS" ]; then
    mysql -h "$HOST" -u "$USER" "$NAME" < "$1"
  else
    mysql -h "$HOST" -u "$USER" -p"$PASS" "$NAME" < "$1"
  fi
}

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Running migrations from $SCRIPT_DIR/migrations..."
for f in "$SCRIPT_DIR/migrations/"*.sql; do
  echo "  → $(basename $f)"
  run_sql "$f"
done
echo "Migrations complete."
