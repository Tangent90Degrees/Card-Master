import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { Server } from 'socket.io'
import { attachSockets } from './socket.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3001
const HOST = process.env.HOST || '0.0.0.0'
const isProd = process.env.NODE_ENV === 'production'
const clientRoot = path.resolve(__dirname, '../../client')

const app = express()
const server = http.createServer(app)

// Single origin: the client is served by this same server (Vite middleware in
// dev, built files in prod) and Socket.IO lives on the same HTTP server, so no
// CORS is needed and there is no second port to reach.
const io = new Server(server)
attachSockets(io)

app.get('/healthz', (_req, res) => res.json({ ok: true }))

if (isProd) {
    // Serve the built React client.
    const dist = path.join(clientRoot, 'dist')
    app.use(express.static(dist))
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')))
} else {
    // Dev: run Vite in middleware mode so the UI (with HMR) and the API share
    // this one port. HMR rides the same HTTP server, so only one port is exposed.
    const { createServer: createViteServer } = await import('vite')
    const vite = await createViteServer({
        root: clientRoot,
        appType: 'spa',
        // allowedHosts: true — dev is reached through a VM/proxy hostname, not just
        // localhost, and Vite otherwise blocks requests with an unknown Host header.
        server: { middlewareMode: true, hmr: { server }, allowedHosts: true },
    })
    app.use(vite.middlewares)
}

server.listen(PORT, HOST, () => {
    console.log(`Card-Master running on http://localhost:${PORT}`)
})
