declare module "./vendor/snip36_wasm" {
  const init: (input?: unknown) => Promise<unknown>;
  export default init;
  export function artifact_to_json(input: unknown): string;
  export function build_snip36_payload(input: unknown): unknown;
  export function build_snip36_unsigned_payload(input: unknown): unknown;
  export function build_snip36_unsigned_transaction(input: unknown): unknown;
  export function bundle_to_json(input: unknown): string;
  export function normalize_artifact(input: unknown): unknown;
  export function normalize_proof_bundle(input: unknown): unknown;
}

declare module "./vendor/starknet_transaction_prover_wasm" {
  const init: (input?: unknown) => Promise<unknown>;
  export default init;
  export function export_transaction_cairo_pie(input: unknown): Promise<unknown>;
  export function prove_cairo_pie_json(cairoPieZipBase64: string): Promise<unknown>;
}

declare module "./vendor/snip36_browser_prover_wasm" {
  const init: (input?: unknown) => Promise<unknown>;
  export default init;
  export function prove_cairo_pie(input: unknown): unknown;
}
