/** Émis quand le jeton admin est défini, retiré ou invalidé (ex. 401). */
export const ADMIN_AUTH_CHANGED_EVENT = 'club-admin-auth-changed'

export function notifyAdminAuthChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ADMIN_AUTH_CHANGED_EVENT))
}
