import Menu from './Menu.jsx'

/**
 * Right-click menu for a card/pile *inside a zone* — mirrors the table-pile
 * menu, but every action stays within the zone (a split makes a new item next
 * to it instead of dropping onto the table).
 */
export default function ZoneItemMenu({ menu, actions, onClose }) {
    const multi = menu.count > 1
    const z = menu.zoneId
    const it = menu.itemId

    const splitCustom = () => {
        const n = Number(window.prompt('Separate how many cards from the top?', '1'))
        if (n > 0) actions.splitZoneItem(z, it, n)
    }
    const dealAll = () => {
        const n = Number(window.prompt('Deal how many cards to each player?', '5'))
        if (n > 0) actions.dealZoneItem(z, it, n)
    }

    const items = [
        multi
            ? {
                  label: 'Flip',
                  items: [
                      { label: 'Top card', onClick: () => actions.flipZoneItem(z, it, 'top') },
                      { label: 'Whole pile', onClick: () => actions.flipZoneItem(z, it, 'all') },
                  ],
              }
            : { label: 'Flip', onClick: () => actions.flipZoneItem(z, it, 'top') },
        multi && { label: 'Shuffle', onClick: () => actions.shuffleZoneItem(z, it) },
        multi && {
            label: 'Separate',
            items: [
                { label: 'Top card', onClick: () => actions.splitZoneItem(z, it, 1) },
                { label: 'All cards', onClick: () => actions.spreadZoneItem(z, it) },
                { label: 'Custom number…', onClick: splitCustom },
            ],
        },
        { separator: true },
        {
            label: 'Draw',
            items: [
                { label: 'To my hand', onClick: () => actions.drawZoneItem(z, it, 1) },
                { label: 'To all players…', onClick: dealAll },
            ],
        },
    ]

    return <Menu x={menu.x} y={menu.y} items={items} onClose={onClose} />
}
