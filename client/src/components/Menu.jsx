import { useEffect } from 'react'

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
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    return (
        <>
            <div
                className="menu-overlay"
                onPointerDown={onClose}
                onContextMenu={(e) => e.preventDefault()}
            />
            <MenuList style={{ left: x, top: y }} title={title} items={items} onClose={onClose} />
        </>
    )
}

function MenuList({ style, title, items, onClose, submenu }) {
    return (
        <ul className={`context-menu ${submenu ? 'submenu' : ''}`} style={style}>
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
                            <MenuList style={{}} items={item.items} onClose={onClose} submenu />
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
