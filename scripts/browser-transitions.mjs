import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import sharp from 'sharp'
import { lectureSamples } from '../src/data/lectureSamples.js'
import { fixtureSession, FIXTURE_PASSWORD, FIXTURE_USERS, MATH_THREAD } from './lib/localFixture.mjs'

// 动画类和结束事件在真实页面上检查。合成器截到的是已绘制的画面，
// 即使不可交互的纸面遮住了新页，也能发现只有背景色的帧。
async function checkMotion(page, action, className, animationName, { forbidWelcome = false } = {}) {
  await page.waitForFunction(() => document.querySelector('.paper-current [data-page-ready="true"], .paper-current .cor-body[aria-busy="false"]'))
  await page.evaluate(async () => {
    await document.fonts.ready
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  })
  const cdp = await page.context().newCDPSession(page)
  const frames = []
  cdp.on('Page.screencastFrame', ({ data, sessionId }) => {
    frames.push(Buffer.from(data, 'base64'))
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
  })
  try {
    await cdp.send('Page.startScreencast', { format: 'png', maxWidth: 480, maxHeight: 640, everyNthFrame: 1 })
    await page.evaluate(({ className, animationName, forbidWelcome }) => {
      const probe = { started: false, ended: false, overflow: 0, welcome: false, frames: 0 }
      const matches = (e) => e.animationName === animationName && e.target.classList.contains(className)
      const start = (e) => { if (matches(e)) probe.started = true }
      const end = (e) => { if (matches(e)) probe.ended = true }
      const tick = () => {
        probe.frames++
        probe.overflow = Math.max(probe.overflow, document.documentElement.scrollWidth - innerWidth)
        if (forbidWelcome && document.querySelector('.paper-current .lgn-dest')) probe.welcome = true
        if (!probe.ended) requestAnimationFrame(tick)
      }
      document.addEventListener('animationstart', start, true)
      document.addEventListener('animationend', end, true)
      probe.dispose = () => {
        document.removeEventListener('animationstart', start, true)
        document.removeEventListener('animationend', end, true)
      }
      window.__motion = probe
      requestAnimationFrame(tick)
    }, { className, animationName, forbidWelcome })
    await action()
    await page.waitForFunction(() => window.__motion.ended)
    const probe = await page.evaluate(() => {
      window.__motion.dispose()
      const { started, frames, overflow, welcome } = window.__motion
      return { started, frames, overflow, welcome }
    })
    assert.ok(probe.started && probe.frames > 2, `${className} 应当有开始、中间帧和结束 (start=${probe.started}, frames=${probe.frames})`)
    assert.ok(probe.overflow <= 1, className + ' 过程中出现横向溢出')
    assert.equal(probe.welcome, false, '回到答疑前闪过了欢迎页')
    await cdp.send('Page.stopScreencast')
  } finally { await cdp.detach() }
  assert.ok(frames.length >= 3, className + ' 取到的画面太少')
  for (const [i, frame] of frames.entries()) {
    // 截帧时已经限制了尺寸。按原帧检测，保留桌面小字的笔画。
    const { data, info } = await sharp(frame).greyscale().raw().toBuffer({ resolveWithObject: true })
    // 排除固定的页眉、按钮和细分隔线。正文至少要有两行像素带有墨迹。
    const body = data.subarray(Math.ceil(info.height * 0.1) * info.width, Math.floor(info.height * 0.91) * info.width)
    let inkRows = 0
    for (let y = 0; y < body.length; y += info.width) {
      if (body.subarray(y, y + info.width).some((pixel) => pixel < 172)) inkRows++
    }
    if (inkRows < 2) {
      const file = `blank-${page.viewportSize().width}-${className}.png`
      await writeFile(new URL('../output/playwright/' + file, import.meta.url), frame)
      assert.fail(className + ' 第 ' + i + ' 帧未绘出正文，见 ' + file)
    }
  }
  assert.equal(await page.locator('.paper-copy > *').count(), 0, '动画结束应移除所有副本')
}

async function checkPaperTurn(page, sheet, toVerso, mobile) {
  const paper = sheet.locator('.lec-paper')
  const turn = paper.getByRole('button', { name: toVerso ? /Verso/ : /Recto/ })
  await turn.scrollIntoViewIfNeeded()
  const oldTop = await paper.locator('.lec-scroll').evaluate((face) => face.scrollTop)
  if (toVerso) assert.ok(oldTop > 0, '从试卷末尾翻到背面')
  await paper.evaluate((node) => {
    node.addEventListener('animationstart', () => {
      node.getAnimations()[0].pause()
    }, { once: true })
  })
  await turn.click()
  await page.waitForFunction(() => document.querySelector('.lec-paper.is-turning')?.getAnimations()[0]?.playState === 'paused')
  const { duration, easing, expected } = await paper.evaluate((node) => {
    const style = getComputedStyle(node)
    const reference = document.createElement('div').style
    reference.animationTimingFunction = style.getPropertyValue('--flip-ease')
    return { duration: node.getAnimations()[0].effect.getTiming().duration, easing: style.animationTimingFunction, expected: reference.animationTimingFunction }
  })
  assert.equal(duration, 500)
  assert.equal(easing, expected)
  const offsets = await paper.locator('.lec-scroll').evaluateAll((faces) => faces.map((face) => face.scrollTop))
  assert.deepEqual(offsets, toVerso ? [oldTop, 0] : [0, oldTop])
  assert.equal(await paper.evaluate((node) => node.inert), true)
  const direction = toVerso ? 'recto-verso' : 'verso-recto'
  const bounds = await sheet.boundingBox()
  for (const ms of [0, 150, 250, 350, 500]) {
    if (ms === 500) {
      await paper.evaluate((node) => node.getAnimations()[0].finish())
      await sheet.locator('.is-turning').waitFor({ state: 'detached' })
      assert.equal(await paper.locator('.lec-scroll').evaluate((face) => face.scrollTop), 0)
      assert.ok(await paper.getByRole('button', { name: toVerso ? /Recto/ : /Verso/ }).isEnabled())
    } else {
      await paper.evaluate((node, time) => { node.getAnimations()[0].currentTime = time }, ms)
    }
    await page.evaluate(() => document.fonts.ready)
    const frame = await page.screenshot()
    if (mobile) await writeFile(new URL(`../output/playwright/${direction}-${ms}.png`, import.meta.url), frame)
    if (ms === 0 || ms === 500) continue
    const width = (await paper.boundingBox()).width
    const top = Math.ceil(bounds.y)
    const ink = await sharp(frame).extract({ left: 0, top, width: Math.floor(bounds.width), height: Math.floor(bounds.y + bounds.height) - top })
      .greyscale().raw().toBuffer()
    if (ms === 250) {
      assert.ok(width < 1, '整张纸在中点转至侧面')
      assert.ok(!ink.some((pixel) => pixel < 155), '纸边两侧应没有正文')
    } else {
      assert.ok(width > 1 && width < bounds.width, '整张纸应绕竖轴转动')
      assert.ok(ink.some((pixel) => pixel < 100), '朝向读者的一面应有正文')
      const hidden = (ms < 250) === toVerso ? '.lec-paper-back' : '.lec-scroll:not(.lec-paper-back)'
      const oneFace = await page.screenshot({ style: `.lec-paper.is-turning > ${hidden} { visibility: hidden !important; }` })
      assert.ok(frame.equals(oneFace), direction + ' 在 ' + ms + ' 毫秒露出了另一面的内容')
    }
  }
}

async function fillLogin(page) {
  await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(FIXTURE_USERS[0].email)
  await page.getByLabel('Mot de passe', { exact: true }).fill(FIXTURE_PASSWORD)
}

const signIn = (page) => page.addInitScript((session) => localStorage.setItem('sb-fixture-auth-token', JSON.stringify(session)), fixtureSession())
const submit = (page) => page.getByRole('button', { name: 'Entrer', exact: true }).click()
const thread = '/assistant/' + MATH_THREAD
const forward = ['page-arrive', 'magArrive']
const back = ['page-arrive-back', 'magArriveBack']
const retract = ['lec-retract', 'lecRise']
const waitForPaper = (page) => page.waitForFunction(() => !document.querySelector('.paper-stage[data-motion]'))

export async function checkTransitions({ scenario, baseUrl, size, viewport }) {
  await scenario(size + '-paper-faces', viewport, async (page) => {
    await page.goto(baseUrl + '/lecture/2026-11-20')
    const sheet = page.locator('.paper-current .lec-page:not([inert])')
    await checkPaperTurn(page, sheet, true, size === 'mobile')
    await checkPaperTurn(page, sheet, false, size === 'mobile')
  })

  await scenario(size + '-detail-return', viewport, async (page, fault) => {
    fault.lectureDays = Array.from({ length: 18 }, (_, index) => ({
      ...lectureSamples[0], date: '2026-11-' + String(index + 1).padStart(2, '0'),
    }))
    await signIn(page)
    for (const [list, entry, link] of [
      ['/lecture', '.lec-entry', 'Archives'],
      ['/assistant', `a[href="${thread}"]`, 'Conversations'],
    ]) {
      await page.goto(baseUrl + list)
      const row = page.locator('.paper-current ' + entry).nth(list === '/lecture' ? 15 : 0)
      await row.scrollIntoViewIfNeeded()
      const scrollTop = () => page.locator('.paper-current .lec-scroll').evaluate((node) => node.scrollTop)
      const top = await scrollTop()
      if (list === '/lecture') assert.ok(top > 0)
      const open = () => row.click()
      const close = () => page.getByRole(list === '/lecture' ? 'button' : 'link', { name: link, exact: true }).click()
      await checkMotion(page, open, 'lec-rise', 'lecRise')
      await checkMotion(page, close, ...retract)
      assert.equal(new URL(page.url()).pathname, list)
      assert.equal(await scrollTop(), top)
      await open()
      await page.waitForURL((url) => url.pathname.startsWith(list + '/'))
      await page.locator('.paper-current .lec-title, .paper-current .cor-r-text').first().waitFor({ state: 'attached' })
      await waitForPaper(page)
      await checkMotion(page, () => page.goBack(), ...retract)
      assert.equal(new URL(page.url()).pathname, list)
      assert.equal(await scrollTop(), top)
    }
  })

  await scenario(size + '-login-transitions', viewport, async (page) => {
    await page.goto(baseUrl + '/')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '下一页', exact: true }).click()
    await page.getByRole('button', { name: 'Connexion · 登录' }).click()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await checkMotion(page, () => page.locator('.mag-connexion-more').click(), ...forward)
    for (const mode of ['验证码', '找回密码', '注册']) {
      await page.getByRole('button', { name: mode, exact: true }).click()
    }
    await checkMotion(page, () => page.getByRole('link', { name: '← Accueil', exact: true }).click(), ...back)
    assert.ok(await page.getByRole('textbox', { name: '邮箱', exact: true }).isVisible())
    await checkMotion(page, () => page.goForward(), ...forward)
    await checkMotion(page, () => page.goBack(), ...back)

    await page.goto(baseUrl + '/login')
    await fillLogin(page)
    await checkMotion(page, () => submit(page), 'connexion-open', 'connexionHalf')
    await checkMotion(page, () => page.getByRole('button', { name: '退出并重新登录' }).click(), 'connexion-close', 'connexionHalf')

    await page.goto(baseUrl + '/reset-password')
    await page.locator('.reset-state a').waitFor()
    await page.locator('.reset-state').evaluate(async (node) => Promise.all(node.getAnimations().map(a => a.finished)))
    await checkMotion(page, () => page.getByRole('link', { name: '← Connexion', exact: true }).click(), ...back)
    await checkMotion(page, () => page.goBack(), ...forward)

    await signIn(page)
    await page.goto(baseUrl + '/reset-password')
    const fields = page.locator('.password-field input')
    await fields.nth(0).fill('local-new-password')
    await fields.nth(1).fill('local-new-password')
    await page.getByRole('button', { name: /保存新密码/ }).click()
    await page.getByText('密码已更新，当前账号仍保持登录。', { exact: true }).waitFor()
    await checkMotion(page, () => page.locator('.reset-state a').click(), ...back)
  })

  await scenario(size + '-book-index', viewport, async (page) => {
    await page.goto(baseUrl)
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一页' }).click()
    const grid = page.locator('.paper-current .mag-biblio-grid')
    await grid.evaluate(async (el) => {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      await Promise.all(el.getAnimations().map(animation => animation.finished))
      document.addEventListener('animationstart', function capture(event) {
        if (event.animationName !== 'magArrive') return
        const copy = document.querySelector('.paper-copy .mag-biblio-grid')
        window.__bookIndexOpacity = copy && Number(getComputedStyle(copy).opacity)
        document.removeEventListener('animationstart', capture, true)
      }, true)
    })
    await checkMotion(page, () => grid.getByRole('button').first().click(), ...forward)
    assert.equal(await page.evaluate(() => window.__bookIndexOpacity), 1, '新书架开始滑入时，旧书目仍须可读')
    await checkMotion(page, () => page.getByRole('button', { name: '← Accueil' }).click(), ...back)
    await checkMotion(page, () => page.goBack(), ...forward)
  })

  await scenario(size + '-public-header', viewport, async (page) => {
    await page.goto(baseUrl + '/404')
    const header = page.locator('.paper-current .site-header')
    let releasePortraits
    const portraits = new Promise(resolve => { releasePortraits = resolve })
    await page.route('**/portraits/*.webp', async route => { await portraits; await route.fallback() })
    await checkMotion(page, async () => {
      await header.getByRole('link', { name: 'Carnet de classe' }).click()
      try {
        await page.locator('.paper-wait .paper-copy .notfound-title').waitFor()
        assert.equal(await page.locator('.paper-current .mag-wall').isVisible(), false)
      } finally { releasePortraits() }
    }, ...back)
    await page.locator('.paper-current .mag-wall').waitFor()
    await checkMotion(page, () => page.goBack(), ...forward)
    let release
    const delayed = new Promise(resolve => { release = resolve })
    await page.route('**/api/lecture', async route => { await delayed; await route.fallback() })
    await checkMotion(page, async () => {
      await header.getByRole('link', { name: /Lecture/ }).click()
      try {
        await page.locator('.paper-wait .paper-copy .notfound-title').waitFor()
        assert.equal(await page.locator('.paper-current').evaluate(el => getComputedStyle(el).opacity), '0')
      } finally { release() }
    }, ...forward)
    await page.locator('.paper-current .lec-entry').first().waitFor()
    await checkMotion(page, () => page.goBack(), ...back)
  })

  await scenario(size + '-slow-flip', viewport, async (page, fault) => {
    fault.chunk = '/Resources-'
    fault.kind = 'slow'
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }))
    await page.goto(baseUrl)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一页' }).click()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await checkMotion(page, () => page.getByRole('button', { name: /分析与微分方程/ }).click(), ...forward)
    await page.goBack()
    await page.locator('.paper-current .mag').waitFor()
    assert.equal(await page.locator('.page-arrive, .page-arrive-back').count(), 0)
    assert.ok(await page.getByRole('button', { name: '上一页' }).isDisabled())
  })

  await scenario(size + '-reduced-transitions', viewport, async (page) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.addInitScript(() => {
      window.__turns = []
      document.addEventListener('animationstart', ({ animationName }) => {
        if (['lecTurn', 'lecRise', 'magArrive', 'magArriveBack', 'connexionHalf'].includes(animationName)) {
          window.__turns.push(animationName)
        }
      })
    })
    const instant = async () => {
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
      assert.deepEqual(await page.evaluate(() => window.__turns), [])
      assert.equal(await page.locator('.paper-copy > *, .lec-paper.is-turning').count(), 0)
    }
    await page.goto(baseUrl + '/lecture')
    await page.locator('.lec-entry').first().click()
    const sheet = page.locator('.paper-current .lec-page:not([inert])')
    await sheet.getByRole('button', { name: /Verso/ }).click()
    await sheet.getByRole('button', { name: /Recto/ }).waitFor()
    assert.equal(await sheet.locator('.lec-scroll').evaluate((node) => node.scrollTop), 0)
    await instant()
    await sheet.getByRole('button', { name: /Recto/ }).click()
    await sheet.getByRole('button', { name: /Verso/ }).waitFor()
    assert.equal(await sheet.locator('.lec-scroll').evaluate((node) => node.scrollTop), 0)
    await instant()
    await page.goBack()
    await page.locator('.paper-current .lec-entry').first().waitFor()
    await instant()
    await page.goto(baseUrl + thread)
    await page.locator('.cor-gate a').click()
    await fillLogin(page)
    await submit(page)
    await page.locator('.cor-r-text').waitFor()
    await instant()
    await page.goto(baseUrl + '/reset-password')
    const fields = page.locator('.password-field input')
    await fields.nth(0).fill('local-reset-password')
    await fields.nth(1).fill('local-reset-password')
    await page.getByRole('button', { name: /保存新密码/ }).click()
    await page.getByText('密码已更新，当前账号仍保持登录。', { exact: true }).waitFor()
    await instant()
    await page.locator('.reset-state a').click()
    await page.locator('.mag').waitFor()
    await instant()
    await page.goto(baseUrl + '/login')
    await page.getByRole('button', { name: '退出并重新登录' }).click()
    await fillLogin(page)
    await page.getByLabel('Mot de passe', { exact: true }).fill('local-reset-password')
    await submit(page)
    await page.locator('.lgn-dest').waitFor()
    await instant()
  })

  await scenario(size + '-login-return', viewport, async (page) => {
    for (const path of [thread + '?view=history#last', '/assistant', '/assistant/new']) {
      await page.goto(baseUrl + path)
      await checkMotion(page, () => page.locator('.cor-gate a').click(), ...forward)
      await checkMotion(page, () => page.goBack(), ...back)
      await page.locator('.cor-gate a').click()
      await fillLogin(page)
      await waitForPaper(page)
      // 回跳页刷新过，也只使用通过校验的本站路径。
      if (path === '/assistant') {
        await page.reload()
        await fillLogin(page)
      }
      await checkMotion(page, () => submit(page), ...back, { forbidWelcome: true })
      assert.equal(page.url(), baseUrl + path)
      if (path.startsWith(thread)) await page.locator('.cor-r-text').waitFor()
      else if (path === '/assistant') await page.locator('.cor-entry').first().waitFor()
      else await page.locator('.cor-input').waitFor()
      await page.goto(baseUrl + '/login')
      await page.getByRole('button', { name: '退出并重新登录' }).click()
      await page.getByRole('textbox', { name: '邮箱', exact: true }).waitFor()
    }
  })
}
