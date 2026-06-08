import Menu from './Menu.jsx'

/** Right-click menu for a marquee selection of table piles and/or zone cards. */
export default function SelectionMenu({ menu, actions, onClear, onClose }) {
    const ids = menu.ids // every selected piece (piles + zone items)
    const pileIds = menu.pileIds // table-pile subset
    const canGather = pileIds.length > 1

    const items = [
        {
            label: 'Flip',
            items: [
                { label: 'Top cards', onClick: () => actions.flipPieces(ids, 'top') },
                { label: 'Whole piles', onClick: () => actions.flipPieces(ids, 'all') },
            ],
        },
        canGather && { separator: true },
        canGather && {
            label: 'Gather into one deck',
            onClick: () => actions.gather(pileIds, menu.gatherX, menu.gatherY),
        },
        { separator: true },
        { label: 'Collect to my hand', onClick: () => actions.piecesToHand(ids) },
        { separator: true },
        { label: 'Deselect', onClick: onClear },
    ]

    return (
        <Menu
            x={menu.x}
            y={menu.y}
            title={`${ids.length} selected`}
            items={items}
            onClose={onClose}
        />
    )
}
