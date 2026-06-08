/** Up-to-two-letter initials for an avatar. */
function initials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean)
    if (parts.length === 0) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[1][0]).toUpperCase()
}

// Rectangle (in %) the seats are placed along, inset a little from the edges.
const L = 9
const R = 91
const T = 11
const B = 90

/**
 * Map a fraction f ∈ [0,1) to a point on the table-rectangle's perimeter,
 * starting at the bottom-centre and walking clockwise. f = 0 is bottom-centre,
 * f = 0.5 is top-centre, so seats spread evenly along the edges.
 */
function perimeterPoint(f) {
    const W = R - L
    const H = B - T
    const cx = (L + R) / 2
    const P = 2 * W + 2 * H
    let d = (((f % 1) + 1) % 1) * P
    if (d <= W / 2) return [cx + d, B] // bottom edge, centre → right
    d -= W / 2
    if (d <= H) return [R, B - d] // right edge, bottom → top
    d -= H
    if (d <= W) return [R - d, T] // top edge, right → left
    d -= W
    if (d <= H) return [L, T + d] // left edge, top → bottom
    d -= H
    return [L + d, B] // bottom edge, left → centre
}

/**
 * Seats arranged along the edges of the rectangular table. There are `seats`
 * fixed slots; each is either occupied by a player or empty. Spectators can
 * click an empty seat to sit; a seated player can stand back up. The view is
 * rotated so the local player's seat sits at the bottom-centre.
 */
export default function PlayerSeats({ seats, players, youId, onSit, onLeave }) {
    const bySeat = new Map(players.filter((p) => p.seat !== null).map((p) => [p.seat, p]))
    const me = players.find((p) => p.id === youId)
    const mySeat = me?.seat ?? null
    const amSpectator = mySeat === null
    const offset = mySeat ?? 0

    return (
        <div className="seats">
            {Array.from({ length: seats }, (_, i) => {
                const rel = (((i - offset) % seats) + seats) % seats
                const [x, y] = perimeterPoint(rel / seats)
                const p = bySeat.get(i)
                const isMe = p && p.id === youId
                return (
                    <div
                        key={i}
                        className={`seat ${p ? '' : 'empty'} ${p && !p.connected ? 'offline' : ''} ${isMe ? 'me' : ''}`}
                        style={{ left: `${x}%`, top: `${y}%` }}
                    >
                        {p ? (
                            <>
                                <div className="avatar" style={{ background: p.color }}>
                                    {initials(p.name)}
                                </div>
                                <div className="seat-info">
                                    <div className="seat-name">
                                        {p.name}
                                        {isMe && ' (you)'}
                                    </div>
                                    <div className="seat-status">
                                        {p.handCount} 🂠
                                        {isMe && (
                                            <button className="seat-btn" onClick={onLeave}>
                                                Stand up
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="avatar empty-avatar">{i + 1}</div>
                                <div className="seat-info">
                                    {amSpectator ? (
                                        <button className="seat-btn sit" onClick={() => onSit(i)}>
                                            Sit here
                                        </button>
                                    ) : (
                                        <span className="seat-name muted">Empty</span>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                )
            })}
        </div>
    )
}
