import type { ReactNode } from 'react';

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

/** Consistent "nothing here" treatment: icon + headline + optional helper copy/action. */
export function EmptyState({ icon, title, subtitle, action }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-state-icon">{icon}</span>
      <span className="empty-state-title">{title}</span>
      {subtitle && <span className="empty-state-sub">{subtitle}</span>}
      {action}
    </div>
  );
}
