import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "snip36-wasm": fileURLToPath(new URL("../../crates/snip36-wasm/pkg/index.js", import.meta.url)),
      "starknet-transaction-prover-wasm": fileURLToPath(new URL("../../deps/sequencer/crates/starknet_transaction_prover_wasm/pkg/starknet_transaction_prover_wasm.js", import.meta.url)),
      "snip36-browser-prover-wasm": fileURLToPath(new URL("../../crates/snip36-browser-prover-wasm/pkg/index.js", import.meta.url)),
    },
  },
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "http://localhost:8090",
        changeOrigin: true,
      },
    },
  },
});
