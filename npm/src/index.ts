/// <reference path="./starknet-transaction-prover-wasm.d.ts" />

import { RpcProvider, Signer, shortString, transaction, WalletAccount } from "starknet";
import init, {
  artifact_to_json,
  build_snip36_payload,
  build_snip36_unsigned_payload,
  build_snip36_transaction,
  build_snip36_unsigned_transaction,
  bundle_to_json,
  normalize_artifact,
  normalize_proof_bundle,
} from "./vendor/snip36_wasm";
import initOriginalPathProver, {
  export_transaction_cairo_pie,
} from "./vendor/starknet_transaction_prover_wasm";
import {
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
  GetSnip36ProofInput,
  SubmitSnip36TxInput,
  SubmitSnip36TxOutput,
  Snip36UnsignedPayloadInput,
  Snip36UnsignedPayloadOutput,
  Snip36UnsignedTransactionBuildInput,
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
  GetSnip36ProofInput,
  SubmitSnip36TxInput,
  SubmitSnip36TxOutput,
  Snip36UnsignedPayloadInput,
  Snip36UnsignedPayloadOutput,
  Snip36UnsignedTransactionBuildInput,
  Snip36TransactionBuildInput,
  Snip36TransactionBuildOutput,
} from "./types";

const WORKER_TIMEOUT_MS = 90_000;
const SEPOLIA_PROOF_SUBMISSION_URL = "https://alpha-sepolia.starknet.io";
const DEFAULT_STRK_TOKEN = "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d";

function normalizeFeltHex(value: string | number | bigint): string {
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  if (typeof value === "number") return `0x${BigInt(value).toString(16)}`;
  const trimmed = value.trim();
  if (trimmed.startsWith("0x") || trimmed.startsWith("0X")) {
    return `0x${BigInt(trimmed).toString(16)}`;
  }
  return `0x${BigInt(trimmed).toString(16)}`;
}

let initPromise: Promise<unknown> | null = null;
let originalPathProverInitPromise: Promise<unknown> | null = null;

export async function initSnip36Wasm(): Promise<void> {
  if (!initPromise) {
    initPromise = loadSnip36CoreWasm().then((input) => init({ module_or_path: input }));
  }
  await initPromise;
}

export async function initOriginalPathBrowserProver(): Promise<void> {
  if (!originalPathProverInitPromise) {
    originalPathProverInitPromise = loadTransactionProverWasm().then((input) => initOriginalPathProver({ module_or_path: input }));
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

export async function generateExecutionPayloadInBrowser(artifact: Snip36ProofArtifact): Promise<CairoPieExecutionPayload> {
  const blockNumber = artifact.block_number ?? await fetchLatestBlockNumber(artifact.rpc_url);

  const baseConfig = {
    rpc_node_url: artifact.rpc_url,
    chain_id: artifact.chain_id,
    validate_zero_fee_fields: false,
    strk_fee_token_address: artifact.strk_fee_token_address,
  } as Record<string, unknown>;
  const runnerConfig = ((baseConfig?.runner_config as Record<string, unknown>) ?? {});
  const virtualBlockExecutorConfig = ((runnerConfig?.virtual_block_executor_config as Record<string, unknown>) ?? {});
  const config = {
    ...baseConfig,
    runner_config: {
      ...runnerConfig,
      virtual_block_executor_config: {
        ...virtualBlockExecutorConfig,
        prefetch_state: false,
        validate_txs: false,
      },
    },
  };

  const response = await runWorkerRequest<{
    ok: true;
    kind: "generate_execution_payload_in_browser";
    value: CairoPieExecutionPayload;
  }>({
    kind: "generate_execution_payload_in_browser",
    config,
    block_number: blockNumber,
    transaction: artifact.transaction,
  });

  return response.value;
}

export async function proveArtifactInBrowser(
  artifact: Snip36ProofArtifact,
): Promise<Snip36ProofBundle> {
  const response = await runWorkerRequest<{
    ok: true;
    kind: "prove_artifact_in_browser";
    value: Snip36ProofBundle;
  }>({
    kind: "prove_artifact_in_browser",
    artifact,
  });

  return response.value;
}

export async function buildTransactionForProving(
  input: Snip36TransactionBuildInput,
): Promise<Snip36TransactionBuildOutput> {
  await initSnip36Wasm();
  const [nonce, block_number] = await Promise.all([
    input.nonce ?? fetchNonce(input.rpc_url, input.sender_address),
    fetchLatestBlockNumber(input.rpc_url),
  ]);
  const built = build_snip36_transaction({
    sender_address: input.sender_address,
    private_key: input.private_key,
    calldata: input.call.calldata,
    nonce,
    chain_id: input.chain_id,
    resource_bounds: input.resource_bounds,
  }) as Omit<Snip36TransactionBuildOutput, "block_number">;
  return {
    ...built,
    block_number,
  };
}

function toChainIdFelt(chainId: string): string {
  if (chainId.startsWith("0x") || chainId.startsWith("0X")) return chainId;
  return `0x${BigInt(shortString.encodeShortString(chainId)).toString(16)}`;
}

function toSignerResourceBounds(resourceBounds?: {
  l1_gas?: { max_amount: string | number | bigint; max_price_per_unit: string | number | bigint };
  l2_gas?: { max_amount: string | number | bigint; max_price_per_unit: string | number | bigint };
  l1_data_gas?: { max_amount: string | number | bigint; max_price_per_unit: string | number | bigint };
} | null) {
  return {
    l1_gas: {
      max_amount: BigInt(resourceBounds?.l1_gas?.max_amount ?? "0x0"),
      max_price_per_unit: BigInt(resourceBounds?.l1_gas?.max_price_per_unit ?? "0x0"),
    },
    l2_gas: {
      max_amount: BigInt(resourceBounds?.l2_gas?.max_amount ?? "0x0"),
      max_price_per_unit: BigInt(resourceBounds?.l2_gas?.max_price_per_unit ?? "0x0"),
    },
    l1_data_gas: {
      max_amount: BigInt(resourceBounds?.l1_data_gas?.max_amount ?? "0x0"),
      max_price_per_unit: BigInt(resourceBounds?.l1_data_gas?.max_price_per_unit ?? "0x0"),
    },
  };
}

export async function buildUnsignedTransactionForProving(
  input: Snip36UnsignedTransactionBuildInput,
): Promise<Snip36TransactionBuildOutput> {
  await initSnip36Wasm();
  const [nonce, block_number] = await Promise.all([
    input.nonce ?? fetchNonce(input.rpc_url, input.sender_address),
    fetchLatestBlockNumber(input.rpc_url),
  ]);
  const built = build_snip36_unsigned_transaction({
    sender_address: input.sender_address,
    calldata: input.calldata,
    nonce,
    chain_id: input.chain_id,
    resource_bounds: input.resource_bounds,
  }) as Omit<Snip36TransactionBuildOutput, "block_number">;
  return {
    tx_hash: built.tx_hash,
    transaction: built.transaction,
    block_number,
  };
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
  const transaction = input.tx_json;
  if (!transaction) {
    throw new Error("provide tx_json");
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
    tx_hash: null,
    transaction: input.transaction,
    execution_payload: null,
    proof_facts_preimage: null,
    raw_messages: null,
  };
}

export async function executeVirtualBlockInBrowser(artifact: Snip36ProofArtifact): Promise<Snip36ProofArtifact> {
  const blockNumber = artifact.block_number ?? await fetchLatestBlockNumber(artifact.rpc_url);

  const payload = await generateExecutionPayloadInBrowser({
    ...artifact,
    block_number: blockNumber,
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

export async function get_snip36_proof(
  input: GetSnip36ProofInput,
): Promise<Snip36ProofBundle> {
  const walletAccount = extractWalletAccount(input.signer);
  if (!walletAccount) {
    throw new Error("get_snip36_proof requires a WalletAccount signer.");
  }

  const cairoVersion = await walletAccount.getCairoVersion();
  const calldata = transaction.getExecuteCalldata([
    {
      contractAddress: input.call.contractAddress,
      entrypoint: input.call.entrypoint,
      calldata: input.call.calldata,
    },
  ], cairoVersion).map((felt) => normalizeFeltHex(felt));

  const prepared = await buildUnsignedTransactionForProving({
    rpc_url: input.rpc_url,
    sender_address: input.sender_address,
    calldata,
    nonce: input.nonce ?? null,
    chain_id: toChainIdFelt(input.chain_id),
    resource_bounds: input.resource_bounds ?? null,
  });

  return proveSnip36InBrowser({
    rpc_url: input.rpc_url,
    block_number: input.block_number ?? prepared.block_number,
    tx_json: prepared.transaction,
    chain_id: input.chain_id,
    strk_fee_token_address: input.strk_fee_token_address,
  });
}

export async function buildUnsignedPayload(
  input: Snip36UnsignedPayloadInput,
): Promise<Snip36UnsignedPayloadOutput> {
  await initSnip36Wasm();
  return build_snip36_unsigned_payload(input) as Snip36UnsignedPayloadOutput;
}


function extractWalletAccount(value: unknown): WalletAccount | null {
  if (value instanceof WalletAccount) {
    return value;
  }
  return null;
}

export async function submit_snip36_tx(
  proof_base64: string,
  proof_facts: string[],
  rpc_url: string,
  sender_address: string,
  signer: unknown,
  call: {
    contractAddress: string,
    entrypoint: string,
    calldata: string[]
  },
  chain_id: string,
): Promise<SubmitSnip36TxOutput> {
  void proof_base64;
  void proof_facts;
  void rpc_url;
  void sender_address;
  void signer;
  void call;
  void chain_id;
  throw new Error("submit_snip36_tx is disabled until the normal submit path is wired.");
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
  const result = await rpcRequest<unknown>(rpcUrl, "starknet_blockNumber", {});
  if (typeof result === "number") {
    return result;
  }
  if (typeof result === "string") {
    const parsed = Number(result);
    if (Number.isFinite(parsed)) return parsed;
  }
  throw new Error(`RPC starknet_blockNumber returned invalid result: ${JSON.stringify(result)}`);
}

async function fetchNonce(rpcUrl: string, senderAddress: string): Promise<string> {
  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  try {
    const nonce = await provider.getNonceForAddress(senderAddress);
    return nonce;
  } catch {
    return "0x0";
  }
}

async function fetchTransactionByHash(rpcUrl: string, transactionHash: string): Promise<unknown> {
  return await rpcRequest<unknown>(rpcUrl, "starknet_getTransactionByHash", [transactionHash]);
}

type WorkerSuccess<T> = { ok: true; value: T };
type WorkerFailure = { ok: false; error: string };

async function runWorkerRequest<T extends WorkerSuccess<unknown>>(
  message: unknown,
  timeoutMs = WORKER_TIMEOUT_MS,
): Promise<T> {
  const worker = createSnip36Worker();

  return await new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error(`worker request timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);

    worker.onmessage = (event: MessageEvent<T | WorkerFailure>) => {
      clearTimeout(timer);
      worker.terminate();
      const data = event.data;
      if (data && typeof data === "object" && "ok" in data && data.ok === false) {
        reject(new Error(data.error));
        return;
      }
      resolve(data as T);
    };

    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message || "worker crashed"));
    };

    worker.postMessage(message);
  });
}

export function createSnip36Worker(): Worker {
  return new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
}
