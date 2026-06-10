import Menu from './Menu.jsx'

/** Right-click menu for a zone: layout / sort / shuffle / rename / remove. */
export default function ZoneMenu({ menu, actions, onRemove, onClose }) {
    const multi = menu.count > 1
    const id = menu.zoneId

    const gridLayout = () => {
        const n = Number(window.prompt('Items per row:', String(menu.perRow || 4)))
        if (n > 0) actions.setZoneLayout(id, 'grid', n)
    }
    const rename = () => {
        const name = window.prompt('Zone name:', menu.name)
        if (name !== null) actions.renameZone(id, name)
    }
    const remove = () => {
        if (menu.count === 0 || confirm('Remove this zone? Its cards stay on the table.'))
            onRemove()
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
        multi && {
            label: 'Sort',
            items: [
                { label: 'By rank', onClick: () => actions.sortZone(id, 'rank') },
                { label: 'By suit', onClick: () => actions.sortZone(id, 'suit') },
            ],
        },
        multi && { label: 'Shuffle', onClick: () => actions.shuffleZone(id) },
        // A board (owned play area) is anchored and named after its owner, so it
        // can't be renamed or removed.
        !menu.fixed && { separator: true },
        !menu.fixed && { label: 'Rename…', onClick: rename },
        !menu.fixed && { label: 'Remove zone', onClick: remove },
    ]

    return <Menu x={menu.x} y={menu.y} title={menu.name} items={items} onClose={onClose} />
}
