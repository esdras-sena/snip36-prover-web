/// <reference path="./starknet-transaction-prover-wasm.d.ts" />

import init, {
  artifact_to_json,
  build_snip36_payload,
  bundle_to_json,
  normalize_artifact,
  normalize_proof_bundle,
} from "./vendor/snip36_wasm";
import initOriginalPathProver, {
  export_transaction_cairo_pie,
} from "./vendor/starknet_transaction_prover_wasm";
import initBrowserProver, { prove_cairo_pie } from "./vendor/snip36_browser_prover_wasm";
import {
  loadBrowserProverWasm,
  loadSnip36CoreWasm,
  loadTransactionProverWasm,
} from "./wasm-loader";
import type {
  CairoPieExecutionPayload,
  Snip36PayloadInput,
  Snip36PayloadOutput,
  Snip36ProofArtifact,
  Snip36ProofBundle,
} from "./types";

export * from "./types";
export * from "./client";

export interface BrowserTransactionProofRequest {
  rpc_url: string;
  block_number: number;
  tx_hash?: string;
  tx_json?: unknown;
  chain_id: string;
  strk_fee_token_address: string;
}

let initPromise: Promise<unknown> | null = null;
let originalPathProverInitPromise: Promise<unknown> | null = null;

export async function initSnip36Wasm(): Promise<void> {
  if (!initPromise) {
    initPromise = loadSnip36CoreWasm().then((input) => init(input));
  }
  await initPromise;
}

export async function initOriginalPathBrowserProver(): Promise<void> {
  if (!originalPathProverInitPromise) {
    originalPathProverInitPromise = loadTransactionProverWasm().then((input) => initOriginalPathProver(input));
  }
  await originalPathProverInitPromise;
}

export async function normalizeArtifact(
  artifact: Snip36ProofArtifact,
): Promise<Snip36ProofArtifact> {
  await initSnip36Wasm();
  return normalize_artifact(artifact) as Snip36ProofArtifact;
}

export async function normalizeProofBundle(
  bundle: Snip36ProofBundle,
): Promise<Snip36ProofBundle> {
  await initSnip36Wasm();
  return normalize_proof_bundle(bundle) as Snip36ProofBundle;
}

export async function generateExecutionPayloadInBrowser(input: {
  config: unknown;
  block_number: number;
  transaction: unknown;
}): Promise<CairoPieExecutionPayload> {
  await initOriginalPathBrowserProver();
  return (await export_transaction_cairo_pie({
    config: input.config,
    block_number: input.block_number,
    transaction: input.transaction,
  })) as CairoPieExecutionPayload;
}

let browserProverInitPromise: Promise<void> | null = null;

export async function initBrowserProverWasm(): Promise<void> {
  if (!browserProverInitPromise) {
    browserProverInitPromise = loadBrowserProverWasm().then((input) => initBrowserProver(input).then(() => undefined));
  }
  await browserProverInitPromise;
}

export async function proveArtifactInBrowser(
  artifact: Snip36ProofArtifact,
): Promise<Snip36ProofBundle> {
  await initBrowserProverWasm();

  if (!artifact.execution_payload) {
    throw new Error("artifact.execution_payload is missing");
  }

  const payload = JSON.parse(artifact.execution_payload) as CairoPieExecutionPayload;
  if (!payload.cairo_pie_zip_base64) {
    throw new Error("execution payload missing cairo_pie_zip_base64");
  }

  const proved = prove_cairo_pie({
    cairo_pie_zip_base64: payload.cairo_pie_zip_base64,
  }) as {
    proof_base64: string;
    proof_facts: string[];
  };

  return {
    artifact: {
      ...artifact,
      raw_messages: payload.l2_to_l1_messages
        ? { l2_to_l1_messages: payload.l2_to_l1_messages }
        : artifact.raw_messages,
      proof_facts_preimage: proved.proof_facts,
    },
    proof_base64: proved.proof_base64,
    proof_facts: proved.proof_facts,
    raw_messages: payload.l2_to_l1_messages
      ? { l2_to_l1_messages: payload.l2_to_l1_messages }
      : artifact.raw_messages,
    proof_size: proved.proof_base64.length,
  };
}

export async function buildPayload(
  input: Snip36PayloadInput,
): Promise<Snip36PayloadOutput> {
  await initSnip36Wasm();
  return build_snip36_payload(input) as Snip36PayloadOutput;
}

export async function artifactToJson(
  artifact: Snip36ProofArtifact,
): Promise<string> {
  await initSnip36Wasm();
  return artifact_to_json(artifact);
}

export async function bundleToJson(bundle: Snip36ProofBundle): Promise<string> {
  await initSnip36Wasm();
  return bundle_to_json(bundle);
}

export async function proveTransactionInBrowser(
  input: BrowserTransactionProofRequest,
): Promise<Snip36ProofBundle> {
  const transaction = input.tx_json ?? (input.tx_hash ? await fetchTransactionByHash(input.rpc_url, input.tx_hash) : null);
  if (!transaction) {
    throw new Error("provide tx_json or tx_hash");
  }

  const artifact: Snip36ProofArtifact = {
    version: 1,
    block_number: input.block_number,
    rpc_url: input.rpc_url,
    chain_id: input.chain_id,
    strk_fee_token_address: input.strk_fee_token_address,
    tx_hash: input.tx_hash ?? null,
    transaction,
    execution_payload: null,
    proof_facts_preimage: null,
    raw_messages: null,
  };

  const payload = await generateExecutionPayloadInBrowser({
    config: {
      rpc_node_url: input.rpc_url,
      chain_id: input.chain_id,
      validate_zero_fee_fields: true,
      strk_fee_token_address: input.strk_fee_token_address,
    },
    block_number: input.block_number,
    transaction,
  });

  return proveArtifactInBrowser({
    ...artifact,
    execution_payload: JSON.stringify(payload),
  });
}

async function fetchTransactionByHash(rpcUrl: string, txHash: string): Promise<unknown> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "starknet_getTransactionByHash",
      params: { transaction_hash: txHash },
      id: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`failed to fetch transaction: HTTP ${response.status}`);
  }

  const json = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (json.error) {
    throw new Error(json.error.message ?? JSON.stringify(json.error));
  }
  if (!json.result) {
    throw new Error("transaction not found in RPC response");
  }
  return json.result;
}

export function createSnip36Worker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}
