import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  connectTursoRemote,
  disconnectTursoLocalFile,
  getTursoStatus,
  type TursoConnectionStatus,
} from '../lib/api'
import { Button } from '../ui/Button'
import { Card, CardBody } from '../ui/Card'
import { Input } from '../ui/Input'
import { Layout } from '../ui/Layout'

export function TursoConnectPage() {
  const nav = useNavigate()
  const [status, setStatus] = useState<TursoConnectionStatus | null>(null)
  const [databaseUrl, setDatabaseUrl] = useState('')
  const [authToken, setAuthToken] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!localStorage.getItem('adminToken')) {
      nav('/admin', { replace: true })
      return
    }
    let alive = true
    void getTursoStatus()
      .then((s) => {
        if (alive) setStatus(s)
      })
      .catch((e) => {
        if (alive) setError(e instanceof Error ? e.message : 'Erreur')
      })
    return () => {
      alive = false
    }
  }, [nav])

  async function save() {
    setError(null)
    setBusy(true)
    try {
      const next = await connectTursoRemote(databaseUrl.trim(), authToken.trim())
      setStatus(next)
      setAuthToken('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  async function removeLocalFile() {
    if (!confirm('Retirer la config enregistrée sur ce serveur et utiliser les variables d’environnement ou le fichier SQLite local ?')) return
    setError(null)
    setBusy(true)
    try {
      const next = await disconnectTursoLocalFile()
      setStatus(next)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Layout>
      <div className="mx-auto max-w-xl">
        <Card>
          <CardBody className="space-y-4">
            <div>
              <div className="text-xs font-semibold tracking-wide text-black/55">TURSO</div>
              <h1 className="mt-1 text-xl font-bold text-black/90">Connexion base distante</h1>
              <p className="mt-2 text-sm leading-relaxed text-black/60">
                Turso n’utilise pas ton compte Google pour parler à la base : il faut une URL{' '}
                <span className="font-mono text-xs">libsql://…</span> et un jeton créés dans le{' '}
                <a
                  className="text-rose-700 underline underline-offset-2"
                  href="https://docs.turso.tech/quickstart"
                  target="_blank"
                  rel="noreferrer"
                >
                  tableau de bord Turso
                </a>{' '}
                ou avec la CLI (<span className="font-mono text-xs">turso db show --url</span>,{' '}
                <span className="font-mono text-xs">turso db tokens create</span>). Ici tu les enregistres sur le
                serveur (fichier <span className="font-mono text-xs">server/.turso-local.json</span>, non versionné) :
                l’appli parle alors à Turso, pas au fichier <span className="font-mono text-xs">data.sqlite</span>{' '}
                local (sauf si tu supprimes cette config ou tu utilises les variables d’environnement).
              </p>
            </div>

            {status ? (
              <div className="rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2 text-sm text-black/75">
                <div>
                  Mode :{' '}
                  <span className="font-semibold text-black/85">
                    {status.source === 'file'
                      ? 'Fichier SQLite sur la machine du serveur'
                      : status.source === 'env'
                        ? 'Variables TURSO_* sur le serveur'
                        : 'Fichier server/.turso-local.json'}
                  </span>
                </div>
                <div className="mt-1">
                  Cible : <span className="font-mono text-xs">{status.displayHost}</span>
                  {status.isTursoRemote ? (
                    <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-semibold text-emerald-900">
                      Turso (libsql)
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="block text-xs font-semibold text-black/55">URL base (libsql://…)</label>
              <Input
                className="font-mono text-xs"
                value={databaseUrl}
                onChange={(e) => setDatabaseUrl(e.target.value)}
                placeholder="libsql://ton-db-xxx.turso.io"
                autoComplete="off"
                disabled={busy}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-black/55">Jeton Turso</label>
              <Input
                className="font-mono text-xs"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Colle le token (ne le partage pas)"
                autoComplete="off"
                type="password"
                disabled={busy}
              />
            </div>

            {error ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">{error}</div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                disabled={busy || !databaseUrl.trim().startsWith('libsql://') || authToken.trim().length < 12}
                onClick={() => void save()}
              >
                Enregistrer et utiliser Turso
              </Button>
              <Button variant="ghost" disabled={busy || status?.source !== 'local_file'} onClick={() => void removeLocalFile()}>
                Oublier la config locale Turso
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => nav('/admin')}>
                Retour admin
              </Button>
            </div>
          </CardBody>
        </Card>
      </div>
    </Layout>
  )
}
