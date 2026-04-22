/**
 * Déclenche un déploiement manuel sur Render (API REST).
 * Clé : RENDER_API_KEY ou ~/.render/cli.yaml
 */
import fs from 'fs'
import path from 'path'
import os from 'os'

const SERVICE_ID = process.env.RENDER_SERVICE_ID?.trim() || 'srv-d7ht06vaqgkc739i5sc0'
const API = 'https://api.render.com/v1'

function loadKeyFromCliYaml() {
  const p = path.join(process.env.USERPROFILE || os.homedir(), '.render', 'cli.yaml')
  const raw = fs.readFileSync(p, 'utf8')
  const m = raw.match(/key:\s*(rnd_[a-zA-Z0-9]+)/)
  return m?.[1] || ''
}

let apiKey = process.env.RENDER_API_KEY?.trim()
if (!apiKey) apiKey = loadKeyFromCliYaml()
if (!apiKey) {
  console.error('Pas de RENDER_API_KEY (ni env ni ~/.render/cli.yaml).')
  process.exit(1)
}

const url = `${API}/services/${encodeURIComponent(SERVICE_ID)}/deploys`
const res = await fetch(url, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ clearCache: 'do_not_clear' }),
})
const text = await res.text()
if (!res.ok) {
  console.error(res.status, text)
  process.exit(1)
}
let id = ''
try {
  id = JSON.parse(text)?.id ?? ''
} catch {
  /* ignore */
}
console.log('Déploiement déclenché.', id ? `id: ${id}` : text.slice(0, 200))
