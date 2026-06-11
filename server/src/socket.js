import { serializeFor } from './view.js'
import { RoomStore } from './rooms.js'

const DISCONNECT_GRACE_MS = 30_000

export function attachSockets(io) {
    const store = new RoomStore()
    // playerId -> connected socket, so we can push personalized snapshots.
    const socketsByPlayer = new Map()
    // playerId -> grace-period timer, so a quick refresh doesn't drop the player.
    const dropTimers = new Map()

    function broadcast(room) {
        for (const player of room.players) {
            const s = socketsByPlayer.get(player.id)
            if (s && s.connected) s.emit('state', serializeFor(room, player.id))
        }
    }

    function bindToPlayer(socket, room, player) {
        socket.data.code = room.code
        socket.data.playerId = player.id
        socket.join(room.code)
        socketsByPlayer.set(player.id, socket)
    }

    io.on('connection', (socket) => {
        // --- room lifecycle ------------------------------------------------
        socket.on('room:create', ({ name, config } = {}, cb) => {
            const room = store.create(config)
            const player = room.addPlayer(name)
            bindToPlayer(socket, room, player)
            ack(cb, { ok: true, code: room.code, playerId: player.id })
            broadcast(room)
        })

        socket.on('room:join', ({ code, name } = {}, cb) => {
            const room = store.get(code)
            if (!room) return ack(cb, { ok: false, error: 'Room not found' })
            const player = room.addPlayer(name)
            bindToPlayer(socket, room, player)
            ack(cb, { ok: true, code: room.code, playerId: player.id, name: player.name })
            broadcast(room)
        })

        // Re-attach a returning socket (e.g. after a page refresh) to an existing
        // player instead of creating a new one, so the session survives a reload.
        socket.on('room:resume', ({ code, playerId } = {}, cb) => {
            const room = store.get(code)
            if (!room) return ack(cb, { ok: false, error: 'Room no longer exists' })
            const player = room.getPlayer(playerId)
            if (!player) return ack(cb, { ok: false, error: 'Session expired' })

            // Cancel any pending drop from the previous disconnect.
            const timer = dropTimers.get(playerId)
            if (timer) {
                clearTimeout(timer)
                dropTimers.delete(playerId)
            }
            room.setConnected(playerId, true)
            bindToPlayer(socket, room, player)
            ack(cb, { ok: true, code: room.code, playerId: player.id, name: player.name })
            broadcast(room)
        })

        // --- gameplay actions ----------------------------------------------
        // Each handler resolves the caller's room, runs the mutation, rebroadcasts.
        const action =
            (fn) =>
            (payload = {}) => {
                const room = store.get(socket.data.code)
                const playerId = socket.data.playerId
                if (!room || !playerId) return
                const changed = fn(room, playerId, payload)
                if (changed) broadcast(room)
            }

        socket.on(
            'pile:move',
            action((room, _pid, p) => room.move(p.pileId, p.x, p.y)),
        )
        socket.on(
            'pile:flip',
            action((room, _pid, p) => room.flip(p.pileId, p.mode)),
        )
        socket.on(
            'pile:shuffle',
            action((room, _pid, p) => room.shuffle(p.pileId)),
        )
        socket.on(
            'pile:split',
            action((room, _pid, p) => room.split(p.pileId, p.count, p.x, p.y)),
        )
        socket.on(
            'pile:spread',
            action((room, _pid, p) => room.spreadAll(p.pileId, p.x, p.y, p.columns)),
        )
        socket.on(
            'pile:merge',
            action((room, _pid, p) => room.merge(p.srcPileId, p.destPileId)),
        )
        socket.on(
            'pile:topToPile',
            action((room, _pid, p) => room.moveTopToPile(p.srcPileId, p.destPileId)),
        )
        socket.on(
            'pile:topToZone',
            action((room, _pid, p) => room.pileTopToZone(p.pileId, p.zoneId, p.index)),
        )
        socket.on(
            'pile:moveMany',
            action((room, _pid, p) => room.moveMany(p.moves)),
        )
        socket.on(
            'pile:flipMany',
            action((room, _pid, p) => room.flipMany(p.pileIds, p.mode)),
        )
        socket.on(
            'pile:gather',
            action((room, _pid, p) => room.gatherPiles(p.pileIds, p.x, p.y)),
        )
        socket.on(
            'pieces:toZone',
            action((room, _pid, p) => room.piecesToZone(p.ids, p.zoneId, p.index)),
        )
        socket.on(
            'pieces:toHand',
            action((room, pid, p) => room.piecesToHand(pid, p.ids)),
        )
        socket.on(
            'pieces:toTable',
            action((room, _pid, p) => room.piecesToTable(p.ids, p.placements)),
        )
        socket.on(
            'pieces:flip',
            action((room, _pid, p) => room.flipPieces(p.ids, p.mode)),
        )
        socket.on(
            'pile:collectToHand',
            action((room, pid, p) => room.collectPilesToHand(pid, p.pileIds)),
        )
        socket.on(
            'card:pickup',
            action((room, pid, p) => room.drawToHand(pid, p.pileId, p.count)),
        )
        socket.on(
            'pile:draw',
            action((room, pid, p) => room.drawToHand(pid, p.pileId, p.count)),
        )
        socket.on(
            'hand:play',
            action((room, pid, p) => room.playFromHand(pid, p.cardId, p.x, p.y, p.faceUp)),
        )
        socket.on(
            'hand:playOnPile',
            action((room, pid, p) => room.playOnPile(pid, p.cardId, p.pileId, p.faceUp)),
        )
        socket.on(
            'hand:reorder',
            action((room, pid, p) => room.reorderHand(pid, p.cardId, p.toIndex)),
        )
        socket.on(
            'hand:sort',
            action((room, pid, p) => room.sortHand(pid, p.by)),
        )
        socket.on(
            'hand:shuffle',
            action((room, pid) => room.shuffleHand(pid)),
        )
        socket.on(
            'deck:deal',
            action((room, pid, p) => room.deal(p.pileId, p.count, pid)),
        )
        socket.on(
            'table:collect',
            action((room, _pid, p) => room.collectTable(p.x, p.y)),
        )
        socket.on(
            'game:reset',
            action((room) => room.reset()),
        )
        socket.on(
            'seat:take',
            action((room, pid, p) => room.takeSeat(pid, p.seatIndex)),
        )
        socket.on(
            'seat:leave',
            action((room, pid) => room.leaveSeat(pid)),
        )
        socket.on(
            'room:setSeats',
            action((room, _pid, p) => room.setSeats(p.seats)),
        )

        // --- zones ---------------------------------------------------------
        socket.on(
            'zone:create',
            action((room, _pid, p) => room.createZone(p.x, p.y)),
        )
        socket.on(
            'zone:remove',
            action((room, _pid, p) => room.removeZone(p.zoneId, p.positions)),
        )
        socket.on(
            'zone:move',
            action((room, _pid, p) => room.moveZone(p.zoneId, p.x, p.y)),
        )
        socket.on(
            'zone:rename',
            action((room, _pid, p) => room.renameZone(p.zoneId, p.name)),
        )
        socket.on(
            'zone:layout',
            action((room, _pid, p) => room.setZoneLayout(p.zoneId, p.mode, p.perRow)),
        )
        socket.on(
            'zone:addPile',
            action((room, _pid, p) => room.pileToZone(p.pileId, p.zoneId, p.index)),
        )
        socket.on(
            'zone:handCard',
            action((room, pid, p) =>
                room.handCardToZone(pid, p.cardId, p.zoneId, p.index, p.faceUp),
            ),
        )
        socket.on(
            'zone:reorder',
            action((room, _pid, p) => room.reorderZoneItem(p.zoneId, p.itemId, p.toIndex)),
        )
        socket.on(
            'zone:itemToTable',
            action((room, _pid, p) => room.zoneItemToTable(p.zoneId, p.itemId, p.x, p.y)),
        )
        socket.on(
            'zone:itemToHand',
            action((room, pid, p) => room.zoneItemToHand(p.zoneId, p.itemId, pid)),
        )
        socket.on(
            'zone:itemToZone',
            action((room, _pid, p) =>
                room.zoneItemToZone(p.srcZoneId, p.itemId, p.destZoneId, p.index),
            ),
        )
        socket.on(
            'zone:flipItem',
            action((room, _pid, p) => room.flipZoneItem(p.zoneId, p.itemId, p.mode)),
        )
        socket.on(
            'zone:shuffleItem',
            action((room, _pid, p) => room.shuffleZoneItem(p.zoneId, p.itemId)),
        )
        socket.on(
            'zone:splitItem',
            action((room, _pid, p) => room.splitZoneItem(p.zoneId, p.itemId, p.count)),
        )
        socket.on(
            'zone:spreadItem',
            action((room, _pid, p) => room.spreadZoneItem(p.zoneId, p.itemId)),
        )
        socket.on(
            'zone:drawItem',
            action((room, pid, p) => room.drawZoneItemToHand(p.zoneId, p.itemId, p.count, pid)),
        )
        socket.on(
            'zone:dealItem',
            action((room, pid, p) => room.dealZoneItem(p.zoneId, p.itemId, p.count, pid)),
        )
        socket.on(
            'zone:sort',
            action((room, _pid, p) => room.sortZone(p.zoneId, p.by)),
        )
        socket.on(
            'zone:shuffle',
            action((room, _pid, p) => room.shuffleZone(p.zoneId)),
        )

        // --- disconnect handling -------------------------------------------
        socket.on('disconnect', () => {
            const { code, playerId } = socket.data
            if (!code || !playerId) return
            const room = store.get(code)
            if (!room) return

            // Ignore a stale socket that has already been replaced by a resume/reconnect
            // (e.g. a fast refresh) — otherwise it would wrongly mark the player offline.
            if (socketsByPlayer.get(playerId) !== socket) return
            socketsByPlayer.delete(playerId)
            room.setConnected(playerId, false)
            broadcast(room)

            const timer = setTimeout(() => {
                dropTimers.delete(playerId)
                const r = store.get(code)
                if (!r) return
                const p = r.getPlayer(playerId)
                // If they reconnected in the meantime, leave them be.
                if (!p || p.connected) return
                r.removePlayer(playerId)
                if (!store.pruneIfEmpty(code)) broadcast(r)
            }, DISCONNECT_GRACE_MS)
            dropTimers.set(playerId, timer)
        })
    })
}

function ack(cb, payload) {
    if (typeof cb === 'function') cb(payload)
}
