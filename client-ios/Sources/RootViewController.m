#import "RootViewController.h"
#import <AVFoundation/AVFoundation.h>
#import <Photos/Photos.h>
#import <UserNotifications/UserNotifications.h>

static NSString *const kServerKey = @"parlz.server";
static NSString *const kDefaultServer = @"https://chat.parlz.com";

@interface RootViewController ()

@property (nonatomic, strong) WKWebView *web;
@property (nonatomic, copy) NSString *server;
@property (nonatomic, copy) NSString *saveName;
@property (nonatomic, copy) NSString *saveMime;
@property (nonatomic, copy) NSString *savePath;
@property (nonatomic, strong) NSFileHandle *saveHandle;
@property (nonatomic, weak) WKDownload *download;
@property (nonatomic, copy) NSString *pendingPz;
@property (nonatomic, assign) BOOL pageReady;

@end

@implementation RootViewController

- (void)handlePzLink:(NSString *)link {
    if (link.length == 0) {
        return;
    }
    if (!self.pageReady || self.web == nil) {
        self.pendingPz = link;
        return;
    }
    NSData *encoded = [NSJSONSerialization dataWithJSONObject:@[ link ] options:0 error:nil];
    NSString *array = encoded ? [[NSString alloc] initWithData:encoded encoding:NSUTF8StringEncoding] : nil;
    NSString *arg = array.length > 2 ? [array substringWithRange:NSMakeRange(1, array.length - 2)] : @"\"\"";
    NSString *js = [NSString stringWithFormat:@"window.ParlzPz && window.ParlzPz(%@);", arg];
    [self.web evaluateJavaScript:js completionHandler:nil];
}

- (void)viewDidLoad {
    [super viewDidLoad];

    [[UNUserNotificationCenter currentNotificationCenter]
        requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                      completionHandler:^(BOOL granted, NSError *_Nullable error) {
                          (void) granted;
                          (void) error;
                      }];

    NSString *stored = [[NSUserDefaults standardUserDefaults] stringForKey:kServerKey];
    self.server = stored.length > 0 ? stored : kDefaultServer;

    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    config.allowsInlineMediaPlayback = YES;
    config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeNone;
    config.preferences.javaScriptCanOpenWindowsAutomatically = YES;

    WKUserContentController *controller = [[WKUserContentController alloc] init];
    [controller addScriptMessageHandler:self name:@"parlz"];
    [controller addUserScript:[[WKUserScript alloc] initWithSource:[self bridgeScript] injectionTime:WKUserScriptInjectionTimeAtDocumentStart forMainFrameOnly:NO]];
    config.userContentController = controller;

    self.web = [[WKWebView alloc] initWithFrame:self.view.bounds configuration:config];
    self.web.autoresizingMask = UIViewAutoresizingFlexibleWidth | UIViewAutoresizingFlexibleHeight;
    self.web.navigationDelegate = self;
    self.web.UIDelegate = self;
    self.web.scrollView.contentInsetAdjustmentBehavior = UIScrollViewContentInsetAdjustmentNever;
    self.web.backgroundColor = [UIColor colorWithRed:238.0 / 255.0 green:252.0 / 255.0 blue:244.0 / 255.0 alpha:1.0];
    [self.view addSubview:self.web];

    [self lockZoom];
    [self preparePermissions];
    [self loadServer];
}

- (void)lockZoom {
    self.web.scrollView.pinchGestureRecognizer.enabled = NO;
    self.web.scrollView.maximumZoomScale = 1.0;
    self.web.scrollView.minimumZoomScale = 1.0;
    self.web.scrollView.zoomScale = 1.0;
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    [self lockZoom];
    self.pageReady = YES;
    if (self.pendingPz.length > 0) {
        NSString *link = self.pendingPz;
        self.pendingPz = nil;
        [self handlePzLink:link];
    }
}

- (UIStatusBarStyle)preferredStatusBarStyle {
    return UIStatusBarStyleDarkContent;
}

- (void)preparePermissions {
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeAudio completionHandler:^(BOOL granted) {}];
    [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {}];
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
    } else if ([cmd isEqualToString:@"notify"]) {
        [self postNotice:payload[@"title"] body:payload[@"body"] count:[payload[@"count"] integerValue]];
    } else if ([cmd isEqualToString:@"badge"]) {
        NSInteger count = [payload[@"count"] integerValue];
        if (count > 0) {
            [UIApplication sharedApplication].applicationIconBadgeNumber = (NSInteger) count;
        } else {
            [UIApplication sharedApplication].applicationIconBadgeNumber = 0;
        }
    }
}

- (void)postNotice:(NSString *)title body:(NSString *)body count:(NSInteger)count {
    UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
    [center getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *settings) {
        if (settings.authorizationStatus != UNAuthorizationStatusAuthorized) {
            return;
        }
        UNMutableNotificationContent *content = [[UNMutableNotificationContent alloc] init];
        content.title = title.length > 0 ? title : @"Parlz";
        content.body = body ?: @"";
        if (count > 0) {
            content.badge = @(count);
        }
        content.sound = [UNNotificationSound defaultSound];
        UNTimeIntervalNotificationTrigger *trigger = [UNTimeIntervalNotificationTrigger triggerWithTimeInterval:0.1 repeats:NO];
        NSString *identifier = [NSString stringWithFormat:@"parlz-%.0f", [[NSDate date] timeIntervalSince1970] * 1000];
        UNNotificationRequest *request = [UNNotificationRequest requestWithIdentifier:identifier content:content trigger:trigger];
        [center addNotificationRequest:request withCompletionHandler:nil];
    }];
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

    if ([self.saveMime hasPrefix:@"image/"]) {
        [[PHPhotoLibrary sharedPhotoLibrary] performChanges:^{
            [PHAssetCreationRequest creationRequestForAssetFromImageAtFileURL:[NSURL fileURLWithPath:path]];
        } completionHandler:^(BOOL success, NSError *error) {
            dispatch_async(dispatch_get_main_queue(), ^{
                [self alert:success ? [NSString stringWithFormat:@"已保存到相册：%@", self.saveName] : @"保存到相册失败，请检查相册权限"];
            });
        }];
        return;
    }

    NSURL *documents = [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];
    NSString *target = [documents.path stringByAppendingPathComponent:self.saveName];
    [[NSFileManager defaultManager] removeItemAtPath:target error:nil];
    NSError *error = nil;
    [[NSFileManager defaultManager] moveItemAtPath:path toPath:target error:&error];
    [self alert:error == nil ? [NSString stringWithFormat:@"已保存到「文件 → Parlz」：%@", self.saveName] : @"保存失败"];
}

- (void)alert:(NSString *)text {
    UIAlertController *controller = [UIAlertController alertControllerWithTitle:@"Parlz" message:text preferredStyle:UIAlertControllerStyleAlert];
    [controller addAction:[UIAlertAction actionWithTitle:@"好" style:UIAlertActionStyleDefault handler:nil]];
    [self presentViewController:controller animated:YES completion:nil];
}

- (void)promptServer {
    UIAlertController *controller = [UIAlertController alertControllerWithTitle:@"切换服务器" message:nil preferredStyle:UIAlertControllerStyleAlert];
    [controller addTextFieldWithConfigurationHandler:^(UITextField *field) {
        field.text = self.server;
        field.placeholder = kDefaultServer;
        field.keyboardType = UIKeyboardTypeURL;
        field.autocapitalizationType = UITextAutocapitalizationTypeNone;
        field.autocorrectionType = UITextAutocorrectionTypeNo;
    }];
    [controller addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:nil]];
    __weak RootViewController *weakSelf = self;
    [controller addAction:[UIAlertAction actionWithTitle:@"保存并刷新" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action) {
        RootViewController *self = weakSelf;
        if (self == nil) {
            return;
        }
        NSString *next = [controller.textFields.firstObject.text stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceAndNewlineCharacterSet]];
        if (![next hasPrefix:@"http://"] && ![next hasPrefix:@"https://"]) {
            [self alert:@"地址要以 http:// 或 https:// 开头"];
            return;
        }
        while ([next hasSuffix:@"/"]) {
            next = [next substringToIndex:next.length - 1];
        }
        self.server = next;
        [[NSUserDefaults standardUserDefaults] setObject:next forKey:kServerKey];
        [self loadServer];
    }]];
    [self presentViewController:controller animated:YES completion:nil];
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

#if __IPHONE_OS_VERSION_MAX_ALLOWED >= 150000
- (void)webView:(WKWebView *)webView requestMediaCapturePermissionForOrigin:(WKSecurityOrigin *)origin initiatedByFrame:(WKFrameInfo *)frame type:(WKMediaCaptureType)type decisionHandler:(void (^)(WKPermissionDecision))decisionHandler {
    NSURL *base = [NSURL URLWithString:self.server];
    NSString *host = origin.host.lowercaseString;
    if (host.length > 0 && base.host.length > 0 && [host isEqualToString:base.host.lowercaseString]) {
        [AVCaptureDevice requestAccessForMediaType:AVMediaTypeVideo completionHandler:^(BOOL granted) {}];
        decisionHandler(WKPermissionDecisionGrant);
        return;
    }
    decisionHandler(WKPermissionDecisionDeny);
}
#endif

- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
    NSURL *url = navigationAction.request.URL;
    NSString *scheme = url.scheme.lowercaseString;
    if ([scheme isEqualToString:@"tel"] || [scheme isEqualToString:@"mailto"] || [scheme isEqualToString:@"sms"]) {
        [[UIApplication sharedApplication] openURL:url options:@{} completionHandler:nil];
        decisionHandler(WKNavigationActionPolicyCancel);
        return;
    }
    if ([scheme isEqualToString:@"pz"]) {
        [self handlePzLink:url.absoluteString];
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
    self.download = download;
}

- (void)webView:(WKWebView *)webView navigationAction:(WKNavigationAction *)navigationAction didBecomeDownload:(WKDownload *)download {
    download.delegate = self;
    self.download = download;
}

- (void)download:(WKDownload *)download decideDestinationUsingResponse:(NSURLResponse *)response suggestedFilename:(NSString *)suggestedFilename completionHandler:(void (^)(NSURL *destination))completionHandler {
    NSURL *documents = [[[NSFileManager defaultManager] URLsForDirectory:NSDocumentDirectory inDomains:NSUserDomainMask] firstObject];
    NSString *name = suggestedFilename.length > 0 ? suggestedFilename : @"parlz-file";
    NSURL *target = [documents URLByAppendingPathComponent:name];
    [[NSFileManager defaultManager] removeItemAtURL:target error:nil];
    completionHandler(target);
}

- (void)downloadDidFinish:(WKDownload *)download {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self alert:@"文件已保存到「文件 → Parlz」"];
    });
}

- (void)download:(WKDownload *)download didFailWithError:(NSError *)error resumeData:(NSData *)resumeData {
    dispatch_async(dispatch_get_main_queue(), ^{
        [self alert:@"下载失败"];
    });
}

- (WKWebView *)webView:(WKWebView *)webView createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration forNavigationAction:(WKNavigationAction *)navigationAction windowFeatures:(WKWindowFeatures *)windowFeatures {
    if (navigationAction.request.URL != nil) {
        [webView loadRequest:navigationAction.request];
    }
    return nil;
}

- (void)webView:(WKWebView *)webView runJavaScriptAlertPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(void))completionHandler {
    [self alert:message];
    completionHandler();
}

- (void)webView:(WKWebView *)webView runJavaScriptConfirmPanelWithMessage:(NSString *)message initiatedByFrame:(WKFrameInfo *)frame completionHandler:(void (^)(BOOL))completionHandler {
    UIAlertController *controller = [UIAlertController alertControllerWithTitle:@"Parlz" message:message preferredStyle:UIAlertControllerStyleAlert];
    [controller addAction:[UIAlertAction actionWithTitle:@"取消" style:UIAlertActionStyleCancel handler:^(UIAlertAction *action) {
        completionHandler(NO);
    }]];
    [controller addAction:[UIAlertAction actionWithTitle:@"确定" style:UIAlertActionStyleDefault handler:^(UIAlertAction *action) {
        completionHandler(YES);
    }]];
    [self presentViewController:controller animated:YES completion:nil];
}

@end
