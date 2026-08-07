'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../lib/auth-context';
import { humanize } from '../lib/format';
import { IconClipboardList, IconCopy, IconLogOut, IconSettings } from './icons';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function initials(email: string): string {
  const name = email.split('@')[0] ?? email;
  const parts = name.split(/[._-]/).filter(Boolean);
  const chars =
    parts.length > 1 ? `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}` : name.slice(0, 2);
  return (chars || name.slice(0, 2)).toUpperCase();
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
    navItems.push(
      { href: '/records', label: 'Records', icon: <IconClipboardList /> },
      { href: '/duplicates', label: 'Duplicates', icon: <IconCopy /> },
    );
  }
  if (user && user.role === 'app_admin') {
    navItems.push({ href: '/admin', label: 'Admin', icon: <IconSettings /> });
  }

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="app-brand">
            <span className="app-brand-mark">LO</span>
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
                  {item.icon}
                  {item.label}
                </Link>
              ))}
            </nav>
          )}
          {user && (
            <div className="app-user">
              <div className="app-user-info">
                <span className="avatar">{initials(user.email)}</span>
                <div className="app-user-text">
                  <span className="app-user-email">{user.email}</span>
                  <span className="role-badge">{humanize(user.role)}</span>
                </div>
              </div>
              <button
                className="icon-btn"
                onClick={() => void signOut()}
                title="Sign out"
                aria-label="Sign out"
              >
                <IconLogOut />
              </button>
            </div>
          )}
        </div>
      </header>
      <div className="page">{children}</div>
    </>
  );
}
