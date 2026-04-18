import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getAdminSessionRole } from '../lib/adminSessionRole'
import { createTournament } from '../lib/api'
import { Card, CardBody } from '../ui/Card'
import { Layout } from '../ui/Layout'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

function normalizeSlug(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replaceAll(' ', '-')
    .replaceAll(/[^a-z0-9-]/g, '')
}

export function AdminNewTournamentPage() {
  const nav = useNavigate()
  useEffect(() => {
    if (getAdminSessionRole() === 'turso') nav('/admin/turso', { replace: true })
  }, [nav])
  const [name, setName] = useState('Tournoi Rosendael')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const suggestedSlug = useMemo(() => normalizeSlug(name), [name])

  async function onCreate() {
    setError(null)
    setBusy(true)
    try {
      const res = await createTournament({ name })
      nav(`/admin/t/${res.tournament.slug}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardBody>
            <div className="text-xs font-semibold tracking-wide text-black/55">
              NOUVEAU TOURNOI
            </div>
            <div className="mt-1 text-2xl font-semibold">
              Créer le tournoi
            </div>
            <div className="mt-2 text-sm text-black/60">
              Le code public est généré à partir du nom :{" "}
              <span className="font-mono text-black/85">{suggestedSlug}</span>
            </div>

            <div className="mt-5 grid gap-3">
              <div>
                <div className="mb-1 text-xs text-black/55">Nom</div>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <Button variant="ghost" onClick={() => nav('/')}>
                Retour
              </Button>
              <Button disabled={busy || !name.trim()} onClick={onCreate}>
                {busy ? 'Création…' : 'Créer'}
              </Button>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <div className="text-xs font-semibold tracking-wide text-black/55">
              CONSEILS RAPIDES
            </div>
            <div className="mt-2 text-sm text-black/60">
              - Ajoute toutes les équipes
              <br />- Crée les matchs (A contre B)
              <br />- Mets les scores et marque les matchs comme terminés
              <br />- Le classement se calcule automatiquement
            </div>
          </CardBody>
        </Card>
      </div>
    </Layout>
  )
}

