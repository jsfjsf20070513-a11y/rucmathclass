/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const bootSource = readFileSync(new URL('./public/boot-start.js', import.meta.url))
const bootFileName = `assets/boot-start-${createHash('sha256').update(bootSource).digest('hex').slice(0, 12)}.js`
const bootTag = '<script src="/boot-start.js"></script>'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), {
    name: 'version-boot-script',
    apply: 'build',
    buildStart() {
      this.emitFile({ type: 'asset', fileName: bootFileName, source: bootSource })
    },
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!html.includes(bootTag)) throw new Error('找不到启动脚本标签，无法生成带版本的启动脚本。')
        // Keep this a classic script: recovery must work even if the module entry fails.
        return html.replace(bootTag, `<script src="/${bootFileName}"></script>`)
      },
    },
  }],
  // Logic, lifecycle and repository contract tests run in Node. Backend tests
  // inject mock transports; they do not verify production services.
  test: {
    environment: 'node',
    include: ['src/**/*.test.js', 'worker/src/**/*.test.js', 'scripts/**/*.test.js'],
  },
})
