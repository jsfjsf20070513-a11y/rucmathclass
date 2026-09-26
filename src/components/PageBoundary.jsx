import { Component, Suspense, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import '../styles/page-status.css'

function LoadingPage() {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 600)
    return () => window.clearTimeout(timer)
  }, [])
  if (!visible) return null
  return <main className="page-status" role="status" aria-live="polite"><p lang="fr">Chargement…</p><p>正在打开页面…</p></main>
}

class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page-status" role="alert">
        <p lang="fr">Un instant</p>
        <h1>页面暂时无法打开</h1>
        <p>请检查网络后重新加载。</p>
        <div className="page-status-actions">
          <button type="button" onClick={() => window.location.reload()}>重新加载</button>
          <a href="/">回到扉页</a>
        </div>
      </main>
    )
  }
}

export default function PageBoundary({ children }) {
  const { pathname } = useLocation()
  return <Boundary key={pathname}><Suspense fallback={<LoadingPage />}>{children}</Suspense></Boundary>
}
