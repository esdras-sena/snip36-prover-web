import { mkdirSync, existsSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { brotliCompressSync, constants as zlibConstants } from 'node:zlib';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const assetsDir = resolve(root, 'assets');
mkdirSync(assetsDir, { recursive: true });

for (const name of readdirSync(assetsDir)) {
  if (name.endsWith('.wasm') || name.endsWith('.wasm.gz') || name.endsWith('.wasm.br')) {
    rmSync(resolve(assetsDir, name), { force: true });
  }
}

const repoRoot = resolve(root, '..');

const files = [
  resolve(repoRoot, 'crates/snip36-wasm/pkg/snip36_wasm_bg.wasm'),
  resolve(repoRoot, 'crates/snip36-browser-prover-wasm/pkg/snip36_browser_prover_wasm_bg.wasm'),
  resolve(repoRoot, 'deps/sequencer/crates/starknet_transaction_prover_wasm/pkg/starknet_transaction_prover_wasm_bg.wasm'),
];

for (const source of files) {
  if (!existsSync(source)) throw new Error(`missing wasm asset: ${source}`);
  const name = source.split('/').pop();
  const dest = resolve(assetsDir, `${name}.br`);
  writeFileSync(dest, brotliCompressSync(readFileSync(source), {
    params: {
      [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
    },
  }));
}

console.log('synced brotli wasm assets into', assetsDir);
