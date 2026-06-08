import { useGame } from './useGame.js'
import Lobby from './components/Lobby.jsx'
import Game from './components/Game.jsx'

export default function App() {
    const game = useGame()

    // Restoring a saved session after a refresh — don't flash the lobby.
    if (game.resuming) {
        return (
            <div className="lobby">
                <div className="lobby-card">
                    <h1>♠ Card-Master ♥</h1>
                    <p className="tagline">Reconnecting you to your room…</p>
                </div>
            </div>
        )
    }

    if (!game.joined || !game.state) {
        return <Lobby game={game} />
    }
    return <Game game={game} />
}
