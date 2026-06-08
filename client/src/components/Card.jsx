import { useEffect, useRef, useState } from 'react'

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' }
const SUIT_COLOR = { S: 'black', C: 'black', H: 'red', D: 'red' }

const FLIP_MS = 200
const HALF = FLIP_MS / 2

/** The static face or back of a card (no animation). */
function CardFace({ card }) {
    if (!card || !card.faceUp) {
        return <div className="card card-back" />
    }

    if (card.isJoker) {
        const variant = card.variant === 'mono' ? 'joker-mono' : 'joker-color'
        return (
            <div className={`card card-face joker ${variant}`}>
                <span className="corner tl">JOKER</span>
                <span className="pip">★</span>
                <span className="corner br">JOKER</span>
            </div>
        )
    }

    const symbol = SUIT_SYMBOL[card.suit] ?? '?'
    const color = SUIT_COLOR[card.suit] ?? 'black'

    return (
        <div className={`card card-face ${color}`}>
            <span className="corner tl">
                {card.rank}
                <br />
                {symbol}
            </span>
            <span className="pip">{symbol}</span>
            <span className="corner br">
                {card.rank}
                <br />
                {symbol}
            </span>
        </div>
    )
}

/**
 * A card that flips smoothly when its `faceUp` changes. We only ever have the
 * data for one side at a time (a face-down table card hides its rank/suit until
 * the server reveals it), so we animate by rotating the card to its edge,
 * swapping the content while it's edge-on (invisible), then rotating back.
 */
export default function Card({ card }) {
    const [shown, setShown] = useState(card)
    const innerRef = useRef(null)
    const prev = useRef(card)
    const animating = useRef(false)
    const timers = useRef([])

    useEffect(() => {
        const before = prev.current
        prev.current = card
        const node = innerRef.current

        // Flip the card when the same card changes face (e.g. flipping the top
        // card of a pile in place). Whole-pile flips change which card is on top
        // and are animated one level up, in <Pile>.
        const flipped = before && card && before.id === card.id && before.faceUp !== card.faceUp

        // Plain content update (new card, or no face change): swap instantly,
        // but don't interrupt an in-flight flip.
        if (!flipped || !node) {
            if (!animating.current) setShown(card)
            return
        }

        timers.current.forEach(clearTimeout)
        timers.current = []
        animating.current = true

        // Phase 1: rotate to edge-on using the OLD content.
        node.style.transition = `transform ${HALF}ms ease-in`
        node.style.transform = 'rotateY(90deg)'

        timers.current.push(
            setTimeout(() => {
                // At the edge: swap to the NEW content and jump to the far edge
                // with no transition, then rotate back to flat.
                setShown(card)
                node.style.transition = 'none'
                node.style.transform = 'rotateY(-90deg)'
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        node.style.transition = `transform ${HALF}ms ease-out`
                        node.style.transform = 'rotateY(0deg)'
                    })
                })
            }, HALF),
        )
        timers.current.push(
            setTimeout(() => {
                animating.current = false
            }, FLIP_MS),
        )

        return () => timers.current.forEach(clearTimeout)
    }, [card])

    return (
        <div className="card-flip">
            <div className="card-flip-inner" ref={innerRef}>
                <CardFace card={shown} />
            </div>
        </div>
    )
}
