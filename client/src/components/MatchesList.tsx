import type { Match, Team } from '../lib/types'
import { Card, CardBody } from '../ui/Card'
import type React from 'react'

function teamName(teams: Team[], id: string) {
  return teams.find((t) => t.id === id)?.name ?? '—'
}

export function MatchesList({
  teams,
  matches,
  rightSlot,
}: {
  teams: Team[]
  matches: Match[]
  rightSlot?: (m: Match) => React.ReactNode
}) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-wide text-black/55">
              MATCHS
            </div>
            <div className="mt-1 text-lg font-semibold">Programme & résultats</div>
          </div>
          <div className="text-xs text-black/55">
            {matches.filter((m) => m.status === 'final').length}/{matches.length} terminés
          </div>
        </div>

        <div className="mt-4 grid gap-2">
          {matches.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">
                  {teamName(teams, m.homeTeamId)}{' '}
                  <span className="text-black/50">contre</span>{' '}
                  {teamName(teams, m.awayTeamId)}
                </div>
                <div className="mt-1 text-xs text-black/55">
                  {m.status === 'final' ? 'Terminé' : 'À venir'}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="rounded-xl border border-black/10 bg-black/5 px-3 py-1.5 font-mono text-sm">
                  {m.homeScore} - {m.awayScore}
                </div>
                {rightSlot?.(m)}
              </div>
            </div>
          ))}

          {matches.length === 0 && (
            <div className="rounded-2xl border border-black/10 bg-white px-4 py-6 text-center text-sm text-black/55">
              Aucun match pour le moment.
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  )
}

