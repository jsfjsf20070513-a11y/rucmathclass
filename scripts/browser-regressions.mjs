import { staticDaily } from '../src/lib/dailyContent.js'
import { lectureSamples } from '../src/data/lectureSamples.js'
import assert from 'node:assert/strict'
import { fixtureSession, FIXTURE_PASSWORD, FIXTURE_USERS } from './lib/localFixture.mjs'

export async function checkRegressions({ scenario, baseUrl, rendered, assistantType }) {
  const viewport = { width: 390, height: 844 }
  const session = fixtureSession()
  const signIn = (page) => page.addInitScript((session) => localStorage.setItem('sb-fixture-auth-token', JSON.stringify(session)), session)
  await scenario('daily-cover-and-parole', viewport, async page => {
    const date = '2026-11-22'
    const day = staticDaily(date)
    const monthly = {
      ...day, theorem: { ...day.theorem, title: '本月定稿' },
      parole: { ...day.parole, text: 'Un jour de plus.' },
    }
    await page.clock.setFixedTime(new Date(date + 'T08:00:00+08:00'))
    let release
    const held = new Promise(resolve => { release = resolve })
    await page.route('**/api/daily/' + date, async route => {
      await held
      await route.fulfill({ json: monthly })
    })
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
    try {
      await rendered(page, '.mag-masthead')
      assert.equal(await page.locator('.mag-theorem-title').textContent(), day.theorem.title)
    } finally { release() }
    await page.waitForFunction(title => document.querySelector('.mag-theorem-title').textContent === title, monthly.theorem.title)
    assert.equal(await page.locator('.mag-parole-text').textContent(), monthly.parole.text)
    const shelves = await page.locator('.mag-biblio-grid button').count()
    await page.goto(baseUrl + '/resources#shelf-' + shelves)
    await page.locator('.bib-coda .section-coda-quote').scrollIntoViewIfNeeded()
    await rendered(page, '.bib-coda .section-coda-quote')
    await page.waitForFunction(text => document.querySelector('.section-coda-quote')?.textContent === text, monthly.parole.text)
  })

  for (const fail of [false, true]) {
    await scenario('paper-fonts-' + (fail ? 'failure' : 'delay'), viewport, async page => {
      let release
      const held = new Promise(resolve => { release = resolve })
      const requested = page.waitForRequest(/noto-serif-sc-home-.*\.woff2/)
      await page.route(/noto-serif-sc-home-.*\.woff2/, async route => {
        await held
        if (fail) await route.abort()
        else await route.fallback()
      })
      await page.goto(baseUrl + '/login', { waitUntil: 'domcontentloaded' })
      const paper = page.locator('.paper-current')
      try {
        await requested
        await page.locator('.lgn[data-page-ready="true"]').waitFor({ state: 'attached' })
        assert.equal(await paper.evaluate(el => getComputedStyle(el).opacity), '0')
        assert.equal(await paper.evaluate(el => el.inert), true)
      } finally { release() }
      await rendered(page, '.lgn-title')
      assert.equal(await paper.getAttribute('data-paper-fonts'), fail ? 'fallback' : 'web')
      const tab = page.locator('.login-tabs button').first()
      const css = await tab.evaluate(el => [getComputedStyle(el).fontFamily, getComputedStyle(el).fontSize])
      assert.equal(css[1], '10px')
      assert.match(css[0], fail ? /^Georgia, .*Songti SC/ : /Bodoni Moda.*Noto Serif SC/)
      assert.equal(await page.locator('.lgn-submit').evaluate(el => getComputedStyle(el).fontSize), '12px')
    })
  }

  await scenario('readable-account-messages', viewport, async (page) => {
    await page.goto(`${baseUrl}/login`)
    await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(FIXTURE_USERS[0].email)
    await page.getByPlaceholder('Mot de passe', { exact: true }).fill('wrong-password')
    await page.locator('button[type="submit"]').click()
    await page.getByText('邮箱或密码不正确。', { exact: true }).waitFor()
    await page.goto(`${baseUrl}/login?aux=1`)
    await page.getByRole('textbox', { name: '真实姓名', exact: true }).fill('演示同学')
    await page.getByRole('textbox', { name: '昵称', exact: true }).fill('本地演示')
    await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(FIXTURE_USERS[0].email)
    await page.getByPlaceholder('Mot de passe', { exact: true }).fill(FIXTURE_PASSWORD)
    await page.getByPlaceholder('确认密码 · Confirmer', { exact: true }).fill(FIXTURE_PASSWORD)
    await page.locator('button[type="submit"]').click()
    await page.getByText('注册请求已提交。请查看邮箱，按邮件提示完成注册。', { exact: true }).waitFor()
    assert.equal(await page.getByPlaceholder('Mot de passe', { exact: true }).inputValue(), '')
  })

  await scenario('readable-assistant-error', viewport, async (page, fault) => {
    await signIn(page)
    fault.chatStatus = 500
    fault.chatError = 'Server not configured'
    await page.goto(`${baseUrl}/assistant/new`)
    const input = page.getByRole('textbox', { name: '向 AI 助手提问', exact: true })
    await input.fill('解释一下导数。')
    await input.press('Enter')
    await page.getByText('答疑暂时不可用，请稍后再试。', { exact: true }).waitFor()
    assert.equal(await input.inputValue(), '解释一下导数。', '失败后应保留问题')
    fault.chatStatus = 200
    await input.press('Enter')
    await page.getByText('导数描述函数在某一点的变化率。', { exact: true }).waitFor()
  })

  await scenario('chinese-input', viewport, async (page) => {
    await signIn(page)
    let sent = 0
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/chat') sent += 1 })
    await page.goto(`${baseUrl}/assistant/new`)
    const input = page.getByRole('textbox', { name: '向 AI 助手提问', exact: true })
    await input.fill('解释一下导数。')
    for (const properties of [{ isComposing: true }, { keyCode: 229 }]) {
      await input.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...properties })
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assert.equal(sent, 0, '输入法选词不应发送问题')
      assert.equal(await input.inputValue(), '解释一下导数。')
      assert.equal(await input.isEnabled(), true)
    }
    await input.press('Enter')
    await page.getByText('导数描述函数在某一点的变化率。', { exact: true }).waitFor()
    assert.equal(sent, 1)
  })

  await scenario('assistant-legacy-history', viewport, async (page, fault) => {
    fault.legacyAssistant = true
    await signIn(page)
    await page.goto(baseUrl + '/assistant')
    await rendered(page, '.cor-entry')
    assert.equal(await page.locator('.cor-archive .lec-entry').count(), 1)
    await page.locator('a[href="/assistant/legacy"]').click()
    await rendered(page, '.cor-input')
    assert.equal(await page.locator('.cor-turn').count(), 6)
    assert.equal(await page.getByRole('alert').count(), 0)
    await page.locator('.cor-input').fill('接着上一问')
    await page.locator('.cor-input').press('Enter')
    // 输入框发出即清空；等回答出来、保存结束、输入框重新可用，再刷新。
    await page.waitForFunction(() => document.querySelectorAll('.cor-turn').length === 8 && !document.querySelector('.cor-input')?.disabled)
    await page.reload()
    await rendered(page, '.cor-input')
    await page.getByText('接着上一问', { exact: true }).waitFor()
    assert.equal(await page.locator('.cor-turn').count(), 8)
    assert.equal(await page.getByRole('alert').count(), 0)
  })

  await scenario('assistant-formula-layout', { width: 320, height: 620 }, async (page, fault) => {
    await signIn(page)
    fault.chatReply = String.raw`| 下标 | 分式 |
| --- | --- |
| $a_{i_j}$ | $\frac{x_m}{y_n}$ |`
    await page.goto(baseUrl + '/assistant/new')
    await page.locator('.cor-input').fill('读出下标')
    await page.locator('.cor-input').press('Enter')
    await rendered(page, '.cor-table .katex')
    await assistantType(page)
    assert.equal(await page.locator('table .katex').count(), 2)
    assert.equal(await page.locator('.cor-thread').evaluate((el) => el.scrollWidth <= el.clientWidth), true)
  })

  await scenario('lecture-account-sync', viewport, async (page) => {
    const path = baseUrl + '/lecture/2026-11-19'
    const selected = '.lec-page:not([inert]) [aria-checked="true"]'
    const token = 'sb-fixture-auth-token'
    await page.goto(path)
    await page.locator('.lec-page:not([inert]) .lec-option').first().click()
    await page.locator(selected).waitFor()

    // 在登录页完成同步，然后清掉本机答案，以独立的云端重读验证归属。
    const upload = page.waitForResponse((r) => r.url().includes('/lecture_answers') && r.request().method() === 'POST' && r.ok())
    await page.goto(baseUrl + '/login')
    await page.getByRole('textbox', { name: '邮箱', exact: true }).fill(FIXTURE_USERS[0].email)
    await page.getByLabel('Mot de passe', { exact: true }).fill(FIXTURE_PASSWORD)
    await page.getByRole('button', { name: 'Entrer', exact: true }).click()
    await upload
    await page.waitForFunction(() => Object.values(JSON.parse(localStorage.getItem('mcw_lecture_answers_v2') || '{}'))
      .some((days) => days['2026-11-19']?.pending === false))
    await page.evaluate(() => localStorage.removeItem('mcw_lecture_answers_v2'))
    await page.goto(path)
    await page.locator(selected).waitFor()

    let release, started
    const blocked = new Promise((done) => { release = done })
    const writing = new Promise((done) => { started = done })
    await page.route('**/rest/v1/lecture_answers*', async (route) => {
      if (route.request().method() !== 'PATCH') return route.fallback()
      started()
      await blocked
      return route.fallback()
    })
    const changed = page.locator('.lec-page:not([inert]) .lec-option').nth(1)
    await changed.click()
    await writing
    assert.equal(await changed.getAttribute('aria-checked'), 'false')
    release()
    await page.waitForFunction(() => document.querySelectorAll('.lec-page:not([inert]) .lec-option')[1]?.getAttribute('aria-checked') === 'true')

    await page.evaluate(({ token, session }) => localStorage.setItem(token, JSON.stringify(session)), { token, session: fixtureSession(FIXTURE_USERS[1]) })
    const loaded = page.waitForResponse((r) => r.url().includes('/lecture_answers') && r.request().method() === 'GET')
    await page.reload()
    await loaded
    await rendered(page, '.lec-page:not([inert]) .lec-title')
    assert.equal(await page.locator(selected).count(), 0)
  })

  await scenario('lecture-neighbors-and-gaps', viewport, async (page, fault) => {
    fault.lectureDays = Array.from({ length: 7 }, (_, index) => ({
      ...lectureSamples[0], date: `2026-11-${14 + index}`, title: `Lecture ${14 + index}`,
    }))
    const requests = new Set()
    page.on('request', (r) => {
      const path = new URL(r.url()).pathname
      if (path.startsWith('/api/lecture/')) requests.add(path.split('/').at(-1))
    })
    await page.goto(baseUrl + '/vocabulary')
    await page.waitForURL(baseUrl + '/lecture')
    await rendered(page, '.lec-entry')
    assert.equal(await page.locator('.lec-entry').count(), 7)
    // 档案空闲时只预取最新三篇，不一次拉全部。
    await page.waitForFunction(() => performance.getEntriesByType('resource').filter((e) => /\/api\/lecture\/\d/.test(e.name)).length >= 3)
    assert.deepEqual([...requests].sort(), ['2026-11-18','2026-11-19','2026-11-20'])
    await page.locator('.lec-entry').filter({ hasText: 'Lecture 17' }).click()
    await rendered(page, '.lec-page:not([inert]) .lec-title')
    // 点开 17 日后补取它和前一天。
    assert.deepEqual([...requests].sort(), ['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20'])
    await page.locator('.paper-current .lec').evaluate((target) => {
      const touch = (clientX) => new Touch({ identifier: 1, target, clientX, clientY: 200 })
      target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [touch(250)] }))
      target.dispatchEvent(new TouchEvent('touchend', { bubbles: true, changedTouches: [touch(100)] }))
    })
    await page.waitForURL(baseUrl + '/lecture/2026-11-18')
    await page.locator('.lec-page:not([inert]) .lec-title').filter({ hasText: 'Lecture 18' }).waitFor({ state: 'attached' })

    await page.route('**/api/lecture/2026-11-20', (r) => r.fulfill({ status: 404, json: null }))
    await page.goto(baseUrl + '/lecture/2026-11-20')
    await page.waitForURL(baseUrl + '/lecture')
    await rendered(page, '.lec-entry')
    assert.equal(await page.locator('.lec-entry').filter({ hasText: 'Lecture 20' }).count(), 0)
    // 临时失败（5xx、超时）不把已发布的文章从档案里拿掉。
    await page.route('**/api/lecture/2026-11-19', (r) => r.fulfill({ status: 503, json: null }))
    const flaky = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/lecture/2026-11-19' && r.status() === 503)
    await page.goto(baseUrl + '/lecture/2026-11-18')
    await flaky
    await page.locator('.page-nav-back').click()
    await page.waitForURL(baseUrl + '/lecture')
    await rendered(page, '.lec-entry')
    assert.equal(await page.locator('.lec-entry').filter({ hasText: 'Lecture 19' }).count(), 1)
    await page.unroute('**/api/lecture/2026-11-19')
    fault.lectureStatus = 503
    const unavailable = page.waitForResponse((r) => new URL(r.url()).pathname === '/api/lecture' && r.status() === 503)
    await page.reload()
    await unavailable
    await page.locator('.lec-archive').waitFor({ state: 'attached' })
    assert.equal(await page.locator('.lec-entry, [role="alert"]').count(), 0)
  })

  await scenario('route-spelling', viewport, async (page) => {
    for (const path of ['/resources/', '/RESOURCES/', '/lecture/', '/assistant/', '/ASSISTANT/new/', '/login/', '/reset-password/']) {
      await page.goto(baseUrl + path)
      await page.waitForFunction(() => document.querySelector('#root > :not(.boot-overlay)') && !document.querySelector('.boot-overlay'))
      assert.equal(await page.locator('.site-header').count(), 0, `${path} 不应重复页眉`)
      assert.equal(await page.locator('.site-footer').count(), 0, `${path} 不应重复页脚`)
    }
    await rendered(page, '.lgn-title')
    await signIn(page)
    for (const path of ['/reset-password/', '/RESET-PASSWORD/']) {
      await page.goto(`${baseUrl}${path}?error=access_denied&error_code=otp_expired`)
      await page.getByText('链接已失效或账号发生了变化。请回到登录页重新申请重置邮件。', { exact: true }).waitFor()
      assert.equal(await page.locator('.password-field input').count(), 0, '过期链接不能借已有登录状态继续改密码')
    }
  })
}
