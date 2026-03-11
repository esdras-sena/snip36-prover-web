#!/usr/bin/env bash
set -euo pipefail

# Submit an INVOKE_FUNCTION with proof + proof_facts to the Starknet gateway.
#
# Submits directly to the gateway's /gateway/add_transaction endpoint using
# the gateway transaction format (not JSON-RPC).

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

GATEWAY_URL_DEFAULT="https://privacy-starknet-integration.starknet.io"

usage() {
    echo "Usage: $0 (--proof <cairo-serde-file> | --proof-base64 <base64-file>) --sender <address> --calldata <hex,...> [OPTIONS]"
    echo ""
    echo "Submit an INVOKE_FUNCTION with a SNIP-36 proof to the Starknet gateway."
    echo ""
    echo "Required (one of):"
    echo "  --proof <path>          Path to stwo proof file (cairo-serde JSON, will be converted)"
    echo "  --proof-base64 <path>   Path to proof file already in base64 format"
    echo ""
    echo "Required:"
    echo "  --sender <address>      Sender account address"
    echo "  --calldata <hex,...>     Calldata as comma-separated hex felts"
    echo ""
    echo "Options:"
    echo "  --proof-facts <path>    Path to proof_facts JSON file"
    echo "  --gateway-url <URL>     Gateway base URL (default: $GATEWAY_URL_DEFAULT)"
    echo "  --rpc-url <URL>         RPC endpoint for nonce lookup (default: \$STARKNET_RPC_URL)"
    echo "  --nonce <hex>           Transaction nonce (default: auto-fetch via RPC)"
    echo "  -h, --help              Show this help"
    exit 0
}

PROOF_FILE=""
PROOF_BASE64_FILE=""
PROOF_FACTS_FILE=""
SENDER=""
CALLDATA=""
GATEWAY_URL="$GATEWAY_URL_DEFAULT"
RPC_URL="${STARKNET_RPC_URL:-}"
NONCE=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --proof)
            PROOF_FILE="$2"
            shift 2
            ;;
        --proof-base64)
            PROOF_BASE64_FILE="$2"
            shift 2
            ;;
        --proof-facts)
            PROOF_FACTS_FILE="$2"
            shift 2
            ;;
        --sender)
            SENDER="$2"
            shift 2
            ;;
        --calldata)
            CALLDATA="$2"
            shift 2
            ;;
        --gateway-url)
            GATEWAY_URL="$2"
            shift 2
            ;;
        --rpc-url)
            RPC_URL="$2"
            shift 2
            ;;
        --nonce)
            NONCE="$2"
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

if [ -z "$PROOF_FILE" ] && [ -z "$PROOF_BASE64_FILE" ]; then
    echo "ERROR: --proof or --proof-base64 is required."
    echo ""
    usage
fi

if [ -z "$SENDER" ] || [ -z "$CALLDATA" ]; then
    echo "ERROR: --sender and --calldata are required."
    echo ""
    usage
fi

if [ -z "$RPC_URL" ]; then
    echo "ERROR: --rpc-url is required (or set STARKNET_RPC_URL)."
    exit 1
fi

if [ -n "$PROOF_BASE64_FILE" ]; then
    if [ ! -f "$PROOF_BASE64_FILE" ]; then
        echo "ERROR: Proof file not found: $PROOF_BASE64_FILE"
        exit 1
    fi
    echo "Reading base64 proof..."
    PROOF_B64=$(cat "$PROOF_BASE64_FILE")
    echo "  Proof base64 length: ${#PROOF_B64} chars"
elif [ -n "$PROOF_FILE" ]; then
    if [ ! -f "$PROOF_FILE" ]; then
        echo "ERROR: Proof file not found: $PROOF_FILE"
        exit 1
    fi
    echo "Converting proof to base64 packed u32 format..."
    PROOF_B64=$(python3 "$SCRIPT_DIR/convert-proof.py" "$PROOF_FILE")
    echo "  Proof base64 length: ${#PROOF_B64} chars"
fi

# Load proof_facts if provided
PROOF_FACTS_JSON="[]"
if [ -n "$PROOF_FACTS_FILE" ]; then
    if [ ! -f "$PROOF_FACTS_FILE" ]; then
        echo "ERROR: Proof facts file not found: $PROOF_FACTS_FILE"
        exit 1
    fi
    PROOF_FACTS_JSON=$(cat "$PROOF_FACTS_FILE")
    echo "  Proof facts loaded from $PROOF_FACTS_FILE"
fi

# Auto-fetch nonce if not provided
if [ -z "$NONCE" ]; then
    echo "Fetching nonce for $SENDER..."
    NONCE_RESPONSE=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"method\": \"starknet_getNonce\",
            \"params\": {
                \"block_id\": \"latest\",
                \"contract_address\": \"$SENDER\"
            },
            \"id\": 1
        }")
    NONCE=$(echo "$NONCE_RESPONSE" | jq -r '.result // "0x0"')
    echo "  Nonce: $NONCE"
fi

# Build calldata JSON array
CALLDATA_JSON="["
IFS=',' read -ra CALLDATA_PARTS <<< "$CALLDATA"
for i in "${!CALLDATA_PARTS[@]}"; do
    if [ "$i" -gt 0 ]; then
        CALLDATA_JSON+=","
    fi
    CALLDATA_JSON+="\"${CALLDATA_PARTS[$i]}\""
done
CALLDATA_JSON+="]"

# Build the gateway transaction payload.
# The gateway expects INVOKE_FUNCTION format with uppercase resource bound keys.
# Written to a temp file because proof can be several MB.
PAYLOAD_FILE=$(mktemp)
trap 'rm -f "$PAYLOAD_FILE"' EXIT

cat > "$PAYLOAD_FILE" <<EOF
{
    "type": "INVOKE_FUNCTION",
    "version": "0x3",
    "sender_address": "$SENDER",
    "calldata": $CALLDATA_JSON,
    "nonce": "$NONCE",
    "resource_bounds": {
        "L1_GAS": {"max_amount": "0x0", "max_price_per_unit": "0xe8d4a51000"},
        "L2_GAS": {"max_amount": "0x16e360", "max_price_per_unit": "0x2cb417800"},
        "L1_DATA_GAS": {"max_amount": "0x1b0", "max_price_per_unit": "0x5dc"}
    },
    "tip": "0x0",
    "paymaster_data": [],
    "account_deployment_data": [],
    "nonce_data_availability_mode": "L1",
    "fee_data_availability_mode": "L1",
    "signature": [],
    "proof": "$PROOF_B64",
    "proof_facts": $PROOF_FACTS_JSON
}
EOF

SUBMIT_URL="${GATEWAY_URL}/gateway/add_transaction"
PAYLOAD_SIZE=$(wc -c < "$PAYLOAD_FILE" | tr -d ' ')

echo ""
echo "Submitting INVOKE_FUNCTION with proof..."
echo "  Sender:  $SENDER"
echo "  Nonce:   $NONCE"
echo "  Gateway: $SUBMIT_URL"
echo "  Payload: $PAYLOAD_SIZE bytes"

RESPONSE=$(curl -s -X POST "$SUBMIT_URL" \
    -H "Content-Type: application/json" \
    -d @"$PAYLOAD_FILE" \
    --max-time 120)

echo ""
echo "Response:"
echo "$RESPONSE" | jq . 2>/dev/null || echo "$RESPONSE"

# Gateway returns different format than JSON-RPC:
#   Success: {"code": "TRANSACTION_RECEIVED", "transaction_hash": "0x..."}
#   Error:   {"code": "StarknetErrorCode.XXX", "message": "..."}
TX_HASH=$(echo "$RESPONSE" | jq -r '.transaction_hash // empty' 2>/dev/null)
GW_CODE=$(echo "$RESPONSE" | jq -r '.code // empty' 2>/dev/null)

if [ "$GW_CODE" = "TRANSACTION_RECEIVED" ] && [ -n "$TX_HASH" ]; then
    echo ""
    echo "SUCCESS: Transaction submitted"
    echo "  tx_hash: $TX_HASH"
    exit 0
fi

if echo "$GW_CODE" | grep -qi "INVALID_PROOF"; then
    echo ""
    echo "FAILED: INVALID_PROOF"
    echo "  Message: $(echo "$RESPONSE" | jq -r '.message // empty' 2>/dev/null)"
    exit 69
fi

if [ -n "$GW_CODE" ]; then
    echo ""
    echo "FAILED: $GW_CODE"
    echo "  Message: $(echo "$RESPONSE" | jq -r '.message // empty' 2>/dev/null)"
    exit 1
fi

echo ""
echo "FAILED: Unexpected response"
exit 1
