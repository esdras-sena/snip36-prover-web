use std::future::Future;
use std::path::Path;
use std::pin::Pin;
use std::time::Duration;


use color_eyre::eyre::{bail, WrapErr};
use serde_json::Value;
use snip36_core::{
    proof::parse_proof_facts_json,
    rpc::StarknetRpc,
    types::{Snip36ProofArtifact, Snip36ProofBundle},
    Config,
};
use tokio::io::{AsyncBufReadExt, BufReader};

#[derive(Debug, Clone)]
pub struct ArtifactExportRequest {
    pub block_number: u64,
    pub rpc_url: String,
    pub chain_id: String,
    pub strk_fee_token_address: String,
    pub tx_hash: Option<String>,
    pub tx_json: Option<Value>,
}

pub async fn export_artifact(req: ArtifactExportRequest) -> Result<Snip36ProofArtifact, ArtifactError> {
    let transaction = match (req.tx_json, req.tx_hash.clone()) {
        (Some(tx), _) => tx,
        (None, Some(hash)) => {
            let rpc = StarknetRpc::new(&req.rpc_url);
            rpc.get_transaction(&hash).await.map_err(ArtifactError::Rpc)?
        }
        (None, None) => return Err(ArtifactError::MissingTransaction),
    };

    Ok(Snip36ProofArtifact {
        version: 1,
        block_number: req.block_number,
        rpc_url: req.rpc_url,
        chain_id: req.chain_id,
        strk_fee_token_address: req.strk_fee_token_address,
        tx_hash: req.tx_hash,
        transaction,
        execution_payload: None,
        proof_facts_preimage: None,
        raw_messages: None,
    })
}

pub async fn export_execution_payload_via_vendored_direct(
    artifact: &Snip36ProofArtifact,
) -> color_eyre::Result<String> {
    let sequencer_dir = Path::new("/home/esdras/Documents/snip36-prover-web/deps/sequencer");
    let input = serde_json::json!({
        "config": {
            "rpc_node_url": artifact.rpc_url,
            "chain_id": artifact.chain_id,
            "validate_zero_fee_fields": true,
            "strk_fee_token_address": artifact.strk_fee_token_address,
        },
        "block_number": artifact.block_number,
        "transaction": artifact.transaction,
    });

    let mut child = tokio::process::Command::new("bash");
    child
        .current_dir(sequencer_dir)
        .arg("-lc")
        .arg("source sequencer_venv/bin/activate && CC=clang CXX=clang++ cargo +nightly-2025-07-14 run -q -p starknet_transaction_prover --features stwo_proving --bin export_pie_json")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = child.spawn().wrap_err("failed to start vendored pie exporter")?;
    if let Some(mut stdin) = child.stdin.take() {
        let bytes = serde_json::to_vec(&input)?;
        tokio::spawn(async move {
            use tokio::io::AsyncWriteExt;
            let _ = stdin.write_all(&bytes).await;
        });
    }

    let output = child.wait_with_output().await?;
    if !output.status.success() {
        bail!("vendored pie exporter failed: {}", String::from_utf8_lossy(&output.stderr));
    }

    let payload = String::from_utf8(output.stdout)?;
    Ok(payload)
}

pub struct BundleExportRequest<'a> {
    pub artifact: Snip36ProofArtifact,
    pub provider: ProverProvider<'a>,
}

pub enum ProverProvider<'a> {
    /// Transitional native path that preserves current SNIP-36 behavior.
    NativeRunner {
        prover_url: Option<&'a str>,
        port: u16,
        env_file: Option<&'a Path>,
    },
    /// Direct in-process prover path via the vendored StarkWare workspace.
    VendoredDirect,
    /// Library-first seam for future local/browser proving.
    Callback(&'a dyn Snip36BundleProver),
}

pub trait Snip36BundleProver: Send + Sync {
    fn prove_bundle<'a>(
        &'a self,
        artifact: &'a Snip36ProofArtifact,
    ) -> Pin<Box<dyn Future<Output = color_eyre::Result<Snip36ProofBundle>> + Send + 'a>>;
}

pub async fn export_proof_bundle(req: BundleExportRequest<'_>) -> color_eyre::Result<Snip36ProofBundle> {
    match req.provider {
        ProverProvider::NativeRunner {
            prover_url,
            port,
            env_file,
        } => {
            let prove_response = prove_artifact_with_virtual_os(&req.artifact, prover_url, port, env_file).await?;
            bundle_from_response(req.artifact, prove_response)
        }
        ProverProvider::VendoredDirect => {
            let prove_response = prove_artifact_via_vendored_direct(&req.artifact).await?;
            bundle_from_response(req.artifact, prove_response)
        }
        ProverProvider::Callback(provider) => provider.prove_bundle(&req.artifact).await,
    }
}

pub fn bundle_from_response(
    artifact: Snip36ProofArtifact,
    prove_response: Value,
) -> color_eyre::Result<Snip36ProofBundle> {
    let result = prove_response
        .get("result")
        .filter(|v| !v.is_null())
        .ok_or_else(|| color_eyre::eyre::eyre!("empty result from starknet_proveTransaction: {prove_response}"))?;

    let proof_base64 = result.get("proof").and_then(|v| v.as_str()).map(|s| s.to_string());
    let proof_facts = match result.get("proof_facts") {
        Some(v) => parse_proof_facts_json(&v.to_string())?,
        None => Vec::new(),
    };
    let raw_messages = result
        .get("l2_to_l1_messages")
        .cloned()
        .map(|messages| serde_json::json!({ "l2_to_l1_messages": messages }));
    let proof_size = proof_base64.as_ref().map(|s| s.len() as u64);
    let execution_payload = Some(serde_json::to_string(result)?);

    Ok(Snip36ProofBundle {
        artifact: Snip36ProofArtifact {
            execution_payload,
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

pub struct PrecomputedBundleProver {
    bundle: Snip36ProofBundle,
}

impl PrecomputedBundleProver {
    pub fn new(bundle: Snip36ProofBundle) -> Self {
        Self { bundle }
    }
}

impl Snip36BundleProver for PrecomputedBundleProver {
    fn prove_bundle<'a>(
        &'a self,
        _artifact: &'a Snip36ProofArtifact,
    ) -> Pin<Box<dyn Future<Output = color_eyre::Result<Snip36ProofBundle>> + Send + 'a>> {
        Box::pin(async move { Ok(self.bundle.clone()) })
    }
}

async fn prove_artifact_via_vendored_direct(
    artifact: &Snip36ProofArtifact,
) -> color_eyre::Result<Value> {
    let sequencer_dir = Path::new("/home/esdras/Documents/snip36-prover-web/deps/sequencer");
    let venv_activate = sequencer_dir.join("sequencer_venv/bin/activate");
    if !venv_activate.exists() {
        bail!("sequencer venv missing at {}", venv_activate.display());
    }

    let input = serde_json::json!({
        "config": {
            "rpc_node_url": artifact.rpc_url,
            "chain_id": artifact.chain_id,
            "validate_zero_fee_fields": true,
            "strk_fee_token_address": artifact.strk_fee_token_address,
        },
        "block_number": artifact.block_number,
        "transaction": artifact.transaction,
    });

    let mut child = tokio::process::Command::new("bash");
    child
        .current_dir(sequencer_dir)
        .arg("-lc")
        .arg("source sequencer_venv/bin/activate && CC=clang CXX=clang++ cargo +nightly-2025-07-14 run -q -p starknet_transaction_prover --features stwo_proving --bin prove_json")
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    let mut child = child.spawn().wrap_err("failed to start vendored direct prover")?;
    if let Some(mut stdin) = child.stdin.take() {
        let bytes = serde_json::to_vec(&input)?;
        tokio::spawn(async move {
            use tokio::io::AsyncWriteExt;
            let _ = stdin.write_all(&bytes).await;
        });
    }

    let output = child.wait_with_output().await?;
    if !output.status.success() {
        bail!(
            "vendored direct prover failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    let result: Value = serde_json::from_slice(&output.stdout)
        .wrap_err("failed to decode vendored direct prover output")?;
    Ok(serde_json::json!({"result": result}))
}

async fn prove_artifact_with_virtual_os(
    artifact: &Snip36ProofArtifact,
    prover_url: Option<&str>,
    port: u16,
    env_file: Option<&Path>,
) -> color_eyre::Result<Value> {
    let client = reqwest::Client::new();
    let prove_endpoint;
    let mut runner_child: Option<tokio::process::Child> = None;

    if let Some(url) = prover_url {
        prove_endpoint = url.to_string();
    } else {
        let config = Config::from_env(env_file)?;
        let runner_bin = config.runner_bin();
        if !runner_bin.exists() {
            bail!(
                "starknet_os_runner not found at {}. Run `snip36 setup` or provide --prover-url.",
                runner_bin.display()
            );
        }

        let sequencer_dir = config.deps_dir.join("sequencer");
        let mut cmd = tokio::process::Command::new(&runner_bin);
        cmd.current_dir(&sequencer_dir)
            .arg("--rpc-url")
            .arg(&artifact.rpc_url)
            .arg("--chain-id")
            .arg(&artifact.chain_id)
            .arg("--port")
            .arg(port.to_string())
            .arg("--ip")
            .arg("127.0.0.1")
            .arg("--skip-fee-field-validation")
            .arg("--strk-fee-token-address")
            .arg(&artifact.strk_fee_token_address)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        let mut child = cmd.spawn().wrap_err("failed to start starknet_os_runner")?;
        if let Some(stderr) = child.stderr.take() {
            tokio::spawn(async move {
                let reader = BufReader::new(stderr);
                let mut lines = reader.lines();
                while let Ok(Some(_line)) = lines.next_line().await {}
            });
        }

        let ready_url = format!("http://127.0.0.1:{port}/");
        for _ in 0..30 {
            if client.get(&ready_url).send().await.is_ok() {
                break;
            }
            if let Some(status) = child.try_wait()? {
                bail!("starknet_os_runner exited prematurely with {status}");
            }
            tokio::time::sleep(Duration::from_secs(1)).await;
        }

        prove_endpoint = ready_url;
        runner_child = Some(child);
    }

    let response: Value = client
        .post(&prove_endpoint)
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "method": "starknet_proveTransaction",
            "params": {
                "block_id": {"block_number": artifact.block_number},
                "transaction": artifact.transaction
            },
            "id": 1
        }))
        .timeout(Duration::from_secs(600))
        .send()
        .await
        .wrap_err("starknet_proveTransaction request failed")?
        .json()
        .await?;

    if let Some(mut child) = runner_child {
        let _ = child.kill().await;
    }

    if let Some(error) = response.get("error") {
        bail!("starknet_proveTransaction failed: {error}");
    }

    Ok(response)
}

#[derive(Debug, thiserror::Error)]
pub enum ArtifactError {
    #[error("missing transaction input; provide tx_json or tx_hash")]
    MissingTransaction,
    #[error("rpc error: {0}")]
    Rpc(#[from] snip36_core::rpc::RpcError),
}
