import React from 'react';

type BadgeVariant = 'default' | 'green' | 'red' | 'amber' | 'blue' | 'teal' | 'gray';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-[#f0f0f0] text-[#555]',
  green: 'bg-[#dcfce7] text-[#16A34A]',
  red: 'bg-[#fee2e2] text-[#DC2626]',
  amber: 'bg-[#fef3c7] text-[#d97706]',
  blue: 'bg-[#dbeafe] text-[#2563eb]',
  teal: 'bg-[#ccfbf1] text-[#0d9488]',
  gray: 'bg-[#f3f4f6] text-[#6b7280]',
};

export function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}

// Invoice status badge
export function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, BadgeVariant> = {
    'Draft': 'gray',
    'Sent': 'blue',
    'Paid': 'green',
    'Partially Paid': 'amber',
    'Overdue': 'red',
  };
  return <Badge variant={map[status] || 'default'}>{status}</Badge>;
}

// Vertical badge
export function VerticalBadge({ vertical }: { vertical: string }) {
  const map: Record<string, BadgeVariant> = {
    restaurants: 'amber',
    menswear: 'blue',
    weddings: 'teal',
    other: 'gray',
  };
  const labels: Record<string, string> = {
    restaurants: 'Restaurants',
    menswear: 'Menswear',
    weddings: 'Weddings',
    other: 'Other',
  };
  return <Badge variant={map[vertical] || 'default'}>{labels[vertical] || vertical}</Badge>;
}

// Toast notification
interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
}

export function Toast({ message, type = 'info', onClose }: ToastProps) {
  const colors = {
    success: 'bg-[#16A34A] text-white',
    error: 'bg-[#DC2626] text-white',
    info: 'bg-[#070707] text-white',
  };
  return (
    <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-3 px-4 py-3 shadow-lg ${colors[type]}`}>
      <span className="text-sm">{message}</span>
      <button onClick={onClose} className="opacity-70 hover:opacity-100 text-xs">✕</button>
    </div>
  );
}
