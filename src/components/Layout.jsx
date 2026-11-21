import { Link, Outlet, useLocation } from 'react-router-dom'
import PageNav from './PageNav'
import { useAuth } from '../context/useAuth'
import { normalizeRoutePath } from '../lib/routePath'

export default function Layout() {
  const location = useLocation()
  const { user, signOut, isAuthEnabled, signingOut, signOutError } = useAuth()
  const displayName = user?.user_metadata?.nickname || user?.user_metadata?.real_name || user?.email || ''

  // 杂志刊页面自带角落导航/细导航条,不渲染通用页眉页脚。
  // `/` 是 100svh 翻页刊;内页与登录页同属一本书(Connexion 即杂志第 06 屏)。
  const pathname = normalizeRoutePath(location.pathname)
  const isMagazinePage = ['/', '/lecture', '/resources', '/assistant', '/login', '/reset-password'].includes(pathname)
    || pathname.startsWith('/lecture/') || pathname.startsWith('/assistant/')
  if (isMagazinePage) {
    return <Outlet />
  }

  return (
    <div className="site-shell">
      <header className="site-header">
        <PageNav to="/" label="Carnet de classe">
          <Link to="/lecture" className="page-nav-back"><span lang="fr">Lecture</span> · 阅读</Link>
        </PageNav>
      </header>

      <main className="site-main">
        <Outlet />
      </main>

      <footer className="site-footer">
        {/* 404 等通用布局页面显示账号状态。 */}
        <p className="site-footer-auth">
          {user ? (
            <>
              <span className="site-auth-note">已登录 · {displayName}</span>
              <button type="button" className="site-auth-link" onClick={signOut} disabled={signingOut}>{signingOut ? '退出中…' : '退出'}</button>
            </>
          ) : !isAuthEnabled ? (
            <span className="site-auth-note">登录未启用</span>
          ) : null}
        </p>
        {signOutError ? <p className="status-line is-error" role="status">{signOutError}</p> : null}
      </footer>
    </div>
  )
}
