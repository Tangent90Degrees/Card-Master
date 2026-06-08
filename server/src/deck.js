import { nanoid } from 'nanoid'

export const SUITS = ['S', 'H', 'D', 'C'] // Spades, Hearts, Diamonds, Clubs
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export const DEFAULT_CONFIG = { decks: 1, jokers: 0 }

/**
 * Normalize/validate a deck configuration coming from a client.
 *   decks:  how many full 52-card decks to include (1-8)
 *   jokers: how many jokers to add *per deck* (0-4)
 */
export function normalizeConfig(config = {}) {
    const decks = clamp(Math.floor(Number(config.decks ?? DEFAULT_CONFIG.decks)), 1, 8)
    const jokers = clamp(Math.floor(Number(config.jokers ?? DEFAULT_CONFIG.jokers)), 0, 4)
    return { decks, jokers }
}

function clamp(n, min, max) {
    if (Number.isNaN(n)) return min
    return Math.min(max, Math.max(min, n))
}

/**
 * Build a flat array of card objects for the given config.
 * Each card starts face down. `deckTag` lets us tell duplicate cards apart
 * when multiple decks are in play.
 */
export function buildDeck(config = DEFAULT_CONFIG) {
    const { decks, jokers } = normalizeConfig(config)
    const cards = []

    for (let d = 0; d < decks; d++) {
        for (const suit of SUITS) {
            for (const rank of RANKS) {
                cards.push({ id: nanoid(10), deckTag: d, rank, suit, faceUp: false })
            }
        }
        for (let j = 0; j < jokers; j++) {
            // Alternate the classic colored joker with the monochrome (gray) one.
            const variant = j % 2 === 0 ? 'color' : 'mono'
            cards.push({
                id: nanoid(10),
                deckTag: d,
                rank: 'JOKER',
                suit: null,
                variant,
                faceUp: false,
            })
        }
    }

    return cards
}

/** Total number of cards a config produces (handy for tests/UI). */
export function deckSize(config = DEFAULT_CONFIG) {
    const { decks, jokers } = normalizeConfig(config)
    return decks * (52 + jokers)
}
