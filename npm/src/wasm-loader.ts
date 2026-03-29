/// <reference path="./assets.d.ts" />

import brotliPromise from "./vendor/brotli/index.web.js";
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
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch brotli wasm: ${response.status} ${response.statusText}`);
  }

  const compressed = new Uint8Array(await response.arrayBuffer());
  const brotli = await brotliPromise;
  const decompressed = brotli.decompress(compressed);
  return new Uint8Array(decompressed).buffer;
}
