'use client';

interface PaymentStatusBadgeProps {
  status: string;
  size?: 'sm' | 'md' | 'lg';
}

export default function PaymentStatusBadge({ status, size = 'md' }: PaymentStatusBadgeProps) {
  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'paid':
        return 'bg-green-900/30 text-green-400 border-green-500/50';
      case 'overdue':
        return 'bg-red-900/30 text-red-400 border-red-500/50';
      case 'sent':
        return 'bg-blue-900/30 text-blue-400 border-blue-500/50';
      case 'draft':
        return 'bg-yellow-900/30 text-yellow-400 border-yellow-500/50';
      case 'cancelled':
        return 'bg-gray-900/30 text-gray-400 border-gray-500/50';
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
      {status.toUpperCase()}
    </span>
  );
}
