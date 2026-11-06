#!/bin/sh
set -eu
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p /backups
pg_dump -h "${AIHUB_DB_HOST:-postgres}" -U aihub -d aihub -Fc > "/backups/aihub-$stamp.dump.partial"
mv "/backups/aihub-$stamp.dump.partial" "/backups/aihub-$stamp.dump"
PGPASSWORD="$SUB2API_POSTGRES_PASSWORD" pg_dump -h sub2api-postgres -U sub2api -d sub2api -Fc > "/backups/sub2api-$stamp.dump.partial"
mv "/backups/sub2api-$stamp.dump.partial" "/backups/sub2api-$stamp.dump"
tar -czf "/backups/uploads-$stamp.tar.gz" -C /uploads .
find /backups -maxdepth 1 -type f -mtime +14 \( -name 'aihub-*.dump' -o -name 'sub2api-*.dump' -o -name 'uploads-*.tar.gz' \) -delete
echo "Backup completed: $stamp"
