import { useEffect, useMemo } from 'react'
import { useAuth } from '../context/useAuth'
import { createLectureAnswers } from '../lib/lectureAnswers'
import { answerStorage, lectureAnswersKey } from '../lib/lectureAnswerStorage'
import { syncLectureDay } from '../lib/lectureAnswersBackend'

// 登录当下就认领本机答案，从登录页离开前也能同步。
export function useLectureAccount() {
  const { user, loading } = useAuth()
  const userId = loading ? undefined : user?.id || null
  const account = useMemo(() => {
    let storage
    try { storage = window.localStorage } catch { /* 浏览器禁用存储时仍可用账号保存。 */ }
    return createLectureAnswers({ userId, local: answerStorage(storage, navigator.locks), sync: syncLectureDay })
  }, [userId])
  useEffect(() => {
    account.start()
    const changed = (event) => {
      if (!event.key || event.key === lectureAnswersKey || event.key === 'mcw_lecture_answers_v1') account.refresh()
    }
    window.addEventListener('storage', changed)
    window.addEventListener('online', account.retryPending)
    return () => {
      window.removeEventListener('storage', changed)
      window.removeEventListener('online', account.retryPending)
      account.stop()
    }
  }, [account])
  return account
}
