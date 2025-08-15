target_triple := trim(`rustc -Vv | grep host | awk '{print $2}'`)

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
    
beforeBuild: migrations lint build-deps
    pnpm build

[windows]
install: build
    $(find ./src-tauri/target/release/bundle/nsis/*.exe | head) /S /VERYSILENT /SUPPRESSMSGBOXES /NORESTART

build-deps:
    just build-consolepauser
    just build-testlib

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