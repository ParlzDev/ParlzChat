#!/bin/sh
set -e

SITE=${PARLZ_SITE:-/www/sites/chat.parlz.com/index}
DEST=${PARLZ_BACKUP_DIR:-/www/backups/parlz}
KEEP=${PARLZ_BACKUP_KEEP:-14}
REMOTE=${PARLZ_BACKUP_REMOTE:-root@38.76.190.153}
REMOTE_PORT=${PARLZ_BACKUP_REMOTE_PORT:-6666}
REMOTE_DIR=${PARLZ_BACKUP_REMOTE_DIR:-/www/backups/parlz}
LOG="$DEST/backup.log"
PHP_CONTAINER=${PARLZ_PHP_CONTAINER:-PHP-85}
SSH_OPTS="-n -p $REMOTE_PORT -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=no"

mkdir -p "$DEST"
log() {
  printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" >> "$LOG"
}
field() {
  printf '%s' "$1" | grep -o "\"$2\":\"[^\"]*\"" | tail -1 | cut -d'"' -f4
}

if [ ! -d "$SITE" ]; then
  log "FAIL 站点目录不存在: $SITE"
  exit 1
fi

RESULT=$(docker exec "$PHP_CONTAINER" php "$SITE/deploy/backup/snapshot.php" --dest="$DEST" --keep="$KEEP" ${PARLZ_BACKUP_FILES:+--files} 2>&1) || true
ARCHIVE=$(field "$RESULT" archive)
SHA=$(field "$RESULT" sha256)
if [ -z "$ARCHIVE" ] || [ -z "$SHA" ]; then
  log "FAIL 快照失败: $RESULT"
  exit 1
fi

if ! printf '%s  %s\n' "$SHA" "$ARCHIVE" | (cd "$DEST" && sha256sum -c - > /dev/null 2>&1); then
  log "FAIL 本机校验失败: $ARCHIVE"
  exit 1
fi
FILE_SIZE=$(stat -c %s "$DEST/$ARCHIVE" 2>/dev/null || echo 0)
log "OK 本机快照 $ARCHIVE bytes=$FILE_SIZE sha256=$(printf '%s' "$SHA" | cut -c1-8)"

if ! ssh $SSH_OPTS "$REMOTE" "mkdir -p '$REMOTE_DIR'" > /dev/null 2>&1; then
  log "WARN 异地不可达或未配置免密，本机快照仍在（异地跳过）"
  exit 0
fi

MANIFEST=$(printf '%s' "$ARCHIVE" | sed 's/\.sqlite\.gz$/.manifest.json/')
if ! scp -P "$REMOTE_PORT" -o BatchMode=yes -o ConnectTimeout=8 -o StrictHostKeyChecking=no "$DEST/$ARCHIVE" "$DEST/$MANIFEST" "$REMOTE:$REMOTE_DIR/" > /dev/null 2>&1; then
  log "WARN 异地推送失败（scp 出错），本机快照仍在"
  exit 0
fi

REMOTE_SHA=$(ssh $SSH_OPTS "$REMOTE" "sha256sum '$REMOTE_DIR/$ARCHIVE' | cut -d' ' -f1" 2>/dev/null | tail -1)
if [ "$REMOTE_SHA" = "$SHA" ]; then
  log "OK 异地副本 $REMOTE:$REMOTE_DIR/$ARCHIVE 校验一致"
else
  log "FAIL 异地副本校验不一致 remote=$REMOTE_SHA local=$SHA"
  exit 1
fi

exit 0
