{
  description = "Tauri Javascript App";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixpkgs-unstable";
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, utils, fenix }:
    utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ fenix.overlays.default ];
        };
        toolchain = pkgs.fenix.complete;
        buildInputs = with pkgs; [
          # js
          nodejs
          nodePackages.pnpm

          # rust
          (with toolchain; [
            cargo
            rustc
            rust-src
            clippy
            rustfmt
            rust-analyzer
          ])
          pkg-config
          openssl

          # tauri
          webkitgtk
          dbus
        ];
      in
      rec {

        # Executed by `nix build`
        packages.default = pkgs.mkYarnPackage rec {
          inherit buildInputs;
          name = "template";
          src = ./.;

          buildPhase = "yarn build";

          installPhase = ''
            mkdir -p $out/bin

            cp src-tauri/target/release/${name} $out/bin/${name}
          '';
        };

        # Executed by `nix run`
        apps.default = utils.lib.mkApp {
          drv = packages.default;
        };

        # Used by `nix develop`
        devShell = pkgs.mkShell {
          buildInputs = buildInputs ++ [ pkgs.gtk3 pkgs.act];
          # Specify the rust-src path (many editors rely on this)
          RUST_SRC_PATH = "${toolchain.rust-src}/lib/rustlib/src/rust/library";
        };

      });
}
