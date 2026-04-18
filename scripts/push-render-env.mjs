/**
 * Envoie les variables d’environnement vers un service Render (API REST).
 *
 * Prérequis :
 *   - RENDER_API_KEY dans l’environnement (https://dashboard.render.com/u/settings#api-keys)
 *   - soit RENDER_SERVICE_ID=srv-..., soit --name fc-rosendael-api
 *
 * Usage :
 *   cp .env.render.example .env.render
 *   # édite .env.render avec tes vraies valeurs
 *   npm run render:env
 *
 *   npm run render:env -- --from .env.render --name fc-rosendael-api
 *   npm run render:env -- --dry-run
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API = 'https://api.render.com/v1'

function parseArgs(argv) {
  const args = { from: path.join(__dirname, '..', '.env.render'), name: null, dryRun: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--from') args.from = argv[++i]
    else if (argv[i] === '--name') args.name = argv[++i]
    else if (argv[i] === '--dry-run') args.dryRun = true
  }
  return args
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

async function listServices(apiKey) {
  const url = new URL(`${API}/services`)
  url.searchParams.set('limit', '100')
  const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!res.ok) throw new Error(`GET /services → ${res.status} ${await res.text()}`)
  const data = await res.json()
  if (Array.isArray(data)) return data
  if (Array.isArray(data?.services)) return data.services
  if (Array.isArray(data?.items)) return data.items
  return []
}

async function resolveServiceId(apiKey, name) {
  if (process.env.RENDER_SERVICE_ID?.trim()) return process.env.RENDER_SERVICE_ID.trim()
  if (!name) {
    console.error('Indique RENDER_SERVICE_ID ou --name <nom-du-service>.')
    process.exit(1)
  }
  const services = await listServices(apiKey)
  const found = services.find((s) => s.name === name)
  if (!found?.id) {
    console.error(`Aucun service nommé « ${name} ». Services : ${services.map((s) => s.name).join(', ') || '(vide)'}`)
    process.exit(1)
  }
  return found.id
}

async function putEnvVar(apiKey, serviceId, key, value) {
  const url = `${API}/services/${encodeURIComponent(serviceId)}/env-vars/${encodeURIComponent(key)}`
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
  const apiKey = process.env.RENDER_API_KEY?.trim()
  if (!apiKey) {
    console.error('Définis RENDER_API_KEY (clé API Render, compte → API keys).')
    process.exit(1)
  }

  const { from, name, dryRun } = parseArgs(process.argv)
  if (!fs.existsSync(from)) {
    console.error(`Fichier introuvable : ${from}\nCopie .env.render.example vers .env.render et remplis les valeurs.`)
    process.exit(1)
  }

  const env = parseDotEnv(fs.readFileSync(from, 'utf8'))
  const skip = new Set(['RENDER_API_KEY', 'RENDER_SERVICE_ID'])
  const keys = Object.keys(env).filter((k) => !skip.has(k) && env[k] !== undefined && env[k] !== '')

  if (keys.length === 0) {
    console.error('Aucune variable à envoyer (fichier vide ou uniquement des lignes vides / commentaires).')
    process.exit(1)
  }

  const serviceId = await resolveServiceId(apiKey, name || 'fc-rosendael-api')

  console.log(`Service : ${serviceId}`)
  console.log(`Variables : ${keys.join(', ')}`)
  if (dryRun) {
    console.log('[dry-run] aucun appel API.')
    return
  }

  for (const k of keys) {
    process.stdout.write(`→ ${k}… `)
    await putEnvVar(apiKey, serviceId, k, env[k])
    console.log('ok')
  }

  console.log('\nTerminé. Sur Render : déclenche un « Manual deploy » si le service ne redémarre pas tout seul.')
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
