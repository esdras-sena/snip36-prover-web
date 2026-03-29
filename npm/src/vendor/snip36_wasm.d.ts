/* tslint:disable */
/* eslint-disable */

export function artifact_to_json(artifact_js: any): string;

export function build_snip36_payload(input_js: any): any;

export function build_snip36_transaction(input_js: any): any;

export function bundle_from_artifact_payload(artifact_js: any): any;

export function bundle_to_json(bundle_js: any): string;

export function normalize_artifact(artifact_js: any): any;

export function normalize_proof_bundle(bundle_js: any): any;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly normalize_artifact: (a: number, b: number) => void;
    readonly bundle_from_artifact_payload: (a: number, b: number) => void;
    readonly normalize_proof_bundle: (a: number, b: number) => void;
    readonly build_snip36_transaction: (a: number, b: number) => void;
    readonly build_snip36_payload: (a: number, b: number) => void;
    readonly artifact_to_json: (a: number, b: number) => void;
    readonly bundle_to_json: (a: number, b: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
