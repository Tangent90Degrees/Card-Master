import { useState } from 'react'

const initialRoom = new URLSearchParams(window.location.search).get('room') || ''

export default function Lobby({ game }) {
    const [name, setName] = useState('')
    const [code, setCode] = useState(initialRoom.toUpperCase())
    const [decks, setDecks] = useState(1)
    const [jokers, setJokers] = useState(0)

    const canJoin = name.trim() && code.trim()
    const canCreate = name.trim()

    return (
        <div className="lobby">
            <div className="lobby-card">
                <h1>♠ Card-Master ♥</h1>
                <p className="tagline">A shared table for any card game. No rules, just cards.</p>

                {!game.connected && <p className="warn">Connecting to server…</p>}
                {game.error && <p className="error">{game.error}</p>}

                <label>
                    Your name
                    <input
                        value={name}
                        maxLength={24}
                        placeholder="e.g. Alex"
                        onChange={(e) => setName(e.target.value)}
                    />
                </label>

                <section className="lobby-join">
                    <h2>Join a room</h2>
                    <div className="row">
                        <input
                            value={code}
                            placeholder="ROOM CODE"
                            maxLength={5}
                            onChange={(e) => setCode(e.target.value.toUpperCase())}
                        />
                        <button
                            disabled={!canJoin}
                            onClick={() => game.joinRoom(code.trim(), name.trim())}
                        >
                            Join
                        </button>
                    </div>
                </section>

                <div className="divider">or</div>

                <section className="lobby-create">
                    <h2>Create a room</h2>
                    <div className="row">
                        <label className="mini">
                            Decks
                            <select
                                value={decks}
                                onChange={(e) => setDecks(Number(e.target.value))}
                            >
                                {[1, 2, 3, 4].map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="mini">
                            Jokers / deck
                            <select
                                value={jokers}
                                onChange={(e) => setJokers(Number(e.target.value))}
                            >
                                {[0, 1, 2].map((n) => (
                                    <option key={n} value={n}>
                                        {n}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>
                    <button
                        className="primary"
                        disabled={!canCreate}
                        onClick={() => game.createRoom(name.trim(), { decks, jokers })}
                    >
                        Create &amp; play
                    </button>
                </section>
            </div>
        </div>
    )
}
