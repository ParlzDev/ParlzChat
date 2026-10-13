#include <gtk/gtk.h>
#include <webkit2/webkit2.h>
#include <jsc/jsc.h>
#include <stdlib.h>
#include <string.h>

#if defined(__has_include)
#if __has_include(<webkit2/WebKitNetworkSession.h>)
#include <webkit2/WebKitNetworkSession.h>
#define PARLZ_WEBKIT_SESSION 1
#endif
#endif

#define PARLZ_DEFAULT_SERVER "https://chat.parlz.com"

static const gchar *BRIDGE_SCRIPT =
    "window.ParlzLinux = {"
    "beginSave: function (name, mime) { window.webkit.messageHandlers.parlz.postMessage({ cmd: 'beginSave', name: String(name || ''), mime: String(mime || '') }); },"
    "chunkSave: function (data) { window.webkit.messageHandlers.parlz.postMessage({ cmd: 'chunkSave', data: String(data || '') }); },"
    "finishSave: function () { window.webkit.messageHandlers.parlz.postMessage({ cmd: 'finishSave' }); },"
    "openServerDialog: function () { window.webkit.messageHandlers.parlz.postMessage({ cmd: 'server' }); }"
    "};";

static gchar *g_server = NULL;
static gchar *g_pending_pz = NULL;
static guint g_windows = 0;
static gboolean g_downloads_wired = FALSE;

typedef struct {
    WebKitWebView *web;
    gchar *save_path;
    GFileOutputStream *save_stream;
} ParlzView;

static gchar *config_path(void)
{
    return g_build_filename(g_get_user_config_dir(), "parlz", "server", NULL);
}

static gboolean valid_server(const gchar *value)
{
    return value != NULL && (g_str_has_prefix(value, "http://") || g_str_has_prefix(value, "https://"));
}

static gchar *trim_server(gchar *value)
{
    g_strstrip(value);
    for (gsize n = strlen(value); n > 0 && value[n - 1] == '/'; n--) {
        value[n - 1] = '\0';
    }
    return value;
}

static gchar *stored_server(void)
{
    gchar *path = config_path();
    gchar *text = NULL;
    if (g_file_get_contents(path, &text, NULL, NULL)) {
        trim_server(text);
        if (valid_server(text)) {
            g_free(path);
            return text;
        }
        g_free(text);
    }
    g_free(path);
    return NULL;
}

static void store_server(const gchar *value)
{
    gchar *path = config_path();
    gchar *dir = g_path_get_dirname(path);
    g_mkdir_with_parents(dir, 0700);
    g_file_set_contents(path, value, -1, NULL);
    g_free(dir);
    g_free(path);
}

static gchar *resolve_server(int argc, char **argv)
{
    for (int i = 1; i < argc; i++) {
        if (g_str_has_prefix(argv[i], "--server=")) {
            gchar *value = g_strdup(argv[i] + 9);
            trim_server(value);
            if (value[0] != '\0') {
                return value;
            }
            g_free(value);
        } else if (valid_server(argv[i])) {
            return trim_server(g_strdup(argv[i]));
        }
    }
    gchar *saved = stored_server();
    if (saved != NULL) {
        return saved;
    }
    return g_strdup(PARLZ_DEFAULT_SERVER);
}

static gchar *json_field(const gchar *json, const gchar *key)
{
    gchar *needle = g_strdup_printf("\"%s\":", key);
    const gchar *at = strstr(json, needle);
    g_free(needle);
    if (at == NULL) {
        return NULL;
    }
    at += strlen(key) + 3;
    while (*at == ' ') {
        at++;
    }
    if (*at != '"') {
        return NULL;
    }
    at++;
    GString *out = g_string_new(NULL);
    for (const gchar *p = at; *p != '\0' && *p != '"'; p++) {
        if (*p != '\\' || *(p + 1) == '\0') {
            g_string_append_c(out, *p);
            continue;
        }
        p++;
        if (*p == 'n') {
            g_string_append_c(out, '\n');
        } else if (*p == 't') {
            g_string_append_c(out, '\t');
        } else if (*p == 'r') {
            g_string_append_c(out, '\r');
        } else if (*p == 'u' && g_ascii_isxdigit(p[1]) && g_ascii_isxdigit(p[2])
                   && g_ascii_isxdigit(p[3]) && g_ascii_isxdigit(p[4])) {
            gchar code[5] = { p[1], p[2], p[3], p[4], '\0' };
            gchar utf8[7];
            gint written = g_unichar_to_utf8((gunichar)strtoul(code, NULL, 16), utf8);
            g_string_append_len(out, utf8, written);
            p += 4;
        } else {
            g_string_append_c(out, *p);
        }
    }
    return g_string_free(out, FALSE);
}

static GtkWindow *parent_window(WebKitWebView *web)
{
    GtkWidget *toplevel = gtk_widget_get_toplevel(GTK_WIDGET(web));
    return GTK_IS_WINDOW(toplevel) ? GTK_WINDOW(toplevel) : NULL;
}

static void message_dialog(GtkWindow *parent, const gchar *text)
{
    GtkWidget *dialog = gtk_message_dialog_new(parent, GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
                                               GTK_MESSAGE_INFO, GTK_BUTTONS_OK, "%s", text);
    gtk_window_set_title(GTK_WINDOW(dialog), "Parlz");
    gtk_dialog_run(GTK_DIALOG(dialog));
    gtk_widget_destroy(dialog);
}

static gchar *download_dir(void)
{
    const gchar *dir = g_get_user_special_dir(G_USER_DIRECTORY_DOWNLOAD);
    if (dir == NULL) {
        dir = g_get_home_dir();
    }
    return g_strdup(dir);
}

static gchar *safe_name(const gchar *name)
{
    gchar *clean = g_strdup(name != NULL && name[0] != '\0' ? name : "parlz-file");
    for (gchar *p = clean; *p != '\0'; p++) {
        if (strchr("/\\:*?\"<>|", *p) != NULL) {
            *p = '_';
        }
    }
    return clean;
}

static void close_save(ParlzView *view)
{
    if (view->save_stream != NULL) {
        g_output_stream_close(G_OUTPUT_STREAM(view->save_stream), NULL, NULL);
        g_object_unref(view->save_stream);
        view->save_stream = NULL;
    }
}

static void begin_save(ParlzView *view, const gchar *name)
{
    close_save(view);
    g_free(view->save_path);
    gchar *clean = safe_name(name);
    gchar *dir = download_dir();
    view->save_path = g_build_filename(dir, clean, NULL);
    g_free(dir);
    g_free(clean);
    GFile *file = g_file_new_for_path(view->save_path);
    view->save_stream = g_file_replace(file, NULL, FALSE, G_FILE_CREATE_NONE, NULL, NULL);
    g_object_unref(file);
}

static void append_chunk(ParlzView *view, const gchar *data)
{
    if (view->save_stream == NULL || data == NULL || data[0] == '\0') {
        return;
    }
    gsize length = 0;
    guchar *bytes = g_base64_decode(data, &length);
    if (bytes != NULL && length > 0) {
        g_output_stream_write_all(G_OUTPUT_STREAM(view->save_stream), bytes, length, NULL, NULL, NULL);
    }
    g_free(bytes);
}

static void finish_save(ParlzView *view)
{
    if (view->save_stream == NULL) {
        return;
    }
    close_save(view);
    gchar *text = g_strdup_printf("已保存到 %s", view->save_path);
    message_dialog(parent_window(view->web), text);
    g_free(text);
    g_free(view->save_path);
    view->save_path = NULL;
}

static void prompt_server(ParlzView *view)
{
    GtkWidget *dialog = gtk_dialog_new_with_buttons("切换服务器", parent_window(view->web),
                                                    GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
                                                    "取消", GTK_RESPONSE_CANCEL, "保存并刷新", GTK_RESPONSE_OK, NULL);
    GtkWidget *area = gtk_dialog_get_content_area(GTK_DIALOG(dialog));
    GtkWidget *entry = gtk_entry_new();
    gtk_entry_set_text(GTK_ENTRY(entry), g_server);
    gtk_entry_set_placeholder_text(GTK_ENTRY(entry), PARLZ_DEFAULT_SERVER);
    gtk_container_add(GTK_CONTAINER(area), entry);
    gtk_widget_show_all(dialog);

    if (gtk_dialog_run(GTK_DIALOG(dialog)) == GTK_RESPONSE_OK) {
        gchar *next = g_strdup(gtk_entry_get_text(GTK_ENTRY(entry)));
        trim_server(next);
        if (!valid_server(next)) {
            message_dialog(parent_window(view->web), "地址要以 http:// 或 https:// 开头");
            g_free(next);
        } else {
            g_free(g_server);
            g_server = next;
            store_server(g_server);
            webkit_web_view_load_uri(view->web, g_server);
        }
    }
    gtk_widget_destroy(dialog);
}

static void handle_message(ParlzView *view, JSCValue *value)
{
    gchar *json = jsc_value_to_json(value, 0);
    if (json == NULL) {
        return;
    }
    gchar *cmd = json_field(json, "cmd");
    if (g_strcmp0(cmd, "beginSave") == 0) {
        gchar *name = json_field(json, "name");
        begin_save(view, name);
        g_free(name);
    } else if (g_strcmp0(cmd, "chunkSave") == 0) {
        gchar *data = json_field(json, "data");
        append_chunk(view, data);
        g_free(data);
    } else if (g_strcmp0(cmd, "finishSave") == 0) {
        finish_save(view);
    } else if (g_strcmp0(cmd, "server") == 0) {
        prompt_server(view);
    }
    g_free(cmd);
    g_free(json);
}

#if WEBKIT_CHECK_VERSION(2, 40, 0)
static void on_script_message(WebKitUserContentManager *manager, JSCValue *value, gpointer user_data)
{
    (void)manager;
    handle_message((ParlzView *)user_data, value);
}
#else
static void on_script_message(WebKitUserContentManager *manager, WebKitJavascriptResult *result, gpointer user_data)
{
    (void)manager;
    handle_message((ParlzView *)user_data, webkit_javascript_result_get_js_value(result));
}
#endif

static gboolean is_system_scheme(const gchar *uri)
{
    gchar *scheme = g_uri_parse_scheme(uri);
    if (scheme == NULL) {
        return FALSE;
    }
    gboolean system = g_ascii_strcasecmp(scheme, "tel") == 0
        || g_ascii_strcasecmp(scheme, "mailto") == 0
        || g_ascii_strcasecmp(scheme, "sms") == 0;
    g_free(scheme);
    return system;
}

static gboolean is_pz_uri(const gchar *uri)
{
    if (uri == NULL) {
        return FALSE;
    }
    gchar *scheme = g_uri_parse_scheme(uri);
    if (scheme == NULL) {
        return FALSE;
    }
    gboolean pz = g_ascii_strcasecmp(scheme, "pz") == 0;
    g_free(scheme);
    return pz;
}

static void deliver_pz(WebKitWebView *web, const gchar *uri)
{
    if (web == NULL || uri == NULL || *uri == '\0') {
        return;
    }
    gchar *safe = g_strescape(uri, NULL);
    gchar *js = g_strdup_printf("window.ParlzPz && window.ParlzPz(\"%s\");", safe);
    g_free(safe);
#if WEBKIT_CHECK_VERSION(2, 40, 0)
    webkit_web_view_evaluate_javascript(web, js, -1, NULL, NULL, NULL, NULL, NULL);
#else
    webkit_web_view_run_javascript(web, js, NULL, NULL, NULL);
#endif
    g_free(js);
}

static void flush_pending_pz(WebKitWebView *web)
{
    if (g_pending_pz == NULL) {
        return;
    }
    deliver_pz(web, g_pending_pz);
    g_clear_pointer(&g_pending_pz, g_free);
}

static void on_load_changed(WebKitWebView *web, WebKitLoadEvent event, gpointer user_data)
{
    (void)user_data;
    if (event == WEBKIT_LOAD_FINISHED) {
        flush_pending_pz(web);
    }
}

static gboolean on_decide_policy(WebKitWebView *web, WebKitPolicyDecision *decision, WebKitPolicyDecisionType type, gpointer user_data)
{
    (void)user_data;
    if (type != WEBKIT_POLICY_DECISION_TYPE_NAVIGATION_ACTION) {
        return FALSE;
    }
    WebKitNavigationAction *action = webkit_navigation_policy_decision_get_navigation_action(WEBKIT_NAVIGATION_POLICY_DECISION(decision));
    WebKitURIRequest *request = webkit_navigation_action_get_request(action);
    const gchar *uri = webkit_uri_request_get_uri(request);
    if (is_pz_uri(uri)) {
        deliver_pz(web, uri);
        webkit_policy_decision_ignore(decision);
        return TRUE;
    }
    if (uri == NULL || !is_system_scheme(uri)) {
        return FALSE;
    }
    gtk_show_uri_on_window(parent_window(web), uri, GDK_CURRENT_TIME, NULL);
    webkit_policy_decision_ignore(decision);
    return TRUE;
}

static gboolean on_permission_request(WebKitWebView *web, WebKitPermissionRequest *request, gpointer user_data)
{
    (void)web;
    (void)user_data;
    if (WEBKIT_IS_USER_MEDIA_PERMISSION_REQUEST(request)) {
        webkit_permission_request_allow(request);
        return TRUE;
    }
    return FALSE;
}

static gboolean on_script_dialog(WebKitWebView *web, WebKitScriptDialog *dialog, gpointer user_data)
{
    (void)user_data;
    const gchar *message = webkit_script_dialog_get_message(dialog);
    WebKitScriptDialogType type = webkit_script_dialog_get_dialog_type(dialog);
    if (type == WEBKIT_SCRIPT_DIALOG_ALERT) {
        message_dialog(parent_window(web), message);
        return TRUE;
    }
    if (type == WEBKIT_SCRIPT_DIALOG_CONFIRM) {
        GtkWidget *box = gtk_message_dialog_new(parent_window(web), GTK_DIALOG_MODAL | GTK_DIALOG_DESTROY_WITH_PARENT,
                                                GTK_MESSAGE_QUESTION, GTK_BUTTONS_NONE, "%s", message);
        gtk_window_set_title(GTK_WINDOW(box), "Parlz");
        gtk_dialog_add_button(GTK_DIALOG(box), "取消", GTK_RESPONSE_CANCEL);
        gtk_dialog_add_button(GTK_DIALOG(box), "确定", GTK_RESPONSE_OK);
        gint answer = gtk_dialog_run(GTK_DIALOG(box));
        gtk_widget_destroy(box);
        webkit_script_dialog_confirm_set_confirmed(dialog, answer == GTK_RESPONSE_OK);
        return TRUE;
    }
    return FALSE;
}

static gboolean on_decide_destination(WebKitDownload *download, gchar *suggested, gpointer user_data)
{
    (void)user_data;
    gchar *clean = safe_name(suggested);
    gchar *dir = download_dir();
    gchar *path = g_build_filename(dir, clean, NULL);
    gchar *uri = g_filename_to_uri(path, NULL, NULL);
    webkit_download_set_destination(download, uri);
    g_free(uri);
    g_free(path);
    g_free(dir);
    g_free(clean);
    return TRUE;
}

static void on_download_finished(WebKitDownload *download, gpointer user_data)
{
    (void)user_data;
    const gchar *path = webkit_download_get_destination(download);
    gchar *text = g_strdup_printf("已保存到 %s", path != NULL ? path : "下载目录");
    GtkWindow *parent = NULL;
    GList *windows = gtk_window_list_toplevels();
    for (GList *item = windows; item != NULL; item = item->next) {
        if (gtk_widget_is_visible(GTK_WIDGET(item->data))) {
            parent = GTK_WINDOW(item->data);
            break;
        }
    }
    g_list_free(windows);
    message_dialog(parent, text);
    g_free(text);
}

static void on_download_failed(WebKitDownload *download, GError *error, gpointer user_data)
{
    (void)download;
    (void)error;
    (void)user_data;
}

static void attach_download_handlers(WebKitDownload *download)
{
    g_signal_connect(download, "decide-destination", G_CALLBACK(on_decide_destination), NULL);
    g_signal_connect(download, "finished", G_CALLBACK(on_download_finished), NULL);
    g_signal_connect(download, "failed", G_CALLBACK(on_download_failed), NULL);
}

static void on_download_started(gpointer source, WebKitDownload *download, gpointer user_data)
{
    (void)source;
    (void)user_data;
    attach_download_handlers(download);
}

static void wire_downloads(WebKitWebView *web)
{
    if (g_downloads_wired) {
        return;
    }
    g_downloads_wired = TRUE;
#ifdef PARLZ_WEBKIT_SESSION
    g_signal_connect(webkit_web_view_get_network_session(web), "download-started", G_CALLBACK(on_download_started), NULL);
#else
    (void)web;
    g_signal_connect(webkit_web_context_get_default(), "download-started", G_CALLBACK(on_download_started), NULL);
#endif
}

static gboolean toggle_fullscreen(GtkWindow *window)
{
    if ((gdk_window_get_state(gtk_widget_get_window(GTK_WIDGET(window))) & GDK_WINDOW_STATE_FULLSCREEN) != 0) {
        gtk_window_unfullscreen(window);
    } else {
        gtk_window_fullscreen(window);
    }
    return TRUE;
}

static gboolean on_key_press(GtkWidget *widget, GdkEventKey *event, gpointer user_data)
{
    ParlzView *view = (ParlzView *)user_data;
    GtkWidget *toplevel = gtk_widget_get_toplevel(widget);
    GtkWindow *window = GTK_IS_WINDOW(toplevel) ? GTK_WINDOW(toplevel) : NULL;
    GdkWindow *area = gtk_widget_get_window(GTK_WIDGET(view->web));
    gboolean fullscreen = area != NULL && (gdk_window_get_state(area) & GDK_WINDOW_STATE_FULLSCREEN) != 0;

    if (event->keyval == GDK_KEY_F5) {
        webkit_web_view_reload_bypass_cache(view->web);
        return TRUE;
    }
    if (event->keyval == GDK_KEY_F11) {
        return window != NULL ? toggle_fullscreen(window) : FALSE;
    }
    if (event->keyval == GDK_KEY_Escape && fullscreen) {
        gtk_window_unfullscreen(window);
        return TRUE;
    }
    if ((event->state & GDK_CONTROL_MASK) == 0) {
        return FALSE;
    }
    switch (event->keyval) {
        case GDK_KEY_r:
            webkit_web_view_reload_bypass_cache(view->web);
            return TRUE;
        case GDK_KEY_k:
            prompt_server(view);
            return TRUE;
        case GDK_KEY_q:
        case GDK_KEY_w:
            if (window != NULL) {
                gtk_widget_destroy(GTK_WIDGET(window));
            }
            return TRUE;
        case GDK_KEY_plus:
        case GDK_KEY_equal:
            webkit_web_view_set_zoom_level(view->web, webkit_web_view_get_zoom_level(view->web) + 0.1);
            return TRUE;
        case GDK_KEY_minus:
            webkit_web_view_set_zoom_level(view->web, webkit_web_view_get_zoom_level(view->web) - 0.1);
            return TRUE;
        case GDK_KEY_0:
            webkit_web_view_set_zoom_level(view->web, 1.0);
            return TRUE;
        default:
            return FALSE;
    }
}

static void on_view_destroyed(GtkWidget *widget, gpointer user_data)
{
    (void)widget;
    ParlzView *view = (ParlzView *)user_data;
    close_save(view);
    g_free(view->save_path);
    g_free(view);
    if (g_windows > 0) {
        g_windows--;
    }
    if (g_windows == 0) {
        gtk_main_quit();
    }
}

static void open_window(const gchar *uri)
{
    ParlzView *view = g_new0(ParlzView, 1);

    WebKitUserContentManager *manager = webkit_user_content_manager_new();
    webkit_user_content_manager_register_script_message_handler(manager, "parlz");
    g_signal_connect(manager, "script-message-received::parlz", G_CALLBACK(on_script_message), view);
    WebKitUserScript *script = webkit_user_script_new(BRIDGE_SCRIPT, WEBKIT_USER_CONTENT_INJECT_ALL_FRAMES,
                                                      WEBKIT_USER_SCRIPT_INJECT_AT_DOCUMENT_START, NULL, NULL);
    webkit_user_content_manager_add_script(manager, script);
    webkit_user_script_unref(script);

    GtkWidget *web = webkit_web_view_new_with_user_content_manager(manager);
    view->web = WEBKIT_WEB_VIEW(web);

    WebKitSettings *settings = webkit_web_view_get_settings(view->web);
    webkit_settings_set_enable_javascript(settings, TRUE);
    webkit_settings_set_enable_media_stream(settings, TRUE);
    webkit_settings_set_enable_mediasource(settings, TRUE);
    webkit_settings_set_enable_webrtc(settings, TRUE);
    webkit_settings_set_media_playback_requires_user_gesture(settings, FALSE);
    webkit_settings_set_javascript_can_open_windows_automatically(settings, TRUE);
    webkit_settings_set_enable_developer_extras(settings, FALSE);
    webkit_settings_set_enable_smooth_scrolling(settings, TRUE);

    GdkRGBA background;
    gdk_rgba_parse(&background, "#EEFCF4");
    webkit_web_view_set_background_color(view->web, &background);

    g_signal_connect(view->web, "decide-policy", G_CALLBACK(on_decide_policy), NULL);
    g_signal_connect(view->web, "load-changed", G_CALLBACK(on_load_changed), NULL);
    g_signal_connect(view->web, "permission-request", G_CALLBACK(on_permission_request), NULL);
    g_signal_connect(view->web, "script-dialog", G_CALLBACK(on_script_dialog), NULL);

    wire_downloads(view->web);

    GtkWidget *window = gtk_window_new(GTK_WINDOW_TOPLEVEL);
    gtk_window_set_title(GTK_WINDOW(window), "Parlz");
    gtk_window_set_default_size(GTK_WINDOW(window), 1180, 780);
    gtk_window_set_icon_name(GTK_WINDOW(window), "parlz");
    GdkGeometry geometry;
    memset(&geometry, 0, sizeof(geometry));
    geometry.min_width = 880;
    geometry.min_height = 620;
    gtk_window_set_geometry_hints(GTK_WINDOW(window), NULL, &geometry, GDK_HINT_MIN_SIZE);

    gtk_container_add(GTK_CONTAINER(window), web);
    g_signal_connect(window, "destroy", G_CALLBACK(on_view_destroyed), view);
    g_signal_connect(window, "key-press-event", G_CALLBACK(on_key_press), view);
    g_signal_connect(web, "key-press-event", G_CALLBACK(on_key_press), view);

    g_windows++;
    gtk_widget_show_all(window);
    webkit_web_view_load_uri(view->web, uri);
    gtk_widget_grab_focus(web);
}

static void set_window_icon(void)
{
    gchar *exe = g_file_read_link("/proc/self/exe", NULL);
    gchar *dir = exe != NULL ? g_path_get_dirname(exe) : NULL;
    const gchar *candidates[] = { "parlz.png", "../share/icons/hicolor/256x256/apps/parlz.png", NULL };
    gboolean loaded = FALSE;
    if (dir != NULL) {
        for (int i = 0; candidates[i] != NULL && !loaded; i++) {
            gchar *path = g_build_filename(dir, candidates[i], NULL);
            if (g_file_test(path, G_FILE_TEST_EXISTS)) {
                loaded = gtk_window_set_default_icon_from_file(path, NULL);
            }
            g_free(path);
        }
    }
    if (!loaded) {
        gtk_window_set_default_icon_name("parlz");
    }
    g_free(dir);
    g_free(exe);
}

int main(int argc, char **argv)
{
    gtk_init(&argc, &argv);
    g_server = resolve_server(argc, argv);
    for (int index = 1; index < argc; index++) {
        if (is_pz_uri(argv[index])) {
            g_pending_pz = g_strdup(argv[index]);
            break;
        }
    }
    set_window_icon();
    open_window(g_server);
    gtk_main();
    g_free(g_server);
    g_clear_pointer(&g_pending_pz, g_free);
    return 0;
}
