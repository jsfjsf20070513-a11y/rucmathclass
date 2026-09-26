import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/useAuth'
import { updatePassword, authErrorMessage } from '../lib/authBackend'

export function usePasswordReset() {
  const { user, loading, error, isAuthEnabled, recoveryCallbackFailed } = useAuth()
  const [account, setAccount] = useState(null)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [uncertain, setUncertain] = useState(false)
  const [message, setMessage] = useState('')
  const mounted = useRef(false)
  const pending = useRef(false)
  const currentUserId = useRef(user?.id)
  currentUserId.current = user?.id
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!loading && user && !account) setAccount({ id: user.id, email: user.email })
    if (account && user?.id !== account.id) {
      setPassword('')
      setConfirmPassword('')
    }
  }, [loading, user, account])

  const pageState = !isAuthEnabled ? 'unavailable'
    : recoveryCallbackFailed ? 'invalid'
      : loading || error || (user && !account) ? 'loading'
        : !user || account?.id !== user.id ? 'invalid'
          : success ? 'success' : 'form'

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (pending.current || uncertain || pageState !== 'form') return
    if (password.length < 6) { setMessage('密码至少需要 6 位字符。'); return }
    if (password !== confirmPassword) { setMessage('两次输入的密码不一致。'); return }
    const owner = account.id
    pending.current = true
    setSubmitting(true)
    setMessage('')
    try {
      await updatePassword(owner, password)
      if (mounted.current && currentUserId.current === owner) {
        setSuccess(true)
        setPassword('')
        setConfirmPassword('')
      }
    } catch (failure) {
      if (mounted.current && currentUserId.current === owner) {
        setMessage(authErrorMessage(failure))
        setUncertain(failure.code === 'AUTH_WRITE_UNCONFIRMED')
      }
    } finally {
      pending.current = false
      if (mounted.current) setSubmitting(false)
    }
  }
  return { pageState, account, password, setPassword, confirmPassword, setConfirmPassword, submitting, uncertain, message, handleSubmit }
}
