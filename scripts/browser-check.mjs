import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { preview } from 'vite'
import { createAccountFixture } from './browser-account-fixture.mjs'
import { checkRegressions } from './browser-regressions.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))
const output = join(root, 'output/playwright')
const buildDir = await mkdtemp(join(tmpdir(), 'mathclass-browser-'))
const healthPath = join(root, 'public/health.json')
const originalHealth = await readFile(healthPath)
let server, browser, baseUrl

async function rendered(page, selector) {
  await page.waitForFunction((query) => {
    const element = document.querySelector(query)
    if (!element || element.closest('[inert]')) return false
    const box = element.getBoundingClientRect()
    const visible = { left: Math.max(0, box.left), right: Math.min(innerWidth, box.right), top: Math.max(0, box.top), bottom: Math.min(innerHeight, box.bottom) }
    for (let node = element; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      if (style.visibility === 'hidden' || Number(style.opacity) < 0.99) return false
      if (node !== element) {
        const bounds = node.getBoundingClientRect()
        if (/(hidden|clip|scroll|auto)/.test(style.overflowX)) {
          visible.left = Math.max(visible.left, bounds.left)
          visible.right = Math.min(visible.right, bounds.right)
        }
        if (/(hidden|clip|scroll|auto)/.test(style.overflowY)) {
          visible.top = Math.max(visible.top, bounds.top)
          visible.bottom = Math.min(visible.bottom, bounds.bottom)
        }
      }
    }
    return visible.right - visible.left > 1 && visible.bottom - visible.top > 1
  }, selector)
}

async function settledPages(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('.mag-page:not([inert]), .bib-page:not([inert])')]
    .every((element) => [...element.querySelectorAll('[data-animate]')].every((item) => Number(getComputedStyle(item).opacity) >= 0.99)))
}

async function noHorizontalOverflow(page) {
  const { width, scrollWidth } = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }))
  assert.ok(scrollWidth <= width + 1, `Horizontal overflow: ${scrollWidth} > ${width} at ${page.url()}`)
}

async function scenario(name, viewport, run) {
  const context = await browser.newContext({ viewport })
  const errors = []
  const unexpectedRequests = []
  const fault = { chunk: '', kind: '', resourcesUnavailable: false, chatStatus: 200 }
  const account = createAccountFixture(fault)
  // Every non-local request is intercepted. The build uses only placeholder
  // Supabase/AI configuration, and no real account is created or signed in.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === baseUrl) {
      if (fault.chunk && url.pathname.includes(fault.chunk) && url.pathname.endsWith('.js')) {
        if (fault.kind === 'fail') return route.fulfill({ status: 503, body: 'fixture unavailable' })
        if (fault.kind === 'slow') await new Promise((resolve) => setTimeout(resolve, 2200))
      }
      return route.continue()
    }
    if (url.hostname === 'fixture.invalid' && url.pathname === '/rest/v1/resources') {
      return route.fulfill({ status: fault.resourcesUnavailable ? 503 : 200, contentType: 'application/json', body: fault.resourcesUnavailable ? '{"message":"fixture unavailable"}' : '[]' })
    }
    if (await account.handle(route)) return
    if (url.hostname === 'api.open-meteo.com') {
      return route.fulfill({ json: { current: { temperature_2m: 20, weather_code: name.endsWith('-home') ? 61 : 0, is_day: 1 } } })
    }
    unexpectedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort()
  })
  await context.routeWebSocket('**/*', (socket) => socket.close())
  await context.tracing.start({ screenshots: true, snapshots: true })
  const page = await context.newPage()
  page.setDefaultTimeout(12000)
  page.on('pageerror', (error) => {
    if (fault.kind === 'fail' && /Failed to fetch dynamically imported module|Importing a module script failed/.test(error.message)) return
    errors.push(error.message)
  })
  try {
    await run(page, fault)
    await settledPages(page)
    assert.deepEqual(errors, [], 'Unexpected browser exceptions')
    assert.deepEqual(unexpectedRequests, [], 'Unexpected external API requests')
    await page.screenshot({ path: join(output, `${name}.png`), fullPage: true })
    await context.tracing.stop()
    console.log(`PASS ${name}`)
  } catch (error) {
    await page.screenshot({ path: join(output, `${name}-failed.png`), fullPage: true }).catch(() => {})
    await context.tracing.stop({ path: join(output, `${name}-trace.zip`) }).catch(() => {})
    throw new Error(`${name}: ${error.message}`, { cause: error })
  } finally { await context.close() }
}

try {
  await mkdir(output, { recursive: true })
  execFileSync('npm', ['run', 'build', '--', '--outDir', buildDir], {
    cwd: root, stdio: 'inherit', env: {
      ...process.env, VITE_SUPABASE_URL: 'https://fixture.invalid', VITE_SUPABASE_ANON_KEY: 'local-fixture',
      VITE_AI_ENDPOINT: 'https://fixture.invalid/api/chat',
    },
  })
  server = await preview({ root, build: { outDir: buildDir }, preview: { host: '127.0.0.1', port: 0, strictPort: true } })
  baseUrl = `http://127.0.0.1:${server.httpServer.address().port}`
  browser = await chromium.launch()
  await checkRegressions({ scenario, baseUrl, rendered })
  for (const [size, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
    await scenario(`${size}-home`, viewport, async (page) => {
      await page.goto(baseUrl)
      await rendered(page, '.mag-masthead')
      await page.waitForFunction(() => [...document.querySelectorAll('.mag-wall img[src]')].every((image) => image.complete && image.naturalWidth > 0))
      const images = await page.locator('.mag-wall img[src]').count()
      assert.ok(images > 0 && (size === 'mobile' ? images < 60 : images === 60), `Unexpected portrait count: ${images}`)
      await noHorizontalOverflow(page)
      for (const selector of ['.mag-vocab .mag-giant', '.mag-theorem-title', '.mag-biblio-zh', '.mag-parole-text']) {
        await page.getByRole('button', { name: '下一页', exact: true }).click()
        await rendered(page, selector)
      }
      await page.getByRole('button', { name: 'Connexion · 登录', exact: true }).click()
      await rendered(page, '.mag-connexion-title')
      assert.equal(await page.getByRole('button', { name: '上一页', exact: true }).isDisabled(), true)
      for (let tab = 0; tab < 6; tab += 1) {
        await page.keyboard.press('Tab')
        assert.equal(await page.evaluate(() => Boolean(document.activeElement.closest('[inert]'))), false)
      }
      await page.getByRole('button', { name: '← Retour', exact: true }).click()
      await rendered(page, '.mag-parole-text')
      await page.getByRole('button', { name: '上一页', exact: true }).click()
      await rendered(page, '.mag-biblio-zh')
      await noHorizontalOverflow(page)
      if (size === 'mobile') {
        for (const selector of ['.mag-theorem-title', '.mag-vocab .mag-giant', '.mag-masthead']) {
          await page.getByRole('button', { name: '上一页', exact: true }).click()
          await rendered(page, selector)
        }
        await page.setViewportSize({ width: 1280, height: 800 })
        await page.waitForFunction(() => {
          const images = [...document.querySelectorAll('.mag-wall img[src]')]
          return images.length === 60 && images.every((image) => image.complete && image.naturalWidth > 0)
        })
        await noHorizontalOverflow(page)
      }
    })
    await scenario(`${size}-resources`, viewport, async (page, fault) => {
      fault.resourcesUnavailable = true
      await page.goto(`${baseUrl}/resources`)
      await rendered(page, '.bib-page:not([inert]) .bib-entry-title')
      await page.getByRole('button', { name: '重试', exact: true }).waitFor()
      fault.resourcesUnavailable = false
      await page.getByRole('button', { name: '重试', exact: true }).click()
      await page.getByRole('button', { name: '重试', exact: true }).waitFor({ state: 'hidden' })
      const initial = await page.locator('.bib-folio').textContent()
      await page.getByRole('button', { name: '下一页', exact: true }).click()
      await rendered(page, '.bib-page:not([inert]) .bib-entry-title')
      assert.notEqual(await page.locator('.bib-folio').textContent(), initial)
      await page.getByRole('button', { name: '上一页', exact: true }).click()
      await rendered(page, '.bib-page:not([inert]) .bib-entry-title')
      assert.equal(await page.locator('.bib-folio').textContent(), initial)
      await noHorizontalOverflow(page)
      for (let flips = 0; !await page.getByRole('button', { name: '下一页', exact: true }).isDisabled(); flips += 1) {
        assert.ok(flips < 12, 'Resource pagination did not reach its final shelf')
        await page.getByRole('button', { name: '下一页', exact: true }).click()
        await rendered(page, '.bib-page:not([inert]) .bib-entry-title')
      }
      await page.locator('.bib-page:not([inert]) .section-coda').scrollIntoViewIfNeeded()
      await rendered(page, '.bib-page:not([inert]) .section-coda-translation')
      await noHorizontalOverflow(page)
    })
    await scenario(`${size}-forms`, viewport, async (page) => {
      await page.goto(`${baseUrl}/login`)
      await page.getByRole('textbox', { name: '邮箱', exact: true }).waitFor()
      for (const mode of ['注册', '验证码', '找回密码', '登录']) {
        await page.getByRole('button', { name: mode, exact: true }).click()
        await rendered(page, '.lgn-title')
        await rendered(page, 'input[aria-label="邮箱"]')
        await noHorizontalOverflow(page)
      }
      await page.goto(`${baseUrl}/reset-password`)
      await page.getByRole('link', { name: '重新申请 · 找回密码 →' }).waitFor()
      await rendered(page, '.reset-state a')
      await noHorizontalOverflow(page)
      await page.goto(`${baseUrl}/resources/curate`)
      await page.waitForURL(`${baseUrl}/resources`)
      await rendered(page, '.bib-page:not([inert]) .bib-entry-title')
      await noHorizontalOverflow(page)
    })
    await scenario(`${size}-account-pages`, viewport, async (page, fault) => {
      await page.goto(`${baseUrl}/vocabulary`)
      await page.getByText('背词进度按账号保存,请先登录。', { exact: true }).waitFor()
      await page.getByRole('link', { name: /Connexion/ }).click()
      await page.getByRole('textbox', { name: '邮箱', exact: true }).fill('browser@example.invalid')
      await page.getByLabel('Mot de passe', { exact: true }).fill('local-fixture-only')
      await page.getByRole('button', { name: 'Entrer', exact: true }).click()
      await page.getByRole('heading', { name: 'Bienvenue', exact: true }).waitFor()
      await rendered(page, '.lgn-dest')
      await noHorizontalOverflow(page)
      await page.getByRole('link', { name: /Vocabulaire/ }).click()
      await rendered(page, '.vpl-title')
      await page.getByRole('button', { name: /Commencer/ }).click()
      await rendered(page, '.vpl-study-zh')
      await rendered(page, '.vpl-study-actions button')
      await noHorizontalOverflow(page)
      await page.screenshot({ path: join(output, `${size}-vocabulary.png`), fullPage: true })
      await page.getByRole('button', { name: '← Accueil', exact: true }).click()
      await rendered(page, '.mag-vocab .mag-giant')

      await page.goto(`${baseUrl}/assistant`)
      await rendered(page, '.cor-r-text')
      await rendered(page, '.cor-input')
      assert.equal(await page.locator('.cor-r-text .katex').count(), 1)
      await noHorizontalOverflow(page)
      await page.screenshot({ path: join(output, `${size}-assistant-history.png`), fullPage: true })
      await page.getByRole('button', { name: 'Effacer · 清空', exact: true }).click()
      await rendered(page, '.cor-masthead')
      assert.equal(await page.locator('.cor-turn').count(), 0)
      await noHorizontalOverflow(page)
      await page.screenshot({ path: join(output, `${size}-assistant-empty.png`), fullPage: true })

      fault.chatStatus = 401
      const question = page.getByRole('textbox', { name: '向 AI 助手提问', exact: true })
      await question.fill('解释一下导数。')
      await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
      await page.getByRole('alert').filter({ hasText: '登录状态已失效' }).waitFor()
      assert.equal(await question.inputValue(), '解释一下导数。')
      assert.equal(await page.locator('.cor-turn').count(), 0)
      fault.chatStatus = 200
      await page.getByRole('button', { name: 'Envoyer', exact: true }).click()
      await page.getByText('导数描述函数在某一点的变化率。', { exact: true }).waitFor()
      await page.waitForFunction(() => document.querySelector('.cor-input')?.value === '')
      await page.reload()
      await page.getByText('导数描述函数在某一点的变化率。', { exact: true }).waitFor()
      await noHorizontalOverflow(page)
      await page.getByRole('button', { name: '← Accueil', exact: true }).click()
      await rendered(page, '.mag-cor .mag-giant')

      await page.goto(`${baseUrl}/login`)
      await page.getByRole('button', { name: '退出并重新登录', exact: true }).click()
      await page.getByRole('textbox', { name: '邮箱', exact: true }).waitFor()
      await page.goto(`${baseUrl}/assistant`)
      await rendered(page, '.cor-gate a')
      assert.equal(await page.getByRole('textbox', { name: '向 AI 助手提问', exact: true }).count(), 0)
      await noHorizontalOverflow(page)
    })
    await scenario(`${size}-not-found`, viewport, async (page) => {
      await page.goto(`${baseUrl}/missing-browser-fixture`)
      await page.waitForURL(`${baseUrl}/404`)
      await rendered(page, '.notfound-title')
      await rendered(page, '.site-nav')
      await noHorizontalOverflow(page)
      await page.getByRole('link', { name: '资源 · 书目', exact: true }).click()
      await rendered(page, '.bib-page:not([inert]) .bib-entry-title')
      await page.goBack()
      await rendered(page, '.notfound-title')
    })
  }
  await scenario('reduced-motion', { width: 390, height: 844 }, async (page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto(baseUrl)
    await rendered(page, '.mag-masthead')
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await rendered(page, '.mag-vocab .mag-giant')
    await page.goto(`${baseUrl}/resources`)
    await page.getByRole('button', { name: '下一页', exact: true }).click()
    await rendered(page, '.bib-page:not([inert]) .bib-entry-title')
    await noHorizontalOverflow(page)
  })
  await scenario('tablet-navigation', { width: 800, height: 1024 }, async (page) => {
    for (const path of ['/resources', '/vocabulary', '/assistant']) {
      await page.goto(`${baseUrl}${path}`)
      await rendered(page, 'nav[aria-label="页内导航"]')
      await noHorizontalOverflow(page)
      await page.getByRole('button', { name: '← Accueil', exact: true }).click()
      await page.waitForURL(baseUrl + '/')
    }
  })
  await scenario('failure-slow-route', { width: 390, height: 844 }, async (page, fault) => {
    fault.chunk = '/Resources-'; fault.kind = 'slow'
    await page.goto(`${baseUrl}/resources`)
    await page.getByText('正在打开页面…', { exact: true }).waitFor()
    await rendered(page, '.bib-page:not([inert]) .bib-entry-title')
  })
  for (const [name, chunk] of [['route', '/Resources-'], ['entry', '/index-']]) {
    await scenario(`failure-${name}`, { width: 390, height: 844 }, async (page, fault) => {
      fault.chunk = chunk; fault.kind = 'fail'
      const path = name === 'route' ? '/resources' : '/'
      await page.goto(`${baseUrl}${path}`)
      const reload = page.getByRole('button', { name: '重新加载', exact: true })
      await reload.waitFor()
      fault.kind = ''
      await reload.click()
      await rendered(page, name === 'route' ? '.bib-page:not([inert]) .bib-entry-title' : '.mag-masthead')
      await noHorizontalOverflow(page)
    })
  }
} finally {
  await browser?.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  await writeFile(healthPath, originalHealth)
  await rm(buildDir, { recursive: true, force: true })
}
