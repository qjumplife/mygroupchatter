/// <reference types="vitest" />
import path from 'path'

import { fileURLToPath } from 'url'

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from 'vite-plugin-svgr'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import macrosPlugin from 'vite-plugin-babel-macros'
import { VitePWA } from 'vite-plugin-pwa'

import { manifest } from './manifest'
import { RouterType } from './src/models/router'

// -----------------------------------------------------------------
// 关键修正：根据环境变量设置公共路径 (BASE PATH)
// 如果在 Netlify 环境中 (process.env.NETLIFY === 'true')，使用根路径 '/'
// 否则，使用 GitHub Pages 的子目录路径 '/mygroupchatter/'
const BASE_PATH = process.env.NETLIFY === 'true' ? '/' : '/mygroupchatter/'
// -----------------------------------------------------------------

const srcPaths = [
  'components',
  'hooks',
  'config',
  'contexts',
  'lib',
  'models',
  'pages',
  'services',
  'img',
  'utils',
  'test-utils',
]

const srcPathAliases = srcPaths.reduce((acc, dir) => {
  acc[dir] = path.resolve(__dirname, `./src/${dir}`)
  return acc
}, {})

const config = () => {
  return defineConfig({
    // 使用条件判断后的 BASE_PATH
    base: BASE_PATH, 
    server: {
      proxy: {
        '/api': {
          target: process.env.IS_E2E_TEST
            ? 'http://localhost:3003'
            : 'http://localhost:3001',
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      // NOTE: This isn't really working. At the very least, it's still useful
      // for exposing source code to users.
      // See: https://github.com/vitejs/vite/issues/15012#issuecomment-1956429165
      sourcemap: true,
    },
    plugins: [
      svgr({
        include: '**/*.svg?react',
      }),
      react(),
      macrosPlugin(),
      nodePolyfills({
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
        protocolImports: true,
      }),
      VitePWA({
        registerType: 'prompt',
        devOptions: {
          enabled: false,
        },
        injectRegister: 'auto',
        filename: 'service-worker.js',
        manifest,
        selfDestroying: true,
      }),
    ],
    resolve: {
      alias: {
        webtorrent: fileURLToPath(
          new URL(
            './node_modules/webtorrent/webtorrent.min.js',
            import.meta.url
          )
        ),
        ...srcPathAliases,
      },
    },
    test: {
      watch: false,
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/setupTests.ts',
      exclude: ['**/e2e/**', '**/node_modules/**'],
      coverage: {
        reporter: ['text', 'html'],
        exclude: ['node_modules/', 'src/setupTests.ts'],
      },
      env: {
        VITE_ROUTER_TYPE: RouterType.BROWSER,
      },
    },
  })
}

export default config
