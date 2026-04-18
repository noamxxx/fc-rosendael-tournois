import { useEffect, useMemo, useState, type ComponentType } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as ReactQrCodeModule from 'react-qr-code'
import {
  addTeam,
  addTeamPlayer,
  autoCreateTeamsFromRegistrations,
  archiveTournament,
  deleteTeam,
  deleteTeamPlayer,
  generateBracket,
  listRegistrations,
  resetBracket,
  setRegistrationOpen,
  setRegistrationStatus,
  setLiveMatch,
  updateTeamName,
  updateTeamPlayer,
  updateMatchScore,
  type RegistrationRow,
} from '../lib/api'
import type { Match } from '../lib/types'
import { ADMIN_AUTH_CHANGED_EVENT } from '../lib/adminAuth'
import { downloadClubQrFlyersPdf } from '../lib/buildQrFlyersPdf'
import { API_URL } from '../lib/config'
import { safeFileSlug } from '../lib/safeFileSlug'
import { useTournamentLive } from '../hooks/useTournamentLive'
import { BracketView } from '../components/BracketView'
import { Button } from '../ui/Button'
import { Card, CardBody } from '../ui/Card'
import { Input } from '../ui/Input'
import { Layout } from '../ui/Layout'

/** Vite + CJS : `default` peut être le composant ou un wrapper `{ default }` ; le composant est aussi un objet (forwardRef). */
function resolveQrCodeComponent(): ComponentType<{ value: string; size?: number }> | null {
  const p: any = ReactQrCodeModule
  const candidates = [p?.default, p?.default?.default, p?.QRCode, p]
  for (const c of candidates) {
    if (typeof c === 'function') return c as ComponentType<{ value: string; size?: number }>
    if (c && typeof c === 'object' && '$$typeof' in c) return c as ComponentType<{ value: string; size?: number }>
  }
  return null
}

const QrCodeView = resolveQrCodeComponent()

function nextPowerOfTwo(n: number) {
  let p = 1
  while (p < n) p *= 2
  return p
}

function shuffle<T>(arr: T[]) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function registrationLinked(r: Pick<RegistrationRow, 'addedToTeam'>): boolean {
  return Number(r.addedToTeam) === 1
}

function regStatusLabel(status: string) {
  switch (status) {
    case 'pending':
      return 'En attente'
    case 'approved':
      return 'Autorisé'
    case 'rejected':
      return 'Refusé'
    default:
      return status
  }
}

function regStatusChipClass(status: string) {
  switch (status) {
    case 'pending':
      return 'border-amber-400/40 bg-amber-500/12 text-amber-950'
    case 'approved':
      return 'border-emerald-500/40 bg-emerald-500/12 text-emerald-950'
    case 'rejected':
      return 'border-black/10 bg-black/[0.04] text-black/50'
    default:
      return 'border-black/10 bg-white text-black/70'
  }
}

function normalizeSeed({
  teamIds,
  seed,
}: {
  teamIds: string[]
  seed: string[] | null
}) {
  const size = nextPowerOfTwo(teamIds.length)
  const byes = size - teamIds.length
  // BYE is no longer allowed/visible. Bracket generation now refuses non power-of-two team counts.
  const allowed = new Set([...teamIds])

  const cleaned = (seed ?? []).filter((id) => allowed.has(id))
  const uniqueTeams = new Set<string>()
  const result: string[] = []

  for (const id of cleaned) {
    if (uniqueTeams.has(id)) continue
    uniqueTeams.add(id)
    result.push(id)
  }

  // Ensure every team appears once
  for (const id of teamIds) {
    if (!uniqueTeams.has(id)) {
      uniqueTeams.add(id)
      result.push(id)
    }
  }

  // If team count isn't a power of two, we don't try to fill with BYE anymore.
  // The server refuses generating the bracket in that case.

  return { size, byes, seed: result }
}

/** Premier match encore « scheduled », sinon dernier match de l’arbre (scores finaux). */
function pickDefaultLiveMatchId(matches: Match[]): string {
  const bracket = [...matches]
    .filter((m) => m.round != null)
    .sort((a, b) => {
      const dr = Number(a.round) - Number(b.round)
      if (dr !== 0) return dr
      return Number(a.slot ?? 0) - Number(b.slot ?? 0)
    })
  const scheduled = bracket.filter((m) => m.status === 'scheduled')
  if (scheduled.length > 0) return scheduled[0].id
  if (bracket.length > 0) return bracket[bracket.length - 1].id
  return ''
}

export function AdminTournamentPage() {
  const { slug } = useParams()
  const nav = useNavigate()

  const { state, reloadSnapshot } = useTournamentLive(slug ?? '')

  const viewerUrl = useMemo(() => {
    if (!slug) return ''
    return `${window.location.origin}/t/${slug}`
  }, [slug])
  const registrationUrl = useMemo(() => {
    const base = window.location.origin
    return slug ? `${base}/inscription?slug=${encodeURIComponent(slug)}` : `${base}/inscription`
  }, [slug])
  const liveMatchUrl = useMemo(() => {
    if (!slug) return ''
    return `${window.location.origin}/t/${slug}#live`
  }, [slug])

  const qrFileBase = useMemo(() => safeFileSlug(slug), [slug])
  const [flyerPdfBusy, setFlyerPdfBusy] = useState(false)
  const [directFlyerBusy, setDirectFlyerBusy] = useState(false)

  const registrationOpen =
    state.status === 'ready' ? Boolean((state.data.tournament as any)?.registrationOpen) : false
  const hasBracket = state.status === 'ready' && Boolean(state.data.bracket)
  const hasLiveMatch =
    state.status === 'ready' ? Boolean(state.data.tournament.liveMatchId) : false
  const liveMatchId = state.status === 'ready' ? (state.data.tournament.liveMatchId ?? '') : ''

  const autoLiveMatchId = useMemo(() => {
    if (state.status !== 'ready' || !state.data.bracket) return ''
    return pickDefaultLiveMatchId(state.data.matches)
  }, [
    state.status,
    state.status === 'ready' ? state.data.bracket : null,
    state.status === 'ready' ? state.data.matches : null,
  ])

  const [newTeam, setNewTeam] = useState('')
  const [newContactFirst, setNewContactFirst] = useState('')
  const [newContactLast, setNewContactLast] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onDownloadFlyerPdf() {
    if (state.status !== 'ready') return
    const canInscription = registrationOpen && Boolean(registrationUrl)
    if (!canInscription) return
    setFlyerPdfBusy(true)
    setError(null)
    try {
      await downloadClubQrFlyersPdf({
        logoDataUrl: null,
        tournamentName: state.data.tournament.name,
        registrationUrl: registrationUrl,
        filenameBase: `flyer-inscription-${qrFileBase}-fc-rosendael`,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de générer le PDF.')
    } finally {
      setFlyerPdfBusy(false)
    }
  }

  async function onDownloadDirectFlyerPdf() {
    if (state.status !== 'ready' || !slug) return
    if (!hasBracket || !hasLiveMatch || !liveMatchUrl) {
      setError('Génère l’arbre et démarre le direct pour pouvoir créer le flyer.')
      return
    }
    setDirectFlyerBusy(true)
    setError(null)
    try {
      await downloadClubQrFlyersPdf({
        logoDataUrl: null,
        tournamentName: state.data.tournament.name,
        liveMatchUrl,
        filenameBase: `flyer-direct-${qrFileBase}-fc-rosendael`,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Impossible de générer le PDF.')
    } finally {
      setDirectFlyerBusy(false)
    }
  }

  const [seedTeamIds, setSeedTeamIds] = useState<string[] | null>(null)
  const [playerDrafts, setPlayerDrafts] = useState<Record<string, { first: string; last: string }>>({})
  const [newPlayers, setNewPlayers] = useState<Record<string, { first: string; last: string }>>({})
  const [pickRegForTeam, setPickRegForTeam] = useState<Record<string, string>>({})
  const [registrations, setRegistrations] = useState<Array<any>>([])
  const [regStatus, setRegStatus] = useState<'idle' | 'loading' | 'error'>('idle')
  const [regLoadError, setRegLoadError] = useState<string | null>(null)
  const [regActionError, setRegActionError] = useState<string | null>(null)
  const [teamNameEdits, setTeamNameEdits] = useState<Record<string, string>>({})
  const [, authRevision] = useState(0)

  const hasToken = Boolean(localStorage.getItem('adminToken') ?? '')

  useEffect(() => {
    const bump = () => authRevision((n) => n + 1)
    window.addEventListener(ADMIN_AUTH_CHANGED_EVENT, bump)
    return () => window.removeEventListener(ADMIN_AUTH_CHANGED_EVENT, bump)
  }, [])

  const regStats = useMemo(() => {
    const approved = registrations.filter((r) => r.status === 'approved')
    const pending = registrations.filter((r) => r.status === 'pending')
    const free = approved.filter((r) => !registrationLinked(r))
    return {
      approved: approved.length,
      pending: pending.length,
      freeApproved: free.length,
      pairsReady: Math.floor(free.length / 2),
    }
  }, [registrations])

  const regsFreeForPick = useMemo(
    () =>
      registrations.filter(
        (r: RegistrationRow) => r.status === 'approved' && !registrationLinked(r),
      ),
    [registrations],
  )

  /** Refus = suppression côté serveur ; on masque encore l’ancien statut « rejected » si présent en base. */
  const registreVisible = useMemo(
    () => registrations.filter((r) => r.status !== 'rejected'),
    [registrations],
  )

  async function refreshRegistrations() {
    if (!slug) return
    if (!localStorage.getItem('adminToken')) {
      setRegistrations([])
      setRegLoadError(null)
      setRegStatus('idle')
      return
    }
    setRegStatus('loading')
    setRegLoadError(null)
    try {
      const rows = await listRegistrations(slug)
      setRegistrations(rows)
      setRegStatus('idle')
    } catch (e) {
      setRegLoadError(e instanceof Error ? e.message : 'Erreur inconnue')
      setRegStatus('error')
    }
  }

  useEffect(() => {
    if (!slug || state.status !== 'ready') return
    if (!hasToken) {
      setRegistrations([])
      setRegLoadError(null)
      setRegStatus('idle')
      return
    }
    let cancelled = false
    setRegistrations([])
    setRegLoadError(null)
    setRegStatus('loading')
    listRegistrations(slug)
      .then((rows) => {
        if (cancelled) return
        setRegistrations(rows)
        setRegStatus('idle')
      })
      .catch((e) => {
        if (cancelled) return
        setRegLoadError(e instanceof Error ? e.message : 'Erreur inconnue')
        setRegStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [slug, state.status, hasToken])

  async function onToggleRegistration(open: boolean) {
    if (!slug) return
    setBusy(true)
    setRegActionError(null)
    try {
      await setRegistrationOpen(slug, open)
    } catch (e) {
      setRegActionError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onSetRegStatus(id: string, status: 'pending' | 'approved' | 'rejected') {
    if (!slug) return
    setBusy(true)
    setRegActionError(null)
    try {
      await setRegistrationStatus(slug, id, status)
      await refreshRegistrations()
    } catch (e) {
      setRegActionError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onAutoTeamsFromRegs() {
    if (!slug) return
    setBusy(true)
    setRegActionError(null)
    try {
      await autoCreateTeamsFromRegistrations(slug)
      await refreshRegistrations()
    } catch (e) {
      setRegActionError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onAddTeam() {
    if (!slug || !newTeam.trim()) return
    setBusy(true)
    setError(null)
    try {
      await addTeam(slug, newTeam.trim(), {
        firstName: newContactFirst,
        lastName: newContactLast,
      })
      setNewTeam('')
      setNewContactFirst('')
      setNewContactLast('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onRenameTeam(teamId: string) {
    if (!slug || state.status !== 'ready') return
    const nextName = (
      teamNameEdits[teamId] ?? state.data.teams.find((x) => x.id === teamId)?.name ??
      ''
    ).trim()
    if (nextName.length < 2) return
    setBusy(true)
    setError(null)
    try {
      await updateTeamName(slug, teamId, nextName)
      setTeamNameEdits((prev) => {
        const n = { ...prev }
        delete n[teamId]
        return n
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onDeleteTeam(teamId: string) {
    if (!slug) return
    setBusy(true)
    setError(null)
    try {
      await deleteTeam(slug, teamId)
      setSeedTeamIds(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onAddPlayer(teamId: string) {
    if (!slug) return
    const draft = newPlayers[teamId] ?? { first: '', last: '' }
    const firstName = draft.first.trim()
    const lastName = draft.last.trim()
    if (!firstName || !lastName) return
    setBusy(true)
    setError(null)
    try {
      await addTeamPlayer(slug, teamId, { firstName, lastName })
      setNewPlayers((prev) => ({ ...prev, [teamId]: { first: '', last: '' } }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onAddPlayerFromRegistration(teamId: string) {
    if (!slug) return
    const regId = (pickRegForTeam[teamId] ?? '').trim()
    if (!regId) return
    setBusy(true)
    setError(null)
    try {
      await addTeamPlayer(slug, teamId, { registrationId: regId })
      setPickRegForTeam((prev) => ({ ...prev, [teamId]: '' }))
      await refreshRegistrations()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onSavePlayer(teamId: string, playerId: string) {
    if (!slug) return
    const d = playerDrafts[playerId]
    if (!d) return
    const firstName = d.first.trim()
    const lastName = d.last.trim()
    if (!firstName || !lastName) return
    setBusy(true)
    setError(null)
    try {
      await updateTeamPlayer(slug, teamId, playerId, { firstName, lastName })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onDeletePlayer(teamId: string, playerId: string) {
    if (!slug) return
    setBusy(true)
    setError(null)
    try {
      await deleteTeamPlayer(slug, teamId, playerId)
      setPlayerDrafts((prev) => {
        const next = { ...prev }
        delete next[playerId]
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onQuickScore(matchId: string, home: number, away: number) {
    if (!slug) return
    setBusy(true)
    setError(null)
    try {
      await updateMatchScore(slug, matchId, home, away, 'final')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onGenerateBracket() {
    if (!slug || state.status !== 'ready') return
    const ids = state.data.teams.map((t) => t.id)
    const sizePow = nextPowerOfTwo(ids.length)
    if (ids.length < 2 || sizePow !== ids.length) return

    setBusy(true)
    setError(null)
    try {
      // Toujours envoyer un tableau de taille exacte (évite un seed React obsolète après ajout/suppression d’équipes).
      const seedPayload = seedTeamIds
        ? normalizeSeed({ teamIds: ids, seed: seedTeamIds }).seed
        : undefined
      await generateBracket(slug, seedPayload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onArchive() {
    if (!slug) return
    setBusy(true)
    setError(null)
    try {
      await archiveTournament(slug)
      nav('/')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onResetBracket() {
    if (!slug) return
    setBusy(true)
    setError(null)
    try {
      await resetBracket(slug)
      setSeedTeamIds(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  async function onSetLiveMatch(matchId: string | null) {
    if (!slug) return
    setBusy(true)
    setError(null)
    try {
      await setLiveMatch(slug, matchId)
      await reloadSnapshot()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  if (!slug) {
    return (
      <Layout>
        <Card>
          <CardBody>
            <div className="text-sm text-black/70">Tournoi introuvable.</div>
            <div className="mt-4">
              <Button onClick={() => nav('/')}>Retour</Button>
            </div>
          </CardBody>
        </Card>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="grid gap-4">
          {state.status === 'loading' && (
            <Card>
              <CardBody className="border border-black/5">
                <div className="text-xs font-semibold tracking-[0.22em] text-black/45">TOURNOI</div>
                <div className="mt-2 text-lg font-bold text-black/80">Chargement des données…</div>
                <p className="mt-2 text-sm text-black/55">Récupération des équipes, matchs et paramètres.</p>
                <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-black/10">
                  <div className="h-full w-1/3 animate-pulse rounded-full bg-gradient-to-r from-rose-400/70 to-emerald-400/70" />
                </div>
              </CardBody>
            </Card>
          )}
          {state.status === 'error' && (
            <Card>
              <CardBody className="border border-red-200/40 bg-gradient-to-br from-red-50/80 via-white to-white">
                <div className="text-xs font-semibold tracking-[0.22em] text-red-800/70">ERREUR</div>
                <div className="mt-2 text-sm font-semibold text-red-800">{state.error}</div>
                <div className="mt-3 text-xs leading-relaxed text-black/55">
                  Vérifie que l’API répond sur <span className="font-mono text-black/70">{API_URL}</span>.
                </div>
              </CardBody>
            </Card>
          )}
          {state.status === 'ready' && (
            <>
              {state.data.bracket ? (
                <div className="grid gap-4">
                  <Card>
                    <CardBody className="flex flex-col items-start justify-between gap-4 border border-black/6 bg-white/90 md:flex-row md:items-center">
                      <div>
                        <div className="text-xs font-semibold tracking-[0.22em] text-black/50">ARBRE</div>
                        <div className="mt-1 text-xl font-extrabold tracking-tight text-black/90">Déjà généré</div>
                        <div className="mt-2 max-w-xl text-sm leading-relaxed text-black/58">
                          Pour modifier les confrontations ou les équipes, réinitialise d’abord l’arbre (les scores
                          matchs seront effacés).
                        </div>
                      </div>
                      <Button
                        variant="danger"
                        disabled={busy || !hasToken}
                        onClick={onResetBracket}
                      >
                        Réinitialiser l’arbre
                      </Button>
                    </CardBody>
                  </Card>

                  <Card className="relative isolate overflow-x-hidden">
                    <CardBody className="relative">
                      <BracketView
                        teams={state.data.teams}
                        rounds={state.data.bracket.rounds}
                        editableScores={{
                          enabled: true,
                          debounceMs: 350,
                          disabled: () => busy || !hasToken,
                          onSave: onQuickScore,
                        }}
                      />
                    </CardBody>
                  </Card>
                </div>
              ) : (
                <Card>
                  <CardBody className="border border-black/6 bg-white/90">
                    <div className="text-xs font-semibold tracking-[0.22em] text-black/50">ARBRE D’ÉLIMINATION</div>
                    <div className="mt-1 text-2xl font-extrabold tracking-tight text-black/90">Pas encore généré</div>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-black/58">
                      Place les équipes (ou mélange), vérifie le nombre d’équipes (puissance de 2), puis lance la
                      génération.
                    </p>

                    {state.data.teams.length >= 2 ? (
                      <div className="mt-5 grid gap-4">
                        {(() => {
                          const ids = state.data.teams.map((t) => t.id)
                          const sizePow = nextPowerOfTwo(ids.length)
                          const isPowerOfTwo = ids.length >= 2 && sizePow === ids.length

                          return (
                            <>
                              {!isPowerOfTwo ? (
                                <div className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-800">
                                  Pour générer un arbre avec des matchs complets (2 équipes par match), il faut
                                  exactement <span className="font-semibold">2, 4, 8, 16…</span> équipes. Là tu en as{' '}
                                  <span className="font-semibold">{ids.length}</span>.
                                </div>
                              ) : null}

                              {isPowerOfTwo ? (
                                <>
                                  <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                      variant="ghost"
                                      disabled={busy}
                                      onClick={() => {
                                        const shuffled = shuffle(ids)
                                        setSeedTeamIds(shuffled)
                                      }}
                                    >
                                      Mélanger
                                    </Button>
                                    <Button variant="ghost" disabled={busy} onClick={() => setSeedTeamIds(null)}>
                                      Auto
                                    </Button>
                                  </div>

                                  {(() => {
                                    const norm = normalizeSeed({ teamIds: ids, seed: seedTeamIds })
                                    const effective = norm.seed
                                    const size = norm.size

                                    return (
                                      <div className="grid gap-3">
                                        <div className="text-xs text-black/55">
                                          \(1\) Choisis les confrontations • \(2\) Clique “Générer l’arbre”
                                        </div>
                                        {Array.from({ length: size / 2 }, (_, matchIdx) => {
                                          const aIdx = matchIdx * 2
                                          const bIdx = matchIdx * 2 + 1
                                          const a = effective[aIdx]
                                          const b = effective[bIdx]

                                          const setSlot = (idx: number, value: string) => {
                                            const next = [...effective]
                                            const curr = next[idx]
                                            if (value === curr) return
                                            const otherIdx = next.findIndex((x, j) => j !== idx && x === value)
                                            if (otherIdx >= 0) {
                                              ;[next[idx], next[otherIdx]] = [next[otherIdx], next[idx]]
                                            } else {
                                              next[idx] = value
                                            }
                                            setSeedTeamIds(next)
                                          }

                                          return (
                                            <div
                                              key={matchIdx}
                                              className="rounded-2xl border border-white/10 bg-white/5 p-4"
                                            >
                                              <div className="text-xs font-semibold tracking-wide text-black/55">
                                                Rencontre {matchIdx + 1}
                                              </div>
                                              <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
                                                <select
                                                  className="h-11 w-full appearance-none rounded-xl border border-white/15 bg-black/40 px-4 text-sm text-white outline-none focus:border-rose-500/40 focus:ring-2 focus:ring-rose-500/40"
                                                  value={a}
                                                  onChange={(e) => setSlot(aIdx, e.target.value)}
                                                  style={{ colorScheme: 'dark' }}
                                                >
                                                  {state.data.teams.map((t) => (
                                                    <option
                                                      key={t.id}
                                                      value={t.id}
                                                      className="bg-black text-white"
                                                    >
                                                      {t.name}
                                                    </option>
                                                  ))}
                                                </select>

                                                <div className="mx-auto text-xs text-black/55">contre</div>

                                                <select
                                                  className="h-11 w-full appearance-none rounded-xl border border-white/15 bg-black/40 px-4 text-sm text-white outline-none focus:border-emerald-500/40 focus:ring-2 focus:ring-emerald-500/40"
                                                  value={b}
                                                  onChange={(e) => setSlot(bIdx, e.target.value)}
                                                  style={{ colorScheme: 'dark' }}
                                                >
                                                  {state.data.teams.map((t) => (
                                                    <option
                                                      key={t.id}
                                                      value={t.id}
                                                      className="bg-black text-white"
                                                    >
                                                      {t.name}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )
                                  })()}
                                </>
                              ) : null}
                            </>
                          )
                        })()}
                      </div>
                    ) : (
                      <div className="mt-5 text-sm text-black/55">
                        Ajoute au moins 2 équipes.
                      </div>
                    )}

                    <div className="mt-5">
                      <Button
                        disabled={
                          busy ||
                          state.data.teams.length < 2 ||
                          nextPowerOfTwo(state.data.teams.length) !== state.data.teams.length ||
                          !hasToken
                        }
                        onClick={onGenerateBracket}
                      >
                        Générer l’arbre
                      </Button>
                      {!hasToken ? (
                        <div className="mt-3 text-xs text-black/55">
                          Connexion Admin requise. Clique sur le logo (en haut) puis connecte-toi.
                        </div>
                      ) : null}
                    </div>
                  </CardBody>
                </Card>
              )}
            </>
          )}
        {!hasToken ? (
          <Card>
            <CardBody className="border border-amber-200/35 bg-gradient-to-br from-amber-50/90 via-white to-white">
              <div className="text-xs font-semibold tracking-[0.22em] text-amber-900/70">ACCÈS ADMIN</div>
              <h2 className="mt-1 text-xl font-extrabold tracking-tight text-black/90">Connexion requise</h2>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-black/60">
                Les changements (équipes, arbre, scores, inscriptions, direct) sont réservés à l’organisateur connecté.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button onClick={() => nav('/admin')}>Ouvrir l’accès Admin</Button>
                <Button variant="ghost" onClick={() => nav('/')}>
                  Accueil
                </Button>
              </div>
            </CardBody>
          </Card>
        ) : null}

        <Card>
          <CardBody className="flex flex-col gap-6">
            <header className="border-b border-black/10 pb-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-xs font-semibold tracking-[0.22em] text-black/50">VISIONNEURS</div>
                  <h2 className="mt-1 text-xl font-extrabold tracking-tight text-black/90 md:text-2xl">Liens & QR</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-black/58">
                    Aucun mot de passe : la page du tournoi, l’inscription (si tu l’as ouverte ici) et le bandeau « match
                    en direct » (arbre généré + direct lancé). Le flyer PDF du direct se télécharge dans la section
                    <span className="font-semibold text-black/70">Match en direct</span> ci-dessous.
                  </p>
                </div>
                {state.status === 'ready' ? (
                  <Button
                    type="button"
                    variant="primary"
                    className="shrink-0"
                    disabled={flyerPdfBusy || !(registrationOpen && Boolean(registrationUrl))}
                    onClick={() => void onDownloadFlyerPdf()}
                  >
                    {flyerPdfBusy ? 'Génération…' : 'Flyer PDF inscriptions'}
                  </Button>
                ) : null}
              </div>
            </header>

            <section
              aria-labelledby="qr-public-page"
              className="rounded-2xl border border-black/10 bg-white p-4 shadow-[0_8px_28px_rgba(0,0,0,0.06)] md:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 id="qr-public-page" className="text-sm font-bold text-black/85">
                    Page du tournoi
                  </h3>
                  <p className="mt-1 text-xs text-black/52">Arbre, scores, classement.</p>
                </div>
                <span className="rounded-full border border-rose-200/60 bg-rose-500/8 px-2.5 py-1 text-[10px] font-extrabold tracking-wider text-rose-900">
                  PRINCIPAL
                </span>
              </div>
              <div className="mt-3 rounded-xl border border-black/8 bg-black/[0.02] p-3">
                <div className="break-all font-mono text-xs leading-relaxed text-black/80">{viewerUrl}</div>
              </div>
              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="flex w-full justify-center rounded-xl border border-black/8 bg-gradient-to-b from-white to-black/[0.02] p-4">
                  {viewerUrl && QrCodeView ? <QrCodeView value={viewerUrl} size={168} /> : null}
                </div>
              </div>
            </section>

            {registrationOpen ? (
              <section
                aria-labelledby="qr-inscription"
                className="rounded-2xl border border-rose-200/55 bg-gradient-to-br from-rose-50/80 via-white to-white p-4 shadow-[0_8px_28px_rgba(225,29,72,0.08)] md:p-5"
              >
                <h3 id="qr-inscription" className="text-sm font-bold text-rose-950">
                  Inscription publique
                </h3>
                <p className="mt-1 text-xs text-black/55">Les inscriptions sont ouvertes pour ce tournoi.</p>
                <div className="mt-3 rounded-xl border border-rose-200/40 bg-white/90 p-3">
                  <div className="break-all font-mono text-xs leading-relaxed text-black/80">{registrationUrl}</div>
                </div>
                <div className="mt-4 flex flex-col items-center gap-2">
                  <div className="flex w-full justify-center rounded-xl border border-rose-200/35 bg-white p-4">
                    {registrationUrl && QrCodeView ? <QrCodeView value={registrationUrl} size={168} /> : null}
                  </div>
                </div>
              </section>
            ) : state.status === 'ready' ? (
              <div className="rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-3 text-xs text-black/52">
                Inscriptions fermées : le QR « inscription » réapparaît quand tu rouvres le flux dans la carte
                dédiée.
              </div>
            ) : null}

            {state.status === 'ready' && hasBracket ? (
              <section
                aria-labelledby="qr-live"
                className="rounded-2xl border border-emerald-200/55 bg-gradient-to-br from-emerald-50/80 via-white to-white p-4 shadow-[0_8px_28px_rgba(34,197,94,0.08)] md:p-5"
              >
                <h3 id="qr-live" className="text-sm font-bold text-emerald-950">
                  Match en direct
                </h3>
                <p className="mt-1 text-xs text-black/55">
                  Active ou coupe le bandeau « match en direct » sur la page publique. Le match affiché est choisi
                  automatiquement (prochain match à jouer, ou le dernier de l’arbre si tout est terminé).
                </p>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    disabled={busy || !hasToken || !autoLiveMatchId || Boolean(liveMatchId)}
                    onClick={() => void onSetLiveMatch(autoLiveMatchId)}
                  >
                    Démarrer le direct
                  </Button>
                  <Button
                    variant="danger"
                    disabled={busy || !hasToken || !liveMatchId}
                    onClick={() => void onSetLiveMatch(null)}
                  >
                    Terminer le direct
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={
                      busy ||
                      directFlyerBusy ||
                      !hasToken ||
                      !hasBracket ||
                      !hasLiveMatch ||
                      !liveMatchUrl
                    }
                    onClick={() => void onDownloadDirectFlyerPdf()}
                  >
                    {directFlyerBusy ? 'Génération…' : 'Flyer PDF (direct)'}
                  </Button>
                </div>

                {!hasToken ? (
                  <div className="mt-3 text-xs text-black/55">Connexion Admin requise pour piloter le direct.</div>
                ) : null}

                {error ? (
                  <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                {hasLiveMatch && liveMatchUrl ? (
                  <>
                    <div className="mt-5 rounded-xl border border-emerald-200/40 bg-white/90 p-3">
                      <div className="break-all font-mono text-xs leading-relaxed text-black/80">{liveMatchUrl}</div>
                    </div>
                    <div className="mt-4 flex flex-col items-center gap-2">
                      <div className="flex w-full justify-center rounded-xl border border-emerald-200/35 bg-white p-4">
                        {liveMatchUrl && QrCodeView ? <QrCodeView value={liveMatchUrl} size={168} /> : null}
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-xs text-black/50">
                    Une fois le direct démarré, le lien et le QR s’affichent ici pour partage rapide.
                  </p>
                )}
              </section>
            ) : state.status === 'ready' && !hasBracket ? (
              <div className="rounded-xl border border-black/10 bg-black/[0.03] px-4 py-3 text-xs leading-relaxed text-black/55">
                Le bloc « match en direct » apparaît ici une fois l’<span className="font-semibold text-black/70">arbre</span>{' '}
                généré.
              </div>
            ) : null}
          </CardBody>
        </Card>

        {state.status === 'ready' && (
          <>
            <Card>
              <CardBody className="flex flex-col gap-6 md:gap-7">
                <header className="border-b border-black/10 pb-5">
                  <div className="text-xs font-semibold tracking-[0.22em] text-black/50">INSCRIPTIONS</div>
                  <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-black/90">Flux public → équipes</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-black/60">
                    Un seul tournoi ouvert sur l’accueil à la fois (ouvrir ici ferme les autres). Les inscrits validés
                    peuvent alimenter les équipes par paires ; tu peux encore tout ajuster dans « Composition ».
                  </p>
                  <ol className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-black/65">
                    <li className="rounded-full border border-black/10 bg-white px-3 py-1.5 shadow-sm">1 · Accueil</li>
                    <li className="rounded-full border border-black/10 bg-white px-3 py-1.5 shadow-sm">2 · Validation</li>
                    <li className="rounded-full border border-black/10 bg-white px-3 py-1.5 shadow-sm">3 · Équipes</li>
                  </ol>
                </header>

                {hasToken && registrations.length > 0 ? (
                  <div className="grid gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-950 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/70">En attente</div>
                      <div className="mt-0.5 text-2xl font-extrabold tabular-nums">{regStats.pending}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/70">Autorisés</div>
                      <div className="mt-0.5 text-2xl font-extrabold tabular-nums">{regStats.approved}</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/70">Libres</div>
                      <div className="mt-0.5 text-2xl font-extrabold tabular-nums">{regStats.freeApproved}</div>
                      <div className="text-[11px] text-emerald-900/75">pas encore dans une équipe</div>
                    </div>
                    <div>
                      <div className="text-[11px] font-bold uppercase tracking-wide text-emerald-900/70">Paires prêtes</div>
                      <div className="mt-0.5 text-2xl font-extrabold tabular-nums">{regStats.pairsReady}</div>
                      <div className="text-[11px] text-emerald-900/75">équipes possibles (×2)</div>
                    </div>
                  </div>
                ) : null}

                <section
                  aria-labelledby="reg-visibility-heading"
                  className="rounded-2xl border border-black/10 bg-white/95 p-4 shadow-[0_6px_22px_rgba(0,0,0,0.05)] md:p-5"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 id="reg-visibility-heading" className="text-sm font-bold text-black/85">
                        Visibilité sur l’accueil
                      </h3>
                      <p className="mt-1 text-xs text-black/52">
                        Ouvre ou ferme la carte « Inscription » pour ce tournoi (lien avec code tournoi).
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span
                          className={
                            state.data.tournament.registrationOpen
                              ? 'inline-flex items-center rounded-full border border-emerald-500/35 bg-emerald-500/12 px-3 py-1 text-xs font-extrabold tracking-wide text-emerald-950'
                              : 'inline-flex items-center rounded-full border border-black/10 bg-black/[0.04] px-3 py-1 text-xs font-extrabold tracking-wide text-black/55'
                          }
                        >
                          {state.data.tournament.registrationOpen ? 'OUVERT au public' : 'FERMÉ'}
                        </span>
                        <span className="text-xs text-black/48">
                          {state.data.tournament.registrationOpen
                            ? 'Les visiteurs peuvent s’inscrire.'
                            : 'Inscriptions terminées ou pas encore lancées.'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 flex-wrap gap-2">
                      <Button
                        variant="ghost"
                        disabled={busy || !hasToken}
                        onClick={() => onToggleRegistration(true)}
                      >
                        Ouvrir
                      </Button>
                      <Button
                        variant="danger"
                        disabled={busy || !hasToken}
                        onClick={() => onToggleRegistration(false)}
                      >
                        Fermer
                      </Button>
                      <Button variant="ghost" disabled={busy || !hasToken} onClick={refreshRegistrations}>
                        Actualiser la liste
                      </Button>
                    </div>
                  </div>
                </section>

                {regActionError ? (
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                    {regActionError}
                  </div>
                ) : null}

                <section aria-labelledby="reg-list-heading">
                  <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <h3 id="reg-list-heading" className="text-lg font-bold text-black/90">
                      Registre
                      {hasToken ? (
                        <span className="ml-2 text-sm font-semibold text-black/45">({registreVisible.length})</span>
                      ) : null}
                    </h3>
                  </div>
                  {regStatus === 'error' ? (
                    <div className="rounded-xl border border-red-500/25 bg-red-500/8 p-4 text-sm text-red-800">
                      <div className="font-semibold">Impossible de charger les inscriptions.</div>
                      {regLoadError ? (
                        <div className="mt-1 text-xs font-normal text-red-700/95">{regLoadError}</div>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="max-h-[min(52vh,480px)] space-y-2 overflow-y-auto pr-1">
                    {regStatus === 'loading' ? (
                      <div className="rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-8 text-center text-sm text-black/55">
                        Chargement du registre…
                      </div>
                    ) : !hasToken ? (
                      <div className="rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-6 text-sm text-black/55">
                        Connecte-toi via l’accès Admin, puis utilise « Actualiser la liste ».
                      </div>
                    ) : registreVisible.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-6 text-sm text-black/55">
                        Aucune inscription pour l’instant. Quand l’accueil est ouvert, les noms apparaîtront ici.
                      </div>
                    ) : (
                      registreVisible.map((r: RegistrationRow) => (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 shadow-[0_4px_18px_rgba(0,0,0,0.04)]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-bold text-black/88">
                                {r.firstName} {r.lastName}
                              </span>
                              <span
                                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${regStatusChipClass(r.status)}`}
                              >
                                {regStatusLabel(r.status)}
                              </span>
                              {registrationLinked(r) ? (
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-emerald-900">
                                  Dans une équipe
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="flex flex-shrink-0 flex-wrap justify-end gap-2">
                            {registrationLinked(r) ? (
                              <span className="max-w-xs text-right text-xs text-black/48">
                                Retire le joueur de l’équipe pour modifier le statut.
                              </span>
                            ) : r.status === 'pending' ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy || !hasToken}
                                  onClick={() => onSetRegStatus(r.id, 'approved')}
                                >
                                  Autoriser
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={busy || !hasToken}
                                  onClick={() => onSetRegStatus(r.id, 'rejected')}
                                >
                                  Refuser
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy || !hasToken}
                                  onClick={() => onSetRegStatus(r.id, 'pending')}
                                >
                                  En attente
                                </Button>
                                <Button
                                  size="sm"
                                  variant="danger"
                                  disabled={busy || !hasToken}
                                  onClick={() => onSetRegStatus(r.id, 'rejected')}
                                >
                                  Refuser
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section
                  aria-labelledby="reg-auto-teams-heading"
                  className="rounded-2xl border border-emerald-200/65 bg-gradient-to-br from-emerald-50/70 via-white to-rose-50/40 p-4 shadow-[0_10px_32px_rgba(34,197,94,0.09)] md:p-5"
                >
                  <h3 id="reg-auto-teams-heading" className="text-base font-bold text-emerald-950">
                    Création automatique par paires
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-black/58">
                    Chaque clic crée des équipes de <span className="font-semibold text-black/75">2 inscrits autorisés</span>{' '}
                    encore libres, dans l’ordre d’arrivée. Noms : <span className="font-semibold">Équipe A</span>,{' '}
                    <span className="font-semibold">Équipe B</span>… (modifiables plus bas).
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                    <Button
                      variant="ghost"
                      disabled={
                        busy ||
                        !hasToken ||
                        Boolean(state.data.bracket) ||
                        regStats.freeApproved < 2 ||
                        regStats.freeApproved % 2 !== 0
                      }
                      onClick={onAutoTeamsFromRegs}
                    >
                      Créer les équipes depuis le registre
                    </Button>
                    {state.data.bracket ? (
                      <span className="text-xs text-black/52">Indisponible tant que l’arbre existe (réinitialise l’arbre pour réorganiser).</span>
                    ) : null}
                  </div>
                  {!state.data.bracket &&
                  hasToken &&
                  regStats.freeApproved >= 2 &&
                  regStats.freeApproved % 2 !== 0 ? (
                    <div className="mt-3 rounded-xl border border-amber-400/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-950">
                      Nombre <span className="font-semibold">impair</span> d’autorisés encore libres : ajuste une
                      inscription pour retomber sur un pair, puis relance.
                    </div>
                  ) : null}
                </section>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="flex flex-col gap-6 md:gap-8">
                <header className="flex flex-col gap-4 border-b border-black/10 pb-5 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-xs font-semibold tracking-[0.22em] text-black/50">ÉQUIPES</div>
                    <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-black/90">Composition</h2>
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-black/60">
                      Liste claire : nom d’équipe, joueurs, puis ajout (inscrits ou saisie). Après la création auto, les
                      noms sont déjà là — tu corriges si besoin.
                    </p>
                  </div>
                  <ol className="flex flex-wrap gap-2 text-xs font-semibold text-black/65">
                    <li className="rounded-full border border-black/10 bg-white px-3 py-1.5 shadow-sm">1 · Équipe</li>
                    <li className="rounded-full border border-black/10 bg-white px-3 py-1.5 shadow-sm">2 · Joueurs</li>
                    <li className="rounded-full border border-black/10 bg-white px-3 py-1.5 shadow-sm">3 · Arbre</li>
                  </ol>
                </header>

                <section
                  aria-labelledby="new-team-heading"
                  className="rounded-2xl border border-rose-200/70 bg-gradient-to-br from-rose-50/95 via-white to-emerald-50/50 p-4 shadow-[0_14px_40px_rgba(225,29,72,0.08)] md:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 id="new-team-heading" className="text-base font-bold text-rose-950">
                      Nouvelle équipe
                    </h3>
                    <span className="text-xs font-medium text-black/50">hors création auto par paires</span>
                  </div>
                  <p className="mt-1 text-xs text-black/55">
                    Utile si tu construis les équipes à la main (sinon utilise le bouton dans la carte inscriptions).
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-1">
                      <label className="mb-1 block text-xs font-semibold text-black/50">Nom de l’équipe</label>
                      <Input
                        value={newTeam}
                        onChange={(e) => setNewTeam(e.target.value)}
                        placeholder="ex. Équipe A"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onAddTeam()
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-black/50">Contact (optionnel)</label>
                      <Input
                        value={newContactLast}
                        onChange={(e) => setNewContactLast(e.target.value)}
                        placeholder="Nom"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onAddTeam()
                        }}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-black/50">&nbsp;</label>
                      <Input
                        value={newContactFirst}
                        onChange={(e) => setNewContactFirst(e.target.value)}
                        placeholder="Prénom"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') onAddTeam()
                        }}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button disabled={busy || !hasToken} onClick={onAddTeam}>
                      Créer cette équipe
                    </Button>
                  </div>
                </section>

                <section aria-labelledby="teams-list-heading">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h3 id="teams-list-heading" className="text-lg font-bold text-black/90">
                      Mes équipes
                      <span className="ml-2 text-sm font-semibold text-black/45">({state.data.teams.length})</span>
                    </h3>
                  </div>

                  <div className="grid max-h-[min(70vh,920px)] gap-4 overflow-y-auto pr-1">
                    {state.data.teams.map((t, teamIndex) => {
                      const players = (state.data.players ?? []).filter((p) => p.teamId === t.id)
                      return (
                        <article
                          key={t.id}
                          className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.06)]"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-black/5 bg-gradient-to-r from-black/[0.02] to-transparent px-4 py-3 md:px-5">
                            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                              <span
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500/20 to-emerald-500/20 text-sm font-extrabold text-black/75"
                                aria-hidden
                              >
                                {teamIndex + 1}
                              </span>
                              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                                <div>
                                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-black/45">
                                    Nom affiché
                                  </label>
                                  <Input
                                    className="min-w-0"
                                    value={teamNameEdits[t.id] ?? t.name}
                                    onChange={(e) =>
                                      setTeamNameEdits((prev) => ({ ...prev, [t.id]: e.target.value }))
                                    }
                                    placeholder="Nom de l’équipe"
                                    disabled={busy || Boolean(state.data.bracket) || !hasToken}
                                  />
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="shrink-0 justify-self-start sm:justify-self-end"
                                  disabled={
                                    busy ||
                                    Boolean(state.data.bracket) ||
                                    !hasToken ||
                                    (teamNameEdits[t.id] ?? t.name).trim() === t.name.trim() ||
                                    (teamNameEdits[t.id] ?? t.name).trim().length < 2
                                  }
                                  onClick={() => onRenameTeam(t.id)}
                                >
                                  Valider le nom
                                </Button>
                              </div>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs font-bold tracking-wide text-red-800 transition hover:bg-red-500/15 disabled:opacity-50"
                              disabled={busy || Boolean(state.data.bracket) || !hasToken}
                              onClick={() => onDeleteTeam(t.id)}
                            >
                              Supprimer l’équipe
                            </button>
                          </div>

                          <div className="space-y-5 p-4 md:p-5">
                            <div>
                              <div className="flex items-center justify-between gap-2">
                                <h4 className="text-sm font-bold text-black/80">
                                  Joueurs
                                  <span className="ml-2 text-xs font-semibold text-black/45">({players.length})</span>
                                </h4>
                              </div>
                              {players.length === 0 ? (
                                <p className="mt-2 rounded-xl border border-dashed border-black/15 bg-black/[0.02] px-3 py-4 text-sm text-black/55">
                                  Aucun joueur pour l’instant — ajoute-en un ci-dessous (inscrit ou saisie).
                                </p>
                              ) : (
                                <div className="mt-3 space-y-2">
                                  <div className="hidden grid-cols-[1fr_1fr_auto] gap-2 px-1 text-[11px] font-bold uppercase tracking-wide text-black/40 md:grid">
                                    <span>Nom</span>
                                    <span>Prénom</span>
                                    <span className="text-right">Actions</span>
                                  </div>
                                  {players.map((p) => {
                                    const d = playerDrafts[p.id] ?? { first: p.firstName, last: p.lastName }
                                    return (
                                      <div
                                        key={p.id}
                                        className="rounded-xl border border-black/8 bg-black/[0.025] p-3 md:grid md:grid-cols-[1fr_1fr_auto] md:items-center md:gap-2 md:p-2"
                                      >
                                        <div className="grid gap-2 sm:grid-cols-2 md:contents">
                                          <div>
                                            <span className="mb-1 block text-[11px] font-semibold text-black/45 md:hidden">
                                              Nom
                                            </span>
                                            <Input
                                              value={d.last}
                                              onChange={(e) =>
                                                setPlayerDrafts((prev) => ({
                                                  ...prev,
                                                  [p.id]: { first: d.first, last: e.target.value },
                                                }))
                                              }
                                              placeholder="Nom"
                                            />
                                          </div>
                                          <div>
                                            <span className="mb-1 block text-[11px] font-semibold text-black/45 md:hidden">
                                              Prénom
                                            </span>
                                            <Input
                                              value={d.first}
                                              onChange={(e) =>
                                                setPlayerDrafts((prev) => ({
                                                  ...prev,
                                                  [p.id]: { first: e.target.value, last: d.last },
                                                }))
                                              }
                                              placeholder="Prénom"
                                            />
                                          </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap justify-end gap-2 md:mt-0">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={busy || !hasToken || Boolean(state.data.bracket)}
                                            onClick={() => onSavePlayer(t.id, p.id)}
                                          >
                                            Enregistrer
                                          </Button>
                                          <Button
                                            variant="danger"
                                            size="sm"
                                            disabled={busy || !hasToken || Boolean(state.data.bracket)}
                                            onClick={() => onDeletePlayer(t.id, p.id)}
                                          >
                                            Retirer
                                          </Button>
                                        </div>
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </div>

                            <div className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/40 to-white p-4 md:p-4">
                              <h4 className="text-sm font-bold text-emerald-950">Ajouter un joueur</h4>
                              <p className="mt-1 text-xs text-black/55">
                                Choisis un inscrit déjà autorisé, ou saisis nom et prénom.
                              </p>
                              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                                <div>
                                  <label className="mb-1 block text-xs font-semibold text-black/55">
                                    Depuis les inscriptions
                                  </label>
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                                    <select
                                      className="h-11 min-h-[44px] w-full flex-1 rounded-xl border border-black/10 bg-white px-3 text-sm text-black outline-none focus:border-emerald-500/50 focus:ring-2 focus:ring-emerald-500/25"
                                      value={pickRegForTeam[t.id] ?? ''}
                                      disabled={
                                        busy ||
                                        !hasToken ||
                                        Boolean(state.data.bracket) ||
                                        regsFreeForPick.length === 0
                                      }
                                      onChange={(e) =>
                                        setPickRegForTeam((prev) => ({ ...prev, [t.id]: e.target.value }))
                                      }
                                    >
                                      <option value="">Choisir dans la liste…</option>
                                      {regsFreeForPick.map((r: RegistrationRow) => (
                                        <option key={r.id} value={r.id}>
                                          {r.lastName} {r.firstName}
                                        </option>
                                      ))}
                                    </select>
                                    <Button
                                      variant="primary"
                                      size="sm"
                                      className="shrink-0 sm:px-5"
                                      disabled={
                                        busy ||
                                        !hasToken ||
                                        Boolean(state.data.bracket) ||
                                        !(pickRegForTeam[t.id] ?? '').trim()
                                      }
                                      onClick={() => onAddPlayerFromRegistration(t.id)}
                                    >
                                      Ajouter
                                    </Button>
                                  </div>
                                  {regsFreeForPick.length === 0 ? (
                                    <p className="mt-2 text-xs text-black/50">
                                      Aucun inscrit libre : autorise-en dans la carte inscriptions, ou ils sont déjà
                                      affectés.
                                    </p>
                                  ) : null}
                                </div>
                                <div>
                                  <label className="mb-1 block text-xs font-semibold text-black/55">
                                    Saisie libre
                                  </label>
                                  <div className="grid gap-2 sm:grid-cols-2">
                                    {(() => {
                                      const d = newPlayers[t.id] ?? { first: '', last: '' }
                                      return (
                                        <>
                                          <Input
                                            value={d.last}
                                            onChange={(e) =>
                                              setNewPlayers((prev) => ({
                                                ...prev,
                                                [t.id]: { first: d.first, last: e.target.value },
                                              }))
                                            }
                                            placeholder="Nom"
                                          />
                                          <Input
                                            value={d.first}
                                            onChange={(e) =>
                                              setNewPlayers((prev) => ({
                                                ...prev,
                                                [t.id]: { first: e.target.value, last: d.last },
                                              }))
                                            }
                                            placeholder="Prénom"
                                          />
                                        </>
                                      )
                                    })()}
                                  </div>
                                  <div className="mt-2 flex justify-end">
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      disabled={busy || !hasToken || Boolean(state.data.bracket)}
                                      onClick={() => onAddPlayer(t.id)}
                                    >
                                      Ajouter ce joueur
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {Boolean(state.data.bracket) ? (
                              <p className="text-xs text-black/55">
                                Composition verrouillée : l’arbre est déjà généré.
                              </p>
                            ) : null}
                          </div>
                        </article>
                      )
                    })}
                  </div>

                  {state.data.teams.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-black/15 bg-black/[0.02] px-4 py-8 text-center text-sm text-black/55">
                      Aucune équipe pour l’instant. Crée-en une ci-dessus ou utilise la création automatique depuis les
                      inscriptions.
                    </div>
                  )}

                  {error ? (
                    <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                      {error}
                    </div>
                  ) : null}
                </section>
              </CardBody>
            </Card>

            <Card>
              <CardBody>
                <div className="text-xs font-semibold tracking-wide text-black/55">
                  SCORES
                </div>
                <div className="mt-2 text-xs text-black/55">
                  Mets un score et sauvegarde. Le gagnant avance automatiquement.
                </div>
                {hasToken ? (
                  <div className="mt-4">
                    <Button variant="danger" disabled={busy} onClick={onArchive}>
                      Archiver ce tournoi
                    </Button>
                  </div>
                ) : null}
                {state.status === 'ready' && state.data.bracket ? (
                  <div className="mt-3 text-xs text-black/55">
                    Astuce : réinitialise l’arbre pour modifier les confrontations.
                  </div>
                ) : null}
                {error && (
                  <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
              </CardBody>
            </Card>
          </>
        )}
      </div>
    </Layout>
  )
}

