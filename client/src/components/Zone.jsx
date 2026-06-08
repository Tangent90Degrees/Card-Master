import { useLayoutEffect, useRef } from 'react'
import Card from './Card.jsx'

const FLIP_MS = 200

/**
 * A labelled area on the table that works like an independent sortable desktop.
 * It holds an ordered list of ITEMS — each item is a card or a pile, shown as a
 * single stacked unit. Layout is 'row' (one auto-width row) or 'grid' (`perRow`
 * items per row). Items glide to their new spots (FLIP) when reordered, like the
 * hand. Drag the header to move the zone; right-click for the menu.
 */
export default function Zone({
    zone,
    items,
    left,
    top,
    dragging,
    highlight,
    selectedIds,
    activeItemId,
    onHeaderPointerDown,
    onItemPointerDown,
    onItemContextMenu,
    onContextMenu,
}) {
    const itemsRef = useRef(null)
    const prevPos = useRef(new Map())

    // FLIP: glide each item from where it was to where it now is on reorder.
    useLayoutEffect(() => {
        const container = itemsRef.current
        if (!container) return
        const next = new Map()
        for (const node of container.querySelectorAll('[data-zoneitem]')) {
            const id = node.getAttribute('data-zoneitem')
            const pos = { left: node.offsetLeft, top: node.offsetTop }
            next.set(id, pos)
            const prev = prevPos.current.get(id)
            if (!prev) continue
            const dx = prev.left - pos.left
            const dy = prev.top - pos.top
            if (!dx && !dy) continue
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
    }, [items])

    const layoutStyle =
        zone.layout === 'grid'
            ? { display: 'grid', gridTemplateColumns: `repeat(${zone.perRow}, var(--card-w))` }
            : { display: 'flex', flexWrap: 'nowrap' }

    return (
        <div
            className={`zone ${dragging ? 'dragging' : ''} ${highlight ? 'highlight' : ''}`}
            data-zone={zone.id}
            style={{ left, top }}
            onContextMenu={onContextMenu}
        >
            <div className="zone-header" onPointerDown={onHeaderPointerDown}>
                <span className="zone-label">
                    {zone.name} · {zone.items.length}
                </span>
            </div>
            <div className="zone-items" style={layoutStyle} ref={itemsRef}>
                {items.length === 0 && <div className="zone-empty">Drop cards or piles here</div>}
                {items.map((item) => {
                    const topCard = item.cards[item.cards.length - 1]
                    return (
                        <div
                            key={item.id}
                            data-zoneitem={item.id}
                            className={`zone-item ${item.count > 1 ? 'stacked' : ''} ${
                                activeItemId === item.id ? 'active' : ''
                            } ${selectedIds?.has(item.id) ? 'selected' : ''}`}
                            onPointerDown={(e) => onItemPointerDown(e, item)}
                            onContextMenu={(e) => onItemContextMenu(e, item)}
                        >
                            <Card card={topCard} />
                            {item.count > 1 && <span className="count-badge">{item.count}</span>}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
