import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fixtureSession } from './lib/localFixture.mjs'

export async function checkSafariStrike(page, baseUrl, directory) {
  await mkdir(directory, { recursive: true })
  async function frames(label, count) {
    for (let i = 0; i < count; i++) {
      await page.screenshot({ path: join(directory, `${label}-${String(i).padStart(2, '0')}.png`), scale: 'css' })
    }
  }
  await page.addInitScript(session => localStorage.setItem('sb-fixture-auth-token', JSON.stringify(session)), fixtureSession())
  await page.goto(baseUrl + '/assistant')
  const link = page.locator('.paper-current .cor-entry .lec-entry').first()
  await link.waitFor()
  const href = await link.getAttribute('href')
  assert.equal(await page.locator('.cor-strike').count(), 0)
  await frames('open-before', 3)
  const samples = await link.evaluateHandle(anchor => {
    const result = { framesWithRow: 0, framesWithStrike: 0 }
    const sample = () => {
      // 翻页时，画面中的列表可能是旧页面的副本。
      const row = document.querySelector(`.cor-entry a[href="${anchor.getAttribute('href')}"]`)
      if (!row) return
      result.framesWithRow++
      if (row.querySelector('.cor-strike')) result.framesWithStrike++
      requestAnimationFrame(sample)
    }
    anchor.addEventListener('touchstart', sample, { once: true })
    return result
  })
  await Promise.all([link.tap(), frames('open-tap', 16)])
  await page.waitForURL(baseUrl + href)
  await frames('open-detail', 6)
  await page.locator('.cor-r-text').first().waitFor()
  await page.waitForFunction(() => !document.querySelector('.paper-stage[data-motion]'))
  const { framesWithRow, framesWithStrike } = await samples.jsonValue()
  assert.ok(framesWithRow >= 2, '点按后应至少采到两帧包含该行的画面')
  assert.equal(framesWithStrike, 0, '点进对话期间标题没有删除线')
  await frames('open-after', 2)

  await page.getByRole('link', { name: 'Conversations', exact: true }).tap()
  await link.waitFor()
  await page.waitForFunction(() => !document.querySelector('.paper-stage[data-motion]'))
  await page.getByRole('button', { name: '管理', exact: true }).tap()
  const row = page.locator('.paper-current .cor-entry').filter({ has: page.locator(`a[href="${href}"]`) })
  const events = await row.evaluateHandle(element => {
    const seen = []
    element.addEventListener('animationend', event => {
      if (event.target.matches('.cor-strike')) seen.push(getComputedStyle(event.target).clipPath)
    })
    element.addEventListener('transitionend', event => {
      if (event.propertyName === 'grid-template-rows') seen.push(event.propertyName)
    })
    return seen
  })
  await frames('delete-before', 1)
  await Promise.all([
    row.getByRole('button', { name: /^删除/ }).tap(),
    row.locator('.cor-strike').waitFor({ state: 'attached' }).then(() => frames('delete', 36)),
  ])
  await row.waitFor({ state: 'detached' })
  const [clip, collapse] = await events.jsonValue()
  assert.match(clip, /^inset\(0(?:px|%)(?: 0(?:px|%)){0,3}\)$/, '画完后细线完整可见')
  assert.equal(collapse, 'grid-template-rows', '画完后该行收起')
  await frames('delete-after', 1)
}
