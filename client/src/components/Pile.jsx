import { useEffect, useRef, useState } from 'react'
import Card from './Card.jsx'

const FLIP_MS = 200
const HALF = FLIP_MS / 2

/**
 * A pile on the table. The top card renders via <Card>, which animates its own
 * flip when just the top card is turned over (the deck stays put).
 *
 * Flipping the WHOLE pile reverses the stack, so the top card's id changes and
 * the entire deck turns over — we animate that here by rotating the whole pile
 * element (shadow included), so it reads like flipping one card rather than
 * peeling the top off the deck.
 */
export default function Pile({
    pile,
    topCard,
    left,
    top,
    dragging,
    settling,
    selected,
    highlight,
    locked, // another player is dragging this pile — not grabbable
    onPointerDown,
    onContextMenu,
}) {
    const [shownTop, setShownTop] = useState(topCard)
    const rootRef = useRef(null)
    const prevTop = useRef(topCard)
    const prevCount = useRef(pile.count)
    const animating = useRef(false)
    const timers = useRef([])

    useEffect(() => {
        const before = prevTop.current
        const beforeCount = prevCount.current
        prevTop.current = topCard
        prevCount.current = pile.count
        const node = rootRef.current

        // Whole-pile flip: same number of cards, but the top card's face toggled
        // AND a different card is now on top (the stack got reversed).
        const wholeFlip =
            before &&
            topCard &&
            beforeCount === pile.count &&
            before.id !== topCard.id &&
            before.faceUp !== topCard.faceUp

        if (!wholeFlip || !node || dragging) {
            if (!animating.current) setShownTop(topCard)
            return
        }

        timers.current.forEach(clearTimeout)
        timers.current = []
        animating.current = true

        node.style.transition = `transform ${HALF}ms ease-in`
        node.style.transform = 'perspective(700px) rotateY(90deg)'

        timers.current.push(
            setTimeout(() => {
                setShownTop(topCard)
                node.style.transition = 'none'
                node.style.transform = 'perspective(700px) rotateY(-90deg)'
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        node.style.transition = `transform ${HALF}ms ease-out`
                        node.style.transform = 'perspective(700px) rotateY(0deg)'
                    })
                })
            }, HALF),
        )
        timers.current.push(
            setTimeout(() => {
                animating.current = false
                setShownTop(prevTop.current)
                node.style.transition = ''
                node.style.transform = ''
            }, FLIP_MS),
        )

        return () => timers.current.forEach(clearTimeout)
    }, [topCard, pile.count, dragging])

    return (
        <div
            ref={rootRef}
            data-pile={pile.id}
            className={`pile ${dragging ? 'dragging' : ''} ${settling ? 'settling' : ''} ${selected ? 'selected' : ''} ${highlight ? 'highlight' : ''} ${locked ? 'locked' : ''} ${pile.count > 1 ? 'stacked' : ''}`}
            style={{ left, top }}
            onPointerDown={onPointerDown}
            onContextMenu={onContextMenu}
        >
            <Card card={shownTop} />
            {pile.count > 1 && <span className="count-badge">{pile.count}</span>}
        </div>
    )
}
