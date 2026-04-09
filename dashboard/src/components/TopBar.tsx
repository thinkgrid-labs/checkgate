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
  return 'Sidekick'
}

export default function TopBar() {
  const { pathname } = useLocation()

  return (
    <header className="h-14 shrink-0 flex items-center px-6 border-b border-zinc-800 bg-zinc-950">
      <h1 className="text-zinc-100 font-semibold text-base">{getTitle(pathname)}</h1>
    </header>
  )
}
