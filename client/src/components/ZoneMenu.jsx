import Menu from './Menu.jsx'

/** Right-click menu for a zone: layout / rename (sort + remove are title-bar buttons). */
export default function ZoneMenu({ menu, actions, onClose }) {
    const id = menu.zoneId

    const gridLayout = () => {
        const n = Number(window.prompt('Items per row:', String(menu.perRow || 4)))
        if (n > 0) actions.setZoneLayout(id, 'grid', n)
    }
    const rename = () => {
        const name = window.prompt('Zone name:', menu.name)
        if (name !== null) actions.renameZone(id, name)
    }

    const items = [
        {
            label: 'Layout',
            items: [
                {
                    label: `Single row${menu.layout === 'row' ? ' ✓' : ''}`,
                    onClick: () => actions.setZoneLayout(id, 'row'),
                },
                {
                    label: `Grid…${menu.layout === 'grid' ? ` (${menu.perRow}/row) ✓` : ''}`,
                    onClick: gridLayout,
                },
            ],
        },
        // A board (owned play area) is named after its owner, so it can't be renamed.
        !menu.fixed && { separator: true },
        !menu.fixed && { label: 'Rename…', onClick: rename },
    ]

    return <Menu x={menu.x} y={menu.y} title={menu.name} items={items} onClose={onClose} />
}
