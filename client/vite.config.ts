import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** API Render en prod si le build (ex. Cloudflare Pages) ne définit pas `VITE_API_URL`. */
const DEFAULT_PRODUCTION_API_URL = 'https://fc-rosendael-api.onrender.com'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const fromEnv = process.env.VITE_API_URL?.trim()
  const productionUrl = fromEnv || DEFAULT_PRODUCTION_API_URL

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'inject-api-preconnect',
        transformIndexHtml(html) {
          if (mode !== 'production') return html
          try {
            const origin = new URL(productionUrl).origin
            const extra = `    <link rel="dns-prefetch" href="${origin}" />\n    <link rel="preconnect" href="${origin}" crossorigin />\n`
            return html.replace('<head>', `<head>\n${extra}`)
          } catch {
            return html
          }
        },
      },
    ],
    ...(mode === 'production'
      ? {
          define: {
            'import.meta.env.VITE_API_URL': JSON.stringify(productionUrl),
          },
        }
      : {}),
  }
})
