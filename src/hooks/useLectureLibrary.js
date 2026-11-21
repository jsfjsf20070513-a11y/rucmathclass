import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { lectureProblems } from '../lib/lectureContent'
import { withRequestDeadline } from '../lib/requestDeadline'

async function getJSON(path, signal) {
  return withRequestDeadline(async (bounded) => {
    const response = await fetch(path, { signal: bounded })
    if (!response.ok) throw Object.assign(new Error('阅读请求失败'), { status: response.status })
    return response.json()
  }, { signal })
}

export function useLectureLibrary(date) {
  const [index, setIndex] = useState(null)
  const [missing, setMissing] = useState([])
  const hasIndex = useRef(false)
  const [articles, setArticles] = useState({})
  const cache = useRef(new Map())
  const inArchive = !date

  // 同一篇只取一次。取到就放进 articles，点开时正文已在手里，不必等页面挂上后再取。
  const load = useCallback((key) => {
    let work = cache.current.get(key)
    if (!work) {
      work = getJSON(`/api/lecture/${key}`).then((day) => {
        if (day?.date !== key || lectureProblems(day).length) throw new Error('文章格式错误')
        return day
      })
      cache.current.set(key, work)
      work.then(
        (day) => setArticles((prev) => prev[key] ? prev : { ...prev, [key]: day }),
        () => { if (cache.current.get(key) === work) cache.current.delete(key) },
      )
    }
    return work
  }, [])

  // 进入档案时刷新索引，直接打开单日也先读一次索引。
  useEffect(() => {
    if (hasIndex.current && !inArchive) return
    const request = new AbortController()
    getJSON('/api/lecture', request.signal).then((index) => {
      if (!Array.isArray(index)) throw new Error('档案格式错误')
      const entries = index.filter((row) => /^\d{4}-\d{2}-\d{2}$/.test(row?.date) &&
        Number.isFinite(Date.parse(row.date)) && typeof row.title === 'string' && typeof row.level === 'string')
      if (request.signal.aborted) return
      hasIndex.current = true
      setIndex(entries.sort((a, b) => a.date.localeCompare(b.date)))
    }).catch(() => { if (!request.signal.aborted) setIndex((prev) => prev || []) })
    return () => request.abort()
  }, [inArchive])

  useEffect(() => {
    const position = index?.findIndex((entry) => entry.date === date) ?? -1
    if (position < 0) return
    let active = true
    const neighbors = index.slice(Math.max(0, position - 1), position + 2)
    for (const { date: key } of neighbors) {
      load(key).then(() => {
        if (active) setMissing((prev) => prev.includes(key) ? prev.filter((date) => date !== key) : prev)
      }).catch((error) => {
        // 只有确实没有这篇（404 或内容不合格）才从列表里拿掉；超时、断网、5xx 留着，下次换天或回档案再取。
        const gone = error?.status === 404 || error?.message === '文章格式错误'
        if (active && gone) setMissing((prev) => prev.includes(key) ? prev : [...prev, key])
      })
    }
    return () => { active = false }
  }, [date, index, load])

  // 预取失败不算缺篇：点开后照常再取一次。
  const prefetch = useCallback((key) => { load(key).catch(() => {}) }, [load])

  const days = useMemo(() => index?.filter((row) => !missing.includes(row.date)) ?? null, [index, missing])
  return { days, articles, prefetch }
}
