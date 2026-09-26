import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import AuthStatus from '../components/AuthStatus'
import { resourceCategories } from '../data/resourceCatalog'
import { normalizeResourcePayload, submitOpsSubmission } from '../lib/opsQueue'

// 资源增补 ResourceCurate — design contract: centered « Curation de ressources »
// masthead → a 4-field submit form (书架 / 标题 / 链接 / 理由) → 待审 confirmation.
// Writes a resource recommendation to the ops queue. No review UI is routed.
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const SHELVES = resourceCategories.map((category, index) => ({
  value: category.label,
  label: `${ROMAN[index] || index + 1} · ${category.label}`,
}))
const EMPTY = { category: resourceCategories[0]?.label || '', title: '', url: '', tag: '', description: '' }

export default function ResourceCurate() {
  const { user } = useAuth()
  return <ResourceCurateForm key={user?.id || 'guest'} />
}

function ResourceCurateForm() {
  const { user, loading: authLoading, error: authError } = useAuth()
  const [form, setForm] = useState(EMPTY)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!user) {
      setError('推荐资源需要先登录。')
      return
    }
    setSubmitting(true)
    try {
      const next = await submitOpsSubmission('resource', normalizeResourcePayload(form), user)
      setDone({ title: next?.payload?.title || form.title || '未命名资源' })
      setForm(EMPTY)
    } catch (err) {
      setError(err?.message || '提交失败,请稍后重试。')
    } finally {
      setSubmitting(false)
    }
  }

  const again = () => {
    setDone(null)
    setError('')
    setForm(EMPTY)
  }

  return (
    <article className="page-column curate-page">
      <header className="login-masthead">
        <Link to="/resources" className="login-back">返回资源 · Bibliothèque</Link>
        <p className="login-eyebrow">Curation de ressources</p>
        <h1 className="login-title">推荐一条资源</h1>
        <p className="login-summary">推荐一条书目或课程链接,审阅后并入「资源」页的公开书架。</p>
      </header>

      {authLoading || authError ? <AuthStatus /> : done ? (
        <div className="reset-state">
          <p className="reset-ok">✓ 已提交</p>
          <p>谢谢你的推荐 ——「{done.title}」已进入待审队列,通过后会并入资源页的书架。</p>
          <div className="login-dest">
            <button type="button" className="vocab-verify" onClick={again}>再推荐一条</button>
            <Link to="/resources" className="vocab-verify">回到资源 →</Link>
          </div>
        </div>
      ) : !user ? (
        <div className="reset-state">
          <p>推荐资源需要先登录。</p>
          <p><Link to="/login" className="vocab-verify">前往登录 →</Link></p>
        </div>
      ) : (
        <section className="login-section">
          <form className="editorial-form curate-form" onSubmit={submit}>
            <label>
              <span>归入书架 · Rayon</span>
              <select value={form.category} onChange={set('category')}>
                {SHELVES.map((shelf) => <option key={shelf.value} value={shelf.value}>{shelf.label}</option>)}
              </select>
            </label>
            <label>
              <span>标题 · Titre</span>
              <input type="text" value={form.title} onChange={set('title')} placeholder="例:MIT OCW — Linear Algebra" required />
            </label>
            <label>
              <span>链接 · Lien</span>
              <input type="url" value={form.url} onChange={set('url')} placeholder="https://…" required />
            </label>
            <label>
              <span>推荐理由 · Pourquoi</span>
              <textarea rows={3} value={form.description} onChange={set('description')} placeholder="一句话说明它好在哪、适合谁。" />
            </label>
            <div className="editorial-actions curate-actions">
              <button type="submit" className="vocab-verify" disabled={submitting}>{submitting ? '提交中…' : '提交待审 · Proposer'}</button>
              <Link to="/resources">取消</Link>
            </div>
            <p className="curate-note">提交后由管理员审阅;通过后会出现在资源页对应书架。</p>
            {error ? <p className="status-line is-error">{error}</p> : null}
          </form>
        </section>
      )}
    </article>
  )
}
