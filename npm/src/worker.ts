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
import initBrowserProver, {
  prove_cairo_pie,
} from "./vendor/snip36_browser_prover_wasm";
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

export type WorkerRequest =
  | { kind: "normalize_artifact"; artifact: Snip36ProofArtifact }
  | {
      kind: "generate_execution_payload_in_browser";
      config: Record<string, unknown>;
      block_number: number;
      transaction: unknown;
    }
  | { kind: "prove_artifact_in_browser"; artifact: Snip36ProofArtifact }
  | { kind: "normalize_proof_bundle"; bundle: Snip36ProofBundle }
  | { kind: "build_payload"; input: Snip36PayloadInput }
  | { kind: "artifact_to_json"; artifact: Snip36ProofArtifact }
  | { kind: "bundle_to_json"; bundle: Snip36ProofBundle };

export type WorkerResponse =
  | { ok: true; kind: "normalize_artifact"; value: Snip36ProofArtifact }
  | { ok: true; kind: "generate_execution_payload_in_browser"; value: CairoPieExecutionPayload }
  | { ok: true; kind: "prove_artifact_in_browser"; value: Snip36ProofBundle }
  | { ok: true; kind: "normalize_proof_bundle"; value: Snip36ProofBundle }
  | { ok: true; kind: "build_payload"; value: Snip36PayloadOutput }
  | { ok: true; kind: "artifact_to_json"; value: string }
  | { ok: true; kind: "bundle_to_json"; value: string }
  | { ok: false; error: string };

let workerCoreInitPromise: Promise<unknown> | null = null;
let workerTxInitPromise: Promise<unknown> | null = null;
let workerBrowserProverInitPromise: Promise<unknown> | null = null;

self.addEventListener("error", (event) => {
  self.postMessage({
    ok: false,
    error: `worker runtime error: ${event.message || "unknown"}`,
  } satisfies WorkerResponse);
});

self.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason;
  self.postMessage({
    ok: false,
    error: `worker unhandled rejection: ${reason instanceof Error ? `${reason.name}: ${reason.message}` : String(reason)}`,
  } satisfies WorkerResponse);
});

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  try {
    if (!workerCoreInitPromise) workerCoreInitPromise = loadSnip36CoreWasm().then((input) => init({ module_or_path: input }));
    await workerCoreInitPromise;
    const msg = event.data;

    switch (msg.kind) {
      case "normalize_artifact":
        self.postMessage({
          ok: true,
          kind: msg.kind,
          value: normalize_artifact(msg.artifact) as Snip36ProofArtifact,
        } satisfies WorkerResponse);
        return;
      case "generate_execution_payload_in_browser": {
        if (!workerTxInitPromise) workerTxInitPromise = loadTransactionProverWasm().then((input) => initOriginalPathProver({ module_or_path: input }));
        await workerTxInitPromise;
        const baseConfig = msg.config as Record<string, unknown>;
        const runnerConfig = ((baseConfig?.runner_config as Record<string, unknown>) ?? {});
        const virtualBlockExecutorConfig = ((runnerConfig?.virtual_block_executor_config as Record<string, unknown>) ?? {});
        const config = {
          ...baseConfig,
          runner_config: {
            ...runnerConfig,
            virtual_block_executor_config: {
              ...virtualBlockExecutorConfig,
              prefetch_state: false,
            },
          },
        };
        const value = (await export_transaction_cairo_pie({
          config,
          block_number: msg.block_number,
          transaction: msg.transaction,
        })) as CairoPieExecutionPayload;
        self.postMessage({ ok: true, kind: msg.kind, value } satisfies WorkerResponse);
        return;
      }
      case "prove_artifact_in_browser": {
        if (!workerBrowserProverInitPromise) {
          workerBrowserProverInitPromise = loadBrowserProverWasm().then((input) =>
            initBrowserProver({ module_or_path: input }),
          );
        }
        await workerBrowserProverInitPromise;
        if (!msg.artifact.execution_payload) throw new Error("artifact.execution_payload is missing");
        const payload = JSON.parse(msg.artifact.execution_payload) as CairoPieExecutionPayload;
        const proved = prove_cairo_pie({
          cairo_pie_zip_base64: payload.cairo_pie_zip_base64,
        }) as {
          proof_base64?: string;
          proof_facts?: string[];
        };
        if (!proved?.proof_base64 || !Array.isArray(proved.proof_facts)) {
          throw new Error(`invalid prove_cairo_pie response: ${JSON.stringify(proved)}`);
        }
        const rawMessages = payload.l2_to_l1_messages;
        self.postMessage({
          ok: true,
          kind: msg.kind,
          value: {
            artifact: {
              ...msg.artifact,
              raw_messages: rawMessages
                ? { l2_to_l1_messages: rawMessages }
                : msg.artifact.raw_messages,
              proof_facts_preimage: proved.proof_facts,
            },
            proof_base64: proved.proof_base64,
            proof_facts: proved.proof_facts,
            raw_messages: rawMessages
              ? { l2_to_l1_messages: rawMessages }
              : msg.artifact.raw_messages,
            proof_size: proved.proof_base64.length,
          } as Snip36ProofBundle,
        } satisfies WorkerResponse);
        return;
      }
      case "normalize_proof_bundle":
        self.postMessage({
          ok: true,
          kind: msg.kind,
          value: normalize_proof_bundle(msg.bundle) as Snip36ProofBundle,
        } satisfies WorkerResponse);
        return;
      case "build_payload":
        self.postMessage({
          ok: true,
          kind: msg.kind,
          value: build_snip36_payload(msg.input) as Snip36PayloadOutput,
        } satisfies WorkerResponse);
        return;
      case "artifact_to_json":
        self.postMessage({
          ok: true,
          kind: msg.kind,
          value: artifact_to_json(msg.artifact),
        } satisfies WorkerResponse);
        return;
      case "bundle_to_json":
        self.postMessage({
          ok: true,
          kind: msg.kind,
          value: bundle_to_json(msg.bundle),
        } satisfies WorkerResponse);
        return;
    }
  } catch (error) {
    self.postMessage({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    } satisfies WorkerResponse);
  }
};
