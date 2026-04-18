export function safeFileSlug(s: string | undefined): string {
  const t = (s ?? '').trim()
  if (!t) return 'tournoi'
  const x = t.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48)
  return x || 'tournoi'
}
