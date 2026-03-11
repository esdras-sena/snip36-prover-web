# SNIP-36 E2E Test Suite

End-to-end test that validates the full SNIP-36 virtual block pipeline against the Starknet Integration Sepolia test environment.

## Test Flow

```
1. Compile + declare + deploy minimal Cairo counter contract (scarb/sncast)
2. Invoke increment() to establish on-chain state
3. Wait for tx inclusion, record block_number + tx_hash
4. Run virtual OS against block N-1 (pre-execution state) → proof + proof_facts
5. Validate proof format (base64 check, optional local stwo verification)
6. Sign tx with proof_facts-inclusive hash and submit to gateway
7. Assert: tx accepted (TRANSACTION_RECEIVED)
```

## Prerequisites

- `scarb` — contract compilation
- `sncast` — starknet-foundry (declare/deploy/invoke)
- `python3` — transaction signing (starknet-py, poseidon-py required in venv)
- `curl` + `jq` — RPC calls
- `./scripts/setup.sh` already run (prover + runner built)
- `deps/sequencer/` cloned and built at DEMO-19 with `nightly-2025-07-14`

## Environment Variables

| Variable | Default | Required |
|----------|---------|----------|
| `STARKNET_RPC_URL` | (see .env) | Yes |
| `STARKNET_ACCOUNT_ADDRESS` | — | Yes |
| `STARKNET_PRIVATE_KEY` | — | Yes |
| `PROVER_URL` | — | No (uses local runner if unset) |

## Running

```bash
source .env
export STARKNET_RPC_URL STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY

./tests/e2e-test.sh
```

## Files

| File | Description |
|------|-------------|
| `e2e-test.sh` | Main orchestrator — runs all steps sequentially |
| `contracts/` | Minimal Cairo counter contract (Scarb project) |
| `wait-for-tx.sh` | Polls `starknet_getTransactionStatus` until accepted |
| `submit-proof.sh` | Submits `INVOKE_FUNCTION` with proof to gateway (unsigned, for testing) |
| `sign-and-submit.py` | Computes proof_facts-inclusive tx hash, signs, and submits to gateway |
| `convert-proof.py` | Converts cairo-serde proof to base64 packed u32 format (legacy) |

## Proof Format

The DEMO-19 runner + stwo prover outputs proofs in **binary format** (`ProofFormat::Binary`):

1. Prover: `CairoProofForRustVerifier` → `bincode::serialize` → bzip2 → file
2. Runner: decompresses → encodes to `Vec<u32>` (BE + padding prefix) → base64 string
3. The proof is returned as a base64 string in the JSON-RPC response

The `proof_facts` are a JSON array of hex felt values containing:
- `PROOF0` marker
- `VIRTUAL_SNOS` marker
- Virtual OS program hash
- `VIRTUAL_SNOS0` marker
- Block number, block hash, OS config hash
- L2→L1 message count and hashes

## Transaction Signing

Proof-bearing transactions require the `proof_facts` to be included in the Poseidon transaction hash chain. Standard Starknet SDKs (starknet-py, starknet.js) do **not** include this, producing an incorrect hash and "invalid signature" errors.

Use `sign-and-submit.py` which computes the correct hash:

```bash
source sequencer_venv/bin/activate
source .env
export STARKNET_RPC_URL STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY

python3 tests/sign-and-submit.py \
    output/e2e/e2e.proof \
    output/e2e/e2e.proof_facts \
    "0x1,0xCONTRACT,0xSELECTOR,0x1,0x1" \
    "0xCONTRACT"
```

## Individual Script Usage

### wait-for-tx.sh

```bash
./tests/wait-for-tx.sh --tx-hash 0x123... --rpc-url $RPC --timeout 120
# Outputs: block number (to stdout)
```

### submit-proof.sh (unsigned, for testing)

```bash
./tests/submit-proof.sh \
    --proof-base64 output/e2e/e2e.proof \
    --proof-facts output/e2e/e2e.proof_facts \
    --sender 0x... \
    --calldata "0x1,0x...,0x...,0x1,0x1"
# Exit 0 = success, Exit 69 = INVALID_PROOF
```

### sign-and-submit.py (signed, production)

```bash
python3 tests/sign-and-submit.py <proof_b64_file> <proof_facts_file> <calldata_csv> <contract_address>
# Requires: STARKNET_ACCOUNT_ADDRESS, STARKNET_PRIVATE_KEY env vars
```
