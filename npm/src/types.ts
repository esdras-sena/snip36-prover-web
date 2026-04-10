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
  call: {
    contractAddress: string,
    entrypoint: string,
    calldata: string[]
  };
  nonce?: string | null;
  chain_id: string;
  resource_bounds?: ResourceBounds | null;
}

export interface Snip36UnsignedTransactionBuildInput {
  rpc_url: string;
  sender_address: string;
  calldata: string[];
  nonce?: string | null;
  chain_id: string;
  resource_bounds?: ResourceBounds | null;
}

export interface Snip36TransactionBuildOutput {
  tx_hash: string;
  transaction: unknown;
  block_number: number;
}

export interface Snip36ProveRequest {
  rpc_url: string;
  block_number?: number | null;
  tx_json?: unknown;
  chain_id: string;
  strk_fee_token_address: string;
}

export interface GetSnip36ProofInput {
  rpc_url: string;
  sender_address: string;
  signer: unknown;
  call: {
    contractAddress: string,
    entrypoint: string,
    calldata: string[]
  };
  block_number?: number | null;
  nonce?: string | null;
  chain_id: string;
  strk_fee_token_address: string;
  resource_bounds?: ResourceBounds | null;
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
  call: {
    contractAddress: string,
    entrypoint: string,
    calldata: string[]
  };
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

export interface SubmitSnip36TxInput {
  proof_base64: string;
  proof_facts: string[];
  rpc_url: string;
  sender_address: string;
  signer: unknown;
  call: {
    contractAddress: string,
    entrypoint: string,
    calldata: string[]
  };
  chain_id: string;
  nonce?: string | null;
  resource_bounds?: ResourceBounds | null;
}

export interface SubmitSnip36TxOutput {
  tx_hash: string;
  payload: unknown;
}

export interface Snip36UnsignedPayloadInput {
  sender_address: string;
  call: {
    contractAddress: string,
    entrypoint: string,
    calldata: string[]
  };
  proof_base64: string;
  proof_facts: string[];
  nonce: string;
  chain_id: string;
  resource_bounds?: ResourceBounds | null;
}

export interface Snip36UnsignedPayloadOutput {
  tx_hash: string;
  payload: {
    signature: string[];
    [key: string]: unknown;
  };
}
