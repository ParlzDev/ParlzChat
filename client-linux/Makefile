APP := parlz
DIST := dist

WEBKIT := $(shell pkg-config --exists webkit2gtk-4.1 && echo webkit2gtk-4.1 || echo webkit2gtk-4.0)
JSC := $(shell pkg-config --exists javascriptcoregtk-4.1 && echo javascriptcoregtk-4.1 || echo javascriptcoregtk-4.0)
PKGS := $(WEBKIT) $(JSC) gtk+-3.0

CFLAGS ?= -O2
CFLAGS += -Wall -Wno-deprecated-declarations $(shell pkg-config --cflags $(PKGS))
LDFLAGS += $(shell pkg-config --libs $(PKGS))

all: $(DIST)/$(APP)

$(DIST)/$(APP): src/main.c
	mkdir -p $(DIST)
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

check:
	pkg-config --exists $(WEBKIT) || { echo "缺少 WebKitGTK 开发包"; exit 1; }

clean:
	rm -rf $(DIST) build

.PHONY: all check clean
