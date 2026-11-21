import { copyPaperFonts } from './paperFonts'

// 只复制画面。滚动位置要在副本接入文档后还原，表单值随画面一起销毁。
export function paperSnapshot(source) {
  const copy = source.cloneNode(true)
  copyPaperFonts(source, copy)
  copy.setAttribute('aria-hidden', 'true')
  copy.inert = true
  const motions = ['lec-rise', 'lec-retract', 'page-arrive', 'page-arrive-back']
  for (const element of [copy, ...copy.querySelectorAll('.lec-rise, .lec-retract, .page-arrive, .page-arrive-back')]) {
    element.classList.remove(...motions)
  }
  for (const element of copy.querySelectorAll('[id]')) element.removeAttribute('id')
  for (const field of copy.querySelectorAll('input[autocomplete$="password"]')) {
    const masked = '•'.repeat(Math.min(field.value.length, 32))
    field.type = 'password'
    field.removeAttribute('value')
    field.value = masked
  }
  const selector = '.lec-scroll, .cor-thread, .mag-scroll, .bib-scroll'
  const offsets = [...source.querySelectorAll(selector)].map((node) => node.scrollTop)
  const top = source.scrollTop
  return (container) => {
    container.appendChild(copy)
    copy.scrollTop = top
    copy.querySelectorAll(selector).forEach((node, i) => { node.scrollTop = offsets[i] })
    return copy
  }
}
