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
      className={`bg-zinc-900/80 border border-zinc-800/60 ${getVariantClass()} ${
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
}) => {
  const gridClass =
    count === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : count === 3
        ? 'grid-cols-1 sm:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4';

  return (
    <div className={`grid ${gridClass} gap-4 ${className}`}>
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
};

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
      <div
        className="gap-4 px-6 py-4 border-b border-zinc-900 bg-zinc-950/70 grid"
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} className="flex items-center">
            <Skeleton variant="text" width="65%" height={12} />
          </div>
        ))}
      </div>

      {/* Table Rows */}
      <div className="divide-y divide-zinc-900/70">
        {Array.from({ length: rows }).map((_, rIdx) => (
          <div
            key={rIdx}
            className="gap-4 px-6 py-4.5 items-center hover:bg-zinc-900/20 transition-colors grid"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, cIdx) => (
              <div key={cIdx} className="flex items-center gap-2.5 min-w-0">
                {cIdx === 0 && <Skeleton variant="rounded" width={28} height={28} className="shrink-0" />}
                <div className="w-full space-y-1.5 min-w-0">
                  <Skeleton
                    variant="text"
                    width={cIdx === 0 ? '80%' : cIdx === columns - 1 ? '55%' : '75%'}
                    height={13}
                  />
                  {cIdx === 0 && <Skeleton variant="text" width="45%" height={10} />}
                </div>
              </div>
            ))}
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
  <div className={`space-y-6 max-w-5xl mx-auto ${className}`}>
    {/* Page Title & Customer ID Banner */}
    <div className="p-6 rounded-2xl bg-[#0c0c0e] border border-zinc-900/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton variant="rounded" width={120} height={18} />
          <Skeleton variant="circular" width={8} height={8} />
          <Skeleton variant="rounded" width={90} height={18} />
        </div>
        <Skeleton variant="text" width={260} height={30} />
        <Skeleton variant="text" width={380} height={14} />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="space-y-1.5">
          <Skeleton variant="text" width={100} height={14} />
          <Skeleton variant="text" width={70} height={10} />
        </div>
      </div>
    </div>

    {/* Horizontal Tabs Bar */}
    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none border-b border-zinc-900/80">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" width={i === 0 ? 120 : 100} height={42} className="shrink-0" />
      ))}
    </div>

    {/* Tab Content Skeleton */}
    <SkeletonTable rows={4} columns={6} hasHeaderFilter={false} />
  </div>
);

export const SkeletonCustomerHeader: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`space-y-6 ${className}`}>
    <div className="p-4 sm:p-6 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Skeleton variant="rounded" width={140} height={16} />
          <Skeleton variant="circular" width={8} height={8} />
          <Skeleton variant="rounded" width={80} height={16} />
        </div>
        <Skeleton variant="text" width={240} height={28} />
        <Skeleton variant="text" width={340} height={14} />
      </div>
      <div className="flex items-center gap-3">
        <Skeleton variant="rounded" width={40} height={40} />
        <div className="space-y-1.5">
          <Skeleton variant="text" width={110} height={14} />
          <Skeleton variant="text" width={80} height={11} />
        </div>
      </div>
    </div>

    {/* Tabs Row */}
    <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-zinc-800/80">
      {Array.from({ length: 7 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" width={110} height={40} className="shrink-0" />
      ))}
    </div>
  </div>
);

export const SkeletonTicketWorkspace: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`space-y-6 ${className}`}>
    {/* Ticket Header Banner */}
    <div className="p-5 sm:p-6 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <Skeleton variant="rounded" width={140} height={28} />
          <Skeleton variant="rounded" width={90} height={24} />
        </div>
        <Skeleton variant="rounded" width={120} height={36} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-zinc-800/60">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton variant="text" width="50%" height={11} />
            <Skeleton variant="text" width="85%" height={15} />
          </div>
        ))}
      </div>
    </div>

    {/* Stepper Progress */}
    <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800/80">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center space-y-2">
            <Skeleton variant="circular" width={38} height={38} />
            <Skeleton variant="text" width="65%" height={11} />
          </div>
        ))}
      </div>
    </div>

    {/* Details Grid */}
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-6">
        <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-4">
          <Skeleton variant="text" width="35%" height={20} />
          <Skeleton variant="rounded" width="100%" height={90} />
          <div className="grid grid-cols-2 gap-4 pt-2">
            <Skeleton variant="rounded" width="100%" height={40} />
            <Skeleton variant="rounded" width="100%" height={40} />
          </div>
        </div>
        <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-3">
          <Skeleton variant="text" width="30%" height={18} />
          <Skeleton variant="rounded" width="100%" height={50} />
        </div>
      </div>
      <div className="space-y-6">
        <div className="p-6 rounded-2xl bg-zinc-950 border border-zinc-800/80 space-y-4">
          <Skeleton variant="text" width="50%" height={18} />
          <Skeleton variant="rounded" width="100%" height={120} />
          <Skeleton variant="rounded" width="100%" height={44} />
        </div>
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
        <div className="flex-1 space-y-2 min-w-0">
          <div className="flex items-center justify-between gap-4">
            <Skeleton variant="text" width="40%" height={14} />
            <Skeleton variant="text" width="15%" height={11} />
          </div>
          <Skeleton variant="text" width="75%" height={12} />
        </div>
      </div>
    ))}
  </div>
);

/**
 * SkeletonPublicPage — Stunning shimmering full-page skeleton for public website
 * (Services, Shop, Repair Booking, About, Contact, Protocol, FAQ)
 * Kept completely seamless within PublicLayout so Navbar and Footer stay in place.
 */
export const SkeletonPublicPage: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`max-w-7xl mx-auto px-4 sm:px-6 py-10 md:py-16 space-y-12 animate-fadeIn ${className}`}>
    {/* Page Header / Hero Skeleton */}
    <div className="space-y-4 max-w-3xl">
      <div className="inline-flex items-center gap-2.5 px-3 py-1 bg-zinc-900/80 border border-zinc-800 rounded-full">
        <Skeleton variant="circular" width={8} height={8} />
        <Skeleton variant="text" width={110} height={12} className="my-0" />
      </div>
      <Skeleton variant="text" width="85%" height={46} className="sm:h-14" />
      <Skeleton variant="text" width="60%" height={20} />
    </div>

    {/* Primary 3-Column Grid */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="p-6 rounded-3xl bg-zinc-900/40 border border-white/5 space-y-5 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between">
            <Skeleton variant="rounded" width={44} height={44} />
            <Skeleton variant="text" width={60} height={10} />
          </div>
          <div className="space-y-2">
            <Skeleton variant="text" width="70%" height={22} />
            <Skeleton variant="text" width="100%" height={14} />
            <Skeleton variant="text" width="85%" height={14} />
          </div>
          <div className="pt-4 border-t border-white/5 flex items-center justify-between">
            <Skeleton variant="rounded" width={90} height={32} />
            <Skeleton variant="circular" width={28} height={28} />
          </div>
        </div>
      ))}
    </div>

    {/* Secondary Banner CTA Area */}
    <div className="p-8 sm:p-12 rounded-[2.5rem] bg-zinc-900/30 border border-white/5 flex flex-col md:flex-row items-center justify-between gap-6">
      <div className="space-y-3 w-full md:w-2/3">
        <Skeleton variant="text" width="60%" height={32} />
        <Skeleton variant="text" width="90%" height={16} />
      </div>
      <div className="flex items-center gap-3 w-full md:w-auto">
        <Skeleton variant="rounded" width={140} height={48} className="rounded-full" />
        <Skeleton variant="rounded" width={140} height={48} className="rounded-full" />
      </div>
    </div>
  </div>
);

/**
 * SkeletonShopGrid — Tailored specifically for public hardware and shop equipment
 */
export const SkeletonShopGrid: React.FC<{ count?: number; className?: string }> = ({
  count = 6,
  className = ''
}) => (
  <div className={`space-y-8 ${className}`}>
    {/* Search & Category Filter Pills */}
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      <Skeleton variant="rounded" width="100%" height={46} className="sm:max-w-md rounded-2xl" />
      <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
        <Skeleton variant="rounded" width={80} height={38} className="rounded-full shrink-0" />
        <Skeleton variant="rounded" width={100} height={38} className="rounded-full shrink-0" />
        <Skeleton variant="rounded" width={90} height={38} className="rounded-full shrink-0" />
      </div>
    </div>

    {/* Product Cards Grid */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 space-y-4 flex flex-col justify-between"
        >
          <Skeleton variant="rounded" width="100%" height={180} className="rounded-xl" />
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Skeleton variant="rounded" width={70} height={18} />
              <Skeleton variant="text" width={50} height={12} />
            </div>
            <Skeleton variant="text" width="80%" height={20} />
            <Skeleton variant="text" width="100%" height={13} />
            <Skeleton variant="text" width="60%" height={13} />
          </div>
          <div className="pt-3 border-t border-zinc-800/60 flex items-center justify-between">
            <Skeleton variant="text" width={90} height={22} />
            <Skeleton variant="rounded" width={110} height={38} />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/**
 * SkeletonBookingForm — Tailored for the public repair request / booking wizard
 */
export const SkeletonBookingForm: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`max-w-4xl mx-auto space-y-8 ${className}`}>
    {/* Stepper Wizard Skeleton */}
    <div className="p-5 rounded-2xl bg-zinc-900/40 border border-zinc-800/80">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton variant="circular" width={32} height={32} className="shrink-0" />
            <div className="space-y-1 w-full min-w-0">
              <Skeleton variant="text" width="60%" height={12} />
              <Skeleton variant="text" width="90%" height={14} />
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Form Fields Box */}
    <div className="p-6 sm:p-8 rounded-3xl bg-zinc-900/40 border border-zinc-800/80 space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Skeleton variant="text" width="40%" height={14} />
          <Skeleton variant="rounded" width="100%" height={48} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" width="40%" height={14} />
          <Skeleton variant="rounded" width="100%" height={48} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Skeleton variant="text" width="35%" height={14} />
          <Skeleton variant="rounded" width="100%" height={48} />
        </div>
        <div className="space-y-2">
          <Skeleton variant="text" width="35%" height={14} />
          <Skeleton variant="rounded" width="100%" height={48} />
        </div>
      </div>
      <div className="space-y-2">
        <Skeleton variant="text" width="25%" height={14} />
        <Skeleton variant="rounded" width="100%" height={100} />
      </div>
      <div className="flex justify-end pt-4">
        <Skeleton variant="rounded" width={180} height={50} className="rounded-xl" />
      </div>
    </div>
  </div>
);

/**
 * SkeletonPaymentCheckout — Tailored for /billing/pay payment settlement screen
 */
export const SkeletonPaymentCheckout: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`min-h-screen bg-black text-white py-12 px-4 sm:px-6 max-w-5xl mx-auto space-y-8 ${className}`}>
    {/* Header */}
    <div className="space-y-2 text-center max-w-md mx-auto">
      <Skeleton variant="text" width="60%" height={32} className="mx-auto" />
      <Skeleton variant="text" width="80%" height={16} className="mx-auto" />
    </div>

    {/* 2-Column Checkout Layout */}
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      {/* Left: Invoice Breakdown */}
      <div className="lg:col-span-7 p-6 sm:p-8 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800">
          <Skeleton variant="rounded" width={120} height={26} />
          <Skeleton variant="rounded" width={80} height={24} />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between py-2 border-b border-zinc-900/60">
              <div className="space-y-1 w-2/3">
                <Skeleton variant="text" width="80%" height={14} />
                <Skeleton variant="text" width="40%" height={10} />
              </div>
              <Skeleton variant="text" width="25%" height={16} />
            </div>
          ))}
        </div>
        <div className="pt-4 border-t border-zinc-800 space-y-2">
          <div className="flex justify-between">
            <Skeleton variant="text" width={80} height={14} />
            <Skeleton variant="text" width={90} height={14} />
          </div>
          <div className="flex justify-between">
            <Skeleton variant="text" width={100} height={14} />
            <Skeleton variant="text" width={80} height={14} />
          </div>
          <div className="flex justify-between pt-2 border-t border-zinc-800/80">
            <Skeleton variant="text" width={110} height={20} />
            <Skeleton variant="text" width={130} height={24} />
          </div>
        </div>
      </div>

      {/* Right: Payment Method Selector */}
      <div className="lg:col-span-5 p-6 sm:p-8 rounded-2xl bg-zinc-950 border border-zinc-800 space-y-5">
        <Skeleton variant="text" width="50%" height={20} />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-3.5 rounded-xl border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton variant="circular" width={22} height={22} />
                <Skeleton variant="text" width={100} height={14} />
              </div>
              <Skeleton variant="circular" width={16} height={16} />
            </div>
          ))}
        </div>
        <Skeleton variant="rounded" width="100%" height={48} className="rounded-xl mt-4" />
      </div>
    </div>
  </div>
);

/**
 * SkeletonTestimonials — Row of review cards for home page and reviews section
 */
export const SkeletonTestimonials: React.FC<{ count?: number; className?: string }> = ({
  count = 4,
  className = ''
}) => (
  <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <div
        key={i}
        className="p-6 rounded-2xl bg-zinc-900/30 border border-white/5 space-y-4 flex flex-col justify-between"
      >
        <div className="space-y-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, sIdx) => (
              <Skeleton key={sIdx} variant="circular" width={14} height={14} />
            ))}
          </div>
          <div className="space-y-1.5">
            <Skeleton variant="text" width="100%" height={13} />
            <Skeleton variant="text" width="95%" height={13} />
            <Skeleton variant="text" width="60%" height={13} />
          </div>
        </div>
        <div className="flex items-center gap-3 pt-3 border-t border-white/5">
          <Skeleton variant="circular" width={36} height={36} />
          <div className="space-y-1 flex-1">
            <Skeleton variant="text" width="70%" height={13} />
            <Skeleton variant="text" width="45%" height={10} />
          </div>
        </div>
      </div>
    ))}
  </div>
);
