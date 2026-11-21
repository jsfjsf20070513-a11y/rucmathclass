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
    const { data, info } = await sharp(frame).resize({ width: 220 }).greyscale().raw().toBuffer({ resolveWithObject: true })
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
  assert.equal(await page.locator('.paper-copy > *, .lec-leaves > *').count(), 0, '动画结束应移除所有副本')
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
    const turn = sheet.getByRole('button', { name: /Verso/ })
    await turn.scrollIntoViewIfNeeded()
    assert.ok(await sheet.locator('.lec-scroll').evaluate((node) => node.scrollTop > 0))
    await checkMotion(page, () => turn.click(), 'lec-leaf-in', 'lecLeafIn')
    assert.equal(await sheet.locator('.lec-scroll').evaluate((node) => node.scrollTop), 0)
    await checkMotion(page, () => sheet.getByRole('button', { name: /Recto/ }).click(), 'lec-leaf-out', 'lecLeafOut')
    assert.equal(await sheet.locator('.lec-scroll').evaluate((node) => node.scrollTop), 0)
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
    await checkMotion(page, () => page.locator('.lgn-back').click(), ...back)
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
    await checkMotion(page, () => page.locator('.lgn-back').click(), ...back)
    await checkMotion(page, () => page.goBack(), ...forward)

    await signIn(page)
    await page.goto(baseUrl + '/reset-password')
    const fields = page.locator('.password-field input')
    await fields.nth(0).fill('local-new-password')
    await fields.nth(1).fill('local-new-password')
    await page.getByRole('button', { name: /保存新密码/ }).click()
    await page.locator('.reset-ok').waitFor()
    await checkMotion(page, () => page.locator('.reset-state a').click(), ...back)
  })

  await scenario(size + '-slow-flip', viewport, async (page, fault) => {
    fault.chunk = '/Resources-'
    fault.kind = 'slow'
    await page.addInitScript(() => Object.defineProperty(navigator, 'connection', { value: { saveData: true } }))
    await page.goto(baseUrl)
    await page.emulateMedia({ reducedMotion: 'reduce' })
    for (let i = 0; i < 3; i++) await page.getByRole('button', { name: '下一页' }).click()
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await checkMotion(page, () => page.getByRole('button', { name: /Consulter/ }).click(), ...forward)
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
        if (['lecLeafIn', 'lecLeafOut', 'lecRise', 'magArrive', 'magArriveBack', 'connexionHalf'].includes(animationName)) {
          window.__turns.push(animationName)
        }
      })
    })
    const instant = async () => {
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))))
      assert.deepEqual(await page.evaluate(() => window.__turns), [])
      assert.equal(await page.locator('.paper-copy > *, .lec-leaves > *').count(), 0)
    }
    await page.goto(baseUrl + '/lecture')
    await page.locator('.lec-entry').first().click()
    const sheet = page.locator('.paper-current .lec-page:not([inert])')
    await sheet.getByRole('button', { name: /Verso/ }).click()
    await sheet.getByRole('button', { name: /Recto/ }).waitFor()
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
    await page.locator('.reset-ok').waitFor()
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
