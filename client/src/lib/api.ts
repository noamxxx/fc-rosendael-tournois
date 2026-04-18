import { API_URL, assertApiBaseConfigured } from './config'
import { notifyAdminAuthChanged } from './adminAuth'
import { clearAdminSessionRole, setAdminSessionRole, type AdminSessionRole } from './adminSessionRole'
import type { TeamPlayer, TournamentSnapshot, TournamentPublic, TournamentsIndex } from './types'

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  assertApiBaseConfigured()
  // Ne pas envoyer un vieux Bearer sur la route login (sinon confusion + message 401 peu clair).
  const skipBearer = path === '/api/admin/login'
  const token = skipBearer ? '' : (localStorage.getItem('adminToken') ?? '')
  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init?.headers ?? {}),
      },
    })
  } catch (e) {
    const hint =
      'Impossible de joindre l’API. Vérifie VITE_API_URL (HTTPS), que le serveur tourne, et les en-têtes CORS (ORIGIN sur l’API).'
    if (e instanceof TypeError) throw new Error(hint)
    throw e
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    if (res.status === 401) {
      localStorage.removeItem('adminToken')
      clearAdminSessionRole()
      notifyAdminAuthChanged()
      const fromServer = text.trim()
      const fallback =
        'Session expirée, secret serveur différent, ou accès refusé. Reconnecte-toi via l’icône administrateur en bas à droite.'
      throw new Error(fromServer || fallback)
    }
    throw new Error(text || `Erreur serveur (${res.status}).`)
  }
  return (await res.json()) as T
}

export async function adminLogin(password: string): Promise<{ role: AdminSessionRole }> {
  const res = await api<{ token: string; role: AdminSessionRole }>('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  localStorage.setItem('adminToken', res.token)
  setAdminSessionRole(res.role === 'turso' ? 'turso' : 'full')
  notifyAdminAuthChanged()
  return { role: res.role === 'turso' ? 'turso' : 'full' }
}

/** Jeton Google (credential) → même session admin que le mot de passe. */
export async function adminLoginWithGoogle(credential: string): Promise<{ email?: string }> {
  assertApiBaseConfigured()
  let res: Response
  try {
    res = await fetch(`${API_URL}/api/auth/google`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ credential }),
    })
  } catch (e) {
    const hint =
      'Impossible de joindre l’API. Vérifie VITE_API_URL (HTTPS), que le serveur tourne, et les en-têtes CORS (ORIGIN sur l’API).'
    if (e instanceof TypeError) throw new Error(hint)
    throw e
  }
  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(text || `Erreur serveur (${res.status}).`)
  const data = JSON.parse(text) as { token: string; email?: string }
  localStorage.setItem('adminToken', data.token)
  setAdminSessionRole('full')
  notifyAdminAuthChanged()
  return { email: data.email }
}

export type TursoConnectionStatus = {
  source: 'local_file' | 'env' | 'file'
  isTursoRemote: boolean
  displayHost: string
}

export async function getTursoStatus(): Promise<TursoConnectionStatus> {
  return api('/api/admin/turso-status')
}

export async function connectTursoRemote(
  databaseUrl: string,
  authToken: string,
): Promise<TursoConnectionStatus & { ok: boolean }> {
  return api('/api/admin/turso-connect', {
    method: 'POST',
    body: JSON.stringify({ databaseUrl, authToken }),
  })
}

export async function disconnectTursoLocalFile(): Promise<TursoConnectionStatus & { ok: boolean }> {
  return api('/api/admin/turso-local', { method: 'DELETE' })
}

export type ArchivedForCleanup = {
  id: string
  name: string
  slug: string
  archivedAt: string | null
  createdAt: string
  teams: number
  matches: number
  registrations: number
}

export async function listArchivedForCleanup(): Promise<{ tournaments: ArchivedForCleanup[] }> {
  return api('/api/admin/turso-cleanup/archived')
}

export async function deleteArchivedForCleanup(slug: string): Promise<void> {
  await api(`/api/admin/turso-cleanup/archived/${encodeURIComponent(slug)}`, { method: 'DELETE' })
}

export async function purgeAllArchivedForCleanup(
  confirm: 'ARCHIVÉS',
): Promise<{ ok: boolean; deleted: number }> {
  return api('/api/admin/turso-cleanup/purge-archived', {
    method: 'POST',
    body: JSON.stringify({ confirm }),
  })
}

export async function vacuumTursoCleanup(): Promise<{
  ok: boolean
  ran?: boolean
  message?: string
}> {
  return api('/api/admin/turso-cleanup/vacuum', { method: 'POST', body: JSON.stringify({}) })
}

export async function createTournament(input: {
  name: string
}): Promise<{ tournament: TournamentPublic }> {
  return await api('/api/tournaments', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function getTournamentSnapshot(
  slug: string,
): Promise<TournamentSnapshot> {
  return await api(`/api/tournaments/${encodeURIComponent(slug)}`)
}

export async function listTournaments(): Promise<TournamentsIndex> {
  return await api('/api/tournaments')
}

export async function addTeam(
  slug: string,
  name: string,
  contact?: { firstName?: string; lastName?: string },
): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/teams`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      contactFirstName: contact?.firstName?.trim() || undefined,
      contactLastName: contact?.lastName?.trim() || undefined,
    }),
  })
}

export async function deleteTeam(slug: string, teamId: string): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/teams/${encodeURIComponent(teamId)}`, {
    method: 'DELETE',
  })
}

export async function updateTeamName(slug: string, teamId: string, name: string): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/teams/${encodeURIComponent(teamId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ name }),
  })
}

export async function addTeamPlayer(
  slug: string,
  teamId: string,
  input: { firstName: string; lastName: string } | { registrationId: string },
): Promise<TeamPlayer> {
  const body =
    'registrationId' in input
      ? { registrationId: input.registrationId }
      : { firstName: input.firstName, lastName: input.lastName }
  const res = await api<{ ok: true; player: TeamPlayer }>(
    `/api/tournaments/${encodeURIComponent(slug)}/teams/${encodeURIComponent(teamId)}/players`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  )
  return res.player
}

export async function updateTeamPlayer(
  slug: string,
  teamId: string,
  playerId: string,
  input: { firstName: string; lastName: string },
): Promise<void> {
  await api(
    `/api/tournaments/${encodeURIComponent(slug)}/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        firstName: input.firstName,
        lastName: input.lastName,
      }),
    },
  )
}

export async function deleteTeamPlayer(slug: string, teamId: string, playerId: string): Promise<void> {
  await api(
    `/api/tournaments/${encodeURIComponent(slug)}/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}`,
    { method: 'DELETE' },
  )
}

export async function archiveTournament(slug: string): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/archive`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function generateBracket(
  slug: string,
  seedTeamIds?: string[],
): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/bracket/generate`, {
    method: 'POST',
    body: JSON.stringify({ seedTeamIds }),
  })
}

export async function resetBracket(slug: string): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/bracket/reset`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function setLiveTournament(mode: 'auto' | 'none' | 'slug', slug: string | null): Promise<void> {
  await api('/api/tournaments/live', {
    method: 'PUT',
    body: JSON.stringify({ mode, slug }),
  })
}

export async function createMatch(
  slug: string,
  homeTeamId: string,
  awayTeamId: string,
): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/matches`, {
    method: 'POST',
    body: JSON.stringify({ homeTeamId, awayTeamId }),
  })
}

export async function updateMatchScore(
  slug: string,
  matchId: string,
  homeScore: number,
  awayScore: number,
  status: 'scheduled' | 'final',
): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/matches/${matchId}`, {
    method: 'PATCH',
    body: JSON.stringify({ homeScore, awayScore, status }),
  })
}

export async function setLiveMatch(slug: string, matchId: string | null): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/live`, {
    method: 'PUT',
    body: JSON.stringify({ matchId }),
  })
}

export async function deleteTournament(slug: string): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}`, {
    method: 'DELETE',
  })
}

export async function getOpenRegistration(
  tournamentSlug?: string,
): Promise<
  | { open: false }
  | { open: true; tournament: { id: string; name: string; slug: string } }
> {
  const q =
    tournamentSlug && tournamentSlug.trim()
      ? `?slug=${encodeURIComponent(tournamentSlug.trim())}`
      : ''
  return await api(`/api/registration${q}`)
}

export async function signupRegistration(input: {
  firstName: string
  lastName: string
  /** Code du tournoi (recommandé si plusieurs tournois actifs). */
  slug?: string
}): Promise<void> {
  await api('/api/registration/signup', {
    method: 'POST',
    body: JSON.stringify({
      firstName: input.firstName,
      lastName: input.lastName,
      ...(input.slug?.trim() ? { slug: input.slug.trim() } : {}),
    }),
  })
}

export type RegistrationRow = {
  id: string
  firstName: string
  lastName: string
  status: 'pending' | 'approved' | 'rejected'
  addedToTeam: number
  createdAt: string
}

export async function listRegistrations(slug: string): Promise<RegistrationRow[]> {
  const res = await api<{ registrations: RegistrationRow[] }>(
    `/api/tournaments/${encodeURIComponent(slug)}/registrations`,
  )
  return res.registrations
}

export async function setRegistrationOpen(slug: string, open: boolean): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/registration`, {
    method: 'PUT',
    body: JSON.stringify({ open }),
  })
}

export async function setRegistrationStatus(
  slug: string,
  id: string,
  status: 'pending' | 'approved' | 'rejected',
): Promise<void> {
  await api(`/api/tournaments/${encodeURIComponent(slug)}/registrations/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export async function autoCreateTeamsFromRegistrations(slug: string): Promise<{ teamsCreated: number }> {
  return await api(`/api/tournaments/${encodeURIComponent(slug)}/registrations/auto-teams`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

