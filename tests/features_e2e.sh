#!/bin/sh
BASE=https://chat.parlz.com
D=/www/sites/chat.parlz.com/index
HOST="root@120.24.78.176"
PORT=6666
JAR_A=/tmp/feat-a.txt
JAR_B=/tmp/feat-b.txt
EMAIL_A=feature.a@parlz.com
EMAIL_B=feature.b@parlz.com
GNAME=feat-group-2026
export SSH_ASKPASS=${SSH_ASKPASS:-/tmp/askpass.sh}
export SSH_ASKPASS_REQUIRE=force
rm -f "$JAR_A" "$JAR_B"

rval() {
  ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/dbval.php $1 $2" 2>/dev/null | tail -1
}

rclear() {
  ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/clear_rate.php" 2>/dev/null | tail -1
}

jget() {
  php -r '$d=json_decode(stream_get_contents(STDIN),true); if(!is_array($d)){echo "";exit;} $p=explode(".",$argv[1]); foreach($p as $k){ if($k==="") continue; if(!isset($d[$k])){$d=null;break;} $d=$d[$k]; } echo is_scalar($d)?(string)$d:json_encode($d);' "$1" 2>/dev/null
}

send_code() {
  curl -s -m 60 -X POST -F "action=send" -F "email=$1" -F "nickname=$2" $BASE/api/email.php > /dev/null
  rval code "$1"
}

rclear
rval clear_codes >/dev/null

echo "== 注册 A =="
CA=$(send_code "$EMAIL_A" "FeatA")
echo "code_a=$CA"
curl -s -m 60 -c "$JAR_A" -X POST -F "action=register" -F "username=feat_a" -F "nickname=FeatA" -F "password=parlz-feat-2026" -F "email=$EMAIL_A" -F "code=$CA" $BASE/api/auth.php | head -c 160; echo

echo "== 注册 B =="
CB=$(send_code "$EMAIL_B" "FeatB")
echo "code_b=$CB"
curl -s -m 60 -c "$JAR_B" -X POST -F "action=register" -F "username=feat_b" -F "nickname=FeatB" -F "password=parlz-feat-2026" -F "email=$EMAIL_B" -F "code=$CB" $BASE/api/auth.php | head -c 160; echo

echo "== A 的会话列表（应只有文件传输助手，没有广场）=="
CH=$(curl -s -m 60 -b "$JAR_A" "$BASE/api/chats.php")
echo "$CH" | php -r '$d=json_decode(stream_get_contents(STDIN),true); $cs=$d["chats"] ?? ($d["list"] ?? []); foreach($cs as $c){echo "[".$c["type"]."] ".$c["title"]."  ";} echo PHP_EOL;'

SELF=$(echo "$CH" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(($d["chats"]??[]) as $c){ if($c["type"]==="self"){echo $c["id"];return;} } echo 0;')
echo "self_chat=$SELF"

echo "== A 发 5 条消息 + 等级 =="
for i in 1 2 3 4 5; do
  curl -s -m 60 -b "$JAR_A" -X POST -F "action=send" -F "chat_id=$SELF" -F "kind=text" -F "body=level test $i" $BASE/api/messages.php > /dev/null
done
echo "profile_level=$(curl -s -m 60 -b "$JAR_A" "$BASE/api/profile.php" | jget user.level)"

echo "== 面对面加好友 =="
FACE=$(curl -s -m 60 -b "$JAR_A" -X POST -F "action=face-code" $BASE/api/friends.php)
echo "face_code_raw=$(echo "$FACE" | head -c 90)"
CODE=$(echo "$FACE" | jget code)
JOIN=$(curl -s -m 60 -b "$JAR_B" -X POST -F "action=face-join" -F "code=$CODE" $BASE/api/friends.php)
echo "join=$(echo "$JOIN" | head -c 90)"
echo "status=$(curl -s -m 60 -b "$JAR_A" -X POST -F "action=face-status" $BASE/api/friends.php | head -c 90)"

echo "== 建群 + 搜索/加群设置 =="
ID_B_USER=$(curl -s -m 60 -b "$JAR_B" "$BASE/api/auth.php" | jget user.id)
GROUP=$(curl -s -m 60 -b "$JAR_A" -X POST -F "action=create" -F "name=$GNAME" -F "member_ids[]=$ID_B_USER" $BASE/api/groups.php)
echo "create=$(echo "$GROUP" | head -c 160)"
GID=$(echo "$GROUP" | jget chat_id)
[ -z "$GID" ] && GID=$(echo "$GROUP" | jget group.id)
GUID=$(curl -s -m 60 -b "$JAR_A" "$BASE/api/groups.php" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(($d["groups"]??[]) as $g){ if(($g["name"]??"")==="'"$GNAME"'"){echo $g["uid"];return;} }')
echo "gid=$GID guid=$GUID"

echo "settings-open=$(curl -s -m 60 -b "$JAR_A" -X POST -F "action=settings" -F "chat_id=$GID" -F "search_mode=uid" -F "join_mode=open" $BASE/api/groups.php)"
echo "search-by-name-when-uid-only=$(curl -s -m 60 -b "$JAR_B" -X POST -F "action=search" -F "q=$GNAME" $BASE/api/groups.php | head -c 120)"
echo "search-by-uid=$(curl -s -m 60 -b "$JAR_B" -X POST -F "action=search" -F "q=$GUID" $BASE/api/groups.php | head -c 200)"
echo "join-open=$(curl -s -m 60 -b "$JAR_B" -X POST -F "action=join" -F "chat_id=$GID" $BASE/api/groups.php | head -c 120)"

echo "settings-both=$(curl -s -m 60 -b "$JAR_A" -X POST -F "action=settings" -F "chat_id=$GID" -F "search_mode=both" -F "join_mode=verify" $BASE/api/groups.php)"
echo "search-by-name-when-both=$(curl -s -m 60 -b "$JAR_B" -X POST -F "action=search" -F "q=$GNAME" $BASE/api/groups.php | head -c 120)"
echo "join-verify=$(curl -s -m 60 -b "$JAR_B" -X POST -F "action=join" -F "chat_id=$GID" $BASE/api/groups.php | head -c 120)"
echo "settings-invalid-search=$(curl -s -m 60 -b "$JAR_A" -X POST -F "action=settings" -F "chat_id=$GID" -F "search_mode=all" -F "join_mode=open" $BASE/api/groups.php)"
echo "settings-by-nontmanager=$(curl -s -m 60 -b "$JAR_B" -X POST -F "action=settings" -F "chat_id=$GID" -F "search_mode=both" -F "join_mode=open" $BASE/api/groups.php)"

ID_A=$(curl -s -m 60 -b "$JAR_A" "$BASE/api/auth.php" | jget user.id)
ID_B=$(curl -s -m 60 -b "$JAR_B" "$BASE/api/auth.php" | jget user.id)
echo "== 清理 uid=$ID_A,$ID_B =="
rclear
ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/cleanup_test_accounts.php $ID_A $ID_B" 2>/dev/null | tail -2
