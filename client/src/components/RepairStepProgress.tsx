import React from 'react';
import { Cpu, Zap, CreditCard, ClipboardList } from 'lucide-react';

export type WorkflowStepKey = 'device' | 'priority' | 'payment' | 'details';

export interface RepairWorkflowTicket {
  id?: number | string;
  ticketNumber?: string;
  status?: string;
  priority?: string;
  repairCost?: number;
  repair_cost?: number;
  paymentStatus?: string;
  payment_status?: string;
  customerApprovalStatus?: string;
}

interface RepairStepProgressProps {
  ticket?: RepairWorkflowTicket | null;
  currentActiveStep?: WorkflowStepKey;
  onStepClick?: (step: WorkflowStepKey) => void;
  className?: string;
}

export function computeWorkflowSteps(ticket?: RepairWorkflowTicket | null, defaultActiveStep: WorkflowStepKey = 'device') {
  if (!ticket || !ticket.id) {
    // Mode: Initial Repair Creation Form
    return [
      {
        key: 'device' as WorkflowStepKey,
        label: 'Device',
        sublabel: 'Submit Info',
        status: defaultActiveStep === 'device' ? 'active' : 'locked',
        icon: Cpu,
        clickable: true,
      },
      {
        key: 'priority' as WorkflowStepKey,
        label: 'Priority',
        sublabel: 'Awaiting Request',
        status: 'locked',
        icon: Zap,
        clickable: false,
      },
      {
        key: 'payment' as WorkflowStepKey,
        label: 'Payment',
        sublabel: 'Pending Repair',
        status: 'locked',
        icon: CreditCard,
        clickable: false,
      },
      {
        key: 'details' as WorkflowStepKey,
        label: 'Details',
        sublabel: 'Tax Invoice',
        status: 'locked',
        icon: ClipboardList,
        clickable: false,
      },
    ];
  }

  const isPaid = ticket.paymentStatus === 'paid' || ticket.payment_status === 'paid';
  const isCompleted = ticket.status === 'completed' || ticket.status === 'delivered';
  const hasCost = Number(ticket.repairCost || ticket.repair_cost || 0) > 0;
  const isApproved = ticket.customerApprovalStatus === 'approved';
  const isPaymentEligible = isCompleted && hasCost && isApproved && !isPaid;

  // Step 1: Device is persisted
  const deviceStatus = 'completed';

  // Step 2: Priority is confirmed
  const priorityStatus = isCompleted ? 'completed' : 'active';
  const prioritySublabel = ticket.priority ? `${ticket.priority}` : 'Confirmed';

  // Step 3: Payment
  let paymentStatus: 'completed' | 'active' | 'locked';
  let paymentSublabel = 'Locked';
  if (isPaid) {
    paymentStatus = 'completed';
    paymentSublabel = 'Settled';
  } else if (isPaymentEligible) {
    paymentStatus = 'active';
    paymentSublabel = 'Ready to Pay';
  } else if (isCompleted && !hasCost) {
    paymentStatus = 'locked';
    paymentSublabel = 'Assessing Cost';
  } else if (ticket.customerApprovalStatus === 'pending_approval') {
    paymentStatus = 'locked';
    paymentSublabel = 'Approval Needed';
  } else {
    paymentStatus = 'locked';
    paymentSublabel = 'Pending Service';
  }

  // Step 4: Details / PDF Invoice
  let detailsStatus: 'completed' | 'active' | 'locked' = 'locked';
  let detailsSublabel = 'Locked';
  if (isPaid && (ticket.status?.toLowerCase() === 'delivered' || ticket.status?.toLowerCase() === 'closed')) {
    detailsStatus = 'completed';
    detailsSublabel = 'Fulfilled';
  } else if (isPaid) {
    detailsStatus = 'active';
    detailsSublabel = 'Invoice Ready';
  } else {
    detailsStatus = 'locked';
    detailsSublabel = 'Unlocks After Pay';
  }

  return [
    {
      key: 'device' as WorkflowStepKey,
      label: 'Device',
      sublabel: 'Submitted',
      status: deviceStatus,
      icon: Cpu,
      clickable: true,
    },
    {
      key: 'priority' as WorkflowStepKey,
      label: 'Priority',
      sublabel: prioritySublabel,
      status: priorityStatus,
      icon: Zap,
      clickable: true,
    },
    {
      key: 'payment' as WorkflowStepKey,
      label: 'Payment',
      sublabel: paymentSublabel,
      status: paymentStatus,
      icon: CreditCard,
      clickable: paymentStatus !== 'locked',
    },
    {
      key: 'details' as WorkflowStepKey,
      label: 'Details',
      sublabel: detailsSublabel,
      status: detailsStatus,
      icon: ClipboardList,
      clickable: detailsStatus !== 'locked',
    },
  ];
}

export default function RepairStepProgress({
  ticket,
  currentActiveStep = 'device',
  onStepClick,
  className = '',
}: RepairStepProgressProps) {
  const steps = computeWorkflowSteps(ticket, currentActiveStep);

  return (
    <div className={`w-full max-w-xl lg:max-w-2xl 2xl:max-w-3xl 3xl:max-w-4xl mx-auto ${className}`}>
      <div className="flex items-start justify-between relative w-full px-1 sm:px-2">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          const isCompleted = step.status === 'completed';
          const isActive = step.status === 'active';
          const isLast = idx === steps.length - 1;

          return (
            <React.Fragment key={step.key}>
              {/* Step Circle & Label Column */}
              <button
                type="button"
                disabled={!step.clickable}
                onClick={() => {
                  if (step.clickable && onStepClick) {
                    onStepClick(step.key);
                  }
                }}
                title={`${step.label}${step.sublabel ? ` - ${step.sublabel}` : ''}`}
                className={`group flex flex-col items-center focus:outline-none transition-all duration-300 flex-1 max-w-[72px] sm:max-w-[90px] md:max-w-[110px] 2xl:max-w-[130px] min-w-0 select-none ${
                  step.clickable ? 'cursor-pointer' : 'cursor-default'
                }`}
              >
                {/* Circular Icon Container */}
                <div
                  className={`w-9 h-9 sm:w-11 sm:h-11 md:w-12 md:h-12 2xl:w-14 2xl:h-14 rounded-full flex items-center justify-center transition-all duration-300 shrink-0 ${
                    isActive
                      ? 'border-2 border-neon-cyan text-neon-cyan'
                      : isCompleted
                      ? 'border border-neon-cyan/60 text-neon-cyan'
                      : 'border border-zinc-800/80 bg-zinc-900/60 text-zinc-600'
                  } ${step.clickable && !isActive ? 'group-hover:border-zinc-700' : ''}`}
                  style={
                    isActive
                      ? {
                          borderColor: 'var(--neon-cyan)',
                          backgroundColor: 'rgba(var(--neon-cyan-rgb), 0.15)',
                          color: 'var(--neon-cyan)',
                          boxShadow: '0 0 16px rgba(var(--neon-cyan-rgb), 0.35)',
                          outline: '1px solid rgba(var(--neon-cyan-rgb), 0.3)'
                        }
                      : isCompleted
                      ? {
                          borderColor: 'rgba(var(--neon-cyan-rgb), 0.55)',
                          backgroundColor: 'rgba(var(--neon-cyan-rgb), 0.08)',
                          color: 'rgba(var(--neon-cyan-rgb), 0.9)'
                        }
                      : undefined
                  }
                >
                  <Icon
                    className={`w-4 h-4 sm:w-5 sm:h-5 2xl:w-6 2xl:h-6 transition-colors duration-200 ${
                      isActive
                        ? 'text-neon-cyan'
                        : isCompleted
                        ? 'text-neon-cyan/90'
                        : 'text-zinc-600 group-hover:text-zinc-500'
                    }`}
                    style={
                      isActive
                        ? { color: 'var(--neon-cyan)' }
                        : isCompleted
                        ? { color: 'rgba(var(--neon-cyan-rgb), 0.9)' }
                        : undefined
                    }
                  />
                </div>

                {/* Step Label */}
                <span
                  className={`mt-1.5 sm:mt-2.5 md:mt-3 text-[10px] sm:text-xs 2xl:text-sm font-bold uppercase tracking-wider transition-colors duration-200 text-center break-words leading-tight max-w-full ${
                    isActive
                      ? 'text-white'
                      : isCompleted
                      ? 'text-zinc-300'
                      : 'text-zinc-600'
                  }`}
                >
                  {step.label}
                </span>

                {/* Step Sublabel for sm+ */}
                <span className="hidden sm:block text-[9px] md:text-[10px] 2xl:text-[11px] font-mono text-zinc-500 mt-0.5 text-center truncate max-w-full">
                  {step.sublabel}
                </span>
              </button>

              {/* Connecting Line Between Steps */}
              {!isLast && (
                <div className="flex-1 self-start mt-4.5 sm:mt-5.5 md:mt-6 2xl:mt-7 mx-1 sm:mx-2 md:mx-3 h-[1px] min-w-[8px] sm:min-w-[16px]">
                  <div
                    className={`h-full w-full transition-colors duration-300 ${
                      !isCompleted && !isActive ? 'bg-zinc-800' : ''
                    }`}
                    style={
                      isCompleted
                        ? { backgroundColor: 'var(--neon-cyan)' }
                        : isActive
                        ? {
                            background:
                              'linear-gradient(to right, var(--neon-cyan), rgba(var(--neon-cyan-rgb), 0.25) 50%, #27272a 100%)'
                          }
                        : undefined
                    }
                  />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
