#!/usr/bin/env bash
set -euo pipefail

# Poll starknet_getTransactionStatus until ACCEPTED_ON_L2 or timeout.
# Outputs the block number the transaction landed in.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
    echo "Usage: $0 --tx-hash <HASH> [OPTIONS]"
    echo ""
    echo "Poll transaction status until accepted or timeout."
    echo ""
    echo "Required:"
    echo "  --tx-hash <HASH>       Transaction hash to poll"
    echo ""
    echo "Options:"
    echo "  --rpc-url <URL>        Starknet RPC endpoint (default: \$STARKNET_RPC_URL)"
    echo "  --timeout <seconds>    Max wait time (default: 120)"
    echo "  --interval <seconds>   Poll interval (default: 5)"
    echo "  -h, --help             Show this help"
    exit 0
}

TX_HASH=""
RPC_URL="${STARKNET_RPC_URL:?ERROR: STARKNET_RPC_URL is required}"
TIMEOUT=120
INTERVAL=5

while [[ $# -gt 0 ]]; do
    case "$1" in
        --tx-hash)
            TX_HASH="$2"
            shift 2
            ;;
        --rpc-url)
            RPC_URL="$2"
            shift 2
            ;;
        --timeout)
            TIMEOUT="$2"
            shift 2
            ;;
        --interval)
            INTERVAL="$2"
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

if [ -z "$TX_HASH" ]; then
    echo "ERROR: --tx-hash is required."
    echo ""
    usage
fi

echo "Waiting for tx $TX_HASH ..." >&2

ELAPSED=0
while [ "$ELAPSED" -lt "$TIMEOUT" ]; do
    RESPONSE=$(curl -s -X POST "$RPC_URL" \
        -H "Content-Type: application/json" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"method\": \"starknet_getTransactionStatus\",
            \"params\": {\"transaction_hash\": \"$TX_HASH\"},
            \"id\": 1
        }")

    # Check for RPC error
    ERROR=$(echo "$RESPONSE" | jq -r '.error // empty')
    if [ -n "$ERROR" ]; then
        echo "  RPC error: $ERROR" >&2
        sleep "$INTERVAL"
        ELAPSED=$((ELAPSED + INTERVAL))
        continue
    fi

    STATUS=$(echo "$RESPONSE" | jq -r '.result.finality_status // empty')

    if [ "$STATUS" = "ACCEPTED_ON_L2" ] || [ "$STATUS" = "ACCEPTED_ON_L1" ]; then
        echo "  Status: $STATUS" >&2

        # Get block number from receipt
        RECEIPT=$(curl -s -X POST "$RPC_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"jsonrpc\": \"2.0\",
                \"method\": \"starknet_getTransactionReceipt\",
                \"params\": {\"transaction_hash\": \"$TX_HASH\"},
                \"id\": 1
            }")

        BLOCK_NUM=$(echo "$RECEIPT" | jq -r '.result.block_number // empty')
        if [ -n "$BLOCK_NUM" ]; then
            echo "  Block: $BLOCK_NUM" >&2
            echo "$BLOCK_NUM"
            exit 0
        fi

        # If block_number not in receipt, try getTransactionByHash
        TX_INFO=$(curl -s -X POST "$RPC_URL" \
            -H "Content-Type: application/json" \
            -d "{
                \"jsonrpc\": \"2.0\",
                \"method\": \"starknet_getTransactionByHash\",
                \"params\": {\"transaction_hash\": \"$TX_HASH\"},
                \"id\": 1
            }")

        BLOCK_NUM=$(echo "$TX_INFO" | jq -r '.result.block_number // empty')
        if [ -n "$BLOCK_NUM" ]; then
            echo "  Block: $BLOCK_NUM" >&2
            echo "$BLOCK_NUM"
            exit 0
        fi

        echo "WARNING: Tx accepted but could not determine block number" >&2
        echo "0"
        exit 0
    fi

    if [ "$STATUS" = "REJECTED" ]; then
        echo "  ERROR: Transaction REJECTED" >&2
        EXEC_STATUS=$(echo "$RESPONSE" | jq -r '.result.execution_status // empty')
        echo "  Execution status: $EXEC_STATUS" >&2
        exit 1
    fi

    echo "  Status: ${STATUS:-PENDING} (${ELAPSED}s/${TIMEOUT}s)" >&2
    sleep "$INTERVAL"
    ELAPSED=$((ELAPSED + INTERVAL))
done

echo "ERROR: Timeout waiting for tx $TX_HASH after ${TIMEOUT}s" >&2
exit 1
