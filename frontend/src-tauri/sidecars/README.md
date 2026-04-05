# Sidecar Binaries

This directory holds platform-specific sidecar binaries. They are NOT checked into git.

## PocketBase
Download from https://pocketbase.io/docs/ and rename:
- `pocketbase-x86_64-apple-darwin` (macOS Intel)
- `pocketbase-aarch64-apple-darwin` (macOS Apple Silicon)
- `pocketbase-x86_64-pc-windows-msvc.exe` (Windows)
- `pocketbase-x86_64-unknown-linux-gnu` (Linux)

## Node Sidecar
Build from the `sidecar/` directory:
```bash
cd sidecar && bun build --compile --target=bun-darwin-arm64 ./src/index.js --outfile ../frontend/src-tauri/sidecars/node-sidecar-aarch64-apple-darwin
```

Platform targets: bun-darwin-x64, bun-darwin-arm64, bun-windows-x64, bun-linux-x64