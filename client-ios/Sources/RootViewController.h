#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>

@interface RootViewController : UIViewController <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate>

- (void)handlePzLink:(NSString *)link;

@end
