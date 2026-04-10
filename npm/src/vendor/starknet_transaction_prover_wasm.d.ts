/* tslint:disable */
/* eslint-disable */
export function export_transaction_cairo_pie(input_js: any): Promise<any>;
export function prove_cairo_pie_json(cairo_pie_zip_base64: string): Promise<any>;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly export_transaction_cairo_pie: (a: number) => number;
  readonly prove_cairo_pie_json: (a: number, b: number) => number;
  readonly rust_zstd_wasm_shim_qsort: (a: number, b: number, c: number, d: number) => void;
  readonly rust_zstd_wasm_shim_malloc: (a: number) => number;
  readonly rust_zstd_wasm_shim_memcmp: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_calloc: (a: number, b: number) => number;
  readonly rust_zstd_wasm_shim_free: (a: number) => void;
  readonly rust_zstd_wasm_shim_memcpy: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_memmove: (a: number, b: number, c: number) => number;
  readonly rust_zstd_wasm_shim_memset: (a: number, b: number, c: number) => number;
  readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzCompressInit: (a: number, b: number, c: number, d: number) => number;
  readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzCompress: (a: number, b: number) => number;
  readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzCompressEnd: (a: number) => number;
  readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzDecompressInit: (a: number, b: number, c: number) => number;
  readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzDecompress: (a: number) => number;
  readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzDecompressEnd: (a: number) => number;
  readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzBuffToBuffCompress: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => number;
  readonly LIBBZ2_RS_SYS_v0.1.x_BZ2_bzBuffToBuffDecompress: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
  readonly __wasm_bindgen_func_elem_55384: (a: number, b: number, c: number) => void;
  readonly __wasm_bindgen_func_elem_55369: (a: number, b: number) => void;
  readonly __wasm_bindgen_func_elem_117613: (a: number, b: number, c: number, d: number) => void;
  readonly __wbindgen_export: (a: number, b: number) => number;
  readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export3: (a: number) => void;
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
