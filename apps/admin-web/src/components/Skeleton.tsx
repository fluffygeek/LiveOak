/** Animated placeholder table rows shown while list data is loading. */
export function SkeletonTable({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <div className="table-wrap skeleton-table" aria-hidden="true">
      {Array.from({ length: rows }).map((_, r) => (
        <div className="skeleton-row" key={r}>
          {Array.from({ length: columns }).map((__, c) => (
            <span
              className="skeleton skeleton-text"
              key={c}
              style={{ width: c === 0 ? '18%' : undefined, opacity: 1 - r * 0.06 }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="stat-grid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="stat-card" key={i}>
          <span className="skeleton skeleton-text" style={{ width: '50%' }} />
          <span className="skeleton skeleton-text" style={{ width: '35%', height: 22 }} />
        </div>
      ))}
    </div>
  );
}
