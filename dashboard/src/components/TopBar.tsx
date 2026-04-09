import { useLocation } from 'react-router-dom'

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/flags': 'Feature Flags',
  '/flags/new': 'New Flag',
  '/users': 'Users',
  '/settings': 'Settings',
}

function getTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname]
  if (pathname.startsWith('/flags/') && pathname.endsWith('/edit')) return 'Edit Flag'
  return 'Checkgate'
}

export default function TopBar() {
  const { pathname } = useLocation()

  return (
    <header className="h-16 shrink-0 flex items-center px-8 border-b border-gray-100 bg-white/80 backdrop-blur-md sticky top-0 z-30">
      <h1 className="text-gray-900 font-display font-bold text-lg tracking-tight">{getTitle(pathname)}</h1>
    </header>
  )
}
