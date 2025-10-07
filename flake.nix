{
  description = "Tauri Javascript App";

  inputs = {
    fenix = {
      url = "github:nix-community/fenix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    utils,
    fenix,
  }:
    utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {
        inherit system;
        overlays = [fenix.overlays.default];
      };
      toolchain = pkgs.fenix.complete;
      buildInputs = with pkgs; [
        # js
        nodejs
        nodejs.pkgs.pnpm

        # rust
        (with toolchain; [
          cargo
          rustc
          rust-src
          clippy
          rustfmt
        ])
        pkg-config
        openssl
        diesel-cli

        zig
      ]
      ++ (lib.optional pkgs.stdenv.isLinux (with pkgs;[
        gtk3
        webkitgtk
        dbus
        libayatana-appindicator.dev
        alsa-lib.dev
      ]))
      ++ (lib.optional pkgs.stdenv.isDarwin (with pkgs;[
        libiconv
        apple-sdk
        apple-sdk
      ])); 
    in rec {
      # Used by `nix develop`
      devShell = pkgs.mkShell {
        inherit buildInputs;

        # Specify the rust-src path (many editors rely on this)
        RUST_SRC_PATH = "${toolchain.rust-src}/lib/rustlib/src/rust/library";
      };
    });
}
