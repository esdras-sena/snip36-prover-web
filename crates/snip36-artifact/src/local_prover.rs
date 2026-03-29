use snip36_core::types::{Snip36ProofArtifact, Snip36ProofBundle};
use starknet_transaction_prover::config::ProverConfig;

use crate::bundle_from_response;

pub async fn prove_artifact_in_process(
    artifact: Snip36ProofArtifact,
    validate_zero_fee_fields: bool,
) -> color_eyre::Result<Snip36ProofBundle> {
    let result = starknet_transaction_prover::prove_transaction_json(
        &ProverConfig {
            rpc_node_url: artifact.rpc_url.clone(),
            chain_id: artifact.chain_id.clone().into(),
            validate_zero_fee_fields,
            ..Default::default()
        },
        artifact.block_number,
        artifact.transaction.clone(),
    )
    .await
    .map_err(|e| color_eyre::eyre::eyre!(e.to_string()))?;

    let response = serde_json::json!({
        "result": result,
    });
    bundle_from_response(artifact, response)
}
