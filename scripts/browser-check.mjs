import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, devices, webkit } from 'playwright'
import { preview } from 'vite'
import { createAccountFixture } from './browser-account-fixture.mjs'
import { swipeConversation } from './lib/captureScene.mjs'
import { MATH_THREAD } from './lib/localFixture.mjs'
import { checkLoginTabs } from './check-login-tabs.mjs'
import { checkTransitions } from './browser-transitions.mjs'
import { checkRegressions } from './browser-regressions.mjs'
import { checkSafariStrike } from './browser-safari-strike.mjs'

// With no arguments the local check runs every scenario.
const shard = process.argv[2] ?? '1/1'
assert.match(shard, /^[1-9]\d*\/[1-9]\d*$/, 'Expected a shard such as 1/4')
const [shardIndex, shardCount] = shard.split('/').map(Number)
assert.ok(shardIndex <= shardCount, 'Shard index exceeds shard count')
let scenarioIndex = 0

const root = fileURLToPath(new URL('..', import.meta.url))
const output = join(root, 'output/playwright')
const buildDir = await mkdtemp(join(tmpdir(), 'mathclass-browser-'))
const healthPath = join(root, 'public/health.json')
const originalHealth = await readFile(healthPath)
let server, browser, webkitBrowser, baseUrl

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

async function assistantType(page) {
  const violations = await page.locator('.paper-current .cor').evaluate((main) => [...main.querySelectorAll('*')]
    .filter((el) => el.getClientRects().length && !el.closest('svg, .katex-mathml, [hidden]') &&
      (el.matches('button, textarea') || [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.replace(/\u200b/g, '').trim())))
    .filter((el) => {
      const style = getComputedStyle(el)
      return (!el.matches('.text-action') && parseFloat(style.fontSize) < 15) || style.textTransform === 'uppercase'
    })
    .map((el) => el.outerHTML.slice(0, 100)))
  assert.deepEqual(violations, [])
}

async function scenario(name, viewportOrDevice, run) {
  if (scenarioIndex++ % shardCount !== shardIndex - 1) return
  const useWebKit = viewportOrDevice.defaultBrowserType === 'webkit'
  if (useWebKit) webkitBrowser ??= await webkit.launch()
  const context = useWebKit ? await webkitBrowser.newContext(viewportOrDevice)
    : await browser.newContext({ viewport: viewportOrDevice, hasTouch: viewportOrDevice.width <= 480 })
  const errors = []
  const unexpectedRequests = []
  const fault = { chunk: '', kind: '', resourcesUnavailable: false, chatStatus: 200 }
  const account = createAccountFixture(fault)
  // Every non-local request is intercepted. The build uses only placeholder
  // Supabase/AI configuration, and no real account is created or signed in.
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (await account.handle(route, baseUrl)) return
    if (url.origin === baseUrl) {
      if (fault.chunk && url.pathname.includes(fault.chunk) && url.pathname.endsWith('.js')) {
        if (fault.kind === 'fail') return route.fulfill({ status: 503, body: 'fixture unavailable' })
        if (fault.kind === 'slow') await new Promise((resolve) => setTimeout(resolve, 2200))
      }
      return route.continue()
    }
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
  await checkRegressions({ scenario, baseUrl, rendered, assistantType })
  for (const [size, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
    await checkTransitions({ scenario, baseUrl, size, viewport })
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
      const sizes = await page.locator('.bib-page:not([inert])').evaluate(el =>
        ['.bib-shelf-roman', '.bib-shelf-title', '.bib-entry-title', '.bib-entry-subject']
          .map(selector => getComputedStyle(el.querySelector(selector)).fontSize))
      assert.deepEqual(sizes, ['16px', '25px', '17px', '13px'])
      assert.equal(await page.locator('.bib-entry-tag').count(), 0)
      assert.equal(await page.locator('.bib-shelf').count(), 6)
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
      await checkLoginTabs(page)
      await noHorizontalOverflow(page)
      await page.goto(`${baseUrl}/reset-password`)
      await page.getByRole('link', { name: '重新申请 · 找回密码 →' }).waitFor()
      await rendered(page, '.reset-state a')
      await noHorizontalOverflow(page)
      await page.goto(`${baseUrl}/resources/curate`)
      await page.waitForURL(`${baseUrl}/resources`)
      await rendered(page, '.bib-page:not([inert]) .bib-entry-title')
      await noHorizontalOverflow(page)
    })
    await scenario(`${size}-lecture`, viewport, async (page) => {
      const current = '.lec-page:not([inert])'
      const path = () => page.evaluate(() => location.pathname)
      // 正文故意晚到，检查点开时不会先露出空白页。
      await page.route(/\/api\/lecture\/\d{4}-\d{2}-\d{2}$/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 600))
        await route.fallback()
      })
      await page.goto(baseUrl)
      await rendered(page, '.mag-masthead')
      await page.getByRole('button', { name: '下一页', exact: true }).click()
      await rendered(page, '.mag-vocab .mag-giant')
      await page.locator('.mag-vocab').getByRole('button', { name: /Entrer/ }).click()
      await page.waitForURL(`${baseUrl}/lecture`)
      await rendered(page, '.lec-entry')
      // 翻页进场动画结束后再量宽度。
      await page.waitForFunction(() => (document.querySelector('.lec')?.getAnimations() || []).every((animation) => animation.playState === 'finished'))
      await noHorizontalOverflow(page)
      await page.evaluate(() => {
        window.__blankFrames = 0
        const tick = () => {
          const stack = document.querySelector('.lec-stack')
          if (stack && !stack.classList.contains('is-waiting') && !document.querySelector('.lec-page:not([inert]) .lec-title')) window.__blankFrames += 1
          if (!window.__stopFrames) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      })
      await page.locator('.lec-entry').nth(1).click()
      await page.waitForURL(/\/lecture\/\d{4}-\d{2}-\d{2}$/)
      const day = await path()
      await rendered(page, `${current} .lec-title`)
      // 文章页从下往上抽出，抽出时正文已经在。
      assert.equal(await page.locator('.lec-stack.lec-rise').count(), 1)
      await page.waitForFunction(() => document.querySelector('.lec-stack').getAnimations().every((animation) => animation.playState === 'finished'))
      assert.equal(await page.evaluate(() => { window.__stopFrames = true; return window.__blankFrames }), 0)
      await page.locator(`${current} .lec-option`).first().click()
      await page.locator(`${current} .lec-option[aria-checked="true"]`).waitFor()
      assert.equal(await page.locator(`${current} .lec-option[aria-checked="true"]`).count(), 1)
      // 选项上的方向键不能换天。
      await page.keyboard.press('ArrowRight')
      assert.equal(await path(), day)
      await page.locator(`${current} .lec-turn button`).click()
      await rendered(page, `${current} .lec-verso`)
      await noHorizontalOverflow(page)
      // 换到后一天再回来，背面仍在，地址跟着日期走。
      await page.evaluate(() => document.activeElement?.blur())
      await page.keyboard.press('ArrowRight')
      await page.waitForFunction((previous) => location.pathname !== previous, day)
      await page.keyboard.press('ArrowLeft')
      await page.waitForURL(`${baseUrl}${day}`)
      await rendered(page, `${current} .lec-verso`)
      await page.getByRole('button', { name: 'Archives', exact: true }).click()
      await page.waitForURL(`${baseUrl}/lecture`)
      await rendered(page, '.lec-entry')
      // 刷新后答案还在。
      await page.goto(`${baseUrl}${day}`)
      await page.waitForSelector(`${current} .lec-option[aria-checked="true"]`, { state: 'attached' })
    })
    await scenario(`${size}-account-pages`, viewport, async (page, fault) => {
      const renderRequests = []
      page.on('request', (request) => {
        if (new URL(request.url()).pathname.includes('/assets/AssistantReply-')) renderRequests.push(request.url())
      })
      await page.goto(`${baseUrl}/login`)
      await page.getByRole('textbox', { name: '邮箱', exact: true }).fill('browser@example.invalid')
      await page.getByLabel('Mot de passe', { exact: true }).fill('local-fixture-only')
      await page.getByRole('button', { name: 'Entrer', exact: true }).click()
      await page.getByRole('heading', { name: 'Bienvenue', exact: true }).waitFor()
      await rendered(page, '.lgn-dest')
      await noHorizontalOverflow(page)
      await page.locator('.lgn-dest a[href="/lecture"]').click()
      await rendered(page, '.lec-entry')
      await noHorizontalOverflow(page)
      await page.getByRole('button', { name: '← Accueil', exact: true }).click()
      await rendered(page, '.mag-vocab .mag-giant')

      await page.goto(`${baseUrl}/assistant`)
      const list = page.getByRole('list', { name: '对话列表' })
      const back = page.getByRole('link', { name: 'Conversations', exact: true })
      const manage = page.getByRole('button', { name: '管理', exact: true })
      const done = page.getByRole('button', { name: '完成', exact: true })
      const activate = (button) => size === 'mobile' ? button.tap() : button.click()
      const math = list.locator(`a[href="/assistant/${MATH_THREAD}"]`)
      const french = list.getByRole('link', { name: /Le mot/ })
      await rendered(page, '.cor-entry')
      await assistantType(page)
      assert.equal(await list.getByRole('link').count(), 4)
      assert.equal(await list.getByRole('link').first().innerText(), '新对话')
      assert.deepEqual(await list.locator('time').allTextContents(), ['vendredi 20 novembre', 'mercredi 18 novembre', 'lundi 16 novembre'])
      assert.equal(await manage.getAttribute('aria-expanded'), 'false')
      assert.equal(await list.getByRole('button').count(), 0)
      assert.equal(await list.locator('.cor-strike').count(), 0)
      await noHorizontalOverflow(page)
      await page.screenshot({ path: join(output, `${size}-assistant-list.png`), fullPage: true })

      await list.getByRole('link', { name: '新对话' }).click()
      await rendered(page, '.cor-masthead')
      await back.click()
      assert.equal(renderRequests.length, 0, '首页、目录和空白对话按需下载正文渲染器')
      await math.click()
      await page.waitForURL(`${baseUrl}/assistant/${MATH_THREAD}`)
      await rendered(page, '.cor-r-text')
      await rendered(page, '.cor-input')
      assert.equal(await page.locator('.cor-body.lec-rise').count(), 1)
      assert.equal(await page.locator('.cor-turn').count(), 2)
      assert.equal(await page.locator('.cor-question').evaluate((element) => element === document.activeElement), true)
      assert.equal(await page.locator('.paper-current .page-nav :is(a,button)').count(), 1)
      const proof = page.locator('.cor-r-text')
      await assistantType(page)
      assert.equal(renderRequests.length, 1)
      assert.equal(await proof.locator('.katex').count(), 8)
      assert.equal(await proof.locator('.katex-display').count(), 1)
      assert.equal(await proof.locator('ol > li').count(), 2)
      assert.equal(await proof.locator('strong').textContent(), '长度')
      assert.deepEqual(await proof.locator('tbody td').allTextContents(), ['9', '3', '4', '2'])
      await noHorizontalOverflow(page)
      await page.screenshot({ path: join(output, `${size}-assistant-history.png`), fullPage: true })

      await back.click()
      await french.click()
      await rendered(page, '.cor-r-text')
      assert.equal(await page.locator('.cor-turn').count(), 2)
      assert.equal(await page.locator('.cor-r-text strong').textContent(), '« une valeur singulière »')
      await back.click()
      await page.waitForFunction(() => !document.querySelector('.paper-stage[data-motion]'))
      const row = list.locator('li').filter({ has: page.locator('a[href*="b2222222"]') })
      const remove = row.getByRole('button', { name: /^删除/ })
      if (size === 'mobile') await swipeConversation(page, row)
      else await row.hover()
      await french.focus()
      assert.equal(await list.locator('.cor-delete').count(), 0, '日常列表中的滑动、悬停和焦点都不显示删除')
      await activate(manage)
      assert.equal(await done.getAttribute('aria-expanded'), 'true')
      assert.equal(await list.getByRole('button', { name: /^删除/ }).count(), 3)
      assert.equal(await list.locator('li').first().getByRole('button').count(), 0, '新对话没有删除键')
      assert.ok(await list.locator('.cor-entry').evaluateAll((rows) => rows.every((item) =>
        item.querySelector('button').getBoundingClientRect().right <= item.getBoundingClientRect().right + 1)), '长标题保留行末按钮的位置')
      await assistantType(page)
      await noHorizontalOverflow(page)
      await page.screenshot({ path: join(output, `${size}-assistant-delete.png`), fullPage: true })
      // 模拟另一设备续写后的空删除结果，在回执到达前退出管理。
      const conflict = list.locator('.cor-entry').last()
      const colors = (element) => ['.lec-entry-title', '.lec-entry-date'].map(selector => getComputedStyle(element.querySelector(selector)).color)
      const originalColors = await conflict.evaluate(colors)
      const deletion = '**/rest/v1/ai_conversations?**'
      const intercepted = new Promise((resolve) => page.route(deletion, resolve, { times: 1 }))
      await activate(conflict.getByRole('button', { name: /^删除/ }))
      const route = await intercepted
      assert.equal(route.request().method(), 'DELETE')
      assert.equal(await conflict.getByRole('link').getAttribute('aria-disabled'), 'true')
      assert.equal(await conflict.getByRole('button').count(), 0)
      await page.waitForFunction(() => {
        const strike = document.querySelector('.is-pending .cor-strike')
        return strike?.getAnimations()[0]?.effect.getComputedTiming().progress === 1
      })
      assert.equal(await list.locator('.cor-entry:not(.is-pending) .cor-strike').count(), 0)
      const [title, date] = await conflict.evaluate(colors)
      assert.equal(title, date)
      assert.notEqual(title, originalColors[0])
      await activate(done)
      await Promise.all([
        page.waitForFunction(() => document.querySelector('.cor-strike')?.getAnimations()[0]?.playbackRate < 0),
        route.fulfill({ json: [] }),
      ])
      await page.getByRole('alert').getByText('删除结果未确认。请刷新后核对这段对话。').waitFor()
      await conflict.locator('.cor-strike').waitFor({ state: 'detached' })
      assert.deepEqual(await conflict.evaluate(colors), originalColors)
      assert.equal(await conflict.getByRole('link').getAttribute('aria-disabled'), null)
      assert.equal(await list.getByRole('button').count(), 0)

      await page.getByRole('button', { name: '← Accueil', exact: true }).focus()
      await page.keyboard.press('Tab')
      assert.ok(await manage.evaluate((button) => button.matches(':focus-visible')))
      await page.keyboard.press('Space')
      await done.waitFor()
      await french.focus()
      await page.keyboard.press('Tab')
      assert.ok(await remove.evaluate((button) => button.matches(':focus-visible')))
      if (size === 'mobile') await page.emulateMedia({ reducedMotion: 'reduce' })
      const observed = await row.evaluateHandle((element) => {
        const properties = []
        element.addEventListener('animationstart', (event) => properties.push(event.animationName))
        element.addEventListener('transitionrun', (event) => properties.push(event.propertyName))
        return properties
      })
      const requested = page.waitForRequest((req) => req.method() === 'DELETE' && req.url().includes('ai_conversations'))
      await page.keyboard.press('Enter')
      await requested
      await row.waitFor({ state: 'detached' })
      const transitions = await observed.jsonValue()
      if (size === 'mobile') {
        assert.deepEqual(transitions, [], '减少动态效果时直接移除')
        await page.emulateMedia({ reducedMotion: null })
      } else {
        assert.ok(transitions.includes('cor-strike-draw') && transitions.includes('grid-template-rows'), '划线后收起行高')
      }
      await page.reload()
      await rendered(page, '.cor-entry')
      assert.equal(await french.count(), 0)
      assert.equal(await math.count(), 1)
      assert.equal(await list.getByRole('link').count(), 3)

      const newThread = list.getByRole('link', { name: '新对话' })
      await newThread.click()
      await rendered(page, '.cor-masthead')
      await back.click()
      assert.equal(await list.getByRole('link').count(), 3, '打开空白页不创建对话')
      await newThread.click()
      await rendered(page, '.cor-masthead')
      assert.equal(await page.locator('.cor-turn').count(), 0)
      await noHorizontalOverflow(page)
      await page.screenshot({ path: join(output, `${size}-assistant-empty.png`), fullPage: true })

      const question = page.getByRole('textbox', { name: '向 AI 助手提问', exact: true })
      const send = page.getByRole('button', { name: '发送', exact: true })
      assert.equal(await send.isDisabled(), true)
      const sendInk = () => send.locator('path').first().evaluate(path => getComputedStyle(path).stroke)
      assert.equal(await sendInk(), 'rgb(111, 103, 94)')
      const fieldHeight = () => question.evaluate((field) => field.clientHeight)
      const oneLine = await fieldHeight()
      assert.equal(oneLine, await send.evaluate((button) => button.clientHeight))
      assert.equal(oneLine, await page.getByRole('button', { name: '添加图片' }).evaluate((button) => button.clientHeight))
      await question.fill('第一行\n第二行')
      assert.equal(await sendInk(), 'rgb(125, 47, 40)')
      assert.equal(await question.evaluate(field => getComputedStyle(field).outlineStyle), 'none')
      assert.ok(await fieldHeight() > oneLine)
      await question.fill('第一行\n'.repeat(35))
      assert.equal(await question.evaluate((field) => field.scrollHeight > field.clientHeight), true)
      await question.fill('')
      assert.equal(await fieldHeight(), oneLine)

      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('button', { name: '添加图片', exact: true }).click()
      await (await chooser).setFiles({
        name: 'figure.png', mimeType: 'image/png',
        buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=', 'base64'),
      })
      await page.getByRole('img', { name: '待发送的图片' }).waitFor()
      assert.equal(await send.isEnabled(), true)
      await page.getByRole('button', { name: '移除图片', exact: true }).click()
      assert.equal(await send.isDisabled(), true)

      fault.chatStatus = 401
      await question.fill('解释一下导数。')
      await send.click()
      await page.getByRole('alert').filter({ hasText: '登录状态已失效' }).waitFor()
      assert.equal(await question.inputValue(), '解释一下导数。')
      assert.equal(await page.locator('.cor-turn').count(), 0)
      fault.chatStatus = 200
      // 先扣住回答，确认输入框在回答出来之前就已清空。
      const gate = Promise.withResolvers()
      const posted = Promise.withResolvers()
      const chatRoute = /\/api\/chat$/
      await page.route(chatRoute, async (route) => {
        if (route.request().method() === 'POST') { posted.resolve(); await gate.promise }
        await route.fallback()
      })
      await send.click()
      await posted.promise
      assert.equal(await question.inputValue(), '', '发出后、回答之前输入框应已清空')
      await page.locator('.cor-question').filter({ hasText: '解释一下导数。' }).waitFor()
      gate.resolve()
      await page.getByText('导数描述函数在某一点的变化率。', { exact: true }).waitFor()
      await page.unroute(chatRoute)
      assert.equal(await question.inputValue(), '')
      await page.reload()
      await page.getByText('导数描述函数在某一点的变化率。', { exact: true }).waitFor()
      await noHorizontalOverflow(page)
      assert.match(new URL(page.url()).pathname, /^\/assistant\/[a-f\d-]{36}$/)
      await back.click()
      await rendered(page, '.cor-entry')
      assert.equal(await list.locator('.cor-entry .lec-entry-title').first().textContent(), '解释一下导数。')
      await page.getByRole('button', { name: '← Accueil', exact: true }).click()
      await rendered(page, '.mag-cor .mag-giant')

      await page.goto(`${baseUrl}/login`)
      await page.getByRole('button', { name: '退出并重新登录', exact: true }).click()
      await page.getByRole('textbox', { name: '邮箱', exact: true }).waitFor()
      await page.goto(`${baseUrl}/assistant`)
      await rendered(page, '.cor-gate a')
      await assistantType(page)
      assert.equal(await page.getByRole('textbox', { name: '向 AI 助手提问', exact: true }).count(), 0)
      await noHorizontalOverflow(page)
    })
    await scenario(`${size}-not-found`, viewport, async (page) => {
      await page.goto(`${baseUrl}/missing-browser-fixture`)
      await page.waitForURL(`${baseUrl}/404`)
      await rendered(page, '.notfound-title')
      await rendered(page, '.site-header .page-nav')
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
    for (const path of ['/resources', '/lecture', '/assistant']) {
      await page.goto(`${baseUrl}${path}`)
      await rendered(page, 'nav[aria-label="页内导航"]')
      await noHorizontalOverflow(page)
      await page.getByRole('button', { name: '← Accueil', exact: true }).click()
      await page.waitForURL(baseUrl + '/')
    }
  })
  await scenario('failure-slow-route', { width: 390, height: 844 }, async (page, fault) => {
    fault.chunk = '/Resources-'; fault.kind = 'slow'
    await page.goto(`${baseUrl}/resources`, { waitUntil: 'domcontentloaded' })
    await page.locator('.paper-current[data-paper-visible="false"]').waitFor({ state: 'attached' })
    assert.equal(await page.locator('.paper-current').innerText(), '')
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
  await scenario('webkit-iphone-assistant-strike', devices['iPhone 13'],
    page => checkSafariStrike(page, baseUrl, join(output, 'comparisons/strike-safari')))
} finally {
  await webkitBrowser?.close()
  await browser?.close()
  if (server) await new Promise((resolve) => server.httpServer.close(resolve))
  await writeFile(healthPath, originalHealth)
  await rm(buildDir, { recursive: true, force: true })
}
