'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';

interface NavItem {
  href: string;
  label: string;
}

/**
 * Persistent header/nav shown on every page once signed in, so a user
 * anywhere in the app (e.g. /admin/work-codes) can always reach the other
 * top-level sections without walking back through "← Home".
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const pathname = usePathname();

  const navItems: NavItem[] = [];
  if (user && (user.role === 'payroll_admin' || user.role === 'app_admin')) {
    navItems.push({ href: '/records', label: 'Records' }, { href: '/duplicates', label: 'Duplicates' });
  }
  if (user && user.role === 'app_admin') {
    navItems.push({ href: '/admin', label: 'Admin' });
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="app-brand">
            LiveOak
          </Link>
          {user && (
            <nav className="app-nav">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  data-active={pathname === item.href || pathname?.startsWith(`${item.href}/`)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          {user && (
            <div className="app-user">
              <span>{user.email}</span>
              <span className="role-badge">{user.role.replace('_', ' ')}</span>
              <button className="btn-secondary" onClick={() => void signOut()}>
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="page">{children}</div>
    </>
  );
}
