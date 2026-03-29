declare module "brotli-wasm/index.web.js" {
  const promisedValue: Promise<{
    decompress(buf: Uint8Array): Uint8Array;
  }>;
  export default promisedValue;
}
