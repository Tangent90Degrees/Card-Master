import { io } from 'socket.io-client'

// Always connect to the SAME ORIGIN that served the page.
//  - dev:  Vite proxies /socket.io to the backend on :3001 (see vite.config.js)
//  - prod: the backend serves the client and handles /socket.io directly
// This works no matter how you reach the host (localhost, LAN IP, SSH tunnel,
// or a forwarded port) — there is no hardcoded hostname to get wrong.
export const socket = io({ autoConnect: true })
