#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPS_DIR="$PROJECT_DIR/deps"
PROVER_BIN="$DEPS_DIR/bin/stwo-run-and-prove"
DEFAULT_PARAMS="$PROJECT_DIR/sample-input/prover_params.json"

usage() {
    echo "Usage: $0 --program <compiled.json> --output <proof-path> [OPTIONS]"
    echo ""
    echo "Prove a compiled Cairo program using the stwo prover."
    echo ""
    echo "Required:"
    echo "  --program <path>   Path to compiled Cairo program (JSON)"
    echo "  --output <path>    Output path for the proof"
    echo ""
    echo "Options:"
    echo "  --input <path>     Program input (JSON), if the program requires it"
    echo "  --params <path>    Prover parameters (default: sample-input/prover_params.json)"
    echo "  --verify           Verify the proof after generation"
    echo "  -h, --help         Show this help"
    exit 0
}

PROGRAM=""
OUTPUT=""
INPUT=""
PARAMS="$DEFAULT_PARAMS"
VERIFY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --program)
            PROGRAM="$2"
            shift 2
            ;;
        --output)
            OUTPUT="$2"
            shift 2
            ;;
        --input)
            INPUT="$2"
            shift 2
            ;;
        --params)
            PARAMS="$2"
            shift 2
            ;;
        --verify)
            VERIFY=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo "Unknown option: $1"
            usage
            ;;
    esac
done

if [ -z "$PROGRAM" ] || [ -z "$OUTPUT" ]; then
    echo "ERROR: --program and --output are required."
    echo ""
    usage
fi

if [ ! -f "$PROVER_BIN" ]; then
    echo "ERROR: stwo-run-and-prove not found at $PROVER_BIN"
    echo "Run ./scripts/setup.sh first."
    exit 1
fi

if [ ! -f "$PROGRAM" ]; then
    echo "ERROR: Program file not found: $PROGRAM"
    exit 1
fi

# Resolve to absolute paths (required by stwo-run-and-prove)
PROGRAM="$(cd "$(dirname "$PROGRAM")" && pwd)/$(basename "$PROGRAM")"
PARAMS="$(cd "$(dirname "$PARAMS")" && pwd)/$(basename "$PARAMS")"
OUTPUT_ABS="$(mkdir -p "$(dirname "$OUTPUT")" && cd "$(dirname "$OUTPUT")" && pwd)/$(basename "$OUTPUT")"

# Build prover command
PROVER_ARGS=(
    --program "$PROGRAM"
    --prover_params_json "$PARAMS"
    --proof_path "$OUTPUT_ABS"
)

if [ -n "$INPUT" ]; then
    INPUT="$(cd "$(dirname "$INPUT")" && pwd)/$(basename "$INPUT")"
    PROVER_ARGS+=(--program_input "$INPUT")
fi

if [ "$VERIFY" = true ]; then
    PROVER_ARGS+=(--verify)
fi

# Create output directory
mkdir -p "$(dirname "$OUTPUT")"

echo "=== Proving Cairo Program ==="
echo "  Program: $PROGRAM"
echo "  Params:  $PARAMS"
echo "  Output:  $OUTPUT"
if [ -n "$INPUT" ]; then
    echo "  Input:   $INPUT"
fi
if [ "$VERIFY" = true ]; then
    echo "  Verify:  yes"
fi
echo ""

"$PROVER_BIN" "${PROVER_ARGS[@]}"

echo ""
echo "=== Proof generated ==="
echo "  Location: $OUTPUT"
if [ -f "$OUTPUT" ]; then
    PROOF_SIZE=$(wc -c < "$OUTPUT" | tr -d ' ')
    echo "  Size:     $PROOF_SIZE bytes"
fi
