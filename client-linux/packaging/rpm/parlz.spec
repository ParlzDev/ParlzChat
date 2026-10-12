%global debug_package %{nil}

Name:           parlz
Version:        %{parlz_version}
Release:        1%{?dist}
Summary:        Parlz chat client
License:        MIT
URL:            https://chat.parlz.com
Requires:       gtk3
Requires:       webkit2gtk4.1

%description
GTK + WebKitGTK shell for the Parlz chat service (https://chat.parlz.com).

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}%{_bindir}
install -m 0755 %{_stagedir}/parlz %{buildroot}%{_bindir}/parlz
install -Dm0644 %{_stagedir}/parlz.desktop %{buildroot}%{_datadir}/applications/parlz.desktop
install -Dm0644 %{_stagedir}/com.parlz.chatter.metainfo.xml %{buildroot}%{_datadir}/metainfo/com.parlz.chatter.metainfo.xml
for icon in %{_stagedir}/icons/parlz-*.png; do
    name=$(basename "$icon")
    size=${name#parlz-}
    size=${size%.png}
    install -Dm0644 "$icon" "%{buildroot}%{_datadir}/icons/hicolor/${size}x${size}/apps/parlz.png"
done

%files
%{_bindir}/parlz
%{_datadir}/applications/parlz.desktop
%{_datadir}/metainfo/com.parlz.chatter.metainfo.xml
%{_datadir}/icons/hicolor/*/apps/parlz.png
