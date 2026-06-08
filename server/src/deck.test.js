import { describe, it, expect } from 'vitest'
import { buildDeck, deckSize, normalizeConfig } from './deck.js'

describe('buildDeck', () => {
    it('builds a standard 52-card deck by default', () => {
        const cards = buildDeck()
        expect(cards).toHaveLength(52)
        expect(cards.filter((c) => c.rank === 'JOKER')).toHaveLength(0)
        expect(cards.every((c) => c.faceUp === false)).toBe(true)
        expect(new Set(cards.map((c) => c.id)).size).toBe(52) // unique ids
    })

    it('adds jokers per deck', () => {
        expect(buildDeck({ decks: 1, jokers: 2 })).toHaveLength(54)
        expect(buildDeck({ decks: 1, jokers: 2 }).filter((c) => c.rank === 'JOKER')).toHaveLength(2)
    })

    it('makes one colored joker and one monochrome joker', () => {
        const jokers = buildDeck({ decks: 1, jokers: 2 }).filter((c) => c.rank === 'JOKER')
        expect(jokers.map((j) => j.variant)).toEqual(['color', 'mono'])
    })

    it('supports multiple decks', () => {
        const cards = buildDeck({ decks: 2, jokers: 1 })
        expect(cards).toHaveLength(2 * 53)
        expect(new Set(cards.map((c) => c.deckTag))).toEqual(new Set([0, 1]))
    })

    it('clamps out-of-range config', () => {
        expect(normalizeConfig({ decks: 99, jokers: -3 })).toEqual({ decks: 8, jokers: 0 })
        expect(deckSize({ decks: 0, jokers: 0 })).toBe(52) // decks clamps up to 1
    })
})
