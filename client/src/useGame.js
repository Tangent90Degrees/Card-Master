import { useCallback, useEffect, useMemo, useState } from 'react'
import { socket } from './socket.js'

const SESSION_KEY = 'cardmaster.session'

function loadSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY)) || null
    } catch {
        return null
    }
}
function saveSession(session) {
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
        /* storage unavailable — session just won't survive a refresh */
    }
}
function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY)
    } catch {
        /* ignore */
    }
}

function rememberRoomInUrl(code) {
    const url = new URL(window.location.href)
    url.searchParams.set('room', code)
    window.history.replaceState({}, '', url)
}

/**
 * Owns the connection lifecycle and the authoritative snapshot received from
 * the server. The client renders `state` and emits intents via `actions` —
 * it holds no game logic of its own.
 *
 * The player's identity ({ code, playerId }) is persisted to localStorage and
 * replayed via `room:resume` on every (re)connect, so refreshing the page (or a
 * dropped connection) keeps you in your room and your hand.
 */
export function useGame() {
    const [connected, setConnected] = useState(socket.connected)
    const [joined, setJoined] = useState(false)
    const [state, setState] = useState(null)
    const [error, setError] = useState(null)
    // True while we attempt to restore a stored session, to avoid flashing the lobby.
    const [resuming, setResuming] = useState(() => !!loadSession())

    useEffect(() => {
        const tryResume = () => {
            const session = loadSession()
            if (!session?.code || !session?.playerId) {
                setResuming(false)
                return
            }
            socket.emit('room:resume', session, (res) => {
                if (res?.ok) {
                    saveSession({ code: res.code, playerId: res.playerId })
                    rememberRoomInUrl(res.code)
                    setJoined(true)
                } else {
                    clearSession()
                    setJoined(false)
                }
                setResuming(false)
            })
        }

        const onConnect = () => {
            setConnected(true)
            tryResume()
        }
        const onDisconnect = () => setConnected(false)
        const onState = (snapshot) => setState(snapshot)

        socket.on('connect', onConnect)
        socket.on('disconnect', onDisconnect)
        socket.on('state', onState)

        // If the socket connected before listeners were attached, resume now.
        if (socket.connected) tryResume()

        return () => {
            socket.off('connect', onConnect)
            socket.off('disconnect', onDisconnect)
            socket.off('state', onState)
        }
    }, [])

    const enterRoom = useCallback((event, payload) => {
        setError(null)
        socket.emit(event, payload, (res) => {
            if (res?.ok) {
                saveSession({ code: res.code, playerId: res.playerId })
                rememberRoomInUrl(res.code)
                setJoined(true)
            } else {
                setError(res?.error || 'Could not enter room')
            }
        })
    }, [])

    const createRoom = useCallback(
        (name, config) => enterRoom('room:create', { name, config }),
        [enterRoom],
    )
    const joinRoom = useCallback(
        (code, name) => enterRoom('room:join', { code, name }),
        [enterRoom],
    )

    const leaveRoom = useCallback(() => {
        clearSession()
        setJoined(false)
        setState(null)
        socket.disconnect()
        socket.connect()
    }, [])

    // Thin emitters — one per server action.
    const actions = useMemo(
        () => ({
            move: (pileId, x, y) => socket.emit('pile:move', { pileId, x, y }),
            flip: (pileId, mode = 'top') => socket.emit('pile:flip', { pileId, mode }),
            shuffle: (pileId) => socket.emit('pile:shuffle', { pileId }),
            split: (pileId, count, x, y) => socket.emit('pile:split', { pileId, count, x, y }),
            spread: (pileId, x, y, columns) =>
                socket.emit('pile:spread', { pileId, x, y, columns }),
            merge: (srcPileId, destPileId) => socket.emit('pile:merge', { srcPileId, destPileId }),
            topToPile: (srcPileId, destPileId) =>
                socket.emit('pile:topToPile', { srcPileId, destPileId }),
            topToZone: (pileId, zoneId, index) =>
                socket.emit('pile:topToZone', { pileId, zoneId, index }),
            moveMany: (moves) => socket.emit('pile:moveMany', { moves }),
            flipMany: (pileIds, mode = 'top') => socket.emit('pile:flipMany', { pileIds, mode }),
            gather: (pileIds, x, y) => socket.emit('pile:gather', { pileIds, x, y }),
            piecesToZone: (ids, zoneId, index) =>
                socket.emit('pieces:toZone', { ids, zoneId, index }),
            piecesToHand: (ids) => socket.emit('pieces:toHand', { ids }),
            flipPieces: (ids, mode = 'top') => socket.emit('pieces:flip', { ids, mode }),
            piecesToTable: (ids, placements) =>
                socket.emit('pieces:toTable', { ids, placements }),
            collectToHand: (pileIds) => socket.emit('pile:collectToHand', { pileIds }),
            pickup: (pileId, count = 1) => socket.emit('card:pickup', { pileId, count }),
            play: (cardId, x, y, faceUp = true) =>
                socket.emit('hand:play', { cardId, x, y, faceUp }),
            playOnPile: (cardId, pileId, faceUp = true) =>
                socket.emit('hand:playOnPile', { cardId, pileId, faceUp }),
            reorderHand: (cardId, toIndex) => socket.emit('hand:reorder', { cardId, toIndex }),
            sortHand: (by) => socket.emit('hand:sort', { by }),
            shuffleHand: () => socket.emit('hand:shuffle', {}),
            deal: (pileId, count) => socket.emit('deck:deal', { pileId, count }),
            collect: () => socket.emit('table:collect', {}),
            reset: () => socket.emit('game:reset', {}),
            takeSeat: (seatIndex) => socket.emit('seat:take', { seatIndex }),
            leaveSeat: () => socket.emit('seat:leave', {}),
            setSeats: (seats) => socket.emit('room:setSeats', { seats }),
            createZone: (x, y) => socket.emit('zone:create', { x, y }),
            removeZone: (zoneId, positions) => socket.emit('zone:remove', { zoneId, positions }),
            moveZone: (zoneId, x, y) => socket.emit('zone:move', { zoneId, x, y }),
            renameZone: (zoneId, name) => socket.emit('zone:rename', { zoneId, name }),
            setZoneLayout: (zoneId, mode, perRow) =>
                socket.emit('zone:layout', { zoneId, mode, perRow }),
            pileToZone: (pileId, zoneId, index) =>
                socket.emit('zone:addPile', { pileId, zoneId, index }),
            handCardToZone: (cardId, zoneId, index) =>
                socket.emit('zone:handCard', { cardId, zoneId, index }),
            reorderZoneItem: (zoneId, itemId, toIndex) =>
                socket.emit('zone:reorder', { zoneId, itemId, toIndex }),
            zoneItemToTable: (zoneId, itemId, x, y) =>
                socket.emit('zone:itemToTable', { zoneId, itemId, x, y }),
            zoneItemToHand: (zoneId, itemId) => socket.emit('zone:itemToHand', { zoneId, itemId }),
            zoneItemToZone: (srcZoneId, itemId, destZoneId, index) =>
                socket.emit('zone:itemToZone', { srcZoneId, itemId, destZoneId, index }),
            flipZoneItem: (zoneId, itemId, mode = 'top') =>
                socket.emit('zone:flipItem', { zoneId, itemId, mode }),
            shuffleZoneItem: (zoneId, itemId) =>
                socket.emit('zone:shuffleItem', { zoneId, itemId }),
            splitZoneItem: (zoneId, itemId, count) =>
                socket.emit('zone:splitItem', { zoneId, itemId, count }),
            spreadZoneItem: (zoneId, itemId) => socket.emit('zone:spreadItem', { zoneId, itemId }),
            drawZoneItem: (zoneId, itemId, count = 1) =>
                socket.emit('zone:drawItem', { zoneId, itemId, count }),
            dealZoneItem: (zoneId, itemId, count) =>
                socket.emit('zone:dealItem', { zoneId, itemId, count }),
            sortZone: (zoneId, by) => socket.emit('zone:sort', { zoneId, by }),
            shuffleZone: (zoneId) => socket.emit('zone:shuffle', { zoneId }),
        }),
        [],
    )

    return { connected, joined, resuming, state, error, createRoom, joinRoom, leaveRoom, actions }
}
