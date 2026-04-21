import type React from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Match, Team } from '../lib/types'
import { cn } from '../ui/cn'

function teamName(teams: Team[], id: string) {
  // Never show "BYE" to viewers/admins: display as an exemption slot.
  if (id === 'BYE') return 'EXEMPT'
  if (id === 'TBD') return 'À définir'
  return teams.find((t) => t.id === id)?.name ?? '—'
}

function scoreBox(value: number, emphasize: boolean) {
  return (
    <div
      className={cn(
        'flex h-12 w-12 items-center justify-center rounded-xl font-mono text-sm font-semibold',
        emphasize ? 'bg-emerald-600 text-white' : 'bg-black/70 text-white/85',
      )}
    >
      {value}
    </div>
  )
}

function scoreInput({
  value,
  emphasize,
  disabled,
  onChange,
}: {
  value: number
  emphasize: boolean
  disabled: boolean
  onChange: (next: number) => void
}) {
  return (
    <input
      className={cn(
        'h-12 w-12 rounded-xl border font-mono text-sm font-semibold outline-none',
        'text-center',
        emphasize ? 'border-emerald-500/35 bg-emerald-600 text-white' : 'border-black/10 bg-black/70 text-white/90',
        'focus:ring-2 focus:ring-rose-500/30',
        disabled && 'cursor-not-allowed opacity-60',
      )}
      type="number"
      min={0}
      inputMode="numeric"
      disabled={disabled}
      value={value}
      onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
    />
  )
}

function roundTitle(round: number, totalRounds: number) {
  const remaining = totalRounds - round + 1
  if (remaining === 1) return 'Finale'
  if (remaining === 2) return 'Demi-finales'
  if (remaining === 3) return 'Quarts'
  if (remaining === 4) return 'Huitièmes'
  return `Manche ${round}`
}

function MatchCard({
  teams,
  match,
  right,
  style,
  editableScores,
}: {
  teams: Team[]
  match: Match
  right?: React.ReactNode
  style: React.CSSProperties
  editableScores?: {
    enabled: boolean
    disabled: boolean
    homeValue: number
    awayValue: number
    onHomeChange: (v: number) => void
    onAwayChange: (v: number) => void
  }
}) {
  const home = teamName(teams, match.homeTeamId)
  const away = teamName(teams, match.awayTeamId)
  const final = match.status === 'final'
  const r = Number(match.round ?? 1)
  const s = Number(match.slot ?? 0)
  // Round 1: alternate red/green every other match (slot parity).
  // Other rounds: alternate by round.
  const accent: 'red' | 'green' = r === 1 ? (s % 2 === 0 ? 'red' : 'green') : r % 2 === 1 ? 'red' : 'green'

  const homeWon = final && match.winnerTeamId === match.homeTeamId
  const awayWon = final && match.winnerTeamId === match.awayTeamId

  const locked =
    match.homeTeamId === 'TBD' ||
    match.awayTeamId === 'TBD' ||
    match.homeTeamId === 'BYE' ||
    match.awayTeamId === 'BYE'

  return (
    <div className="absolute" style={style}>
      <div
        className={cn(
          'rounded-2xl p-[2px]',
          accent === 'red'
            ? 'bg-gradient-to-br from-rose-600/85 via-rose-500/20 to-white/0'
            : 'bg-gradient-to-br from-emerald-600/85 via-emerald-500/20 to-white/0',
        )}
      >
        <div
          className={cn(
            'relative rounded-[15px] border bg-white/92 backdrop-blur-xl',
            'shadow-[0_18px_45px_rgba(0,0,0,0.10)]',
            'ring-1 ring-black/5',
            final ? 'border-emerald-500/30' : 'border-black/10',
          )}
          style={{
            boxShadow:
              '0 22px 55px rgba(0,0,0,0.10), 0 2px 0 rgba(255,255,255,0.65) inset, 0 -2px 0 rgba(0,0,0,0.04) inset',
          }}
        >
          {/* Accent rail (stronger red/green visibility) */}
          <div
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute left-0 top-0 h-full w-1.5 rounded-l-[15px]',
              accent === 'red' ? 'bg-rose-600' : 'bg-emerald-600',
            )}
          />
        <div className="grid grid-cols-[1fr_auto_auto] grid-rows-2 items-center gap-x-3 gap-y-2 px-4 py-3">
          <div
            className={cn(
              'min-w-0 truncate text-sm font-semibold',
              homeWon ? 'text-emerald-700' : 'text-black/90',
            )}
          >
            {home}
          </div>
          <div className="row-span-2 flex items-center justify-center">
            <span className="inline-flex items-center justify-center rounded-full border border-black/10 bg-black/5 px-2 py-0.5 text-[11px] text-black/70">
              contre
            </span>
          </div>
          <div className="flex items-center justify-end">
            {editableScores?.enabled
              ? scoreInput({
                  value: editableScores.homeValue,
                  emphasize: homeWon,
                  disabled: editableScores.disabled,
                  onChange: editableScores.onHomeChange,
                })
              : scoreBox(match.homeScore, homeWon)}
          </div>

          <div
            className={cn(
              'min-w-0 truncate text-sm font-semibold',
              awayWon ? 'text-emerald-700' : 'text-black/90',
            )}
          >
            {away}
          </div>
          <div className="flex items-center justify-end">
            {editableScores?.enabled
              ? scoreInput({
                  value: editableScores.awayValue,
                  emphasize: awayWon,
                  disabled: editableScores.disabled,
                  onChange: editableScores.onAwayChange,
                })
              : scoreBox(match.awayScore, awayWon)}
          </div>

          <div className="col-span-3 mt-1 flex items-center gap-2 text-[11px]">
            {locked ? <span className="text-black/45">(en préparation)</span> : null}
            <div className="ml-auto flex items-center gap-2">
              {right ? <div className="shrink-0">{right}</div> : null}
              {final ? <span className="font-semibold text-emerald-700">QUALIFIÉ</span> : null}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

export function BracketView({
  teams,
  rounds,
  renderMatchRight,
  editableScores,
}: {
  teams: Team[]
  rounds: Array<{ round: number; matches: Match[] }>
  renderMatchRight?: (m: Match) => React.ReactNode
  editableScores?: {
    enabled: boolean
    disabled?: (m: Match) => boolean
    debounceMs?: number
    onSave: (matchId: string, home: number, away: number) => void | Promise<void>
  }
}) {
  const totalRounds = rounds.length
  const outerRef = useRef<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [fitScale, setFitScale] = useState(1)
  const [userScale, setUserScale] = useState(1)
  const [isMobile, setIsMobile] = useState(false)
  const [isTouch, setIsTouch] = useState(false)
  const userScaleRef = useRef(1)
  useEffect(() => {
    userScaleRef.current = userScale
  }, [userScale])

  const pinchRef = useRef<{
    active: boolean
    startDist: number
    startUserScale: number
    lastTapAt: number
    dragActive: boolean
    dragStartX: number
    dragStartY: number
    dragScrollLeft: number
    dragScrollTop: number
  }>({
    active: false,
    startDist: 0,
    startUserScale: 1,
    lastTapAt: 0,
    dragActive: false,
    dragStartX: 0,
    dragStartY: 0,
    dragScrollLeft: 0,
    dragScrollTop: 0,
  })

  const saveTimersRef = useRef(new Map<string, number>())
  const [draftScores, setDraftScores] = useState<Record<string, { home: number; away: number }>>({})

  // Layout constants (tuned for PC + mobile; stable across zoom/OS)
  const CARD_W = 320
  // Must match the real rendered MatchCard height (we added a mid separator).
  const CARD_H = 148
  const COL_GAP = 96
  const BASE_GAP = 44
  const PAIR_GAP = 28
  // Must cover the styled round header card height (avoid overlap with first match).
  const HEADER_H = 92

  const layout = useMemo(() => {
    const matches: Match[] = []
    for (const r of rounds) matches.push(...r.matches)

    // child -> parent links are stored on the child (nextMatchId).
    const children = new Map<string, string[]>()
    for (const m of matches) {
      const nextId = m.nextMatchId ?? null
      if (!nextId) continue
      const arr = children.get(nextId) ?? []
      arr.push(m.id)
      children.set(nextId, arr)
    }

    // Centers for each match card
    const centers = new Map<string, { x: number; y: number }>()

    // Round 1 baseline (stacked)
    const r1 = rounds.find((x) => x.round === 1)?.matches ?? []
    for (const m of r1) {
      const slot = Number(m.slot ?? 0)
      // Extra breathing room between pairs (2 matches -> same next match).
      const y =
        HEADER_H +
        slot * (CARD_H + BASE_GAP) +
        Math.floor(slot / 2) * PAIR_GAP +
        CARD_H / 2
      const x = CARD_W / 2
      centers.set(m.id, { x, y })
    }

    // Higher rounds: y is average(children y) for perfect line alignment.
    // Fallback to geometric spacing if linkage is missing.
    for (let r = 2; r <= totalRounds; r++) {
      const rr = rounds.find((x) => x.round === r)?.matches ?? []
      for (const m of rr) {
        const slot = Number(m.slot ?? 0)
        const ch = children.get(m.id) ?? []
        const ys = ch.map((id) => centers.get(id)?.y).filter((v): v is number => typeof v === 'number')
        const y =
          ys.length >= 1
            ? ys.reduce((a, b) => a + b, 0) / ys.length
            : r === 1
              ? HEADER_H +
                slot * (CARD_H + BASE_GAP) +
                Math.floor(slot / 2) * PAIR_GAP +
                CARD_H / 2
              : HEADER_H + slot * (CARD_H + BASE_GAP * 2 ** (r - 1)) + CARD_H / 2
        const x = (r - 1) * (CARD_W + COL_GAP) + CARD_W / 2
        centers.set(m.id, { x, y })
      }
    }

    // Canvas size
    let maxY = HEADER_H + CARD_H
    for (const c of centers.values()) maxY = Math.max(maxY, c.y + CARD_H / 2)
    const canvasW = totalRounds * CARD_W + (totalRounds - 1) * COL_GAP
    const canvasH = Math.max(HEADER_H + CARD_H, maxY + 24)

    // Connection paths (elbows) with red/green contours
    const paths: Array<{ d: string; color: 'red' | 'green' }> = []
    for (const m of matches) {
      const nextId = m.nextMatchId ?? null
      if (!nextId) continue
      const a = centers.get(m.id)
      const b = centers.get(nextId)
      if (!a || !b) continue

      const ax = a.x + CARD_W / 2
      const ay = a.y
      const bx = b.x - CARD_W / 2
      const by = b.y
      const midX = ax + Math.max(24, (bx - ax) * 0.5)
      const r = Number(m.round ?? 1)
      const s = Number(m.slot ?? 0)
      // Round 1: alternate red/green every other match (slot parity).
      // Other rounds: alternate by round.
      const color: 'red' | 'green' = r === 1 ? (s % 2 === 0 ? 'red' : 'green') : r % 2 === 1 ? 'red' : 'green'
      paths.push({ d: `M ${ax} ${ay} L ${midX} ${ay} L ${midX} ${by} L ${bx} ${by}`, color })
    }

    return { centers, canvasW, canvasH, paths, matches }
  }, [rounds, totalRounds])

  useEffect(() => {
    const mqCoarse = window.matchMedia?.('(pointer: coarse)')
    const mqSmall = window.matchMedia?.('(max-width: 768px)')
    const apply = () => {
      const touch = (navigator as any)?.maxTouchPoints > 0
      setIsMobile(Boolean(mqCoarse?.matches) || Boolean(mqSmall?.matches) || Boolean(touch))
      setIsTouch(Boolean(touch) || Boolean(mqCoarse?.matches))
    }
    apply()
    mqCoarse?.addEventListener?.('change', apply)
    mqSmall?.addEventListener?.('change', apply)
    window.addEventListener('resize', apply)
    return () => {
      mqCoarse?.removeEventListener?.('change', apply)
      mqSmall?.removeEventListener?.('change', apply)
      window.removeEventListener('resize', apply)
    }
  }, [])

  const panMode = isMobile || isTouch

  function isInteractiveTarget(target: EventTarget | null) {
    const el = target instanceof HTMLElement ? target : null
    if (!el) return false
    return Boolean(el.closest('input, textarea, select, button, a, label, [role="button"], [data-no-pan]'))
  }

  // Keep drafts in sync with server snapshot (only if user hasn't started editing this match).
  useEffect(() => {
    if (!editableScores?.enabled) return
    setDraftScores((prev) => {
      const next = { ...prev }
      for (const m of layout.matches) {
        if (!next[m.id]) next[m.id] = { home: m.homeScore, away: m.awayScore }
      }
      return next
    })
  }, [editableScores?.enabled, layout.matches])

  function scheduleSave(matchId: string, home: number, away: number) {
    if (!editableScores?.enabled) return
    const ms = editableScores.debounceMs ?? 350
    const old = saveTimersRef.current.get(matchId)
    if (old) window.clearTimeout(old)
    const t = window.setTimeout(async () => {
      try {
        await editableScores.onSave(matchId, home, away)
      } finally {
        saveTimersRef.current.delete(matchId)
      }
    }, ms)
    saveTimersRef.current.set(matchId, t)
  }

  useEffect(() => {
    return () => {
      for (const t of saveTimersRef.current.values()) window.clearTimeout(t)
      saveTimersRef.current.clear()
    }
  }, [])

  useLayoutEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    const outerRect = outer.getBoundingClientRect()
    const rawW = outerRect.width / Math.max(1, layout.canvasW)
    // Desktop: fit by width for a stable layout (page can scroll vertically if needed).
    // Mobile: also fit by width then allow pinch/scroll.
    const raw = rawW
    setFitScale(Math.max(0.35, Math.min(1, raw)))
  }, [layout.canvasW, layout.canvasH, isMobile])

  useEffect(() => {
    const outer = outerRef.current
    if (!outer) return
    const ro = new ResizeObserver(() => {
      const outerRect = outer.getBoundingClientRect()
      const rawW = outerRect.width / Math.max(1, layout.canvasW)
      const raw = rawW
      setFitScale(Math.max(0.35, Math.min(1, raw)))
    })
    ro.observe(outer)
    return () => ro.disconnect()
  }, [layout.canvasW, layout.canvasH, isMobile])

  const scale = Math.max(0.35, Math.min(2, fitScale * userScale))

  // Après zoom (pincement), scrollWidth change : recaler pour pouvoir atteindre tout le canvas (droite / bas).
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !panMode) return
    const maxL = Math.max(0, el.scrollWidth - el.clientWidth)
    const maxT = Math.max(0, el.scrollHeight - el.clientHeight)
    if (el.scrollLeft > maxL) el.scrollLeft = maxL
    if (el.scrollTop > maxT) el.scrollTop = maxT
  }, [panMode, scale, layout.canvasW, layout.canvasH, fitScale])

  function dist(t0: { clientX: number; clientY: number }, t1: { clientX: number; clientY: number }) {
    const dx = t0.clientX - t1.clientX
    const dy = t0.clientY - t1.clientY
    return Math.hypot(dx, dy)
  }

  // Native touch handling (passive:false) for reliable drag/pinch on mobile.
  useEffect(() => {
    if (!panMode) return
    const el = scrollRef.current
    if (!el) return

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current.active = true
        pinchRef.current.startDist = dist(e.touches[0], e.touches[1])
        pinchRef.current.startUserScale = userScaleRef.current
        pinchRef.current.dragActive = false
        e.preventDefault()
        return
      }
      if (e.touches.length === 1) {
        // Allow focusing / editing inputs (scores) on mobile.
        if (isInteractiveTarget(e.target)) return
        const now = Date.now()
        const dt = now - pinchRef.current.lastTapAt
        pinchRef.current.lastTapAt = now
        if (dt > 80 && dt < 320) setUserScale(1)

        pinchRef.current.dragActive = true
        pinchRef.current.dragStartX = e.touches[0].clientX
        pinchRef.current.dragStartY = e.touches[0].clientY
        pinchRef.current.dragScrollLeft = el.scrollLeft
        pinchRef.current.dragScrollTop = el.scrollTop
        e.preventDefault()
      }
    }

    const onMove = (e: TouchEvent) => {
      if (pinchRef.current.active) {
        if (e.touches.length !== 2) return
        const d = dist(e.touches[0], e.touches[1])
        const ratio = d / Math.max(1, pinchRef.current.startDist)
        const next = pinchRef.current.startUserScale * ratio
        setUserScale(Math.max(0.6, Math.min(2, next)))
        e.preventDefault()
        return
      }

      if (!pinchRef.current.dragActive) return
      if (e.touches.length !== 1) return
      if (isInteractiveTarget(e.target)) return
      const dx = e.touches[0].clientX - pinchRef.current.dragStartX
      const dy = e.touches[0].clientY - pinchRef.current.dragStartY
      const maxL = Math.max(0, el.scrollWidth - el.clientWidth)
      const maxT = Math.max(0, el.scrollHeight - el.clientHeight)
      el.scrollLeft = Math.max(0, Math.min(maxL, pinchRef.current.dragScrollLeft - dx))
      el.scrollTop = Math.max(0, Math.min(maxT, pinchRef.current.dragScrollTop - dy))
      e.preventDefault()
    }

    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current.active = false
      if (e.touches.length === 0) pinchRef.current.dragActive = false
    }

    el.addEventListener('touchstart', onStart, { passive: false })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd, { passive: false })
    el.addEventListener('touchcancel', onEnd, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onStart as any)
      el.removeEventListener('touchmove', onMove as any)
      el.removeEventListener('touchend', onEnd as any)
      el.removeEventListener('touchcancel', onEnd as any)
    }
  }, [panMode])

  // Pointer : uniquement hors mode « carte » pour éviter double traitement (touch + pointer) sur mobile.
  useEffect(() => {
    if (panMode) return
    const el = scrollRef.current
    if (!el) return

    let active = false
    let pointerId = -1
    let startX = 0
    let startY = 0
    let startLeft = 0
    let startTop = 0

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') return
      // If the user is pinching (2 fingers), touch listeners handle it.
      if ((e as any).isPrimary === false) return
      if (isInteractiveTarget(e.target)) return
      active = true
      pointerId = e.pointerId
      startX = e.clientX
      startY = e.clientY
      startLeft = el.scrollLeft
      startTop = el.scrollTop
      try {
        el.setPointerCapture(pointerId)
      } catch {}
      e.preventDefault()
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!active) return
      if (e.pointerId !== pointerId) return
      const dx = e.clientX - startX
      const dy = e.clientY - startY
      const maxL = Math.max(0, el.scrollWidth - el.clientWidth)
      const maxT = Math.max(0, el.scrollHeight - el.clientHeight)
      el.scrollLeft = Math.max(0, Math.min(maxL, startLeft - dx))
      el.scrollTop = Math.max(0, Math.min(maxT, startTop - dy))
      e.preventDefault()
    }

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return
      active = false
      pointerId = -1
      try {
        el.releasePointerCapture(e.pointerId)
      } catch {}
    }

    el.addEventListener('pointerdown', onPointerDown, { passive: false })
    el.addEventListener('pointermove', onPointerMove, { passive: false })
    el.addEventListener('pointerup', onPointerUp)
    el.addEventListener('pointercancel', onPointerUp)
    return () => {
      el.removeEventListener('pointerdown', onPointerDown as any)
      el.removeEventListener('pointermove', onPointerMove as any)
      el.removeEventListener('pointerup', onPointerUp as any)
      el.removeEventListener('pointercancel', onPointerUp as any)
    }
  }, [panMode])

  return (
    <div className="relative min-w-0 w-full" ref={outerRef}>
      <div
        className={cn(
          'relative min-w-0 max-w-full',
          // Touch: allow 2D panning like a map/card.
          panMode ? 'overflow-auto' : 'overflow-x-hidden overflow-y-visible',
        )}
        // Allow pinch-zoom without the browser interpreting it as page zoom/scroll.
        style={{
          // On touch devices we handle drag-pan ourselves (map-like).
          touchAction: panMode ? 'none' : 'pan-x pan-y',
          WebkitOverflowScrolling: 'touch',
          // Desktop: never show scrollbars
          scrollbarWidth: panMode ? undefined : 'none',
          msOverflowStyle: panMode ? undefined : 'none',
          overscrollBehavior: 'contain',
          // Mobile: keep panning inside the bracket area
          maxHeight: panMode ? '78vh' : undefined,
        }}
        ref={scrollRef}
      >
        <div
          className="relative"
          style={{
            // IMPORTANT: transform doesn't affect layout size.
            // So we size an outer "sizer" to the scaled dimensions to avoid overflow bugs on mobile.
            width: Math.round(layout.canvasW * scale),
            height: Math.round(layout.canvasH * scale),
          }}
        >
          <div
            className="relative"
            style={{
              width: layout.canvasW,
              height: layout.canvasH,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
          <svg
            className="pointer-events-none absolute inset-0 -z-10"
            width={layout.canvasW}
            height={layout.canvasH}
            viewBox={`0 0 ${layout.canvasW} ${layout.canvasH}`}
            fill="none"
          >
            <defs>
              <filter id="bracketShadow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="rgba(0,0,0,0.22)" />
              </filter>
            </defs>
            {layout.paths.map((p, i) => (
              <path
                key={i}
                d={p.d}
                stroke={p.color === 'red' ? 'rgba(225,29,72,0.78)' : 'rgba(34,197,94,0.78)'}
                strokeWidth={3.25}
                strokeLinecap="round"
                strokeLinejoin="round"
                filter="url(#bracketShadow)"
              />
            ))}
          </svg>

          {/* Round headers */}
          {Array.from({ length: totalRounds }, (_, idx) => {
            const round = idx + 1
            const left = idx * (CARD_W + COL_GAP)
            const accent: 'red' | 'green' = round === 1 ? 'red' : round % 2 === 1 ? 'red' : 'green'
            return (
              <div
                key={round}
                style={{ position: 'absolute', left, top: 0, width: CARD_W }}
                className="pointer-events-none"
              >
                <div className="px-1">
                  <div
                    className={cn(
                      'rounded-2xl p-[2px]',
                      accent === 'red'
                        ? 'bg-gradient-to-br from-rose-600/85 via-rose-500/20 to-white/0'
                        : 'bg-gradient-to-br from-emerald-600/85 via-emerald-500/20 to-white/0',
                    )}
                  >
                    <div
                      className={cn(
                        'relative rounded-[15px] border border-black/10 bg-white/86 px-4 py-3',
                        'shadow-[0_18px_45px_rgba(0,0,0,0.10)]',
                        'ring-1 ring-black/5',
                      )}
                      style={{
                        boxShadow:
                          '0 22px 55px rgba(0,0,0,0.10), 0 2px 0 rgba(255,255,255,0.65) inset, 0 -2px 0 rgba(0,0,0,0.04) inset',
                      }}
                    >
                      <div
                        aria-hidden="true"
                        className={cn(
                          'pointer-events-none absolute left-0 top-0 h-full w-1.5 rounded-l-[15px]',
                          accent === 'red' ? 'bg-rose-600' : 'bg-emerald-600',
                        )}
                      />
                      <div className="text-[11px] font-semibold tracking-[0.22em] text-black/55">
                        ARBRE
                      </div>
                      <div className="mt-1 text-lg font-semibold text-black/90">
                        {roundTitle(round, totalRounds)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}

          {/* Cards */}
          {layout.matches.map((m) => {
            const c = layout.centers.get(m.id)
            if (!c) return null
            const left = c.x - CARD_W / 2
            const top = c.y - CARD_H / 2

            const locked =
              m.homeTeamId === 'BYE' ||
              m.awayTeamId === 'BYE' ||
              m.homeTeamId === 'TBD' ||
              m.awayTeamId === 'TBD'
            const canEdit = Boolean(editableScores?.enabled) && !locked
            const disabled = Boolean(editableScores?.disabled?.(m)) || locked
            const draft = draftScores[m.id] ?? { home: m.homeScore, away: m.awayScore }

            return (
              <MatchCard
                key={m.id}
                teams={teams}
                match={m}
                right={renderMatchRight ? renderMatchRight(m) : undefined}
                style={{ left, top, width: CARD_W, height: CARD_H }}
                editableScores={
                  canEdit
                    ? {
                        enabled: true,
                        disabled,
                        homeValue: draft.home,
                        awayValue: draft.away,
                        onHomeChange: (v) => {
                          setDraftScores((prev) => {
                            const next = { ...prev, [m.id]: { home: v, away: draft.away } }
                            return next
                          })
                          scheduleSave(m.id, v, draft.away)
                        },
                        onAwayChange: (v) => {
                          setDraftScores((prev) => {
                            const next = { ...prev, [m.id]: { home: draft.home, away: v } }
                            return next
                          })
                          scheduleSave(m.id, draft.home, v)
                        },
                      }
                    : undefined
                }
              />
            )
          })}
          </div>
        </div>
      </div>
    </div>
  )
}

