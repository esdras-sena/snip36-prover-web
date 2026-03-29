use snip36_pure::{
    build_payload_from_json, build_transaction_from_json, bundle_from_execution_payload,
    Snip36PayloadInput, Snip36ProofArtifact, Snip36ProofBundle, Snip36TransactionInput,
};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn normalize_artifact(artifact_js: JsValue) -> Result<JsValue, JsValue> {
    let artifact: Snip36ProofArtifact = serde_wasm_bindgen::from_value(artifact_js)
        .map_err(|e| JsValue::from(format!("invalid artifact: {e}")))?;
    serde_wasm_bindgen::to_value(&artifact)
        .map_err(|e| JsValue::from(format!("serialization failed: {e}")))
}

#[wasm_bindgen]
pub fn bundle_from_artifact_payload(artifact_js: JsValue) -> Result<JsValue, JsValue> {
    let artifact: Snip36ProofArtifact = serde_wasm_bindgen::from_value(artifact_js)
        .map_err(|e| JsValue::from(format!("invalid artifact: {e}")))?;
    let bundle = bundle_from_execution_payload(artifact)
        .map_err(|e| JsValue::from(format!("bundle reconstruction failed: {e}")))?;
    serde_wasm_bindgen::to_value(&bundle)
        .map_err(|e| JsValue::from(format!("serialization failed: {e}")))
}

#[wasm_bindgen]
pub fn normalize_proof_bundle(bundle_js: JsValue) -> Result<JsValue, JsValue> {
    let bundle: Snip36ProofBundle = serde_wasm_bindgen::from_value(bundle_js)
        .map_err(|e| JsValue::from(format!("invalid proof bundle: {e}")))?;
    serde_wasm_bindgen::to_value(&bundle)
        .map_err(|e| JsValue::from(format!("serialization failed: {e}")))
}

#[wasm_bindgen]
pub fn build_snip36_transaction(input_js: JsValue) -> Result<JsValue, JsValue> {
    let input: Snip36TransactionInput = serde_wasm_bindgen::from_value(input_js)
        .map_err(|e| JsValue::from(format!("invalid transaction input: {e}")))?;
    let output = build_transaction_from_json(&input)
        .map_err(|e| JsValue::from(format!("transaction build failed: {e}")))?;
    serde_wasm_bindgen::to_value(&output)
        .map_err(|e| JsValue::from(format!("serialization failed: {e}")))
}

#[wasm_bindgen]
pub fn build_snip36_payload(input_js: JsValue) -> Result<JsValue, JsValue> {
    let input: Snip36PayloadInput = serde_wasm_bindgen::from_value(input_js)
        .map_err(|e| JsValue::from(format!("invalid payload input: {e}")))?;
    let output = build_payload_from_json(&input)
        .map_err(|e| JsValue::from(format!("payload build failed: {e}")))?;
    serde_wasm_bindgen::to_value(&output)
        .map_err(|e| JsValue::from(format!("serialization failed: {e}")))
}

#[wasm_bindgen]
pub fn artifact_to_json(artifact_js: JsValue) -> Result<String, JsValue> {
    let artifact: Snip36ProofArtifact = serde_wasm_bindgen::from_value(artifact_js)
        .map_err(|e| JsValue::from(format!("invalid artifact: {e}")))?;
    serde_json::to_string_pretty(&artifact)
        .map_err(|e| JsValue::from(format!("json serialization failed: {e}")))
}

#[wasm_bindgen]
pub fn bundle_to_json(bundle_js: JsValue) -> Result<String, JsValue> {
    let bundle: Snip36ProofBundle = serde_wasm_bindgen::from_value(bundle_js)
        .map_err(|e| JsValue::from(format!("invalid proof bundle: {e}")))?;
    serde_json::to_string_pretty(&bundle)
        .map_err(|e| JsValue::from(format!("json serialization failed: {e}")))
}
