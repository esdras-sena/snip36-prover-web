# SNIP-36 Virtual OS Stwo Prover

Developer tooling for proving SNIP-36 virtual block execution using the stwo-cairo prover.

## Overview

[SNIP-36](https://community.starknet.io/t/snip-36-virtual-blocks/) introduces **virtual blocks** — off-chain execution of a single `INVOKE_FUNCTION` transaction against a reference Starknet block, proven via the stwo-cairo prover. The virtual OS is a stripped-down Starknet OS (Cairo 1 only, restricted syscalls, single transaction, no block preprocessing).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  SNIP-36 End-to-End Pipeline                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Deploy & Invoke (sncast)                                    │
│     declare → deploy → invoke → wait for inclusion              │
│                                                                 │
│  2. Prove (starknet_os_runner + stwo-run-and-prove)             │
│     ┌──────────────┐   ┌──────────────┐   ┌─────────────────┐  │
│     │ Virtual OS   │──>│ stwo-run-    │──>│ Proof (base64)  │  │
│     │ Execution    │   │ and-prove    │   │ + proof_facts   │  │
│     │ (RPC state)  │   │ (stwo prover)│   │                 │  │
│     └──────────────┘   └──────────────┘   └────────┬────────┘  │
│                                                     │           │
│  3. Submit (sign-and-submit.py)                     │           │
│     ┌──────────────┐   ┌──────────────┐   ┌────────▼────────┐  │
│     │ Compute tx   │──>│ ECDSA sign   │──>│ Gateway         │  │
│     │ hash (with   │   │ (private key)│   │ add_transaction │  │
│     │ proof_facts) │   │              │   │                 │  │
│     └──────────────┘   └──────────────┘   └─────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Git** — for cloning dependencies
- **Rust** — stable + `nightly-2025-07-14` (for stwo prover)
- **Python 3** — with starknet-py, poseidon-py (for transaction signing)
- **sncast** (Starknet Foundry) — for contract deployment and invocation
- **~10 GB disk** — for cloned repos + built binaries
- **Starknet RPC node** — for state reads during proving

## Quick Start

### 1. Set up dependencies

```bash
./scripts/setup.sh
```

This clones the sequencer and proving-utils repos, installs the nightly Rust toolchain, builds the runner and prover binaries, and sets up the Python venv.

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your account address, private key, and RPC URL
```

Required environment variables:
```
STARKNET_RPC_URL=http://ip:port/rpc/v0_10
STARKNET_ACCOUNT_ADDRESS=0x...
STARKNET_PRIVATE_KEY=0x...
```

### 3. Run the E2E test

```bash
source .env
export STARKNET_RPC_URL STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY
./tests/e2e-test.sh
```

This will deploy a counter contract, invoke it, prove the transaction, and submit the proof to the gateway.

## Full Pipeline (Step by Step)

### Step 1: Deploy and invoke a contract

Use `sncast` to declare, deploy, and invoke a contract on Starknet Integration Sepolia:

```bash
# Import account
sncast account import --name myaccount \
  --address $STARKNET_ACCOUNT_ADDRESS \
  --private-key $STARKNET_PRIVATE_KEY \
  --type oz --url $STARKNET_RPC_URL

# Declare + Deploy + Invoke
sncast --account myaccount declare --url $STARKNET_RPC_URL --contract-name Counter
sncast --account myaccount deploy --url $STARKNET_RPC_URL --class-hash 0x... --salt 0x...
sncast --account myaccount invoke --url $STARKNET_RPC_URL \
  --contract-address 0x... --function increment --calldata 0x1
```

Wait for the invoke transaction to be included in a block. Note the **block number** where it was included.

### Step 2: Generate the proof

Run the virtual OS against the block **before** the inclusion block (N-1), so the prover starts from pre-execution state:

```bash
export STWO_RUN_AND_PROVE_PATH=deps/bin/stwo-run-and-prove
export RAYON_NUM_THREADS=1  # limit memory usage on small machines

./scripts/run-virtual-os.sh \
  --block-number $((BLOCK_NUMBER - 1)) \
  --tx-hash $TX_HASH \
  --rpc-url $STARKNET_RPC_URL \
  --strk-fee-token $STRK_FEE_TOKEN \
  --output output/e2e/e2e.proof
```

This starts the `starknet_os_runner` locally, sends a `starknet_proveTransaction` JSON-RPC request, and writes the proof (base64) and proof_facts (JSON) to the output directory.

**Output files:**
- `output/e2e/e2e.proof` — Base64-encoded stwo proof (~1.4 MB for a simple tx)
- `output/e2e/e2e.proof_facts` — JSON array of felt values (block hash, OS config hash, etc.)

### Step 3: Sign and submit

The proof-bearing transaction requires a modified transaction hash that includes `proof_facts` in the Poseidon hash chain. Standard Starknet libraries don't include this — use the provided signing script:

```bash
source sequencer_venv/bin/activate
source .env
export STARKNET_RPC_URL STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY

python3 tests/sign-and-submit.py \
  output/e2e/e2e.proof \
  output/e2e/e2e.proof_facts \
  "0x1,$CONTRACT_ADDRESS,$FUNCTION_SELECTOR,0x1,0x1" \
  "$CONTRACT_ADDRESS"
```

The script:
1. Reads proof and proof_facts from files
2. Fetches the current nonce from the RPC
3. Computes the v3 invoke transaction hash **with proof_facts** appended to the Poseidon hash chain
4. Signs with ECDSA using the private key
5. Submits to the gateway's `/gateway/add_transaction` endpoint

On success, you'll see:
```
SUCCESS: tx_hash = 0x...
```

## Transaction Hash with proof_facts

The privacy gateway extends the standard Starknet v3 invoke transaction hash to include proof_facts:

```
Standard hash chain:
  [INVOKE, version, sender, tip_rb_hash, paymaster_hash,
   chain_id, nonce, da_mode, acct_deploy_hash, calldata_hash]

Extended hash chain (when proof_facts is non-empty):
  [INVOKE, version, sender, tip_rb_hash, paymaster_hash,
   chain_id, nonce, da_mode, acct_deploy_hash, calldata_hash,
   proof_facts_hash]

where proof_facts_hash = poseidon_hash_many(proof_facts_felts)
```

Standard starknet-py/starknet.js will compute the wrong hash — you must include proof_facts manually. See `tests/sign-and-submit.py` for the reference implementation.

## Gas Requirements

Proof-bearing transactions require significantly more L2 gas for on-chain proof verification:

| Resource | Min Amount | Min Price |
|----------|-----------|-----------|
| L1 Gas | 0 | 1,000,000,000,000 (0xe8d4a51000) |
| L2 Gas | **~75,000,000** (0x7000000 recommended) | 12,000,000,000 (0x2cb417800) |
| L1 Data Gas | 432 (0x1b0) | 1,500 (0x5dc) |

The L2 gas usage (~75M) is for the stwo proof verification in the account's `__validate__` entry point.

## Build Details

### Runner (starknet_os_runner)

The runner requires `nightly-2025-07-14` because stwo 2.1.0 uses unstable Rust features:

```bash
# Activate Python venv (needed for cairo-compile in build.rs)
source sequencer_venv/bin/activate

# Build with the exact nightly toolchain
cargo +nightly-2025-07-14 build --release \
  -p starknet_os_runner --features stwo_proving \
  --manifest-path deps/sequencer/Cargo.toml
```

**Important:** Newer nightlies will fail with `E0635: unknown feature 'array_chunks'` because this feature was stabilized after July 2025.

### Prover (stwo-run-and-prove)

```bash
cargo build --release -p stwo-run-and-prove \
  --manifest-path deps/proving-utils/Cargo.toml
cp deps/proving-utils/target/release/stwo-run-and-prove deps/bin/
```

### macOS Compatibility

The runner needs a patch to skip `RLIMIT_AS` (not supported on macOS). This is already applied in `resource_limits_unix.rs`:

```rust
memory_size: if cfg!(target_os = "macos") { None } else { ... }
```

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup.sh` | Install Rust, clone deps, build binaries, create venv |
| `scripts/run-virtual-os.sh` | Execute virtual OS and generate proof |
| `tests/e2e-test.sh` | Full E2E: deploy → invoke → prove → submit |
| `tests/submit-proof.sh` | Submit proof to gateway (unsigned, for testing) |
| `tests/sign-and-submit.py` | Sign proof tx with proof_facts hash and submit |

## Project Structure

```
snip36prover/
├── README.md
├── .env                          # Account credentials (not committed)
├── scripts/
│   ├── setup.sh                  # Environment setup
│   └── run-virtual-os.sh         # Execute virtual OS + prove
├── tests/
│   ├── e2e-test.sh               # Full E2E pipeline test
│   ├── submit-proof.sh           # Gateway submission (unsigned)
│   ├── sign-and-submit.py        # Signed gateway submission
│   ├── wait-for-tx.sh            # Wait for tx inclusion
│   └── contracts/                # Test counter contract (Cairo)
├── deps/                         # (generated) Cloned repositories
│   ├── proving-utils/            # stwo-run-and-prove source
│   ├── sequencer/                # starknet_os_runner source (DEMO-19)
│   └── bin/                      # Built binaries
│       ├── stwo-run-and-prove
│       └── bootloader_program.json
├── output/                       # (generated) Proofs and artifacts
│   └── e2e/
│       ├── e2e.proof             # Base64 stwo proof
│       └── e2e.proof_facts       # JSON proof facts
└── sequencer_venv/               # Python venv with starknet-py
```

## Environment

| Variable | Description | Default |
|----------|-------------|---------|
| `STARKNET_RPC_URL` | Starknet RPC endpoint | (see .env) |
| `STARKNET_ACCOUNT_ADDRESS` | Funded account address | (required) |
| `STARKNET_PRIVATE_KEY` | Account private key | (required) |
| `STARKNET_GATEWAY_URL` | Privacy gateway URL | `https://privacy-starknet-integration.starknet.io` |
| `STWO_RUN_AND_PROVE_PATH` | Path to prover binary | `deps/bin/stwo-run-and-prove` |
| `RAYON_NUM_THREADS` | Limit prover parallelism | (unset = all cores) |

## Key Dependencies

- [starkware-libs/sequencer](https://github.com/starkware-libs/sequencer) @ `APOLLO-PRE-PROOF-DEMO-19` — Virtual OS runner
- [starkware-libs/proving-utils](https://github.com/starkware-libs/proving-utils) — stwo-run-and-prove binary
- [starkware-libs/stwo](https://github.com/starkware-libs/stwo) v2.1.0 — Circle STARK prover
- [cairo-air](https://crates.io/crates/cairo-air) v1.1.0 — Cairo proof format (CairoProofForRustVerifier)

## References

- [SNIP-36 Specification](https://community.starknet.io/t/snip-36-virtual-blocks/)
- [stwo-cairo Prover](https://github.com/starkware-libs/stwo-cairo)
- [Starknet OS](https://github.com/starkware-libs/sequencer)

## License

Licensed under either of [Apache License, Version 2.0](LICENSE-APACHE) or [MIT License](LICENSE-MIT) at your option.
