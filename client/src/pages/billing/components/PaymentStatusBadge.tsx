'use client';

interface PaymentStatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function PaymentStatusBadge({ status, size = 'md' }: PaymentStatusBadgeProps) {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-emerald-900/30 text-emerald-400 border-emerald-500/50';
      case 'final':
        return 'bg-cyan-900/30 text-cyan-300 border-cyan-500/50';
      case 'overdue':
        return 'bg-red-900/30 text-red-400 border-red-500/50';
      case 'sent':
        return 'bg-blue-900/30 text-blue-400 border-blue-500/50';
      case 'pending_verification':
      case 'pending':
        return 'bg-amber-900/30 text-amber-300 border-amber-500/50';
      case 'rejected':
      case 'failed':
        return 'bg-rose-900/30 text-rose-400 border-rose-500/50';
      case 'draft':
        return 'bg-zinc-800 text-zinc-300 border-zinc-600/50';
      case 'void':
      case 'cancelled':
        return 'bg-rose-900/30 text-rose-400 border-rose-500/50';
      default:
        return 'bg-zinc-900/30 text-zinc-400 border-zinc-500/50';
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-1 text-xs',
    md: 'px-3 py-1.5 text-sm',
    lg: 'px-4 py-2 text-base',
  };

  return (
    <span
      className={`
        inline-block border rounded-full font-semibold
        transition-all duration-200 hover:shadow-lg
        ${getStatusColor(status)} ${sizeClasses[size]}
        font-mono tracking-widest
      `}
    >
      {status.replace(/_/g, ' ').toUpperCase()}
    </span>
  );
}
