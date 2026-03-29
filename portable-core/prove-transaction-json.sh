#!/usr/bin/env bash
set -euo pipefail

SEQ_ROOT="$(cd "$(dirname "$0")/../deps/sequencer" && pwd)"
INPUT_JSON="${1:-}"
if [ -z "$INPUT_JSON" ]; then
  echo "usage: $0 '<json>'" >&2
  exit 1
fi

cd "$SEQ_ROOT"
RUSTC_BOOTSTRAP=1 cargo test -p starknet_transaction_prover --features stwo_proving --lib prove_transaction_json -- --nocapture >/dev/null 2>&1 || true

echo "$INPUT_JSON" > /tmp/snip36_prove_input.json
cat > /tmp/snip36_prove_runner.rs <<'RS'
use std::fs;
use starknet_transaction_prover::{config::ProverConfig, prove_transaction_json};

#[tokio::main]
async fn main() {
    let raw = fs::read_to_string("/tmp/snip36_prove_input.json").unwrap();
    let v: serde_json::Value = serde_json::from_str(&raw).unwrap();
    let cfg: ProverConfig = serde_json::from_value(v["config"].clone()).unwrap();
    let block_number = v["block_number"].as_u64().unwrap();
    let tx = v["transaction"].clone();
    let result = prove_transaction_json(&cfg, block_number, tx).await.unwrap();
    println!("{}", serde_json::to_string(&result).unwrap());
}
RS

cargo run -q --features stwo_proving --manifest-path "$SEQ_ROOT/crates/starknet_transaction_prover/Cargo.toml" --bin nonexistent 2>/dev/null || true
rustc /tmp/snip36_prove_runner.rs \
  -L dependency="$SEQ_ROOT/target/debug/deps" \
  --extern starknet_transaction_prover=$(find "$SEQ_ROOT/target/debug/deps" -name 'libstarknet_transaction_prover-*.rlib' | head -1) \
  --extern serde_json=$(find "$SEQ_ROOT/target/debug/deps" -name 'libserde_json-*.rlib' | head -1) \
  --extern tokio=$(find "$SEQ_ROOT/target/debug/deps" -name 'libtokio-*.rlib' | head -1) \
  --edition=2021 -o /tmp/snip36_prove_runner_bin
/tmp/snip36_prove_runner_bin
