import { forwardRef, useEffect, useLayoutEffect, useRef } from 'react'
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
    { cards, actions, activeId, highlight, onCardPointerDown },
    ref,
) {
    const disabled = cards.length < 2
    const cardsRef = useRef(null)
    const prevPos = useRef(new Map()) // cardId -> previous { left, top }
    const stepRef = useRef(CARD_W + GAP) // current resting step (px)
    const hoverRef = useRef(null) // currently hovered card id
    const draggingRef = useRef(false)
    draggingRef.current = !!activeId

    // Recompute the overlap step so the whole row spans the width exactly — the
    // cards overlap more as more are added, and never exceed the panel.
    function measureStep() {
        const el = cardsRef.current
        if (!el) return
        const n = el.querySelectorAll('[data-handcard]').length
        const cs = getComputedStyle(el)
        const inner = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
        const natural = CARD_W + GAP
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
    }, [cards])

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
        if (draggingRef.current) hoverId = null
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

    return (
        <footer className={`hand ${highlight ? 'highlight' : ''}`} ref={ref}>
            <div className="hand-bar">
                <span className="hand-label">Your hand · {cards.length}</span>
                <div className="hand-controls">
                    <button
                        disabled={disabled}
                        onClick={() => actions.sortHand('rank')}
                        title="Sort by rank"
                    >
                        Sort: Rank
                    </button>
                    <button
                        disabled={disabled}
                        onClick={() => actions.sortHand('suit')}
                        title="Sort by suit"
                    >
                        Sort: Suit
                    </button>
                    <button
                        disabled={disabled}
                        onClick={() => actions.shuffleHand()}
                        title="Shuffle your hand"
                    >
                        Shuffle
                    </button>
                    <button
                        className="stand-up"
                        onClick={() => actions.leaveSeat()}
                        title="Leave your seat"
                    >
                        Stand up
                    </button>
                </div>
            </div>
            <div
                className="hand-cards"
                ref={cardsRef}
                onMouseOver={(e) => {
                    const card = e.target.closest('[data-handcard]')
                    if (card) applyFan(card.dataset.handcard)
                }}
                onMouseLeave={() => applyFan(null)}
            >
                {cards.length === 0 && (
                    <div className="hand-empty">Drop a card here, or deal yourself in.</div>
                )}
                {cards.map((card) => (
                    <div
                        key={card.id}
                        data-handcard={card.id}
                        className={`hand-card ${activeId === card.id ? 'active' : ''}`}
                        onPointerDown={(e) => onCardPointerDown(e, card)}
                    >
                        <Card card={card} />
                    </div>
                ))}
            </div>
        </footer>
    )
})

export default Hand
