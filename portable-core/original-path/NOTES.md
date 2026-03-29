Original SNIP-36 adaptation notes

Target: keep exact original path
- virtual block execution
- run_virtual_os
- Cairo PIE
- STWO proof

Current blockers isolated:
1. starknet_transaction_prover::running::* needs BlockHeaderCommitments + concat_counts from starknet_api::block_hash::block_hash_calculator
2. starknet_os::hints::hint_implementation::os needs gas_prices_to_hash from same module
3. starknet_api pulls tokio because block_hash_calculator mixes pure helpers with async commitment calculation

Adaptation strategy (same logic, no reinvention):
- extract pure block-hash helper slice used by original path
- redirect original imports to pure helper module
- keep run_virtual_os path intact
