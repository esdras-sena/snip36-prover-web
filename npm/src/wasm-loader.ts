/// <reference path="./assets.d.ts" />

import brotliPromise from "./vendor/brotli/index.web.js";
import snip36WasmBrUrl from "../assets/snip36_wasm_bg.wasm.br?url";
import txProverWasmBrUrl from "../assets/starknet_transaction_prover_wasm_bg.wasm.br?url";
import browserProverWasmBrUrl from "../assets/snip36_browser_prover_wasm_bg.wasm.br?url";

export async function loadSnip36CoreWasm(): Promise<ArrayBuffer> {
  return loadBrotliWasm(snip36WasmBrUrl);
}

export async function loadTransactionProverWasm(): Promise<ArrayBuffer> {
  return loadBrotliWasm(txProverWasmBrUrl);
}

export async function loadBrowserProverWasm(): Promise<ArrayBuffer> {
  return loadBrotliWasm(browserProverWasmBrUrl);
}

async function loadBrotliWasm(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`failed to fetch brotli wasm: ${response.status} ${response.statusText}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());

  // Some dev-server paths may already return the raw wasm bytes even when the
  // source asset on disk is `*.wasm.br`. In that case, avoid double-decompressing.
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x00 &&
    bytes[1] === 0x61 &&
    bytes[2] === 0x73 &&
    bytes[3] === 0x6d
  ) {
    return bytes.buffer;
  }

  const brotli = await brotliPromise;
  const decompressed = brotli.decompress(bytes);
  return new Uint8Array(decompressed).buffer;
}
