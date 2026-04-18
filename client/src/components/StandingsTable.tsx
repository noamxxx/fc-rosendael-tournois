import type { StandingRow } from '../lib/types'
import { Card, CardBody } from '../ui/Card'

export function StandingsTable({ rows }: { rows: StandingRow[] }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-semibold tracking-wide text-black/55">
              CLASSEMENT
            </div>
            <div className="mt-1 text-lg font-semibold">En temps réel</div>
          </div>
          <div className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-800">
            \(3\) pts victoire • \(1\) nul • \(0\) défaite
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="text-xs text-black/55">
              <tr className="border-b border-black/10">
                <th className="py-2 pr-3">#</th>
                <th className="py-2 pr-3">Équipe</th>
                <th className="py-2 pr-3">J</th>
                <th className="py-2 pr-3">G</th>
                <th className="py-2 pr-3">N</th>
                <th className="py-2 pr-3">P</th>
                <th className="py-2 pr-3">BP</th>
                <th className="py-2 pr-3">BC</th>
                <th className="py-2 pr-3">Écart</th>
                <th className="py-2 pr-3 text-right">Pts</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.teamId}
                  className="border-b border-black/5 hover:bg-black/5"
                >
                  <td className="py-2 pr-3 text-black/60">{idx + 1}</td>
                  <td className="py-2 pr-3 font-semibold">{r.teamName}</td>
                  <td className="py-2 pr-3 text-black/80">{r.played}</td>
                  <td className="py-2 pr-3 text-black/80">{r.wins}</td>
                  <td className="py-2 pr-3 text-black/80">{r.draws}</td>
                  <td className="py-2 pr-3 text-black/80">{r.losses}</td>
                  <td className="py-2 pr-3 text-black/80">{r.gf}</td>
                  <td className="py-2 pr-3 text-black/80">{r.ga}</td>
                  <td
                    className={
                      'py-2 pr-3 ' +
                      (r.gd > 0
                        ? 'text-emerald-700'
                        : r.gd < 0
                          ? 'text-rose-700'
                          : 'text-black/70')
                    }
                  >
                    {r.gd}
                  </td>
                  <td className="py-2 pr-3 text-right font-semibold">
                    {r.points}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-black/50" colSpan={10}>
                    Pas encore de classement (ajoute des équipes et des matchs).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardBody>
    </Card>
  )
}

