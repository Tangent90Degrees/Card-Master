import Menu from './Menu.jsx'

/** Right-click menu for a pile, grouped into flip / shuffle / separate / draw. */
export default function ContextMenu({ menu, actions, onClose }) {
    const multi = menu.count > 1
    const id = menu.pileId

    // --- separate ---
    const separateTop = () => actions.split(id, 1, menu.pileX + 90, menu.pileY)
    const separateAll = () => {
        const SX = 84
        const margin = 24
        const cols = Math.max(1, Math.floor((menu.tableW - margin * 2) / SX))
        actions.spread(id, margin, margin, cols)
    }
    const separateCustom = () => {
        const n = Number(window.prompt('Separate how many cards from the top?', '1'))
        if (n > 0) actions.split(id, n, menu.pileX + 90, menu.pileY)
    }

    // --- draw ---
    const drawToAll = () => {
        const n = Number(window.prompt('Deal how many cards to each player?', '5'))
        if (n > 0) actions.deal(id, n)
    }

    const items = [
        multi
            ? {
                  label: 'Flip',
                  items: [
                      { label: 'Top card', onClick: () => actions.flip(id, 'top') },
                      { label: 'Whole pile', onClick: () => actions.flip(id, 'all') },
                  ],
              }
            : { label: 'Flip', onClick: () => actions.flip(id, 'top') },
        multi && { label: 'Shuffle', onClick: () => actions.shuffle(id) },
        multi && {
            label: 'Separate',
            items: [
                { label: 'Top card', onClick: separateTop },
                { label: 'All cards', onClick: separateAll },
                { label: 'Custom number…', onClick: separateCustom },
            ],
        },
        { separator: true },
        {
            label: 'Draw',
            items: [
                { label: 'To my hand', onClick: () => actions.pickup(id, 1) },
                { label: 'To all players…', onClick: drawToAll },
            ],
        },
    ]

    return <Menu x={menu.x} y={menu.y} items={items} onClose={onClose} />
}
