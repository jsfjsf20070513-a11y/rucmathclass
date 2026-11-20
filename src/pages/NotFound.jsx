import { Link } from 'react-router-dom'

// 404 — design contract: centered mono「404」→「页面未找到」→ Page not found →
// 数学比喻(法语斜体 + 中文)→ 细线 → 三个出口 → 回到扉页。
export default function NotFound() {
  return (
    <article className="page-column notfound-page">
      <p className="notfound-code">404</p>
      <h1 className="notfound-title">页面未找到</h1>
      <p className="notfound-sub">Page not found</p>

      <p className="notfound-quote" lang="fr">Comme chercher sur la droite réelle un point qui n&apos;existe pas.</p>
      <p className="notfound-quote-zh">这就像在实数轴上寻找一个并不存在的点。</p>

      <div className="notfound-rule" aria-hidden="true" />
      <p className="notfound-lead">你要找的页面没有对应记录,或链接已失效。也许你在找:</p>
      <nav className="notfound-exits" aria-label="出口">
        <Link to="/resources">资源 · 书目</Link>
        <Link to="/lecture">阅读</Link>
      </nav>
      <p className="notfound-home"><Link to="/">← 回到扉页 · Accueil</Link></p>
    </article>
  )
}
