import { memo } from 'react'
import MarkdownIt from 'markdown-it'
import { tex } from '@mdit/plugin-tex'
import katex from 'katex'

const markdown = new MarkdownIt({ html: false }).disable('image').use(tex, {
  delimiters: 'all',
  render(expression, displayMode) {
    const formula = katex.renderToString(expression, { displayMode, throwOnError: false, trust: false })
    return `<span class="${displayMode ? 'cor-display-math' : 'cor-inline-math'}">${formula}</span>`
  },
})

const closingMarker = (open) => open === '$$' ? '$$' : open === '\\[' ? '\\]' : null

// 插件会把缺少结束符的 $$ 块延伸到文末。只让它接手已经收齐的公式块。
markdown.block.ruler.before('math_block_dollar', 'pending_display', (state, start, end, silent) => {
  const lineAt = (i) => state.src.slice(state.bMarks[i] + state.tShift[i], state.eMarks[i]).trimEnd()
  const first = lineAt(start)
  const close = closingMarker(first.slice(0, 2))
  if (!close) return false
  const tail = first.slice(2)
  const endMarker = tail.indexOf(close)
  if (endMarker >= 0 && endMarker === tail.length - close.length) return false
  if (endMarker < 0) {
    for (let i = start + 1; i < end; i++) {
      const line = lineAt(i)
      if (!line || line.startsWith('```') || line.startsWith('~~~')) break
      if (line.startsWith(first.slice(0, 2)) && line !== close) break
      if (line.endsWith(close)) return false
    }
  }
  if (!silent) {
    state.push('paragraph_open', 'p', 1)
    const inline = state.push('inline', '', 0)
    inline.content = first
    inline.children = []
    state.push('paragraph_close', 'p', -1)
    state.line = start + 1
  }
  return true
}, { alt: ['paragraph', 'reference', 'blockquote', 'list'] })

// 模型有时把独立公式和正文写在同一行。行尾标点仍属于正文。
markdown.inline.ruler.after('math_inline_bracket', 'display_in_prose', (state, silent) => {
  const open = state.src.slice(state.pos, state.pos + 2)
  const close = closingMarker(open)
  if (!close && open !== '\\(') return false
  // 已闭合的行内括号由插件处理，这里保留尚未配对的起始符。
  const end = close ? state.src.indexOf(close, state.pos + 2) : -1
  const content = end < 0 ? '' : state.src.slice(state.pos + 2, end)
  if (!content || content.includes('\n')) {
    if (!silent) state.pending += open
    state.pos += 2
  } else {
    if (!silent) state.push('math_block', 'math', 0).content = content
    state.pos = end + 2
  }
  return true
})

markdown.renderer.rules.table_open = () => '<div class="cor-table"><table>'
markdown.renderer.rules.table_close = () => '</table></div>'

markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  tokens[index].attrSet('target', '_blank')
  tokens[index].attrSet('rel', 'noopener noreferrer')
  return renderer.renderToken(tokens, index, options)
}

function AssistantReply({ text }) {
  return <div className="cor-r-text" dangerouslySetInnerHTML={{ __html: markdown.render(text) }} />
}

export default memo(AssistantReply)
