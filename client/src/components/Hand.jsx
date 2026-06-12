import { forwardRef, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Card from './Card.jsx'

const FLIP_MS = 200
const FAN_MS = 180
const CARD_W = 72
const GAP = 8 // spacing between cards when there's room to spread out
const MIN_STEP = 6 // tiny floor; the step otherwise shrinks to fit the width exactly
const GMIN = 8 // smallest advance between two cards while fanning
const LIFT = 16 // how far the hovered card rises

/** The current player's private hand — a frosted strip floating over the table. */
const Hand = forwardRef(function Hand(
    {
        cards,
        actions,
        activeId,
        activeIds, // a set of cards lifted together (a selected block being reordered)
        highlight,
        mode = 'overlapped',
        onToggleDisplay,
        playFaceUp = true,
        onTogglePlayFace,
        onSort,
        onCardPointerDown,
        selectedIds, // hand card ids currently marquee-selected
        onSelectionChange, // (Set) — report a new hand selection
        disableHover, // suppress the hover fan (a table marquee / drag is active)
    },
    ref,
) {
    const disabled = cards.length < 2
    const cardsRef = useRef(null)
    const prevPos = useRef(new Map()) // cardId -> previous { left, top }
    const stepRef = useRef(CARD_W + GAP) // current resting step (px)
    const hoverRef = useRef(null) // currently hovered card id
    const draggingRef = useRef(false)
    draggingRef.current = !!activeId
    const tiled = mode === 'tiled' // scroll instead of overlap when full
    const modeRef = useRef(mode)
    modeRef.current = mode

    // Marquee selection inside the hand. Box coords are relative to the cards row.
    const [marquee, setMarquee] = useState(null)
    const marqueeRef = useRef(null)
    const selectingRef = useRef(false)
    const disableHoverRef = useRef(disableHover)
    disableHoverRef.current = disableHover

    // Recompute the overlap step so the whole row spans the width exactly — the
    // cards overlap more as more are added, and never exceed the panel.
    function measureStep() {
        const el = cardsRef.current
        if (!el) return
        const natural = CARD_W + GAP
        // Tiled: cards keep their natural spacing and the row scrolls when full.
        if (modeRef.current === 'tiled') {
            stepRef.current = natural
            el.style.setProperty('--hand-step', `${natural}px`)
            return
        }
        const n = el.querySelectorAll('[data-handcard]').length
        const cs = getComputedStyle(el)
        const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        let step = natural
        if (n > 1) step = Math.max(MIN_STEP, Math.min(natural, (inner - CARD_W) / (n - 1)))
        stepRef.current = step
        // Keep the exact (sub-pixel) step so the overlapping row spans the width
        // precisely — rounding here left a small, count-dependent right margin.
        el.style.setProperty('--hand-step', `${step}px`)
    }

    // On every change to the hand (play / add / sort / shuffle / reorder): first
    // update the overlap density, then FLIP each card from its old spot to its
    // new one. Cards that don't move have any leftover hover-fan transform
    // cleared, so the row settles at the correct density.
    useLayoutEffect(() => {
        const container = cardsRef.current
        if (!container) return
        measureStep()

        const next = new Map()
        hoverRef.current = null
        for (const node of container.querySelectorAll('[data-handcard]')) {
            node.style.zIndex = ''
            const id = node.getAttribute('data-handcard')
            const pos = { left: node.offsetLeft, top: node.offsetTop }
            next.set(id, pos)
            const prev = prevPos.current.get(id)
            const dx = prev ? prev.left - pos.left : 0
            const dy = prev ? prev.top - pos.top : 0
            if (!dx && !dy) {
                node.style.transform = '' // clear any stale fan offset
                continue
            }
            node.style.transition = 'none'
            node.style.transform = `translate(${dx}px, ${dy}px)`
            requestAnimationFrame(() => {
                node.style.transition = `transform ${FLIP_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
                node.style.transform = ''
            })
            node.addEventListener(
                'transitionend',
                () => {
                    node.style.transition = ''
                },
                { once: true },
            )
        }
        prevPos.current = next

        const ro = new ResizeObserver(() => measureStep())
        ro.observe(container)
        return () => ro.disconnect()
    }, [cards, mode])

    // Drop any hover fan as soon as a drag begins.
    useEffect(() => {
        if (activeId) applyFan(null)
    }, [activeId])

    /**
     * Fan the cards open to reveal `hoverId`. A full-card gap opens after the
     * hovered card so its face shows; that width is taken back uniformly from
     * every other gap, so both sides compress in proportion to how many cards
     * sit there — and the row's total width never changes (stays in the panel).
     */
    function applyFan(hoverId) {
        const el = cardsRef.current
        if (!el) return
        // No hover fan while a selection box is being dragged (here or on the table)
        // or anything is being dragged — the row should stay still.
        if (draggingRef.current || modeRef.current === 'tiled') hoverId = null
        if (selectingRef.current || disableHoverRef.current) hoverId = null
        if (hoverId === hoverRef.current) return
        hoverRef.current = hoverId

        const nodes = [...el.querySelectorAll('[data-handcard]')]
        const n = nodes.length
        const step = stepRef.current
        const h = hoverId == null ? -1 : nodes.findIndex((nd) => nd.dataset.handcard === hoverId)

        const dx = new Array(n).fill(0)
        if (h >= 0 && h < n - 1 && step < CARD_W && n >= 2) {
            const gaps = new Array(n - 1).fill(step) // advance between consecutive cards
            const others = n - 2 // every gap except the reveal gap
            const maxDeficit = others * (step - GMIN) // most the others can give up
            const revealGap = Math.min(CARD_W, step + maxDeficit)
            const per = others > 0 ? (revealGap - step) / others : 0
            gaps[h] = revealGap
            for (let i = 0; i < n - 1; i++) if (i !== h) gaps[i] = step - per

            // Cumulative left positions vs the resting positions (i*step).
            let x = 0
            for (let i = 0; i < n; i++) {
                dx[i] = x - i * step
                x += gaps[i] ?? 0
            }
        }

        nodes.forEach((node, i) => {
            const lift = i === h ? LIFT : 0
            node.style.transition = `transform ${FAN_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
            node.style.transform = dx[i] || lift ? `translate(${dx[i]}px, ${-lift}px)` : ''
            node.style.zIndex = i === h ? '30' : ''
        })
    }

    // The hand card ids whose rect intersects a marquee box (row-relative coords).
    function cardsInBox(m) {
        const el = cardsRef.current
        if (!el) return new Set()
        const box = el.getBoundingClientRect()
        const rx0 = Math.min(m.x0, m.x1)
        const ry0 = Math.min(m.y0, m.y1)
        const rx1 = Math.max(m.x0, m.x1)
        const ry1 = Math.max(m.y0, m.y1)
        const ids = new Set()
        for (const node of el.querySelectorAll('[data-handcard]')) {
            const r = node.getBoundingClientRect()
            const x0 = r.left - box.left
            const y0 = r.top - box.top
            if (x0 < rx1 && x0 + r.width > rx0 && y0 < ry1 && y0 + r.height > ry0)
                ids.add(node.dataset.handcard)
        }
        return ids
    }

    // Start a selection box. A plain press on a card drags that card, so to box
    // over the packed row you hold a modifier (Shift / Ctrl / Cmd); a plain press
    // on empty space in the row starts a box too. (The card's own handler bails on
    // the modifier — see startHandDrag — so the two never fight.)
    function onMarqueeDown(e) {
        if (e.button !== 0) return
        const wantBox = e.shiftKey || e.ctrlKey || e.metaKey
        const cardEl = e.target.closest('[data-handcard]')
        if (cardEl && !wantBox) return
        e.preventDefault()
        const box = cardsRef.current.getBoundingClientRect()
        const p = { x0: e.clientX - box.left, y0: e.clientY - box.top }
        // Remember the card under the press so a modifier-click (no drag) can toggle it.
        const m = { ...p, x1: p.x0, y1: p.y0, cardId: cardEl?.dataset.handcard ?? null }
        marqueeRef.current = m
        selectingRef.current = true
        setMarquee(m)
        applyFan(null) // collapse any fan while selecting
        window.addEventListener('pointermove', onMarqueeMove)
        window.addEventListener('pointerup', onMarqueeUp)
    }

    function onMarqueeMove(e) {
        const m = marqueeRef.current
        if (!m) return
        const box = cardsRef.current.getBoundingClientRect()
        const next = { ...m, x1: e.clientX - box.left, y1: e.clientY - box.top }
        marqueeRef.current = next
        setMarquee(next)
        onSelectionChange?.(cardsInBox(next))
    }

    function onMarqueeUp() {
        window.removeEventListener('pointermove', onMarqueeMove)
        window.removeEventListener('pointerup', onMarqueeUp)
        const m = marqueeRef.current
        marqueeRef.current = null
        selectingRef.current = false
        setMarquee(null)
        if (!m) return
        const moved = Math.abs(m.x1 - m.x0) > 4 || Math.abs(m.y1 - m.y0) > 4
        if (moved) {
            onSelectionChange?.(cardsInBox(m))
        } else if (m.cardId) {
            // Modifier-click on a card with no drag → toggle just that card.
            const next = new Set(selectedIds || [])
            if (next.has(m.cardId)) next.delete(m.cardId)
            else next.add(m.cardId)
            onSelectionChange?.(next)
        } else {
            onSelectionChange?.(new Set()) // click empty space → clear
        }
    }

    useEffect(
        () => () => {
            window.removeEventListener('pointermove', onMarqueeMove)
            window.removeEventListener('pointerup', onMarqueeUp)
        },
        [],
    )

    return (
        <footer className={`hand ${highlight ? 'highlight' : ''}`} ref={ref}>
            <div className="hand-bar">
                <span className="hand-label">Your hand · {cards.length}</span>
                <div className="hand-controls">
                    <button className="zone-btn" disabled={disabled} onClick={(e) => onSort?.(e)}>
                        Sort
                    </button>
                    <button
                        className="zone-btn"
                        onClick={onToggleDisplay}
                        title="Toggle card display"
                    >
                        Display: {tiled ? 'Tiled' : 'Overlapped'}
                    </button>
                    <button
                        className="zone-btn"
                        onClick={onTogglePlayFace}
                        title="Toggle whether cards you play land face up or face down"
                    >
                        Play: {playFaceUp ? 'Face up' : 'Face down'}
                    </button>
                    <button
                        className="zone-btn stand-up"
                        onClick={() => actions.leaveSeat()}
                        title="Leave your seat"
                    >
                        Stand up
                    </button>
                </div>
            </div>
            <div
                className={`hand-cards ${tiled ? 'tiled' : ''}`}
                ref={cardsRef}
                onPointerDown={onMarqueeDown}
                onMouseOver={(e) => {
                    const card = e.target.closest('[data-handcard]')
                    if (card) applyFan(card.dataset.handcard)
                }}
                onMouseLeave={() => applyFan(null)}
            >
                {cards.map((card) => {
                    const active = activeId === card.id || activeIds?.has(card.id)
                    return (
                        <div
                            key={card.id}
                            data-handcard={card.id}
                            className={`hand-card ${active ? 'active' : ''} ${
                                selectedIds?.has(card.id) && !active ? 'selected' : ''
                            }`}
                            onPointerDown={(e) => onCardPointerDown(e, card)}
                        >
                            <Card card={card} />
                        </div>
                    )
                })}
                {marquee && (
                    <div
                        className="hand-marquee"
                        style={{
                            left: Math.min(marquee.x0, marquee.x1),
                            top: Math.min(marquee.y0, marquee.y1),
                            width: Math.abs(marquee.x1 - marquee.x0),
                            height: Math.abs(marquee.y1 - marquee.y0),
                        }}
                    />
                )}
            </div>
        </footer>
    )
})

export default Hand
