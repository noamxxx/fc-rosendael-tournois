import { API_BASE_CONFIGURED, API_URL } from './config'

/**
 * Réveille l’API dès le chargement du bundle (avant React) : TLS + instance hébergeur.
 * Précharge aussi l’index des tournois (même donnée que l’accueil) pour que la liste arrive plus vite.
 */
function warm() {
  if (!API_BASE_CONFIGURED || typeof window === 'undefined') return
  const init: RequestInit = {
    method: 'GET',
    cache: 'no-store',
    mode: 'cors',
    keepalive: true,
  }
  void fetch(`${API_URL}/health`, init).catch(() => {})
  queueMicrotask(() => {
    void fetch(`${API_URL}/api/tournaments`, init).catch(() => {})
  })
}

warm()
