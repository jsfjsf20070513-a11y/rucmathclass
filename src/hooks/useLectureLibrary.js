import { useEffect, useMemo, useRef, useState } from 'react'
import { lectureProblems } from '../lib/lectureContent'
import { withRequestDeadline } from '../lib/requestDeadline'

async function getJSON(path, signal) {
  return withRequestDeadline(async (bounded) => {
    const response = await fetch(path, { signal: bounded })
    if (!response.ok) throw new Error('阅读请求失败')
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
      let work = cache.current.get(key)
      if (!work) {
        work = getJSON(`/api/lecture/${key}`).then((day) => {
          if (day?.date !== key || lectureProblems(day).length) throw new Error('文章格式错误')
          return day
        })
        cache.current.set(key, work)
      }
      work.then((day) => {
        if (active) {
          setArticles((prev) => prev[key] ? prev : { ...prev, [key]: day })
          setMissing((prev) => prev.includes(key) ? prev.filter((date) => date !== key) : prev)
        }
      }).catch(() => {
        if (cache.current.get(key) === work) cache.current.delete(key)
        if (active) setMissing((prev) => prev.includes(key) ? prev : [...prev, key])
      })
    }
    return () => { active = false }
  }, [date, index])

  const days = useMemo(() => index?.filter((row) => !missing.includes(row.date)) ?? null, [index, missing])
  return { days, articles }
}
