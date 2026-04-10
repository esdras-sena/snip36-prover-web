use serde::Serialize;
use snip36_pure::{
    build_payload_from_json, build_transaction_from_json, build_unsigned_payload_from_json,
    build_unsigned_transaction_from_json, bundle_from_execution_payload, Snip36PayloadInput,
    Snip36ProofArtifact, Snip36ProofBundle, Snip36TransactionInput, Snip36UnsignedPayloadInput,
    Snip36UnsignedTransactionInput,
};
use wasm_bindgen::prelude::*;
use wasm_bindgen_futures::JsFuture;
use web_sys::{Request, RequestInit, Response};

fn to_js_json<T: Serialize>(value: &T) -> Result<JsValue, JsValue> {
    let json = serde_json::to_string(value)
        .map_err(|e| JsValue::from(format!("json serialization failed: {e}")))?;
    js_sys::JSON::parse(&json)
        .map_err(|e| JsValue::from(format!("js parse failed: {:?}", e)))
}

#[wasm_bindgen]
pub fn normalize_artifact(artifact_js: JsValue) -> Result<JsValue, JsValue> {
    let artifact: Snip36ProofArtifact = serde_wasm_bindgen::from_value(artifact_js)
        .map_err(|e| JsValue::from(format!("invalid artifact: {e}")))?;
    to_js_json(&artifact)
}

#[wasm_bindgen]
pub fn bundle_from_artifact_payload(artifact_js: JsValue) -> Result<JsValue, JsValue> {
    let artifact: Snip36ProofArtifact = serde_wasm_bindgen::from_value(artifact_js)
        .map_err(|e| JsValue::from(format!("invalid artifact: {e}")))?;
    let bundle = bundle_from_execution_payload(artifact)
        .map_err(|e| JsValue::from(format!("bundle reconstruction failed: {e}")))?;
    to_js_json(&bundle)
}

#[wasm_bindgen]
pub fn normalize_proof_bundle(bundle_js: JsValue) -> Result<JsValue, JsValue> {
    let bundle: Snip36ProofBundle = serde_wasm_bindgen::from_value(bundle_js)
        .map_err(|e| JsValue::from(format!("invalid proof bundle: {e}")))?;
    to_js_json(&bundle)
}

#[wasm_bindgen]
pub fn build_snip36_transaction(input_js: JsValue) -> Result<JsValue, JsValue> {
    let input: Snip36TransactionInput = serde_wasm_bindgen::from_value(input_js)
        .map_err(|e| JsValue::from(format!("invalid transaction input: {e}")))?;
    let output = build_transaction_from_json(&input)
        .map_err(|e| JsValue::from(format!("transaction build failed: {e}")))?;
    to_js_json(&output)
}

#[wasm_bindgen]
pub fn build_snip36_unsigned_transaction(input_js: JsValue) -> Result<JsValue, JsValue> {
    let input: Snip36UnsignedTransactionInput = serde_wasm_bindgen::from_value(input_js)
        .map_err(|e| JsValue::from(format!("invalid unsigned transaction input: {e}")))?;
    let output = build_unsigned_transaction_from_json(&input)
        .map_err(|e| JsValue::from(format!("unsigned transaction build failed: {e}")))?;
    to_js_json(&output)
}

#[wasm_bindgen]
pub fn build_snip36_payload(input_js: JsValue) -> Result<JsValue, JsValue> {
    let input: Snip36PayloadInput = serde_wasm_bindgen::from_value(input_js)
        .map_err(|e| JsValue::from(format!("invalid payload input: {e}")))?;
    let output = build_payload_from_json(&input)
        .map_err(|e| JsValue::from(format!("payload build failed: {e}")))?;
    to_js_json(&output)
}

#[wasm_bindgen]
pub fn build_snip36_unsigned_payload(input_js: JsValue) -> Result<JsValue, JsValue> {
    let input: Snip36UnsignedPayloadInput = serde_wasm_bindgen::from_value(input_js)
        .map_err(|e| JsValue::from(format!("invalid unsigned payload input: {e}")))?;
    let output = build_unsigned_payload_from_json(&input)
        .map_err(|e| JsValue::from(format!("unsigned payload build failed: {e}")))?;
    to_js_json(&output)
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

#[wasm_bindgen]
pub async fn fetch_latest_block_number(rpc_url: String) -> Result<u32, JsValue> {
    let payload = serde_json::json!({
        "jsonrpc": "2.0",
        "method": "starknet_blockNumber",
        "params": [],
        "id": 1,
    });

    let mut init = RequestInit::new();
    init.method("POST");
    init.body(Some(&JsValue::from_str(&payload.to_string())));

    let request = Request::new_with_str_and_init(&rpc_url, &init)?;
    request.headers().set("content-type", "application/json")?;

    let window = web_sys::window().ok_or_else(|| JsValue::from_str("window is not available"))?;
    let response_value = JsFuture::from(window.fetch_with_request(&request)).await?;
    let response: Response = response_value.dyn_into()?;

    let text_value = JsFuture::from(response.text()?).await?;
    let text = text_value
        .as_string()
        .ok_or_else(|| JsValue::from_str("response text is not a string"))?;

    let json: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| JsValue::from_str(&format!("invalid RPC response json: {e}; body={text}")))?;

    if !response.ok() {
        return Err(JsValue::from_str(&format!(
            "RPC starknet_blockNumber failed: HTTP {} {}",
            response.status(),
            json.get("error")
                .cloned()
                .unwrap_or_else(|| serde_json::Value::String(text.clone()))
        )));
    }

    if let Some(error) = json.get("error") {
        return Err(JsValue::from_str(&format!("RPC starknet_blockNumber error: {error}")));
    }

    let block_number = json
        .get("result")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| JsValue::from_str(&format!("missing numeric result in response: {json}")))?;

    u32::try_from(block_number)
        .map_err(|_| JsValue::from_str(&format!("block number out of u32 range: {block_number}")))
}
