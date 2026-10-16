package com.parlz.chatter;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.os.Build;
import android.os.IBinder;
import android.webkit.CookieManager;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

public class PushService extends Service {
    private static final String PREFS = "parlz.shell";
    private static final String KEY_SERVER = "server";
    private static final String FALLBACK_SERVER = "https://chat.parlz.com";
    private static final String CHANNEL_RUN = "parlz-run";
    private static final String CHANNEL_MSG = "parlz-msg";
    private static final int ID_RUN = 1;
    private static final int ID_MSG = 2;

    private volatile boolean running = false;
    private Thread worker;

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && "stop".equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        ensureChannels();
        startForeground(ID_RUN, runNotice());
        if (!running) {
            running = true;
            worker = new Thread(this::loop);
            worker.start();
        }
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        running = false;
        if (worker != null) {
            worker.interrupt();
            worker = null;
        }
        super.onDestroy();
    }

    private void ensureChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }
        if (manager.getNotificationChannel(CHANNEL_RUN) == null) {
            NotificationChannel run = new NotificationChannel(CHANNEL_RUN, "后台运行", NotificationManager.IMPORTANCE_MIN);
            run.setShowBadge(false);
            manager.createNotificationChannel(run);
        }
        if (manager.getNotificationChannel(CHANNEL_MSG) == null) {
            NotificationChannel msg = new NotificationChannel(CHANNEL_MSG, "新消息", NotificationManager.IMPORTANCE_HIGH);
            msg.enableVibration(true);
            msg.setLightColor(Color.parseColor("#00D95F"));
            manager.createNotificationChannel(msg);
        }
    }

    private Notification runNotice() {
        Intent target = new Intent(this, MainActivity.class);
        target.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getActivity(this, 0, target, flags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_RUN)
            : new Notification.Builder(this);
        builder.setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Parlz")
            .setContentText("正在后台收消息")
            .setOngoing(true)
            .setShowWhen(false)
            .setContentIntent(pending);
        return builder.build();
    }

    private void postMessage(String title, String body, int count, int chatId) {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            return;
        }
        Intent target = new Intent(this, MainActivity.class);
        target.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if (chatId > 0) {
            target.putExtra("chat_id", chatId);
        }
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getActivity(this, chatId > 0 ? chatId : 0, target, flags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, CHANNEL_MSG)
            : new Notification.Builder(this);
        builder.setSmallIcon(R.mipmap.ic_launcher)
            .setLargeIcon(BitmapFactory.decodeResource(getResources(), R.mipmap.ic_launcher))
            .setContentTitle(title == null || title.isEmpty() ? "Parlz" : title)
            .setContentText(body == null ? "" : body)
            .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
            .setNumber(Math.max(1, count))
            .setAutoCancel(true)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setContentIntent(pending);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setCategory(Notification.CATEGORY_MESSAGE);
            builder.setVisibility(Notification.VISIBILITY_PRIVATE);
        }
        manager.notify(ID_MSG, builder.build());
    }

    private void loop() {
        long since = 0;
        while (running) {
            try {
                SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
                String server = prefs.getString(KEY_SERVER, FALLBACK_SERVER);
                String cookie = CookieManager.getInstance().getCookie(server);
                if (cookie == null || cookie.isEmpty()) {
                    Thread.sleep(5000);
                    continue;
                }
                URL url = new URL(server + "/api/wait.php?since=" + since + "&wait=50");
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestProperty("Cookie", cookie);
                conn.setConnectTimeout(10000);
                conn.setReadTimeout(70000);
                int code = conn.getResponseCode();
                if (code != 200) {
                    conn.disconnect();
                    Thread.sleep(5000);
                    continue;
                }
                StringBuilder text = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), "UTF-8"))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        text.append(line);
                    }
                }
                conn.disconnect();
                JSONObject data = new JSONObject(text.toString());
                long id = data.optLong("id", since);
                int unread = data.optInt("unread", 0);
                JSONObject preview = data.optJSONObject("preview");
                if (id > since) {
                    since = id;
                    if (preview != null) {
                        String title = preview.optString("title", "Parlz");
                        String sender = preview.optString("sender", "");
                        String body = preview.optString("body", "");
                        String head = sender.isEmpty() || sender.equals(title) ? title : title + " · " + sender;
                        postMessage(head, body, unread, preview.optInt("chat_id", 0));
                    } else {
                        postMessage("Parlz", "有 " + Math.max(1, unread) + " 条新消息", unread, 0);
                    }
                }
            } catch (InterruptedException stop) {
                break;
            } catch (Exception error) {
                try {
                    Thread.sleep(5000);
                } catch (InterruptedException stop) {
                    break;
                }
            }
        }
    }
}
