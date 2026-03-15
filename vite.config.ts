import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import tsconfigPaths from 'vite-tsconfig-paths'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

export default defineConfig(({ mode }) => ({
  plugins: [
    tsconfigPaths({ projects: ['./tsconfig.json'] }),
    tailwindcss(),
    ...(mode === 'test'
      ? [viteReact()]
      : [
          devtools(),
          nitro({ rollupConfig: { external: [/^@sentry\//] } }),
          tanstackStart(),
          viteReact(),
        ]),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['tests/e2e/**', 'node_modules/**'],
  },
}))
