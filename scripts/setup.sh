#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DEPS_DIR="$PROJECT_DIR/deps"

# Versions
PROVING_UTILS_VERSION="main"
SEQUENCER_TAG="APOLLO-PRE-PROOF-DEMO-19"
STWO_NIGHTLY="nightly-2025-07-14"

echo "=== SNIP-36 Virtual OS Stwo Prover — Setup ==="
echo ""

# --- Rust toolchains ---
echo "[1/7] Checking Rust toolchains..."
if ! command -v rustup &>/dev/null; then
    echo "  Installing rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
fi

echo "  Installing $STWO_NIGHTLY (required by stwo 2.1.0)..."
rustup toolchain install "$STWO_NIGHTLY"

echo "  rustup: $(rustup --version 2>/dev/null || echo 'not found')"
echo ""

# --- Clone proving-utils ---
echo "[2/7] Setting up proving-utils..."
mkdir -p "$DEPS_DIR"
if [ -d "$DEPS_DIR/proving-utils/.git" ]; then
    echo "  Already cloned at $DEPS_DIR/proving-utils"
else
    echo "  Cloning starkware-libs/proving-utils..."
    git clone https://github.com/starkware-libs/proving-utils.git "$DEPS_DIR/proving-utils"
fi
echo "  Checking out $PROVING_UTILS_VERSION..."
git -C "$DEPS_DIR/proving-utils" checkout "$PROVING_UTILS_VERSION" --quiet

# Install the exact Rust nightly version from proving-utils
if [ -f "$DEPS_DIR/proving-utils/rust-toolchain.toml" ]; then
    NIGHTLY_VERSION=$(grep 'channel' "$DEPS_DIR/proving-utils/rust-toolchain.toml" | sed 's/.*"\(.*\)".*/\1/')
    echo "  Installing Rust toolchain: $NIGHTLY_VERSION"
    rustup toolchain install "$NIGHTLY_VERSION"
    rustup override set "$NIGHTLY_VERSION" --path "$DEPS_DIR/proving-utils"
fi
echo ""

# --- Clone sequencer ---
echo "[3/7] Setting up sequencer..."
if [ -d "$DEPS_DIR/sequencer/.git" ]; then
    echo "  Already cloned at $DEPS_DIR/sequencer"
else
    echo "  Cloning starkware-libs/sequencer..."
    git clone https://github.com/starkware-libs/sequencer.git "$DEPS_DIR/sequencer"
fi
echo "  Checking out $SEQUENCER_TAG..."
git -C "$DEPS_DIR/sequencer" checkout "$SEQUENCER_TAG" --quiet

# Apply macOS RLIMIT_AS fix
RLIMIT_FILE="$DEPS_DIR/sequencer/crates/apollo_compilation_utils/src/resource_limits/resource_limits_unix.rs"
if [ "$(uname)" = "Darwin" ] && ! grep -q 'target_os = "macos"' "$RLIMIT_FILE" 2>/dev/null; then
    echo "  Applying macOS RLIMIT_AS fix..."
    # Replace the memory_size field to skip RLIMIT_AS on macOS
    python3 -c "
import re
with open('$RLIMIT_FILE') as f:
    content = f.read()
# Only patch if not already patched
if 'target_os' not in content:
    old = '''memory_size: memory_size.map(|y| RLimit {
                resource: Resource::AS,
                soft_limit: y,
                hard_limit: y,
                units: \"bytes\".to_string(),
            }),'''
    new = '''// macOS does not support RLIMIT_AS; skip on Apple targets.
            memory_size: if cfg!(target_os = \"macos\") {
                None
            } else {
                memory_size.map(|y| RLimit {
                    resource: Resource::AS,
                    soft_limit: y,
                    hard_limit: y,
                    units: \"bytes\".to_string(),
                })
            },'''
    content = content.replace(old, new)
    with open('$RLIMIT_FILE', 'w') as f:
        f.write(content)
    print('  Patched.')
else:
    print('  Already patched.')
"
fi
echo ""

# --- Python venv ---
echo "[4/7] Setting up Python virtual environment..."
VENV_DIR="$PROJECT_DIR/sequencer_venv"
if [ -d "$VENV_DIR" ]; then
    echo "  Venv already exists at $VENV_DIR"
else
    echo "  Creating venv..."
    python3 -m venv "$VENV_DIR"
fi

echo "  Installing Python dependencies..."
"$VENV_DIR/bin/pip" install --quiet -r "$DEPS_DIR/sequencer/scripts/requirements.txt"
"$VENV_DIR/bin/pip" install --quiet starknet-py poseidon-py
echo ""

# --- Build stwo-run-and-prove ---
echo "[5/7] Building stwo-run-and-prove..."
mkdir -p "$DEPS_DIR/bin"
echo "  Building in $DEPS_DIR/proving-utils (this may take several minutes)..."
cargo build --release --manifest-path "$DEPS_DIR/proving-utils/Cargo.toml" -p stwo-run-and-prove

# Find and copy the binary
BINARY_PATH=$(find "$DEPS_DIR/proving-utils/target/release" -maxdepth 1 -name "stwo-run-and-prove" -type f | head -1)
if [ -z "$BINARY_PATH" ]; then
    echo "  ERROR: stwo-run-and-prove binary not found after build"
    exit 1
fi
cp "$BINARY_PATH" "$DEPS_DIR/bin/stwo-run-and-prove"
chmod +x "$DEPS_DIR/bin/stwo-run-and-prove"
echo "  Binary: $DEPS_DIR/bin/stwo-run-and-prove"
echo ""

# --- Build starknet_os_runner ---
echo "[6/7] Building starknet_os_runner (requires $STWO_NIGHTLY + venv)..."
echo "  This requires the stwo_proving feature and may take several minutes..."
(
    export PATH="$VENV_DIR/bin:$PATH"
    cargo +"$STWO_NIGHTLY" build --release \
        --manifest-path "$DEPS_DIR/sequencer/Cargo.toml" \
        -p starknet_os_runner --features stwo_proving
)
RUNNER_BIN="$DEPS_DIR/sequencer/target/release/starknet_os_runner"
if [ -f "$RUNNER_BIN" ]; then
    echo "  Binary: $RUNNER_BIN"
else
    echo "  WARNING: starknet_os_runner binary not found after build"
fi
echo ""

# --- Copy bootloader program ---
echo "[7/7] Locating bootloader program..."
BOOTLOADER_PATH=$(find "$DEPS_DIR/proving-utils" -name "simple_bootloader*.json" -path "*/resources/*" | head -1)
if [ -n "$BOOTLOADER_PATH" ]; then
    cp "$BOOTLOADER_PATH" "$DEPS_DIR/bin/bootloader_program.json"
    echo "  Bootloader program: $DEPS_DIR/bin/bootloader_program.json"
else
    echo "  WARNING: Bootloader program not found in proving-utils resources."
    echo "  The prove-pie.sh script will need a bootloader program to function."
fi
echo ""

# --- Verify ---
echo "=== Verification ==="
if "$DEPS_DIR/bin/stwo-run-and-prove" --help &>/dev/null; then
    echo "  stwo-run-and-prove: OK"
else
    echo "  WARNING: stwo-run-and-prove --help returned non-zero (may still be functional)."
fi

if [ -f "$RUNNER_BIN" ] && "$RUNNER_BIN" --help &>/dev/null; then
    echo "  starknet_os_runner: OK"
else
    echo "  WARNING: starknet_os_runner not available or not functional."
fi

echo ""
echo "=== Setup complete ==="
echo ""
echo "  Prover binary: $DEPS_DIR/bin/stwo-run-and-prove"
echo "  Runner binary: $RUNNER_BIN"
echo "  Python venv:   $VENV_DIR"
echo ""
echo "  Next steps:"
echo "    1. cp .env.example .env  # Configure account credentials"
echo "    2. source .env && export STARKNET_RPC_URL STARKNET_ACCOUNT_ADDRESS STARKNET_PRIVATE_KEY"
echo "    3. ./tests/e2e-test.sh   # Run full E2E test"
