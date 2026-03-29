declare module "snip36-wasm" {
  export default function init(input?: unknown): Promise<unknown>;
  export function normalize_artifact(value: unknown): unknown;
  export function bundle_from_artifact_payload(value: unknown): unknown;
  export function normalize_proof_bundle(value: unknown): unknown;
  export function build_snip36_payload(value: unknown): unknown;
  export function artifact_to_json(value: unknown): string;
  export function bundle_to_json(value: unknown): string;
}
