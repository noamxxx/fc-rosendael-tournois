function trimBaseUrl(raw: string): string {
  return raw.replace(/\s+/g, '').replace(/\/+$/, '')
}

/**
 * URL de l’API Node (sans slash final). Définie au build via VITE_API_URL (obligatoire sur Pages / HTTPS).
 */
function resolveApiBaseUrl(): string {
  const raw = trimBaseUrl((import.meta.env.VITE_API_URL ?? '').toString().trim())
  if (raw) return raw

  // Dev Vite : même machine, port API par défaut (QR / téléphone sur le LAN).
  if (import.meta.env.DEV) {
    const fallbackHost =
      typeof window !== 'undefined' && window.location?.hostname
        ? window.location.hostname
        : 'localhost'
    return `http://${fallbackHost}:5174`
  }

  if (typeof window === 'undefined') {
    return 'http://localhost:5174'
  }

  const { hostname, protocol } = window.location
  const isLoopback =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')

  const looksLikeStaticHost =
    hostname.endsWith('.pages.dev') ||
    hostname.endsWith('.vercel.app') ||
    hostname.endsWith('.netlify.app')

  // Sur l’hébergement statique HTTPS, le défaut http://<host>:5174 est faux (pas d’API) et peut être bloqué (mixed content).
  if (looksLikeStaticHost || (protocol === 'https:' && !isLoopback)) {
    return ''
  }

  return `http://${hostname}:5174`
}

export const API_URL = resolveApiBaseUrl()

/** False si le build de prod n’a pas VITE_API_URL (obligatoire hors dev / HTTP local). */
export const API_BASE_CONFIGURED = API_URL.length > 0

const MISSING_API_MSG =
  "L'URL de l'API n'est pas configurée. Dans Cloudflare Pages : Settings → Environment variables → section Build, ajoute VITE_API_URL (HTTPS, sans slash final, ex. https://api.tondomaine.com), puis redeploie le site."

export function assertApiBaseConfigured(): void {
  if (!API_BASE_CONFIGURED) {
    throw new Error(MISSING_API_MSG)
  }
}
