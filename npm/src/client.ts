import type {
  Snip36ProofArtifact,
  Snip36ProofBundle,
} from "./types";

export interface ExportArtifactRequest {
  block_number: number;
  tx_hash?: string;
  tx_json?: unknown;
  rpc_url?: string;
  chain_id?: string;
  strk_fee_token_address?: string;
  include_execution_payload?: boolean;
}

export interface ExportProofBundleRequest {
  artifact: Snip36ProofArtifact;
  prover_url?: string;
  port?: number;
  use_native_runner?: boolean;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}

export async function exportArtifactViaServer(
  serverBaseUrl: string,
  body: ExportArtifactRequest,
): Promise<Snip36ProofArtifact> {
  return postJson<Snip36ProofArtifact>(
    `${serverBaseUrl.replace(/\/$/, "")}/api/browser/export-artifact`,
    body,
  );
}

export async function exportProofBundleViaServer(
  serverBaseUrl: string,
  body: ExportProofBundleRequest,
): Promise<Snip36ProofBundle> {
  return postJson<Snip36ProofBundle>(
    `${serverBaseUrl.replace(/\/$/, "")}/api/browser/export-proof-bundle`,
    body,
  );
}
