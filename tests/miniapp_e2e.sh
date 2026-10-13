#!/bin/sh
BASE=https://chat.parlz.com
D=/www/sites/chat.parlz.com/index
JAR=/tmp/mini.txt
rm -f "$JAR"
EMAIL=mini.a@parlz.com
CODE_CMD="docker exec PHP-85 php $D/tests/email_code.php"

curl -s -m 60 -X POST -F "action=send" -F "email=$EMAIL" -F "nickname=MiniDev" $BASE/api/email.php > /dev/null
sleep 1
CODE=$($CODE_CMD "$EMAIL" 2>/dev/null | tail -1)
REG=$(curl -s -c "$JAR" -X POST -F "action=register" -F "username=mini_dev" -F "nickname=MiniDev" -F "password=parlz-mini-2026" -F "email=$EMAIL" -F "code=$CODE" $BASE/api/auth.php)
echo "register=$(echo "$REG" | head -c 90)"
UID_ME=$(curl -s -b "$JAR" $BASE/api/auth.php | python3 -c "import json,sys; print((json.load(sys.stdin).get('user') or {}).get('id',''))")

echo "== 保存草稿（含恶意注入与 PPHP）=="
SAVE=$(curl -s -b "$JAR" -X POST \
  -F "action=save" -F "name=测试小程序" -F "icon=🧪" -F "brief=端到端测试" \
  --form-string 'file_phtml=<div class="card"><h2>{{ greeting }}</h2><p>{{ me.nickname }}</p><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">x</a><div data-act="hi">按钮</div></div>' \
  --form-string 'file_pcss=.card { padding: 12px; background: url(https://evil.test/x.png); }' \
  --form-string 'file_pjs=document.addEventListener("click", function(){ parlz.toast("hi " + fetch); });' \
  --form-string 'file_pphp=$greeting = "你好 " . strtoupper("parlz");' \
  $BASE/api/miniapp.php)
echo "$SAVE" | head -c 120; echo
ID=$(echo "$SAVE" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")

echo "== 提交审核 =="
curl -s -b "$JAR" -X POST -F "action=submit" -F "id=$ID" $BASE/api/miniapp.php | head -c 90; echo

echo "== 审核通过（直接改库模拟管理员）=="
docker exec PHP-85 php -r "\$p = new PDO('sqlite:$D/data/parlz.sqlite'); \$p->prepare('UPDATE mini_apps SET status = ? WHERE id = ?')->execute(['approved', $ID]); echo 'approved' . PHP_EOL;"

echo "== 运行页（检查净化 + PPHP 输出）=="
curl -s -b "$JAR" "$BASE/miniapp-run.php?id=$ID" > /tmp/mini-run.html
printf "contain pphtOut=%s script=%s onerror=%s javascript=%s url-evil=%s fetch=%s csp=%s\n" \
  "$(grep -c '你好 PARLZ' /tmp/mini-run.html)" \
  "$(grep -c '<script>alert' /tmp/mini-run.html)" \
  "$(grep -c 'onerror' /tmp/mini-run.html)" \
  "$(grep -c 'javascript:alert' /tmp/mini-run.html)" \
  "$(grep -c 'evil.test' /tmp/mini-run.html)" \
  "$(grep -c 'fetch' /tmp/mini-run.html)" \
  "$(grep -c 'Content-Security-Policy' /tmp/mini-run.html)"

echo "== 列表可见性 =="
curl -s -b "$JAR" "$BASE/api/miniapp.php?action=list" | python3 -c "import json,sys; d=json.load(sys.stdin); print('apps=', [(a['name'], a['status']) for a in (d.get('apps') or [])], 'admin=', d.get('is_admin'))"

echo "== 清理 =="
docker exec PHP-85 php -r "\$p = new PDO('sqlite:$D/data/parlz.sqlite'); \$p->prepare('DELETE FROM mini_files WHERE app_id = ?')->execute([$ID]); \$p->prepare('DELETE FROM mini_apps WHERE id = ?')->execute([$ID]); echo 'app cleared' . PHP_EOL;"
docker exec PHP-85 php $D/tests/cleanup_test_accounts.php "$UID_ME"
