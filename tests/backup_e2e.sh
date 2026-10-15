#!/bin/sh
set -e
BASE=${PARLZ_BASE:-https://chat.parlz.com}
HOST="root@120.24.78.176"
PORT=6666
D="/www/sites/chat.parlz.com/index"
BK="/www/backups/parlz"
REMOTE_HOST="root@38.76.190.153"
PHP_BIN=${PARLZ_PHP_BIN:-php}
export SSH_ASKPASS=${SSH_ASKPASS:-/tmp/askpass.sh}
export SSH_ASKPASS_REQUIRE=force
SSL="-n -p $PORT -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=no"
FAILED=0

say() {
  printf '%s %s\n' "$1" "$2"
}

fails() {
  FAILED=$((FAILED + 1))
  say FAIL "$1"
}

pass() {
  say PASS "$1"
}

rsh() {
  ssh -n -p $PORT -o ConnectTimeout=10 -o StrictHostKeyChecking=no "$HOST" "$1" 2>/dev/null
}

json_field() {
  printf '%s' "$2" | php -r '$d=json_decode(stream_get_contents(STDIN),true); $k=$argv[1]; echo json_encode($d[$k] ?? null);' "$1"
}

live_count() {
  rsh "docker exec PHP-85 php $D/tests/dbval.php count_table $1" | tail -1
}

say "== 1. 跑一次备份（保留 3 份）=="
OUT=$(rsh "PARLZ_BACKUP_KEEP=3 sh $D/deploy/backup/backup.sh > /dev/null 2>&1; tail -2 $BK/backup.log")
say INFO "$OUT"
case "$OUT" in
  *"OK 本机快照"*) pass "本机快照成功" ;;
  *) fails "本机快照失败" ;;
esac
case "$OUT" in
  *"OK 异地副本"*) pass "异地副本校验一致" ;;
  *) fails "异地副本没落地或校验不一致" ;;
esac

LATEST=$(rsh "ls -1 $BK/parlz-*.manifest.json 2>/dev/null | tail -1")
if [ -z "$LATEST" ]; then
  fails "找不到 manifest"
  say "备份判据结束" "失败 $FAILED 项"
  exit 1
fi
say INFO "最新 manifest: $LATEST"

MAN=$(rsh "cat $LATEST")
INTEGRITY=$(json_field integrity "$MAN")
case "$INTEGRITY" in
  *'"ok"'*) pass "快照 integrity=ok" ;;
  *) fails "快照 integrity 不是 ok: $INTEGRITY" ;;
esac

for TABLE in users messages chats; do
  LIVE=$(live_count "$TABLE" | tail -1)
  inSnapshot=$(json_field counts "$MAN")
  case "$inSnapshot" in
    *"\"$TABLE\":$LIVE"*) pass "$TABLE 计数与线上一致 ($LIVE)" ;;
    *) fails "$TABLE 计数不一致 manifest=$inSnapshot live=$LIVE" ;;
  esac
done

ARCHIVE=$(printf '%s' "$LATEST" | sed 's|.*/||; s|\.manifest\.json$|.sqlite.gz|')
LOCAL_SHA=$(rsh "sha256sum $BK/$ARCHIVE | cut -d' ' -f1")
REMOTE_SHA=$(rsh "ssh $SSL $REMOTE_HOST \"sha256sum /www/backups/parlz/$ARCHIVE | cut -d' ' -f1\"" | tail -1)
if [ -n "$LOCAL_SHA" ] && [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  pass "两地 sha256 一致 (${LOCAL_SHA%${LOCAL_SHA#??????}})"
else
  fails "两地 sha256 不一致 local=$LOCAL_SHA remote=$REMOTE_SHA"
fi

say "== 2. manifest 里的 sha256 与文件对得上 =="
GZ_RECORD=$(json_field sha256 "$MAN" | tr -d '"')
if [ "$GZ_RECORD" = "$LOCAL_SHA" ]; then
  pass "manifest sha256 与线上文件一致"
else
  fails "manifest sha256 对不上 record=$GZ_RECORD file=$LOCAL_SHA"
fi

say "== 3. 归档能被解出且库能打开 =="
VERIFY=$(rsh "docker exec PHP-85 php -r '\$z=gzopen(\"$BK/$ARCHIVE\",\"rb\"); \$tmp=\"/tmp/parlz-verify.sqlite\"; \$o=fopen(\$tmp,\"wb\"); while(!gzeof(\$z)){ fwrite(\$o,(string)gzread(\$z,1048576)); } fclose(\$o); gzclose(\$z); \$p=new PDO(\"sqlite:\".\$tmp); echo \$p->query(\"PRAGMA integrity_check\")->fetchColumn().\" users=\".\$p->query(\"SELECT COUNT(*) FROM users\")->fetchColumn().\" messages=\".\$p->query(\"SELECT COUNT(*) FROM messages\")->fetchColumn(); unlink(\$tmp);'")
case "$VERIFY" in
  ok\ users=*) pass "解档后 integrity=ok（$VERIFY）" ;;
  *) fails "解档校验失败: $VERIFY" ;;
esac

say "== 4. 保留份数受 keep 约束 =="
COUNT=$(rsh "ls -1 $BK/parlz-*.manifest.json 2>/dev/null | wc -l" | tail -1)
if [ "$COUNT" -le 3 ]; then
  pass "保留 $COUNT 份（≤3）"
else
  fails "保留了 $COUNT 份，超过 keep=3"
fi

say "== 5. 恢复默认保留份数 =="
rsh "PARLZ_BACKUP_KEEP=14 sh $D/deploy/backup/backup.sh > /dev/null 2>&1; true" > /dev/null
LAST=$(rsh "tail -1 $BK/backup.log")
say INFO "$LAST"

if [ "$FAILED" -eq 0 ]; then
  say "备份判据" "全部通过"
  exit 0
fi
say "备份判据" "失败 $FAILED 项"
exit 1
