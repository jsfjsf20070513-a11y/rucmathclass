import { Link } from 'react-router-dom'
import PasswordField from '../components/PasswordField'
import AuthStatus from '../components/AuthStatus'
import { usePasswordReset } from '../hooks/usePasswordReset'

// 重设密码 ResetPassword — design contract: centered « Réinitialisation »
// masthead + a narrow underline-input form, with success / invalid states.
// The real Supabase recovery-session logic is preserved.
function Masthead({ summary }) {
  return (
    <header className="lgn-masthead">
      <Link to="/login" className="lgn-back" lang="fr">← Connexion</Link>
      <h1 className="lgn-title" lang="fr">Réinitialisation</h1>
      <p className="lgn-summary">{summary}</p>
    </header>
  )
}

export default function ResetPassword() {
  const { pageState, account, password, setPassword, confirmPassword, setConfirmPassword, submitting, uncertain, message, handleSubmit } = usePasswordReset()

  if (pageState === 'loading') {
    return (
      <article className="page-column login-page lgn">
        <Masthead summary="正在确认当前账号…" />
        <AuthStatus />
      </article>
    )
  }

  if (pageState === 'invalid' || pageState === 'unavailable') {
    return (
      <article className="page-column login-page lgn">
        <Masthead
          summary={pageState === 'invalid'
            ? '链接已失效或账号发生了变化。请回到登录页重新申请重置邮件。'
            : '账号服务暂时不可用，请稍后再修改密码。'}
        />
        <div className="reset-state">
          <p><Link to="/login" className="text-action">重新申请 · 找回密码 →</Link></p>
        </div>
      </article>
    )
  }

  if (pageState === 'success') {
    return (
      <article className="page-column login-page lgn">
        <Masthead summary="密码已更新，当前账号仍保持登录。" />
        <div className="reset-state">
          <p className="reset-ok">✓ 已更新</p>
          <p><Link to="/" className="text-action">返回首页 · Accueil →</Link></p>
        </div>
      </article>
    )
  }

  return (
    <article className="page-column login-page lgn">
      <Masthead summary={`为当前账号 ${account.email || ''} 设置新的登录密码。`} />

      <section className="login-section">
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
    </article>
  )
}
