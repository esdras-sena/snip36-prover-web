#!/usr/bin/env python3
"""Convert cairo-serde proof (JSON array of hex FELT strings) to base64 packed u32 format.

The SNIP-36 write API (BROADCASTED_INVOKE_TXN) expects the proof field as a
base64-encoded string of big-endian packed u32 values. The stwo prover outputs
cairo-serde format: a JSON array of hex field element strings.

This script reads the cairo-serde JSON, packs each felt value as a big-endian
u32 word, and outputs the base64-encoded result to stdout.

Usage:
    python3 convert-proof.py <proof.json>
    python3 convert-proof.py <proof.json> --output <proof.b64>
"""

import base64
import json
import struct
import sys


def felt_to_u32(felt_hex: str) -> int:
    """Parse a hex felt string to an unsigned 32-bit integer.

    Felts in the proof are expected to fit in u32 range (0..2^32-1).
    Values larger than u32 are masked to the lower 32 bits.
    """
    value = int(felt_hex, 16)
    return value & 0xFFFFFFFF


def convert_proof(proof_felts: list[str]) -> bytes:
    """Pack an array of hex felt strings as big-endian u32 values."""
    packed = bytearray()
    for felt in proof_felts:
        u32_val = felt_to_u32(felt)
        packed.extend(struct.pack(">I", u32_val))
    return bytes(packed)


def main():
    if len(sys.argv) < 2:
        print("Usage: convert-proof.py <proof.json> [--output <file>]", file=sys.stderr)
        sys.exit(1)

    proof_path = sys.argv[1]
    output_path = None

    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_path = sys.argv[idx + 1]

    with open(proof_path, "r") as f:
        proof_felts = json.load(f)

    if not isinstance(proof_felts, list):
        print("ERROR: Expected JSON array of hex strings", file=sys.stderr)
        sys.exit(1)

    packed = convert_proof(proof_felts)
    b64_str = base64.b64encode(packed).decode("ascii")

    if output_path:
        with open(output_path, "w") as f:
            f.write(b64_str)
        print(f"Wrote {len(b64_str)} chars to {output_path}", file=sys.stderr)
    else:
        sys.stdout.write(b64_str)


if __name__ == "__main__":
    main()
