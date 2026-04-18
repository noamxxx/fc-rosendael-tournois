const fs = require('fs')
const path = require('path')
const { pathToFileURL } = require('url')
const { createClient } = require('@libsql/client')

/** @type {import('@libsql/client').Client} */
let client

const defaultDbPath = path.resolve(__dirname, '..', '..', 'data.sqlite')
const filePath = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : defaultDbPath
const tursoLocalPath = path.join(__dirname, '..', '.turso-local.json')

/** Render / prod : pas de disque persistant → interdit SQLite ou .turso-local sur le conteneur. */
function isPersistProduction() {
  const n = String(process.env.NODE_ENV || '').toLowerCase()
  if (n === 'production') return true
  if (String(process.env.RENDER || '').toLowerCase() === 'true') return true
  return false
}

function assertProductionTurso(envUrl, authToken) {
  if (!envUrl.startsWith('libsql://')) {
    throw new Error(
      'Production : TURSO_DATABASE_URL doit être une URL Turso (libsql://…). Le fichier SQLite sur le serveur est effacé à chaque redéploiement.',
    )
  }
  if (!authToken || authToken.length < 8) {
    throw new Error(
      'Production : définissez TURSO_AUTH_TOKEN (jeton Turso) avec TURSO_DATABASE_URL. Sans base distante persistante, les données sont perdues.',
    )
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS tournaments (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  adminPin TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  archivedAt TEXT,
  liveMatchId TEXT,
  live INTEGER NOT NULL DEFAULT 0,
  registrationOpen INTEGER NOT NULL DEFAULT 0,
  registrationClosedAt TEXT
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL,
  name TEXT NOT NULL,
  contactFirstName TEXT,
  contactLastName TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(tournamentId) REFERENCES tournaments(id)
);

CREATE TABLE IF NOT EXISTS team_players (
  id TEXT PRIMARY KEY,
  teamId TEXT NOT NULL,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  registrationId TEXT,
  FOREIGN KEY(teamId) REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_team_players_teamId ON team_players(teamId);

CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL,
  homeTeamId TEXT NOT NULL,
  awayTeamId TEXT NOT NULL,
  homeScore INTEGER NOT NULL DEFAULT 0,
  awayScore INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'scheduled',
  round INTEGER,
  slot INTEGER,
  nextMatchId TEXT,
  nextSlot INTEGER,
  winnerTeamId TEXT,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(tournamentId) REFERENCES tournaments(id)
);

CREATE INDEX IF NOT EXISTS idx_teams_tournamentId ON teams(tournamentId);
CREATE INDEX IF NOT EXISTS idx_matches_tournamentId ON matches(tournamentId);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS registrations (
  id TEXT PRIMARY KEY,
  tournamentId TEXT NOT NULL,
  firstName TEXT NOT NULL,
  lastName TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  addedToTeam INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(tournamentId) REFERENCES tournaments(id)
);

CREATE INDEX IF NOT EXISTS idx_registrations_tournamentId ON registrations(tournamentId);
`

const MIGRATIONS = [
  "ALTER TABLE tournaments ADD COLUMN status TEXT NOT NULL DEFAULT 'active'",
  'ALTER TABLE tournaments ADD COLUMN archivedAt TEXT',
  'ALTER TABLE tournaments ADD COLUMN liveMatchId TEXT',
  "ALTER TABLE tournaments ADD COLUMN live INTEGER NOT NULL DEFAULT 0",
  "ALTER TABLE tournaments ADD COLUMN registrationOpen INTEGER NOT NULL DEFAULT 0",
  'ALTER TABLE tournaments ADD COLUMN registrationClosedAt TEXT',
  'ALTER TABLE matches ADD COLUMN round INTEGER',
  'ALTER TABLE matches ADD COLUMN slot INTEGER',
  'ALTER TABLE matches ADD COLUMN nextMatchId TEXT',
  'ALTER TABLE matches ADD COLUMN nextSlot INTEGER',
  'ALTER TABLE matches ADD COLUMN winnerTeamId TEXT',
  'ALTER TABLE teams ADD COLUMN contactFirstName TEXT',
  'ALTER TABLE teams ADD COLUMN contactLastName TEXT',
  'ALTER TABLE team_players ADD COLUMN createdAt TEXT',
  'ALTER TABLE team_players ADD COLUMN registrationId TEXT',
]

function readTursoLocalFile() {
  try {
    const raw = fs.readFileSync(tursoLocalPath, 'utf8')
    const j = JSON.parse(raw)
    const databaseUrl = typeof j.databaseUrl === 'string' ? j.databaseUrl.trim() : ''
    const authToken = typeof j.authToken === 'string' ? j.authToken.trim() : ''
    if (databaseUrl.startsWith('libsql://') && authToken.length >= 10) {
      return { databaseUrl, authToken }
    }
  } catch (_) {
    /* absent ou invalide */
  }
  return null
}

function resolveDbConfig() {
  const envUrl = (process.env.TURSO_DATABASE_URL || '').trim()
  const envToken = (process.env.TURSO_AUTH_TOKEN || '').trim()

  if (isPersistProduction()) {
    // Ne jamais lire .turso-local.json en prod : il est sur un disque éphémère et peut masquer les variables Render.
    if (!envUrl) {
      throw new Error(
        'Production : définissez TURSO_DATABASE_URL et TURSO_AUTH_TOKEN sur l’hébergeur (ex. Render → Environment). ' +
          'Le disque du conteneur gratuit est réinitialisé : un fichier SQLite local ne conserve pas les tournois.',
      )
    }
    assertProductionTurso(envUrl, envToken)
    return {
      url: envUrl,
      authToken: envToken || undefined,
      source: 'env',
    }
  }

  const fromFile = readTursoLocalFile()
  if (fromFile) {
    return {
      url: fromFile.databaseUrl,
      authToken: fromFile.authToken,
      source: 'local_file',
    }
  }
  if (envUrl) {
    return {
      url: envUrl,
      authToken: envToken || undefined,
      source: 'env',
    }
  }
  return {
    url: pathToFileURL(filePath).href,
    authToken: undefined,
    source: 'file',
  }
}

function getDbStatus() {
  const cfg = resolveDbConfig()
  let displayHost = 'SQLite (fichier local)'
  if (cfg.url.startsWith('libsql://')) {
    try {
      const u = new URL(cfg.url.replace(/^libsql:\/\//, 'https://'))
      displayHost = u.hostname
    } catch {
      displayHost = 'Turso (libsql)'
    }
  }
  return {
    source: cfg.source,
    isTursoRemote: cfg.url.startsWith('libsql://'),
    displayHost,
  }
}

async function runSchemaAndMigrations() {
  await client.executeMultiple(SCHEMA)
  for (const sql of MIGRATIONS) {
    try {
      await client.execute(sql)
    } catch (_) {
      /* colonne déjà présente */
    }
  }
}

async function reinitDb() {
  const cfg = resolveDbConfig()
  if (client && typeof client.close === 'function') {
    try {
      await client.close()
    } catch (_) {
      /* ignore */
    }
  }
  client = createClient({
    url: cfg.url,
    authToken: cfg.authToken,
  })

  if (cfg.url.startsWith('file:')) {
    try {
      await client.execute('PRAGMA journal_mode = WAL')
    } catch (_) {
      /* ignore */
    }
  }

  await runSchemaAndMigrations()
  return cfg
}

async function initDb() {
  await reinitDb()
}

async function saveTursoLocalAndReinit(databaseUrl, authToken) {
  if (isPersistProduction()) {
    const err = new Error(
      'En production, la base Turso se configure uniquement dans les variables d’environnement du service ' +
        '(TURSO_DATABASE_URL, TURSO_AUTH_TOKEN). Un fichier sur le serveur serait effacé au prochain déploiement.',
    )
    err.status = 400
    throw err
  }
  fs.mkdirSync(path.dirname(tursoLocalPath), { recursive: true })
  fs.writeFileSync(
    tursoLocalPath,
    JSON.stringify({ databaseUrl: databaseUrl.trim(), authToken: authToken.trim() }),
    'utf8',
  )
  await reinitDb()
}

async function clearTursoLocalAndReinit() {
  try {
    fs.unlinkSync(tursoLocalPath)
  } catch (_) {
    /* absent */
  }
  await reinitDb()
}

async function qGet(sql, args = []) {
  const r = await client.execute({ sql, args })
  return r.rows[0]
}

async function qAll(sql, args = []) {
  const r = await client.execute({ sql, args })
  return r.rows
}

async function qRun(sql, args = []) {
  const r = await client.execute({ sql, args })
  return { changes: r.rowsAffected }
}

/** @param {'write' | 'read' | 'deferred'} [mode] */
async function qBatch(stmts, mode = 'write') {
  return client.batch(stmts, mode)
}

module.exports = {
  initDb,
  reinitDb,
  getDbStatus,
  saveTursoLocalAndReinit,
  clearTursoLocalAndReinit,
  qGet,
  qAll,
  qRun,
  qBatch,
}
