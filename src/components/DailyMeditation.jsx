import { useState } from 'react'
import { paroles } from '../data/siteContent'

// 每次挂载时，从 siteContent 的引语中随机取一句。
export default function DailyMeditation({ className = '' }) {
  const [index] = useState(() => Math.floor(Math.random() * paroles.length))
  const entry = paroles[index]

  return (
    <aside className={['section-coda', className].filter(Boolean).join(' ')} aria-label="Parole du jour · 每日一句">
      <p className="section-coda-kicker"><span lang="fr">Parole du jour</span> · 每日一句</p>
      <p className="section-coda-quote" lang="fr">
        {entry.text}
      </p>
      <p className="section-coda-translation">{entry.note}</p>
      <p className="section-coda-author">
        — {entry.author}
        {entry.src ? <span className="section-coda-src"> · {entry.src}</span> : null}
      </p>
    </aside>
  )
}
