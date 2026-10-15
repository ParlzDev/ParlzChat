#import <UIKit/UIKit.h>
#import <WebKit/WebKit.h>
#import <UserNotifications/UserNotifications.h>

@interface RootViewController : UIViewController <WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler, WKDownloadDelegate, UNUserNotificationCenterDelegate>

- (void)handlePzLink:(NSString *)link;
- (void)pushTokenFromSystem:(NSString *)token;

@end
