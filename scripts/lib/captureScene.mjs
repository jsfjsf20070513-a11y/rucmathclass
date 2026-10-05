import { FIXTURE_TIME } from './localFixture.mjs'

export async function captureScene(browser, demo, viewport, path) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'Asia/Shanghai', reducedMotion: 'reduce', serviceWorkers: 'block' })
  const failures = []
  await context.route('**/*', (route) => {
    if (new URL(route.request().url()).origin === demo.origin) return route.continue()
    failures.push(`出现外部请求：${new URL(route.request().url()).origin}`)
    return route.abort()
  })
  await context.routeWebSocket('**/*', (socket) => socket.close())
  await context.addInitScript(() => {
    let seed = 42
    Math.random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  // 只给静态截图固定时钟；供人操作的演示和交互检查不冻结 Date.now。
  await page.clock.setFixedTime(new Date(FIXTURE_TIME))
  page.on('pageerror', (error) => failures.push(error.message))
  try {
    await page.goto(demo.url)
    await page.locator('#root > :not(.boot-overlay)').first().waitFor()
    await page.waitForFunction(() => !document.querySelector('.boot-overlay'))
    if (demo.scene.answer || demo.scene.finish) {
      const options = page.locator('.vpl-option')
      await options.first().waitFor()
      const labels = await options.allTextContents()
      await options.nth(labels.findIndex((label) => !label.includes('你好'))).click()
      if (demo.scene.finish) await page.getByRole('button', { name: /Terminer/ }).click()
      else await page.getByRole('button', { name: '重试保存 →' }).waitFor()
    }
    if (demo.scene.chatStatus) {
      await page.getByRole('textbox', { name: '向 AI 助手提问' }).fill('解释一下导数。')
      await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
      await page.getByRole('alert').waitFor()
    }
    const ready = demo.scene.path.startsWith('/vocabulary') ? (demo.scene.queue ? '.vpl-match' : demo.scene.finish ? '.vpl-card-done' : demo.scene.study ? '.vpl-study-zh' : demo.scene.emptyReviews ? '.vpl-filters' : demo.scene.answer ? '.vpl-fb' : '.vpl-commencer')
      : demo.scene.path.startsWith('/assistant') ? (demo.scene.emptyHistory ? '.cor-masthead' : '.cor-r-text')
        : demo.scene.path.startsWith('/resources') ? '.bib-entry-title'
          : demo.scene.path === '/' ? '.mag-masthead' : '.lgn-title'
    await page.locator(ready).first().waitFor()
    if (demo.scene.resourcesUnavailable) await page.getByRole('button', { name: '重试', exact: true }).waitFor()
    if (demo.scene.path === '/reset-password') await page.locator('.password-field input').nth(1).waitFor()
    if (demo.scene.emptyReviews) await page.locator('.vpl-card-notice .page-notice').waitFor()
    await page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all([...document.images].filter((image) => image.src).map((image) => image.decode()))
    })
    await page.waitForFunction(() => [...document.querySelectorAll('[data-animate], .mag-cover-content')].filter((item) => !item.closest('[inert]')).every((item) => Number(getComputedStyle(item).opacity) >= 0.99))
    if (failures.length) throw new Error(failures.join('\n'))
    await page.screenshot({ path, fullPage: true, animations: 'disabled' })
  } catch (error) {
    await page.screenshot({ path: path.replace(/\.png$/, '-failed.png'), fullPage: true }).catch(() => {})
    throw error
  } finally { await context.close() }
}

export async function composeComparison(browser, left, right, path, labels) {
  const page = await browser.newPage()
  try {
    const dataUrl = await page.evaluate(async ({ left, right, labels }) => {
      const load = (data) => new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = data })
      const [before, after] = await Promise.all([load(left), load(right)])
      const header = 72, gap = 20
      const canvas = document.createElement('canvas')
      canvas.width = before.width + after.width + gap
      canvas.height = Math.max(before.height, after.height) + header
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#efeeeb'; ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#30383d'; ctx.textAlign = 'center'; ctx.font = '24px sans-serif'
      ctx.fillText('改前', before.width / 2, 30); ctx.fillText('改后', before.width + gap + after.width / 2, 30)
      ctx.font = '12px sans-serif'
      ctx.fillText(labels[0], before.width / 2, 53); ctx.fillText(labels[1], before.width + gap + after.width / 2, 53)
      ctx.drawImage(before, 0, header); ctx.drawImage(after, before.width + gap, header)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { left: `data:image/png;base64,${left.toString('base64')}`, right: `data:image/png;base64,${right.toString('base64')}`, labels })
    const { writeFile } = await import('node:fs/promises')
    await writeFile(path, Buffer.from(dataUrl, 'base64'))
  } finally { await page.close() }
}
