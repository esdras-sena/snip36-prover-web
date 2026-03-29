/// <reference path="./assets.d.ts" />

import snip36WasmBrUrl from "../assets/snip36_wasm_bg.wasm.br?url";
import browserProverWasmBrUrl from "../assets/snip36_browser_prover_wasm_bg.wasm.br?url";
import txProverWasmBrUrl from "../assets/starknet_transaction_prover_wasm_bg.wasm.br?url";

export async function loadSnip36CoreWasm(): Promise<ArrayBuffer> {
  return loadBrotliWasm(snip36WasmBrUrl);
}

export async function loadBrowserProverWasm(): Promise<ArrayBuffer> {
  return loadBrotliWasm(browserProverWasmBrUrl);
}

export async function loadTransactionProverWasm(): Promise<ArrayBuffer> {
  return loadBrotliWasm(txProverWasmBrUrl);
}

async function loadBrotliWasm(url: string): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("Brotli wasm loading requires DecompressionStream support");
  }

  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`failed to fetch brotli wasm: ${response.status} ${response.statusText}`);
  }

  const stream = response.body.pipeThrough(new DecompressionStream("brotli" as unknown as CompressionFormat));
  return await new Response(stream).arrayBuffer();
}
