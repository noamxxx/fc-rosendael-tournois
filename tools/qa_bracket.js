const base = 'http://localhost:5174'
const slug = 'tournoi-rosendael'
const adminPin = '1234'

async function post(path, body) {
  const r = await fetch(base + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return t ? JSON.parse(t) : null
}

async function patch(path, body) {
  const r = await fetch(base + path, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return t ? JSON.parse(t) : null
}

async function get(path) {
  const r = await fetch(base + path)
  const t = await r.text()
  if (!r.ok) throw new Error(t)
  return JSON.parse(t)
}

async function main() {
  const snap0 = await get(`/api/tournaments/${slug}`)

  if (snap0.teams.length === 0) {
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      await post(`/api/tournaments/${slug}/teams`, {
        adminPin,
        name: `Équipe ${name}`,
      })
    }
  }

  const snap1 = await get(`/api/tournaments/${slug}`)
  if (!snap1.bracket) {
    await post(`/api/tournaments/${slug}/bracket/generate`, { adminPin })
  }

  const snap2 = await get(`/api/tournaments/${slug}`)
  console.log(
    JSON.stringify(
      {
        teams: snap2.teams.length,
        rounds: snap2.bracket?.rounds.length ?? 0,
        matches: snap2.matches.length,
      },
      null,
      2,
    ),
  )

  const round1 = snap2.bracket?.rounds?.[0]?.matches ?? []
  const playable = round1.find(
    (m) =>
      m.homeTeamId !== 'BYE' &&
      m.awayTeamId !== 'BYE' &&
      m.homeTeamId !== 'TBD' &&
      m.awayTeamId !== 'TBD',
  )

  if (playable) {
    await patch(`/api/tournaments/${slug}/matches/${playable.id}`, {
      adminPin,
      homeScore: 2,
      awayScore: 1,
      status: 'final',
    })
  }

  const snap3 = await get(`/api/tournaments/${slug}`)
  const updated = snap3.matches.find((m) => m.id === playable?.id)
  console.log(
    JSON.stringify(
      {
        updatedMatch: playable?.id ?? null,
        winner: updated?.winnerTeamId ?? null,
        champion: snap3.bracket?.championTeamId ?? null,
      },
      null,
      2,
    ),
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

