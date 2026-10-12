#import "WebWindow.h"
#import <AVFoundation/AVFoundation.h>

static NSString *const kServerKey = @"parlz.server";
static NSString *const kDefaultServer = @"https://chat.parlz.com";

@interface WebWindow ()

@property (nonatomic, copy) NSString *saveName;
@property (nonatomic, copy) NSString *saveMime;
@property (nonatomic, copy) NSString *savePath;
@property (nonatomic, strong) NSFileHandle *saveHandle;

@end

@implementation WebWindow

- (instancetype)initWithServer:(NSString *)server {
    self = [super init];
    if (self == nil) {
        return nil;
    }

    NSString *stored = [[NSUserDefaults standardUserDefaults] stringForKey:kServerKey];
    _server = server.length > 0 ? server : (stored.length > 0 ? stored : kDefaultServer);

    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    config.preferences.javaScriptCanOpenWindowsAutomatically = YES;

    WKUserContentController *controller = [[WKUserContentController alloc] init];
    [controller addScriptMessageHandler:self name:@"parlz"];
    [controller addUserScript:[[WKUserScript alloc] initWithSource:[self bridgeScript] injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:NO]];
    config.userContentController = controller;

    NSRect frame = NSMakeRect(0, 0, 1180, 780);
    _window = [[NSWindow alloc] initWithContentRect:frame
                                          styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable | NSWindowStyleMaskResizable
                                            backing:NSBackingStoreBuffered
                                              defer:NO];
    _window.title = @"Parlz";
    _window.minSize = NSMakeSize(880, 620);
    _window.backgroundColor = [NSColor colorWithCalibratedRed:238.0 / 255.0 green:252.0 / 255.0 blue:244.0 / 255.0 alpha:1.0];
    [_window center];

    _web = [[WKWebView alloc] initWithFrame:frame configuration:config];
    _web.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _web.navigationDelegate = self;
    _web.UIDelegate = self;
    _window.contentView = _web;

    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {}];
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {}];

    return self;
}

- (void)show {
    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];
    [self loadServer];
}

- (void)reload {
    [self.web reload];
}

- (void)loadServer {
    NSURL *url = [NSURL URLWithString:self.server];
    if (url == nil) {
        return;
    }
    [self.web loadRequest:[NSURLRequest requestWithURL:url]];
}

- (NSString *)bridgeScript {
    return @"window.ParlzIOS = {"
            "beginSave: function (name, mime) { window.webkit.messageHandlers.parlz.postMessage({ cmd: 'beginSave', name: String(name || ''), mime: String(mime || '') }); },"
            "chunkSave: function (data) { window.webkit.messageHandlers.parlz.postMessage({ cmd: 'chunkSave', data: String(data || '') }); },"
            "finishSave: function () { window.webkit.messageHandlers.parlz.postMessage({ cmd: 'finishSave' }); },"
            "openServerDialog: function () { window.webkit.messageHandlers.parlz.postMessage({ cmd: 'server' }); }"
            "};";
}

- (void)userContentController:(WKUserContentController *)userContentController didReceiveScriptMessage:(WKScriptMessage *)message {
    NSDictionary *payload = [message.body isKindOfClass:[NSDictionary class]] ? message.body : @{};
    NSString *cmd = payload[@"cmd"];
    if ([cmd isEqualToString:@"beginSave"]) {
        [self beginSaveWithName:payload[@"name"] mime:payload[@"mime"]];
    } else if ([cmd isEqualToString:@"chunkSave"]) {
        [self appendSaveChunk:payload[@"data"]];
    } else if ([cmd isEqualToString:@"finishSave"]) {
        [self finishSave];
    } else if ([cmd isEqualToString:@"server"]) {
        [self promptServer];
    }
}

- (void)beginSaveWithName:(NSString *)name mime:(NSString *)mime {
    self.saveName = name.length > 0 ? name : @"parlz-file";
    self.saveMime = mime.length > 0 ? mime : @"application/octet-stream";
    NSString *safeName = [[self.saveName componentsSeparatedByCharactersInSet:[NSCharacterSet characterSetWithCharactersInString:@"/\\:*?\"<>|"]] componentsJoinedByString:@"_"];
    self.savePath = [NSTemporaryDirectory() stringByAppendingPathComponent:[NSString stringWithFormat:@"parlz-save-%@", safeName]];
    [[NSFileManager defaultManager] removeItemAtPath:self.savePath error:nil];
    [[NSFileManager defaultManager] createFileAtPath:self.savePath contents:[NSData data] attributes:nil];
    self.saveHandle = [NSFileHandle fileHandleForWritingAtPath:self.savePath];
}

- (void)appendSaveChunk:(NSString *)base64 {
    if (self.saveHandle == nil || base64.length == 0) {
        return;
    }
    NSData *chunk = [[NSData alloc] initWithBase64EncodedString:base64 options:NSDataBase64DecodingIgnoreUnknownCharacters];
    if (chunk != nil) {
        [self.saveHandle writeData:chunk];
    }
}

- (void)finishSave {
    [self.saveHandle closeFile];
    self.saveHandle = nil;
    NSString *path = self.savePath;
    self.savePath = nil;
    if (path == nil) {
        return;
    }

    NSURL *downloads = [[[NSFileManager defaultManager] URLsForDirectory:NSDownloadsDirectory inDomains:NSUserDomainMask] firstObject];
    NSString *target = [downloads.path stringByAppendingPathComponent:self.saveName];
    [[NSFileManager defaultManager] removeItemAtPath:target error:nil];
    NSError *error = nil;
    [[NSFileManager defaultManager] moveItemAtPath:path toPath:target error:&error];

    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = error == nil ? [NSString stringWithFormat:@"已保存：%@", target] : @"保存失败";
    [alert addButtonWithTitle:@"好"];
    if (error == nil) {
        [alert addButtonWithTitle:@"在访达中显示"];
    }
    NSModalResponse response = [alert runModal];
    if (response == NSAlertSecondButtonReturn && error == nil) {
        [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[[NSURL fileURLWithPath:target]]];
    }
}

- (void)promptServer {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"切换服务器";
    alert.informativeText = @"例如 https://chat.parlz.com";
    [alert addButtonWithTitle:@"保存并刷新"];
    [alert addButtonWithTitle:@"取消"];

    NSTextField *field = [[NSTextField alloc] initWithFrame:NSMakeRect(0, 0, 360, 24)];
    field.stringValue = self.server;
    alert.accessoryView = field;
    [alert.window setInitialFirstResponder:field];

    if ([alert runModal] != NSAlertFirstButtonReturn) {
        return;
    }

    NSString *next = [field.stringValue stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
    if (![next hasPrefix:@"http://"] && ![next hasPrefix:@"https://"]) {
        NSAlert *bad = [[NSAlert alloc] init];
        bad.messageText = @"地址要以 http:// 或 https:// 开头";
        [bad runModal];
        return;
    }
    while ([next hasSuffix:@"/"]) {
        next = [next substringToIndex:next.length - 1];
    }
    self.server = next;
    [[NSUserDefaults standardUserDefaults] setObject:next forKey:kServerKey];
    [self loadServer];
}

- (BOOL)isAppUrl:(NSURL *)url {
    NSURL *base = [NSURL URLWithString:self.server];
    NSString *host = base.host;
    NSString *target = url.host;
    if (host.length == 0 || target.length == 0) {
        return NO;
    }
    return [host.lowercaseString isEqualToString:target.lowercaseString];
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    NSString *scheme = url.scheme.lowercaseString;
    if ([scheme isEqualToString:@"mailto"]) {
        [[NSWorkspace sharedWorkspace] openURL:url];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView decidePolicyForNavigationResponse:(WKNavigationResponse *)navigationResponse decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler {
    if (!navigationResponse.canShowMIMEType && navigationResponse.response.URL != nil && [self isAppUrl:navigationResponse.response.URL]) {
        decisionHandler(WKNavigationResponsePolicyDownload);
        return;
    }
    decisionHandler(WKNavigationResponsePolicyAllow);
}

- (void)webView:(WKWebView *)webView navigationResponse:(WKNavigationResponse *)navigationResponse didBecomeDownload:(WKDownload *)download {
    download.delegate = self;
}

- (void)download:(WKDownload *)download decideDestinationUsingResponse:(NSURLResponse *)response suggestedFilename:(NSString *)suggestedFilename completionHandler:(void (^)(NSURL *destination))completionHandler {
    NSURL *downloads = [[[NSFileManager defaultManager] URLsForDirectory:NSDownloadsDirectory inDomains:NSUserDomainMask] firstObject];
    NSString *name = suggestedFilename.length > 0 ? suggestedFilename : @"parlz-file";
    NSURL *target = [downloads URLByAppendingPathComponent:name];
    [[NSFileManager defaultManager] removeItemAtURL:target error:nil];
    completionHandler(target);
}

- (void)downloadDidFinish:(WKDownload *)download {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSAlert *alert = [[NSAlert alloc] init];
        alert.messageText = @"文件已保存到「下载」目录";
        [alert runModal];
    });
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures {
    if (navigationAction.request.URL != nil) {
        [webView loadRequest:navigationAction.request];
    }
    return nil;
}

- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completionHandler {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = message;
    [alert runModal];
    completionHandler();
}

@end
