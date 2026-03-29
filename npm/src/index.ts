/// <reference path="./starknet-transaction-prover-wasm.d.ts" />

import init, {
  artifact_to_json,
  build_snip36_payload,
  build_snip36_transaction,
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
  Snip36ProveRequest,
  Snip36TransactionBuildInput,
  Snip36TransactionBuildOutput,
} from "./types";

export type {
  ResourceBound,
  ResourceBounds,
  Snip36ProofArtifact,
  CairoPieExecutionPayload,
  Snip36ProofBundle,
  Snip36PayloadInput,
  Snip36PayloadOutput,
  Snip36ProveRequest,
  Snip36TransactionBuildInput,
  Snip36TransactionBuildOutput,
} from "./types";
export * from "./client";


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

export async function buildTransactionForProving(
  input: Snip36TransactionBuildInput,
): Promise<Snip36TransactionBuildOutput> {
  await initSnip36Wasm();
  const nonce = input.nonce ?? await fetchNonce(input.rpc_url, input.sender_address);
  return build_snip36_transaction({
    ...input,
    nonce,
  }) as Snip36TransactionBuildOutput;
}

export async function buildPayload(
  input: Snip36PayloadInput,
): Promise<Snip36PayloadOutput> {
  await initSnip36Wasm();
  const nonce = input.nonce ?? await fetchNonce(input.rpc_url, input.sender_address);
  return build_snip36_payload({
    ...input,
    nonce,
  }) as Snip36PayloadOutput;
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

export async function fetchTransactionForProving(input: Snip36ProveRequest): Promise<unknown> {
  const transaction = input.tx_json ?? (input.tx_hash ? await fetchTransactionByHash(input.rpc_url, input.tx_hash) : null);
  if (!transaction) {
    throw new Error("provide tx_json or tx_hash");
  }
  return transaction;
}

export async function prepareTransactionForProving(input: Snip36TransactionBuildInput): Promise<Snip36TransactionBuildOutput> {
  return buildTransactionForProving(input);
}

export function createProofArtifact(input: Snip36ProveRequest & { transaction: unknown }): Snip36ProofArtifact {
  return {
    version: 1,
    block_number: input.block_number ?? null,
    rpc_url: input.rpc_url,
    chain_id: input.chain_id,
    strk_fee_token_address: input.strk_fee_token_address,
    tx_hash: input.tx_hash ?? null,
    transaction: input.transaction,
    execution_payload: null,
    proof_facts_preimage: null,
    raw_messages: null,
  };
}

export async function executeVirtualBlockInBrowser(artifact: Snip36ProofArtifact): Promise<Snip36ProofArtifact> {
  const blockNumber = artifact.block_number ?? await fetchLatestBlockNumber(artifact.rpc_url);

  const payload = await generateExecutionPayloadInBrowser({
    config: {
      rpc_node_url: artifact.rpc_url,
      chain_id: artifact.chain_id,
      validate_zero_fee_fields: true,
      strk_fee_token_address: artifact.strk_fee_token_address,
    },
    block_number: blockNumber,
    transaction: artifact.transaction,
  });

  return {
    ...artifact,
    block_number: blockNumber,
    execution_payload: JSON.stringify(payload),
    raw_messages: payload.l2_to_l1_messages
      ? { l2_to_l1_messages: payload.l2_to_l1_messages }
      : artifact.raw_messages,
  };
}

export async function proveSnip36InBrowser(
  input: Snip36ProveRequest,
): Promise<Snip36ProofBundle> {
  const transaction = await fetchTransactionForProving(input);
  const artifact = createProofArtifact({ ...input, transaction });
  const executedArtifact = await executeVirtualBlockInBrowser(artifact);
  return proveArtifactInBrowser(executedArtifact);
}

export async function proveTransactionInBrowser(
  input: Snip36ProveRequest,
): Promise<Snip36ProofBundle> {
  return proveSnip36InBrowser(input);
}

async function rpcRequest<T>(rpcUrl: string, method: string, params: unknown): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method,
      params,
      id: 1,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed: HTTP ${response.status}`);
  }

  const json = (await response.json()) as { result?: T; error?: { message?: string } };
  if (json.error) {
    throw new Error(json.error.message ?? JSON.stringify(json.error));
  }
  if (json.result === undefined) {
    throw new Error(`RPC ${method} returned no result`);
  }
  return json.result;
}

async function fetchLatestBlockNumber(rpcUrl: string): Promise<number> {
  return rpcRequest<number>(rpcUrl, "starknet_blockNumber", []);
}

async function fetchNonce(rpcUrl: string, senderAddress: string): Promise<string> {
  return rpcRequest<string>(rpcUrl, "starknet_getNonce", {
    block_id: "latest",
    contract_address: senderAddress,
  });
}

async function fetchTransactionByHash(rpcUrl: string, txHash: string): Promise<unknown> {
  return rpcRequest(rpcUrl, "starknet_getTransactionByHash", { transaction_hash: txHash });
}

export function createSnip36Worker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}
