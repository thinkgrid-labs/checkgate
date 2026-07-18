import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Redirect the wasm-pack build artifact to a stub so the SDK imports cleanly in
// tests without a WASM build. Unit tests inject a fake `core` and never call
// connect(), so the real WASM engine is never needed.
export default defineConfig({
  resolve: {
    alias: [
      {
        find: /\.\/dist\/checkgate\.js$/,
        replacement: fileURLToPath(new URL('./test/core-stub.js', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
  },
})
