import { Component, Suspense } from 'react'
import { useLocation } from 'react-router-dom'
import { normalizeRoutePath } from '../lib/routePath'
import '../styles/page-status.css'

class Boundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="page-status" role="alert">
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
  // 阅读和答疑各自的两层页面共用账号状态和已读内容。
  const path = normalizeRoutePath(pathname)
  const key = path.startsWith('/assistant/') ? '/assistant' : path.startsWith('/lecture/') ? '/lecture' : path
  return <Boundary key={key}><Suspense fallback={null}>{children}</Suspense></Boundary>
}
