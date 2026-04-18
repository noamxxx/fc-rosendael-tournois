import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useTournamentLive } from '../hooks/useTournamentLive'
import { BracketView } from '../components/BracketView'
import { ViewerTeamsRoster } from '../components/ViewerTeamsRoster'
import { Button } from '../ui/Button'
import { Card, CardBody } from '../ui/Card'
import { Layout } from '../ui/Layout'

export function ViewerTournamentPage() {
  const { slug } = useParams()
  const nav = useNavigate()
  const { state } = useTournamentLive(slug ?? '')
  const liveAnchorKey = state.status === 'ready' ? (state.data.tournament.liveMatchId ?? '') : ''

  useEffect(() => {
    if (state.status !== 'ready') return
    if (state.data.bracket) return
    if (window.location.hash !== '#live') return
    const { pathname, search } = window.location
    window.history.replaceState(null, '', `${pathname}${search}`)
  }, [state.status, state.status === 'ready' ? state.data.bracket : null])

  useEffect(() => {
    if (window.location.hash !== '#live') return
    if (state.status === 'ready' && !state.data.bracket) return
    // Laisser un tick à React pour afficher le bandeau « en direct ».
    const t = window.setTimeout(() => {
      const el = document.getElementById('live')
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
    return () => window.clearTimeout(t)
  }, [state.status, liveAnchorKey, state.status === 'ready' ? state.data.bracket : null])

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
      <div className="flex items-center justify-between gap-3">
        <div />
        <Button variant="ghost" onClick={() => nav('/')}>
          Accueil
        </Button>
      </div>

      <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
        {state.status === 'loading' && (
          <Card>
            <CardBody>
              <div className="text-sm text-black/70">Connexion…</div>
            </CardBody>
          </Card>
        )}
        {state.status === 'error' && (
          <Card>
            <CardBody>
              <div className="text-sm text-red-700">{state.error}</div>
              <div className="mt-3 text-xs text-black/55">
                Si tu viens d’un QR code, vérifie que le serveur est bien lancé.
              </div>
            </CardBody>
          </Card>
        )}
        {state.status === 'ready' && (
          <>
            {state.data.bracket ? (
              <>
                <div
                  className="min-w-0 lg:col-span-2 scroll-mt-24"
                  id={state.data.tournament.liveMatchId ? 'live' : undefined}
                >
                  <BracketView
                    teams={state.data.teams}
                    rounds={state.data.bracket.rounds}
                  />
                </div>
                {state.data.teams.length > 0 ? (
                  <div className="lg:col-span-2">
                    <ViewerTeamsRoster teams={state.data.teams} players={state.data.players ?? []} />
                  </div>
                ) : null}
              </>
            ) : (
              <Card className="lg:col-span-2">
                <CardBody>
                  <div className="text-sm text-black/70">
                    Arbre non généré pour ce tournoi.
                  </div>
                </CardBody>
              </Card>
            )}
          </>
        )}
      </div>
    </Layout>
  )
}

