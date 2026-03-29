//! Standalone service that proves individual Starknet transactions using the virtual Starknet OS
//! and Stwo prover.
//!
//! The [`server`] module exposes the proving pipeline as a JSON-RPC service over HTTP or HTTPS
//! (with optional TLS). When a request arrives, it passes through two internal stages:
//!
//! 1. **Running** ([`running`]) — re-executes the transaction against the target block to collect
//!    execution data, storage proofs, and contract classes, then runs the Starknet virtual OS to
//!    produce a Cairo PIE.
//!
//! 2. **Proving** ([`proving`]) — feeds the Cairo PIE into the Stwo prover to generate a
//!    zero-knowledge proof and proof facts.
//!
//! # Feature flags
//!
//! * `stwo_proving` — enables in-memory Stwo proving (requires a nightly Rust toolchain).
//! * `cairo_native` — enables Cairo Native compilation via blockifier.

pub mod config;
pub mod errors;
pub mod proving;
pub mod running;
pub mod server;

#[cfg(feature = "stwo_proving")]
use anyhow::anyhow;
#[cfg(feature = "stwo_proving")]
use blockifier_reexecution::state_reader::rpc_objects::BlockId;
#[cfg(feature = "stwo_proving")]
use starknet_api::rpc_transaction::RpcTransaction;

#[cfg(feature = "stwo_proving")]
pub async fn prove_transaction_json(
    prover_config: &config::ProverConfig,
    block_number: u64,
    transaction: serde_json::Value,
) -> anyhow::Result<serde_json::Value> {
    let tx: RpcTransaction = serde_json::from_value(transaction)?;
    let prover = proving::virtual_snos_prover::RpcVirtualSnosProver::new(prover_config);
    let result = prover
        .prove_transaction(BlockId::Number(block_number), tx)
        .await
        .map_err(|e| anyhow!(e.to_string()))?;
    Ok(serde_json::to_value(result)?)
}

#[cfg(test)]
mod test_utils;
