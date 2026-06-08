import { describe, it, expect } from 'vitest'
import { Room } from './room.js'
import { serializeFor } from './view.js'

function freshRoom() {
    const room = new Room('TEST1', { decks: 1, jokers: 0 })
    const alice = room.addPlayer('Alice')
    const bob = room.addPlayer('Bob')
    return { room, alice, bob }
}

describe('serializeFor — visibility filter', () => {
    it('never reveals rank/suit of face-down table cards', () => {
        const { room, alice } = freshRoom()
        const snap = serializeFor(room, alice.id)
        const deck = snap.piles[0]
        expect(deck.count).toBe(52)
        for (const card of deck.cards) {
            expect(card.faceUp).toBe(false)
            expect(card.rank).toBeUndefined()
            expect(card.suit).toBeUndefined()
        }
    })

    it('reveals rank/suit once a table card is flipped face up', () => {
        const { room, alice } = freshRoom()
        const pileId = [...room.piles.keys()][0]
        room.flip(pileId, 'top')
        const top = serializeFor(room, alice.id).piles[0].cards.at(-1)
        expect(top.faceUp).toBe(true)
        expect(top.rank).toBeDefined()
        expect(top.suit).toBeDefined()
    })

    it('shows a player their own hand faces but only counts for others', () => {
        const { room, alice, bob } = freshRoom()
        room.takeSeat(alice.id, 0)
        room.takeSeat(bob.id, 1)
        const pileId = [...room.piles.keys()][0]
        room.deal(pileId, 3, alice.id) // deals to Bob then Alice, round-robin

        const aliceView = serializeFor(room, alice.id)
        expect(aliceView.hand.length).toBeGreaterThan(0)
        expect(aliceView.hand.every((c) => c.rank !== undefined)).toBe(true)
        // Cards in hand always face their owner, even though deal puts them face down.
        expect(aliceView.hand.every((c) => c.faceUp === true)).toBe(true)

        // Alice cannot see Bob's hand contents — only a count.
        const bobAsSeenByAlice = aliceView.players.find((p) => p.id === bob.id)
        expect(bobAsSeenByAlice.handCount).toBeGreaterThan(0)
        expect(aliceView).not.toHaveProperty('hands') // no raw hands map leaks
    })
})
