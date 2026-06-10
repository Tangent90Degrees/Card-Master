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
    fixed, // a player's board: anchored, header isn't a drag handle
    className,
    style,
    label,
    header, // custom header node (e.g. a station's avatar + name)
    showActions = true, // other players' areas hide the title-bar buttons
    onSort, // opens the sort/shuffle menu from the title-bar button
    onRemove, // delete this zone (table zones only — boards are anchored)
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
            className={`zone ${dragging ? 'dragging' : ''} ${highlight ? 'highlight' : ''} ${className || ''}`}
            data-zone={zone.id}
            style={{ left, top, ...style }}
            onContextMenu={onContextMenu}
        >
            <div className="zone-header" onPointerDown={fixed ? undefined : onHeaderPointerDown}>
                {header ?? (
                    <span className="zone-label">
                        {label ?? zone.name} · {zone.items.length}
                    </span>
                )}
                {showActions && (
                    <div className="zone-actions">
                        <button
                            className="zone-btn"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => onSort?.(e, zone)}
                        >
                            Sort
                        </button>
                        {/* Boards (a player's area) are anchored and can't be removed. */}
                        {!fixed && (
                            <button
                                className="zone-btn danger"
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => onRemove?.(e, zone)}
                            >
                                Remove
                            </button>
                        )}
                    </div>
                )}
            </div>
            <div className="zone-items" style={layoutStyle} ref={itemsRef}>
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
