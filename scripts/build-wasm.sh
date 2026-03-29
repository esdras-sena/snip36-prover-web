#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT/crates/snip36-wasm"
wasm-pack build --release --target web --out-dir pkg

cd "$ROOT/crates/snip36-browser-prover-wasm"
RUSTUP_TOOLCHAIN=nightly-2025-07-14 wasm-pack build --release --target web --out-dir pkg

cd "$ROOT/deps/sequencer/crates/starknet_transaction_prover_wasm"
RUSTUP_TOOLCHAIN=nightly-2025-07-14 wasm-pack build --release --target web --out-dir pkg
