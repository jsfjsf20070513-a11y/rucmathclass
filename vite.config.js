/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Unit tests cover the pure security-critical helpers (URL sanitizing,
  // ops-queue envelope decoding). They run in a plain Node environment — no
  // jsdom — so importing src/lib/supabase.js stays inert (no VITE_SUPABASE_*
  // env → isSupabaseConfigured is false → no client).
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'worker/src/**/*.test.js'],
  },
})
