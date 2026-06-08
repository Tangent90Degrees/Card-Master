import { customAlphabet } from 'nanoid'
import { Room } from './room.js'

// Unambiguous uppercase alphabet (no 0/O, 1/I) for human-friendly room codes.
const genCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 5)

/** In-memory registry of active rooms. Rooms are removed once empty. */
export class RoomStore {
    constructor() {
        this.rooms = new Map() // code -> Room
    }

    create(config) {
        let code = genCode()
        while (this.rooms.has(code)) code = genCode()
        const room = new Room(code, config)
        this.rooms.set(code, room)
        return room
    }

    get(code) {
        return this.rooms.get(String(code || '').toUpperCase())
    }

    /** Drop the room if it has no players left. Returns true if removed. */
    pruneIfEmpty(code) {
        const room = this.rooms.get(code)
        if (room && room.isEmpty) {
            this.rooms.delete(code)
            return true
        }
        return false
    }
}
