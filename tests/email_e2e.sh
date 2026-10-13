#!/bin/sh
BASE=https://chat.parlz.com
D=/www/sites/chat.parlz.com/index
EMAIL=${EMAIL:-noreply@parlz.com}
USER_NAME=${USER_NAME:-uitest_mail}
PASS=parlz-mail-2026
CODE_CMD="docker exec PHP-85 php $D/tests/email_code.php"

post() {
  curl -s -m 60 -X POST "$@"
}

echo "== 1. 未配置/正常发码 =="
R1=$(post -F "action=send" -F "email=$EMAIL" -F "nickname=MailTest" $BASE/api/email.php)
echo "send=$R1"
CODE=$($CODE_CMD "$EMAIL" 2>/dev/null | tail -1)
echo "code=$CODE"

echo "== 2. 再次发码应被限流（60 秒内）=="
R2=$(post -F "action=send" -F "email=$EMAIL" $BASE/api/email.php)
echo "resend=$R2"

echo "== 3. 错误验证码注册应失败 =="
R3=$(post -F "action=register" -F "username=$USER_NAME" -F "nickname=MailTest" -F "password=$PASS" -F "email=$EMAIL" -F "code=000000" $BASE/api/auth.php)
echo "badcode=$R3"

echo "== 4. 正确验证码注册应成功 =="
R4=$(post -F "action=register" -F "username=$USER_NAME" -F "nickname=MailTest" -F "password=$PASS" -F "email=$EMAIL" -F "code=$CODE" $BASE/api/auth.php)
echo "register=$R4"

echo "== 5. 同一验证码不可复用 =="
R5=$(post -F "action=register" -F "username=${USER_NAME}b" -F "nickname=MailTestB" -F "password=$PASS" -F "email=$EMAIL" -F "code=$CODE" $BASE/api/auth.php)
echo "reuse=$R5"

echo "== 6. 邮箱是否落库 =="
docker exec PHP-85 php -r "\$p = new PDO('sqlite:$D/data/parlz.sqlite'); \$s = \$p->prepare('SELECT username, email FROM users WHERE username = ?'); \$s->execute(['$USER_NAME']); \$r = \$s->fetch(PDO::FETCH_ASSOC); echo (\$r === false ? 'missing' : \$r['username'] . ' / ' . var_export(\$r['email'], true)) . PHP_EOL;"

echo "== 7. 清理 =="
ID=$(docker exec PHP-85 php -r "\$p = new PDO('sqlite:$D/data/parlz.sqlite'); \$s = \$p->prepare('SELECT id FROM users WHERE username = ?'); \$s->execute(['$USER_NAME']); echo (string)\$s->fetchColumn();")
if [ -n "$ID" ]; then
  docker exec PHP-85 php $D/tests/cleanup_test_accounts.php "$ID"
fi
docker exec PHP-85 php -r "\$p = new PDO('sqlite:$D/data/parlz.sqlite'); \$p->prepare('DELETE FROM email_codes WHERE email = ?')->execute(['$EMAIL']); echo 'codes cleared' . PHP_EOL;"
