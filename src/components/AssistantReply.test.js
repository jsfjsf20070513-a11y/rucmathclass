import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import AssistantReply from './AssistantReply'

const render = (text) => renderToStaticMarkup(createElement(AssistantReply, { text }))
const mathCount = (html) => (html.match(/class="katex"/g) || []).length

describe('答疑正文', () => {
  it('保留标题、编号、嵌套列表、引用、表格、粗斜体和链接', () => {
    const html = render('## 长度\n\n先看**向量 $v$ 的长度**。\n\n2. 第一步\n3. 第二步\n   - *相等*时成立\n\n> [出处](https://example.org/math)\n\n| 数 | 根 |\n| --- | --- |\n| 4 | 2 |')
    expect(html).toContain('<h2>长度</h2>')
    expect(html).toContain('<strong>向量 ')
    expect(html).toContain(' 的长度</strong>。</p>')
    expect(html).toMatch(/<ol start="2">\s*<li>第一步<\/li>\s*<li>第二步\s*<ul>\s*<li><em>相等<\/em>时成立<\/li>/)
    expect(html).toMatch(/<blockquote>\s*<p><a href="https:\/\/example.org\/math" target="_blank" rel="noopener noreferrer">出处<\/a>/)
    expect(html).toContain('<th>根</th>')
    expect(html).toContain('<td>2</td>')
    expect(mathCount(html)).toBe(1)
  })

  it('同一条回复支持四种公式定界符，括号、标点和同一行的正文各归其位', () => {
    const html = render(String.raw`先算 $a$、\(b\)。

$$
c^2
$$

\[
d^2
\]

还可以写 $$e$$，以及 \[f\]。`)
    expect(mathCount(html)).toBe(6)
    expect(html.match(/class="katex-display"/g)).toHaveLength(4)
    expect(html).toContain('，以及 ')
    expect(html).toContain('。</p>')
  })

  it('金额、转义的美元和代码按原文显示', () => {
    const html = render('标价 $5 和 $10。另算 $2x$。\\$8。输入 `$x$`。\n\n```txt\n<b>**原文**</b>\n\n$$x$$\n```\n\n输入完毕。')
    expect(html).toContain('标价 $5 和 $10。')
    expect(html).toContain('$8。输入 <code>$x$</code>')
    expect(html).toContain('<pre><code class="language-txt">&lt;b&gt;**原文**&lt;/b&gt;\n\n$$x$$\n</code></pre>')
    expect(html).toContain('<p>输入完毕。</p>')
    expect(mathCount(html)).toBe(1)
  })

  it('转义原始 HTML，拒绝危险链接和受信任的 KaTeX HTML 命令', () => {
    const html = render('<b>原文</b> <script>1</script>\n\n[链接](javascript:alert(1))\n\n$\\htmlClass{unexpected}{x}$')
    expect(html).toContain('&lt;b&gt;原文&lt;/b&gt;')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toMatch(/<script|<b>|href="javascript:|class="unexpected"/)
  })

  it.each(['$$\nx=', '\\[\nx=', '还在输入 $x=', '还在输入 \\(x='])('未完成的公式不会吞下后续段落和公式：%s', (partial) => {
    const html = render(partial + '\n\n## 下一步\n\n$$y=1$$')
    expect(html).toContain('<h2>下一步</h2>')
    expect(html).toContain(partial.split('\n')[0])
    expect(mathCount(html)).toBe(1)
  })

  it('流式代码围栏到回复末尾自动闭合，补齐后继续排正文', () => {
    const partial = '前言。\n\n```js\nconst x = "$5";\n'
    expect(render(partial)).toMatch(/const x = &quot;\$5&quot;;\n<\/code><\/pre>\s*<\/div>$/)
    const html = render(partial + '```\n\n**结论**：$x$。')
    expect(html).toMatch(/<\/pre>\s*<p><strong>结论<\/strong>/)
    expect(mathCount(html)).toBe(1)
  })
})
