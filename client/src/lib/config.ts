function normalizeBaseUrl(v: unknown): string {
  const raw = (v ?? '').toString().trim()
  // If not provided, use the same host as the current page.
  // This is crucial for phones/QR access: "localhost" would point to the phone, not the PC.
  const fallbackHost =
    typeof window !== 'undefined' && window.location?.hostname
      ? window.location.hostname
      : 'localhost'
  const base = raw || `http://${fallbackHost}:5174`
  // Remove trailing slashes and any accidental whitespace inside.
  return base.replace(/\s+/g, '').replace(/\/+$/, '')
}

export const API_URL = normalizeBaseUrl(import.meta.env.VITE_API_URL)

