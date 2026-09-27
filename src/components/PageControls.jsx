export default function PageControls({ folio, folioClassName = '', onPrevious, onNext, previousDisabled, nextDisabled }) {
  return (
    <>
      <div className={`page-folio ${folioClassName}`.trim()} aria-hidden="true">{folio}</div>
      <div className="page-controls">
        <button type="button" onClick={onPrevious} aria-label="上一页" className="page-arrow" disabled={previousDisabled}>‹</button>
        <button type="button" onClick={onNext} aria-label="下一页" className="page-arrow is-next" disabled={nextDisabled}>›</button>
      </div>
    </>
  )
}
