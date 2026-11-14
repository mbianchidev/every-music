import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

function offlineApp() {
  return {
    name: 'everymusic-offline-app',
    apply: 'build',
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        this.emitFile({ type: 'asset', fileName: 'app-icon.png', source: readFileSync(new URL('./src-tauri/icons/icon.png', import.meta.url)) })
        const files = ['/index.html', '/theme.js', '/manifest.webmanifest', '/app-icon.png',
          ...Object.keys(bundle).filter(name => /\.(?:js|css)$/.test(name)).map(name => `/${name}`)]
        const source = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8')
        const version = createHash('sha256').update(source + JSON.stringify(files) + bundle['index.html'].source)
          .update(readFileSync(new URL('./public/theme.js', import.meta.url)))
          .update(readFileSync(new URL('./public/manifest.webmanifest', import.meta.url)))
          .update(readFileSync(new URL('./src-tauri/icons/icon.png', import.meta.url))).digest('hex').slice(0, 16)
        this.emitFile({ type: 'asset', fileName: 'sw.js', source: source
          .replace('__CACHE_VERSION__', version).replace('__PRECACHE_MANIFEST__', JSON.stringify(files)) })
      }
    }
  }
}

export default defineConfig({
  plugins: [react(), offlineApp()],
  build: {
    target: 'es2022'
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      '/realm': {
        target: 'http://localhost:8080',
        changeOrigin: true
      },
      '/pulse': {
        target: 'http://localhost:8080',
        changeOrigin: true
      }
    }
  }
})
