use starknet_crypto::poseidon_hash_many;
use starknet_types_core::felt::Felt;

use crate::types::{ResourceBounds, Snip36PayloadInput, Snip36PayloadOutput, SubmitParams};

fn invoke_prefix() -> Felt {
    Felt::from_bytes_be_slice(b"invoke")
}

pub fn chain_id_felt(chain_id: &str) -> Felt {
    Felt::from_bytes_be_slice(chain_id.as_bytes())
}

fn resource_name_felt(name: &str) -> u64 {
    let bytes = name.as_bytes();
    let len = bytes.len().min(7);
    let mut buf = [0u8; 8];
    buf[8 - len..].copy_from_slice(&bytes[..len]);
    u64::from_be_bytes(buf)
}

fn concat_resource(max_amount: u64, max_price: u128, resource_name: &str) -> Felt {
    let name = resource_name_felt(resource_name) as u128;
    let high = (name << 64) | (max_amount as u128);
    let low = max_price;
    let high_felt = Felt::from(high);
    let shift = Felt::from(1u128 << 64).pow_felt(&Felt::TWO);
    high_felt * shift + Felt::from(low)
}

fn compute_tip_resource_bounds_hash(tip: Felt, bounds: &ResourceBounds) -> Felt {
    let l1 = concat_resource(bounds.l1_gas.max_amount, bounds.l1_gas.max_price_per_unit, "L1_GAS");
    let l2 = concat_resource(bounds.l2_gas.max_amount, bounds.l2_gas.max_price_per_unit, "L2_GAS");
    let l1_data = concat_resource(bounds.l1_data_gas.max_amount, bounds.l1_data_gas.max_price_per_unit, "L1_DATA");
    poseidon_hash_many(&[tip, l1, l2, l1_data])
}

#[allow(clippy::too_many_arguments)]
pub fn compute_invoke_v3_tx_hash(
    sender_address: Felt,
    calldata: &[Felt],
    chain_id: Felt,
    nonce: Felt,
    tip: Felt,
    resource_bounds: &ResourceBounds,
    paymaster_data: &[Felt],
    account_deployment_data: &[Felt],
    nonce_da_mode: u32,
    fee_da_mode: u32,
    proof_facts: &[Felt],
) -> Felt {
    let tip_rb_hash = compute_tip_resource_bounds_hash(tip, resource_bounds);
    let paymaster_data_hash = poseidon_hash_many(paymaster_data);
    let account_deployment_data_hash = poseidon_hash_many(account_deployment_data);
    let calldata_hash = poseidon_hash_many(calldata);
    let da_mode = Felt::from(((nonce_da_mode as u64) << 32) | fee_da_mode as u64);

    let mut elements = vec![
        invoke_prefix(),
        Felt::THREE,
        sender_address,
        tip_rb_hash,
        paymaster_data_hash,
        chain_id,
        nonce,
        da_mode,
        account_deployment_data_hash,
        calldata_hash,
    ];

    if !proof_facts.is_empty() {
        elements.push(poseidon_hash_many(proof_facts));
    }

    poseidon_hash_many(&elements)
}

#[derive(Debug, Clone)]
pub struct Signature {
    pub r: Felt,
    pub s: Felt,
}

pub fn sign(private_key: Felt, message_hash: Felt) -> Result<Signature, SignError> {
    let k = starknet_crypto::rfc6979_generate_k(&message_hash, &private_key, None);
    let sig = starknet_crypto::sign(&private_key, &message_hash, &k)
        .map_err(|e| SignError::Ecdsa(e.to_string()))?;
    Ok(Signature { r: sig.r, s: sig.s })
}

pub fn sign_and_build_payload(params: &SubmitParams) -> Result<(Felt, serde_json::Value), SignError> {
    let tx_hash = compute_invoke_v3_tx_hash(
        params.sender_address,
        &params.calldata,
        params.chain_id,
        params.nonce,
        Felt::ZERO,
        &params.resource_bounds,
        &[],
        &[],
        0,
        0,
        &params.proof_facts,
    );

    let sig = sign(params.private_key, tx_hash)?;
    let calldata_hex: Vec<String> = params.calldata.iter().map(|f| format!("{:#x}", f)).collect();
    let proof_facts_hex: Vec<String> = params.proof_facts.iter().map(|f| format!("{:#x}", f)).collect();

    let payload = serde_json::json!({
        "type": "INVOKE",
        "version": "0x3",
        "sender_address": format!("{:#x}", params.sender_address),
        "calldata": calldata_hex,
        "nonce": format!("{:#x}", params.nonce),
        "resource_bounds": params.resource_bounds.to_rpc_json(),
        "tip": "0x0",
        "paymaster_data": [],
        "account_deployment_data": [],
        "nonce_data_availability_mode": "L1",
        "fee_data_availability_mode": "L1",
        "signature": [format!("{:#x}", sig.r), format!("{:#x}", sig.s)],
        "proof": params.proof_base64,
        "proof_facts": proof_facts_hex,
    });

    Ok((tx_hash, payload))
}

pub fn build_payload_from_json(input: &Snip36PayloadInput) -> Result<Snip36PayloadOutput, String> {
    let params = SubmitParams {
        sender_address: felt_from_hex(&input.sender_address)?,
        private_key: felt_from_hex(&input.private_key)?,
        calldata: input.calldata.iter().map(|v| felt_from_hex(v)).collect::<Result<Vec<_>, _>>()?,
        proof_base64: input.proof_base64.clone(),
        proof_facts: input.proof_facts.iter().map(|v| felt_from_hex(v)).collect::<Result<Vec<_>, _>>()?,
        nonce: felt_from_hex(&input.nonce)?,
        chain_id: chain_id_felt(&input.chain_id),
        resource_bounds: input.resource_bounds.clone().unwrap_or_default(),
    };

    let (tx_hash, payload) = sign_and_build_payload(&params).map_err(|e| e.to_string())?;
    Ok(Snip36PayloadOutput { tx_hash: format!("{:#x}", tx_hash), payload })
}

#[derive(Debug, thiserror::Error)]
pub enum SignError {
    #[error("ECDSA signing failed: {0}")]
    Ecdsa(String),
}

pub fn felt_from_hex(hex_str: &str) -> Result<Felt, String> {
    Felt::from_hex(hex_str).map_err(|e| format!("invalid felt hex '{hex_str}': {e}"))
}
