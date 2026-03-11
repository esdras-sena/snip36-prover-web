#!/usr/bin/env python3
"""Sign and submit a SNIP-36 proof-bearing INVOKE transaction to the gateway.

This script computes the transaction hash INCLUDING proof_facts (as per the
privacy gateway's modified hash computation), signs it, and submits.
"""

import json
import os
import sys
import urllib.request
import urllib.error

from poseidon_py.poseidon_hash import poseidon_hash_many
from starknet_py.hash.utils import message_signature
from starknet_py.net.signer.stark_curve_signer import KeyPair


# "invoke" as felt = felt_from_short_string("invoke")
INVOKE_PREFIX = int.from_bytes(b"invoke", "big")

# Resource name constants (7 bytes each, left-padded to 56 bits)
L1_GAS_NAME = int.from_bytes(b"\x00L1_GAS", "big")  # "L1_GAS"
L2_GAS_NAME = int.from_bytes(b"\x00L2_GAS", "big")  # "L2_GAS"
L1_DATA_GAS_NAME = int.from_bytes(b"L1_DATA", "big")  # Truncated


def felt_from_resource_name(name: str) -> int:
    """Convert resource name to 7-byte value used in concat_resource."""
    b = name.encode("ascii")
    if len(b) > 7:
        b = b[:7]
    return int.from_bytes(b, "big")


def concat_resource(max_amount: int, max_price: int, resource_name: str) -> int:
    """Compute [0 | resource_name (56 bit) | max_amount (64 bit) | max_price_per_unit (128 bit)]."""
    name_int = felt_from_resource_name(resource_name)
    # Pack into 32 bytes: [0(1)] [name(7)] [amount(8)] [price(16)]
    result = (name_int << 192) | (max_amount << 128) | max_price
    return result


def compute_tip_resource_bounds_hash(
    tip: int,
    l1_gas_amount: int,
    l1_gas_price: int,
    l2_gas_amount: int,
    l2_gas_price: int,
    l1_data_gas_amount: int,
    l1_data_gas_price: int,
) -> int:
    """Compute tip_resource_bounds_hash as per SNIP-8."""
    l1_concat = concat_resource(l1_gas_amount, l1_gas_price, "L1_GAS")
    l2_concat = concat_resource(l2_gas_amount, l2_gas_price, "L2_GAS")
    l1_data_concat = concat_resource(
        l1_data_gas_amount, l1_data_gas_price, "L1_DATA"
    )
    return poseidon_hash_many([tip, l1_concat, l2_concat, l1_data_concat])


def compute_invoke_v3_tx_hash(
    sender_address: int,
    calldata: list[int],
    chain_id: int,
    nonce: int,
    tip: int,
    l1_gas_amount: int,
    l1_gas_price: int,
    l2_gas_amount: int,
    l2_gas_price: int,
    l1_data_gas_amount: int,
    l1_data_gas_price: int,
    paymaster_data: list[int],
    account_deployment_data: list[int],
    nonce_da_mode: int,  # 0 = L1
    fee_da_mode: int,  # 0 = L1
    proof_facts: list[int],
) -> int:
    """Compute invoke v3 transaction hash including proof_facts."""
    tip_rb_hash = compute_tip_resource_bounds_hash(
        tip,
        l1_gas_amount,
        l1_gas_price,
        l2_gas_amount,
        l2_gas_price,
        l1_data_gas_amount,
        l1_data_gas_price,
    )

    paymaster_data_hash = poseidon_hash_many(paymaster_data) if paymaster_data else poseidon_hash_many([])
    account_deployment_data_hash = poseidon_hash_many(account_deployment_data) if account_deployment_data else poseidon_hash_many([])
    calldata_hash = poseidon_hash_many(calldata) if calldata else poseidon_hash_many([])

    # data_availability_mode: [0...0 (192 bit) | nonce_mode (32 bit) | fee_mode (32 bit)]
    da_mode = (nonce_da_mode << 32) | fee_da_mode

    version = 3

    # Build hash chain
    elements = [
        INVOKE_PREFIX,
        version,
        sender_address,
        tip_rb_hash,
        paymaster_data_hash,
        chain_id,
        nonce,
        da_mode,
        account_deployment_data_hash,
        calldata_hash,
    ]

    # Append proof_facts_hash if non-empty
    if proof_facts:
        proof_facts_hash = poseidon_hash_many(proof_facts)
        elements.append(proof_facts_hash)

    return poseidon_hash_many(elements)


def main():
    if len(sys.argv) < 5:
        print(
            "Usage: sign-and-submit.py <proof_b64_file> <proof_facts_file> <calldata_csv> <contract_address>"
        )
        sys.exit(1)

    proof_b64_file = sys.argv[1]
    proof_facts_file = sys.argv[2]
    calldata_csv = sys.argv[3]
    contract_address = sys.argv[4]

    # Environment
    rpc_url = os.environ["STARKNET_RPC_URL"]
    sender = os.environ["STARKNET_ACCOUNT_ADDRESS"]
    private_key = os.environ["STARKNET_PRIVATE_KEY"]
    gateway_url = os.environ.get(
        "STARKNET_GATEWAY_URL",
        "https://privacy-starknet-integration.starknet.io",
    )

    # Read proof
    with open(proof_b64_file) as f:
        proof_b64 = f.read().strip()

    # Read proof facts
    with open(proof_facts_file) as f:
        proof_facts_raw = json.load(f)

    # Convert proof_facts from hex strings to ints
    proof_facts = [int(x, 16) for x in proof_facts_raw]

    # Parse calldata
    calldata = [int(x, 16) for x in calldata_csv.split(",")]

    # Fetch nonce
    nonce_req = urllib.request.Request(
        rpc_url,
        data=json.dumps(
            {
                "jsonrpc": "2.0",
                "method": "starknet_getNonce",
                "params": {"block_id": "latest", "contract_address": sender},
                "id": 1,
            }
        ).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(nonce_req) as resp:
        nonce_result = json.loads(resp.read())
    nonce = int(nonce_result["result"], 16)
    print(f"  Nonce: {hex(nonce)}")

    # Resource bounds matching the original invoke tx
    l1_gas_max_amount = 0
    l1_gas_max_price = 0xE8D4A51000  # 1000000000000
    l2_gas_max_amount = 0x7000000  # 117,440,512 (~117M, enough for proof verification)
    l2_gas_max_price = 0x2CB417800  # 12000000000
    l1_data_gas_max_amount = 0x1B0  # 432
    l1_data_gas_max_price = 0x5DC  # 1500

    # SN_INTEGRATION_SEPOLIA chain id
    chain_id = int.from_bytes(b"SN_INTEGRATION_SEPOLIA", "big")

    # Compute transaction hash with proof_facts
    tx_hash = compute_invoke_v3_tx_hash(
        sender_address=int(sender, 16),
        calldata=calldata,
        chain_id=chain_id,
        nonce=nonce,
        tip=0,
        l1_gas_amount=l1_gas_max_amount,
        l1_gas_price=l1_gas_max_price,
        l2_gas_amount=l2_gas_max_amount,
        l2_gas_price=l2_gas_max_price,
        l1_data_gas_amount=l1_data_gas_max_amount,
        l1_data_gas_price=l1_data_gas_max_price,
        paymaster_data=[],
        account_deployment_data=[],
        nonce_da_mode=0,  # L1
        fee_da_mode=0,  # L1
        proof_facts=proof_facts,
    )
    print(f"  Tx hash (with proof_facts): {hex(tx_hash)}")

    # Also compute without proof_facts for comparison
    tx_hash_no_proof = compute_invoke_v3_tx_hash(
        sender_address=int(sender, 16),
        calldata=calldata,
        chain_id=chain_id,
        nonce=nonce,
        tip=0,
        l1_gas_amount=l1_gas_max_amount,
        l1_gas_price=l1_gas_max_price,
        l2_gas_amount=l2_gas_max_amount,
        l2_gas_price=l2_gas_max_price,
        l1_data_gas_amount=l1_data_gas_max_amount,
        l1_data_gas_price=l1_data_gas_max_price,
        paymaster_data=[],
        account_deployment_data=[],
        nonce_da_mode=0,
        fee_da_mode=0,
        proof_facts=[],
    )
    print(f"  Tx hash (without proof_facts): {hex(tx_hash_no_proof)}")

    # Sign with proof_facts-inclusive hash
    key_pair = KeyPair.from_private_key(int(private_key, 16))
    r, s = message_signature(tx_hash, key_pair.private_key)
    print(f"  Signature: [{hex(r)}, {hex(s)}]")
    print(f"  Proof facts: {[hex(f) for f in proof_facts]}")

    # Build payload
    calldata_json = [hex(c) for c in calldata]

    payload = {
        "type": "INVOKE_FUNCTION",
        "version": "0x3",
        "sender_address": sender,
        "calldata": calldata_json,
        "nonce": hex(nonce),
        "resource_bounds": {
            "L1_GAS": {
                "max_amount": hex(l1_gas_max_amount),
                "max_price_per_unit": hex(l1_gas_max_price),
            },
            "L2_GAS": {
                "max_amount": hex(l2_gas_max_amount),
                "max_price_per_unit": hex(l2_gas_max_price),
            },
            "L1_DATA_GAS": {
                "max_amount": hex(l1_data_gas_max_amount),
                "max_price_per_unit": hex(l1_data_gas_max_price),
            },
        },
        "tip": "0x0",
        "paymaster_data": [],
        "account_deployment_data": [],
        "nonce_data_availability_mode": "L1",
        "fee_data_availability_mode": "L1",
        "signature": [hex(r), hex(s)],
        "proof": proof_b64,
        "proof_facts": proof_facts_raw,
    }

    # Write to temp file and submit
    import tempfile

    with tempfile.NamedTemporaryFile(
        mode="w", suffix=".json", delete=False
    ) as f:
        json.dump(payload, f)
        payload_file = f.name

    payload_size = os.path.getsize(payload_file)
    submit_url = f"{gateway_url}/gateway/add_transaction"

    print(f"\nSubmitting INVOKE_FUNCTION with proof...")
    print(f"  Sender:  {sender}")
    print(f"  Nonce:   {hex(nonce)}")
    print(f"  Gateway: {submit_url}")
    print(f"  Payload: {payload_size} bytes")

    req = urllib.request.Request(
        submit_url,
        data=open(payload_file, "rb").read(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            response = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"\nHTTP {e.code} response:")
        try:
            response = json.loads(body)
            print(json.dumps(response, indent=2))
        except json.JSONDecodeError:
            print(body[:500])
        sys.exit(1)
    except urllib.error.URLError as e:
        print(f"\nConnection error: {e}")
        sys.exit(1)
    finally:
        os.unlink(payload_file)

    print(f"\nResponse:")
    print(json.dumps(response, indent=2))

    if response.get("code") == "TRANSACTION_RECEIVED":
        print(f"\nSUCCESS: tx_hash = {response.get('transaction_hash')}")
    else:
        print(f"\nFAILED: {response.get('code')}")
        sys.exit(1)


if __name__ == "__main__":
    main()
