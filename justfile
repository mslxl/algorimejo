target_triple := trim(`rustc -Vv | grep host | awk '{print $2}'`)

CLANGD_WINDOWS_URL := "https://github.com/clangd/clangd/releases/download/20.1.8/clangd-windows-20.1.8.zip"
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
    just download-pylyzer

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
    
[windows]
build-consolepauser:
    zig c++ -o $TMP/consolepauser.exe ./3rd_party/consolepauser/consolepauser.windows.cpp
    mkdir -p ./src-tauri/sidecar
    mv $TMP/consolepauser.exe ./src-tauri/sidecar/consolepauser-{{ target_triple }}.exe -f
    
[windows]
download-clangd:
    mkdir -p ./src-tauri/lang-server
    if [[ ! -f $TMP/clangd.zip ]]; then curl -L {{ CLANGD_WINDOWS_URL }} -o $TMP/clangd.zip; fi
    unzip -o $TMP/clangd.zip -d $TMP/clangd
    find $TMP/clangd -type d -name "bin" -exec cp -f {}/clangd.exe ./src-tauri/lang-server/clangd.exe \;
    
[windows]
download-pylyzer:
    mkdir -p ./src-tauri/lang-server
    if [[ ! -f $TMP/pylyzer.zip ]]; then curl -L {{ PYLYZER_WINDOWS_URL }} -o $TMP/pylyzer.zip; fi
    unzip -o $TMP/pylyzer.zip -d $TMP/pylyzer
    find $TMP/pylyzer -type f -name "pylyzer.exe" -exec cp -f {} ./src-tauri/lang-server/pylyzer.exe \;