#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPS_DIR="$PROJECT_DIR/deps"
PROVER_BIN="$DEPS_DIR/bin/stwo-run-and-prove"
OUTPUT_DIR="$PROJECT_DIR/output"
PARAMS="$PROJECT_DIR/sample-input/prover_params.json"

echo "=== SNIP-36 Stwo Prover — Pipeline Test ==="
echo ""

# Check prover binary
if [ ! -f "$PROVER_BIN" ]; then
    echo "ERROR: stwo-run-and-prove not found at $PROVER_BIN"
    echo "Run ./scripts/setup.sh first."
    exit 1
fi

# Find array_sum test program in proving-utils resources
ARRAY_SUM=$(find "$DEPS_DIR/proving-utils" -name "array_sum*.json" -path "*/resources/*" | head -1)
if [ -z "$ARRAY_SUM" ]; then
    echo "ERROR: array_sum test program not found in proving-utils resources."
    echo "Searching for any suitable test program..."
    ARRAY_SUM=$(find "$DEPS_DIR/proving-utils" -name "*.json" -path "*/resources/*" | head -1)
fi

if [ -z "$ARRAY_SUM" ]; then
    echo "ERROR: No test programs found in deps/proving-utils."
    echo "Ensure proving-utils was cloned correctly."
    exit 1
fi

echo "Test program: $ARRAY_SUM"
echo ""

mkdir -p "$OUTPUT_DIR"
TEST_PROOF="$OUTPUT_DIR/test_array_sum.proof"

# Resolve to absolute paths (required by stwo-run-and-prove)
ARRAY_SUM="$(cd "$(dirname "$ARRAY_SUM")" && pwd)/$(basename "$ARRAY_SUM")"
PARAMS="$(cd "$(dirname "$PARAMS")" && pwd)/$(basename "$PARAMS")"
TEST_PROOF_ABS="$(cd "$(dirname "$TEST_PROOF")" && pwd)/$(basename "$TEST_PROOF")"

echo "[1/2] Proving array_sum..."
"$PROVER_BIN" \
    --program "$ARRAY_SUM" \
    --prover_params_json "$PARAMS" \
    --proof_path "$TEST_PROOF_ABS" \
    --verify

echo ""
if [ -f "$TEST_PROOF" ]; then
    PROOF_SIZE=$(wc -c < "$TEST_PROOF" | tr -d ' ')
    echo "[2/2] Proof generated and verified successfully!"
    echo "  Location: $TEST_PROOF"
    echo "  Size:     $PROOF_SIZE bytes"
else
    echo "[2/2] ERROR: Proof file not created."
    exit 1
fi

echo ""
echo "=== Pipeline test passed ==="
