import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { getOpenRegistration, signupRegistration } from '../lib/api'
import { Button } from '../ui/Button'
import { Card, CardBody } from '../ui/Card'
import { Input } from '../ui/Input'
import { Layout } from '../ui/Layout'

export function RegistrationPage() {
  const nav = useNavigate()
  const [searchParams] = useSearchParams()
  const slugFromUrl = (searchParams.get('slug') ?? '').trim() || undefined
  const [status, setStatus] = useState<'loading' | 'open' | 'closed' | 'done' | 'error'>('loading')
  const [tournamentName, setTournamentName] = useState<string>('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    async function load() {
      try {
        const r = await getOpenRegistration(slugFromUrl)
        if (!alive) return
        if (!r.open) {
          setStatus('closed')
          return
        }
        setTournamentName(r.tournament.name)
        setStatus('open')
      } catch (e) {
        if (!alive) return
        setStatus('error')
        setError(e instanceof Error ? e.message : 'Erreur inconnue')
      }
    }
    load()
    return () => {
      alive = false
    }
  }, [slugFromUrl])

  async function onSubmit() {
    const f = firstName.trim()
    const l = lastName.trim()
    if (!f || !l) return
    setBusy(true)
    setError(null)
    try {
      await signupRegistration({ firstName: f, lastName: l, slug: slugFromUrl })
      setStatus('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-xl">
        <Card>
          <CardBody className="text-center">
            <div className="text-xs font-semibold tracking-[0.22em] text-black/55">
              INSCRIPTION
            </div>
            {status === 'loading' ? (
              <div className="mt-3 text-sm text-black/60">Chargement…</div>
            ) : null}

            {status === 'closed' ? (
              <>
                <div className="mt-2 text-2xl font-semibold">Inscriptions terminées</div>
                <div className="mt-2 text-sm text-black/60">
                  Les inscriptions pour ce tournoi sont terminées.
                  <br />
                  Tu pourras t’inscrire pour les prochains tournois.
                </div>
                <div className="mt-5 flex justify-center">
                  <Button variant="ghost" onClick={() => nav('/')}>
                    Retour à l’accueil
                  </Button>
                </div>
              </>
            ) : null}

            {status === 'error' ? (
              <>
                <div className="mt-2 text-2xl font-semibold">Erreur</div>
                <div className="mt-2 text-sm text-red-700">{error ?? 'Impossible de charger.'}</div>
                <div className="mt-5 flex justify-center">
                  <Button variant="ghost" onClick={() => nav('/')}>
                    Retour à l’accueil
                  </Button>
                </div>
              </>
            ) : null}

            {status === 'open' ? (
              <>
                <div className="mt-2 text-2xl font-semibold">Prochain tournoi</div>
                <div className="mt-1 text-sm font-semibold text-black/70">{tournamentName}</div>

                <div className="mt-5 grid gap-2 text-left">
                  <Input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Nom"
                    autoComplete="family-name"
                  />
                  <Input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="Prénom"
                    autoComplete="given-name"
                  />
                </div>

                {error ? (
                  <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                <div className="mt-5 flex justify-center gap-2">
                  <Button variant="ghost" onClick={() => nav('/')}>
                    Annuler
                  </Button>
                  <Button disabled={busy || !firstName.trim() || !lastName.trim()} onClick={onSubmit}>
                    S’inscrire
                  </Button>
                </div>
              </>
            ) : null}

            {status === 'done' ? (
              <>
                <div className="mt-2 text-2xl font-semibold">C’est enregistré</div>
                <div className="mt-2 text-sm text-black/60">
                  Ton inscription a été envoyée.
                  <br />
                  Elle doit être validée par l’admin.
                </div>
                <div className="mt-5 flex justify-center">
                  <Button variant="ghost" onClick={() => nav('/')}>
                    Retour à l’accueil
                  </Button>
                </div>
              </>
            ) : null}
          </CardBody>
        </Card>
      </div>
    </Layout>
  )
}

