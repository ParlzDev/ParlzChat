#import <Cocoa/Cocoa.h>
#import "WebWindow.h"

@interface AppDelegate : NSObject <NSApplicationDelegate>

@property (nonatomic, strong) WebWindow *window;
@property (nonatomic, strong) NSMenuItem *serverItem;

@end
