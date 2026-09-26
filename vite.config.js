/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Logic, lifecycle and repository contract tests run in Node. Backend tests
  // inject mock transports; they do not verify production services.
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'worker/src/**/*.test.js', 'scripts/**/*.test.js'],
  },
})
