import { defineConfig } from 'vitest/config'
import type { Plugin, PreviewServer, ViteDevServer } from 'vite'
import type { IncomingMessage, ServerResponse } from 'http'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import compression from 'vite-plugin-compression'

const geoRoutePrefixes = ['/city', '/sports', '/guides']
const geoExactRoutes = ['/about', '/press']

const isGeoRoute = (pathname: string) =>
  geoExactRoutes.includes(pathname) || geoRoutePrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))

const getGeoRoutePath = (req: { url?: string }) => {
  const pathname = req.url?.split('?')[0]
  return pathname && isGeoRoute(pathname) ? pathname : null
}

const serveGeoStaticRoute = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
  const pathname = getGeoRoutePath(req)
  if (!pathname) {
    next()
    return
  }

  const filePath = resolve(__dirname, 'public', pathname.slice(1), 'index.html')
  if (!existsSync(filePath)) {
    next()
    return
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.end(readFileSync(filePath))
}

const cleanGeoStaticRoutes = (): Plugin => ({
  name: 'clean-geo-static-routes',
  configureServer(server: ViteDevServer) {
    server.middlewares.stack.unshift({
      route: '',
      handle: serveGeoStaticRoute,
    })
  },
  configurePreviewServer(server: PreviewServer) {
    return () => {
      server.middlewares.stack.unshift({
        route: '',
        handle: serveGeoStaticRoute,
      })
    }
  },
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    cleanGeoStaticRoutes(),
    react(),
    compression({ algorithm: 'gzip', ext: '.gz' }),
    compression({ algorithm: 'brotliCompress', ext: '.br' }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
    dedupe: ['react', 'react-dom'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['clsx', 'tailwind-merge'],
        },
      },
    },
  },
})
