#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface WebWindow : NSObject <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate>

@property (nonatomic, strong) NSWindow *window;
@property (nonatomic, strong) WKWebView *web;
@property (nonatomic, copy) NSString *server;

- (instancetype)initWithServer:(NSString *)server;
- (void)show;
- (void)reload;
- (void)promptServer;

@end
