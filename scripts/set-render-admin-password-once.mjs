/**
 * Usage (une fois) : node scripts/set-render-admin-password-once.mjs <mot-de-passe>
 * Lit la clé API dans ~/.render/cli.yaml (comme rotate-render-admin-password.mjs).
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

const pwd = process.argv[2]
if (!pwd || pwd.length < 1) {
  console.error('Usage: node scripts/set-render-admin-password-once.mjs <mot-de-passe>')
  process.exit(1)
}

const apiKey = process.env.RENDER_API_KEY?.trim() || loadKeyFromCliYaml()
if (!apiKey) {
  console.error('Pas de clé Render (RENDER_API_KEY ou ~/.render/cli.yaml).')
  process.exit(1)
}

const url = `${API}/services/${SERVICE_ID}/env-vars/ADMIN_PASSWORD`
const res = await fetch(url, {
  method: 'PUT',
  headers: {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ value: pwd }),
})
const t = await res.text()
if (!res.ok) {
  console.error(res.status, t)
  process.exit(1)
}
console.log('ADMIN_PASSWORD mis à jour sur Render.')
