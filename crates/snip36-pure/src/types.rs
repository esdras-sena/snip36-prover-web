use serde::{Deserialize, Serialize};
use starknet_types_core::felt::Felt;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceBound {
    pub max_amount: u64,
    pub max_price_per_unit: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceBounds {
    pub l1_gas: ResourceBound,
    pub l2_gas: ResourceBound,
    pub l1_data_gas: ResourceBound,
}

const SEPOLIA_GAS_PRICE_CEIL: u128 = 0x38d7ea4c68000;

impl Default for ResourceBounds {
    fn default() -> Self {
        Self {
            l1_gas: ResourceBound { max_amount: 0x10000, max_price_per_unit: SEPOLIA_GAS_PRICE_CEIL },
            l2_gas: ResourceBound { max_amount: 0x7000000, max_price_per_unit: 0x1dcd65000 },
            l1_data_gas: ResourceBound { max_amount: 0x1b0, max_price_per_unit: SEPOLIA_GAS_PRICE_CEIL },
        }
    }
}

impl ResourceBounds {
    pub fn zero_fee() -> Self {
        Self {
            l1_gas: ResourceBound { max_amount: 0, max_price_per_unit: 0 },
            l2_gas: ResourceBound { max_amount: 0x7000000, max_price_per_unit: 0 },
            l1_data_gas: ResourceBound { max_amount: 0x1b0, max_price_per_unit: 0 },
        }
    }

    pub fn to_rpc_json(&self) -> serde_json::Value {
        serde_json::json!({
            "l1_gas": {
                "max_amount": format!("{:#x}", self.l1_gas.max_amount),
                "max_price_per_unit": format!("{:#x}", self.l1_gas.max_price_per_unit),
            },
            "l2_gas": {
                "max_amount": format!("{:#x}", self.l2_gas.max_amount),
                "max_price_per_unit": format!("{:#x}", self.l2_gas.max_price_per_unit),
            },
            "l1_data_gas": {
                "max_amount": format!("{:#x}", self.l1_data_gas.max_amount),
                "max_price_per_unit": format!("{:#x}", self.l1_data_gas.max_price_per_unit),
            },
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snip36ProofArtifact {
    pub version: u32,
    pub block_number: u64,
    pub rpc_url: String,
    pub chain_id: String,
    pub strk_fee_token_address: String,
    pub tx_hash: Option<String>,
    pub transaction: serde_json::Value,
    pub execution_payload: Option<String>,
    pub proof_facts_preimage: Option<Vec<String>>,
    pub raw_messages: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snip36ProofBundle {
    pub artifact: Snip36ProofArtifact,
    pub proof_base64: Option<String>,
    pub proof_facts: Vec<String>,
    pub raw_messages: Option<serde_json::Value>,
    pub proof_size: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snip36PayloadInput {
    pub sender_address: String,
    pub private_key: String,
    pub calldata: Vec<String>,
    pub proof_base64: String,
    pub proof_facts: Vec<String>,
    pub nonce: String,
    pub chain_id: String,
    #[serde(default)]
    pub resource_bounds: Option<ResourceBounds>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snip36TransactionInput {
    pub sender_address: String,
    pub private_key: String,
    pub calldata: Vec<String>,
    pub nonce: String,
    pub chain_id: String,
    #[serde(default)]
    pub resource_bounds: Option<ResourceBounds>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snip36TransactionOutput {
    pub tx_hash: String,
    pub transaction: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snip36PayloadOutput {
    pub tx_hash: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct SubmitParams {
    pub sender_address: Felt,
    pub private_key: Felt,
    pub calldata: Vec<Felt>,
    pub proof_base64: String,
    pub proof_facts: Vec<Felt>,
    pub nonce: Felt,
    pub chain_id: Felt,
    pub resource_bounds: ResourceBounds,
}
