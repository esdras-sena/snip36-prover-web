use base64::{engine::general_purpose::STANDARD, Engine};
use cairo_vm::vm::runners::cairo_pie::CairoPie;
use privacy_prove::{prepare_recursive_prover_precomputes, privacy_recursive_prove};
use serde::{Deserialize, Serialize};
use starknet_types_core::felt::Felt;
use wasm_bindgen::prelude::*;

const PROOF_VERSION_HEX: &str = "0x3025ec0";
const VIRTUAL_SNOS_HEX: &str = "0x5649525455414c5f534e4f53";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CairoPieProofInput {
    pub cairo_pie_zip_base64: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CairoPieProofOutput {
    pub proof_base64: String,
    pub proof_facts: Vec<String>,
}

#[wasm_bindgen]
pub fn prove_cairo_pie(input_js: JsValue) -> Result<JsValue, JsValue> {
    let input: CairoPieProofInput = serde_wasm_bindgen::from_value(input_js)
        .map_err(|e| JsValue::from(format!("invalid cairo pie input: {e}")))?;

    let bytes = STANDARD
        .decode(input.cairo_pie_zip_base64)
        .map_err(|e| JsValue::from(format!("invalid base64 pie: {e}")))?;
    let cairo_pie = CairoPie::from_bytes(&bytes)
        .map_err(|e| JsValue::from(format!("invalid cairo pie zip: {e}")))?;

    let precomputes = prepare_recursive_prover_precomputes()
        .map_err(|e| JsValue::from(format!("precompute failed: {e}")))?;
    let proof_output = privacy_recursive_prove(cairo_pie, precomputes)
        .map_err(|e| JsValue::from(format!("prove failed: {e}")))?;

    let proof_base64 = STANDARD.encode(proof_output.proof);
    let output_preimage = proof_output.output_preimage;
    if output_preimage.first().copied() != Some(Felt::ONE) {
        return Err(JsValue::from("invalid program output: expected single task"));
    }
    if output_preimage.len() < 3 {
        return Err(JsValue::from("invalid program output: too short"));
    }

    let proof_version = Felt::from_hex(PROOF_VERSION_HEX)
        .map_err(|e| JsValue::from(format!("invalid proof version const: {e}")))?;
    let virtual_snos = Felt::from_hex(VIRTUAL_SNOS_HEX)
        .map_err(|e| JsValue::from(format!("invalid virtual snos const: {e}")))?;

    let mut proof_facts = vec![format!("{:#x}", proof_version), format!("{:#x}", virtual_snos)];
    proof_facts.extend(output_preimage[2..].iter().map(|felt| format!("{:#x}", felt)));

    serde_wasm_bindgen::to_value(&CairoPieProofOutput { proof_base64, proof_facts })
        .map_err(|e| JsValue::from(format!("serialization failed: {e}")))
}
