# @snip36/prover-web

Browser-facing web twin of `snip-36-prover-backend`.

## Architectural flow

This package follows the same three-stage SNIP-36 pipeline as the backend README:

1. **Prepare / invoke input**
   - build the Starknet invoke transaction in-browser
2. **Prove**
   - virtual block execution against `block_number`
   - export Cairo PIE
   - run the browser prover
   - return `proof_base64`, `proof_facts`, and optional L2→L1 messages
3. **Submit**
   - build the proof-bearing SNIP-36 payload locally for RPC submission

The browser package is the web twin, not a different architecture with different artifact shapes.
It uses the same `Snip36ProofArtifact` / `Snip36ProofBundle` model and the same `block_number`
field as the backend.

## What works now

- build the invoke transaction in browser code
- export/normalize `Snip36ProofArtifact`
- execute the virtual block in-browser and attach `execution_payload`
- prove a Cairo PIE in-browser and produce a `Snip36ProofBundle`
- build SNIP-36 proof-bearing payloads in browser/worker code
- stringify artifacts and bundles for transport/debugging
- optionally call backend HTTP endpoints to export artifacts and proof bundles from browser code

## Usage

```ts
import {
  buildPayload,
  bundleFromArtifactPayload,
  createSnip36Worker,
  exportArtifactViaServer,
  exportProofBundleViaServer,
  normalizeArtifact,
  normalizeProofBundle,
} from "./src/index";
```

## Important

The browser can now drive the full flow through the server endpoints:
- export artifact
- export proof bundle
- normalize bundle/artifact in wasm
- build SNIP-36 payload in wasm

By default, proof-bundle export now prefers the **vendored direct StarkWare prover path** instead of the JSON-RPC runner wrapper. Set `use_native_runner: true` only if you explicitly want the old runner path.
