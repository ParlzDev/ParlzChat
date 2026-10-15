#import "NoticePanel.h"

static NSMutableArray *gPanels = nil;
static const CGFloat kCardWidth = 348;
static const CGFloat kCardHeight = 106;
static const CGFloat kCardGap = 8;
static const CGFloat kCardMargin = 12;

static NSColor *CardInk(void) {
    return [NSColor colorWithCalibratedRed:240.0 / 255.0 green:255.0 / 255.0 blue:248.0 / 255.0 alpha:1.0];
}

static NSColor *DimInk(void) {
    return [NSColor colorWithCalibratedRed:150.0 / 255.0 green:190.0 / 255.0 blue:168.0 / 255.0 alpha:1.0];
}

static void RelayoutPanels(void) {
    if (gPanels == nil) {
        return;
    }
    NSRect visible = [NSScreen mainScreen].visibleFrame;
    NSInteger slot = 0;
    for (NSInteger i = (NSInteger)gPanels.count - 1; i >= 0; i -= 1) {
        ParlzNoticePanel *panel = [gPanels objectAtIndex:(NSUInteger)i];
        CGFloat x = NSMaxX(visible) - kCardWidth - kCardMargin;
        CGFloat y = NSMinY(visible) + kCardMargin + slot * (kCardHeight + kCardGap);
        [panel setFrameOrigin:NSMakePoint(x, y)];
        slot += 1;
    }
}

@interface ParlzNoticeCard : NSView

@property (nonatomic, copy) NSString *heading;
@property (nonatomic, copy) NSString *text;
@property (nonatomic, assign) NSInteger count;
@property (nonatomic, strong) NSImage *avatar;
@property (nonatomic, copy) void (^onOpen)(void);
@property (nonatomic, copy) void (^onClose)(void);
@property (nonatomic, copy) void (^onHover)(BOOL inside);

@end

@implementation ParlzNoticeCard

- (BOOL)isFlipped {
    return YES;
}

- (void)updateTrackingAreas {
    [super updateTrackingAreas];
    for (NSTrackingArea *area in self.trackingAreas) {
        [self removeTrackingArea:area];
    }
    NSTrackingAreaOptions options = NSTrackingMouseEnteredAndExited | NSTrackingActiveAlways | NSTrackingInVisibleRect;
    [self addTrackingArea:[[NSTrackingArea alloc] initWithRect:NSZeroRect options:options owner:self userInfo:nil]];
}

- (void)mouseEntered:(NSEvent *)event {
    (void) event;
    if (self.onHover != nil) {
        self.onHover(YES);
    }
}

- (void)mouseExited:(NSEvent *)event {
    (void) event;
    if (self.onHover != nil) {
        self.onHover(NO);
    }
}

- (void)mouseDown:(NSEvent *)event {
    NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
    if (NSMouseInRect(point, NSMakeRect(kCardWidth - 34, 8, 26, 26), self.isFlipped)) {
        if (self.onClose != nil) {
            self.onClose();
        }
        return;
    }
    if (self.onOpen != nil) {
        self.onOpen();
    }
}

- (void)drawRect:(NSRect)dirtyRect {
    (void) dirtyRect;
    NSRect card = NSInsetRect(self.bounds, 0.5, 0.5);
    NSBezierPath *shape = [NSBezierPath bezierPathWithRoundedRect:card xRadius:14 yRadius:14];
    [[NSColor colorWithCalibratedRed:22.0 / 255.0 green:36.0 / 255.0 blue:28.0 / 255.0 alpha:1.0] setFill];
    [shape fill];
    [[NSColor colorWithCalibratedRed:46.0 / 255.0 green:74.0 / 255.0 blue:58.0 / 255.0 alpha:1.0] setStroke];
    [shape setLineWidth:1];
    [shape stroke];

    NSRect avatarRect = NSMakeRect(14, 20, 66, 66);
    if (self.avatar != nil) {
        NSBezierPath *clip = [NSBezierPath bezierPathWithOvalInRect:avatarRect];
        [NSGraphicsContext saveGraphicsState];
        [clip addClip];
        [self.avatar drawInRect:avatarRect fromRect:NSZeroRect operation:NSCompositingOperationSourceOver fraction:1.0];
        [NSGraphicsContext restoreGraphicsState];
    } else {
        [[NSColor colorWithCalibratedRed:0.0 green:217.0 / 255.0 blue:95.0 / 255.0 alpha:1.0] setFill];
        [[NSBezierPath bezierPathWithOvalInRect:avatarRect] fill];
        NSString *letter = self.heading.length > 0 ? [self.heading substringToIndex:1] : @"P";
        NSDictionary *attributes = @{
            NSFontAttributeName: [NSFont boldSystemFontOfSize:26],
            NSForegroundColorAttributeName: [NSColor colorWithCalibratedRed:6.0 / 255.0 green:32.0 / 255.0 blue:18.0 / 255.0 alpha:1.0],
        };
        NSSize size = [letter sizeWithAttributes:attributes];
        [letter drawAtPoint:NSMakePoint(NSMidX(avatarRect) - size.width / 2, NSMidY(avatarRect) - size.height / 2) withAttributes:attributes];
    }

    CGFloat textLeft = NSMaxX(avatarRect) + 12;
    CGFloat textWidth = kCardWidth - textLeft - 34;
    NSString *heading = self.count > 1
        ? [NSString stringWithFormat:@"%@  (%ld 条新消息)", self.heading, (long) self.count]
        : self.heading;
    NSDictionary *headingAttributes = @{
        NSFontAttributeName: [NSFont boldSystemFontOfSize:13.5],
        NSForegroundColorAttributeName: CardInk(),
    };
    [heading drawInRect:NSMakeRect(textLeft, 22, textWidth, 20) withAttributes:headingAttributes];
    NSDictionary *textAttributes = @{
        NSFontAttributeName: [NSFont systemFontOfSize:12],
        NSForegroundColorAttributeName: DimInk(),
    };
    [self.text drawInRect:NSMakeRect(textLeft, 48, textWidth, 34) withAttributes:textAttributes];
    NSDictionary *closeAttributes = @{
        NSFontAttributeName: [NSFont systemFontOfSize:14],
        NSForegroundColorAttributeName: DimInk(),
    };
    [@"×" drawAtPoint:NSMakePoint(kCardWidth - 26, 14) withAttributes:closeAttributes];
}

@end

@interface ParlzNoticePanel ()

@property (nonatomic, strong) ParlzNoticeCard *card;
@property (nonatomic, strong) NSTimer *life;
@property (nonatomic, assign) NSInteger chatId;
@property (nonatomic, copy) void (^onOpen)(NSInteger chatId);
@property (nonatomic, assign) BOOL dismissed;

@end

@implementation ParlzNoticePanel

- (BOOL)canBecomeKeyWindow {
    return NO;
}

- (BOOL)canBecomeMainWindow {
    return NO;
}

+ (void)showTitle:(NSString *)title
             body:(NSString *)body
            count:(NSInteger)count
           chatId:(NSInteger)chatId
        avatarUrl:(NSString *)avatarUrl
           onOpen:(void (^)(NSInteger chatId))onOpen {
    if (gPanels == nil) {
        gPanels = [NSMutableArray array];
    }
    ParlzNoticePanel *panel = [[ParlzNoticePanel alloc] initWithContentRect:NSMakeRect(0, 0, kCardWidth, kCardHeight)
                                                                  styleMask:(NSWindowStyleMaskBorderless | NSWindowStyleMaskNonactivatingPanel)
                                                                    backing:NSBackingStoreBuffered
                                                                      defer:NO];
    panel.opaque = NO;
    panel.backgroundColor = [NSColor clearColor];
    panel.hasShadow = YES;
    panel.level = NSFloatingWindowLevel;
    panel.collectionBehavior = NSWindowCollectionBehaviorCanJoinAllSpaces | NSWindowCollectionBehaviorFullScreenAuxiliary;
    panel.chatId = chatId;
    panel.onOpen = onOpen;

    ParlzNoticeCard *card = [[ParlzNoticeCard alloc] initWithFrame:NSMakeRect(0, 0, kCardWidth, kCardHeight)];
    card.heading = title.length > 0 ? title : @"Parlz";
    card.text = body != nil ? body : @"";
    card.count = count;
    __weak ParlzNoticePanel *weakPanel = panel;
    card.onOpen = ^{
        ParlzNoticePanel *strongPanel = weakPanel;
        if (strongPanel == nil) {
            return;
        }
        if (strongPanel.chatId > 0 && strongPanel.onOpen != nil) {
            strongPanel.onOpen(strongPanel.chatId);
        }
        [strongPanel dismiss];
    };
    card.onClose = ^{
        ParlzNoticePanel *strongPanel = weakPanel;
        if (strongPanel != nil) {
            [strongPanel dismiss];
        }
    };
    card.onHover = ^(BOOL inside) {
        ParlzNoticePanel *strongPanel = weakPanel;
        if (strongPanel == nil) {
            return;
        }
        if (inside) {
            [strongPanel.life invalidate];
            strongPanel.life = nil;
        } else if (strongPanel.life == nil) {
            [strongPanel scheduleLife];
        }
    };
    panel.card = card;
    panel.contentView = card;

    [gPanels addObject:panel];
    [panel scheduleLife];
    RelayoutPanels();
    [panel orderFrontRegardless];

    if (avatarUrl.length > 0) {
        NSURL *url = [NSURL URLWithString:avatarUrl];
        if (url != nil) {
            [[NSURLSession sharedSession] dataTaskWithURL:url completionHandler:^(NSData *data, NSURLResponse *response, NSError *error) {
                (void) response;
                (void) error;
                if (data == nil) {
                    return;
                }
                NSImage *image = [[NSImage alloc] initWithData:data];
                if (image == nil) {
                    return;
                }
                dispatch_async(dispatch_get_main_queue(), ^{
                    ParlzNoticePanel *strongPanel = weakPanel;
                    if (strongPanel == nil) {
                        return;
                    }
                    strongPanel.card.avatar = image;
                    [strongPanel.card setNeedsDisplay:YES];
                });
            }];
        }
    }
}

- (void)scheduleLife {
    if (self.dismissed) {
        return;
    }
    self.life = [NSTimer scheduledTimerWithTimeInterval:6.0 repeats:NO block:^(NSTimer *timer) {
        (void) timer;
        [self dismiss];
    }];
}

- (void)dismiss {
    if (self.dismissed) {
        return;
    }
    self.dismissed = YES;
    [self.life invalidate];
    self.life = nil;
    if (gPanels != nil) {
        [gPanels removeObject:self];
    }
    [self orderOut:nil];
    RelayoutPanels();
}

@end
