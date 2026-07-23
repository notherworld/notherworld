import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// every page in the deploy — vite only builds index.html unless told otherwise
const pages = ['index', 'studio', 'nother', 'terra', 'city', 'lab', 'drop', 'temple', 'proofs', 'bestiary', 'parts', 'about', 'notherspace', 'how', 'hunt', 'fish']

// A tiny dev-only proxy for the LLM narrator. It reads OPENROUTER_API_KEY from
// portal/.env (server-side only — never bundled into the client) and forwards
// /api/narrate to OpenRouter with the auth header attached. The browser never
// sees the key.
function openrouterProxy(env: Record<string, string>): Plugin {
  return {
    name: 'openrouter-proxy',
    configureServer(server) {
      server.middlewares.use('/api/narrate', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return }
        const key = env.OPENROUTER_API_KEY
        if (!key) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'OPENROUTER_API_KEY is not set. Copy portal/.env.example to portal/.env, paste your key, and restart the dev server.' }))
          return
        }
        let body = ''
        req.on('data', (c) => { body += c })
        req.on('end', async () => {
          try {
            const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'http://localhost',
                'X-Title': 'otherworldOS console',
              },
              body,
            })
            const text = await r.text()
            res.statusCode = r.status
            res.setHeader('Content-Type', 'application/json')
            res.end(text)
          } catch (e) {
            res.statusCode = 502
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Proxy could not reach OpenRouter: ' + String(e) }))
          }
        })
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '') // '' prefix → load non-VITE_ vars server-side
  return {
    plugins: [react(), openrouterProxy(env)],
    build: {
      rollupOptions: {
        input: Object.fromEntries(pages.map((p) => [p, resolve(__dirname, `${p}.html`)])),
      },
    },
  }
})
