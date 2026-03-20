#[starknet::interface]
trait ICounter<TContractState> {
    fn increment(ref self: TContractState, amount: felt252);
    fn get_counter(self: @TContractState) -> felt252;
}

#[starknet::contract]
mod Counter {
    use starknet::storage::{StoragePointerReadAccess, StoragePointerWriteAccess};

    #[storage]
    struct Storage {
        counter: felt252,
    }

    #[abi(embed_v0)]
    impl CounterImpl of super::ICounter<ContractState> {
        fn increment(ref self: ContractState, amount: felt252) {
            self.counter.write(self.counter.read() + amount);
        }

        fn get_counter(self: @ContractState) -> felt252 {
            self.counter.read()
        }
    }
}

#[starknet::interface]
trait IMessenger<TContractState> {
    fn send_message(ref self: TContractState, to_address: felt252, payload: Span<felt252>);
}

#[starknet::contract]
mod Messenger {
    use starknet::syscalls::send_message_to_l1_syscall;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl MessengerImpl of super::IMessenger<ContractState> {
        fn send_message(ref self: ContractState, to_address: felt252, payload: Span<felt252>) {
            send_message_to_l1_syscall(to_address, payload).unwrap();
        }
    }
}

/// Provable coin flip: deterministic outcome from public inputs, settled via L2→L1 message.
///
/// Demonstrates using SNIP-36 virtual blocks as a verifiable computation oracle:
/// - Public inputs (seed + player address) go in via calldata
/// - Deterministic PRNG (Poseidon hash) computes the outcome
/// - Settlement receipt is emitted as an L2→L1 message
/// - The stwo proof guarantees the computation was honest
#[starknet::interface]
trait ICoinFlip<TContractState> {
    fn play(ref self: TContractState, seed: felt252, player: felt252, bet: felt252);
}

#[starknet::contract]
mod CoinFlip {
    use starknet::syscalls::send_message_to_l1_syscall;
    use core::pedersen::pedersen;

    /// L1 settlement contract address (placeholder).
    const SETTLEMENT_ADDRESS: felt252 = 0x1;

    #[storage]
    struct Storage {}

    #[abi(embed_v0)]
    impl CoinFlipImpl of super::ICoinFlip<ContractState> {
        fn play(ref self: ContractState, seed: felt252, player: felt252, bet: felt252) {
            // Deterministic outcome from public inputs
            let hash = pedersen(seed, player);
            let hash_u256: u256 = hash.into();
            let outcome: felt252 = if hash_u256.low % 2 == 0 { 0 } else { 1 };

            // 1 if player guessed correctly, 0 otherwise
            let won: felt252 = if outcome == bet { 1 } else { 0 };

            // Emit settlement receipt as L2→L1 message
            // Payload: [player, seed, bet, outcome, won]
            send_message_to_l1_syscall(
                SETTLEMENT_ADDRESS,
                array![player, seed, bet, outcome, won].span(),
            ).unwrap();
        }
    }
}
