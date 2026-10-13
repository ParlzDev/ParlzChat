#!/bin/sh
set -e
H="root@120.24.78.176"
P=6666
D="/www/sites/chat.parlz.com/index"
export SSH_ASKPASS=${SSH_ASKPASS:-/tmp/askpass.sh}
export SSH_ASKPASS_REQUIRE=force
cd "F:/AI-Project/Parlz[Chatter]"

LIST="
index.php
api/groupcall.php
api/poll.php
includes/db.php
includes/queries.php
assets/scripts/gcall.js
assets/scripts/chats.js
assets/scripts/app.js
assets/scripts/poller.js
assets/scripts/state.js
assets/scripts/icons.js
assets/style/components.css
data/schema.stamp
"

for f in $LIST; do
  scp -P $P -q "$f" "$H:$D/$f.new"
  ssh -n -p $P "$H" "mv -f $D/$f.new $D/$f" >/dev/null
  echo "OK $f"
done
echo "DONE"
