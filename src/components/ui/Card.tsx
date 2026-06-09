import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const paddings = { none: '', sm: 'p-3', md: 'p-5', lg: 'p-8' };

export function Card({ children, className = '', padding = 'md' }: CardProps) {
  return (
    <div className={`bg-white border border-[#e8e8e8] ${paddings[padding]} ${className}`}>
      {children}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
  accent?: 'default' | 'green' | 'red' | 'amber' | 'teal';
  icon?: React.ReactNode;
}

const accents = {
  default: 'text-[#070707]',
  green: 'text-[#16A34A]',
  red: 'text-[#DC2626]',
  amber: 'text-[#F59E0B]',
  teal: 'text-[#16C4BA]',
};

export function MetricCard({ label, value, sub, accent = 'default', icon }: MetricCardProps) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-[#888] uppercase tracking-wide">{label}</span>
        {icon && <span className="text-[#bbb]">{icon}</span>}
      </div>
      <span className={`font-['Barlow_Condensed'] text-3xl font-bold tracking-tight ${accents[accent]}`}>
        {value}
      </span>
      {sub && <span className="text-xs text-[#888]">{sub}</span>}
    </Card>
  );
}
