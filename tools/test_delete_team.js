const base = 'http://localhost:5174'
const slug = process.argv[2] || 'tournoi-rosendael'
const password = process.argv[3] || 'admin'

async function main() {
  const login = await fetch(base + '/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  if (!login.ok) throw new Error(await login.text())
  const { token } = await login.json()

  const snap1 = await (await fetch(base + '/api/tournaments/' + slug)).json()
  const team = snap1.teams[0]
  console.log('before', { teams: snap1.teams.length, id: team?.id, name: team?.name })
  if (!team) return

  const del = await fetch(`${base}/api/tournaments/${slug}/teams/${team.id}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  console.log('deleteStatus', del.status, await del.text())

  const snap2 = await (await fetch(base + '/api/tournaments/' + slug)).json()
  console.log('after', {
    teams: snap2.teams.length,
    stillHas: snap2.teams.some((x) => x.id === team.id),
  })
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

