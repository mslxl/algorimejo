target_triple := trim(`rustc -Vv | grep host | awk '{print $2}'`)

CLANGD_WINDOWS_URL := "https://github.com/clangd/clangd/releases/download/20.1.8/clangd-windows-20.1.8.zip"
CLANGD_WINDOWS_SHA256 := "717a0700fc660574647468b3d0b67e46a077d27e4da794d9d0c212add6ba6765"
CLANGD_LINUX_URL := "https://github.com/clangd/clangd/releases/download/20.1.8/clangd-linux-20.1.8.zip"
CLANGD_LINUX_SHA256 := "98493005e2c7532e69827987d909c46295e2ee997a48228606e7777547994490"
CLANGD_MACOS_URL := "https://github.com/clangd/clangd/releases/download/20.1.8/clangd-mac-20.1.8.zip"
CLANGD_MACOS_SHA256 := "c2303d0a83dcb31c08c4920e815586ad1b0c17ee8d1a484d605f33d784a31402"
PYLYZER_WINDOWS_URL := "https://github.com/mtshiba/pylyzer/releases/download/v0.0.82/pylyzer-x86_64-pc-windows-msvc.zip"

dev: 
    pnpm tauri dev

migrations: && test-migrations
    cd src-tauri && diesel migration run

reset-migrations: && test-migrations
    cd src-tauri && diesel database reset

test-migrations:
    cd src-tauri && diesel migration redo

lint-fix:
    pnpm eslint --fix ./src
    cd src-tauri && cargo fmt

lint:
    pnpm eslint ./src
    # cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings

build: 
    pnpm tauri build

clean:
    cd src-tauri && cargo clean
    if test -d dist/; then rm -rf dist; fi
    
beforeDev: migrations build-deps
    pnpm dev
    
beforeBuild: migrations lint build-deps build-release-deps
    pnpm build

[windows]
install: build
    $(find ./src-tauri/target/release/bundle/nsis/*.exe | head) /S /VERYSILENT /SUPPRESSMSGBOXES /NORESTART
    
build-release-deps:
    if [[ -d "./src-tauri/lang" ]]; then rm -rf ./src-tauri/lang; fi
    cp -r lang ./src-tauri/lang

build-deps:
    just build-consolepauser
    just build-testlib
    just download-clangd

[windows]
build-testlib:
    mkdir -p ./src-tauri/testlib
    mkdir -p ./src-tauri/testlib/include
    find ./src-tauri/testlib -type f ! -name '.gitkeep' -delete
    if [[ -f ./src-tauri/src/runner/bundle-chk.txt ]]; then rm ./src-tauri/src/runner/bundle-chk.txt; fi
    for file in ./3rd_party/testlib/src/*.cpp; do \
        basename=$(basename "$file" .cpp); \
        zig c++ -I./3rd_party/testlib/include -o "./src-tauri/testlib/${basename}.exe" "$file"; \
        echo "${basename}" >> ./src-tauri/src/runner/bundle-chk.txt; \
    done
    rm ./src-tauri/testlib/*.pdb
    cp ./3rd_party/testlib/include/testlib.h ./src-tauri/testlib/include/testlib.h -f

[unix]
build-testlib:
    mkdir -p ./src-tauri/testlib
    mkdir -p ./src-tauri/testlib/include
    find ./src-tauri/testlib -type f ! -name '.gitkeep' -delete
    if [[ -f ./src-tauri/src/runner/bundle-chk.txt ]]; then rm ./src-tauri/src/runner/bundle-chk.txt; fi
    for file in ./3rd_party/testlib/src/*.cpp; do \
        basename=$(basename "$file" .cpp); \
        c++ -I./3rd_party/testlib/include -o "./src-tauri/testlib/${basename}" "$file"; \
        echo "${basename}" >> ./src-tauri/src/runner/bundle-chk.txt; \
    done
    cp ./3rd_party/testlib/include/testlib.h ./src-tauri/testlib/include/testlib.h -f
    
[windows]
build-consolepauser:
    zig c++ -o $TMP/consolepauser.exe ./3rd_party/consolepauser/consolepauser.windows.cpp
    mkdir -p ./src-tauri/sidecar
    mv $TMP/consolepauser.exe ./src-tauri/sidecar/consolepauser-{{ target_triple }}.exe -f

[unix]
build-consolepauser:
    c++ -o /tmp/consolepauser ./3rd_party/consolepauser/consolepauser.unix.cpp
    mkdir -p ./src-tauri/sidecar
    mv /tmp/consolepauser ./src-tauri/sidecar/consolepauser-{{ target_triple }} -f

[unix]
download-clangd:
    mkdir -p ./src-tauri/lang-server
    target="{{ target_triple }}"; case "$target" in aarch64-apple-darwin|x86_64-apple-darwin) url="{{ CLANGD_MACOS_URL }}"; expected="{{ CLANGD_MACOS_SHA256 }}";; x86_64-unknown-linux-gnu) url="{{ CLANGD_LINUX_URL }}"; expected="{{ CLANGD_LINUX_SHA256 }}";; *) echo "Bundled clangd is unavailable for target $target" >&2; exit 1;; esac && \
    tmp_dir=$(mktemp -d) && \
    trap 'rm -rf "$tmp_dir"' EXIT && \
    curl -fsSL "$url" -o "$tmp_dir/clangd.zip" && \
    if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$tmp_dir/clangd.zip" | awk '{print $1}'); else actual=$(shasum -a 256 "$tmp_dir/clangd.zip" | awk '{print $1}'); fi && \
    test "$actual" = "$expected" && \
    unzip -q "$tmp_dir/clangd.zip" -d "$tmp_dir/extracted" && \
    clangd=$(find "$tmp_dir/extracted" -type f -name clangd -print -quit) && \
    test -n "$clangd" && \
    cp "$clangd" ./src-tauri/lang-server/clangd && \
    chmod 755 ./src-tauri/lang-server/clangd
    
[windows]
download-clangd:
    mkdir -p ./src-tauri/lang-server
    target="{{ target_triple }}"; case "$target" in x86_64-pc-windows-msvc) ;; *) echo "Bundled clangd is unavailable for target $target" >&2; exit 1;; esac && \
    tmp_dir=$(mktemp -d) && \
    trap 'rm -rf "$tmp_dir"' EXIT && \
    curl -fsSL "{{ CLANGD_WINDOWS_URL }}" -o "$tmp_dir/clangd.zip" && \
    if command -v sha256sum >/dev/null 2>&1; then actual=$(sha256sum "$tmp_dir/clangd.zip" | awk '{print $1}'); else actual=$(shasum -a 256 "$tmp_dir/clangd.zip" | awk '{print $1}'); fi && \
    test "$actual" = "{{ CLANGD_WINDOWS_SHA256 }}" && \
    unzip -q "$tmp_dir/clangd.zip" -d "$tmp_dir/extracted" && \
    clangd=$(find "$tmp_dir/extracted" -type f -name clangd.exe -print -quit) && \
    test -n "$clangd" && \
    cp "$clangd" ./src-tauri/lang-server/clangd.exe
