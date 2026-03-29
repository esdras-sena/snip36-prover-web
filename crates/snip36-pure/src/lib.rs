pub mod signing;
pub mod types;

use serde_json::Value;

pub use signing::*;
pub use types::*;

pub fn bundle_from_execution_payload(artifact: Snip36ProofArtifact) -> Result<Snip36ProofBundle, String> {
    let payload = artifact
        .execution_payload
        .clone()
        .ok_or_else(|| "artifact.execution_payload is missing".to_string())?;
    let result: Value = serde_json::from_str(&payload)
        .map_err(|e| format!("invalid execution payload json: {e}"))?;

    let proof_base64 = result
        .get("proof")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    let proof_facts = match result.get("proof_facts") {
        Some(v) => serde_json::from_value::<Vec<String>>(v.clone())
            .map_err(|e| format!("invalid proof_facts: {e}"))?,
        None => Vec::new(),
    };

    let raw_messages = result
        .get("l2_to_l1_messages")
        .cloned()
        .map(|messages| serde_json::json!({ "l2_to_l1_messages": messages }));

    let proof_size = proof_base64.as_ref().map(|s| s.len() as u64);

    Ok(Snip36ProofBundle {
        artifact: Snip36ProofArtifact {
            proof_facts_preimage: if proof_facts.is_empty() { None } else { Some(proof_facts.clone()) },
            raw_messages: raw_messages.clone(),
            ..artifact
        },
        proof_base64,
        proof_facts,
        raw_messages,
        proof_size,
    })
}
