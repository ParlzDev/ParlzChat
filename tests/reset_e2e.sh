#!/bin/sh
BASE=https://chat.parlz.com
D=/www/sites/chat.parlz.com/index
HOST="root@120.24.78.176"
PORT=6666
EMAIL=${EMAIL:-noreply@parlz.com}
NEWEMAIL=${NEWEMAIL:-rebind-probe@parlz.com}
USER_NAME=${USER_NAME:-uitest_pw}
PASS_OLD=parlz-old-2026
PASS_NEW=parlz-new-2026
export SSH_ASKPASS=${SSH_ASKPASS:-/tmp/askpass.sh}
export SSH_ASKPASS_REQUIRE=force

rval() {
  ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/dbval.php $1 $2" 2>/dev/null | tail -1
}

rclear() {
  ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/clear_rate.php" 2>/dev/null | tail -1
}

post() {
  curl -s -m 60 -X POST "$@"
}

echo "== 0. 前置：该邮箱已绑定的账号 =="
echo "users_at_email=$(rval users_by_email "$EMAIL")"
rclear
rval clear_codes >/dev/null

echo "== 1. 发注册验证码 =="
echo "send_register=$(post -F action=send -F purpose=register -F "email=$EMAIL" -F nickname=PWTest $BASE/api/email.php)"
echo "register_sent_to=$EMAIL"

echo "== 2. 等待邮件落库并取码 =="
CODE=$(rval code "$EMAIL")
echo "code_register=$CODE"

echo "== 3. 注册测试账号 =="
echo "register=$(post -F action=register -F "username=$USER_NAME" -F nickname=PWTest -F "password=$PASS_OLD" -F "email=$EMAIL" -F "code=$CODE" $BASE/api/auth.php)"

echo "== 4. 未注册邮箱发重置码应失败 =="
echo "reset_unknown=$(post -F action=send -F purpose=reset -F email=nobody-at-all-zz@parlz.com $BASE/api/email.php)"

rclear
echo "== 5. 发重置验证码 =="
echo "send_reset=$(post -F action=send -F purpose=reset -F "email=$EMAIL" $BASE/api/email.php)"
RCODE=$(rval code "$EMAIL")
echo "code_reset=$RCODE"

echo "== 6. 错误重置码应失败（判据要变红）=="
echo "bad_reset=$(post -F action=reset -F "email=$EMAIL" -F code=000000 -F "password=$PASS_NEW" $BASE/api/auth.php)"

echo "== 7. 正确重置码 =="
echo "reset=$(post -F action=reset -F "email=$EMAIL" -F "code=$RCODE" -F "password=$PASS_NEW" $BASE/api/auth.php)"

echo "== 8. 旧密码登录应失败 =="
echo "old_login=$(post -c /tmp/pwjar -F action=login -F "username=$USER_NAME" -F "password=$PASS_OLD" $BASE/api/auth.php)"

echo "== 9. 新密码登录应成功 =="
echo "new_login=$(post -b /tmp/pwjar -c /tmp/pwjar -F action=login -F "username=$USER_NAME" -F "password=$PASS_NEW" $BASE/api/auth.php)"

echo "== 10. 换绑邮箱 =="
rclear
echo "send_rebind=$(post -b /tmp/pwjar -c /tmp/pwjar -F action=send -F purpose=rebind -F "email=$NEWEMAIL" $BASE/api/email.php)"
BCODE=$(rval code "$NEWEMAIL")
echo "code_rebind=$BCODE"
echo "rebind=$(post -b /tmp/pwjar -c /tmp/pwjar -F action=email -F "email=$NEWEMAIL" -F "code=$BCODE" $BASE/api/profile.php)"
echo "email_now=$(rval user_email "$USER_NAME")"

ID=$(rval uid "$USER_NAME")
echo "== 11. 重置后设备会话应被清空 =="
echo "uid=$ID devices=$(rval device_count "$ID")"
rclear

echo "== 12. 清理 =="
if [ -n "$ID" ]; then
  ssh -n -p $PORT "$HOST" "docker exec PHP-85 php $D/tests/cleanup_test_accounts.php $ID" 2>/dev/null | tail -2
fi
rval clear_codes >/dev/null
echo "DONE"
