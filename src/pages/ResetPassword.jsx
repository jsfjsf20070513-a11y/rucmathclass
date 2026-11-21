import { useState } from 'react'
import { Link } from 'react-router-dom'
import PasswordField from '../components/PasswordField'
import PageNav from '../components/PageNav'
import AuthStatus from '../components/AuthStatus'
import { usePasswordReset } from '../hooks/usePasswordReset'

// 重设密码 ResetPassword — design contract: centered « Réinitialisation »
// masthead + a narrow underline-input form, with success / invalid states.
// The real Supabase recovery-session logic is preserved.
function Masthead({ summary }) {
  return (
    <header className="lgn-masthead">
      <h1 className="lgn-title" lang="fr">Réinitialisation</h1>
      {summary && <p className="lgn-summary">{summary}</p>}
    </header>
  )
}

export default function ResetPassword({ direct }) {
  const { pageState, account, password, setPassword, confirmPassword, setConfirmPassword, submitting, uncertain, message, handleSubmit } = usePasswordReset()

  // 从邮件打开是一次全页加载。保留刊头，等会话确认后再翻入表单或结果。
  const [entering, setEntering] = useState(() => direct && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const motion = entering ? ' page-arrive' : ''
  const summaries = {
    invalid: '链接已失效或账号发生了变化。请回到登录页重新申请重置邮件。',
    unavailable: '账号服务暂时不可用，请稍后再修改密码。',
    success: '密码已更新，当前账号仍保持登录。',
    form: `为当前账号 ${account?.email || ''} 设置新的登录密码。`,
  }

  let body
  if (pageState === 'loading') body = <AuthStatus />
  else if (pageState === 'invalid' || pageState === 'unavailable') {
    body = <div className={`reset-state${motion}`}>
      <p><Link to="/login" className="text-action">重新申请 · 找回密码 →</Link></p>
    </div>
  } else if (pageState === 'success') {
    body = <div className="reset-state">
      <p><Link to="/" className="text-action">返回首页 · Accueil →</Link></p>
    </div>
  } else {
    body = (
      <section className={`login-section${motion}`}>
        <form className="editorial-form login-form" onSubmit={handleSubmit}>
          <PasswordField
            label="新密码 · Nouveau mot de passe"
            disabled={submitting || uncertain}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            autoComplete="new-password"
          />
          <PasswordField
            label="确认新密码 · Confirmer"
            disabled={submitting || uncertain}
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            autoComplete="new-password"
          />
          <div className="editorial-actions login-submit">
            <button type="submit" className="text-action" disabled={submitting || uncertain}>
              {submitting ? '保存中…' : '保存新密码 · Enregistrer'}
            </button>
          </div>
          {message ? <p className="status-line is-error" role="status">{message}</p> : null}
          {uncertain ? <Link to="/login" className="text-action">前往登录页核对 →</Link> : null}
        </form>
      </section>
    )
  }

  return <article className="page-column login-page lgn lgn-with-nav" data-page-ready={pageState !== 'loading'}
    onAnimationEnd={(event) => { if (event.animationName === 'magArrive') setEntering(false) }}>
    <PageNav to="/login" label="← Connexion" />
    <Masthead summary={summaries[pageState]} />
    {body}
  </article>
}
