import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The client is served by the Express server (Vite middleware in dev, built
// files in prod), all on one port — so no dev-server host/port/proxy is needed.
export default defineConfig({
    plugins: [react()],
})
