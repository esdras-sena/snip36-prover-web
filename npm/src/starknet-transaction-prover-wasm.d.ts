declare module "starknet-transaction-prover-wasm" {
  export default function init(input?: unknown): Promise<unknown>;
  export function export_transaction_cairo_pie(value: unknown): Promise<unknown>;
  export function prove_cairo_pie_json(cairoPieZipBase64: string): Promise<unknown>;
}
