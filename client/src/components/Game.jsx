import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Card from './Card.jsx'
import Pile from './Pile.jsx'
import Hand from './Hand.jsx'
import Zone from './Zone.jsx'
import { seatPlacement, anchorFor, initials } from './PlayerSeats.jsx'
import Menu from './Menu.jsx'
import ContextMenu from './ContextMenu.jsx'
import ZoneMenu from './ZoneMenu.jsx'
import ZoneItemMenu from './ZoneItemMenu.jsx'
import SelectionMenu from './SelectionMenu.jsx'
import RoomSettings from './RoomSettings.jsx'

export const CARD_W = 72
export const CARD_H = 104
const CLICK_SLOP = 5 // px of movement below which a drag counts as a click
const MERGE_RADIUS = 64 // px proximity to drop one pile onto another
const FLY_MS = 200 // glide a card takes from the drop point to its new container

// Keep dropped cards/zones clear of the player areas around the table — the seat
// ring (top/sides) and the hand + play areas (bottom).
const SAFE_TOP = 96
const SAFE_SIDE = 96
const SAFE_BOTTOM = 188

/**
 * Apply an optimistic cross-container move to a server snapshot so a dropped
 * card shows up in its destination immediately (no blink back to the source
 * while we wait for the server). `pending` removes `hide` card ids from wherever
 * they are, and adds optimistic piles / zone items at the destination.
 */
function applyPending(state, pending) {
    if (!pending) return state
    const { hide, addPiles, addZoneItems } = pending
    let { hand, piles, zones } = state

    if (hide && hide.size) {
        const keep = (cards) => cards.filter((c) => !hide.has(c.id))
        hand = keep(hand)
        piles = piles
            .map((p) => ({ ...p, cards: keep(p.cards), count: keep(p.cards).length }))
            .filter((p) => p.count > 0)
        zones = zones.map((z) => ({
            ...z,
            items: z.items
                .map((it) => ({ ...it, cards: keep(it.cards), count: keep(it.cards).length }))
                .filter((it) => it.count > 0),
        }))
    }
    if (addPiles?.length) piles = [...piles, ...addPiles]
    if (addZoneItems?.length) {
        zones = zones.map((z) => {
            const adds = addZoneItems.filter((a) => a.zoneId === z.id)
            if (!adds.length) return z
            const items = [...z.items]
            for (const a of adds) items.splice(Math.min(a.index, items.length), 0, a.item)
            return { ...z, items }
        })
    }
    return { ...state, hand, piles, zones }
}

/** Build a face-up table-card view from a hand/pile card (for optimistic adds). */
function cardView(card, faceUp = card.faceUp) {
    return {
        id: card.id,
        faceUp,
        rank: card.rank,
        suit: card.suit,
        isJoker: card.isJoker,
        variant: card.variant,
    }
}

export default function Game({ game }) {
    const { state, actions } = game
    const tableRef = useRef(null)
    const handRef = useRef(null)
    const dragRef = useRef(null) // live drag, read by window listeners
    const stateRef = useRef(state) // latest snapshot, read by window listeners
    stateRef.current = state

    const [drag, setDrag] = useState(null)
    const [menu, setMenu] = useState(null)
    const [zoneMenu, setZoneMenu] = useState(null)
    const [itemMenu, setItemMenu] = useState(null)
    const [selMenu, setSelMenu] = useState(null)
    const [sortMenu, setSortMenu] = useState(null) // zone sort/shuffle dropdown
    const [showSettings, setShowSettings] = useState(false)

    // Local per-container card-display preference: 'tiled' (scroll when full) or
    // 'overlapped' (cards overlap when full). Keyed by zone id, plus 'hand'. The
    // hand defaults to overlapped, zones/boards to tiled.
    const [displayModes, setDisplayModes] = useState({})
    const handMode = displayModes.hand ?? 'overlapped'

    // Whether cards I play from my hand land face up (default) or face down. A
    // local, per-player preference toggled from the hand bar.
    const [playFaceUp, setPlayFaceUp] = useState(true)
    function toggleDisplay(id, def) {
        setDisplayModes((prev) => {
            const cur = prev[id] ?? def
            return { ...prev, [id]: cur === 'overlapped' ? 'tiled' : 'overlapped' }
        })
    }

    // Marquee multi-select of table piles: the set of selected pile ids, and the
    // live rubber-band rectangle (table-relative coords) while dragging one out.
    const [selectedIds, setSelectedIds] = useState(() => new Set())
    const [marquee, setMarquee] = useState(null) // { x0, y0, x1, y1 } or null
    const marqueeRef = useRef(null)
    // Drop selected ids that no longer exist (merged / collected / moved away).
    // A selection can hold both table-pile ids and zone-item ids.
    useEffect(() => {
        setSelectedIds((prev) => {
            if (prev.size === 0) return prev
            const live = new Set(state.piles.map((p) => p.id))
            for (const z of state.zones) for (const it of z.items) live.add(it.id)
            let changed = false
            const next = new Set()
            for (const id of prev) {
                if (live.has(id)) next.add(id)
                else changed = true
            }
            return changed ? next : prev
        })
    }, [state.piles, state.zones])
    // Stacking order of table piles, low→high (last = rendered on top). A pile is
    // lifted to the top when it's operated on; newly appeared piles also land on
    // top. Render order follows this list so the most-recently-touched pile wins.
    const [zOrder, setZOrder] = useState([])
    useEffect(() => {
        setZOrder((prev) => {
            const liveIds = state.piles.map((p) => p.id)
            const liveSet = new Set(liveIds)
            const kept = prev.filter((id) => liveSet.has(id))
            const keptSet = new Set(kept)
            const added = liveIds.filter((id) => !keptSet.has(id)) // new piles → on top
            const next = [...kept, ...added]
            if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev
            return next
        })
    }, [state.piles])
    function bringToFront(ids) {
        const list = [].concat(ids).filter(Boolean)
        if (!list.length) return
        setZOrder((prev) => {
            const move = new Set(list)
            const rest = prev.filter((id) => !move.has(id))
            const moved = list.filter((id) => prev.includes(id))
            return [...rest, ...moved]
        })
    }

    // Same stacking order for table zones — the last clicked / operated zone is
    // rendered on top of overlapping ones (boards are anchored, so excluded).
    const [zoneOrder, setZoneOrder] = useState([])
    useEffect(() => {
        setZoneOrder((prev) => {
            const liveIds = state.zones.filter((z) => z.seat == null).map((z) => z.id)
            const liveSet = new Set(liveIds)
            const kept = prev.filter((id) => liveSet.has(id))
            const keptSet = new Set(kept)
            const added = liveIds.filter((id) => !keptSet.has(id))
            const next = [...kept, ...added]
            if (next.length === prev.length && next.every((id, i) => id === prev[i])) return prev
            return next
        })
    }, [state.zones])
    function bringZoneToFront(zoneId) {
        setZoneOrder((prev) => {
            if (!prev.includes(zoneId)) return prev // not a table zone (e.g. a board)
            return [...prev.filter((id) => id !== zoneId), zoneId]
        })
    }

    // Hold a zone's reordered item list until the server confirms (no snap-back).
    const [optimisticZoneItems, setOptimisticZoneItems] = useState(null)
    useEffect(() => setOptimisticZoneItems(null), [state.zones])
    // After a hand reorder we keep showing the new order until the server snapshot
    // arrives (which will match), so the cards don't snap back and re-animate.
    const [optimisticHand, setOptimisticHand] = useState(null)
    useEffect(() => setOptimisticHand(null), [state.hand])

    // After dropping a pile we hold its new position locally until the server
    // confirms it, so the pile doesn't blink back to its old spot for a frame.
    const [optimisticPiles, setOptimisticPiles] = useState({})
    useEffect(() => {
        setOptimisticPiles((prev) => {
            const ids = Object.keys(prev)
            if (ids.length === 0) return prev
            const next = {}
            for (const id of ids) {
                const p = state.piles.find((pl) => pl.id === id)
                // Keep the override until the server pile reaches it (or the pile is gone).
                if (p && (p.x !== prev[id].x || p.y !== prev[id].y)) next[id] = prev[id]
            }
            return next
        })
    }, [state.piles])

    // Same optimistic-position trick for zones (so a dropped zone doesn't blink).
    const [optimisticZones, setOptimisticZones] = useState({})
    useEffect(() => {
        setOptimisticZones((prev) => {
            const ids = Object.keys(prev)
            if (ids.length === 0) return prev
            const next = {}
            for (const id of ids) {
                const z = state.zones.find((zz) => zz.id === id)
                if (z && (z.x !== prev[id].x || z.y !== prev[id].y)) next[id] = prev[id]
            }
            return next
        })
    }, [state.zones])

    // Optimistic cross-container move (hand↔table↔zone), cleared once the server
    // snapshot reflects it. Removes the blink and lets the card glide into place.
    // Cleared in a layout effect so the frame where both the optimistic and the
    // real (just-confirmed) card exist is never painted.
    const [pending, setPending] = useState(null)
    useLayoutEffect(() => setPending(null), [state])

    // Glide each optimistically-placed card from the drop point to its new slot.
    useLayoutEffect(() => {
        if (!pending || pending.fromX == null || !tableRef.current) return
        const targets = [
            ...pending.addPiles.map((p) => `[data-pile="${p.id}"]`),
            ...pending.addZoneItems.map((a) => `[data-zoneitem="${a.item.id}"]`),
        ]
        for (const sel of targets) {
            const el = tableRef.current.querySelector(sel)
            if (!el) continue
            const r = el.getBoundingClientRect()
            const dx = pending.fromX - r.left
            const dy = pending.fromY - r.top
            if (!dx && !dy) continue
            el.style.transition = 'none'
            el.style.transform = `translate(${dx}px, ${dy}px)`
            requestAnimationFrame(() => {
                el.style.transition = `transform ${FLY_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1)`
                el.style.transform = ''
            })
            el.addEventListener(
                'transitionend',
                () => {
                    el.style.transition = ''
                    el.style.transform = ''
                },
                { once: true },
            )
        }
    }, [pending])

    // ---- drag plumbing (shared by pile + hand drags) --------------------
    function beginDrag(e, partial) {
        e.preventDefault()
        const d = {
            ...partial,
            startX: e.clientX,
            startY: e.clientY,
            clientX: e.clientX,
            clientY: e.clientY,
            moved: false,
        }
        dragRef.current = d
        setDrag(d)
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
    }

    function onMove(e) {
        const d = dragRef.current
        if (!d) return
        d.clientX = e.clientX
        d.clientY = e.clientY
        if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > CLICK_SLOP) d.moved = true
        setDrag({ ...d })
    }

    function onUp(e) {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        const d = dragRef.current
        dragRef.current = null
        setDrag(null)
        if (!d) return
        if (d.kind === 'group') endGroupDrag(d, e)
        else if (d.kind === 'pile') endPileDrag(d, e)
        else if (d.kind === 'zone') endZoneDrag(d, e)
        else if (d.kind === 'zoneitem') endZoneItemDrag(d, e)
        else endHandDrag(d, e)
    }

    // ---- marquee multi-select -------------------------------------------
    // A pointer-down on the bare felt starts a rubber-band box; every pile whose
    // card rect intersects it becomes the selection. A click with no drag clears
    // the selection. Piles, zones and seats have their own handlers, so a press
    // that lands on one is ignored here.
    function startMarquee(e) {
        if (e.button !== 0) return
        if (e.target.closest('[data-pile], [data-zone], .seat, .carry-card, .drag-ghost')) return
        // Stop the press from also starting a native text selection on the felt.
        e.preventDefault()
        const table = tableRef.current.getBoundingClientRect()
        const x0 = e.clientX - table.left
        const y0 = e.clientY - table.top
        const m = { x0, y0, x1: x0, y1: y0 }
        marqueeRef.current = m
        setMarquee(m)
        window.addEventListener('pointermove', onMarqueeMove)
        window.addEventListener('pointerup', onMarqueeUp)
    }

    function onMarqueeMove(e) {
        const m = marqueeRef.current
        if (!m) return
        const table = tableRef.current.getBoundingClientRect()
        const next = { ...m, x1: e.clientX - table.left, y1: e.clientY - table.top }
        marqueeRef.current = next
        setMarquee(next)
        setSelectedIds(thingsInRect(next))
    }

    function onMarqueeUp() {
        window.removeEventListener('pointermove', onMarqueeMove)
        window.removeEventListener('pointerup', onMarqueeUp)
        const m = marqueeRef.current
        marqueeRef.current = null
        setMarquee(null)
        if (!m) return
        const moved = Math.abs(m.x1 - m.x0) > CLICK_SLOP || Math.abs(m.y1 - m.y0) > CLICK_SLOP
        setSelectedIds(moved ? thingsInRect(m) : new Set())
    }

    // The ids of every selectable thing — table pile or zone item — whose card
    // rect overlaps a marquee rectangle (table-relative coords).
    function thingsInRect(m) {
        const rx0 = Math.min(m.x0, m.x1)
        const ry0 = Math.min(m.y0, m.y1)
        const rx1 = Math.max(m.x0, m.x1)
        const ry1 = Math.max(m.y0, m.y1)
        const hit = new Set()
        for (const p of stateRef.current.piles) {
            if (p.x < rx1 && p.x + CARD_W > rx0 && p.y < ry1 && p.y + CARD_H > ry0) hit.add(p.id)
        }
        if (tableRef.current) {
            const table = tableRef.current.getBoundingClientRect()
            for (const el of tableRef.current.querySelectorAll('[data-zoneitem]')) {
                const r = el.getBoundingClientRect()
                const ix0 = r.left - table.left
                const iy0 = r.top - table.top
                if (ix0 < rx1 && ix0 + r.width > rx0 && iy0 < ry1 && iy0 + r.height > ry0)
                    hit.add(el.dataset.zoneitem)
            }
        }
        return hit
    }

    // Resolve a selected id to its current location: a table pile or a zone item.
    function locate(id) {
        const pile = stateRef.current.piles.find((p) => p.id === id)
        if (pile) return { kind: 'pile', pile }
        for (const z of stateRef.current.zones)
            for (const it of z.items)
                if (it.id === id) return { kind: 'item', zoneId: z.id, item: it }
        return null
    }

    // ---- group drag (marquee selection) ---------------------------------
    // Grabbing a selected thing (table pile or zone item) carries the WHOLE
    // selection — table piles, zone cards, or a mix — to drop together.
    function startGroupDrag(e, anchorId, rect) {
        const members = []
        for (const id of selectedIds) {
            const loc = locate(id)
            if (!loc) continue
            if (loc.kind === 'pile')
                members.push({
                    kind: 'pile',
                    id,
                    x: optimisticPiles[id]?.x ?? loc.pile.x,
                    y: optimisticPiles[id]?.y ?? loc.pile.y,
                    cards: loc.pile.cards,
                    count: loc.pile.count,
                })
            else
                members.push({
                    kind: 'item',
                    id,
                    zoneId: loc.zoneId,
                    cards: loc.item.cards,
                    count: loc.item.count,
                })
        }
        bringToFront(members.filter((m) => m.kind === 'pile').map((m) => m.id))
        beginDrag(e, {
            kind: 'group',
            id: anchorId,
            members,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        })
    }

    // ---- pile drag ------------------------------------------------------
    function startPileDrag(e, pile) {
        if (e.button === 2) return // right click opens the context menu instead
        setMenu(null)
        setSelMenu(null)
        const rect = e.currentTarget.getBoundingClientRect()
        // A selected pile drags the whole selection; an unselected pile drags only
        // its TOP card (and clears any existing selection).
        if (selectedIds.has(pile.id)) {
            startGroupDrag(e, pile.id, rect)
            return
        }
        if (selectedIds.size) setSelectedIds(new Set())
        bringToFront(pile.id) // operating on it (move or click-to-flip) lifts it on top
        beginDrag(e, {
            kind: 'pile',
            id: pile.id,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        })
    }

    // Drop a whole marquee selection: into the hand (all cards), into a zone (all
    // become items there), or repositioned on the table.
    function endGroupDrag(d, e) {
        if (!d.moved) {
            // A click on a selected thing still flips its top card.
            const m = d.members.find((x) => x.id === d.id)
            if (m?.kind === 'item') actions.flipZoneItem(m.zoneId, m.id, 'top')
            else actions.flip(d.id, 'top')
            return
        }
        const table = tableRef.current.getBoundingClientRect()
        const fromX = e.clientX - d.offsetX
        const fromY = e.clientY - d.offsetY
        // Every group drop is ONE batched server action so the client gets a single
        // snapshot. Emitting per-member would let the first broadcast clear the
        // optimistic state while the rest are still in flight — that's the blink.

        // → hand: pull every member's cards into my hand (only when over the hand
        // panel itself, not the play area beside it).
        if (overHand(e.clientX, e.clientY)) {
            const hide = new Set()
            for (const m of d.members) for (const c of m.cards) hide.add(c.id)
            setPending({ hide, addPiles: [], addZoneItems: [] })
            actions.piecesToHand(d.members.map((m) => m.id))
            setSelectedIds(new Set())
            return
        }

        // → into a zone: every member becomes an item there.
        const zone = zoneAtPoint(e.clientX, e.clientY)
        if (zone) {
            const baseIndex =
                stateRef.current.zones.find((z) => z.id === zone.id)?.items.length ?? 0
            const moving = d.members.filter((m) => !(m.kind === 'item' && m.zoneId === zone.id))
            const hide = new Set()
            const addZoneItems = moving.map((m, i) => {
                for (const c of m.cards) hide.add(c.id)
                return {
                    zoneId: zone.id,
                    index: baseIndex + i,
                    item: { id: `opt-${m.id}`, count: m.count, cards: m.cards },
                }
            })
            setPending({ hide, addPiles: [], addZoneItems, fromX, fromY })
            bringZoneToFront(zone.id)
            actions.piecesToZone(
                moving.map((m) => m.id),
                zone.id,
                baseIndex,
            )
            setSelectedIds(new Set())
            return
        }

        // → table: shift table piles by the drag delta; lift any zone items out onto
        // the felt near the drop point. Positions for every piece go in one batch.
        const dx = e.clientX - d.startX
        const dy = e.clientY - d.startY
        const baseX = Math.round(e.clientX - table.left - d.offsetX)
        const baseY = Math.round(e.clientY - table.top - d.offsetY)
        const placements = {}
        const addPiles = []
        const hide = new Set()
        const optPos = {}
        let spread = 0
        for (const m of d.members) {
            if (m.kind === 'pile') {
                const { x, y } = clampSafe(m.x + dx, m.y + dy)
                placements[m.id] = { x, y }
                optPos[m.id] = { x, y }
            } else {
                const { x, y } = clampSafe(baseX + spread * 26, baseY + spread * 26)
                spread++
                placements[m.id] = { x, y }
                addPiles.push({ id: `opt-${m.id}`, x, y, count: m.count, cards: m.cards })
                for (const c of m.cards) hide.add(c.id)
            }
        }
        if (Object.keys(optPos).length) setOptimisticPiles((prev) => ({ ...prev, ...optPos }))
        setPending({ hide, addPiles, addZoneItems: [], fromX, fromY })
        actions.piecesToTable(
            d.members.map((m) => m.id),
            placements,
        )
        // Item ids change on the way out to the table, so clear the selection.
        if (d.members.some((m) => m.kind === 'item')) setSelectedIds(new Set())
    }

    function endPileDrag(d, e) {
        const table = tableRef.current.getBoundingClientRect()

        // TOP-card drag (unselected): carry just the top card to hand / zone / pile / table.
        if (!d.moved) {
            actions.flip(d.id, 'top') // a click flips the top card
            return
        }
        const pile = stateRef.current.piles.find((p) => p.id === d.id)
        const top = pile?.cards[pile.cards.length - 1]
        const fromX = e.clientX - d.offsetX
        const fromY = e.clientY - d.offsetY

        if (overHand(e.clientX, e.clientY)) {
            if (top) setPending({ hide: new Set([top.id]), addPiles: [], addZoneItems: [] })
            actions.pickup(d.id, 1) // draw the top card into your hand
            return
        }
        const zone = zoneAtPoint(e.clientX, e.clientY)
        if (zone) {
            const index = zoneInsertIndex(zone.el, e.clientX, e.clientY)
            if (top) {
                setPending({
                    hide: new Set([top.id]),
                    addPiles: [],
                    addZoneItems: [
                        {
                            zoneId: zone.id,
                            index,
                            item: { id: `opt-${top.id}`, count: 1, cards: [top] },
                        },
                    ],
                    fromX,
                    fromY,
                })
            }
            bringZoneToFront(zone.id)
            actions.topToZone(d.id, zone.id, index)
            return
        }
        // Released back over its own pile → keep the top card there (don't separate
        // it). Only for stacks: a single-card pile has nothing to separate, so a
        // small drag should just move it rather than be a no-op.
        if (pile && pile.count > 1) {
            const cardX = e.clientX - table.left - d.offsetX
            const cardY = e.clientY - table.top - d.offsetY
            const overSelf =
                cardX < pile.x + CARD_W &&
                cardX + CARD_W > pile.x &&
                cardY < pile.y + CARD_H &&
                cardY + CARD_H > pile.y
            if (overSelf) return
        }
        const target = nearestPile(d.id, e.clientX, e.clientY, table)
        if (target) {
            // Drop the top card onto the nearby pile.
            if (top) setPending({ hide: new Set([top.id]), addPiles: [], addZoneItems: [] })
            actions.topToPile(d.id, target.id)
            return
        }
        // Empty table: peel the top card into a new pile where it was dropped.
        const { x, y } = clampSafe(
            e.clientX - table.left - d.offsetX,
            e.clientY - table.top - d.offsetY,
        )
        if (top) {
            setPending({
                hide: new Set([top.id]),
                addPiles: [{ id: `opt-${top.id}`, x, y, count: 1, cards: [top] }],
                addZoneItems: [],
                fromX,
                fromY,
            })
        }
        actions.split(d.id, 1, x, y)
    }

    function nearestPile(excludeId, clientX, clientY, table) {
        let best = null
        let bestDist = MERGE_RADIUS
        for (const p of stateRef.current.piles) {
            if (p.id === excludeId) continue
            const cx = table.left + p.x + CARD_W / 2
            const cy = table.top + p.y + CARD_H / 2
            const dist = Math.hypot(clientX - cx, clientY - cy)
            if (dist < bestDist) {
                bestDist = dist
                best = p
            }
        }
        return best
    }

    function openPileMenu(e, pile) {
        e.preventDefault()
        e.stopPropagation()
        // Right-clicking any pile in a multi-selection opens the batch menu instead.
        if (selectedIds.has(pile.id) && selectedIds.size > 1) {
            openSelectionMenu(e)
            return
        }
        bringToFront(pile.id) // menu actions (flip/shuffle/…) operate on this pile
        setSelMenu(null)
        setMenu({
            pileId: pile.id,
            x: e.clientX,
            y: e.clientY,
            pileX: pile.x,
            pileY: pile.y,
            count: pile.count,
            tableW: tableRef.current?.clientWidth ?? 0,
        })
    }

    function openSelectionMenu(e) {
        setMenu(null)
        setZoneMenu(null)
        setItemMenu(null)
        // Gather point: the top-left-most selected pile, so a gathered deck lands
        // where the selection already sits.
        let gx = Infinity
        let gy = Infinity
        for (const p of stateRef.current.piles) {
            if (!selectedIds.has(p.id)) continue
            const x = optimisticPiles[p.id]?.x ?? p.x
            const y = optimisticPiles[p.id]?.y ?? p.y
            if (y < gy || (y === gy && x < gx)) {
                gx = x
                gy = y
            }
        }
        if (!isFinite(gx)) {
            gx = 0
            gy = 0
        }
        // `ids` is the full selection (piles + zone items) for cross-container
        // actions like flip; `pileIds` is the table-pile subset for gather (which
        // only makes sense for piles).
        const pileIds = [...selectedIds].filter((id) =>
            stateRef.current.piles.some((p) => p.id === id),
        )
        setSelMenu({
            x: e.clientX,
            y: e.clientY,
            ids: [...selectedIds],
            pileIds,
            gatherX: gx,
            gatherY: gy,
        })
    }

    // ---- zones ----------------------------------------------------------
    // The zone DOM rectangle a point falls inside (for drop targeting).
    function zoneAtPoint(clientX, clientY) {
        if (!tableRef.current) return null
        for (const el of tableRef.current.querySelectorAll('[data-zone]')) {
            const r = el.getBoundingClientRect()
            if (
                clientX >= r.left &&
                clientX <= r.right &&
                clientY >= r.top &&
                clientY <= r.bottom
            ) {
                return { id: el.getAttribute('data-zone'), el }
            }
        }
        return null
    }

    // The topmost table pile whose card rect contains a point (table coords), or
    // null. Used so a card dropped over a pile lands on it.
    function pileAtPoint(clientX, clientY) {
        if (!tableRef.current) return null
        const table = tableRef.current.getBoundingClientRect()
        const px = clientX - table.left
        const py = clientY - table.top
        let found = null
        for (const p of stateRef.current.piles) {
            if (px >= p.x && px <= p.x + CARD_W && py >= p.y && py <= p.y + CARD_H) found = p
        }
        return found
    }

    // True only when the cursor is over the hand panel itself. The hand now shares
    // the bottom row with your play area, so a Y-only check would wrongly treat the
    // play area (beside it) as the hand — we check the hand's X extent too.
    function overHand(clientX, clientY) {
        const r = handRef.current?.getBoundingClientRect()
        return !!r && clientY >= r.top && clientX >= r.left && clientX <= r.right
    }

    // Clamp a table position (top-left of a w×h item) into the central play area so
    // it keeps a safe margin from the seat ring and the hand / play areas.
    function clampSafe(x, y, w = CARD_W, h = CARD_H) {
        const t = tableRef.current
        if (!t) return { x, y }
        const maxX = Math.max(SAFE_SIDE, t.clientWidth - SAFE_SIDE - w)
        const maxY = Math.max(SAFE_TOP, t.clientHeight - SAFE_BOTTOM - h)
        return {
            x: Math.round(Math.min(Math.max(x, SAFE_SIDE), maxX)),
            y: Math.round(Math.min(Math.max(y, SAFE_TOP), maxY)),
        }
    }

    // Insertion index among a zone's items for a drop point, in reading order
    // (row-major) so it works for both single-row and grid layouts. Excludes the
    // item being dragged.
    function zoneInsertIndex(zoneEl, clientX, clientY, excludeId) {
        let idx = 0
        for (const k of zoneEl.querySelectorAll('[data-zoneitem]')) {
            if (k.getAttribute('data-zoneitem') === excludeId) continue
            const r = k.getBoundingClientRect()
            const cy = r.top + r.height / 2
            const earlierRow = clientY > cy + r.height / 2
            const sameRowLeft =
                Math.abs(clientY - cy) <= r.height / 2 && clientX > r.left + r.width / 2
            if (earlierRow || sameRowLeft) idx++
        }
        return idx
    }

    function startZoneDrag(e, zone) {
        if (e.button === 2) return
        setMenu(null)
        setZoneMenu(null)
        bringZoneToFront(zone.id)
        const rect = e.currentTarget.parentElement.getBoundingClientRect() // the .zone box
        beginDrag(e, {
            kind: 'zone',
            id: zone.id,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            w: rect.width,
            h: rect.height,
        })
    }

    function endZoneDrag(d, e) {
        if (!d.moved) return
        const table = tableRef.current.getBoundingClientRect()
        const { x, y } = clampSafe(
            e.clientX - table.left - d.offsetX,
            e.clientY - table.top - d.offsetY,
            d.w,
            d.h,
        )
        setOptimisticZones((prev) => ({ ...prev, [d.id]: { x, y } }))
        actions.moveZone(d.id, x, y)
    }

    function startZoneItemDrag(e, zoneId, item) {
        if (e.button === 2) return
        e.stopPropagation()
        setItemMenu(null)
        bringZoneToFront(zoneId)
        const el = e.currentTarget
        const rect = el.getBoundingClientRect()
        // A selected item drags the whole selection; grabbing an unselected one
        // clears the selection and reorders/moves just that item.
        if (selectedIds.has(item.id)) {
            startGroupDrag(e, item.id, rect)
            return
        }
        if (selectedIds.size) setSelectedIds(new Set())
        // Snapshot the source zone's item centres once → stable insertion index
        // for the live reorder (no feedback jitter as items slide around).
        const centers = [...el.closest('.zone').querySelectorAll('[data-zoneitem]')].map((n) => {
            const r = n.getBoundingClientRect()
            return {
                id: n.dataset.zoneitem,
                cx: r.left + r.width / 2,
                cy: r.top + r.height / 2,
                h: r.height,
            }
        })
        beginDrag(e, {
            kind: 'zoneitem',
            id: item.id,
            zoneId,
            card: item.cards[item.cards.length - 1], // top card, for the drag ghost
            centers,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
        })
    }

    // Insertion index among the snapshot's other items, in reading order.
    function snapshotInsertIndex(d, clientX, clientY) {
        let idx = 0
        for (const c of d.centers) {
            if (c.id === d.id) continue
            const earlierRow = clientY > c.cy + c.h / 2
            const sameRowLeft = Math.abs(clientY - c.cy) <= c.h / 2 && c.cx < clientX
            if (earlierRow || sameRowLeft) idx++
        }
        return idx
    }

    // Where a dragged zone item would land: own hand, reorder in place, another
    // zone, or out onto the table.
    function computeZoneItemTarget(d, clientX, clientY) {
        // A zone (your play area, a station, or a table zone) wins wherever the
        // cursor is over it — so reordering within / dropping into the play area
        // isn't mistaken for the hand, which sits on the same row.
        const zone = zoneAtPoint(clientX, clientY)
        if (zone) {
            if (zone.id === d.zoneId)
                return { type: 'reorder', index: snapshotInsertIndex(d, clientX, clientY) }
            return {
                type: 'otherzone',
                zoneId: zone.id,
                index: zoneInsertIndex(zone.el, clientX, clientY, d.id),
            }
        }
        if (overHand(clientX, clientY)) return { type: 'hand' }
        return { type: 'table' }
    }

    // The source zone's items reordered with the dragged item spliced at `index`.
    function zoneItemsWith(d, index) {
        const zone = state.zones.find((z) => z.id === d.zoneId)
        if (!zone) return []
        const dragged = zone.items.find((it) => it.id === d.id)
        const res = zone.items.filter((it) => it.id !== d.id)
        res.splice(Math.min(index, res.length), 0, dragged)
        return res.filter(Boolean)
    }

    function endZoneItemDrag(d, e) {
        if (!d.moved) {
            actions.flipZoneItem(d.zoneId, d.id, 'top') // a click flips the item's top card
            return
        }
        const t = computeZoneItemTarget(d, e.clientX, e.clientY)
        const zone = stateRef.current.zones.find((z) => z.id === d.zoneId)
        const item = zone?.items.find((it) => it.id === d.id)
        const hide = item ? new Set(item.cards.map((c) => c.id)) : new Set()
        const fromX = e.clientX - d.offsetX
        const fromY = e.clientY - d.offsetY
        if (t.type === 'hand') {
            if (item) setPending({ hide, addPiles: [], addZoneItems: [] })
            actions.zoneItemToHand(d.zoneId, d.id)
        } else if (t.type === 'reorder') {
            setOptimisticZoneItems({ zoneId: d.zoneId, items: zoneItemsWith(d, t.index) })
            actions.reorderZoneItem(d.zoneId, d.id, t.index)
        } else if (t.type === 'otherzone') {
            if (item) {
                setPending({
                    hide,
                    addPiles: [],
                    addZoneItems: [
                        {
                            zoneId: t.zoneId,
                            index: t.index,
                            item: { id: `opt-${item.id}`, count: item.count, cards: item.cards },
                        },
                    ],
                    fromX,
                    fromY,
                })
            }
            bringZoneToFront(t.zoneId)
            actions.zoneItemToZone(d.zoneId, d.id, t.zoneId, t.index)
        } else {
            const table = tableRef.current.getBoundingClientRect()
            const { x, y } = clampSafe(
                e.clientX - table.left - d.offsetX,
                e.clientY - table.top - d.offsetY,
            )
            if (item) {
                setPending({
                    hide,
                    addPiles: [
                        { id: `opt-${item.id}`, x, y, count: item.count, cards: item.cards },
                    ],
                    addZoneItems: [],
                    fromX,
                    fromY,
                })
            }
            actions.zoneItemToTable(d.zoneId, d.id, x, y)
        }
    }

    // The sort/shuffle dropdown — shared by zones and the hand. It carries the
    // target's sort/shuffle callbacks so the same menu drives either.
    function openSortMenu(e, zone) {
        e.preventDefault()
        e.stopPropagation()
        bringZoneToFront(zone.id)
        const r = e.currentTarget.getBoundingClientRect()
        setSortMenu({
            x: r.left,
            y: r.bottom + 4,
            onSort: (by) => actions.sortZone(zone.id, by),
            onShuffle: () => actions.shuffleZone(zone.id),
        })
    }
    function openHandSort(e) {
        e.preventDefault()
        e.stopPropagation()
        const r = e.currentTarget.getBoundingClientRect()
        setSortMenu({
            x: r.left,
            y: r.bottom + 4,
            onSort: (by) => actions.sortHand(by),
            onShuffle: () => actions.shuffleHand(),
        })
    }

    function openZoneMenu(e, zone) {
        e.preventDefault()
        e.stopPropagation()
        setItemMenu(null)
        bringZoneToFront(zone.id)
        setZoneMenu({
            zoneId: zone.id,
            x: e.clientX,
            y: e.clientY,
            count: zone.items.length,
            name: zone.name,
            layout: zone.layout,
            perRow: zone.perRow,
            fixed: zone.seat != null, // a board has no rename/remove
        })
    }

    // Right-clicking a card/pile inside a zone opens the item menu, not the zone menu.
    function openItemMenu(e, zoneId, item) {
        e.preventDefault()
        e.stopPropagation()
        // A selected item that's part of a multi-selection opens the batch menu.
        if (selectedIds.has(item.id) && selectedIds.size > 1) {
            openSelectionMenu(e)
            return
        }
        setZoneMenu(null)
        bringZoneToFront(zoneId)
        setItemMenu({ zoneId, itemId: item.id, x: e.clientX, y: e.clientY, count: item.count })
    }

    function addZone() {
        const n = state.zones.length
        actions.createZone(60 + (n % 6) * 26, 90 + (n % 6) * 26)
    }

    // Remove a zone, leaving each item as a pile where it sat on screen.
    function removeZoneWithPositions(zoneId) {
        const zoneEl = tableRef.current?.querySelector(`[data-zone="${zoneId}"]`)
        const table = tableRef.current.getBoundingClientRect()
        const positions = {}
        for (const el of zoneEl?.querySelectorAll('[data-zoneitem]') ?? []) {
            const r = el.getBoundingClientRect()
            positions[el.dataset.zoneitem] = {
                x: Math.round(r.left - table.left),
                y: Math.round(r.top - table.top),
            }
        }
        actions.removeZone(zoneId, positions)
    }

    // ---- hand drag ------------------------------------------------------
    function startHandDrag(e, card) {
        const rect = e.currentTarget.getBoundingClientRect()
        // Snapshot each card's centre once, up front. Computing the insertion index
        // against this fixed snapshot (instead of the live, reordering DOM) keeps the
        // live sort stable — no feedback jitter as cards slide around.
        const centers = [...handRef.current.querySelectorAll('[data-handcard]')].map((el) => {
            const r = el.getBoundingClientRect()
            return { id: el.dataset.handcard, cx: r.left + r.width / 2 }
        })
        beginDrag(e, {
            kind: 'hand',
            id: card.id,
            card,
            offsetX: e.clientX - rect.left,
            offsetY: e.clientY - rect.top,
            centers,
        })
    }

    // Where the dragged card would land — over a zone adds it to that zone, over
    // the open table plays it there, otherwise an insertion index in the hand.
    function computeHandTarget(d, clientX, clientY) {
        const hand = handRef.current.getBoundingClientRect()
        const table = tableRef.current.getBoundingClientRect()
        const x = clientX - table.left - d.offsetX
        const y = clientY - table.top - d.offsetY
        // A zone (table zone OR your play area, which sits beside the hand on the
        // same row) takes priority wherever the cursor is over it.
        const zone = zoneAtPoint(clientX, clientY)
        if (zone) {
            return {
                type: 'zone',
                zoneId: zone.id,
                index: zoneInsertIndex(zone.el, clientX, clientY),
                x,
                y,
            }
        }
        if (clientY < hand.top) {
            const pile = pileAtPoint(clientX, clientY)
            if (pile) return { type: 'pile', pileId: pile.id, x, y }
            return { type: 'table', x, y }
        }
        const others = d.centers.filter((c) => c.id !== d.id)
        const index = others.filter((c) => c.cx < clientX).length
        return { type: 'hand', index }
    }

    // The hand order to display while dragging: the other cards in their original
    // order, with the dragged card spliced in at `index`.
    function handOrderWith(d, index) {
        const byId = new Map(state.hand.map((c) => [c.id, c]))
        const ordered = d.centers
            .map((c) => c.id)
            .filter((id) => id !== d.id)
            .map((id) => byId.get(id))
        ordered.splice(Math.min(index, ordered.length), 0, byId.get(d.id))
        return ordered.filter(Boolean)
    }

    function endHandDrag(d, e) {
        if (!d.moved) return
        const t = computeHandTarget(d, e.clientX, e.clientY)
        const card = stateRef.current.hand.find((c) => c.id === d.id)
        const fromX = e.clientX - d.offsetX
        const fromY = e.clientY - d.offsetY
        if (t.type === 'zone') {
            if (card) {
                setPending({
                    hide: new Set([card.id]),
                    addPiles: [],
                    addZoneItems: [
                        {
                            zoneId: t.zoneId,
                            index: t.index,
                            item: {
                                id: `opt-${card.id}`,
                                count: 1,
                                cards: [cardView(card, playFaceUp)],
                            },
                        },
                    ],
                    fromX,
                    fromY,
                })
            }
            bringZoneToFront(t.zoneId)
            actions.handCardToZone(d.id, t.zoneId, t.index, playFaceUp)
        } else if (t.type === 'pile') {
            // Dropped over an existing pile → add the card on top of it.
            if (card) setPending({ hide: new Set([card.id]), addPiles: [], addZoneItems: [] })
            actions.playOnPile(d.id, t.pileId, playFaceUp)
        } else if (t.type === 'table') {
            const { x, y } = clampSafe(t.x, t.y)
            if (card) {
                setPending({
                    hide: new Set([card.id]),
                    addPiles: [
                        {
                            id: `opt-${card.id}`,
                            x,
                            y,
                            count: 1,
                            cards: [cardView(card, playFaceUp)],
                        },
                    ],
                    addZoneItems: [],
                    fromX,
                    fromY,
                })
            }
            actions.play(d.id, x, y, playFaceUp)
        } else {
            setOptimisticHand(handOrderWith(d, t.index)) // hold the new order until the server confirms
            actions.reorderHand(d.id, t.index)
        }
    }

    useEffect(
        () => () => {
            window.removeEventListener('pointermove', onMove)
            window.removeEventListener('pointerup', onUp)
            window.removeEventListener('pointermove', onMarqueeMove)
            window.removeEventListener('pointerup', onMarqueeUp)
        },
        [],
    )

    const copyCode = () => navigator.clipboard?.writeText(state.code)

    // The snapshot with any optimistic cross-container move applied (no blink).
    const display = applyPending(state, pending)

    // Resolve what the hand shows this frame. While dragging within the hand, the
    // grabbed card is spliced live into the order so it sorts among the others.
    // While dragging up to the table, it's pulled out and a table preview is shown.
    const handTarget =
        drag?.kind === 'hand' && drag.moved && tableRef.current && handRef.current
            ? computeHandTarget(drag, drag.clientX, drag.clientY)
            : null

    let handCards = optimisticHand || display.hand
    let activeId = null
    let tablePreview = null
    if (drag?.kind === 'hand' && handTarget) {
        if (
            handTarget.type === 'table' ||
            handTarget.type === 'zone' ||
            handTarget.type === 'pile'
        ) {
            // Leaving the hand (to the table, a pile, or a zone): pull the card out
            // and show the carried preview at the cursor.
            handCards = state.hand.filter((c) => c.id !== drag.id)
            tablePreview = handTarget
        } else {
            handCards = handOrderWith(drag, handTarget.index)
            activeId = drag.id
        }
    }

    const me = state.players.find((p) => p.id === state.you)
    const amSeated = !!me && me.seat !== null
    const amSpectator = !amSeated
    const spectatorCount = state.players.filter((p) => p.seat === null).length

    // An unselected pile drag carries only the TOP card: a floating carry card
    // follows the cursor while the rest of the pile stays at rest. Only once the
    // pointer actually moves — a click (no move) just flips the card in place.
    const topDrag = drag?.kind === 'pile' && drag.moved ? drag : null
    let topDragCard = null
    if (topDrag) {
        const src = state.piles.find((p) => p.id === topDrag.id)
        topDragCard = src?.cards[src.cards.length - 1] ?? null
    }

    // A group drag with no table piles (pure zone-card selection) has nothing that
    // visibly moves, so show a floating ghost of the grabbed card + a count badge.
    const groupGhost =
        drag?.kind === 'group' && drag.moved && !drag.members.some((m) => m.kind === 'pile')
            ? drag
            : null
    const groupGhostCard = groupGhost
        ? groupGhost.members.find((m) => m.id === groupGhost.id)?.cards.at(-1)
        : null

    // Resolve zone-item drag state: while reordering within the source zone the
    // dragged item sorts in-flow (FLIP); while leaving it's pulled out and a
    // floating ghost is shown. `highlightZoneId` marks a drop target to outline.
    let zoneItemsOverride = null // { zoneId, items }
    let activeZoneItemId = null
    let zoneGhost = false
    let highlightZoneId =
        (drag?.kind === 'pile' || drag?.kind === 'group') && drag.moved && tableRef.current
            ? (zoneAtPoint(drag.clientX, drag.clientY)?.id ?? null)
            : null
    if (drag?.kind === 'hand' && handTarget?.type === 'zone') highlightZoneId = handTarget.zoneId
    if (drag?.kind === 'zoneitem' && drag.moved && tableRef.current) {
        const t = computeZoneItemTarget(drag, drag.clientX, drag.clientY)
        if (t.type === 'reorder') {
            zoneItemsOverride = { zoneId: drag.zoneId, items: zoneItemsWith(drag, t.index) }
            activeZoneItemId = drag.id
        } else {
            const src = state.zones.find((z) => z.id === drag.zoneId)
            zoneItemsOverride = {
                zoneId: drag.zoneId,
                items: src ? src.items.filter((it) => it.id !== drag.id) : [],
            }
            zoneGhost = true
            if (t.type === 'otherzone') highlightZoneId = t.zoneId
        }
    }

    const zoneItemsFor = (zone) => {
        if (zoneItemsOverride?.zoneId === zone.id) return zoneItemsOverride.items
        if (optimisticZoneItems?.zoneId === zone.id) return optimisticZoneItems.items
        return zone.items
    }

    // The pile a dragged card would drop onto, outlined as a drop target: a hand
    // card over a pile, or a carried top card over another pile (its merge target).
    let highlightPileId = null
    if (drag?.kind === 'hand' && handTarget?.type === 'pile') highlightPileId = handTarget.pileId
    if (topDrag && tableRef.current) {
        if (
            !overHand(topDrag.clientX, topDrag.clientY) &&
            !zoneAtPoint(topDrag.clientX, topDrag.clientY)
        ) {
            const np = nearestPile(
                topDrag.id,
                topDrag.clientX,
                topDrag.clientY,
                tableRef.current.getBoundingClientRect(),
            )
            if (np) highlightPileId = np.id
        }
    }

    // Light up the hand panel when a card/pile/selection being dragged is hovering
    // over it (so a drop there reads clearly), the same way zones highlight.
    const handHighlight =
        !!drag &&
        overHand(drag.clientX, drag.clientY) &&
        (drag.kind === 'pile' || drag.kind === 'group' || drag.kind === 'zoneitem')

    // Render piles in stacking order so the most-recently-operated one is on top.
    // Ids not yet in zOrder (fresh / optimistic piles) sort last → also on top.
    const zRank = new Map(zOrder.map((id, i) => [id, i]))
    const orderedPiles = [...display.piles].sort(
        (a, b) => (zRank.get(a.id) ?? Infinity) - (zRank.get(b.id) ?? Infinity),
    )
    // Table zones in stacking order — last operated on top.
    const zoneRank = new Map(zoneOrder.map((id, i) => [id, i]))
    const orderedTableZones = display.zones
        .filter((z) => z.seat == null)
        .sort((a, b) => (zoneRank.get(a.id) ?? Infinity) - (zoneRank.get(b.id) ?? Infinity))

    // Play areas (boards), one per seat. Mine docks by the hand (board-self); every
    // other seat — occupied or empty — is a station in the ring. Empty stations
    // stay droppable and offer a sit/move button.
    const seats = state.seats
    const boards = display.zones.filter((z) => z.seat != null)
    const myBoard = amSeated ? boards.find((b) => b.seat === me.seat) : null
    const otherBoards = boards.filter((b) => b !== myBoard)

    return (
        <div className="game">
            <header className="topbar">
                <div className="brand">♠ Card-Master</div>
                <div className="room-info">
                    <span className="room-code">Room {state.code}</span>
                    <button
                        className="link-btn"
                        onClick={copyCode}
                        title={`Copy code ${state.code}`}
                    >
                        Copy room code
                    </button>
                    <span className="deck-info">
                        {state.config.decks}× deck{state.config.decks > 1 ? 's' : ''}
                        {state.config.jokers ? `, ${state.config.jokers} joker(s)` : ''}
                    </span>
                    <span className="spec-count">👁 {spectatorCount} spectating</span>
                </div>
                <div className="topbar-actions">
                    <button className="reset-btn" onClick={addZone}>
                        ＋ Zone
                    </button>
                    <button className="reset-btn" onClick={() => setShowSettings(true)}>
                        ⚙ Room settings
                    </button>
                    <button
                        className="reset-btn"
                        onClick={() =>
                            confirm('Collect all cards on the table into one deck?') &&
                            actions.collect()
                        }
                    >
                        Clean table
                    </button>
                    <button
                        className="reset-btn"
                        onClick={() => confirm('Reset table to a fresh deck?') && actions.reset()}
                    >
                        Reset
                    </button>
                    <button
                        className="reset-btn"
                        onClick={() => confirm('Leave this room?') && game.leaveRoom()}
                    >
                        Leave
                    </button>
                </div>
            </header>

            <main
                className="table"
                ref={tableRef}
                onPointerDown={(e) => {
                    setMenu(null)
                    setZoneMenu(null)
                    setItemMenu(null)
                    setSelMenu(null)
                    startMarquee(e)
                }}
                onContextMenu={(e) => e.preventDefault()}
            >
                {orderedTableZones.map((zone) => {
                    const opt = optimisticZones[zone.id]
                    let left = opt ? opt.x : zone.x
                    let top = opt ? opt.y : zone.y
                    const zdragging = drag?.kind === 'zone' && drag.id === zone.id
                    if (zdragging && tableRef.current) {
                        const r = tableRef.current.getBoundingClientRect()
                        left = drag.clientX - r.left - drag.offsetX
                        top = drag.clientY - r.top - drag.offsetY
                    }
                    return (
                        <Zone
                            key={zone.id}
                            zone={zone}
                            items={zoneItemsFor(zone)}
                            left={left}
                            top={top}
                            dragging={zdragging}
                            highlight={highlightZoneId === zone.id}
                            selectedIds={selectedIds}
                            activeItemId={zone.id === drag?.zoneId ? activeZoneItemId : null}
                            onHeaderPointerDown={(e) => startZoneDrag(e, zone)}
                            onItemPointerDown={(e, item) => startZoneItemDrag(e, zone.id, item)}
                            onItemContextMenu={(e, item) => openItemMenu(e, zone.id, item)}
                            onContextMenu={(e) => openZoneMenu(e, zone)}
                            onSort={(e) => openSortMenu(e, zone)}
                            onRemove={(e, z) => {
                                e.stopPropagation()
                                if (
                                    z.items.length === 0 ||
                                    confirm('Remove this zone? Its cards stay on the table.')
                                )
                                    removeZoneWithPositions(z.id)
                            }}
                        />
                    )
                })}

                {/* Your own play area docks at the bottom-right, on the hand's row. */}
                {myBoard && (
                    <Zone
                        key={myBoard.id}
                        zone={myBoard}
                        items={zoneItemsFor(myBoard)}
                        highlight={highlightZoneId === myBoard.id}
                        selectedIds={selectedIds}
                        activeItemId={myBoard.id === drag?.zoneId ? activeZoneItemId : null}
                        fixed
                        className="board board-self"
                        label="Your area"
                        onItemPointerDown={(e, item) => startZoneItemDrag(e, myBoard.id, item)}
                        onItemContextMenu={(e, item) => openItemMenu(e, myBoard.id, item)}
                        onContextMenu={(e) => openZoneMenu(e, myBoard)}
                        onSort={(e) => openSortMenu(e, myBoard)}
                    />
                )}

                {/* Every other seat's station — avatar + play area at its position. An
                    occupied seat shows its player; an empty seat shows a sit/move
                    button but still holds (and accepts) cards. The ring shares the
                    exact inset of .seats so a seat doesn't shift when it fills. */}
                <div className={`station-ring ${amSeated ? 'seated' : ''}`}>
                    {otherBoards.map((board) => {
                        const owner = state.players.find(
                            (p) => p.seat !== null && p.seat === board.seat,
                        )
                        const rel = (((board.seat - (me?.seat ?? 0)) % seats) + seats) % seats
                        const { x, y } = seatPlacement(rel / seats)
                        const header = owner ? (
                            <>
                                <div
                                    className="avatar"
                                    style={{ background: owner.color ?? '#555' }}
                                >
                                    {initials(owner.name)}
                                </div>
                                <div className="station-id">
                                    <div className="station-name">{owner.name}</div>
                                    <div className="station-count">{owner.handCount ?? 0} 🂠</div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="avatar empty-avatar">{board.seat + 1}</div>
                                <button
                                    className="zone-btn"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={() => actions.takeSeat(board.seat)}
                                >
                                    {amSpectator ? 'Sit here' : 'Move here'}
                                </button>
                            </>
                        )
                        return (
                            <Zone
                                key={board.id}
                                zone={board}
                                items={zoneItemsFor(board)}
                                highlight={highlightZoneId === board.id}
                                selectedIds={selectedIds}
                                activeItemId={board.id === drag?.zoneId ? activeZoneItemId : null}
                                fixed
                                className={`board board-station ${owner ? '' : 'empty'} ${
                                    owner && !owner.connected ? 'offline' : ''
                                }`}
                                style={{
                                    left: `${x}%`,
                                    top: `${y}%`,
                                    transform: anchorFor(x, y),
                                }}
                                header={header}
                                showActions={false}
                                onItemPointerDown={(e, item) =>
                                    startZoneItemDrag(e, board.id, item)
                                }
                                onItemContextMenu={(e, item) => openItemMenu(e, board.id, item)}
                                onContextMenu={(e) => openZoneMenu(e, board)}
                            />
                        )
                    })}
                </div>

                {orderedPiles.map((pile) => {
                    const optimistic = optimisticPiles[pile.id]
                    // Unselected source pile: only its top card is being carried, so
                    // leave the remainder at rest (or render nothing if it was a lone card).
                    if (topDrag && pile.id === topDrag.id) {
                        if (pile.count <= 1) return null
                        const rest = {
                            ...pile,
                            cards: pile.cards.slice(0, -1),
                            count: pile.count - 1,
                        }
                        return (
                            <Pile
                                key={pile.id}
                                pile={rest}
                                topCard={rest.cards[rest.cards.length - 1]}
                                left={optimistic ? optimistic.x : pile.x}
                                top={optimistic ? optimistic.y : pile.y}
                                dragging={false}
                                settling={false}
                                selected={false}
                                onPointerDown={(e) => startPileDrag(e, pile)}
                                onContextMenu={(e) => openPileMenu(e, pile)}
                            />
                        )
                    }
                    const topCard = pile.cards[pile.cards.length - 1]
                    let left = optimistic ? optimistic.x : pile.x
                    let top = optimistic ? optimistic.y : pile.y
                    // Group (selection) drag: every selected table pile rides the same
                    // delta — but only once moved, so a click just flips in place.
                    const groupBase =
                        drag?.kind === 'group' && drag.moved
                            ? drag.members.find((m) => m.kind === 'pile' && m.id === pile.id)
                            : null
                    const dragging = !!groupBase
                    if (groupBase) {
                        left = groupBase.x + (drag.clientX - drag.startX)
                        top = groupBase.y + (drag.clientY - drag.startY)
                    }
                    return (
                        <Pile
                            key={pile.id}
                            pile={pile}
                            topCard={topCard}
                            left={left}
                            top={top}
                            dragging={dragging}
                            settling={!!optimistic && !dragging}
                            selected={selectedIds.has(pile.id)}
                            highlight={highlightPileId === pile.id}
                            onPointerDown={(e) => startPileDrag(e, pile)}
                            onContextMenu={(e) => openPileMenu(e, pile)}
                        />
                    )
                })}

                {marquee && (
                    <div
                        className="marquee"
                        style={{
                            left: Math.min(marquee.x0, marquee.x1),
                            top: Math.min(marquee.y0, marquee.y1),
                            width: Math.abs(marquee.x1 - marquee.x0),
                            height: Math.abs(marquee.y1 - marquee.y0),
                        }}
                    />
                )}

                {/* Top card lifted off an unselected pile, tracking the cursor. */}
                {topDrag && topDragCard && tableRef.current && (
                    <div
                        className="carry-card"
                        style={{
                            left:
                                topDrag.clientX -
                                tableRef.current.getBoundingClientRect().left -
                                topDrag.offsetX,
                            top:
                                topDrag.clientY -
                                tableRef.current.getBoundingClientRect().top -
                                topDrag.offsetY,
                        }}
                    >
                        <Card card={topDragCard} />
                    </div>
                )}

                {/* The card carried onto the table — sits exactly where it will drop. */}
                {tablePreview && (
                    <div
                        className="carry-card"
                        style={{ left: tablePreview.x, top: tablePreview.y }}
                    >
                        <Card card={drag.card} />
                    </div>
                )}
            </main>

            {amSeated && (
                <Hand
                    ref={handRef}
                    cards={handCards}
                    actions={actions}
                    activeId={activeId}
                    highlight={handHighlight}
                    mode={handMode}
                    onToggleDisplay={() => toggleDisplay('hand', 'overlapped')}
                    playFaceUp={playFaceUp}
                    onTogglePlayFace={() => setPlayFaceUp((v) => !v)}
                    onSort={openHandSort}
                    onCardPointerDown={startHandDrag}
                />
            )}

            {/* While a zone item is being carried OUT of its zone, it follows the
                cursor; reordering within the zone happens in-flow instead. */}
            {drag?.kind === 'zoneitem' && zoneGhost && (
                <div
                    className="drag-ghost"
                    style={{ left: drag.clientX - drag.offsetX, top: drag.clientY - drag.offsetY }}
                >
                    <Card card={drag.card} />
                </div>
            )}

            {/* A pure zone-card selection being dragged: a floating ghost + count. */}
            {groupGhost && groupGhostCard && (
                <div
                    className="drag-ghost"
                    style={{
                        left: groupGhost.clientX - groupGhost.offsetX,
                        top: groupGhost.clientY - groupGhost.offsetY,
                    }}
                >
                    <Card card={groupGhostCard} />
                    {groupGhost.members.length > 1 && (
                        <span className="count-badge">{groupGhost.members.length}</span>
                    )}
                </div>
            )}

            {menu && <ContextMenu menu={menu} actions={actions} onClose={() => setMenu(null)} />}
            {zoneMenu && (
                <ZoneMenu menu={zoneMenu} actions={actions} onClose={() => setZoneMenu(null)} />
            )}
            {itemMenu && (
                <ZoneItemMenu menu={itemMenu} actions={actions} onClose={() => setItemMenu(null)} />
            )}
            {selMenu && (
                <SelectionMenu
                    menu={selMenu}
                    actions={actions}
                    onClear={() => setSelectedIds(new Set())}
                    onClose={() => setSelMenu(null)}
                />
            )}
            {sortMenu && (
                <Menu
                    x={sortMenu.x}
                    y={sortMenu.y}
                    items={[
                        { label: 'By rank', onClick: () => sortMenu.onSort('rank') },
                        { label: 'By suit', onClick: () => sortMenu.onSort('suit') },
                        { separator: true },
                        { label: 'Shuffle', onClick: () => sortMenu.onShuffle() },
                    ]}
                    onClose={() => setSortMenu(null)}
                />
            )}
            {showSettings && (
                <RoomSettings
                    state={state}
                    actions={actions}
                    onClose={() => setShowSettings(false)}
                />
            )}
        </div>
    )
}
