#import "AppDelegate.h"

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
    [self buildMenu];
    self.window = [[WebWindow alloc] initWithServer:[self serverFromArguments]];
    [self.window show];
}

- (void)application:(NSApplication *)application openURLs:(NSArray<NSURL *> *)urls {
    for (NSURL *url in urls) {
        if (url != nil && [url.scheme.lowercaseString isEqualToString:@"pz"]) {
            [self.window handlePzLink:url.absoluteString];
        }
    }
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (NSString *)serverFromArguments {
    NSArray<NSString *> *arguments = [[NSProcessInfo processInfo] arguments];
    for (NSUInteger index = 0; index < arguments.count; index++) {
        NSString *value = [arguments[index] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
        if ([value hasPrefix:@"--server="]) {
            NSString *next = [[value substringFromIndex:9] stringByTrimmingCharactersInSet:[NSCharacterSet whitespaceCharacterSet]];
            if (next.length > 0) {
                return next;
            }
        }
        if ([value hasPrefix:@"http://"] || [value hasPrefix:@"https://"]) {
            return value;
        }
    }
    NSUInteger index = [arguments indexOfObject:@"--server"];
    if (index != NSNotFound && index + 1 < arguments.count) {
        return arguments[index + 1];
    }
    return nil;
}

- (void)buildMenu {
    NSMenu *main = [[NSMenu alloc] init];

    NSMenuItem *appItem = [[NSMenuItem alloc] init];
    [main addItem:appItem];
    NSMenu *appMenu = [[NSMenu alloc] init];
    [appMenu addItemWithTitle:@"关于 Parlz" action:@selector(orderFrontStandardAboutPanel:) keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    self.serverItem = [[NSMenuItem alloc] initWithTitle:@"切换服务器…" action:@selector(openServerDialog:) keyEquivalent:@"k"];
    self.serverItem.target = self;
    [appMenu addItem:self.serverItem];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"隐藏 Parlz" action:@selector(hide:) keyEquivalent:@"h"];
    [appMenu addItemWithTitle:@"退出 Parlz" action:@selector(terminate:) keyEquivalent:@"q"];
    appItem.submenu = appMenu;

    NSMenuItem *viewItem = [[NSMenuItem alloc] init];
    [main addItem:viewItem];
    NSMenu *viewMenu = [[NSMenu alloc] initWithTitle:@"视图"];
    NSMenuItem *reload = [[NSMenuItem alloc] initWithTitle:@"重新加载" action:@selector(reloadPage:) keyEquivalent:@"r"];
    reload.target = self;
    [viewMenu addItem:reload];
    NSMenuItem *full = [[NSMenuItem alloc] initWithTitle:@"全屏" action:@selector(toggleFullScreen:) keyEquivalent:@"f"];
    full.keyEquivalentModifierMask = NSEventModifierFlagControl | NSEventModifierFlagCommand;
    [viewMenu addItem:full];
    viewItem.submenu = viewMenu;

    NSApp.mainMenu = main;
}

- (void)openServerDialog:(id)sender {
    [self.window promptServer];
}

- (void)reloadPage:(id)sender {
    [self.window reload];
}

@end
