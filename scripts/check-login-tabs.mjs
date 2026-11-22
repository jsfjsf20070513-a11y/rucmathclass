import assert from 'node:assert/strict'

export async function checkLoginTabs(page) {
  const paper = page.locator('.paper-current[data-paper-visible="true"] .lgn')
  await paper.waitFor()
  await page.evaluate(() => document.fonts.ready)
  // 每次绘制都检查，包括点击后的第一帧。整个页面都能滚动，裁切只量输入框祖先的边界。
  for (const mode of ['注册', '找回密码', '登录', '验证码', '注册']) {
    const result = await paper.evaluate(async (root, mode) => {
      const rect = el => el.getBoundingClientRect()
      const $ = selector => root.querySelector(selector)
      const header = $('.lgn-masthead'), tabs = $('.login-tabs'), nav = $('.page-nav')
      const anchors = [nav, header, $('.lgn-title'), tabs]
      const tops = anchors.map(el => rect(el).top)
      const buttons = [...tabs.querySelectorAll('button')]
      const next = buttons.find(button => button.textContent === mode)
      const line = $('.login-underline'), submit = $('.lgn-submit')
      const email = $('input[type="email"]')
      const inputHeight = rect(email).height
      const startX = rect(line).left, endX = rect(next).left
      const submitTops = []
      let sliding = false
      const start = performance.now()
      next.click()
      await Promise.resolve()
      do {
        const time = Math.round(performance.now() - start)
        const check = (test, issue) => {
          if (!test) throw new Error(mode + '，' + time + 'ms：' + issue)
        }
        check(root.closest('.paper-current').dataset.paperVisible === 'true', '纸面被隐藏')
        check(email.checkVisibility({ opacityProperty: true, visibilityProperty: true }), '邮箱框消失')
        check(document.documentElement.scrollWidth <= innerWidth + 1, '页面横向溢出')
        check(anchors.every((el, i) => Math.abs(rect(el).top - tops[i]) < 1), '页眉或切换项位移')
        check(anchors.every(el => el.checkVisibility({ opacityProperty: true, visibilityProperty: true })), '页眉或切换项消失')
        const lineBox = rect(line)
        check(tabs.querySelectorAll('.login-underline').length === 1 && lineBox.width > 0 && lineBox.height >= 1 &&
          line.checkVisibility({ opacityProperty: true, visibilityProperty: true }), '滑线消失或多于一条')
        check(buttons.every(button => {
          const css = getComputedStyle(button)
          return css.boxShadow === 'none' && css.borderBottomWidth === '0px' && !css.textDecorationLine.includes('underline')
        }), '切换项又绘制了自己的下划线')
        const x = lineBox.left
        sliding ||= x > Math.min(startX, endX) + 1 && x < Math.max(startX, endX) - 1
        let lastBottom = -Infinity
        for (const input of root.querySelectorAll('form input')) {
          if (!input.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue
          const box = rect(input)
          check(box.height >= inputHeight - 1, '输入框高度被压缩')
          check(box.top >= lastBottom - 1, '输入框相互重叠')
          for (let el = input.parentElement; el && el !== document.body; el = el.parentElement) {
            if (getComputedStyle(el).overflowY !== 'visible') {
              check(rect(el).top <= box.top + 1 && rect(el).bottom >= box.bottom - 1, '输入框被裁切')
            }
          }
          lastBottom = box.bottom
        }
        const y = rect(submit).top
        check(y >= lastBottom - 1, '提交按钮盖住了输入框')
        submitTops.push(y)
        await new Promise(requestAnimationFrame)
      } while (performance.now() - start < 560)
      const final = rect(line), target = rect(next)
      return { sliding, aligned: Math.abs(final.left - target.left) < 1 && Math.abs(final.right - target.right) < 1,
        moved: new Set(submitTops.map(Math.round)).size }
    }, mode)
    assert.ok(result.aligned && result.sliding, mode + ' 的下划线应滑到目标位置')
    assert.ok(result.moved > 2, mode + ' 的按钮应随字段展开或收起')
  }

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await paper.getByRole('button', { name: '找回密码', exact: true }).click()
  const motion = await paper.evaluate(root => root.getAnimations({ subtree: true })
    .filter(a => a.effect.getComputedTiming().endTime > 1).length)
  assert.equal(motion, 0, '减少动态效果时应立即切换')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
}
