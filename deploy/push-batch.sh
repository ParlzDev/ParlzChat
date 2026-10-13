#!/bin/sh
set -e
H="root@120.24.78.176"
P=6666
D="/www/sites/chat.parlz.com/index"
export SSH_ASKPASS=/tmp/askpass.sh
export SSH_ASKPASS_REQUIRE=force
cd "F:/AI-Project/Parlz[Chatter]"

LIST="
api/auth.php
api/email.php
api/friends.php
api/groups.php
api/profile.php
api/stt.php
api/users.php
assets/scripts/app.js
assets/scripts/auth.js
assets/scripts/chats.js
assets/scripts/composer.js
assets/scripts/contacts.js
assets/scripts/contextmenu.js
assets/scripts/cut.js
assets/scripts/drawer.js
assets/scripts/icons.js
assets/scripts/level.js
assets/scripts/messages.js
assets/scripts/moments.js
assets/scripts/preview.js
assets/scripts/profile.js
assets/scripts/qr.js
assets/scripts/scanner.js
assets/scripts/search.js
assets/scripts/settings.js
assets/scripts/util.js
assets/style/auth.css
assets/style/base.css
assets/style/components.css
assets/style/layout.css
config.php
includes/bootstrap.php
includes/db.php
includes/email.php
includes/mail.php
includes/queries.php
includes/stt.php
index.php
proxy.php
data/schema.stamp
"

for f in $LIST; do
  scp -P $P -q "$f" "$H:$D/$f.new"
  ssh -n -p $P "$H" "mv -f $D/$f.new $D/$f" >/dev/null
  echo "OK $f"
done

ssh -n -p $P "$H" "if [ -f $D/cut.php ]; then mv -f $D/cut.php $D/cut.php.removed; fi"
echo "DONE"
