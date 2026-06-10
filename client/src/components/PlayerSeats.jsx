/** Up-to-two-letter initials for an avatar. */
export function initials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

/**
 * Walk the seat-field perimeter (container %, 0–100 on each axis) from the
 * bottom-centre, clockwise. The field (see `.seats` in CSS) is inset to the hand
 * area's frame — its left/right match the hand's edges and, when seated, its
 * bottom sits just above the hand.
 */
export function seatPlacement(f) {
    let d = (((f % 1) + 1) % 1) * 400
    if (d <= 50) return { x: 50 + d, y: 100 } // bottom, centre → right
    d -= 50
    if (d <= 100) return { x: 100, y: 100 - d } // right, bottom → top
    d -= 100
    if (d <= 100) return { x: 100 - d, y: 0 } // top, right → left
    d -= 100
    if (d <= 100) return { x: 0, y: d } // left, top → bottom
    d -= 100
    return { x: d, y: 100 } // bottom, left → centre
}

/**
 * Anchor a seat toward the nearest edge/corner of the field so its box always
 * stays inside (no off-screen overflow, even with 8 seats). Edge-hugging seats
 * also line their left/right boundary up with the hand's frame.
 */
export function anchorFor(x, y) {
    const tx = x < 25 ? '0' : x > 75 ? '-100%' : '-50%'
    const ty = y < 25 ? '0' : y > 75 ? '-100%' : '-50%'
    return `translate(${tx}, ${ty})`
}

/**
 * The EMPTY seats arranged along the edges of the table. Occupied seats are drawn
 * as full "stations" (avatar + play area) by Game; here we only render the open
 * slots so spectators/seated players can sit or move into them. The view is
 * rotated so the local player's slot is at the bottom-centre.
 */
export default function PlayerSeats({ seats, players, youId, onSit }) {
    const bySeat = new Map(players.filter((p) => p.seat !== null).map((p) => [p.seat, p]))
    const me = players.find((p) => p.id === youId)
    const mySeat = me?.seat ?? null
    const amSpectator = mySeat === null
    const offset = mySeat ?? 0

    return (
        // Seated: reserve the bottom strip for the hand (`.seats.seated`). Spectating:
        // no hand, so seats spread across the full table edges.
        <div className={`seats ${amSpectator ? '' : 'seated'}`}>
            {Array.from({ length: seats }, (_, i) => {
                if (bySeat.get(i)) return null // occupied → drawn as a station by Game
                const rel = (((i - offset) % seats) + seats) % seats
                const { x, y } = seatPlacement(rel / seats)
                return (
                    <div
                        key={i}
                        className="seat empty"
                        style={{ left: `${x}%`, top: `${y}%`, transform: anchorFor(x, y) }}
                    >
                        <div className="avatar empty-avatar">{i + 1}</div>
                        <div className="seat-info">
                            {/* Both spectators and seated players can take an empty seat —
                                a seated player moves there (keeping their hand). */}
                            <button className="seat-btn sit" onClick={() => onSit(i)}>
                                {amSpectator ? 'Sit here' : 'Move here'}
                            </button>
                        </div>
                    </div>
                )
            })}
        </div>
    )
}
