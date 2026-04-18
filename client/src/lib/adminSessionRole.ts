const KEY = 'clubAdminSessionRole'

export type AdminSessionRole = 'full' | 'turso'

export function getAdminSessionRole(): AdminSessionRole | null {
  if (!localStorage.getItem('adminToken')) return null
  const r = localStorage.getItem(KEY)
  if (r === 'turso') return 'turso'
  return 'full'
}

export function setAdminSessionRole(role: AdminSessionRole) {
  localStorage.setItem(KEY, role)
}

export function clearAdminSessionRole() {
  localStorage.removeItem(KEY)
}

/** Cible du raccourci admin (icône flottante). */
export function adminEntryPath(): '/admin' | '/admin/turso' {
  return getAdminSessionRole() === 'turso' ? '/admin/turso' : '/admin'
}
