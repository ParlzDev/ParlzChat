#import "AppDelegate.h"
#import "RootViewController.h"

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
    self.window = [[UIWindow alloc] initWithFrame:[[UIScreen mainScreen] bounds]];
    self.window.backgroundColor = [UIColor colorWithRed:238.0 / 255.0 green:252.0 / 255.0 blue:244.0 / 255.0 alpha:1.0];
    self.window.rootViewController = [[RootViewController alloc] init];
    [self.window makeKeyAndVisible];
    return YES;
}

- (BOOL)application:(UIApplication *)application openURL:(NSURL *)url options:(NSDictionary<UIApplicationOpenURLOptionsKey, id> *)options {
    if (![url.scheme.lowercaseString isEqualToString:@"pz"]) {
        return NO;
    }
    UIViewController *root = self.window.rootViewController;
    if ([root isKindOfClass:[RootViewController class]]) {
        [(RootViewController *)root handlePzLink:url.absoluteString];
        return YES;
    }
    return NO;
}

@end
