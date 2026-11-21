import { Link } from 'react-router-dom'

export default function PageNav({ to, onBack, label = '← Accueil', title, children }) {
  return (
    <nav className="page-nav" aria-label="页内导航">
      {to ? (
        <Link to={to} className="page-nav-back" onClick={onBack} lang="fr">{label}</Link>
      ) : (
        <button type="button" className="page-nav-back" onClick={onBack} lang="fr">{label}</button>
      )}
      {title && <span className="page-nav-title" lang="fr">{title}</span>}
      {children}
    </nav>
  )
}
