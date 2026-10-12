ARCHS = arm64
TARGET = iphone:clang:latest:15.0
INSTALL_TARGET_PROCESSES = Parlz

include $(THEOS)/makefiles/common.mk

APPLICATION_NAME = Parlz

Parlz_FILES = Sources/main.m Sources/AppDelegate.m Sources/RootViewController.m
Parlz_FRAMEWORKS = UIKit WebKit AVFoundation Photos
Parlz_CFLAGS = -fobjc-arc
Parlz_CODESIGN_FLAGS = -SResources/Parlz.entitlements
Parlz_INSTALL_PATH = /Applications

include $(THEOS_MAKE_PATH)/application.mk
