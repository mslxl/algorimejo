dev: migrations lint-fix
    pnpm tauri dev

migrations: && test-migrations
    cd src-tauri && diesel migration run

reset-migrations: && test-migrations
    cd src-tauri && diesel database reset

test-migrations:
    cd src-tauri && diesel migration redo

lint-fix:
    pnpm biome format --fix
    pnpm biome lint --fix --unsafe
    cd src-tauri && cargo fmt

lint:
    pnpm biome lint
    # cd src-tauri && cargo clippy --all-targets --all-features -- -D warnings

build: migrations lint
    pnpm tauri build

clean:
    cd src-tauri && cargo clean
    if test -d dist/; then rm -rf dist; fi

[windows]
install: build
    $(find ./src-tauri/target/release/bundle/nsis/algorimejo*.exe | head)
