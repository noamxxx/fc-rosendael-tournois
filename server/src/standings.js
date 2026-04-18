function computeStandings({ teams, matches }) {
  const byId = new Map()
  for (const t of teams) {
    byId.set(t.id, {
      teamId: t.id,
      teamName: t.name,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
    })
  }

  for (const m of matches) {
    if (m.status !== 'final') continue
    const home = byId.get(m.homeTeamId)
    const away = byId.get(m.awayTeamId)
    if (!home || !away) continue

    home.played += 1
    away.played += 1
    home.gf += m.homeScore
    home.ga += m.awayScore
    away.gf += m.awayScore
    away.ga += m.homeScore

    if (m.homeScore > m.awayScore) {
      home.wins += 1
      home.points += 3
      away.losses += 1
    } else if (m.homeScore < m.awayScore) {
      away.wins += 1
      away.points += 3
      home.losses += 1
    } else {
      home.draws += 1
      away.draws += 1
      home.points += 1
      away.points += 1
    }
  }

  for (const row of byId.values()) {
    row.gd = row.gf - row.ga
  }

  const rows = [...byId.values()]
  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.gd !== a.gd) return b.gd - a.gd
    if (b.gf !== a.gf) return b.gf - a.gf
    return a.teamName.localeCompare(b.teamName, 'fr')
  })

  return rows
}

module.exports = { computeStandings }

