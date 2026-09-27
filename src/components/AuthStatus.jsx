import { useAuth } from '../context/useAuth'

export default function AuthStatus({ className = 'status-line' }) {
  const { loading, error, refreshSession } = useAuth()
  if (!loading && !error) return null
  return (
    <p className={className} role="status">
      {loading ? '正在确认登录状态…' : error}
      {!loading ? <>{' '}<button type="button" className="text-action" onClick={refreshSession}>重试</button></> : null}
    </p>
  )
}
