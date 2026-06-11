/**
 * Build the personalized snapshot a single player is allowed to see.
 *
 * This is the privacy boundary of the whole app: a card's `rank`/`suit` are
 * included ONLY when the viewer is permitted to see them —
 *   - table cards: only when face up
 *   - own hand:    always
 *   - other hands: never (only a count)
 * Hidden faces are stripped here so they never leave the server.
 */
export function serializeFor(room, viewerId) {
    const piles = []
    for (const pile of room.piles.values()) {
        piles.push({
            id: pile.id,
            x: pile.x,
            y: pile.y,
            count: pile.cardIds.length,
            cards: pile.cardIds.map((cardId) => publicCard(room.cards.get(cardId))),
        })
    }

    // Map each occupied seat to its player, so a board can name its current owner.
    const playerBySeat = new Map(
        room.players.filter((p) => p.seat !== null).map((p) => [p.seat, p.id]),
    )

    const zones = []
    for (const zone of room.zones.values()) {
        const seat = zone.seat ?? null
        zones.push({
            id: zone.id,
            seat, // null for a table zone; a seat index for a play area (board)
            ownerId: seat == null ? null : (playerBySeat.get(seat) ?? null),
            x: zone.x,
            y: zone.y,
            name: zone.name,
            layout: zone.layout,
            perRow: zone.perRow,
            items: zone.items.map((it) => ({
                id: it.id,
                count: it.cardIds.length,
                cards: it.cardIds.map((cardId) => publicCard(room.cards.get(cardId))),
            })),
        })
    }

    const ownHand = (room.hands.get(viewerId) || []).map((cardId) =>
        privateCard(room.cards.get(cardId)),
    )

    const players = room.players.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
        connected: p.connected,
        seat: p.seat, // null = spectator
        handCount: (room.hands.get(p.id) || []).length,
    }))

    return {
        code: room.code,
        config: room.config,
        seats: room.seats,
        you: viewerId,
        players,
        piles,
        zones,
        hand: ownHand,
    }
}

/** A card on the table: reveal face only when it is face up. */
function publicCard(card) {
    if (!card) return null
    if (!card.faceUp) {
        return { id: card.id, faceUp: false }
    }
    return revealed(card)
}

/**
 * A card in the viewer's own hand: always faces the player. They see the face
 * regardless of the card's table orientation (e.g. cards dealt face down still
 * show their face to their owner).
 */
function privateCard(card) {
    if (!card) return null
    return { ...revealed(card), faceUp: true }
}

function revealed(card) {
    const out = {
        id: card.id,
        faceUp: card.faceUp,
        rank: card.rank,
        suit: card.suit,
        isJoker: card.rank === 'JOKER',
    }
    if (out.isJoker) out.variant = card.variant || 'color'
    return out
}
