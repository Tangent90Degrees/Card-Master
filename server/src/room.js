import { nanoid } from 'nanoid'
import { buildDeck, normalizeConfig, SUITS } from './deck.js'

// Rank strength for sorting a hand, highest first (Aces high, then K…2).
const RANK_ORDER = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2']

// Card comparator (highest first); jokers rank above Aces, colored before mono.
const rankIdx = (c) => (c.rank === 'JOKER' ? -1 : RANK_ORDER.indexOf(c.rank))
const suitIdx = (c) => (c.suit === null ? -1 : SUITS.indexOf(c.suit))
const jokerIdx = (c) => (c.rank === 'JOKER' && c.variant === 'mono' ? 1 : 0)
function cardCmp(a, b, by = 'rank') {
    return by === 'suit'
        ? suitIdx(a) - suitIdx(b) || rankIdx(a) - rankIdx(b) || jokerIdx(a) - jokerIdx(b)
        : rankIdx(a) - rankIdx(b) || suitIdx(a) - suitIdx(b) || jokerIdx(a) - jokerIdx(b)
}

const PLAYER_COLORS = [
    '#e6194B',
    '#3cb44b',
    '#4363d8',
    '#f58231',
    '#911eb4',
    '#42d4f4',
    '#f032e6',
    '#bfef45',
]

/**
 * Authoritative, in-memory state for a single game room.
 *
 * Everything on the table is a `pile` (an ordered stack of card ids, bottom..top).
 * A loose card is a pile of length 1; a deck is a big pile. Hands are private,
 * per-player ordered lists of card ids.
 *
 * All mutating methods return `true` on success and `false` when the action is
 * illegal/invalid, so the socket layer can stay dumb.
 */
export class Room {
    constructor(code, config) {
        this.code = code
        this.config = normalizeConfig(config)

        this.cards = new Map() // cardId -> card { id, deckTag, rank, suit, faceUp }
        this.piles = new Map() // pileId -> { id, x, y, cardIds: [] }
        this.zones = new Map() // zoneId -> { id, x, y, name, cardIds: [] }
        this.hands = new Map() // playerId -> [cardId, ...]
        this.players = [] // [{ id, name, connected, color, seat }]
        this.seats = 4 // number of playable seats; the rest are spectators

        this.seed()
    }

    /** Reset the table to a single face-down deck in the middle. */
    seed() {
        this.cards.clear()
        this.piles.clear()
        this.zones.clear()
        for (const card of buildDeck(this.config)) this.cards.set(card.id, card)
        this.addPile(560, 280, [...this.cards.keys()])
    }

    // ---- players ---------------------------------------------------------

    addPlayer(name) {
        const id = nanoid(8)
        const color = PLAYER_COLORS[this.players.length % PLAYER_COLORS.length]
        // New players join as spectators (seat === null) and pick a seat to play.
        const player = {
            id,
            name: String(name || 'Player').slice(0, 24),
            connected: true,
            color,
            seat: null,
        }
        this.players.push(player)
        this.hands.set(id, [])
        return player
    }

    getPlayer(playerId) {
        return this.players.find((p) => p.id === playerId)
    }

    isSeated(playerId) {
        const p = this.getPlayer(playerId)
        return !!p && p.seat !== null && p.seat !== undefined
    }

    setConnected(playerId, connected) {
        const p = this.getPlayer(playerId)
        if (p) p.connected = connected
    }

    /** Move a player's hand back to the table as a face-down pile (e.g. on stand-up). */
    returnHandToTable(playerId) {
        const hand = this.hands.get(playerId) || []
        if (hand.length) {
            for (const cardId of hand) {
                const c = this.cards.get(cardId)
                if (c) c.faceUp = false
            }
            this.addPile(120, 120, hand)
        }
        this.hands.set(playerId, [])
    }

    /** Sit a spectator down in an empty seat. */
    takeSeat(playerId, seatIndex) {
        const p = this.getPlayer(playerId)
        const idx = Math.floor(Number(seatIndex))
        if (!p || !(idx >= 0 && idx < this.seats)) return false
        if (this.players.some((other) => other.seat === idx)) return false // seat taken
        p.seat = idx
        return true
    }

    /** Stand up — return to the spectator area and drop your hand on the table. */
    leaveSeat(playerId) {
        const p = this.getPlayer(playerId)
        if (!p || p.seat === null) return false
        p.seat = null
        this.returnHandToTable(playerId)
        return true
    }

    /** Change how many seats the room has; anyone in a removed seat is bumped to spectator. */
    setSeats(count) {
        this.seats = clampInt(count, 1, 8)
        for (const p of this.players) {
            if (p.seat !== null && p.seat >= this.seats) {
                p.seat = null
                this.returnHandToTable(p.id)
            }
        }
        return true
    }

    /** Remove a player and return their hand to the table as a face-down pile. */
    removePlayer(playerId) {
        const idx = this.players.findIndex((p) => p.id === playerId)
        if (idx === -1) return
        this.returnHandToTable(playerId)
        this.hands.delete(playerId)
        this.players.splice(idx, 1)
    }

    get isEmpty() {
        return this.players.length === 0
    }

    // ---- pile helpers ----------------------------------------------------

    addPile(x, y, cardIds = []) {
        const pile = { id: nanoid(8), x: clampCoord(x), y: clampCoord(y), cardIds }
        this.piles.set(pile.id, pile)
        return pile
    }

    dropIfEmpty(pileId) {
        const pile = this.piles.get(pileId)
        if (pile && pile.cardIds.length === 0) this.piles.delete(pileId)
    }

    // ---- table operations ------------------------------------------------

    move(pileId, x, y) {
        const pile = this.piles.get(pileId)
        if (!pile) return false
        pile.x = clampCoord(x)
        pile.y = clampCoord(y)
        return true
    }

    /** Flip the top card (mode 'top') or the whole pile (mode 'all'). */
    flip(pileId, mode = 'top') {
        const pile = this.piles.get(pileId)
        if (!pile || pile.cardIds.length === 0) return false

        if (mode === 'all') {
            const targetFaceUp = !this.cards.get(top(pile)).faceUp
            for (const id of pile.cardIds) this.cards.get(id).faceUp = targetFaceUp
            pile.cardIds.reverse() // flipping a stack inverts its order
        } else {
            const card = this.cards.get(top(pile))
            card.faceUp = !card.faceUp
        }
        return true
    }

    shuffle(pileId) {
        const pile = this.piles.get(pileId)
        if (!pile || pile.cardIds.length < 2) return false
        // Fisher-Yates
        const a = pile.cardIds
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[a[i], a[j]] = [a[j], a[i]]
        }
        return true
    }

    /** Peel the top `count` cards off a pile into a new pile at (x, y). */
    split(pileId, count, x, y) {
        const pile = this.piles.get(pileId)
        if (!pile) return false
        const n = clampInt(count, 1, pile.cardIds.length)
        if (n >= pile.cardIds.length) {
            // splitting the whole thing is just a move
            return this.move(pileId, x, y)
        }
        const moved = pile.cardIds.splice(pile.cardIds.length - n, n)
        this.addPile(x, y, moved)
        return true
    }

    /**
     * Explode a pile into individual single-card piles laid out in a grid that
     * starts at (x, y) and wraps after `columns` cards. Each card keeps its
     * current orientation. The original pile is removed.
     */
    spreadAll(pileId, x, y, columns) {
        const pile = this.piles.get(pileId)
        if (!pile || pile.cardIds.length < 2) return false
        const ids = [...pile.cardIds]
        const cols = columns > 0 ? clampInt(columns, 1, 30) : Math.min(13, ids.length)
        const SX = 84 // horizontal spacing (card width + gap)
        const SY = 112 // vertical spacing (card height + gap)
        const startX = clampCoord(x)
        const startY = clampCoord(y)

        this.piles.delete(pileId)
        ids.forEach((cardId, i) => {
            const col = i % cols
            const row = Math.floor(i / cols)
            this.addPile(startX + col * SX, startY + row * SY, [cardId])
        })
        return true
    }

    /** Drop `srcPileId` onto `destPileId` — src cards land on top of dest. */
    merge(srcPileId, destPileId) {
        if (srcPileId === destPileId) return false
        const src = this.piles.get(srcPileId)
        const dest = this.piles.get(destPileId)
        if (!src || !dest) return false
        dest.cardIds.push(...src.cardIds)
        this.piles.delete(srcPileId)
        return true
    }

    /** Move only the top card of `srcPileId` onto `destPileId`; drop src if emptied. */
    moveTopToPile(srcPileId, destPileId) {
        if (srcPileId === destPileId) return false
        const src = this.piles.get(srcPileId)
        const dest = this.piles.get(destPileId)
        if (!src || !dest || src.cardIds.length === 0) return false
        dest.cardIds.push(src.cardIds.pop())
        this.dropIfEmpty(srcPileId)
        return true
    }

    /** Move only the top card of a pile into a zone as a new single-card item. */
    pileTopToZone(pileId, zoneId, index) {
        const pile = this.piles.get(pileId)
        const zone = this.zones.get(zoneId)
        if (!pile || !zone || pile.cardIds.length === 0) return false
        const cardId = pile.cardIds.pop()
        zone.items.splice(clampInt(index, 0, zone.items.length), 0, {
            id: nanoid(8),
            cardIds: [cardId],
        })
        this.dropIfEmpty(pileId)
        return true
    }

    // ---- batch (marquee-selection) operations ----------------------------

    /** Reposition several piles at once: moves = [{ pileId, x, y }]. */
    moveMany(moves) {
        let any = false
        for (const m of moves || []) if (this.move(m.pileId, m.x, m.y)) any = true
        return any
    }

    /** Flip the top card ('top') or whole stack ('all') of each listed pile. */
    flipMany(pileIds, mode = 'top') {
        let any = false
        for (const id of pileIds || []) if (this.flip(id, mode)) any = true
        return any
    }

    /**
     * Gather the listed piles' cards into one pile at (x, y), stacked in listed
     * order (bottom→top). Card orientations are preserved; the originals are
     * removed.
     */
    gatherPiles(pileIds, x, y) {
        const ids = (pileIds || []).filter((id) => this.piles.has(id))
        if (ids.length === 0) return false
        const cardIds = []
        for (const id of ids) {
            cardIds.push(...this.piles.get(id).cardIds)
            this.piles.delete(id)
        }
        this.addPile(x, y, cardIds)
        return true
    }

    /**
     * Resolve a "piece" id to its current home — a table pile or a zone item —
     * so a heterogeneous selection can be moved in a single mutation.
     */
    findPiece(id) {
        if (this.piles.has(id)) return { kind: 'pile', pile: this.piles.get(id) }
        for (const zone of this.zones.values()) {
            const index = zone.items.findIndex((it) => it.id === id)
            if (index !== -1) return { kind: 'item', zone, item: zone.items[index], index }
        }
        return null
    }

    /**
     * Move a whole selection of pieces (table piles and/or zone items) into one
     * zone, each becoming an item — all in a single mutation so the client gets a
     * single snapshot (no mid-flight blink). Pieces already in the dest are left.
     */
    piecesToZone(ids, destZoneId, index) {
        const dest = this.zones.get(destZoneId)
        if (!dest) return false
        let at = clampInt(index, 0, dest.items.length)
        let any = false
        for (const id of ids || []) {
            const f = this.findPiece(id)
            if (!f) continue
            if (f.kind === 'pile') {
                dest.items.splice(at++, 0, { id: nanoid(8), cardIds: [...f.pile.cardIds] })
                this.piles.delete(id)
                any = true
            } else if (f.zone !== dest) {
                f.zone.items.splice(f.index, 1)
                dest.items.splice(at++, 0, f.item)
                any = true
            }
        }
        return any
    }

    /** Move a whole selection of pieces into a seated player's hand (one mutation). */
    piecesToHand(playerId, ids) {
        if (!this.isSeated(playerId)) return false
        const hand = this.hands.get(playerId)
        if (!hand) return false
        let any = false
        for (const id of ids || []) {
            const f = this.findPiece(id)
            if (!f) continue
            if (f.kind === 'pile') {
                hand.push(...f.pile.cardIds)
                this.piles.delete(id)
            } else {
                hand.push(...f.item.cardIds)
                f.zone.items.splice(f.index, 1)
            }
            any = true
        }
        return any
    }

    /**
     * Move a whole selection out onto the table (one mutation). `placements` maps
     * each piece id to its target { x, y }: table piles are repositioned, zone
     * items are lifted out into new piles there.
     */
    piecesToTable(ids, placements) {
        let any = false
        for (const id of ids || []) {
            const f = this.findPiece(id)
            const pos = placements && placements[id]
            if (!f || !pos) continue
            if (f.kind === 'pile') {
                f.pile.x = clampCoord(pos.x)
                f.pile.y = clampCoord(pos.y)
            } else {
                f.zone.items.splice(f.index, 1)
                this.addPile(pos.x, pos.y, f.item.cardIds)
            }
            any = true
        }
        return any
    }

    /**
     * Flip the top card ('top') or whole stack ('all') of each listed piece —
     * table piles and/or zone items — in a single mutation.
     */
    flipPieces(ids, mode = 'top') {
        let any = false
        for (const id of ids || []) {
            const f = this.findPiece(id)
            if (!f) continue
            const ok =
                f.kind === 'pile' ? this.flip(id, mode) : this.flipZoneItem(f.zone.id, id, mode)
            if (ok) any = true
        }
        return any
    }

    /** Move every card of the listed piles into a seated player's hand. */
    collectPilesToHand(playerId, pileIds) {
        if (!this.isSeated(playerId)) return false
        const hand = this.hands.get(playerId)
        if (!hand) return false
        let any = false
        for (const id of pileIds || []) {
            const pile = this.piles.get(id)
            if (!pile) continue
            hand.push(...pile.cardIds)
            this.piles.delete(id)
            any = true
        }
        return any
    }

    /**
     * Collect every card on the table into a single face-down pile at (x, y).
     * Players' hands are left untouched.
     */
    collectTable(x = 560, y = 280) {
        const all = []
        for (const pile of this.piles.values()) all.push(...pile.cardIds)
        if (all.length === 0) return false
        this.piles.clear()
        for (const id of all) {
            const c = this.cards.get(id)
            if (c) c.faceUp = false
        }
        this.addPile(x, y, all)
        return true
    }

    // ---- zone operations -------------------------------------------------
    // A zone is a labelled area on the table that works like an independent
    // sortable desktop. It holds an ordered list of ITEMS, where each item is a
    // mini-pile ({ id, cardIds }) — a single card is just an item of length 1.
    // Layout is 'row' (one auto-width row) or 'grid' (`perRow` items per row).

    createZone(x, y) {
        const zone = {
            id: nanoid(8),
            x: clampCoord(x),
            y: clampCoord(y),
            name: 'Zone',
            layout: 'row',
            perRow: 4,
            items: [], // [{ id, cardIds: [bottom..top] }]
        }
        this.zones.set(zone.id, zone)
        return zone
    }

    findZoneItem(zone, itemId) {
        return zone.items.findIndex((it) => it.id === itemId)
    }

    /**
     * Delete a zone. Each item is left on the table as its own pile — at the
     * position it occupied on screen if the client provided `positions`
     * ({ itemId: { x, y } }), otherwise at the zone's origin.
     */
    removeZone(zoneId, positions) {
        const zone = this.zones.get(zoneId)
        if (!zone) return false
        for (const item of zone.items) {
            const pos = positions && positions[item.id]
            this.addPile(pos ? pos.x : zone.x, pos ? pos.y : zone.y, item.cardIds)
        }
        this.zones.delete(zoneId)
        return true
    }

    moveZone(zoneId, x, y) {
        const zone = this.zones.get(zoneId)
        if (!zone) return false
        zone.x = clampCoord(x)
        zone.y = clampCoord(y)
        return true
    }

    renameZone(zoneId, name) {
        const zone = this.zones.get(zoneId)
        if (!zone) return false
        zone.name = String(name ?? '').slice(0, 30) || 'Zone'
        return true
    }

    /** Set a zone's layout: 'row' (single auto-width row) or 'grid' (perRow cols). */
    setZoneLayout(zoneId, mode, perRow) {
        const zone = this.zones.get(zoneId)
        if (!zone) return false
        zone.layout = mode === 'grid' ? 'grid' : 'row'
        if (perRow !== undefined && perRow !== null) zone.perRow = clampInt(perRow, 1, 13)
        return true
    }

    /** Drop a whole pile into a zone as a single item; the pile is removed. */
    pileToZone(pileId, zoneId, index) {
        const pile = this.piles.get(pileId)
        const zone = this.zones.get(zoneId)
        if (!pile || !zone) return false
        const item = { id: nanoid(8), cardIds: [...pile.cardIds] }
        zone.items.splice(clampInt(index, 0, zone.items.length), 0, item)
        this.piles.delete(pileId)
        return true
    }

    /** Play a card from a seated player's hand into a zone as a new item. */
    handCardToZone(playerId, cardId, zoneId, index, faceUp = true) {
        if (!this.isSeated(playerId)) return false
        const hand = this.hands.get(playerId)
        const zone = this.zones.get(zoneId)
        if (!hand || !zone) return false
        const i = hand.indexOf(cardId)
        if (i === -1) return false
        hand.splice(i, 1)
        const card = this.cards.get(cardId)
        if (card) card.faceUp = !!faceUp
        zone.items.splice(clampInt(index, 0, zone.items.length), 0, {
            id: nanoid(8),
            cardIds: [cardId],
        })
        return true
    }

    /** Reorder an item within a zone. */
    reorderZoneItem(zoneId, itemId, toIndex) {
        const zone = this.zones.get(zoneId)
        if (!zone) return false
        const from = this.findZoneItem(zone, itemId)
        if (from === -1) return false
        const [item] = zone.items.splice(from, 1)
        zone.items.splice(clampInt(toIndex, 0, zone.items.length), 0, item)
        return true
    }

    /** Take an item out of a zone onto the table as a pile. */
    zoneItemToTable(zoneId, itemId, x, y) {
        const zone = this.zones.get(zoneId)
        if (!zone) return false
        const i = this.findZoneItem(zone, itemId)
        if (i === -1) return false
        const [item] = zone.items.splice(i, 1)
        this.addPile(x, y, item.cardIds)
        return true
    }

    /** Take an item out of a zone into a seated player's hand. */
    zoneItemToHand(zoneId, itemId, playerId) {
        if (!this.isSeated(playerId)) return false
        const zone = this.zones.get(zoneId)
        if (!zone) return false
        const i = this.findZoneItem(zone, itemId)
        if (i === -1) return false
        const [item] = zone.items.splice(i, 1)
        this.hands.get(playerId).push(...item.cardIds)
        return true
    }

    /** Move an item from one zone into another at `index`. */
    zoneItemToZone(srcZoneId, itemId, destZoneId, index) {
        const src = this.zones.get(srcZoneId)
        const dest = this.zones.get(destZoneId)
        if (!src || !dest || srcZoneId === destZoneId) return false
        const i = this.findZoneItem(src, itemId)
        if (i === -1) return false
        const [item] = src.items.splice(i, 1)
        dest.items.splice(clampInt(index, 0, dest.items.length), 0, item)
        return true
    }

    /** Resolve a zone item to { zone, item, index } (or null). */
    getZoneItem(zoneId, itemId) {
        const zone = this.zones.get(zoneId)
        if (!zone) return null
        const index = this.findZoneItem(zone, itemId)
        if (index === -1) return null
        return { zone, item: zone.items[index], index }
    }

    // --- per-item manipulation (mirrors the table-pile menu, but in the zone) ---

    /** Flip the top card ('top') or the whole item ('all'). */
    flipZoneItem(zoneId, itemId, mode = 'top') {
        const f = this.getZoneItem(zoneId, itemId)
        if (!f || !f.item.cardIds.length) return false
        const ids = f.item.cardIds
        if (mode === 'all') {
            const target = !this.cards.get(ids[ids.length - 1]).faceUp
            for (const id of ids) this.cards.get(id).faceUp = target
            ids.reverse()
        } else {
            const c = this.cards.get(ids[ids.length - 1])
            c.faceUp = !c.faceUp
        }
        return true
    }

    /** Shuffle the cards within a single item. */
    shuffleZoneItem(zoneId, itemId) {
        const f = this.getZoneItem(zoneId, itemId)
        if (!f || f.item.cardIds.length < 2) return false
        const a = f.item.cardIds
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[a[i], a[j]] = [a[j], a[i]]
        }
        return true
    }

    /** Separate the top `count` cards of an item into a NEW item right after it. */
    splitZoneItem(zoneId, itemId, count) {
        const f = this.getZoneItem(zoneId, itemId)
        if (!f) return false
        const n = clampInt(count, 1, f.item.cardIds.length)
        if (n >= f.item.cardIds.length) return false // nothing left behind — no-op
        const moved = f.item.cardIds.splice(f.item.cardIds.length - n, n)
        f.zone.items.splice(f.index + 1, 0, { id: nanoid(8), cardIds: moved })
        return true
    }

    /** Separate every card of an item into its own item (in place). */
    spreadZoneItem(zoneId, itemId) {
        const f = this.getZoneItem(zoneId, itemId)
        if (!f || f.item.cardIds.length < 2) return false
        const singles = f.item.cardIds.map((cid) => ({ id: nanoid(8), cardIds: [cid] }))
        f.zone.items.splice(f.index, 1, ...singles)
        return true
    }

    /** Draw the top `count` cards of an item into a seated player's hand. */
    drawZoneItemToHand(zoneId, itemId, count, playerId) {
        if (!this.isSeated(playerId)) return false
        const f = this.getZoneItem(zoneId, itemId)
        if (!f || !f.item.cardIds.length) return false
        const n = clampInt(count, 1, f.item.cardIds.length)
        const moved = f.item.cardIds.splice(f.item.cardIds.length - n, n)
        this.hands.get(playerId).push(...moved)
        if (f.item.cardIds.length === 0) f.zone.items.splice(f.index, 1)
        return true
    }

    /** Deal cards from an item to every seated player, round-robin. */
    dealZoneItem(zoneId, itemId, count, fromPlayerId) {
        const f = this.getZoneItem(zoneId, itemId)
        if (!f) return false
        const seated = this.players.filter((p) => p.seat !== null).sort((a, b) => a.seat - b.seat)
        if (seated.length === 0) return false
        const perPlayer = clampInt(count, 1, 1000)
        const startIdx = seated.findIndex((p) => p.id === fromPlayerId)
        let dealt = 0
        for (let round = 0; round < perPlayer; round++) {
            for (let k = 0; k < seated.length; k++) {
                if (f.item.cardIds.length === 0) break
                const player = seated[(startIdx + 1 + k) % seated.length]
                const cardId = f.item.cardIds.pop()
                const c = this.cards.get(cardId)
                if (c) c.faceUp = false
                this.hands.get(player.id).push(cardId)
                dealt++
            }
        }
        if (f.item.cardIds.length === 0) f.zone.items.splice(f.index, 1)
        return dealt > 0
    }

    /** Sort the zone's items by their top card (rank or suit). */
    sortZone(zoneId, by = 'rank') {
        const zone = this.zones.get(zoneId)
        if (!zone || zone.items.length < 2) return false
        const topCard = (it) => this.cards.get(it.cardIds[it.cardIds.length - 1])
        zone.items.sort((a, b) => cardCmp(topCard(a), topCard(b), by))
        return true
    }

    /** Shuffle the order of the zone's items. */
    shuffleZone(zoneId) {
        const zone = this.zones.get(zoneId)
        if (!zone || zone.items.length < 2) return false
        const a = zone.items
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[a[i], a[j]] = [a[j], a[i]]
        }
        return true
    }

    // ---- hand operations -------------------------------------------------

    /** Move the top `count` cards of a table pile into a player's hand. */
    drawToHand(playerId, pileId, count = 1) {
        if (!this.isSeated(playerId)) return false // spectators have no hand
        const hand = this.hands.get(playerId)
        const pile = this.piles.get(pileId)
        if (!hand || !pile) return false
        const n = clampInt(count, 1, pile.cardIds.length)
        if (n === 0) return false
        const moved = pile.cardIds.splice(pile.cardIds.length - n, n)
        hand.push(...moved)
        this.dropIfEmpty(pileId)
        return true
    }

    /** Play a card from a player's hand onto the table at (x, y). */
    playFromHand(playerId, cardId, x, y, faceUp = true) {
        if (!this.isSeated(playerId)) return false
        const hand = this.hands.get(playerId)
        if (!hand) return false
        const idx = hand.indexOf(cardId)
        if (idx === -1) return false // can only play your own cards
        hand.splice(idx, 1)
        const card = this.cards.get(cardId)
        if (card) card.faceUp = !!faceUp
        this.addPile(x, y, [cardId])
        return true
    }

    /** Play a card from a player's hand onto an existing table pile (on top). */
    playOnPile(playerId, cardId, pileId, faceUp = true) {
        if (!this.isSeated(playerId)) return false
        const hand = this.hands.get(playerId)
        const pile = this.piles.get(pileId)
        if (!hand || !pile) return false
        const idx = hand.indexOf(cardId)
        if (idx === -1) return false // can only play your own cards
        hand.splice(idx, 1)
        const card = this.cards.get(cardId)
        if (card) card.faceUp = !!faceUp
        pile.cardIds.push(cardId)
        return true
    }

    /** Reorder a card within a player's own hand. */
    reorderHand(playerId, cardId, toIndex) {
        const hand = this.hands.get(playerId)
        if (!hand) return false
        const from = hand.indexOf(cardId)
        if (from === -1) return false
        hand.splice(from, 1)
        hand.splice(clampInt(toIndex, 0, hand.length), 0, cardId)
        return true
    }

    /**
     * Sort an array of card ids by 'rank' (default) or 'suit', highest first
     * (left). Rank order high→low is Joker, A, K, Q, J, 10 … 2.
     */
    sortCardIds(ids, by = 'rank') {
        return ids
            .map((id) => this.cards.get(id))
            .sort((a, b) => cardCmp(a, b, by))
            .map((c) => c.id)
    }

    sortHand(playerId, by = 'rank') {
        const hand = this.hands.get(playerId)
        if (!hand || hand.length < 2) return false
        this.hands.set(playerId, this.sortCardIds(hand, by))
        return true
    }

    /** Shuffle a player's own hand (private, in place). */
    shuffleHand(playerId) {
        const hand = this.hands.get(playerId)
        if (!hand || hand.length < 2) return false
        for (let i = hand.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1))
            ;[hand[i], hand[j]] = [hand[j], hand[i]]
        }
        return true
    }

    /**
     * Deal `count` cards from the top of a pile to every SEATED player in seat
     * order, round-robin, starting with the seat after the dealer's.
     */
    deal(pileId, count, fromPlayerId) {
        const pile = this.piles.get(pileId)
        if (!pile) return false
        const seated = this.players.filter((p) => p.seat !== null).sort((a, b) => a.seat - b.seat)
        if (seated.length === 0) return false
        const perPlayer = clampInt(count, 1, 1000)

        // Start after the dealer if they're seated, otherwise from the first seat.
        const startIdx = seated.findIndex((p) => p.id === fromPlayerId)
        let dealt = 0
        for (let round = 0; round < perPlayer; round++) {
            for (let k = 0; k < seated.length; k++) {
                if (pile.cardIds.length === 0) break
                const player = seated[(startIdx + 1 + k) % seated.length]
                const cardId = pile.cardIds.pop() // from top
                const c = this.cards.get(cardId)
                if (c) c.faceUp = false
                this.hands.get(player.id).push(cardId)
                dealt++
            }
        }
        this.dropIfEmpty(pileId)
        return dealt > 0
    }

    /** Gather every card back into a single shuffled, face-down deck. */
    reset() {
        this.seed()
        for (const id of this.hands.keys()) this.hands.set(id, [])
        return true
    }
}

function top(pile) {
    return pile.cardIds[pile.cardIds.length - 1]
}

function clampCoord(n) {
    const v = Number(n)
    if (Number.isNaN(v)) return 0
    return Math.round(Math.min(20000, Math.max(-20000, v)))
}

function clampInt(n, min, max) {
    const v = Math.floor(Number(n))
    if (Number.isNaN(v)) return min
    return Math.min(max, Math.max(min, v))
}
