# snip36-prover-web

This fork reshapes the original SNIP-36 repo into a web/wasm-friendly format.

## New architecture

- `crates/snip36-artifact`
  - native export layer
  - produces a portable `Snip36ProofArtifact`
- `crates/snip36-pure`
  - pure types + SNIP-36 signing/hash logic
  - no tokio / reqwest / fs / subprocess
  - intended to be shared by wasm and native callers
- `crates/snip36-wasm`
  - `wasm-bindgen` wrapper around `snip36-pure`

## Web surfaces

- `crates/snip36-server`
  - HTTP surface for browser-driven artifact export and proof-bundle generation
- `web/sdk`
  - browser-facing SDK that talks to the server and wasm layer

The intended flow is browser/sdk -> server -> vendored direct StarkWare prover path -> wasm-safe payload handling.

## Current status

- Native workspace default build passes.
- `snip36-wasm` now compiles to `wasm32-unknown-unknown` because it depends on `snip36-pure`, not the native `snip36-core` crate.
- `snip36-artifact` now exposes a **library-first prover seam** (`ProverProvider` / `Snip36BundleProver`) so the current native runner path can be swapped for a real local/browser prover later without changing the artifact/bundle format.
- Actual virtual OS execution is still native-side today. The proving/signing side has been split into a wasm-safe format and a provider abstraction.
