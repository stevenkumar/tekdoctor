import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  shimmer?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  variant = 'rounded',
  width,
  height,
  shimmer = true,
  className = '',
  style,
  ...props
}) => {
  const getVariantClass = () => {
    switch (variant) {
      case 'circular':
        return 'rounded-full';
      case 'text':
        return 'rounded-md h-4 my-1';
      case 'rectangular':
        return 'rounded-none';
      case 'rounded':
      default:
        return 'rounded-xl';
    }
  };

  const inlineStyles: React.CSSProperties = {
    ...style,
    ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...(height !== undefined ? { height: typeof height === 'number' ? `${height}px` : height } : {})
  };

  return (
    <div
      className={`bg-zinc-900/80 border border-zinc-850/60 ${getVariantClass()} ${
        shimmer ? 'animate-shimmer' : 'animate-pulse'
      } ${className}`}
      style={inlineStyles}
      {...props}
    />
  );
};

export const SkeletonCard: React.FC<{
  className?: string;
  count?: number;
  children?: React.ReactNode;
}> = ({
  className = '',
  count = 1,
  children
}) => {
  const cards = Array.from({ length: count }).map((_, i) => (
    <div key={i} className={`p-5 rounded-2xl bg-[#0c0c0e] border border-zinc-900/80 shadow-lg ${className}`}>
      {children || (
        <div className="space-y-3">
          <Skeleton variant="text" width="40%" height={14} />
          <Skeleton variant="rounded" width="100%" height={24} />
          <Skeleton variant="text" width="60%" height={12} />
        </div>
      )}
    </div>
  ));

  if (count === 1) {
    return cards[0];
  }
  return <>{cards}</>;
};

export const SkeletonMetrics: React.FC<{ count?: number; className?: string }> = ({
  count = 4,
  className = ''
}) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-${count} gap-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="p-5 rounded-2xl bg-[#0a0a0c] border border-zinc-900/80 space-y-3 shadow-sm relative overflow-hidden"
      >
        <div className="flex items-center justify-between">
          <Skeleton variant="text" width="45%" height={12} />
          <Skeleton variant="circular" width={32} height={32} />
        </div>
        <Skeleton variant="text" width="60%" height={28} className="my-2" />
        <div className="flex items-center gap-2 pt-1 border-t border-zinc-900/60">
          <Skeleton variant="rounded" width={48} height={16} />
          <Skeleton variant="text" width="40%" height={10} />
        </div>
      </div>
    ))}
  </div>
);

export const SkeletonTable: React.FC<{
  rows?: number;
  columns?: number;
  hasHeaderFilter?: boolean;
  className?: string;
}> = ({ rows = 6, columns = 5, hasHeaderFilter = true, className = '' }) => (
  <div className={`space-y-4 ${className}`}>
    {hasHeaderFilter && (
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-1">
        <Skeleton variant="rounded" width="100%" height={40} className="sm:max-w-xs" />
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <Skeleton variant="rounded" width={80} height={36} />
          <Skeleton variant="rounded" width={96} height={36} />
        </div>
      </div>
    )}

    <div className="rounded-2xl border border-zinc-900 bg-[#09090b] overflow-hidden shadow-xl">
      {/* Table Head */}
      <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-zinc-900 bg-zinc-950/70">
        {Array.from({ length: columns }).map((_, i) => {
          const colSpan = Math.floor(12 / columns) || 2;
          return (
            <div key={i} className={`col-span-${colSpan} flex items-center`}>
              <Skeleton variant="text" width="60%" height={12} />
            </div>
          );
        })}
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-zinc-900/70">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div
            key={rIdx}
            className="grid grid-cols-12 gap-4 px-6 py-4.5 items-center hover:bg-zinc-900/20 transition-colors"
          >
            {Array.from({ length: columns }).map((_, cIdx) => {
              const colSpan = Math.floor(12 / columns) || 2;
              return (
                <div key={cIdx} className={`col-span-${colSpan} flex items-center gap-2.5`}>
                  {cIdx === 0 && <Skeleton variant="rounded" width={28} height={28} className="shrink-0" />}
                  <div className="w-full space-y-1.5">
                    <Skeleton
                      variant="text"
                      width={cIdx === 0 ? '75%' : cIdx === columns - 1 ? '50%' : '85%'}
                      height={13}
                    />
                    {cIdx === 0 && <Skeleton variant="text" width="45%" height={10} />}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  </div>
);

export const SkeletonDashboard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`space-y-6 ${className}`}>
    {/* Header */}
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2">
      <div className="space-y-2">
        <Skeleton variant="text" width={220} height={28} />
        <Skeleton variant="text" width={320} height={14} />
      </div>
      <div className="flex items-center gap-2">
        <Skeleton variant="rounded" width={110} height={40} />
        <Skeleton variant="rounded" width={140} height={40} />
      </div>
    </div>

    {/* Metric Cards */}
    <SkeletonMetrics count={4} />

    {/* Table / List Area */}
    <SkeletonTable rows={5} columns={5} />
  </div>
);

export const SkeletonProfile: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`space-y-6 max-w-4xl ${className}`}>
    {/* Page Title */}
    <div className="flex items-center justify-between pb-2">
      <div className="space-y-2">
        <Skeleton variant="text" width={180} height={26} />
        <Skeleton variant="text" width={280} height={13} />
      </div>
      <Skeleton variant="rounded" width={90} height={32} />
    </div>

    {/* 2-Column Profile Layout */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Left Avatar / Branding Box */}
      <div className="p-6 rounded-2xl bg-[#0c0c0e] border border-zinc-900/80 flex flex-col items-center text-center space-y-4">
        <Skeleton variant="circular" width={96} height={96} />
        <div className="w-full space-y-2">
          <Skeleton variant="text" width="70%" height={16} className="mx-auto" />
          <Skeleton variant="text" width="45%" height={12} className="mx-auto" />
        </div>
        <Skeleton variant="rounded" width="80%" height={36} />
      </div>

      {/* Right Form Fields Grid */}
      <div className="md:col-span-2 p-6 rounded-2xl bg-[#0c0c0e] border border-zinc-900/80 space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton variant="text" width="40%" height={12} />
            <Skeleton variant="rounded" width="100%" height={40} />
          </div>
          <div className="space-y-2">
            <Skeleton variant="text" width="40%" height={12} />
            <Skeleton variant="rounded" width="100%" height={40} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Skeleton variant="text" width="35%" height={12} />
            <Skeleton variant="rounded" width="100%" height={40} />
          </div>
          <div className="space-y-2">
            <Skeleton variant="text" width="35%" height={12} />
            <Skeleton variant="rounded" width="100%" height={40} />
          </div>
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" width="25%" height={12} />
          <Skeleton variant="rounded" width="100%" height={70} />
        </div>
        <div className="flex justify-end pt-2">
          <Skeleton variant="rounded" width={130} height={42} />
        </div>
      </div>
    </div>
  </div>
);

export const SkeletonTicketWorkspace: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`space-y-6 ${className}`}>
    {/* Ticket Header */}
    <div className="p-6 rounded-2xl bg-[#0c0c0e] border border-zinc-900/80 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="rounded" width={130} height={28} />
          <Skeleton variant="rounded" width={80} height={24} />
        </div>
        <Skeleton variant="rounded" width={110} height={36} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2 border-t border-zinc-900/60">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton variant="text" width="50%" height={11} />
            <Skeleton variant="text" width="80%" height={14} />
          </div>
        ))}
      </div>
    </div>

    {/* Stepper Progress */}
    <div className="p-6 rounded-2xl bg-[#0c0c0e] border border-zinc-900/80">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center space-y-2">
            <Skeleton variant="circular" width={36} height={36} />
            <Skeleton variant="text" width="60%" height={10} />
          </div>
        ))}
      </div>
    </div>

    {/* Content Grid */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-48" />
      </div>
      <div className="space-y-6">
        <SkeletonCard className="h-44" />
        <SkeletonCard className="h-64" />
      </div>
    </div>
  </div>
);

export const SkeletonList: React.FC<{ count?: number; className?: string }> = ({
  count = 4,
  className = ''
}) => (
  <div className={`space-y-3 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="p-4 rounded-xl bg-[#0c0c0e] border border-zinc-900/80 flex items-center gap-4"
      >
        <Skeleton variant="circular" width={40} height={40} className="shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <Skeleton variant="text" width="40%" height={14} />
            <Skeleton variant="text" width="15%" height={11} />
          </div>
          <Skeleton variant="text" width="75%" height={12} />
        </div>
      </div>
    ))}
  </div>
);
