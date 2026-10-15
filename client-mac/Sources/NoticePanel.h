#import <Cocoa/Cocoa.h>

@interface ParlzNoticePanel : NSPanel

+ (void)showTitle:(NSString *)title
             body:(NSString *)body
            count:(NSInteger)count
           chatId:(NSInteger)chatId
        avatarUrl:(NSString *)avatarUrl
           onOpen:(void (^)(NSInteger chatId))onOpen;

@end
