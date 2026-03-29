# @snip36/prover-web

Browser-facing wrapper for the `snip36-wasm` crate.

## What works now

- call backend HTTP endpoints to export artifacts and proof bundles from browser code
- normalize `Snip36ProofArtifact`
- reconstruct a `Snip36ProofBundle` locally from `artifact.execution_payload`
- normalize `Snip36ProofBundle`
- build SNIP-36 payloads in browser/worker code
- stringify artifacts and bundles for transport/debugging

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
