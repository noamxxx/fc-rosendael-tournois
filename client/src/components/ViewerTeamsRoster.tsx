import type { Team, TeamPlayer } from '../lib/types'

type Props = {
  teams: Team[]
  players: TeamPlayer[]
}

function initials(first: string, last: string) {
  const a = (first.trim()[0] ?? '?').toUpperCase()
  const b = (last.trim()[0] ?? '').toUpperCase()
  return b ? `${a}${b}` : a
}

function fullName(p: TeamPlayer) {
  return `${p.firstName.trim()} ${p.lastName.trim()}`.trim() || '—'
}

export function ViewerTeamsRoster({ teams, players }: Props) {
  const sortedTeams = [...teams].sort((a, b) => a.name.localeCompare(b.name, 'fr', { sensitivity: 'base' }))

  return (
    <section
      aria-labelledby="viewer-roster-heading"
      className="rounded-2xl border border-black/10 bg-gradient-to-b from-white via-white to-rose-50/30 p-4 shadow-[0_12px_40px_rgba(0,0,0,0.06)] sm:p-6 md:p-7"
    >
      <header className="border-b border-black/8 pb-4 md:pb-5">
        <h2
          id="viewer-roster-heading"
          className="text-xl font-extrabold tracking-tight text-black/90 sm:text-2xl md:text-[1.65rem]"
        >
          Équipes & joueurs
        </h2>
      </header>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sortedTeams.map((team, idx) => {
          const roster = players
            .filter((p) => p.teamId === team.id)
            .sort((a, b) => {
              const ln = a.lastName.localeCompare(b.lastName, 'fr', { sensitivity: 'base' })
              if (ln !== 0) return ln
              return a.firstName.localeCompare(b.firstName, 'fr', { sensitivity: 'base' })
            })
          const accent = idx % 2 === 0 ? 'from-rose-500 to-rose-600' : 'from-emerald-500 to-emerald-600'
          const borderTint = idx % 2 === 0 ? 'border-rose-200/60' : 'border-emerald-200/60'
          const bgTint = idx % 2 === 0 ? 'from-rose-50/50' : 'from-emerald-50/50'

          return (
            <article
              key={team.id}
              className={`relative flex flex-col overflow-hidden rounded-2xl border ${borderTint} bg-gradient-to-br ${bgTint} via-white to-white shadow-[0_8px_28px_rgba(0,0,0,0.05)]`}
            >
              <div className={`h-1 w-full bg-gradient-to-r ${accent}`} aria-hidden />
              <div className="flex flex-1 flex-col p-4 sm:p-5">
                <h3 className="text-lg font-extrabold leading-snug tracking-tight text-black/90 sm:text-xl">
                  {team.name}
                </h3>
                <p className="mt-0.5 text-xs font-medium text-black/45">
                  {roster.length} joueur{roster.length !== 1 ? 's' : ''}
                </p>

                {roster.length === 0 ? (
                  <p className="mt-4 rounded-xl border border-dashed border-black/12 bg-black/[0.02] px-3 py-4 text-center text-sm text-black/50">
                    Composition à venir
                  </p>
                ) : (
                  <ul className="mt-4 flex flex-col gap-2">
                    {roster.map((p) => (
                      <li
                        key={p.id}
                        className="flex min-h-[48px] items-center gap-3 rounded-xl border border-black/6 bg-white/90 px-3 py-2.5 shadow-sm sm:min-h-[52px] sm:px-3.5 sm:py-3"
                      >
                        <span
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${accent} text-xs font-extrabold text-white shadow-inner sm:h-12 sm:w-12 sm:text-sm`}
                          aria-hidden
                        >
                          {initials(p.firstName, p.lastName)}
                        </span>
                        <span className="min-w-0 flex-1 text-left">
                          <span className="block truncate text-base font-semibold leading-tight text-black/88 sm:text-[1.05rem]">
                            {fullName(p)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
