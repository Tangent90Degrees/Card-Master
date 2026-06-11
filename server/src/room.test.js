import { describe, it, expect } from 'vitest'
import { Room } from './room.js'

function roomWithHand(cardSpecs) {
    const room = new Room('TEST2', { decks: 1, jokers: 1 })
    const p = room.addPlayer('Alice')
    // Pick specific cards out of the deck and put them in the player's hand.
    const ids = cardSpecs.map(([rank, suit]) => {
        const card = [...room.cards.values()].find((c) => c.rank === rank && c.suit === suit)
        return card.id
    })
    room.hands.set(p.id, ids)
    return { room, playerId: p.id }
}

const labels = (room, playerId) =>
    room.hands.get(playerId).map((id) => {
        const c = room.cards.get(id)
        return c.rank === 'JOKER' ? 'JK' : `${c.rank}${c.suit}`
    })

describe('sortHand', () => {
    it('sorts by rank highest-first (then suit), jokers leftmost', () => {
        const { room, playerId } = roomWithHand([
            ['K', 'C'],
            ['A', 'H'],
            ['JOKER', null],
            ['2', 'S'],
            ['A', 'S'],
        ])
        room.sortHand(playerId, 'rank')
        // rank high→low: Joker, A, K … 2; ties broken by suit S, H, D, C
        expect(labels(room, playerId)).toEqual(['JK', 'AS', 'AH', 'KC', '2S'])
    })

    it('sorts by suit (then rank highest-first), jokers leftmost', () => {
        const { room, playerId } = roomWithHand([
            ['2', 'H'],
            ['K', 'S'],
            ['JOKER', null],
            ['A', 'S'],
            ['5', 'H'],
        ])
        room.sortHand(playerId, 'suit')
        // jokers first, then suit S, H, D, C; within a suit rank high→low
        expect(labels(room, playerId)).toEqual(['JK', 'AS', 'KS', '5H', '2H'])
    })

    it('is a no-op for fewer than two cards', () => {
        const { room, playerId } = roomWithHand([['A', 'S']])
        expect(room.sortHand(playerId, 'rank')).toBe(false)
    })
})

describe('spreadAll', () => {
    it('explodes a pile into one single-card pile per card, in a grid', () => {
        const room = new Room('TEST3', { decks: 1, jokers: 0 })
        const deckId = [...room.piles.keys()][0]
        const total = room.cards.size // 52

        expect(room.spreadAll(deckId, 24, 24, 13)).toBe(true)
        expect(room.piles.size).toBe(total) // one pile per card
        expect(room.piles.has(deckId)).toBe(false) // original pile removed
        expect([...room.piles.values()].every((p) => p.cardIds.length === 1)).toBe(true)

        // Grid layout: 13 columns → second row starts under the first column.
        const positions = [...room.piles.values()].map((p) => `${p.x},${p.y}`)
        expect(positions).toContain('24,24') // first card
        expect(positions).toContain('1032,24') // 13th card (col 12): 24 + 12*84
        expect(positions).toContain('24,136') // 14th card wraps to row 2: 24 + 112
    })

    it('is a no-op for a pile with fewer than two cards', () => {
        const room = new Room('TEST4', { decks: 1, jokers: 0 })
        const deckId = [...room.piles.keys()][0]
        room.split(deckId, 51, 100, 100) // leave 1 card in the original pile
        expect(room.spreadAll(deckId, 0, 0, 5)).toBe(false)
    })
})

describe('collectTable', () => {
    it('gathers every table card into one face-down pile at (x, y)', () => {
        const room = new Room('T5', { decks: 1, jokers: 0 })
        const deckId = [...room.piles.keys()][0]
        room.spreadAll(deckId, 0, 0, 13) // explode into 52 single piles
        expect(room.piles.size).toBe(52)

        expect(room.collectTable(100, 100)).toBe(true)
        expect(room.piles.size).toBe(1)
        const pile = [...room.piles.values()][0]
        expect(pile.cardIds).toHaveLength(52)
        expect(pile.cardIds.every((id) => room.cards.get(id).faceUp === false)).toBe(true)
        expect(`${pile.x},${pile.y}`).toBe('100,100')
    })

    it("leaves players' hands untouched", () => {
        const room = new Room('T6', { decks: 1, jokers: 0 })
        const p = room.addPlayer('A')
        room.takeSeat(p.id, 0)
        const deckId = [...room.piles.keys()][0]
        room.drawToHand(p.id, deckId, 3) // 3 to hand, 49 left on table

        room.collectTable()
        expect(room.hands.get(p.id)).toHaveLength(3)
        expect([...room.piles.values()][0].cardIds).toHaveLength(49)
    })

    it('is a no-op when the table is empty', () => {
        const room = new Room('T7', { decks: 1, jokers: 0 })
        const p = room.addPlayer('A')
        room.takeSeat(p.id, 0)
        const deckId = [...room.piles.keys()][0]
        room.drawToHand(p.id, deckId, 52) // whole deck to hand, table now empty
        expect(room.piles.size).toBe(0)
        expect(room.collectTable()).toBe(false)
    })
})

describe('playOnPile', () => {
    it('adds a hand card onto an existing pile, face-up', () => {
        const room = new Room('POP1', { decks: 1, jokers: 0 })
        const p = room.addPlayer('A')
        room.takeSeat(p.id, 0)
        const deckId = [...room.piles.keys()][0]
        room.drawToHand(p.id, deckId, 1)
        const cardId = room.hands.get(p.id)[0]
        const dest = room.addPile(300, 300, [])

        expect(room.playOnPile(p.id, cardId, dest.id, true)).toBe(true)
        expect(room.hands.get(p.id)).toHaveLength(0)
        expect(room.piles.get(dest.id).cardIds).toEqual([cardId])
        expect(room.cards.get(cardId).faceUp).toBe(true)
    })

    it('is rejected for a card not in the player hand', () => {
        const room = new Room('POP2', { decks: 1, jokers: 0 })
        const p = room.addPlayer('A')
        room.takeSeat(p.id, 0)
        const dest = room.addPile(300, 300, [])
        expect(room.playOnPile(p.id, 'nope', dest.id)).toBe(false)
    })

    it('is rejected for a spectator', () => {
        const room = new Room('POP3', { decks: 1, jokers: 0 })
        const p = room.addPlayer('A') // never seated
        const dest = room.addPile(300, 300, [])
        expect(room.playOnPile(p.id, 'x', dest.id)).toBe(false)
    })
})

describe('piece batch moves (group drag)', () => {
    // A room with a deck, a zone holding 3 single-card items, and a couple of
    // loose table piles — enough to mix piles and zone items in one selection.
    function setup() {
        const room = new Room('PC1', { decks: 1, jokers: 0 })
        const p = room.addPlayer('A')
        room.takeSeat(p.id, 0)
        const deckId = [...room.piles.keys()][0]
        const a = room.split(deckId, 1, 100, 100) && [...room.piles.values()].at(-1)
        const b = room.split(deckId, 1, 200, 100) && [...room.piles.values()].at(-1)
        const zone = room.createZone(300, 300)
        room.pileToZone(b.id, zone.id, 0) // b becomes a zone item
        const item = zone.items[0]
        return { room, p, deckId, a, zone, item }
    }

    it('piecesToZone moves a pile and leaves an in-zone item untouched', () => {
        const { room, a, zone, item } = setup()
        const ok = room.piecesToZone([a.id, item.id], zone.id, zone.items.length)
        expect(ok).toBe(true)
        expect(room.piles.has(a.id)).toBe(false) // pile became an item
        expect(zone.items.some((it) => it.id === item.id)).toBe(true) // still present, once
        expect(zone.items.filter((it) => it.id === item.id)).toHaveLength(1)
        expect(zone.items).toHaveLength(2)
    })

    it('piecesToHand pulls both a pile and a zone item into the hand', () => {
        const { room, p, a, item } = setup()
        const before = room.hands.get(p.id).length
        expect(room.piecesToHand(p.id, [a.id, item.id])).toBe(true)
        expect(room.hands.get(p.id)).toHaveLength(before + 2)
        expect(room.piles.has(a.id)).toBe(false)
    })

    it('flipPieces flips the top card of both a pile and a zone item at once', () => {
        const { room, a, item } = setup()
        const pileTop = room.piles.get(a.id).cardIds.at(-1)
        const itemTop = item.cardIds.at(-1)
        const before = {
            pile: room.cards.get(pileTop).faceUp,
            item: room.cards.get(itemTop).faceUp,
        }
        expect(room.flipPieces([a.id, item.id], 'top')).toBe(true)
        expect(room.cards.get(pileTop).faceUp).toBe(!before.pile)
        expect(room.cards.get(itemTop).faceUp).toBe(!before.item)
    })

    it('piecesToTable repositions a pile and lifts a zone item onto the table', () => {
        const { room, a, zone, item } = setup()
        const ok = room.piecesToTable([a.id, item.id], {
            [a.id]: { x: 400, y: 400 },
            [item.id]: { x: 500, y: 500 },
        })
        expect(ok).toBe(true)
        expect(`${room.piles.get(a.id).x},${room.piles.get(a.id).y}`).toBe('400,400')
        expect(zone.items).toHaveLength(0)
        const lifted = [...room.piles.values()].find((pl) => `${pl.x},${pl.y}` === '500,500')
        expect(lifted).toBeTruthy()
    })
})

describe('top-card pile drag', () => {
    it('moveTopToPile moves only the top card onto another pile', () => {
        const room = new Room('TP1', { decks: 1, jokers: 0 })
        const deckId = [...room.piles.keys()][0]
        const dest = room.addPile(300, 300, [])
        const topBefore = room.piles.get(deckId).cardIds.at(-1)

        expect(room.moveTopToPile(deckId, dest.id)).toBe(true)
        expect(room.piles.get(deckId).cardIds).toHaveLength(51)
        expect(room.piles.get(dest.id).cardIds).toEqual([topBefore])
    })

    it('moveTopToPile drops the source pile when it empties', () => {
        const room = new Room('TP2', { decks: 1, jokers: 0 })
        const deckId = [...room.piles.keys()][0]
        room.split(deckId, 51, 100, 100) // leave 1 card in the original pile
        const dest = room.addPile(300, 300, [])
        expect(room.moveTopToPile(deckId, dest.id)).toBe(true)
        expect(room.piles.has(deckId)).toBe(false)
        expect(room.piles.get(dest.id).cardIds).toHaveLength(1)
    })

    it('pileTopToZone moves the top card into a zone as a single-card item', () => {
        const room = new Room('TP3', { decks: 1, jokers: 0 })
        const deckId = [...room.piles.keys()][0]
        const zone = room.createZone(40, 40)
        const topBefore = room.piles.get(deckId).cardIds.at(-1)

        expect(room.pileTopToZone(deckId, zone.id, 0)).toBe(true)
        expect(room.piles.get(deckId).cardIds).toHaveLength(51)
        expect(zone.items).toHaveLength(1)
        expect(zone.items[0].cardIds).toEqual([topBefore])
    })
})

describe('batch selection operations', () => {
    // Explode the seed deck into single-card piles to get many piles to select.
    function spread(room) {
        const deckId = [...room.piles.keys()][0]
        room.spreadAll(deckId, 0, 0, 13)
        return [...room.piles.keys()]
    }

    it('moveMany repositions every listed pile', () => {
        const room = new Room('B1', { decks: 1, jokers: 0 })
        const ids = spread(room)
        const moves = ids.slice(0, 3).map((pileId, i) => ({ pileId, x: 200 + i, y: 300 + i }))
        expect(room.moveMany(moves)).toBe(true)
        for (const m of moves) {
            const p = room.piles.get(m.pileId)
            expect(`${p.x},${p.y}`).toBe(`${m.x},${m.y}`)
        }
    })

    it('flipMany flips the top card of each listed pile', () => {
        const room = new Room('B2', { decks: 1, jokers: 0 })
        const ids = spread(room) // single cards, all face-down from the seed
        const picked = ids.slice(0, 4)
        expect(room.flipMany(picked, 'top')).toBe(true)
        expect(picked.every((id) => room.cards.get(room.piles.get(id).cardIds[0]).faceUp)).toBe(
            true,
        )
    })

    it('gatherPiles stacks the listed piles into one and removes the originals', () => {
        const room = new Room('B3', { decks: 1, jokers: 0 })
        const ids = spread(room)
        const picked = ids.slice(0, 5)
        expect(room.gatherPiles(picked, 150, 160)).toBe(true)
        expect(picked.every((id) => !room.piles.has(id))).toBe(true)
        const gathered = [...room.piles.values()].find((p) => `${p.x},${p.y}` === '150,160')
        expect(gathered.cardIds).toHaveLength(5)
        expect(room.piles.size).toBe(52 - 5 + 1)
    })

    it('collectPilesToHand moves listed piles into a seated player hand', () => {
        const room = new Room('B4', { decks: 1, jokers: 0 })
        const p = room.addPlayer('A')
        room.takeSeat(p.id, 0)
        const ids = spread(room)
        const picked = ids.slice(0, 6)
        expect(room.collectPilesToHand(p.id, picked)).toBe(true)
        expect(room.hands.get(p.id)).toHaveLength(6)
        expect(picked.every((id) => !room.piles.has(id))).toBe(true)
    })

    it('collectPilesToHand is rejected for a spectator', () => {
        const room = new Room('B5', { decks: 1, jokers: 0 })
        const p = room.addPlayer('A') // never seated
        const ids = spread(room)
        expect(room.collectPilesToHand(p.id, ids.slice(0, 2))).toBe(false)
    })
})

describe('player boards (play areas)', () => {
    function room1() {
        const room = new Room('BRD1', { decks: 1, jokers: 0 })
        const a = room.addPlayer('A')
        return { room, a }
    }

    it('every seat has a play area that exists regardless of occupancy', () => {
        const { room } = room1() // nobody seated yet
        for (let i = 0; i < room.seats; i++) {
            const board = room.findBoard(i)
            expect(board).toBeTruthy()
            expect(board.seat).toBe(i)
        }
    })

    it('boards are anchored — they can not be moved, renamed or removed', () => {
        const { room } = room1()
        const board = room.findBoard(0)
        expect(room.moveZone(board.id, 10, 10)).toBe(false)
        expect(room.renameZone(board.id, 'x')).toBe(false)
        expect(room.removeZone(board.id, {})).toBe(false)
    })

    it('a seat keeps its cards when its player stands up', () => {
        const { room, a } = room1()
        room.takeSeat(a.id, 0)
        const board = room.findBoard(0)
        const deckId = [...room.piles.keys()][0]
        const top = room.split(deckId, 2, 50, 50) && [...room.piles.values()].at(-1)
        room.pileToZone(top.id, board.id, 0)
        expect(board.items).toHaveLength(1)
        const pilesBefore = room.piles.size

        room.leaveSeat(a.id)
        // The board (and its cards) stay put — nothing spills onto the table.
        expect(room.findBoard(0)).toBe(board)
        expect(board.items).toHaveLength(1)
        expect(room.piles.size).toBe(pilesBefore)
    })

    it('changing seats leaves the original seat’s cards behind', () => {
        const { room, a } = room1()
        room.takeSeat(a.id, 0)
        const board0 = room.findBoard(0)
        const deckId = [...room.piles.keys()][0]
        const top = room.split(deckId, 1, 60, 60) && [...room.piles.values()].at(-1)
        room.pileToZone(top.id, board0.id, 0)

        room.takeSeat(a.id, 1) // move to seat 1
        expect(a.seat).toBe(1)
        expect(room.findBoard(0).items).toHaveLength(1) // seat 0 keeps the card
        expect(room.findBoard(1).items).toHaveLength(0) // seat 1 is its own empty area
    })

    it('shrinking the seats dissolves removed seats’ areas onto the table', () => {
        const { room, a } = room1()
        room.takeSeat(a.id, 3)
        const board3 = room.findBoard(3)
        const deckId = [...room.piles.keys()][0]
        const card = room.split(deckId, 1, 70, 70) && [...room.piles.values()].at(-1)
        room.pileToZone(card.id, board3.id, 0)
        const pilesBefore = room.piles.size

        room.setSeats(2)
        expect(room.findBoard(3)).toBe(null) // seat 3 is gone
        expect(room.piles.size).toBe(pilesBefore + 1) // its card spilled to the table
    })

    it('reset clears boards but keeps one empty area per seat', () => {
        const { room, a } = room1()
        room.takeSeat(a.id, 0)
        const board = room.findBoard(0)
        const deckId = [...room.piles.keys()][0]
        const top = room.split(deckId, 1, 60, 60) && [...room.piles.values()].at(-1)
        room.pileToZone(top.id, board.id, 0)
        expect(room.findBoard(0).items).toHaveLength(1)

        room.reset()
        for (let i = 0; i < room.seats; i++) {
            const fresh = room.findBoard(i)
            expect(fresh).toBeTruthy()
            expect(fresh.items).toHaveLength(0)
        }
    })
})

describe('seating', () => {
    function room2() {
        const room = new Room('SEAT1', { decks: 1, jokers: 0 })
        return { room, a: room.addPlayer('A'), b: room.addPlayer('B') }
    }

    it('players join as spectators', () => {
        const { a } = room2()
        expect(a.seat).toBe(null)
    })

    it('lets a spectator take an empty seat but not an occupied one', () => {
        const { room, a, b } = room2()
        expect(room.takeSeat(a.id, 0)).toBe(true)
        expect(a.seat).toBe(0)
        expect(room.takeSeat(b.id, 0)).toBe(false) // taken
        expect(room.takeSeat(b.id, 9)).toBe(false) // out of range (default 4 seats)
        expect(room.takeSeat(b.id, 1)).toBe(true)
    })

    it('returns the hand to the table when standing up', () => {
        const { room, a } = room2()
        room.takeSeat(a.id, 0)
        const deckId = [...room.piles.keys()][0]
        room.drawToHand(a.id, deckId, 5)
        expect(room.hands.get(a.id)).toHaveLength(5)
        expect(room.leaveSeat(a.id)).toBe(true)
        expect(a.seat).toBe(null)
        expect(room.hands.get(a.id)).toHaveLength(0)
        // the 5 cards came back to a new pile on the table
        expect([...room.piles.values()].some((p) => p.cardIds.length === 5)).toBe(true)
    })

    it('bumps players out of removed seats when seats shrink', () => {
        const { room, a, b } = room2()
        room.takeSeat(a.id, 0)
        room.takeSeat(b.id, 3)
        room.setSeats(2)
        expect(room.seats).toBe(2)
        expect(a.seat).toBe(0) // still in range
        expect(b.seat).toBe(null) // seat 3 removed → spectator
    })

    it('only deals to seated players', () => {
        const { room, a, b } = room2()
        room.takeSeat(a.id, 0) // b stays a spectator
        const deckId = [...room.piles.keys()][0]
        room.deal(deckId, 3, a.id)
        expect(room.hands.get(a.id)).toHaveLength(3)
        expect(room.hands.get(b.id)).toHaveLength(0)
    })
})

describe('shuffleHand', () => {
    it('keeps exactly the same cards', () => {
        const { room, playerId } = roomWithHand([
            ['A', 'S'],
            ['2', 'S'],
            ['3', 'S'],
            ['4', 'S'],
            ['5', 'S'],
        ])
        const before = [...room.hands.get(playerId)].sort()
        expect(room.shuffleHand(playerId)).toBe(true)
        const after = [...room.hands.get(playerId)].sort()
        expect(after).toEqual(before)
    })
})

describe('zones', () => {
    function freshDeckRoom() {
        const room = new Room('ZONE1', { decks: 1, jokers: 0 })
        const deckId = [...room.piles.keys()][0]
        return { room, deckId }
    }

    it('drops a pile in as a single item (not exploded into cards)', () => {
        const { room, deckId } = freshDeckRoom()
        const zone = room.createZone(100, 100)
        room.split(deckId, 5, 300, 300) // a 5-card pile
        const pile5 = [...room.piles.values()].find((p) => p.cardIds.length === 5)

        expect(room.pileToZone(pile5.id, zone.id, 0)).toBe(true)
        const items = room.zones.get(zone.id).items
        expect(items).toHaveLength(1) // one item…
        expect(items[0].cardIds).toHaveLength(5) // …holding all 5 cards
        expect(room.piles.has(pile5.id)).toBe(false)
    })

    it('holds a mix of card- and pile-items and reorders/sorts/shuffles them', () => {
        const { room, deckId } = freshDeckRoom()
        const zone = room.createZone(0, 0)
        // a 3-card pile item, then three single-card items
        room.split(deckId, 3, 10, 10)
        const pile3 = [...room.piles.values()].find((p) => p.cardIds.length === 3)
        room.pileToZone(pile3.id, zone.id, 0)
        for (let i = 0; i < 3; i++) {
            room.split(deckId, 1, 20, 20)
            const single = [...room.piles.values()].find((p) => p.cardIds.length === 1)
            room.pileToZone(single.id, zone.id, 99) // append (clamped to end)
        }
        const items = room.zones.get(zone.id).items
        expect(items).toHaveLength(4)
        expect(items.map((it) => it.cardIds.length).sort()).toEqual([1, 1, 1, 3])

        const firstId = items[0].id
        expect(room.reorderZoneItem(zone.id, firstId, 2)).toBe(true)
        expect(room.findZoneItem(room.zones.get(zone.id), firstId)).toBe(2)

        expect(room.sortZone(zone.id, 'rank')).toBe(true)
        expect(room.shuffleZone(zone.id)).toBe(true)
        expect(room.zones.get(zone.id).items).toHaveLength(4) // nothing lost
    })

    it('configures layout (single row / grid)', () => {
        const { room } = freshDeckRoom()
        const zone = room.createZone(0, 0)
        expect(zone.layout).toBe('row')
        room.setZoneLayout(zone.id, 'grid', 5)
        expect(room.zones.get(zone.id).layout).toBe('grid')
        expect(room.zones.get(zone.id).perRow).toBe(5)
        room.setZoneLayout(zone.id, 'row')
        expect(room.zones.get(zone.id).layout).toBe('row')
    })

    it('moves an item out of a zone onto the table as a pile', () => {
        const { room, deckId } = freshDeckRoom()
        const zone = room.createZone(0, 0)
        room.split(deckId, 4, 10, 10)
        const pile4 = [...room.piles.values()].find((p) => p.cardIds.length === 4)
        room.pileToZone(pile4.id, zone.id, 0)
        const itemId = room.zones.get(zone.id).items[0].id

        expect(room.zoneItemToTable(zone.id, itemId, 400, 400)).toBe(true)
        expect(room.zones.get(zone.id).items).toHaveLength(0)
        expect([...room.piles.values()].some((p) => p.cardIds.length === 4)).toBe(true)
    })

    it('removing a zone leaves each item as its own pile at its position', () => {
        const { room, deckId } = freshDeckRoom()
        const zone = room.createZone(0, 0)
        // two items: a 3-card pile and a single card
        room.split(deckId, 3, 10, 10)
        const p3 = [...room.piles.values()].find((p) => p.cardIds.length === 3)
        room.pileToZone(p3.id, zone.id, 0)
        room.split(deckId, 1, 20, 20)
        const p1 = [...room.piles.values()].find((p) => p.cardIds.length === 1)
        room.pileToZone(p1.id, zone.id, 1)
        const [a, b] = room.zones.get(zone.id).items
        const pilesBefore = room.piles.size

        const positions = { [a.id]: { x: 200, y: 150 }, [b.id]: { x: 280, y: 150 } }
        expect(room.removeZone(zone.id, positions)).toBe(true)
        expect(room.zones.has(zone.id)).toBe(false)
        // two separate piles (not merged), each at its given position
        expect(room.piles.size).toBe(pilesBefore + 2)
        const newPiles = [...room.piles.values()]
        expect(newPiles.some((p) => p.cardIds.length === 3 && p.x === 200 && p.y === 150)).toBe(
            true,
        )
        expect(newPiles.some((p) => p.cardIds.length === 1 && p.x === 280 && p.y === 150)).toBe(
            true,
        )
    })

    it('plays a hand card into a zone as a new item (seated only)', () => {
        const { room, deckId } = freshDeckRoom()
        const p = room.addPlayer('A')
        const zone = room.createZone(0, 0)
        room.takeSeat(p.id, 0)
        room.drawToHand(p.id, deckId, 3)
        const cardId = room.hands.get(p.id)[0]

        expect(room.handCardToZone(p.id, cardId, zone.id, 0)).toBe(true)
        expect(room.hands.get(p.id)).toHaveLength(2)
        expect(room.zones.get(zone.id).items).toHaveLength(1)
        expect(room.zones.get(zone.id).items[0].cardIds).toEqual([cardId])
    })

    it('separates an item within the zone (split stays in the zone)', () => {
        const { room, deckId } = freshDeckRoom()
        const zone = room.createZone(0, 0)
        room.split(deckId, 5, 10, 10)
        const pile5 = [...room.piles.values()].find((p) => p.cardIds.length === 5)
        room.pileToZone(pile5.id, zone.id, 0)
        const itemId = room.zones.get(zone.id).items[0].id
        const pilesBefore = room.piles.size

        expect(room.splitZoneItem(zone.id, itemId, 2)).toBe(true)
        const items = room.zones.get(zone.id).items
        expect(items).toHaveLength(2) // a new item appeared in the zone…
        expect(items.map((it) => it.cardIds.length)).toEqual([3, 2]) // 5 → 3 + 2
        expect(room.piles.size).toBe(pilesBefore) // …and nothing landed on the table

        expect(room.spreadZoneItem(zone.id, items[0].id)).toBe(true) // explode the 3 into singles
        expect(room.zones.get(zone.id).items).toHaveLength(4) // 3 singles + the 2-item
        expect(room.piles.size).toBe(pilesBefore)
    })

    it('moves a zone item into a seated player hand (not a spectator)', () => {
        const { room, deckId } = freshDeckRoom()
        const p = room.addPlayer('A')
        const zone = room.createZone(0, 0)
        room.split(deckId, 2, 10, 10)
        const pile2 = [...room.piles.values()].find((pp) => pp.cardIds.length === 2)
        room.pileToZone(pile2.id, zone.id, 0)
        const itemId = room.zones.get(zone.id).items[0].id

        expect(room.zoneItemToHand(zone.id, itemId, p.id)).toBe(false) // spectator → blocked
        room.takeSeat(p.id, 0)
        expect(room.zoneItemToHand(zone.id, itemId, p.id)).toBe(true)
        expect(room.hands.get(p.id)).toHaveLength(2) // both cards picked up
        expect(room.zones.get(zone.id).items).toHaveLength(0)
    })
})
