#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPS_DIR="$PROJECT_DIR/deps"
OUTPUT_DIR="$PROJECT_DIR/output"

usage() {
    echo "Usage: $0 [--program <path>]"
    echo ""
    echo "Extract the compiled virtual OS program to JSON."
    echo ""
    echo "Options:"
    echo "  --program <path>  Use a pre-built virtual OS program instead of extracting"
    echo "  -h, --help        Show this help"
    echo ""
    echo "Without --program, this builds the extractor crate (requires deps/sequencer/)"
    echo "and dumps VIRTUAL_OS_PROGRAM_BYTES to output/virtual_os_program.json."
    exit 0
}

PREBUILT_PROGRAM=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --program)
            PREBUILT_PROGRAM="$2"
            shift 2
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

mkdir -p "$OUTPUT_DIR"

if [ -n "$PREBUILT_PROGRAM" ]; then
    echo "Using pre-built program: $PREBUILT_PROGRAM"
    if [ ! -f "$PREBUILT_PROGRAM" ]; then
        echo "ERROR: File not found: $PREBUILT_PROGRAM"
        exit 1
    fi
    cp "$PREBUILT_PROGRAM" "$OUTPUT_DIR/virtual_os_program.json"
    echo "Copied to: $OUTPUT_DIR/virtual_os_program.json"
    exit 0
fi

# Build and run the extractor
echo "=== Extracting Virtual OS Program ==="
echo ""

if [ ! -d "$DEPS_DIR/sequencer" ]; then
    echo "ERROR: deps/sequencer/ not found."
    echo "Run ./scripts/setup.sh and choose to clone the sequencer repo,"
    echo "or use --program <path> to provide a pre-built program."
    exit 1
fi

echo "[1/2] Building extractor..."
cargo build --release --manifest-path "$PROJECT_DIR/extractor/Cargo.toml"
echo ""

echo "[2/2] Extracting virtual OS program..."
EXTRACTOR_BIN="$PROJECT_DIR/extractor/target/release/virtual-os-extractor"
if [ ! -f "$EXTRACTOR_BIN" ]; then
    EXTRACTOR_BIN="$PROJECT_DIR/target/release/virtual-os-extractor"
fi

"$EXTRACTOR_BIN" "$OUTPUT_DIR/virtual_os_program.json"
echo ""
echo "Virtual OS program: $OUTPUT_DIR/virtual_os_program.json"
