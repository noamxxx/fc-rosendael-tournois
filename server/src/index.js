const express = require('express')
const http = require('http')
const cors = require('cors')
const { Server } = require('socket.io')
const { z } = require('zod')
const { nanoid } = require('nanoid')
const crypto = require('crypto')

const {
  initDb,
  qGet,
  qAll,
  qRun,
  qBatch,
  getDbStatus,
  saveTursoLocalAndReinit,
  clearTursoLocalAndReinit,
} = require('./db')
const { computeStandings } = require('./standings')
const { BYE, TBD, generateSingleEliminationMatches, isByeMatch, winnerFromScores } = require('./bracket')

const PORT = Number(process.env.PORT || 5174)
// Dev-friendly CORS:
// - ORIGIN="*" allows any origin (useful for phones on LAN via QR code).
// - otherwise, use the provided explicit origin.
const ORIGIN = process.env.ORIGIN || '*'
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin'
/** Mot de passe du compte « base Turso » uniquement (pas d’accès tournois). Défaut local 1256 ; en prod, définir sur l’hébergeur. */
const ADMIN_TURSO_PASSWORD = process.env.ADMIN_TURSO_PASSWORD ?? '1256'
const ADMIN_TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'rosendael-dev-secret'

let googleOAuthClient = null
if (process.env.GOOGLE_CLIENT_ID) {
  try {
    const { OAuth2Client } = require('google-auth-library')
    googleOAuthClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[server] Installe google-auth-library dans server/ pour activer /api/auth/google')
  }
}

function nowIso() {
  return new Date().toISOString()
}

function slugify(name) {
  return String(name)
    .trim()
    .toLowerCase()
    .replaceAll(' ', '-')
    .replaceAll(/[^a-z0-9-]/g, '')
    .slice(0, 48)
}

async function getTournamentBySlug(slug) {
  return qGet(
    'SELECT id, name, slug, createdAt, adminPin, status, archivedAt, registrationOpen, registrationClosedAt FROM tournaments WHERE slug = ?',
    [slug],
  )
}

async function deleteArchivedTournamentCascade(tournamentId) {
  await qBatch(
    [
      {
        sql: 'DELETE FROM team_players WHERE teamId IN (SELECT id FROM teams WHERE tournamentId = ?)',
        args: [tournamentId],
      },
      { sql: 'DELETE FROM teams WHERE tournamentId = ?', args: [tournamentId] },
      { sql: 'DELETE FROM matches WHERE tournamentId = ?', args: [tournamentId] },
      { sql: 'DELETE FROM registrations WHERE tournamentId = ?', args: [tournamentId] },
      { sql: 'DELETE FROM tournaments WHERE id = ?', args: [tournamentId] },
    ],
    'write',
  )
}

function buildSnapshotPayload({ tournament, teams, players, matches }) {
  const standings = computeStandings({ teams, matches })

  const maxRound =
    matches.reduce((acc, m) => Math.max(acc, Number(m.round || 0)), 0) || 0
  const rounds = []
  for (let r = 1; r <= maxRound; r++) {
    rounds.push({
      round: r,
      matches: matches.filter((m) => Number(m.round) === r),
    })
  }
  const finalMatch = matches.find((m) => Number(m.round) === maxRound && Number(m.slot) === 0)
  const championTeamId = finalMatch?.winnerTeamId ?? null

  const bracket = maxRound
    ? {
        type: 'single_elimination',
        rounds,
        championTeamId,
      }
    : null

  return { tournament, teams, players, matches, standings, bracket }
}

function signAdminToken(payload) {
  const json = JSON.stringify(payload)
  const data = Buffer.from(json, 'utf8').toString('base64url')
  const sig = crypto
    .createHmac('sha256', ADMIN_TOKEN_SECRET)
    .update(data)
    .digest('base64url')
  return `${data}.${sig}`
}

function verifyAdminToken(token) {
  const [data, sig] = String(token || '').split('.')
  if (!data || !sig) return null
  const expected = crypto
    .createHmac('sha256', ADMIN_TOKEN_SECRET)
    .update(data)
    .digest('base64url')
  if (sig !== expected) return null
  const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'))
  if (!payload?.exp || Date.now() > Number(payload.exp)) return null
  return payload
}

function requireAuthPayload(req) {
  const hdr = req.headers.authorization || ''
  const m = /^Bearer (.+)$/.exec(String(hdr))
  const token = m?.[1]
  const payload = verifyAdminToken(token)
  if (!payload) {
    const err = new Error('Non autorisé.')
    err.status = 401
    throw err
  }
  return payload
}

/** Admin principal (tournois, inscriptions, etc.). Jetons sans `role` = ancienne session = plein accès. */
function requireFullAdmin(req) {
  const payload = requireAuthPayload(req)
  if (payload.role === 'turso') {
    const err = new Error('Accès réservé à l’administrateur principal.')
    err.status = 403
    throw err
  }
}

/** Uniquement les routes Turso (mot de passe secondaire). */
function requireTursoAdmin(req) {
  const payload = requireAuthPayload(req)
  if (payload.role !== 'turso') {
    const err = new Error('Connexion « base Turso » réservée au compte dédié.')
    err.status = 403
    throw err
  }
}

async function getSnapshot(slug) {
  const tidSub = '(SELECT id FROM tournaments WHERE slug = ? LIMIT 1)'
  let results
  try {
    results = await qBatch(
      [
        {
          sql: 'SELECT id, name, slug, createdAt, status, archivedAt, live, liveMatchId, registrationOpen, registrationClosedAt FROM tournaments WHERE slug = ?',
          args: [slug],
        },
        {
          sql: `SELECT id, name, contactFirstName, contactLastName FROM teams WHERE tournamentId = ${tidSub} ORDER BY createdAt ASC`,
          args: [slug],
        },
        {
          sql: `SELECT p.id, p.teamId, p.firstName, p.lastName, p.createdAt, p.registrationId
       FROM team_players p
       JOIN teams t ON t.id = p.teamId
       WHERE t.tournamentId = ${tidSub}
       ORDER BY t.createdAt ASC, p.createdAt ASC`,
          args: [slug],
        },
        {
          sql: `SELECT id, homeTeamId, awayTeamId, homeScore, awayScore, status, winnerTeamId, round, slot, nextMatchId, nextSlot, createdAt FROM matches WHERE tournamentId = ${tidSub} ORDER BY round ASC, slot ASC, createdAt ASC`,
          args: [slug],
        },
      ],
      'read',
    )
  } catch {
    const tournament = await qGet(
      'SELECT id, name, slug, createdAt, status, archivedAt, live, liveMatchId, registrationOpen, registrationClosedAt FROM tournaments WHERE slug = ?',
      [slug],
    )
    if (!tournament) return null
    const teams = await qAll(
      'SELECT id, name, contactFirstName, contactLastName FROM teams WHERE tournamentId = ? ORDER BY createdAt ASC',
      [tournament.id],
    )
    const players = await qAll(
      `SELECT p.id, p.teamId, p.firstName, p.lastName, p.createdAt, p.registrationId
       FROM team_players p
       JOIN teams t ON t.id = p.teamId
       WHERE t.tournamentId = ?
       ORDER BY t.createdAt ASC, p.createdAt ASC`,
      [tournament.id],
    )
    const matches = await qAll(
      'SELECT id, homeTeamId, awayTeamId, homeScore, awayScore, status, winnerTeamId, round, slot, nextMatchId, nextSlot, createdAt FROM matches WHERE tournamentId = ? ORDER BY round ASC, slot ASC, createdAt ASC',
      [tournament.id],
    )
    return buildSnapshotPayload({ tournament, teams, players, matches })
  }

  const tournament = results[0].rows[0]
  if (!tournament) return null
  const teams = results[1].rows
  const players = results[2].rows
  const matches = results[3].rows

  return buildSnapshotPayload({ tournament, teams, players, matches })
}

const app = express()
app.use(cors({ origin: ORIGIN === '*' ? true : ORIGIN, credentials: false }))
app.use(express.json({ limit: '200kb' }))

app.get('/health', (_req, res) => res.json({ ok: true }))

app.post('/api/admin/login', (req, res, next) => {
  try {
    const body = z.object({ password: z.string().min(1) }).parse(req.body)
    const exp = Date.now() + 1000 * 60 * 60 * 24
    if (body.password === ADMIN_PASSWORD) {
      const token = signAdminToken({ sub: 'admin', role: 'full', exp })
      return res.json({ token, role: 'full' })
    }
    if (ADMIN_TURSO_PASSWORD && body.password === ADMIN_TURSO_PASSWORD) {
      const token = signAdminToken({ sub: 'admin', role: 'turso', exp })
      return res.json({ token, role: 'turso' })
    }
    return res.status(401).send('Mot de passe incorrect.')
  } catch (e) {
    next(e)
  }
})

/** Connexion admin via Google (même JWT que le mot de passe). N’autorise que les emails listés dans ADMIN_GOOGLE_EMAILS. */
app.post('/api/auth/google', async (req, res, next) => {
  try {
    if (!googleOAuthClient) {
      return res
        .status(503)
        .send('Google non configuré : GOOGLE_CLIENT_ID + paquet google-auth-library sur le serveur.')
    }
    const body = z.object({ credential: z.string().min(20) }).parse(req.body)
    const ticket = await googleOAuthClient.verifyIdToken({
      idToken: body.credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    const email = (payload?.email || '').toLowerCase().trim()
    if (!email) return res.status(401).send('Email Google introuvable.')
    if (payload.email_verified === false) return res.status(401).send('Email Google non vérifié.')
    const allowed = (process.env.ADMIN_GOOGLE_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
    if (!allowed.length) {
      return res
        .status(503)
        .send('ADMIN_GOOGLE_EMAILS doit contenir au moins une adresse autorisée (variable serveur).')
    }
    if (!allowed.includes(email)) return res.status(403).send('Ce compte Google n’est pas autorisé.')
    const token = signAdminToken({ sub: 'admin', role: 'full', exp: Date.now() + 1000 * 60 * 60 * 24 })
    res.json({ token, email, role: 'full' })
  } catch (e) {
    next(e)
  }
})

app.get('/api/admin/turso-status', (req, res, next) => {
  try {
    requireTursoAdmin(req)
    res.json(getDbStatus())
  } catch (e) {
    next(e)
  }
})

app.post('/api/admin/turso-connect', async (req, res, next) => {
  try {
    requireTursoAdmin(req)
    const body = z
      .object({
        databaseUrl: z.string().regex(/^libsql:\/\/.+/),
        authToken: z.string().min(12),
      })
      .parse(req.body)
    await saveTursoLocalAndReinit(body.databaseUrl, body.authToken)
    res.json({ ok: true, ...getDbStatus() })
  } catch (e) {
    next(e)
  }
})

/** Supprime server/.turso-local.json et repasse sur env ou fichier SQLite local. */
app.delete('/api/admin/turso-local', async (req, res, next) => {
  try {
    requireTursoAdmin(req)
    await clearTursoLocalAndReinit()
    res.json({ ok: true, ...getDbStatus() })
  } catch (e) {
    next(e)
  }
})

/** Compte admin Turso : liste des tournois archivés (candidats à la suppression pour libérer de l’espace). */
app.get('/api/admin/turso-cleanup/archived', async (req, res, next) => {
  try {
    requireTursoAdmin(req)
    const rows = await qAll(
      `SELECT t.id, t.name, t.slug, t.archivedAt, t.createdAt,
        (SELECT COUNT(*) FROM teams WHERE tournamentId = t.id) AS teams,
        (SELECT COUNT(*) FROM matches WHERE tournamentId = t.id) AS matches,
        (SELECT COUNT(*) FROM registrations WHERE tournamentId = t.id) AS registrations
       FROM tournaments t
       WHERE t.status = 'archived'
       ORDER BY COALESCE(t.archivedAt, t.createdAt) DESC`,
      [],
    )
    const tournaments = rows.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      archivedAt: r.archivedAt,
      createdAt: r.createdAt,
      teams: Number(r.teams ?? 0),
      matches: Number(r.matches ?? 0),
      registrations: Number(r.registrations ?? 0),
    }))
    res.json({ tournaments })
  } catch (e) {
    next(e)
  }
})

/** Supprime définitivement un tournoi archivé et toutes ses données liées. */
app.delete('/api/admin/turso-cleanup/archived/:slug', async (req, res, next) => {
  try {
    requireTursoAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')
    if (tournament.status !== 'archived') {
      return res.status(400).send('Seuls les tournois archivés peuvent être supprimés.')
    }
    await deleteArchivedTournamentCascade(tournament.id)
    schedulePublishSnapshot(slug)
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

/** Supprime tous les tournois archivés (body.confirm doit valoir « ARCHIVÉS »). */
app.post('/api/admin/turso-cleanup/purge-archived', async (req, res, next) => {
  try {
    requireTursoAdmin(req)
    z.object({ confirm: z.literal('ARCHIVÉS') }).parse(req.body)
    const archived = await qAll("SELECT id, slug FROM tournaments WHERE status = 'archived'", [])
    let deleted = 0
    for (const row of archived) {
      await deleteArchivedTournamentCascade(row.id)
      schedulePublishSnapshot(String(row.slug))
      deleted += 1
    }
    res.json({ ok: true, deleted })
  } catch (e) {
    next(e)
  }
})

/** Tente VACUUM (SQLite) ; sur Turso distant l’opération peut être refusée ou sans effet majeur. */
app.post('/api/admin/turso-cleanup/vacuum', async (req, res, next) => {
  try {
    requireTursoAdmin(req)
    try {
      await qRun('VACUUM', [])
      res.json({ ok: true, ran: true })
    } catch (vacErr) {
      res.json({
        ok: false,
        ran: false,
        message: vacErr instanceof Error ? vacErr.message : String(vacErr),
      })
    }
  } catch (e) {
    next(e)
  }
})

app.post('/api/tournaments', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const body = z
      .object({
        name: z.string().min(2).max(80),
      })
      .parse(req.body)

    let slug = slugify(body.name)
    if (!slug) slug = `tournoi-${nanoid(6).toLowerCase()}`

    const exists = await qGet('SELECT slug FROM tournaments WHERE slug = ?', [slug])
    if (exists) slug = `${slug}-${nanoid(4).toLowerCase()}`

    const tournament = {
      id: nanoid(),
      name: body.name,
      slug,
      adminPin: 'disabled',
      createdAt: nowIso(),
      status: 'active',
      archivedAt: null,
    }

    await qRun(
      'INSERT INTO tournaments (id, name, slug, adminPin, createdAt, status, archivedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        tournament.id,
        tournament.name,
        tournament.slug,
        tournament.adminPin,
        tournament.createdAt,
        tournament.status,
        tournament.archivedAt,
      ],
    )

    res.json({
      tournament: {
        id: tournament.id,
        name: tournament.name,
        slug: tournament.slug,
        createdAt: tournament.createdAt,
        status: tournament.status,
        archivedAt: tournament.archivedAt,
      },
    })
  } catch (e) {
    next(e)
  }
})

app.get('/api/tournaments', async (_req, res, next) => {
  try {
    let liveMode
    let active
    let archived
    try {
      const rows = await qBatch(
        [
          { sql: "SELECT value FROM app_settings WHERE key = 'liveMode'", args: [] },
          {
            sql: "SELECT id, name, slug, createdAt, status, archivedAt, live, liveMatchId, registrationOpen, registrationClosedAt FROM tournaments WHERE status = 'active' ORDER BY live DESC, createdAt DESC",
            args: [],
          },
          {
            sql: "SELECT id, name, slug, createdAt, status, archivedAt, live, liveMatchId, registrationOpen, registrationClosedAt FROM tournaments WHERE status = 'archived' ORDER BY COALESCE(archivedAt, createdAt) DESC",
            args: [],
          },
        ],
        'read',
      )
      liveMode = rows[0].rows[0]?.value ?? 'auto'
      active = rows[1].rows
      archived = rows[2].rows
    } catch {
      const liveModeRow = await qGet("SELECT value FROM app_settings WHERE key = 'liveMode'", [])
      liveMode = liveModeRow?.value ?? 'auto'
      active = await qAll(
        "SELECT id, name, slug, createdAt, status, archivedAt, live, liveMatchId, registrationOpen, registrationClosedAt FROM tournaments WHERE status = 'active' ORDER BY live DESC, createdAt DESC",
        [],
      )
      archived = await qAll(
        "SELECT id, name, slug, createdAt, status, archivedAt, live, liveMatchId, registrationOpen, registrationClosedAt FROM tournaments WHERE status = 'archived' ORDER BY COALESCE(archivedAt, createdAt) DESC",
        [],
      )
    }

    res.json({ active, archived, liveMode })
  } catch (e) {
    next(e)
  }
})

async function findOpenRegistrationTournament({ slug } = {}) {
  if (slug) {
    return qGet(
      "SELECT id, name, slug, registrationOpen, registrationClosedAt FROM tournaments WHERE slug = ? AND status = 'active' AND registrationOpen = 1",
      [String(slug)],
    )
  }
  return qGet(
    "SELECT id, name, slug, registrationOpen, registrationClosedAt FROM tournaments WHERE status = 'active' AND registrationOpen = 1 ORDER BY live DESC, createdAt DESC LIMIT 1",
    [],
  )
}

// Public: find the tournament currently open for registrations (?slug= pour cibler un tournoi précis).
app.get('/api/registration', async (req, res, next) => {
  try {
    const slug = req.query.slug != null && String(req.query.slug).trim() ? String(req.query.slug).trim() : undefined
    const t = await findOpenRegistrationTournament({ slug })
    if (!t) return res.json({ open: false })
    res.json({ open: true, tournament: { id: t.id, name: t.name, slug: t.slug } })
  } catch (e) {
    next(e)
  }
})

// Public: signup form (name + firstname) for an open tournament (body.slug optionnel = code du tournoi).
app.post('/api/registration/signup', async (req, res, next) => {
  try {
    const body = z
      .object({
        firstName: z.string().trim().min(1).max(50),
        lastName: z.string().trim().min(1).max(50),
        slug: z.string().trim().min(1).max(60).optional(),
      })
      .parse(req.body)

    const t = await findOpenRegistrationTournament({ slug: body.slug })
    if (!t) return res.status(400).send('Les inscriptions sont terminées.')

    const reg = {
      id: nanoid(),
      tournamentId: t.id,
      firstName: body.firstName,
      lastName: body.lastName,
      status: 'pending',
      addedToTeam: 0,
      createdAt: nowIso(),
    }
    await qRun(
      'INSERT INTO registrations (id, tournamentId, firstName, lastName, status, addedToTeam, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [reg.id, reg.tournamentId, reg.firstName, reg.lastName, reg.status, reg.addedToTeam, reg.createdAt],
    )

    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// Admin: open/close registrations for a tournament.
app.put('/api/tournaments/:slug/registration', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const body = z.object({ open: z.boolean() }).parse(req.body)
    if (body.open) {
      if (tournament.status !== 'active') {
        return res.status(400).send('Impossible d’ouvrir les inscriptions pour un tournoi archivé.')
      }
      const others = await qAll(
        "SELECT id, slug FROM tournaments WHERE status = 'active' AND registrationOpen = 1 AND id != ?",
        [tournament.id],
      )
      for (const o of others) {
        await qRun('UPDATE tournaments SET registrationOpen = 0, registrationClosedAt = ? WHERE id = ?', [
          nowIso(),
          o.id,
        ])
        schedulePublishSnapshot(o.slug)
      }
      await qRun('UPDATE tournaments SET registrationOpen = 1, registrationClosedAt = NULL WHERE id = ?', [
        tournament.id,
      ])
    } else {
      await qRun('UPDATE tournaments SET registrationOpen = 0, registrationClosedAt = ? WHERE id = ?', [
        nowIso(),
        tournament.id,
      ])
    }
    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

// Admin: list registrations.
app.get('/api/tournaments/:slug/registrations', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const rows = await qAll(
      'SELECT id, firstName, lastName, status, addedToTeam, createdAt FROM registrations WHERE tournamentId = ? ORDER BY createdAt DESC',
      [tournament.id],
    )
    res.json({ registrations: rows })
  } catch (e) {
    next(e)
  }
})

// Admin: approve/reject registration.
app.put('/api/tournaments/:slug/registrations/:id', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const regId = String(req.params.id)
    const body = z.object({ status: z.enum(['pending', 'approved', 'rejected']) }).parse(req.body)
    const r = await qGet('SELECT id, addedToTeam FROM registrations WHERE id = ? AND tournamentId = ?', [
      regId,
      tournament.id,
    ])
    if (!r) return res.status(404).send('Inscription introuvable.')
    if (Number(r.addedToTeam) === 1 && (body.status === 'pending' || body.status === 'rejected')) {
      return res
        .status(400)
        .send('Inscription déjà liée à une équipe : retire le joueur de l’équipe avant de changer le statut.')
    }

    if (body.status === 'rejected') {
      await qRun('DELETE FROM registrations WHERE id = ? AND tournamentId = ?', [regId, tournament.id])
    } else {
      await qRun('UPDATE registrations SET status = ? WHERE id = ? AND tournamentId = ?', [
        body.status,
        regId,
        tournament.id,
      ])
    }
    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

// Admin: auto-create teams of 2 from approved registrations not yet added.
app.post('/api/tournaments/:slug/registrations/auto-teams', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const existingRow = await qGet('SELECT COUNT(1) as c FROM matches WHERE tournamentId = ?', [tournament.id])
    const existing = existingRow?.c
    if (existing && Number(existing) > 0) {
      return res.status(400).send('Impossible après génération de l’arbre.')
    }

    const regs = await qAll(
      "SELECT id, firstName, lastName FROM registrations WHERE tournamentId = ? AND status = 'approved' AND addedToTeam = 0 ORDER BY createdAt ASC",
      [tournament.id],
    )

    if (regs.length < 2) return res.status(400).send('Pas assez d’inscrits approuvés.')
    if (regs.length % 2 !== 0) return res.status(400).send('Le nombre d’inscrits approuvés doit être pair.')

    const existingTeamsRow = await qGet('SELECT COUNT(1) as c FROM teams WHERE tournamentId = ?', [tournament.id])
    const existingTeamsCount = Number(existingTeamsRow?.c ?? 0)

    function teamLabel(idx) {
      let n = idx
      let s = ''
      while (true) {
        s = String.fromCharCode(65 + (n % 26)) + s
        n = Math.floor(n / 26) - 1
        if (n < 0) break
      }
      return s
    }

    const stmts = []
    for (let i = 0; i < regs.length; i += 2) {
      const a = regs[i]
      const b = regs[i + 1]
      const teamId = nanoid()
      const teamIdx = existingTeamsCount + i / 2
      const teamName = `Équipe ${teamLabel(teamIdx)}`
      const ts = nowIso()
      stmts.push({
        sql: 'INSERT INTO teams (id, tournamentId, name, contactFirstName, contactLastName, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
        args: [teamId, tournament.id, teamName, null, null, ts],
      })
      stmts.push({
        sql: 'INSERT INTO team_players (id, teamId, firstName, lastName, createdAt, registrationId) VALUES (?, ?, ?, ?, ?, ?)',
        args: [nanoid(), teamId, a.firstName, a.lastName, ts, a.id],
      })
      stmts.push({
        sql: 'INSERT INTO team_players (id, teamId, firstName, lastName, createdAt, registrationId) VALUES (?, ?, ?, ?, ?, ?)',
        args: [nanoid(), teamId, b.firstName, b.lastName, ts, b.id],
      })
      stmts.push({
        sql: 'UPDATE registrations SET addedToTeam = 1 WHERE id = ? AND tournamentId = ?',
        args: [a.id, tournament.id],
      })
      stmts.push({
        sql: 'UPDATE registrations SET addedToTeam = 1 WHERE id = ? AND tournamentId = ?',
        args: [b.id, tournament.id],
      })
    }
    await qBatch(stmts, 'write')

    res.json({ ok: true, teamsCreated: regs.length / 2 })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.put('/api/tournaments/live', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const body = z
      .object({
        slug: z.string().min(1).nullable().optional(),
        mode: z.enum(['auto', 'none', 'slug']).optional(),
      })
      .parse(req.body)

    const mode = body.mode ?? (body.slug ? 'slug' : 'auto')

    await qRun('UPDATE tournaments SET live = 0', [])

    if (mode === 'slug') {
      if (!body.slug) return res.status(400).send('Identifiant du tournoi requis (le code dans l’URL).')
      const t = await getTournamentBySlug(String(body.slug))
      if (!t) return res.status(404).send('Tournoi introuvable.')
      if (t.status !== 'active') return res.status(400).send('Seul un tournoi actif peut être mis en vedette.')
      await qRun('UPDATE tournaments SET live = 1 WHERE id = ?', [t.id])
    }

    await qRun(
      "INSERT INTO app_settings(key, value) VALUES('liveMode', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      [mode],
    )

    const activeSlugs = await qAll("SELECT slug FROM tournaments WHERE status = 'active'", [])
    for (const row of activeSlugs) {
      schedulePublishSnapshot(row.slug)
    }

    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

app.get('/api/tournaments/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug)
    const snapshot = await getSnapshot(slug)
    if (!snapshot) return res.status(404).send('Tournoi introuvable.')
    res.json(snapshot)
  } catch (e) {
    next(e)
  }
})

app.post('/api/tournaments/:slug/archive', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    await qRun("UPDATE tournaments SET status = 'archived', archivedAt = ? WHERE id = ?", [nowIso(), tournament.id])

    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.delete('/api/tournaments/:slug', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')
    if (tournament.status !== 'archived') {
      return res.status(400).send('Seuls les tournois archivés peuvent être supprimés.')
    }

    await deleteArchivedTournamentCascade(tournament.id)

    res.json({ ok: true })
  } catch (e) {
    next(e)
  }
})

app.post('/api/tournaments/:slug/teams', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const body = z
      .object({
        name: z.string().min(2).max(50),
        contactFirstName: z.string().trim().min(1).max(50).optional(),
        contactLastName: z.string().trim().min(1).max(50).optional(),
      })
      .parse(req.body)

    const team = {
      id: nanoid(),
      tournamentId: tournament.id,
      name: body.name,
      contactFirstName: body.contactFirstName ?? null,
      contactLastName: body.contactLastName ?? null,
      createdAt: nowIso(),
    }
    await qRun(
      'INSERT INTO teams (id, tournamentId, name, contactFirstName, contactLastName, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [
        team.id,
        team.tournamentId,
        team.name,
        team.contactFirstName,
        team.contactLastName,
        team.createdAt,
      ],
    )

    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.patch('/api/tournaments/:slug/teams/:teamId', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const existingRow = await qGet('SELECT COUNT(1) as c FROM matches WHERE tournamentId = ?', [tournament.id])
    const existing = existingRow?.c
    if (existing && Number(existing) > 0) {
      return res.status(400).send('Impossible de renommer une équipe après génération de l’arbre.')
    }

    const teamId = String(req.params.teamId)
    const team = await qGet('SELECT id FROM teams WHERE id = ? AND tournamentId = ?', [teamId, tournament.id])
    if (!team) return res.status(404).send('Équipe introuvable.')

    const body = z.object({ name: z.string().trim().min(2).max(50) }).parse(req.body)
    await qRun('UPDATE teams SET name = ? WHERE id = ? AND tournamentId = ?', [body.name, teamId, tournament.id])
    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.delete('/api/tournaments/:slug/teams/:teamId', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const existingRow = await qGet('SELECT COUNT(1) as c FROM matches WHERE tournamentId = ?', [tournament.id])
    const existing = existingRow?.c
    if (existing && Number(existing) > 0) {
      return res.status(400).send('Impossible de supprimer une équipe après génération de l’arbre.')
    }

    const teamId = String(req.params.teamId)

    await qRun(
      `UPDATE registrations SET addedToTeam = 0
       WHERE tournamentId = ? AND id IN (
         SELECT registrationId FROM team_players WHERE teamId = ? AND registrationId IS NOT NULL
       )`,
      [tournament.id, teamId],
    )

    await qRun('DELETE FROM team_players WHERE teamId = ?', [teamId])
    const result = await qRun('DELETE FROM teams WHERE id = ? AND tournamentId = ?', [teamId, tournament.id])
    if (result.changes === 0) return res.status(404).send('Équipe introuvable.')

    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.post('/api/tournaments/:slug/teams/:teamId/players', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const teamId = String(req.params.teamId)
    const team = await qGet('SELECT id FROM teams WHERE id = ? AND tournamentId = ?', [teamId, tournament.id])
    if (!team) return res.status(404).send('Équipe introuvable.')

    const existingMatchesRow = await qGet('SELECT COUNT(1) as c FROM matches WHERE tournamentId = ?', [
      tournament.id,
    ])
    const existingMatches = existingMatchesRow?.c
    if (existingMatches && Number(existingMatches) > 0) {
      return res.status(400).send('Impossible d’ajouter un joueur après génération de l’arbre.')
    }

    const body = z
      .object({
        registrationId: z.string().min(1).optional(),
        firstName: z.string().trim().min(1).max(50).optional(),
        lastName: z.string().trim().min(1).max(50).optional(),
      })
      .parse(req.body)

    let firstName = body.firstName
    let lastName = body.lastName
    let registrationId = null

    if (body.registrationId) {
      const reg = await qGet(
        'SELECT id, firstName, lastName, status, addedToTeam FROM registrations WHERE id = ? AND tournamentId = ?',
        [body.registrationId, tournament.id],
      )
      if (!reg) return res.status(404).send('Inscription introuvable.')
      if (reg.status !== 'approved') return res.status(400).send('Seule une inscription autorisée peut être ajoutée.')
      if (Number(reg.addedToTeam) !== 0) return res.status(400).send('Cette inscription est déjà dans une équipe.')
      firstName = reg.firstName
      lastName = reg.lastName
      registrationId = reg.id
    }

    if (!firstName || !lastName) {
      return res.status(400).send('Prénom et nom requis (ou choisis une inscription).')
    }

    const player = {
      id: nanoid(),
      teamId,
      firstName,
      lastName,
      createdAt: nowIso(),
    }

    await qRun(
      'INSERT INTO team_players (id, teamId, firstName, lastName, createdAt, registrationId) VALUES (?, ?, ?, ?, ?, ?)',
      [player.id, player.teamId, player.firstName, player.lastName, player.createdAt, registrationId],
    )

    if (registrationId) {
      await qRun('UPDATE registrations SET addedToTeam = 1 WHERE id = ? AND tournamentId = ?', [
        registrationId,
        tournament.id,
      ])
    }

    res.json({ ok: true, player: { ...player, registrationId } })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.patch('/api/tournaments/:slug/teams/:teamId/players/:playerId', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const existingMatchesRow = await qGet('SELECT COUNT(1) as c FROM matches WHERE tournamentId = ?', [
      tournament.id,
    ])
    const existingMatches = existingMatchesRow?.c
    if (existingMatches && Number(existingMatches) > 0) {
      return res.status(400).send('Impossible de modifier un joueur après génération de l’arbre.')
    }

    const teamId = String(req.params.teamId)
    const playerId = String(req.params.playerId)

    const exists = await qGet(
      `SELECT p.id
         FROM team_players p
         JOIN teams t ON t.id = p.teamId
         WHERE p.id = ? AND p.teamId = ? AND t.tournamentId = ?`,
      [playerId, teamId, tournament.id],
    )
    if (!exists) return res.status(404).send('Joueur introuvable.')

    const body = z
      .object({
        firstName: z.string().trim().min(1).max(50),
        lastName: z.string().trim().min(1).max(50),
      })
      .parse(req.body)

    await qRun('UPDATE team_players SET firstName = ?, lastName = ? WHERE id = ? AND teamId = ?', [
      body.firstName,
      body.lastName,
      playerId,
      teamId,
    ])

    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.delete('/api/tournaments/:slug/teams/:teamId/players/:playerId', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const existingMatchesRow = await qGet('SELECT COUNT(1) as c FROM matches WHERE tournamentId = ?', [
      tournament.id,
    ])
    const existingMatches = existingMatchesRow?.c
    if (existingMatches && Number(existingMatches) > 0) {
      return res.status(400).send('Impossible de retirer un joueur après génération de l’arbre.')
    }

    const teamId = String(req.params.teamId)
    const playerId = String(req.params.playerId)

    const row = await qGet(
      `SELECT p.registrationId
         FROM team_players p
         JOIN teams t ON t.id = p.teamId
         WHERE p.id = ? AND p.teamId = ? AND t.tournamentId = ?`,
      [playerId, teamId, tournament.id],
    )
    if (!row) return res.status(404).send('Joueur introuvable.')

    const result = await qRun(
      `DELETE FROM team_players
         WHERE id = ? AND teamId = ?
           AND teamId IN (SELECT id FROM teams WHERE tournamentId = ?)`,
      [playerId, teamId, tournament.id],
    )
    if (result.changes === 0) return res.status(404).send('Joueur introuvable.')

    if (row.registrationId) {
      await qRun('UPDATE registrations SET addedToTeam = 0 WHERE id = ? AND tournamentId = ?', [
        row.registrationId,
        tournament.id,
      ])
    }

    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.post('/api/tournaments/:slug/bracket/generate', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const body = z
      .object({
        seedTeamIds: z.array(z.string().min(1)).optional(),
      })
      .parse(req.body)

    const teamRows = await qAll('SELECT id FROM teams WHERE tournamentId = ? ORDER BY createdAt ASC', [
      tournament.id,
    ])
    const teams = teamRows.map((r) => r.id)

    if (teams.length < 2) {
      return res.status(400).send('Ajoute au moins 2 équipes avant de générer l’arbre.')
    }
    const isPowerOfTwo = (n) => (n & (n - 1)) === 0
    if (!isPowerOfTwo(teams.length)) {
      return res
        .status(400)
        .send(
          `Nombre d’équipes invalide (${teams.length}). Il faut 2, 4, 8, 16… équipes (matchs complets à 2 équipes).`,
        )
    }

    const existingRow = await qGet('SELECT COUNT(1) as c FROM matches WHERE tournamentId = ?', [tournament.id])
    const existing = existingRow?.c
    if (existing && Number(existing) > 0) {
      return res.status(400).send('Arbre déjà généré (des matchs existent déjà).')
    }

    const gen = generateSingleEliminationMatches({
      tournamentId: tournament.id,
      teamIds: teams,
      seedTeamIds: body.seedTeamIds,
      nowIso,
    })

    const insertSql =
      'INSERT INTO matches (id, tournamentId, homeTeamId, awayTeamId, homeScore, awayScore, status, winnerTeamId, round, slot, nextMatchId, nextSlot, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    const stmts = gen.matches.map((m) => ({
      sql: insertSql,
      args: [
        m.id,
        m.tournamentId,
        m.homeTeamId,
        m.awayTeamId,
        m.homeScore,
        m.awayScore,
        m.status,
        m.winnerTeamId,
        m.round,
        m.slot,
        m.nextMatchId,
        m.nextSlot,
        m.createdAt,
      ],
    }))
    await qBatch(stmts, 'write')

    await autoAdvanceByes(tournament.id)

    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.post('/api/tournaments/:slug/bracket/reset', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    await qRun('DELETE FROM matches WHERE tournamentId = ?', [tournament.id])
    await qRun('UPDATE tournaments SET liveMatchId = NULL WHERE id = ?', [tournament.id])
    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.post('/api/tournaments/:slug/matches', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const body = z
      .object({
        homeTeamId: z.string().min(1),
        awayTeamId: z.string().min(1),
      })
      .parse(req.body)
    if (body.homeTeamId === body.awayTeamId) return res.status(400).send('Équipes identiques.')

    const match = {
      id: nanoid(),
      tournamentId: tournament.id,
      homeTeamId: body.homeTeamId,
      awayTeamId: body.awayTeamId,
      homeScore: 0,
      awayScore: 0,
      status: 'scheduled',
      createdAt: nowIso(),
    }

    await qRun(
      'INSERT INTO matches (id, tournamentId, homeTeamId, awayTeamId, homeScore, awayScore, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        match.id,
        match.tournamentId,
        match.homeTeamId,
        match.awayTeamId,
        match.homeScore,
        match.awayScore,
        match.status,
        match.createdAt,
      ],
    )

    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.patch('/api/tournaments/:slug/matches/:matchId', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const body = z
      .object({
        homeScore: z.number().int().min(0).max(99),
        awayScore: z.number().int().min(0).max(99),
        status: z.enum(['scheduled', 'final']),
      })
      .parse(req.body)

    const matchId = String(req.params.matchId)

    const current = await qGet(
      'SELECT id, tournamentId, homeTeamId, awayTeamId, homeScore, awayScore, status, nextMatchId, nextSlot, winnerTeamId FROM matches WHERE id = ? AND tournamentId = ?',
      [matchId, tournament.id],
    )
    if (!current) return res.status(404).send('Match introuvable.')

    const isBye = current.homeTeamId === BYE || current.awayTeamId === BYE
    if (body.status === 'final' && !isBye && body.homeScore === body.awayScore) {
      return res.status(400).send('Un match terminé ne peut pas être à égalité.')
    }

    const winnerTeamId =
      body.status === 'final'
        ? winnerFromScores({
            homeTeamId: current.homeTeamId,
            awayTeamId: current.awayTeamId,
            homeScore: body.homeScore,
            awayScore: body.awayScore,
          })
        : null

    const result = await qRun(
      'UPDATE matches SET homeScore = ?, awayScore = ?, status = ?, winnerTeamId = ? WHERE id = ? AND tournamentId = ?',
      [body.homeScore, body.awayScore, body.status, winnerTeamId, matchId, tournament.id],
    )

    if (result.changes === 0) return res.status(404).send('Match introuvable.')

    res.json({ ok: true })
    if (body.status === 'final' && winnerTeamId) {
      await propagateWinner(tournament.id, matchId, winnerTeamId)
      await autoAdvanceByes(tournament.id)
    }
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

app.put('/api/tournaments/:slug/live', async (req, res, next) => {
  try {
    requireFullAdmin(req)
    const slug = String(req.params.slug)
    const tournament = await getTournamentBySlug(slug)
    if (!tournament) return res.status(404).send('Tournoi introuvable.')

    const body = z
      .object({
        matchId: z.string().min(1).nullable(),
      })
      .parse(req.body)

    const matchCountRow = await qGet('SELECT COUNT(1) as c FROM matches WHERE tournamentId = ?', [tournament.id])
    const matchCount = Number(matchCountRow?.c ?? 0)
    if (body.matchId) {
      if (matchCount === 0) {
        return res.status(400).send('Génère l’arbre avant de lancer un match en direct.')
      }
      const exists = await qGet('SELECT id FROM matches WHERE id = ? AND tournamentId = ?', [
        body.matchId,
        tournament.id,
      ])
      if (!exists) return res.status(400).send('Match introuvable.')
    }

    await qRun('UPDATE tournaments SET liveMatchId = ? WHERE id = ?', [body.matchId, tournament.id])
    res.json({ ok: true })
    schedulePublishSnapshot(slug)
  } catch (e) {
    next(e)
  }
})

// Error handler
app.use((err, _req, res, _next) => {
  if (err instanceof z.ZodError) {
    return res.status(400).send('Données invalides. Vérifie les champs du formulaire.')
  }
  const status = err?.status || 400
  const msg = err instanceof Error ? err.message : 'Erreur'
  res.status(status).send(msg)
})

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: ORIGIN === '*' ? true : ORIGIN } })

async function propagateWinner(tournamentId, matchId, winnerTeamId) {
  const m = await qGet('SELECT id, nextMatchId, nextSlot FROM matches WHERE id = ? AND tournamentId = ?', [
    matchId,
    tournamentId,
  ])
  if (!m?.nextMatchId || m.nextSlot === null || m.nextSlot === undefined) return

  const next = await qGet('SELECT id, homeTeamId, awayTeamId, status FROM matches WHERE id = ? AND tournamentId = ?', [
    m.nextMatchId,
    tournamentId,
  ])
  if (!next) return

  if (Number(m.nextSlot) === 0) {
    await qRun('UPDATE matches SET homeTeamId = ? WHERE id = ? AND tournamentId = ?', [
      winnerTeamId,
      next.id,
      tournamentId,
    ])
  } else {
    await qRun('UPDATE matches SET awayTeamId = ? WHERE id = ? AND tournamentId = ?', [
      winnerTeamId,
      next.id,
      tournamentId,
    ])
  }
}

async function autoAdvanceByes(tournamentId) {
  for (let guard = 0; guard < 50; guard++) {
    const pending = await qAll(
      "SELECT id, homeTeamId, awayTeamId, nextMatchId, nextSlot, status FROM matches WHERE tournamentId = ? AND status != 'final' ORDER BY round ASC, slot ASC",
      [tournamentId],
    )

    let changed = false

    for (const m of pending) {
      const hasTbd = m.homeTeamId === TBD || m.awayTeamId === TBD
      if (hasTbd) continue
      if (!(m.homeTeamId === BYE || m.awayTeamId === BYE)) continue

      const winner = m.homeTeamId === BYE ? m.awayTeamId : m.homeTeamId
      const homeScore = m.homeTeamId === BYE ? 0 : 1
      const awayScore = m.awayTeamId === BYE ? 0 : 1

      await qRun(
        "UPDATE matches SET homeScore = ?, awayScore = ?, status = 'final', winnerTeamId = ? WHERE id = ? AND tournamentId = ?",
        [homeScore, awayScore, winner, m.id, tournamentId],
      )

      await propagateWinner(tournamentId, m.id, winner)
      changed = true
    }

    if (!changed) break
  }
}

/** Délais (ms) pour fusionner plusieurs écritures → une seule lecture snapshot + un emit socket. 0 = pas de debounce. */
const SNAPSHOT_EMIT_DEBOUNCE_MS = Math.max(0, Number(process.env.SNAPSHOT_EMIT_DEBOUNCE_MS ?? 80))
const snapshotEmitTimers = new Map()

function schedulePublishSnapshot(slug) {
  const s = String(slug)
  if (SNAPSHOT_EMIT_DEBOUNCE_MS === 0) {
    void emitSnapshotNow(s)
    return
  }
  const prev = snapshotEmitTimers.get(s)
  if (prev) clearTimeout(prev)
  snapshotEmitTimers.set(
    s,
    setTimeout(() => {
      snapshotEmitTimers.delete(s)
      void emitSnapshotNow(s)
    }, SNAPSHOT_EMIT_DEBOUNCE_MS),
  )
}

async function emitSnapshotNow(slug) {
  try {
    const snapshot = await getSnapshot(slug)
    if (!snapshot) return
    io.to(`tournament:${slug}`).emit('tournament:snapshot', { slug, snapshot })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('emit snapshot', slug, err)
  }
}

io.on('connection', (socket) => {
  socket.on('join', ({ room }) => {
    if (typeof room === 'string' && room.startsWith('tournament:')) socket.join(room)
  })
  socket.on('leave', ({ room }) => {
    if (typeof room === 'string' && room.startsWith('tournament:')) socket.leave(room)
  })
})

initDb()
  .then(() => {
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`Server on http://localhost:${PORT} (CORS origin: ${ORIGIN})`)
    })
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Échec initialisation base (Turso / fichier local) :', err)
    process.exit(1)
  })

