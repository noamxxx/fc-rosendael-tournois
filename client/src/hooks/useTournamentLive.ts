import { useCallback, useEffect, useMemo, useState } from 'react'
import { getTournamentSnapshot } from '../lib/api'
import { getSocket } from '../lib/socket'
import type { TournamentSnapshot } from '../lib/types'

type State =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: TournamentSnapshot }

export function useTournamentLive(slug: string) {
  const [state, setState] = useState<State>({ status: 'loading' })

  const room = useMemo(() => `tournament:${slug}`, [slug])

  const reloadSnapshot = useCallback(async () => {
    const s = slug?.trim()
    if (!s) return
    try {
      const data = await getTournamentSnapshot(s)
      setState({ status: 'ready', data })
    } catch (e) {
      setState({
        status: 'error',
        error: e instanceof Error ? e.message : 'Erreur inconnue',
      })
    }
  }, [slug])

  useEffect(() => {
    let alive = true

    if (!slug || !slug.trim()) {
      setState({ status: 'error', error: 'Code tournoi manquant.' })
      return () => {
        alive = false
      }
    }

    setState({ status: 'loading' })

    void (async () => {
      try {
        const data = await getTournamentSnapshot(slug)
        if (!alive) return
        setState({ status: 'ready', data })
      } catch (e) {
        if (!alive) return
        setState({
          status: 'error',
          error: e instanceof Error ? e.message : 'Erreur inconnue',
        })
      }
    })()

    const socket = getSocket()
    const join = () => socket.emit('join', { room })
    join()

    const onSnapshot = (payload: { slug: string; snapshot: TournamentSnapshot }) => {
      if (!alive) return
      if (payload.slug !== slug) return
      setState({ status: 'ready', data: payload.snapshot })
    }

    socket.on('tournament:snapshot', onSnapshot)
    socket.on('connect', join)

    return () => {
      alive = false
      socket.off('tournament:snapshot', onSnapshot)
      socket.off('connect', join)
      socket.emit('leave', { room })
    }
  }, [slug, room])

  return { state, reloadSnapshot }
}
