import { useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import DailyMeditation from '../components/DailyMeditation'
import PageNav from '../components/PageNav'
import PageControls from '../components/PageControls'
import { externalLinkProps } from '../lib/safeUrl'
import { resourceCategories } from '../data/resourceCatalog'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { usePageFlip } from '../hooks/usePageFlip'
import { flipNavigation } from '../lib/flipNav'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI']

export default function Resources() {
  const navigate = useNavigate()
  const { catalogItems, loading, error, refresh } = useResourceCatalog()

  const shelves = useMemo(() => resourceCategories.map(({ label, intro }) => ({
    title: label, intro, items: catalogItems.filter(item => item.category === label),
  })), [catalogItems])
  const pageCount = shelves.length
  const sides = useMemo(() => shelves.map((_, k) => (k === 0 ? 'none' : 'right')), [shelves])
  const requestedShelf = Number(window.location.hash.match(/^#shelf-(\d+)$/)?.[1]) - 1
  const initialPage = requestedShelf >= 0 && requestedShelf < pageCount ? requestedShelf : 0
  const { page, next, prev, setPageEl } = usePageFlip({
    count: pageCount,
    initialPage,
    sides,
    durationMs: 500,
  })

  const goHome = useCallback(() => {
    flipNavigation.mark('/resources', '/')
    navigate('/')
  }, [navigate])

  const folio = `${ROMAN[page]} — ${ROMAN[shelves.length - 1]}`

  return (
    <main className="bib" data-page-ready="true">
      <PageNav title="Bibliothèque" onBack={goHome} />

      <div className="bib-stack">
        {/* ── 一架一页 ── */}
        {shelves.map((shelf, index) => (
          <section
            key={shelf.title}
            ref={setPageEl(index)}
            className="bib-page bib-shelf"
            style={{ zIndex: 10 + index, transform: index === 0 ? 'none' : 'translateX(105%) rotate(2.2deg)' }}
            aria-label={shelf.title}
          >
            <div className="bib-scroll" data-flip-scroll="">
              <div className="bib-shelf-inner">
                <div className="bib-shelf-head" data-animate="">
                  <span className="bib-shelf-roman">{ROMAN[index]}</span>
                  <h2 className="bib-shelf-title">{shelf.title}</h2>
                  <span className="bib-shelf-count">{shelf.items.length}</span>
                </div>
                {shelf.intro ? <p className="bib-shelf-intro" data-animate="">{shelf.intro}</p> : null}
                {error && index === page ? (
                  <p className="bib-shelf-intro" role="status">
                    {error}{' '}
                    <button type="button" className="text-action bib-retry" onClick={refresh} disabled={loading}>
                      {loading ? '更新中…' : '重试'}
                    </button>
                  </p>
                ) : null}
                <ol className="bib-entries">
                  {shelf.items.map(item => (
                    <li key={item.id} className="bib-entry" data-animate="">
                      <div className="bib-entry-row">
                        <a {...externalLinkProps(item.url)} className="bib-entry-title">{item.title}</a>
                      </div>
                      <p className="bib-entry-desc">{item.description}{item.textbookUrl && <> <a {...externalLinkProps(item.textbookUrl)}>免费教材</a></>}</p>
                    </li>
                  ))}
                </ol>
                {index === shelves.length - 1 ? (
                  <div className="bib-coda" data-animate="">
                    <DailyMeditation />
                  </div>
                ) : null}
              </div>
            </div>
          </section>
        ))}
      </div>

      <PageControls
        folio={folio} folioClassName="bib-folio" onPrevious={prev} onNext={next}
        previousDisabled={page === 0} nextDisabled={page === pageCount - 1}
      />
    </main>
  )
}
