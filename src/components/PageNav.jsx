export default function PageNav({ title, onBack, children }) {
  return (
    <nav className="page-nav" aria-label="页内导航">
      <button type="button" className="page-nav-back" onClick={onBack} lang="fr">← Accueil</button>
      <span className="page-nav-title" lang="fr">{title}</span>
      {children}
    </nav>
  )
}
