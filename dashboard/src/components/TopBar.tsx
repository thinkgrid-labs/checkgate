import { useLocation } from 'react-router-dom'

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/flags': 'Feature Flags',
  '/flags/new': 'New Flag',
  '/segments': 'Segments',
  '/schedule': 'Scheduled Changes',
  '/impressions': 'Impressions',
  '/audit': 'Audit Log',
  '/sdk-health': 'SDK Health',
  '/webhooks': 'Webhooks',
  '/environments': 'Environments',
  '/projects': 'Projects',
  '/users': 'Users',
  '/settings': 'Settings',
}

function getTitle(pathname: string): string {
  if (TITLES[pathname]) return TITLES[pathname]
  if (pathname.startsWith('/flags/') && pathname.endsWith('/edit')) return 'Edit Flag'
  if (pathname.startsWith('/projects/')) return 'Project Settings'
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
