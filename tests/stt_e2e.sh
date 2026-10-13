#!/bin/sh
set -e
BASE=https://chat.parlz.com
WAV=${1:-/tmp/parlz-stt-zh.wav}
USER=${USER_NAME:-uitest_stt}
PASS=${USER_PASS:-parlz-stt-2026}
JAR=/tmp/stt-jar.txt
rm -f "$JAR"

echo "1) register"
curl -s -c "$JAR" -X POST -F "action=register" -F "username=$USER" -F "nickname=STT Test" -F "password=$PASS" "$BASE/api/auth.php" | head -c 200
echo

echo "2) self chat"
CHAT=$(curl -s -b "$JAR" "$BASE/api/chats.php" | python3 -c "import json,sys; d=json.load(sys.stdin); cs=[c for c in (d.get('chats') or d.get('list') or []) if c.get('type')=='self']; print(cs[0]['id'] if cs else '')")
echo "chat=$CHAT"

echo "3) upload voice"
UP=$(curl -s -b "$JAR" -X POST -F "file=@$WAV" "$BASE/api/uploads.php")
echo "$UP" | head -c 200
echo
FILE=$(echo "$UP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('file',''))")
echo "file=$FILE"

echo "4) send voice message"
MSG=$(curl -s -b "$JAR" -X POST -F "action=send" -F "chat_id=$CHAT" -F "kind=voice" -F "body={\"file\":\"$FILE\",\"dur\":6}" "$BASE/api/messages.php")
echo "$MSG" | head -c 200
echo
MID=$(echo "$MSG" | python3 -c "import json,sys; print(json.load(sys.stdin).get('message',{}).get('id',''))")
echo "message=$MID"

echo "5) stt first call"
curl -s -b "$JAR" -X POST -F "message_id=$MID" "$BASE/api/stt.php" | head -c 300
echo

echo "6) stt cached call"
curl -s -b "$JAR" -X POST -F "message_id=$MID" "$BASE/api/stt.php" | head -c 300
echo

echo "7) cleanup"
docker exec PHP-85 php /www/sites/chat.parlz.com/index/tests/cleanup_test_accounts.php "$(curl -s -b "$JAR" "$BASE/api/auth.php" | python3 -c "import json,sys; print(json.load(sys.stdin).get('user',{}).get('id',''))")"
