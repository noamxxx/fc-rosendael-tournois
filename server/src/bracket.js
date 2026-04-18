const { nanoid } = require('nanoid')

const BYE = 'BYE'
const TBD = 'TBD'

function nextPowerOfTwo(n) {
  let p = 1
  while (p < n) p *= 2
  return p
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function buildSlots(teamIds, seedTeamIds) {
  const bracketSize = nextPowerOfTwo(teamIds.length)
  const byes = bracketSize - teamIds.length

  if (seedTeamIds) {
    if (!Array.isArray(seedTeamIds) || seedTeamIds.length !== bracketSize) {
      const err = new Error(`Le placement doit contenir ${bracketSize} cases.`)
      err.status = 400
      throw err
    }

    const allowed = new Set([...teamIds, BYE])
    const used = new Set()

    for (const id of seedTeamIds) {
      if (!allowed.has(id)) {
        const err = new Error('Placement invalide (équipe inconnue).')
        err.status = 400
        throw err
      }
      if (id !== BYE) {
        if (used.has(id)) {
          const err = new Error('Placement invalide (équipe dupliquée).')
          err.status = 400
          throw err
        }
        used.add(id)
      }
    }

    if (used.size !== teamIds.length) {
      const err = new Error('Placement invalide (il manque des équipes ou trop d’exemptions).')
      err.status = 400
      throw err
    }

    const byeCount = seedTeamIds.filter((x) => x === BYE).length
    if (byeCount !== byes) {
      const err = new Error(`Placement invalide (nombre d’exemptions attendu : ${byes}).`)
      err.status = 400
      throw err
    }

    return { bracketSize, slots: seedTeamIds }
  }

  const seeded = shuffle(teamIds)
  const slots = [...seeded, ...Array.from({ length: byes }, () => BYE)]
  return { bracketSize, slots }
}

function roundLabel(roundIndexFrom1, totalRounds) {
  const remaining = totalRounds - roundIndexFrom1 + 1
  if (remaining === 1) return 'Finale'
  if (remaining === 2) return 'Demi-finales'
  if (remaining === 3) return 'Quarts'
  if (remaining === 4) return 'Huitièmes'
  return `Manche ${roundIndexFrom1}`
}

function isByeMatch(match) {
  return match.homeTeamId === BYE || match.awayTeamId === BYE
}

function winnerFromScores(match) {
  if (match.homeTeamId === BYE && match.awayTeamId !== BYE) return match.awayTeamId
  if (match.awayTeamId === BYE && match.homeTeamId !== BYE) return match.homeTeamId
  if (match.homeScore > match.awayScore) return match.homeTeamId
  if (match.homeScore < match.awayScore) return match.awayTeamId
  return null
}

/**
 * Build a single-elimination bracket as a set of matches with round/slot and next links.
 * Seeding: random shuffle (can be replaced later by ranking).
 */
function generateSingleEliminationMatches({ tournamentId, teamIds, seedTeamIds, nowIso }) {
  if (!Array.isArray(teamIds) || teamIds.length < 2) {
    const err = new Error('Ajoute au moins 2 équipes avant de générer l’arbre.')
    err.status = 400
    throw err
  }

  const { bracketSize, slots } = buildSlots(teamIds, seedTeamIds)

  const totalRounds = Math.log2(bracketSize)
  const matches = []

  // Create all matches first with deterministic ids, so nextMatchId can reference them.
  const perRound = []
  for (let r = 1; r <= totalRounds; r++) {
    const matchCount = bracketSize / (2 ** r)
    const roundMatches = []
    for (let s = 0; s < matchCount; s++) {
      const id = nanoid()
      roundMatches.push({
        id,
        tournamentId,
        round: r,
        slot: s,
        homeTeamId: TBD,
        awayTeamId: TBD,
        homeScore: 0,
        awayScore: 0,
        status: 'scheduled',
        winnerTeamId: null,
        nextMatchId: null,
        nextSlot: null,
        createdAt: nowIso(),
      })
    }
    perRound.push(roundMatches)
  }

  // Link rounds
  for (let r = 1; r < totalRounds; r++) {
    const curr = perRound[r - 1]
    const next = perRound[r]
    for (const m of curr) {
      const nextIndex = Math.floor(m.slot / 2)
      const nextSlot = m.slot % 2 // 0 -> home, 1 -> away
      m.nextMatchId = next[nextIndex].id
      m.nextSlot = nextSlot
    }
  }

  // Fill round 1 from slots
  const r1 = perRound[0]
  for (let i = 0; i < r1.length; i++) {
    r1[i].homeTeamId = slots[i * 2] ?? BYE
    r1[i].awayTeamId = slots[i * 2 + 1] ?? BYE
  }

  for (const roundMatches of perRound) matches.push(...roundMatches)

  return {
    bracketSize,
    totalRounds,
    roundLabels: Array.from({ length: totalRounds }, (_, idx) =>
      roundLabel(idx + 1, totalRounds),
    ),
    matches,
  }
}

module.exports = {
  BYE,
  TBD,
  isByeMatch,
  winnerFromScores,
  generateSingleEliminationMatches,
}

