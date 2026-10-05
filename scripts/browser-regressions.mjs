import assert from 'node:assert/strict'
import { fixtureSession } from './lib/localFixture.mjs'

export async function checkRegressions({ scenario, baseUrl, rendered }) {
  const viewport = { width: 390, height: 844 }
  const session = fixtureSession()
  const signIn = (page) => page.addInitScript((session) => localStorage.setItem('sb-fixture-auth-token', JSON.stringify(session)), session)
  const seedStudy = (page, status, ids = ['fr-bonjour'], i = 0) => page.evaluate(({ userId, status, ids, i }) => {
    localStorage.setItem(`mcw_vocab_session_v2:${userId}`, JSON.stringify({
      v: 2, userId, day: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()),
      status, level: 'all', queue: ids.map((id) => ({ id })), i, studyIdx: 0,
      stats: { correct: 0, attempts: 0, combo: 0, maxCombo: 0 }, wrongIds: [],
    }))
  }, { userId: session.user.id, status, ids, i })

  await scenario('chinese-input', viewport, async (page) => {
    await signIn(page)
    let sent = 0
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/api/chat') sent += 1 })
    await page.goto(`${baseUrl}/assistant`)
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

  await scenario('vocabulary-keyboard', viewport, async (page, fault) => {
    await signIn(page)
    await page.goto(`${baseUrl}/vocabulary`)
    await seedStudy(page, 'ready')
    await page.reload()
    fault.reviewStatus = 503
    const options = page.locator('.vpl-option')
    await options.first().waitFor()
    const labels = await options.allTextContents()
    await options.nth(labels.findIndex((label) => !label.includes('你好'))).click()
    const retry = page.getByRole('button', { name: '重试保存 →' })
    await retry.waitFor()
    fault.reviewStatus = 200
    await retry.focus()
    await page.keyboard.press('Enter')
    await retry.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => { const button = document.querySelector('.vpl-fb-actions button'); return button && !button.disabled })
    assert.equal(await page.getByRole('button', { name: /Terminer/ }).isEnabled(), true)
    const explain = page.getByRole('link', { name: /请助手解释/ })
    await explain.focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(/\/assistant\?term=/)
    await rendered(page, '.cor-input')

    await seedStudy(page, 'ready')
    await page.goto(`${baseUrl}/vocabulary`)
    await options.first().waitFor()
    await page.locator('.vpl-option').filter({ hasText: '你好' }).click()
    await page.waitForFunction(() => { const button = document.querySelector('.vpl-fb-actions button'); return button && !button.disabled })
    await page.evaluate(() => document.activeElement?.blur())
    await page.keyboard.press('Enter')
    await page.getByRole('heading', { name: '本节完成', exact: true }).waitFor()
    assert.ok(!(await page.locator('.vpl-deckstats').textContent()).includes('连续'))

    await seedStudy(page, 'ready', ['fr-bonjour', 'fr-merci'], 1)
    await page.goto(`${baseUrl}/vocabulary`)
    const spelling = page.getByRole('textbox', { name: '法语拼写输入', exact: true })
    await spelling.fill('merci')
    for (const properties of [{ isComposing: true }, { keyCode: 229 }]) {
      await spelling.dispatchEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...properties })
      await page.evaluate(() => new Promise(requestAnimationFrame))
      assert.equal(await page.locator('.vpl-fb').count(), 0, '拼写题选词时不能提前作答')
    }
    await spelling.press('Enter')
    await page.getByText('Juste ✓ 答对', { exact: true }).waitFor()
    await page.waitForFunction(() => { const button = document.querySelector('.vpl-fb-actions button'); return button && !button.disabled })
    await page.reload()
    await page.getByRole('heading', { name: '本节完成', exact: true }).waitFor()
    assert.match(await page.locator('.vpl-done-score').textContent(), /答对 1 \/ 1/)
  })

  await scenario('vocabulary-audio-cancel', viewport, async (page) => {
    await signIn(page)
    await page.addInitScript(() => {
      const events = new EventTarget()
      window.__spoken = []
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
        cancel() {}, getVoices: () => [],
        speak: (utterance) => window.__spoken.push(utterance.text),
        addEventListener: (...args) => events.addEventListener(...args),
        removeEventListener: (...args) => events.removeEventListener(...args),
      } })
      window.__voicesReady = () => events.dispatchEvent(new Event('voiceschanged'))
    })
    await page.goto(`${baseUrl}/vocabulary`)
    await seedStudy(page, 'study', ['fr-bonjour', 'fr-merci'])
    await page.reload()
    await rendered(page, '.vpl-study-zh')
    await page.clock.install()
    await page.clock.pauseAt(new Date(Date.now() + 50))
    const listen = page.getByRole('button', { name: /Écouter/ })
    await listen.dispatchEvent('click')
    await page.getByRole('button', { name: /Suivant/ }).dispatchEvent('click')
    await page.waitForFunction(() => document.querySelector('.vpl-word')?.textContent === 'merci')
    await page.evaluate(() => window.__voicesReady())
    await page.clock.runFor(400)
    assert.deepEqual(await page.evaluate(() => window.__spoken), [], '换词后不应朗读旧词')
    await listen.dispatchEvent('click')
    await listen.dispatchEvent('click')
    await page.evaluate(() => window.__voicesReady())
    await page.clock.runFor(400)
    assert.deepEqual(await page.evaluate(() => window.__spoken), ['merci'], '连点只保留最后一次朗读')
    await listen.dispatchEvent('click')
    await page.getByRole('button', { name: '← Accueil', exact: true }).dispatchEvent('click')
    await page.waitForURL(baseUrl + '/')
    await page.evaluate(() => window.__voicesReady())
    await page.clock.runFor(2000)
    assert.deepEqual(await page.evaluate(() => window.__spoken), ['merci'], '离页后旧事件和定时器不能再次朗读')
    await page.clock.resume()
  })

  await scenario('route-spelling', viewport, async (page) => {
    for (const path of ['/resources/', '/RESOURCES/', '/vocabulary/', '/assistant/', '/login/', '/reset-password/']) {
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
