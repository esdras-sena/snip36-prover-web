#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPS_DIR="$PROJECT_DIR/deps"
PROVER_BIN="$DEPS_DIR/bin/stwo-run-and-prove"
BOOTLOADER_PROGRAM="$DEPS_DIR/bin/bootloader_program.json"
DEFAULT_PARAMS="$PROJECT_DIR/sample-input/prover_params.json"
TEMPLATE="$PROJECT_DIR/sample-input/bootloader_input_template.json"

usage() {
    echo "Usage: $0 --pie <path.zip> --output <proof-path> [OPTIONS]"
    echo ""
    echo "Prove a Cairo PIE via the bootloader using the stwo prover."
    echo "This mirrors the production proving pipeline for virtual OS execution output."
    echo ""
    echo "Required:"
    echo "  --pie <path>       Path to Cairo PIE file (.pie.zip)"
    echo "  --output <path>    Output path for the proof"
    echo ""
    echo "Options:"
    echo "  --bootloader <path>  Bootloader program (default: deps/bin/bootloader_program.json)"
    echo "  --params <path>      Prover parameters (default: sample-input/prover_params.json)"
    echo "  --verify             Verify the proof after generation"
    echo "  -h, --help           Show this help"
    exit 0
}

PIE=""
OUTPUT=""
PARAMS="$DEFAULT_PARAMS"
VERIFY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --pie)
            PIE="$2"
            shift 2
            ;;
        --output)
            OUTPUT="$2"
            shift 2
            ;;
        --bootloader)
            BOOTLOADER_PROGRAM="$2"
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

if [ -z "$PIE" ] || [ -z "$OUTPUT" ]; then
    echo "ERROR: --pie and --output are required."
    echo ""
    usage
fi

if [ ! -f "$PROVER_BIN" ]; then
    echo "ERROR: stwo-run-and-prove not found at $PROVER_BIN"
    echo "Run ./scripts/setup.sh first."
    exit 1
fi

if [ ! -f "$PIE" ]; then
    echo "ERROR: PIE file not found: $PIE"
    exit 1
fi

if [ ! -f "$BOOTLOADER_PROGRAM" ]; then
    echo "ERROR: Bootloader program not found at $BOOTLOADER_PROGRAM"
    echo "Run ./scripts/setup.sh to set up dependencies."
    exit 1
fi

# Resolve PIE to absolute path for the input JSON
PIE_ABS="$(cd "$(dirname "$PIE")" && pwd)/$(basename "$PIE")"

# Generate SimpleBootloaderInput from template
TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

INPUT_FILE="$TMPDIR/bootloader_input.json"
sed "s|{{PIE_PATH}}|$PIE_ABS|g" "$TEMPLATE" > "$INPUT_FILE"

# Create output directory
mkdir -p "$(dirname "$OUTPUT")"

echo "=== Proving Cairo PIE via Bootloader ==="
echo "  PIE:        $PIE"
echo "  Bootloader: $BOOTLOADER_PROGRAM"
echo "  Params:     $PARAMS"
echo "  Output:     $OUTPUT"
if [ "$VERIFY" = true ]; then
    echo "  Verify:     yes"
fi
echo ""

# Resolve to absolute paths (required by stwo-run-and-prove)
BOOTLOADER_PROGRAM="$(cd "$(dirname "$BOOTLOADER_PROGRAM")" && pwd)/$(basename "$BOOTLOADER_PROGRAM")"
PARAMS="$(cd "$(dirname "$PARAMS")" && pwd)/$(basename "$PARAMS")"
OUTPUT_ABS="$(mkdir -p "$(dirname "$OUTPUT")" && cd "$(dirname "$OUTPUT")" && pwd)/$(basename "$OUTPUT")"

# Build prover command
PROVER_ARGS=(
    --program "$BOOTLOADER_PROGRAM"
    --prover_params_json "$PARAMS"
    --program_input "$INPUT_FILE"
    --proof_path "$OUTPUT_ABS"
)

if [ "$VERIFY" = true ]; then
    PROVER_ARGS+=(--verify)
fi

"$PROVER_BIN" "${PROVER_ARGS[@]}"

echo ""
echo "=== Proof generated ==="
echo "  Location: $OUTPUT"
if [ -f "$OUTPUT" ]; then
    PROOF_SIZE=$(wc -c < "$OUTPUT" | tr -d ' ')
    echo "  Size:     $PROOF_SIZE bytes"
fi
