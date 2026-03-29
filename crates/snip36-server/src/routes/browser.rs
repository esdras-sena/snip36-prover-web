use std::sync::Arc;

use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde::Deserialize;
use snip36_artifact::{
    export_artifact, export_execution_payload_via_vendored_direct, export_proof_bundle,
    ArtifactExportRequest, BundleExportRequest, ProverProvider,
};
use snip36_core::types::{Snip36ProofArtifact, Snip36ProofBundle, STRK_TOKEN};

use crate::state::AppState;

use super::fund::error_response;

#[derive(Deserialize)]
pub struct ExportArtifactBody {
    pub block_number: u64,
    pub tx_hash: Option<String>,
    pub tx_json: Option<serde_json::Value>,
    pub rpc_url: Option<String>,
    pub chain_id: Option<String>,
    pub strk_fee_token_address: Option<String>,
    pub include_execution_payload: Option<bool>,
}

#[axum::debug_handler]
pub async fn export_artifact_route(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ExportArtifactBody>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let mut artifact = export_artifact(ArtifactExportRequest {
        block_number: body.block_number,
        rpc_url: body.rpc_url.unwrap_or_else(|| state.config.rpc_url.clone()),
        chain_id: body.chain_id.unwrap_or_else(|| state.config.chain_id.clone()),
        strk_fee_token_address: body
            .strk_fee_token_address
            .unwrap_or_else(|| STRK_TOKEN.to_string()),
        tx_hash: body.tx_hash,
        tx_json: body.tx_json,
    })
    .await
    .map_err(|e| error_response(StatusCode::BAD_REQUEST, &e.to_string()))?;

    if body.include_execution_payload.unwrap_or(false) {
        let payload = export_execution_payload_via_vendored_direct(&artifact)
            .await
            .map_err(|e| error_response(StatusCode::BAD_GATEWAY, &e.to_string()))?;
        artifact.execution_payload = Some(payload);
    }

    Ok(Json(artifact))
}

#[derive(Deserialize)]
pub struct ExportProofBundleBody {
    pub artifact: Snip36ProofArtifact,
    pub prover_url: Option<String>,
    pub port: Option<u16>,
    pub use_native_runner: Option<bool>,
}

#[axum::debug_handler]
pub async fn export_proof_bundle_route(
    State(_state): State<Arc<AppState>>,
    Json(body): Json<ExportProofBundleBody>,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let provider = if body.use_native_runner.unwrap_or(false) {
        ProverProvider::NativeRunner {
            prover_url: body.prover_url.as_deref(),
            port: body.port.unwrap_or(9900),
            env_file: None,
        }
    } else {
        ProverProvider::VendoredDirect
    };

    let bundle: Snip36ProofBundle = export_proof_bundle(BundleExportRequest {
        artifact: body.artifact,
        provider,
    })
    .await
    .map_err(|e| error_response(StatusCode::BAD_GATEWAY, &e.to_string()))?;

    Ok(Json(bundle))
}
