// 字体和页面并行加载。每张纸出现时只选一次，下载迟到就沿用本机字体。
const families = [
  ['--font-bodoni', 'Bodoni Moda', ['normal', 'italic']],
  ['--font-cormorant', 'Cormorant Garamond', ['normal', 'italic']],
  ['--font-eb', 'EB Garamond', ['normal']],
  ['--font-pinyon', 'Pinyon Script', ['normal']],
]
const available = new Map()

export function preparePaperFonts() {
  for (const [property, family, styles] of families) {
    Promise.all(styles.map(style => document.fonts.load(style + ' 16px "' + family + '"', 'Édition')))
      .then(matches => {
        if (matches.every(faces => faces.length)) available.set(property, '"' + family + '"')
      }).catch(() => {})
  }
}

export function pinPaperFonts(element) {
  if (!element) return
  for (const [property, family] of available) element.style.setProperty(property, family)
}

export function copyPaperFonts(source, copy) {
  const style = getComputedStyle(source)
  for (const [property] of families) {
    const family = style.getPropertyValue(property)
    if (family) copy.style.setProperty(property, family)
  }
}
