#!/usr/bin/env bash
set -euo pipefail

# SNIP-36 End-to-End Test
#
# Full pipeline: deploy contract → invoke → virtual OS → prove → submit proof
#
# Required env vars:
#   STARKNET_ACCOUNT_ADDRESS  - Funded account address on test network
#   STARKNET_PRIVATE_KEY      - Private key for the account
#
# Optional env vars:
#   STARKNET_RPC_URL          - RPC endpoint (required)
#   PROVER_URL                - Remote prover URL (skip local starknet_os_runner)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTPUT_DIR="$PROJECT_DIR/output/e2e"

# Environment
STARKNET_RPC_URL="${STARKNET_RPC_URL:?ERROR: STARKNET_RPC_URL is required}"
STARKNET_ACCOUNT_ADDRESS="${STARKNET_ACCOUNT_ADDRESS:?ERROR: STARKNET_ACCOUNT_ADDRESS is required}"
STARKNET_PRIVATE_KEY="${STARKNET_PRIVATE_KEY:?ERROR: STARKNET_PRIVATE_KEY is required}"

PROVER_URL="${PROVER_URL:-}"

export STARKNET_RPC_URL STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY

ACCOUNT_NAME="e2e-test-account-2"

PASS_COUNT=0
FAIL_COUNT=0
STEP=0

step() {
    STEP=$((STEP + 1))
    echo ""
    echo "=========================================="
    echo "  STEP $STEP: $1"
    echo "=========================================="
    echo ""
}

pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo ""
    echo "  PASS: $1"
    echo ""
}

fail() {
    FAIL_COUNT=$((FAIL_COUNT + 1))
    echo ""
    echo "  FAIL: $1"
    echo ""
}

# Extract a hex value after a given key from sncast output
# Matches "class_hash", "Class Hash", "class hash", etc. (case-insensitive, flexible separator)
extract_hex() {
    local key="$1"
    local text="$2"
    # Replace underscores with regex-friendly pattern to match both spaces and underscores
    local pattern
    pattern=$(echo "$key" | sed 's/_/[_ ]/g')
    echo "$text" | grep -i "$pattern" | grep -o '0x[0-9a-fA-F]\+' | head -1
}

# Nonce tracking file (persists across subshells created by $())
NONCE_FILE=$(mktemp)
trap 'rm -f "$NONCE_FILE"' EXIT

# Get next usable nonce. First call probes the mempool; subsequent calls increment.
get_next_nonce() {
    local saved
    saved=$(cat "$NONCE_FILE" 2>/dev/null)

    if [ -n "$saved" ]; then
        echo "$saved"
        echo $((saved + 1)) > "$NONCE_FILE"
        return
    fi

    local on_chain_nonce
    on_chain_nonce=$(curl -s -X POST "$STARKNET_RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\":\"2.0\",\"method\":\"starknet_getNonce\",
            \"params\":{\"block_id\":\"latest\",\"contract_address\":\"$STARKNET_ACCOUNT_ADDRESS\"},
            \"id\":1
        }" | jq -r '.result')

    # Probe with on-chain nonce to see if mempool accepts it
    local probe
    probe=$(curl -s -X POST "$STARKNET_RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\":\"2.0\",\"method\":\"starknet_addInvokeTransaction\",
            \"params\":{\"invoke_transaction\":{
                \"type\":\"INVOKE\",\"version\":\"0x3\",
                \"sender_address\":\"$STARKNET_ACCOUNT_ADDRESS\",
                \"calldata\":[\"0x0\"],\"nonce\":\"$on_chain_nonce\",
                \"resource_bounds\":{\"l1_gas\":{\"max_amount\":\"0x0\",\"max_price_per_unit\":\"0x0\"},\"l2_gas\":{\"max_amount\":\"0x0\",\"max_price_per_unit\":\"0x0\"},\"l1_data_gas\":{\"max_amount\":\"0x0\",\"max_price_per_unit\":\"0x0\"}},
                \"tip\":\"0x0\",\"paymaster_data\":[],\"account_deployment_data\":[],
                \"nonce_data_availability_mode\":\"L1\",\"fee_data_availability_mode\":\"L1\",\"signature\":[]
            }},\"id\":1
        }")

    # Parse "Expected: N    nonce    M, got: X" from error
    local expected_min
    expected_min=$(echo "$probe" | jq -r '.error.data // empty' | grep -o 'Expected: [0-9]*' | grep -o '[0-9]*')

    if [ -n "$expected_min" ]; then
        echo $((expected_min + 1)) > "$NONCE_FILE"
        echo "$expected_min"
    else
        local dec_nonce
        dec_nonce=$(printf "%d" "$on_chain_nonce")
        echo $((dec_nonce + 1)) > "$NONCE_FILE"
        echo "$dec_nonce"
    fi
}

# Check prerequisites (only tools needed for steps 1-5)
check_prereqs() {
    local missing=0
    for cmd in scarb sncast curl jq python3; do
        if ! command -v "$cmd" &>/dev/null; then
            echo "ERROR: $cmd not found in PATH"
            missing=1
        fi
    done

    if [ ! -f "$PROJECT_DIR/deps/bin/stwo-run-and-prove" ]; then
        echo "ERROR: stwo-run-and-prove not found. Run ./scripts/setup.sh first."
        missing=1
    fi

    # sequencer is checked later at step 6 (it's optional for early steps)

    if [ "$missing" -eq 1 ]; then
        exit 1
    fi
}

echo "=== SNIP-36 End-to-End Test ==="
echo ""
echo "  RPC:     $STARKNET_RPC_URL"
echo "  Account: $STARKNET_ACCOUNT_ADDRESS"
echo ""

check_prereqs
mkdir -p "$OUTPUT_DIR"

# ──────────────────────────────────────────────
# STEP 0: Import account into sncast
# ──────────────────────────────────────────────
step "Import account into sncast"

sncast \
    account import \
    --name "$ACCOUNT_NAME" \
    --address "$STARKNET_ACCOUNT_ADDRESS" \
    --private-key "$STARKNET_PRIVATE_KEY" \
    --type oz \
    --url "$STARKNET_RPC_URL" \
    --silent \
    2>&1 || true

# Verify account is usable by fetching nonce
NONCE_CHECK=$(curl -s -X POST "$STARKNET_RPC_URL" \
    -H "Content-Type: application/json" \
    -d "{
        \"jsonrpc\": \"2.0\",
        \"method\": \"starknet_getNonce\",
        \"params\": {
            \"block_id\": \"latest\",
            \"contract_address\": \"$STARKNET_ACCOUNT_ADDRESS\"
        },
        \"id\": 1
    }")

NONCE_VAL=$(echo "$NONCE_CHECK" | jq -r '.result // empty')
if [ -n "$NONCE_VAL" ]; then
    pass "Account imported (nonce: $NONCE_VAL)"
else
    echo "  Response: $NONCE_CHECK"
    fail "Could not verify account on-chain"
    exit 1
fi

# ──────────────────────────────────────────────
# STEP 1: Compile the counter contract
# ──────────────────────────────────────────────
step "Compile counter contract"

CONTRACT_DIR="$SCRIPT_DIR/contracts"
cd "$CONTRACT_DIR"
scarb build 2>&1

# Find the compiled contract artifacts
SIERRA_FILE=$(find "$CONTRACT_DIR/target/dev" -name "*.contract_class.json" 2>/dev/null | head -1)
CASM_FILE=$(find "$CONTRACT_DIR/target/dev" -name "*.compiled_contract_class.json" 2>/dev/null | head -1)

if [ -n "$SIERRA_FILE" ] && [ -n "$CASM_FILE" ]; then
    pass "Contract compiled"
    echo "  Sierra: $SIERRA_FILE"
    echo "  CASM:   $CASM_FILE"
else
    fail "Contract compilation failed — missing artifacts"
    exit 1
fi

cd "$PROJECT_DIR"

# ──────────────────────────────────────────────
# STEP 2: Declare the contract class
# ──────────────────────────────────────────────
step "Declare contract class"

# Find next usable nonce (mempool may have pending txs)
NEXT_NONCE=$(get_next_nonce)
echo "  Using nonce: $NEXT_NONCE"

DECLARE_OUTPUT=$(cd "$CONTRACT_DIR" && sncast \
    --account "$ACCOUNT_NAME" \
    declare \
    --url "$STARKNET_RPC_URL" \
    --contract-name Counter \
    --nonce "$NEXT_NONCE" \
    2>&1) || true

echo "  sncast declare output:"
echo "  $DECLARE_OUTPUT"

# If already declared, no nonce was consumed — roll back
if echo "$DECLARE_OUTPUT" | grep -qi "already declared"; then
    echo "$NEXT_NONCE" > "$NONCE_FILE"
fi

CLASS_HASH=$(extract_hex "class_hash" "$DECLARE_OUTPUT")
if [ -z "$CLASS_HASH" ]; then
    # May already be declared — try to extract hash from error
    CLASS_HASH=$(echo "$DECLARE_OUTPUT" | grep -o '0x[0-9a-fA-F]\{50,\}' | head -1 || true)
fi

if [ -n "$CLASS_HASH" ]; then
    pass "Contract declared"
    echo "  Class hash: $CLASS_HASH"
else
    fail "Could not determine class hash"
    exit 1
fi

# ──────────────────────────────────────────────
# STEP 3: Deploy the contract
# ──────────────────────────────────────────────
step "Deploy counter contract"

SALT="0x$(openssl rand -hex 16)"
NEXT_NONCE=$(get_next_nonce)
echo "  Using nonce: $NEXT_NONCE"
DEPLOY_OUTPUT=$(sncast \
    --account "$ACCOUNT_NAME" \
    deploy \
    --url "$STARKNET_RPC_URL" \
    --class-hash "$CLASS_HASH" \
    --salt "$SALT" \
    --nonce "$NEXT_NONCE" \
    2>&1) || true

echo "  sncast deploy output:"
echo "  $DEPLOY_OUTPUT"

CONTRACT_ADDRESS=$(extract_hex "contract_address" "$DEPLOY_OUTPUT")
DEPLOY_TX_HASH=$(extract_hex "transaction_hash" "$DEPLOY_OUTPUT")

if [ -n "$CONTRACT_ADDRESS" ]; then
    pass "Contract deployed"
    echo "  Address: $CONTRACT_ADDRESS"
    echo "  tx_hash: $DEPLOY_TX_HASH"
else
    fail "Could not determine contract address"
    exit 1
fi

# ──────────────────────────────────────────────
# STEP 3b: Wait for deploy tx inclusion
# ──────────────────────────────────────────────
step "Wait for deploy tx inclusion"

# Must wait for deploy to be confirmed before invoking, otherwise both txs
# may land in the same block, making it impossible to prove the invoke against
# a block where the contract is deployed.
DEPLOY_BLOCK=$("$SCRIPT_DIR/wait-for-tx.sh" \
    --tx-hash "$DEPLOY_TX_HASH" \
    --rpc-url "$STARKNET_RPC_URL" \
    --timeout 120) || true

if [ -n "$DEPLOY_BLOCK" ] && [ "$DEPLOY_BLOCK" != "0" ]; then
    pass "Deploy confirmed in block $DEPLOY_BLOCK"
else
    fail "Could not confirm deploy tx inclusion"
    exit 1
fi

# ──────────────────────────────────────────────
# STEP 4: Invoke increment() to establish state
# ──────────────────────────────────────────────
step "Invoke increment(1)"

NEXT_NONCE=$(get_next_nonce)
echo "  Using nonce: $NEXT_NONCE"
INVOKE_OUTPUT=$(sncast \
    --account "$ACCOUNT_NAME" \
    invoke \
    --url "$STARKNET_RPC_URL" \
    --contract-address "$CONTRACT_ADDRESS" \
    --function "increment" \
    --calldata 0x1 \
    --nonce "$NEXT_NONCE" \
    2>&1) || true

echo "  sncast invoke output:"
echo "  $INVOKE_OUTPUT"

INVOKE_TX_HASH=$(extract_hex "transaction_hash" "$INVOKE_OUTPUT")

if [ -n "$INVOKE_TX_HASH" ]; then
    pass "Invoke submitted"
    echo "  tx_hash: $INVOKE_TX_HASH"
else
    fail "Could not determine invoke tx hash"
    exit 1
fi

# ──────────────────────────────────────────────
# STEP 5: Wait for tx inclusion
# ──────────────────────────────────────────────
step "Wait for tx inclusion"

BLOCK_NUMBER=$("$SCRIPT_DIR/wait-for-tx.sh" \
    --tx-hash "$INVOKE_TX_HASH" \
    --rpc-url "$STARKNET_RPC_URL" \
    --timeout 120) || true

if [ -n "$BLOCK_NUMBER" ] && [ "$BLOCK_NUMBER" != "0" ]; then
    pass "Tx included in block $BLOCK_NUMBER"
else
    fail "Could not confirm tx inclusion"
    exit 1
fi

# ──────────────────────────────────────────────
# STEP 6: Run virtual OS + prove transaction
# ──────────────────────────────────────────────
step "Run virtual OS and prove transaction"

if [ -z "$PROVER_URL" ] && [ ! -d "$PROJECT_DIR/deps/sequencer" ]; then
    fail "No prover available — set PROVER_URL or run ./scripts/setup.sh with sequencer."
    echo ""
    echo "=========================================="
    echo "  E2E TEST SUMMARY (partial)"
    echo "=========================================="
    echo ""
    echo "  Passed: $PASS_COUNT"
    echo "  Failed: $FAIL_COUNT"
    echo "  Skipped: Steps 6-8 (no prover available)"
    echo ""
    echo "  Contract address: $CONTRACT_ADDRESS"
    echo "  Invoke tx:        $INVOKE_TX_HASH"
    echo "  Block number:     $BLOCK_NUMBER"
    echo ""
    echo "  To continue manually:"
    echo "    PROVER_URL=http://... ./tests/e2e-test.sh"
    echo "    # or: ./scripts/run-virtual-os.sh --block-number $BLOCK_NUMBER --tx-hash $INVOKE_TX_HASH --rpc-url $STARKNET_RPC_URL"
    exit 1
fi

PROOF_OUTPUT="$OUTPUT_DIR/e2e.proof"

# starknet_proveTransaction executes the tx on top of the given block's state.
# Since the tx is already included in BLOCK_NUMBER, we use BLOCK_NUMBER-1
# so the prover starts from the pre-execution state (correct nonce, storage, etc).
PROVE_BLOCK=$((BLOCK_NUMBER - 1))
echo "  Proving against block $PROVE_BLOCK (tx included in $BLOCK_NUMBER)"

PROVE_ARGS=(
    --block-number "$PROVE_BLOCK"
    --tx-hash "$INVOKE_TX_HASH"
    --rpc-url "$STARKNET_RPC_URL"
    --output "$PROOF_OUTPUT"
)

if [ -n "$PROVER_URL" ]; then
    PROVE_ARGS+=(--prover-url "$PROVER_URL")
    echo "  Using remote prover: $PROVER_URL"
else
    # Detect STRK fee token address from a recent tx receipt Transfer event
    STRK_FEE_TOKEN=$(curl -s -X POST "$STARKNET_RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\":\"2.0\",\"method\":\"starknet_getTransactionReceipt\",
            \"params\":{\"transaction_hash\":\"$INVOKE_TX_HASH\"},\"id\":1
        }" | jq -r '.result.events[] | select(.keys[0] == "0x99cd8bde557814842a3121e8ddfd433a539b8c9f14bf31ebf108d12e6196e9") | .from_address' | head -1)
    echo "  STRK fee token: $STRK_FEE_TOKEN"
    PROVE_ARGS+=(--strk-fee-token "$STRK_FEE_TOKEN")
fi

"$PROJECT_DIR/scripts/run-virtual-os.sh" "${PROVE_ARGS[@]}"

if [ -f "$PROOF_OUTPUT" ]; then
    PROOF_SIZE=$(wc -c < "$PROOF_OUTPUT" | tr -d ' ')
    pass "Proof generated ($PROOF_SIZE bytes)"
else
    fail "Proof file not created"
    exit 1
fi

# ──────────────────────────────────────────────
# STEP 7: Validate proof format + local verification
# ──────────────────────────────────────────────
step "Validate proof format + local verification"

# The runner now outputs proof directly as base64 — no conversion needed.
PROOF_B64=$(cat "$PROOF_OUTPUT")
B64_LEN=${#PROOF_B64}

if [ "$B64_LEN" -gt 0 ]; then
    echo "  Proof is base64 ($B64_LEN chars)"
else
    fail "Proof file is empty"
    exit 1
fi

# Local stwo verification if the verifier binary is available
VERIFIER_BIN="$PROJECT_DIR/deps/sequencer/target/release/proof_verifier_cli"
PROOF_FACTS_FILE="${PROOF_OUTPUT%.proof}.proof_facts"
if [ -f "$VERIFIER_BIN" ] && [ -f "$PROOF_FACTS_FILE" ]; then
    echo "  Running local stwo verification..."
    if "$VERIFIER_BIN" "$PROOF_OUTPUT" "$PROOF_FACTS_FILE"; then
        pass "Proof verified locally + proof_facts match"
    else
        fail "Local proof verification FAILED"
        exit 1
    fi
else
    pass "Proof is base64 ($B64_LEN chars) — local verifier not available, skipping"
fi

# ──────────────────────────────────────────────
# STEP 8: Sign and submit proof to gateway
# ──────────────────────────────────────────────
step "Sign and submit proof to gateway"

# Build calldata for the invoke: call increment(1) on the counter contract
# Standard Starknet multicall format:
#   [num_calls, to, selector, calldata_len, ...calldata]
# selector for increment = starknet_keccak("increment")
INCREMENT_SELECTOR="0x0362398bec32bc0ebb411203221a35a0301b12b34582b6d226f55c31265069d"

CALLDATA="0x1,$CONTRACT_ADDRESS,$INCREMENT_SELECTOR,0x1,0x1"

PROOF_FACTS_FILE="${PROOF_OUTPUT%.proof}.proof_facts"

# Use sign-and-submit.py which computes the proof_facts-inclusive tx hash and signs it.
# Requires the sequencer venv with starknet-py and poseidon-py.
VENV_PYTHON="$PROJECT_DIR/sequencer_venv/bin/python3"
if [ ! -f "$VENV_PYTHON" ]; then
    echo "  WARNING: sequencer_venv not found, falling back to system python3"
    VENV_PYTHON="python3"
fi

export STARKNET_GATEWAY_URL="${STARKNET_GATEWAY_URL:-https://privacy-starknet-integration.starknet.io}"

if "$VENV_PYTHON" "$SCRIPT_DIR/sign-and-submit.py" \
    "$PROOF_OUTPUT" \
    "$PROOF_FACTS_FILE" \
    "$CALLDATA" \
    "$CONTRACT_ADDRESS"; then
    pass "Proof accepted by gateway (signed submission)"
else
    SUBMIT_EXIT=$?
    fail "Proof submission failed (exit code $SUBMIT_EXIT)"
fi

# ──────────────────────────────────────────────
# Summary
# ──────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  E2E TEST SUMMARY"
echo "=========================================="
echo ""
echo "  Passed: $PASS_COUNT"
echo "  Failed: $FAIL_COUNT"
echo "  Total:  $((PASS_COUNT + FAIL_COUNT))"
echo ""

if [ "$FAIL_COUNT" -eq 0 ]; then
    echo "  RESULT: ALL TESTS PASSED"
    exit 0
else
    echo "  RESULT: $FAIL_COUNT TEST(S) FAILED"
    exit 1
fi
