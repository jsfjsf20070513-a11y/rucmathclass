// Only request faces and Unicode subsets needed by the paper being opened.
// Parked shelves and neighbouring articles are already mounted for the page turn.
const sheets = '.mag-page, .bib-page, .lec-page'
const ready = '[data-page-ready="true"], .cor-body[aria-busy="false"], .page-status[role="alert"]'
const chineseFont = '"Noto Serif SC"'
const coverage = new Map()
const loadedText = new Map()

// FontFaceSet.load selects weight, style and the corresponding Unicode subset.
// Follow the CSS stack in order so a Latin-only page does not wait for a CJK file.
function covers(family, char) {
  if (!coverage.has(family)) {
    const faces = [...document.fonts].filter(face => face.family.replaceAll('"', '') === family)
    const ranges = [...new Set(faces.flatMap(face => face.unicodeRange.split(',')))].map(range => {
      const [from, to = from] = range.trim().slice(2).split('-')
      return [parseInt(from.replaceAll('?', '0'), 16), parseInt(to.replaceAll('?', 'f'), 16)]
    })
    coverage.set(family, ranges)
  }
  const point = char.codePointAt(0)
  return coverage.get(family).some(([start, end]) => point >= start && point <= end)
}

function paperRequests(root) {
  const runs = new Map()
  function visit(element) {
    if (element.matches('[hidden], svg, math, .katex-mathml, [aria-hidden="true"]:not(.katex-html)')) return
    if (element.matches(sheets) && (element.inert || getComputedStyle(element).visibility === 'hidden')) return
    const text = element.matches('input, textarea') ? element.placeholder
      : [...element.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.data).join('')
    if (text.trim()) {
      const style = getComputedStyle(element)
      const descriptor = style.fontStyle + ' ' + style.fontWeight + ' 16px '
      const families = style.fontFamily.split(',').map(name => name.trim().replaceAll('"', ''))
      for (const char of new Set(text)) {
        const family = families.find(name => name === 'Noto Serif SC' || covers(name, char))
        if (!family) continue
        const font = descriptor + '"' + family + '"'
        if (!runs.has(font)) runs.set(font, new Set())
        runs.get(font).add(char)
      }
    }
    for (const child of element.children) visit(child)
  }
  visit(root)
  return [...runs].map(([font, chars]) => [font, [...chars].join('')])
}

export function prefetchReadingFonts() {
  return Promise.all([
    document.fonts.load('italic 500 16px "Cormorant Garamond"', 'Lecture'),
    document.fonts.load('400 16px "EB Garamond"', 'Archives'),
    document.fonts.load('600 16px "EB Garamond"', 'Verso'),
    document.fonts.load('16px ' + chineseFont, '书架分析登录密码'),
  ])
}

export function focusOnPaper(element, options) {
  const paper = element?.closest('.paper-current')
  const focus = () => { if (element?.isConnected) element.focus(options) }
  if (!paper || paper.dataset.paperVisible === 'true') { focus(); return }
  paper.addEventListener('paper-visible', focus, { once: true })
  return () => paper.removeEventListener('paper-visible', focus)
}

export function watchPaperFonts(current) {
  let sheet, generation = 0, timer, previousFocus
  function show(visible) {
    if (current.dataset.paperVisible === String(visible)) return
    if (!visible && current.contains(document.activeElement)) previousFocus = document.activeElement
    current.dataset.paperVisible = String(visible)
    current.toggleAttribute('inert', !visible)
    if (visible) {
      current.removeAttribute('aria-hidden')
      if (current.contains(previousFocus) && document.activeElement === document.body) {
        previousFocus.focus({ preventScroll: true })
      }
      previousFocus = null
      current.dispatchEvent(new Event('paper-visible'))
    } else current.setAttribute('aria-hidden', 'true')
  }
  function refresh() {
    // Suspense can retain the previous route with display:none while its chunk loads.
    const root = [...current.children].find(child => getComputedStyle(child).display !== 'none')
    const active = root?.querySelector('.mag-connexion[style*="visible"], .mag-page:not([inert]), .bib-page:not([inert]), .lec-page:not([inert])') || root
    // 已经显示的登录页换表单时，由浏览器按需补字，纸面保持可见。
    if (active === sheet && root?.matches('.lgn-modes') &&
      current.dataset.paperVisible === 'true' && root.matches(ready)) return
    const attempt = ++generation
    if (active !== sheet) {
      sheet = active
      clearTimeout(timer)
      timer = undefined
      delete current.dataset.paperFonts
    }
    const reveal = (mode) => {
      if (attempt !== generation) return
      clearTimeout(timer)
      timer = undefined
      current.dataset.paperFonts = mode
      show(Boolean(root && (root.matches(ready) || root.querySelector(ready))))
    }
    if (!root) { show(false); return }
    if (current.dataset.paperFonts === 'fallback') { reveal('fallback'); return }
    // WebKit can report fonts.check() as true while a preload is still in flight.
    const pending = paperRequests(root).filter(([font, text]) => {
      const known = loadedText.get(font)
      return !known || [...text].some(char => !known.has(char))
    })
    if (!pending.length) { reveal('web'); return }
    show(false)
    current.dataset.paperFonts = 'waiting'
    // DOM updates (including arrival of the reading data) share the same deadline.
    timer ??= setTimeout(() => {
      generation++
      timer = undefined
      current.dataset.paperFonts = 'fallback'
      show(Boolean(root && (root.matches(ready) || root.querySelector(ready))))
    }, 8000)
    Promise.all(pending.map(async ([font, text]) => {
      await document.fonts.load(font, text)
      if (!loadedText.has(font)) loadedText.set(font, new Set())
      for (const char of text) loadedText.get(font).add(char)
    })).then(() => reveal('web'), () => reveal('fallback'))
  }
  const observer = new MutationObserver(records => {
    const affectsPaper = records.some(({ type, target, attributeName }) => {
      if (type === 'childList') return true
      if (target === current) return false
      return attributeName !== 'style' || target.parentElement === current || target.matches?.('.mag-connexion')
    })
    if (affectsPaper) refresh()
  })
  observer.observe(current, { subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['inert', 'data-page-ready', 'aria-busy', 'placeholder', 'hidden', 'style'] })
  refresh()
  return { refresh, disconnect() { generation++; clearTimeout(timer); observer.disconnect() } }
}
