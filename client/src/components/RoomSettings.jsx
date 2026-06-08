import { useEffect } from 'react'

const MAX_SEATS = 8

/** Modal: set the number of seats and view the online players. */
export default function RoomSettings({ state, actions, onClose }) {
    useEffect(() => {
        const onKey = (e) => e.key === 'Escape' && onClose()
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onClose])

    const seatedCount = state.players.filter((p) => p.seat !== null).length

    return (
        <>
            <div className="modal-overlay" onClick={onClose} />
            <div className="modal" role="dialog" aria-label="Room settings">
                <div className="modal-head">
                    <h2>Room settings</h2>
                    <button className="modal-close" onClick={onClose} aria-label="Close">
                        ✕
                    </button>
                </div>

                <div className="modal-section">
                    <div className="modal-label">Seats</div>
                    <div className="stepper">
                        <button
                            onClick={() => actions.setSeats(state.seats - 1)}
                            disabled={state.seats <= 1}
                            aria-label="Fewer seats"
                        >
                            −
                        </button>
                        <span className="stepper-value">{state.seats}</span>
                        <button
                            onClick={() => actions.setSeats(state.seats + 1)}
                            disabled={state.seats >= MAX_SEATS}
                            aria-label="More seats"
                        >
                            +
                        </button>
                    </div>
                    <p className="modal-hint">
                        {seatedCount} seated · max {MAX_SEATS}. Reducing seats sends anyone in a
                        removed seat back to spectating.
                    </p>
                </div>

                <div className="modal-section">
                    <div className="modal-label">Online players ({state.players.length})</div>
                    <ul className="player-list">
                        {state.players.map((p) => (
                            <li key={p.id} className={p.connected ? '' : 'offline'}>
                                <span className="pl-dot" style={{ background: p.color }} />
                                <span className="pl-name">
                                    {p.name}
                                    {p.id === state.you && ' (you)'}
                                </span>
                                <span className="pl-status">
                                    {p.seat !== null ? `Seat ${p.seat + 1}` : 'Spectator'}
                                    {!p.connected && ' · offline'}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </>
    )
}
