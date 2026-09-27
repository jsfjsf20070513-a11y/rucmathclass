import { useEffect, useMemo, useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import DailyMeditation from '../components/DailyMeditation'
import PageNav from '../components/PageNav'
import PageControls from '../components/PageControls'
import { externalLinkProps } from '../lib/safeUrl'
import { resourceCategories } from '../data/resourceCatalog'
import { useResourceCatalog } from '../hooks/useResourceCatalog'
import { getResourceLead } from '../lib/resourceText'
import { usePageFlip } from '../hooks/usePageFlip'
import { markFlipNav, wasFlipNav } from '../lib/flipNav'

// 书目 Resources — 按书架横向翻页:
// 索引住在 Home 第 4 页(同一份索引不出现两次),本页直接一架一页(Ⅰ–Ⅷ)轻翻,
// 翻入时条目逐条错开淡入;架内容超一屏走页内滚动优先;#shelf-N 直达对应架。
// 条目 = 标题外链 + 酒红小标签 + 中文简介一行;数据源 resourceCatalog 不动。
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']
const toRoman = (n) => ROMAN[n] || `${n + 1}`

function buildShelfOrder(catalogItems) {
  const preferred = resourceCategories.map((category) => category.label)
  const extras = Array.from(
    new Set(
      catalogItems
        .map((item) => item.category)
        .filter((category) => category && !preferred.includes(category)),
    ),
  ).sort((a, b) => a.localeCompare(b, 'zh-CN'))

  return [...preferred, ...extras]
}

export default function Resources() {
  const navigate = useNavigate()
  const { catalogItems, loading, error, refresh } = useResourceCatalog()
  const [arrive] = useState(() => wasFlipNav())

  const shelves = useMemo(() => {
    const introByCategory = new Map(
      resourceCategories.map((category) => [category.label, category.intro]),
    )

    return buildShelfOrder(catalogItems)
      .map((category) => ({
        title: category,
        intro: introByCategory.get(category) || '',
        items: catalogItems.filter((item) => item.category === category),
      }))
      .filter((shelf) => shelf.items.length)
  }, [catalogItems])

  // 页面栈 = 书架 Ⅰ..Ⅷ,轻翻(0.5s);首架平摊,其余停靠右侧。
  const pageCount = shelves.length
  const sides = useMemo(() => shelves.map((_, k) => (k === 0 ? 'none' : 'right')), [shelves])
  const { page, next, prev, goTo, jumpTo, setPageEl } = usePageFlip({
    count: pageCount,
    sides,
    durationMs: 500,
  })

  // A removed publication can remove an extra shelf while it is being read.
  useEffect(() => {
    if (page >= pageCount) jumpTo(pageCount - 1)
  }, [page, pageCount, jumpTo])

  // /resources#shelf-N 直达(Home 第 4 页索引行点击进来;N 从 1 计)。
  useEffect(() => {
    const m = window.location.hash.match(/^#shelf-(\d+)$/)
    if (!m) return
    const idx = Number(m[1]) - 1
    if (idx >= 1 && idx < shelves.length) {
      const t = window.setTimeout(() => goTo(idx), 60)
      return () => window.clearTimeout(t)
    }
    return undefined
  }, [shelves.length, goTo])

  const goHome = useCallback(() => {
    markFlipNav('/resources')
    navigate('/')
  }, [navigate])

  const folio = `${toRoman(page)} — ${toRoman(shelves.length - 1)}`

  return (
    <main className={`bib${arrive ? ' page-arrive' : ''}`}>
      <PageNav title="Bibliothèque" onBack={goHome}>
        <span className="page-nav-side" lang="fr">{catalogItems.length}&nbsp;entrées</span>
      </PageNav>

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
                  <span className="bib-shelf-roman">{toRoman(index)}</span>
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
                  {shelf.items.map((item) => {
                    const lead = getResourceLead(item)
                    return (
                      <li key={item.id} className="bib-entry" data-animate="">
                        <div className="bib-entry-row">
                          <a {...externalLinkProps(item.url)} className="bib-entry-title">{item.title}&nbsp;↗</a>
                          {item.tag ? <span className="bib-entry-tag">{item.tag}</span> : null}
                        </div>
                        {lead ? <p className="bib-entry-desc">{lead}</p> : null}
                      </li>
                    )
                  })}
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
