import { useDailyContent } from '../hooks/useDailyContent'

export default function DailyMeditation({ className = '' }) {
  const { parole: entry } = useDailyContent()

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
