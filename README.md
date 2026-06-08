# Card-Master

A real-time, multiplayer **card sandbox** (virtual tabletop). A group of players join a
room and freely manipulate cards — flip, place, move, pick up, deal, and shuffle. There are
no enforced rules, so it works for any card game.

- **The table** is shared and visible to everyone.
- **Each player's hand** is private — only its owner sees the faces.

## Stack

- **Server:** Node + Express + Socket.IO (authoritative, in-memory state)
- **Client:** React + Vite + socket.io-client

The server is the single source of truth and sends each player a *personalized* snapshot:
face-down table cards and other players' hands are stripped of their rank/suit before they
ever leave the server.

## Getting started

```bash
npm install        # installs root + server + client (npm workspaces)
npm run dev        # everything on one port: http://localhost:3001
```

Open <http://localhost:3001>, create a room, and share the invite link (or the 5-letter
room code) with other players. In dev, the Express server runs Vite in middleware mode, so
the UI (with hot reload) and the Socket.IO API share a **single port** — handy behind a
single forwarded port or on a remote VM.

### Other commands

```bash
npm test           # server unit tests (deck building + visibility filter)
npm run build      # build the client into client/dist
npm start          # build + run in production mode (serves client/dist) on :3001
```

## How to play

- **Drag** a pile to move it. **Click** a pile to flip its top card.
- **Drop a pile onto another** to merge them.
- **Drop a pile onto your hand** (bottom strip) to pick up its top card.
- **Drag a card from your hand** onto the table to play it face up.
- **Right-click** a pile for: flip top / flip pile / shuffle / draw to hand / deal to all.

## Project layout

```
server/src
  deck.js    configurable deck builder (decks + jokers)
  room.js    authoritative Room state + all card operations
  view.js    per-player visibility filter (the privacy boundary)
  rooms.js   in-memory room registry + code generation
  socket.js  Socket.IO event wiring
  index.js   Express + Socket.IO bootstrap
client/src
  useGame.js     connection + snapshot state + action emitters
  components/    Lobby, Game (drag table), Hand, Card, PlayerList, ContextMenu
```
