#!/bin/sh
BASE=https://chat.parlz.com
D=/www/sites/chat.parlz.com/index
HOST="root@120.24.78.176"
PORT=6666
export SSH_ASKPASS=${SSH_ASKPASS:-/tmp/askpass.sh}
export SSH_ASKPASS_REQUIRE=force

J_A=/tmp/gc-a.txt
J_B=/tmp/gc-b.txt
J_C=/tmp/gc-c.txt
rm -f "$J_A" "$J_B" "$J_C"

rval() {
  ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/dbval.php $1 $2" 2>/dev/null | tail -1
}

rclear() {
  ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/clear_rate.php" 2>/dev/null | tail -1
}

form() {
  curl -s -m 60 -X POST "$@"
}

getj() {
  curl -s -m 60 -b "$1" "$2"
}

json() {
  curl -s -m 60 -X POST -H 'Content-Type: application/json' "$@"
}

pick() {
  php -d error_reporting=0 -r '$d=json_decode(stream_get_contents(STDIN),true); if(!is_array($d)){echo "";return;} $p=explode(".",$argv[1]); foreach($p as $k){ if($k===""){continue;} if(is_array($d)&&isset($d[$k])){$d=$d[$k];}else{echo "";return;} } echo is_scalar($d)?(string)$d:json_encode($d,JSON_UNESCAPED_UNICODE);' "$1" 2>/dev/null
}

mkuser() {
  local jar=$1 name=$2 nick=$3 email=$4
  form -F action=send -F purpose=register -F "email=$email" -F "nickname=$nick" $BASE/api/email.php > /dev/null
  local code
  code=$(rval code "$email")
  form -c "$jar" -F action=register -F "username=$name" -F "nickname=$nick" -F "password=parlz-gcall-2026" -F "email=$email" -F "code=$code" $BASE/api/auth.php
}

befriend() {
  local jarA=$1 jarB=$2
  local code
  code=$(form -b "$jarA" -X POST -F action=face-code $BASE/api/friends.php | pick code)
  form -b "$jarB" -X POST -F action=face-join -F "code=$code" $BASE/api/friends.php | pick ok
}

echo "== 0. 清场（删掉上一轮遗留的 gc_* 账号）=="
LEFT=$(rval ids_like gc_)
if [ -n "$LEFT" ]; then
  echo "dropping: $LEFT"
  ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/cleanup_test_accounts.php $LEFT" 2>/dev/null | tail -1
fi
rclear
rval clear_codes >/dev/null

echo "== 1. 注册三个测试账号 =="
echo "A=$(mkuser $J_A gc_a GcA gcall.a@parlz.com | head -c 120)"
echo "B=$(mkuser $J_B gc_b GcB gcall.b@parlz.com | head -c 120)"
echo "C=$(mkuser $J_C gc_c GcC gcall.c@parlz.com | head -c 120)"
ID_A=$(getj $J_A $BASE/api/auth.php | pick user.id)
ID_B=$(getj $J_B $BASE/api/auth.php | pick user.id)
ID_C=$(getj $J_C $BASE/api/auth.php | pick user.id)
echo "ids=$ID_A,$ID_B,$ID_C"

echo "== 2. 互为好友并建群 =="
echo "ab=$(befriend $J_A $J_B) ac=$(befriend $J_A $J_C) bc=$(befriend $J_B $J_C)"
echo "a_friends=$(rval friends "$ID_A") b_friends=$(rval friends "$ID_B") c_friends=$(rval friends "$ID_C")"
G=$(form -b $J_A -X POST -F action=create -F "name=gcall-e2e-group" -F "member_ids[]=$ID_B" -F "member_ids[]=$ID_C" $BASE/api/groups.php)
GID=$(echo "$G" | pick chat_id)
echo "create=$G"

echo "== 3. 非群聊不能发起 =="
SELF=$(curl -s -m 60 -b $J_A "$BASE/api/chats.php" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(($d["chats"]??[]) as $c){ if($c["type"]==="self"){echo $c["id"];return;} }')
echo "dm_guard=$(form -b $J_A -X POST -F action=join -F "chat_id=$SELF" $BASE/api/groupcall.php)"

echo "== 4. A 加入 =="
R=$(form -b $J_A -X POST -F action=join -F "chat_id=$GID" $BASE/api/groupcall.php)
echo "join_a=$(echo "$R" | pick in_call) active=$(echo "$R" | pick active) members=$(echo "$R" | php -r '$d=json_decode(stream_get_contents(STDIN),true);echo count($d["members"]??[]);') max=$(echo "$R" | pick max) last=$(echo "$R" | pick last)"
AFTER_A=0

echo "== 5. B 加入，A 应收到 join 广播 =="
RB=$(form -b $J_B -X POST -F action=join -F "chat_id=$GID" $BASE/api/groupcall.php)
echo "join_b members=$(echo "$RB" | php -r '$d=json_decode(stream_get_contents(STDIN),true);echo count($d["members"]??[]);')"
PA=$(json -b $J_A -d "{\"action\":\"poll\",\"chat_id\":$GID,\"after\":0}" $BASE/api/groupcall.php)
echo "a_sees_join=$(echo "$PA" | php -r '$d=json_decode(stream_get_contents(STDIN),true); $k=array_map(fn($s)=>$s["kind"].":".$s["from"], $d["signals"]??[]); echo implode(",",$k);')"
AFTER_A=$(echo "$PA" | php -r '$d=json_decode(stream_get_contents(STDIN),true); $m=0; foreach(($d["signals"]??[]) as $s){$m=max($m,(int)$s["id"]);} echo $m;')

echo "== 6. A→B offer / B→A answer / ice 往返 =="
SA=$(json -b $J_A -d "{\"action\":\"signal\",\"chat_id\":$GID,\"to\":$ID_B,\"kind\":\"offer\",\"payload\":{\"type\":\"offer\",\"sdp\":\"v=0 fake-a\"}}" $BASE/api/groupcall.php)
echo "offer=$SA"
PB=$(json -b $J_B -d "{\"action\":\"poll\",\"chat_id\":$GID,\"after\":0}" $BASE/api/groupcall.php)
echo "b_got=$(echo "$PB" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(($d["signals"]??[]) as $s){ if($s["kind"]==="offer"){echo $s["from"]." sdp=".$s["payload"]["sdp"]; return;} } echo "none";')"
SB=$(json -b $J_B -d "{\"action\":\"signal\",\"chat_id\":$GID,\"to\":$ID_A,\"kind\":\"answer\",\"payload\":{\"type\":\"answer\",\"sdp\":\"v=0 fake-b\"}}" $BASE/api/groupcall.php)
SI=$(json -b $J_A -d "{\"action\":\"signal\",\"chat_id\":$GID,\"to\":$ID_B,\"kind\":\"ice\",\"payload\":{\"candidate\":\"candidate:1 1 udp 1 1.2.3.4 5000 typ host\",\"sdpMid\":\"0\",\"sdpMLineIndex\":0}}" $BASE/api/groupcall.php)
echo "answer=$SB ice=$SI"
PB2=$(json -b $J_B -d "{\"action\":\"poll\",\"chat_id\":$GID,\"after\":$AFTER_A}" $BASE/api/groupcall.php)
echo "b_got_after=$(echo "$PB2" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo implode(",",array_map(fn($s)=>$s["kind"], $d["signals"]??[]));')"

echo "== 7. 非法信令类型 / 发给不在通话的人 =="
echo "bad_kind=$(json -b $J_A -d "{\"action\":\"signal\",\"chat_id\":$GID,\"to\":$ID_B,\"kind\":\"zz\",\"payload\":{}}" $BASE/api/groupcall.php)"
echo "bad_to=$(json -b $J_A -d "{\"action\":\"signal\",\"chat_id\":$GID,\"to\":999999,\"kind\":\"offer\",\"payload\":{\"sdp\":\"x\"}}" $BASE/api/groupcall.php)"

echo "== 8. 静音状态广播 =="
form -b $J_A -X POST -F action=mute -F "chat_id=$GID" -F "muted=1" $BASE/api/groupcall.php > /dev/null
PC=$(json -b $J_C -d "{\"action\":\"poll\",\"chat_id\":$GID,\"after\":0}" $BASE/api/groupcall.php)
echo "c_got=$(echo "$PC" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo implode(",",array_map(fn($s)=>$s["kind"], $d["signals"]??[]));')"
echo "c_members=$(echo "$PC" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(($d["members"]??[]) as $m){ echo $m["uid"].($m["muted"]?"(静音)":"")." "; }')"

echo "== 9. 1 对 1 通话占用时不能加群通话 =="
ID_BB=$(getj $J_B $BASE/api/auth.php | pick user.id)
echo "start_1v1=$(form -b $J_C -X POST -F action=start -F "user_id=$ID_BB" -F kind=audio $BASE/api/call.php | pick ok)"
echo "c_join_blocked=$(form -b $J_C -X POST -F action=join -F "chat_id=$GID" $BASE/api/groupcall.php)"
echo "cancel_1v1=$(form -b $J_C -X POST -F action=cancel -F "id=$(getj $J_C $BASE/api/call.php | pick call.id)" $BASE/api/call.php | pick ok)"

echo "== 10. C 加入（三人同场）=="
echo "join_c=$(form -b $J_C -X POST -F action=join -F "chat_id=$GID" $BASE/api/groupcall.php | pick in_call)"

echo "== 11. B 离开：A/C 收到 bye，成员数下降 =="
form -b $J_B -X POST -F action=leave -F "chat_id=$GID" $BASE/api/groupcall.php > /dev/null
PA2=$(json -b $J_A -d "{\"action\":\"poll\",\"chat_id\":$GID,\"after\":$AFTER_A}" $BASE/api/groupcall.php)
echo "a_after_leave=$(echo "$PA2" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo "kinds=".implode(",",array_map(fn($s)=>$s["kind"], $d["signals"]??[]))." members=".count($d["members"]??[]);')"
echo "b_poll_after_leave=$(json -b $J_B -d "{\"action\":\"poll\",\"chat_id\":$GID,\"after\":0}" $BASE/api/groupcall.php | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo "in_call=".var_export($d["in_call"]??"?",true)." active=".var_export($d["active"]??"?",true);')"

echo "== 12. poll.php 的 gcalls 摘要 =="
echo "b_gcalls=$(curl -s -m 60 -b $J_B "$BASE/api/poll.php" | php -r '$d=json_decode(stream_get_contents(STDIN),true); foreach(($d["gcalls"]??[]) as $g){ echo $g["chat_id"].":".$g["members"].":in=".$g["in_call"]." "; } echo $d["gcalls"]===[]?"empty":"";')"

echo "== 13. 全部离开后通话清空 =="
form -b $J_A -X POST -F action=leave -F "chat_id=$GID" $BASE/api/groupcall.php > /dev/null
form -b $J_C -X POST -F action=leave -F "chat_id=$GID" $BASE/api/groupcall.php > /dev/null
sleep 1
echo "status_after=$(curl -s -m 60 -b $J_A "$BASE/api/groupcall.php?chat_id=$GID" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo "active=".var_export($d["active"],true)." members=".count($d["members"]??[]);')"
echo "b_gcalls_after=$(curl -s -m 60 -b $J_B "$BASE/api/poll.php" | php -r '$d=json_decode(stream_get_contents(STDIN),true); echo ($d["gcalls"]??[])===[]?"empty":"still";')"

echo "== 14. 清理 =="
rclear
ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/cleanup_test_accounts.php $ID_A $ID_B $ID_C" 2>/dev/null | tail -2
