import { useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * A right-click menu that supports nested submenus. `items` is a flat array; each
 * entry is one of:
 *   { label, onClick }      — a clickable action (closes the menu)
 *   { label, items: [...] } — a parent row; hovering it opens a submenu
 *   { heading: 'text' }     — a non-clickable group/title label
 *   { separator: true }     — a divider line
 *
 * Submenus open on hover and are positioned with pure CSS (to the right of the
 * parent row), so the menu works for any nesting the callers describe.
 */
export default function Menu({ x, y, title, items, onClose }) {
    const ref = useRef(null)
    const [pos, setPos] = useState({ left: x, top: y })
    const [flip, setFlip] = useState(false)

    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    // Keep the menu on screen: shift it back from the right/bottom edges, and open
    // submenus leftward when the menu sits in the right half of the window.
    useLayoutEffect(() => {
        const el = ref.current
        if (!el) return
        const pad = 8
        const w = el.offsetWidth
        const h = el.offsetHeight
        let left = x
        let top = y
        if (left + w > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - w - pad)
        if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad)
        setPos({ left, top })
        setFlip(left + w + w > window.innerWidth)
    }, [x, y])

    return (
        <>
            <div
                className="menu-overlay"
                onPointerDown={onClose}
                onContextMenu={(e) => e.preventDefault()}
            />
            <MenuList
                rootRef={ref}
                style={pos}
                flip={flip}
                title={title}
                items={items}
                onClose={onClose}
            />
        </>
    )
}

function MenuList({ rootRef, style, flip, title, items, onClose, submenu }) {
    return (
        <ul
            ref={rootRef}
            className={`context-menu ${submenu ? 'submenu' : ''} ${flip ? 'flip-left' : ''}`}
            style={style}
        >
            {title && <li className="menu-label">{title}</li>}
            {items.filter(Boolean).map((item, i) => {
                if (item.separator) return <li key={i} className="menu-divider" role="separator" />
                if (item.heading)
                    return (
                        <li key={i} className="menu-label">
                            {item.heading}
                        </li>
                    )
                if (item.items)
                    return (
                        <li key={i} className="menu-parent">
                            {item.label}
                            <span className="menu-arrow">›</span>
                            <MenuList
                                style={{}}
                                items={item.items}
                                onClose={onClose}
                                submenu
                                flip={flip}
                            />
                        </li>
                    )
                return (
                    <li
                        key={i}
                        onClick={() => {
                            item.onClick?.()
                            onClose()
                        }}
                    >
                        {item.label}
                    </li>
                )
            })}
        </ul>
    )
}
