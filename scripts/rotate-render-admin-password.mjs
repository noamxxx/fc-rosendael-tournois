/**
 * Met à jour ADMIN_PASSWORD sur le service Render (API).
 * Lit RENDER_API_KEY depuis %USERPROFILE%\.render\cli.yaml si RENDER_API_KEY absent.
 */
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

const SERVICE_ID = process.env.RENDER_SERVICE_ID?.trim() || 'srv-d7ht06vaqgkc739i5sc0'
const API = 'https://api.render.com/v1'

function loadKeyFromCliYaml() {
  const p = path.join(process.env.USERPROFILE || os.homedir(), '.render', 'cli.yaml')
  const raw = fs.readFileSync(p, 'utf8')
  const m = raw.match(/key:\s*(rnd_[a-zA-Z0-9]+)/)
  return m?.[1] || ''
}

async function main() {
  let apiKey = process.env.RENDER_API_KEY?.trim()
  if (!apiKey) apiKey = loadKeyFromCliYaml()
  if (!apiKey) {
    console.error('Pas de RENDER_API_KEY (ni dans l’env ni dans ~/.render/cli.yaml).')
    process.exit(1)
  }

  const pwd = crypto.randomBytes(12).toString('base64url')
  const url = `${API}/services/${SERVICE_ID}/env-vars/ADMIN_PASSWORD`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ value: pwd }),
  })
  if (!res.ok) {
    console.error(await res.text())
    process.exit(1)
  }
  console.log('ADMIN_PASSWORD mis à jour sur Render.')
  console.log('Nouveau mot de passe admin (garde-le précieusement) :')
  console.log(pwd)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
