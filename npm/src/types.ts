export interface ResourceBound {
  max_amount: number;
  max_price_per_unit: string | number;
}

export interface ResourceBounds {
  l1_gas: ResourceBound;
  l2_gas: ResourceBound;
  l1_data_gas: ResourceBound;
}

export interface Snip36ProofArtifact {
  version: number;
  block_number?: number | null;
  rpc_url: string;
  chain_id: string;
  strk_fee_token_address: string;
  tx_hash?: string | null;
  transaction: unknown;
  execution_payload?: string | null;
  proof_facts_preimage?: string[] | null;
  raw_messages?: unknown;
}

export interface Snip36TransactionBuildInput {
  rpc_url: string;
  sender_address: string;
  private_key: string;
  calldata: string[];
  nonce?: string | null;
  chain_id: string;
  resource_bounds?: ResourceBounds | null;
}

export interface Snip36TransactionBuildOutput {
  tx_hash: string;
  transaction: unknown;
}

export interface Snip36ProveRequest {
  rpc_url: string;
  block_number?: number | null;
  tx_hash?: string;
  tx_json?: unknown;
  chain_id: string;
  strk_fee_token_address: string;
}

export interface CairoPieExecutionPayload {
  cairo_pie_zip_base64: string;
  l2_to_l1_messages?: unknown;
}

export interface Snip36ProofBundle {
  artifact: Snip36ProofArtifact;
  proof_base64?: string | null;
  proof_facts: string[];
  raw_messages?: unknown;
  proof_size?: number | null;
}

export interface Snip36PayloadInput {
  rpc_url: string;
  sender_address: string;
  private_key: string;
  calldata: string[];
  proof_base64: string;
  proof_facts: string[];
  nonce?: string | null;
  chain_id: string;
  resource_bounds?: ResourceBounds | null;
}

export interface Snip36PayloadOutput {
  tx_hash: string;
  payload: unknown;
}
