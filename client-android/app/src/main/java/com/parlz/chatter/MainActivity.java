package com.parlz.chatter;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.DownloadManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ActivityNotFoundException;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.Toast;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;

public class MainActivity extends Activity {

    private static final String PREFS = "parlz";
    private static final String KEY_SERVER = "server";
    private static final String KEY_HINT = "hint_shown";
    private static final String DEFAULT_SERVER = "https://chat.parlz.com";
    private static final int REQ_FILE = 100;
    private static final int REQ_PERMS = 101;
    private static final String NOTIFY_CHANNEL = "parlz_message";
    private static final int NOTIFY_ID = 417;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String server = DEFAULT_SERVER;
    private File saveTemp;
    private String saveName = "";
    private String saveMime = "application/octet-stream";
    private boolean errorDialogShown = false;
    private boolean pageReady = false;
    private String pendingPz = "";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#00D95F"));
        window.setNavigationBarColor(Color.parseColor("#0B2415"));

        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        server = prefs.getString(KEY_SERVER, DEFAULT_SERVER);

        web = new WebView(this);
        setContentView(web);

        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setUserAgentString(settings.getUserAgentString() + " ParlzAndroid/1.0");
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);

        CookieManager cookies = CookieManager.getInstance();
        cookies.setAcceptCookie(true);
        cookies.setAcceptThirdPartyCookies(web, false);

        web.addJavascriptInterface(new Bridge(), "ParlzAndroid");
        web.setWebViewClient(new ShellClient());
        web.setWebChromeClient(new ShellChrome());
        web.setDownloadListener(new ShellDownload());
        web.setBackgroundColor(Color.parseColor("#EEFCF4"));

        requestRuntimePermissions();

        if (!prefs.getBoolean(KEY_HINT, false)) {
            prefs.edit().putBoolean(KEY_HINT, true).apply();
            Toast.makeText(this, getString(R.string.first_hint), Toast.LENGTH_LONG).show();
        }

        load(server);
        handleLaunchIntent(getIntent());
    }

    private void requestRuntimePermissions() {
        java.util.ArrayList<String> need = new java.util.ArrayList<>();
        if (checkSelfPermission(android.Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            need.add(android.Manifest.permission.CAMERA);
        }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            need.add(android.Manifest.permission.RECORD_AUDIO);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            need.add(android.Manifest.permission.POST_NOTIFICATIONS);
        }
        if (!need.isEmpty()) {
            requestPermissions(need.toArray(new String[0]), REQ_PERMS);
        }
    }

    private void ensureNotifyChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || manager.getNotificationChannel(NOTIFY_CHANNEL) != null) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(NOTIFY_CHANNEL, "新消息", NotificationManager.IMPORTANCE_HIGH);
        channel.enableVibration(true);
        channel.setLightColor(Color.parseColor("#00D95F"));
        manager.createNotificationChannel(channel);
    }

    private void postNotify(String title, String body, int count) {
        ensureNotifyChannel();
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) {
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
            && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        Intent target = new Intent(this, MainActivity.class);
        target.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pending = PendingIntent.getActivity(this, 0, target, flags);
        Notification.Builder builder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
            ? new Notification.Builder(this, NOTIFY_CHANNEL)
            : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.sym_action_chat)
            .setContentTitle(title == null || title.isEmpty() ? "Parlz" : title)
            .setContentText(body == null ? "" : body)
            .setStyle(new Notification.BigTextStyle().bigText(body == null ? "" : body))
            .setNumber(Math.max(0, count))
            .setAutoCancel(true)
            .setWhen(System.currentTimeMillis())
            .setShowWhen(true)
            .setContentIntent(pending);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setCategory(Notification.CATEGORY_MESSAGE);
            builder.setVisibility(Notification.VISIBILITY_PRIVATE);
        }
        manager.notify(NOTIFY_ID, builder.build());
    }

    private void load(String url) {
        errorDialogShown = false;
        clearCacheIfUpdated();
        web.loadUrl(url);
    }

    private void clearCacheIfUpdated() {
        SharedPreferences prefs = getSharedPreferences("parlz.shell", Context.MODE_PRIVATE);
        String built = appVersion();
        if (built.equals(prefs.getString("cacheVersion", ""))) {
            return;
        }
        prefs.edit().putString("cacheVersion", built).apply();
        web.clearCache(true);
        web.clearFormData();
    }

    private String appVersion() {
        try {
            String name = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            return name == null || name.isEmpty() ? "0" : name;
        } catch (Exception error) {
            return "0";
        }
    }

    private void deliverPz(String raw) {
        if (raw == null || raw.isEmpty()) {
            return;
        }
        String arg = String.valueOf(org.json.JSONObject.wrap(raw));
        web.evaluateJavascript("window.ParlzPz && window.ParlzPz(" + arg + ");", null);
    }

    private void handleLaunchIntent(Intent intent) {
        if (intent == null || intent.getData() == null) {
            return;
        }
        Uri uri = intent.getData();
        if (uri.getScheme() == null || !uri.getScheme().equalsIgnoreCase("pz")) {
            return;
        }
        pendingPz = uri.toString();
        intent.setData(null);
        if (pageReady) {
            deliverPz(pendingPz);
            pendingPz = "";
        }
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleLaunchIntent(intent);
    }

    private String normalizeServer(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) {
            return "";
        }
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            return "";
        }
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private void openServerDialog() {
        EditText input = new EditText(this);
        input.setText(server);
        input.setHint(R.string.server_hint);
        input.setSingleLine(true);

        new AlertDialog.Builder(this)
            .setTitle(R.string.server_title)
            .setView(input)
            .setPositiveButton(R.string.server_save, (dialog, which) -> {
                String next = normalizeServer(input.getText().toString());
                if (next.isEmpty()) {
                    Toast.makeText(this, getString(R.string.server_bad), Toast.LENGTH_LONG).show();
                    return;
                }
                server = next;
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putString(KEY_SERVER, next).apply();
                load(next);
            })
            .setNegativeButton(R.string.server_cancel, null)
            .show();
    }

    private void onLoadFailed() {
        if (errorDialogShown) {
            return;
        }
        errorDialogShown = true;
        Toast.makeText(this, getString(R.string.server_failed), Toast.LENGTH_SHORT).show();
        openServerDialog();
    }

    private boolean isAppHost(Uri uri) {
        Uri base = Uri.parse(server);
        String host = base.getHost();
        if (host == null || uri.getHost() == null) {
            return false;
        }
        return uri.getHost().equalsIgnoreCase(host);
    }

    private void openExternal(Uri uri) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, uri.toString(), Toast.LENGTH_SHORT).show();
        }
    }

    private class ShellClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase();
            if (scheme.equals("tel") || scheme.equals("mailto") || scheme.equals("sms")) {
                openExternal(uri);
                return true;
            }
            if (scheme.equals("pz")) {
                deliverPz(uri.toString());
                return true;
            }
            return false;
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                onLoadFailed();
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            errorDialogShown = false;
            pageReady = true;
            if (!pendingPz.isEmpty()) {
                deliverPz(pendingPz);
                pendingPz = "";
            }
        }
    }

    private class ShellChrome extends WebChromeClient {
        @Override
        public void onPermissionRequest(final PermissionRequest request) {
            runOnUiThread(() -> {
                Uri origin = request.getOrigin();
                if (origin != null && isAppHost(origin)) {
                    request.grant(request.getResources());
                } else {
                    request.deny();
                }
            });
        }

        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) {
                fileCallback.onReceiveValue(null);
            }
            fileCallback = callback;
            Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            String[] acceptTypes = params.getAcceptTypes();
            if (acceptTypes != null && acceptTypes.length > 0 && !acceptTypes[0].isEmpty()) {
                intent.setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES, acceptTypes);
            } else {
                intent.setType("*/*");
            }
            intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
            try {
                startActivityForResult(Intent.createChooser(intent, "选择文件"), REQ_FILE);
            } catch (ActivityNotFoundException error) {
                fileCallback = null;
                return false;
            }
            return true;
        }
    }

    private class ShellDownload implements DownloadListener {
        @Override
        public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                return;
            }
            String name = URLUtil.guessFileName(url, contentDisposition, mimetype);
            DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
            request.setMimeType(mimetype);
            request.addRequestHeader("Cookie", CookieManager.getInstance().getCookie(url));
            request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            DownloadManager manager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            if (manager != null) {
                manager.enqueue(request);
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode != REQ_FILE) {
            super.onActivityResult(requestCode, resultCode, data);
            return;
        }
        if (fileCallback == null) {
            return;
        }
        Uri[] result = null;
        if (resultCode == RESULT_OK && data != null) {
            if (data.getClipData() != null) {
                int count = data.getClipData().getItemCount();
                result = new Uri[count];
                for (int i = 0; i < count; i++) {
                    result[i] = data.getClipData().getItemAt(i).getUri();
                }
            } else if (data.getData() != null) {
                result = new Uri[]{data.getData()};
            }
        }
        fileCallback.onReceiveValue(result);
        fileCallback = null;
    }

    private class Bridge {
        @JavascriptInterface
        public void openServerDialog() {
            runOnUiThread(MainActivity.this::openServerDialog);
        }

        @JavascriptInterface
        public void toast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }

        @JavascriptInterface
        public void notify(String title, String body, int count) {
            runOnUiThread(() -> postNotify(title, body, count));
        }

        @JavascriptInterface
        public void setBadge(int count) {
            runOnUiThread(() -> {
                NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
                if (manager != null && count <= 0) {
                    manager.cancel(NOTIFY_ID);
                }
            });
        }

        @JavascriptInterface
        public void beginSave(String name, String mime) {
            saveName = name == null || name.isEmpty() ? "parlz-file" : name.replaceAll("[\\\\/:*?\"<>|]", "_");
            saveMime = mime == null || mime.isEmpty() ? "application/octet-stream" : mime;
            saveTemp = new File(getCacheDir(), "parlz-save.tmp");
            try {
                if (saveTemp.exists() && !saveTemp.delete()) {
                    saveTemp = new File(getCacheDir(), "parlz-save-" + System.currentTimeMillis() + ".tmp");
                }
            } catch (SecurityException ignored) {
                saveTemp = new File(getCacheDir(), "parlz-save-" + System.currentTimeMillis() + ".tmp");
            }
        }

        @JavascriptInterface
        public void chunkSave(String base64Chunk) {
            if (saveTemp == null) {
                return;
            }
            try {
                byte[] bytes = Base64.decode(base64Chunk, Base64.DEFAULT);
                try (FileOutputStream out = new FileOutputStream(saveTemp, true)) {
                    out.write(bytes);
                }
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void finishSave() {
            if (saveTemp == null || !saveTemp.exists()) {
                saveTemp = null;
                return;
            }
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.Downloads.DISPLAY_NAME, saveName);
                    values.put(MediaStore.Downloads.MIME_TYPE, saveMime);
                    values.put(MediaStore.Downloads.IS_PENDING, 1);
                    ContentResolver resolver = getContentResolver();
                    Uri target = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (target == null) {
                        throw new IllegalStateException("insert failed");
                    }
                    try (OutputStream out = resolver.openOutputStream(target);
                         FileInputStream in = new FileInputStream(saveTemp)) {
                        byte[] buffer = new byte[65536];
                        int read;
                        while ((read = in.read(buffer)) > 0) {
                            out.write(buffer, 0, read);
                        }
                    }
                    values.clear();
                    values.put(MediaStore.Downloads.IS_PENDING, 0);
                    resolver.update(target, values, null, null);
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists() && !dir.mkdirs()) {
                        throw new IllegalStateException("mkdir failed");
                    }
                    File target = new File(dir, saveName);
                    try (FileInputStream in = new FileInputStream(saveTemp);
                         FileOutputStream out = new FileOutputStream(target)) {
                        byte[] buffer = new byte[65536];
                        int read;
                        while ((read = in.read(buffer)) > 0) {
                            out.write(buffer, 0, read);
                        }
                    }
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this, getString(R.string.saved_download, saveName), Toast.LENGTH_LONG).show());
            } catch (Exception error) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, getString(R.string.save_failed), Toast.LENGTH_SHORT).show());
            } finally {
                if (saveTemp != null && saveTemp.exists() && !saveTemp.delete()) {
                    saveTemp.deleteOnExit();
                }
                saveTemp = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
        }
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.onPause();
        }
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        CookieManager.getInstance().flush();
        super.onDestroy();
    }
}
