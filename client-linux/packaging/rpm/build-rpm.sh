#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../.."

VER=${VERSION:-1.0.0}
STAGE=$PWD/build/rpm-stage
TOP=$PWD/build/rpmbuild

rm -rf "$STAGE" "$TOP"
mkdir -p "$STAGE/icons" "$TOP/BUILD" "$TOP/RPMS" "$TOP/SOURCES" "$TOP/SPECS" "$TOP/SRPMS" dist

cp dist/parlz "$STAGE/parlz"
cp resources/parlz.desktop "$STAGE/parlz.desktop"
cp resources/parlz.metainfo.xml "$STAGE/com.parlz.chatter.metainfo.xml"
cp resources/icons/parlz-*.png "$STAGE/icons/"

WEBKIT_SO=$(objdump -p dist/parlz 2>/dev/null | awk '/NEEDED/ && /webkit2gtk/ {print $2}' | head -1)
case "$WEBKIT_SO" in
    libwebkit2gtk-4.0*) WEBKIT_DEP=webkit2gtk4.0 ;;
    *) WEBKIT_DEP=webkit2gtk4.1 ;;
esac
echo "链接的 WebKit: ${WEBKIT_SO:-未知} -> 依赖 ${WEBKIT_DEP}"

rpmbuild -bb packaging/rpm/parlz.spec \
    --define "_topdir $TOP" \
    --define "parlz_version $VER" \
    --define "parlz_webkit_dep $WEBKIT_DEP" \
    --define "_stagedir $STAGE"

find "$TOP/RPMS" -name '*.rpm' -exec cp {} dist/ \;
ls -la dist/*.rpm
