/**
 * Met à jour TURSO_DATABASE_URL et TURSO_AUTH_TOKEN sur Render à partir de .env.render (gitignoré).
 * Clé API : RENDER_API_KEY ou ~/.render/cli.yaml
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API = 'https://api.render.com/v1'
const SERVICE_ID = process.env.RENDER_SERVICE_ID?.trim() || 'srv-d7ht06vaqgkc739i5sc0'

function loadKeyFromCliYaml() {
  const p = path.join(process.env.USERPROFILE || os.homedir(), '.render', 'cli.yaml')
  const raw = fs.readFileSync(p, 'utf8')
  const m = raw.match(/key:\s*(rnd_[a-zA-Z0-9]+)/)
  return m?.[1] || ''
}

function parseDotEnv(text) {
  const out = {}
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const key = t.slice(0, eq).trim()
    let val = t.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1)
    out[key] = val
  }
  return out
}

async function putEnvVar(apiKey, key, value) {
  const url = `${API}/services/${encodeURIComponent(SERVICE_ID)}/env-vars/${encodeURIComponent(key)}`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value }),
  })
  if (!res.ok) throw new Error(`PUT ${key} → ${res.status} ${await res.text()}`)
}

async function main() {
  let apiKey = process.env.RENDER_API_KEY?.trim()
  if (!apiKey) apiKey = loadKeyFromCliYaml()
  if (!apiKey) {
    console.error('Pas de RENDER_API_KEY (ni env ni ~/.render/cli.yaml).')
    process.exit(1)
  }
  const envPath = path.join(__dirname, '..', '.env.render')
  if (!fs.existsSync(envPath)) {
    console.error('Crée .env.render avec TURSO_DATABASE_URL et TURSO_AUTH_TOKEN (voir .env.render.example).')
    process.exit(1)
  }
  const env = parseDotEnv(fs.readFileSync(envPath, 'utf8'))
  const url = (env.TURSO_DATABASE_URL || '').trim()
  const token = (env.TURSO_AUTH_TOKEN || '').trim()
  if (!url || !token) {
    console.error('.env.render doit contenir TURSO_DATABASE_URL et TURSO_AUTH_TOKEN.')
    process.exit(1)
  }
  console.log(`Service ${SERVICE_ID}`)
  process.stdout.write('→ TURSO_DATABASE_URL… ')
  await putEnvVar(apiKey, 'TURSO_DATABASE_URL', url)
  console.log('ok')
  process.stdout.write('→ TURSO_AUTH_TOKEN… ')
  await putEnvVar(apiKey, 'TURSO_AUTH_TOKEN', token)
  console.log('ok')
  console.log('\nTerminé. Redéploie le service Render si besoin.')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
