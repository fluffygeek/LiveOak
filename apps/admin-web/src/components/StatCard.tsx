import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  icon: ReactNode;
  tone?: 'primary' | 'warning' | 'info' | 'success' | 'neutral';
  onClick?: () => void;
}

/** Dashboard summary tile: label, big number, optional helper text and icon. */
export function StatCard({ label, value, sub, icon, tone = 'neutral', onClick }: StatCardProps) {
  const content = (
    <>
      <div className="stat-card-top">
        <span>{label}</span>
        <span className={`stat-card-icon tone-${tone}`}>{icon}</span>
      </div>
      <div className="stat-card-value">{value}</div>
      {sub && <div className="stat-card-sub">{sub}</div>}
    </>
  );

  if (onClick) {
    return (
      <button type="button" className="stat-card is-clickable" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <div className="stat-card">{content}</div>;
}
