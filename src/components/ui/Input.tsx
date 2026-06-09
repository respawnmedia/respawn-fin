import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export function Input({ label, error, hint, className = '', ...props }: InputProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-[#555] uppercase tracking-wide">
          {label}
        </label>
      )}
      <input
        className={`
          w-full px-3 py-2 text-sm bg-white border text-[#070707]
          placeholder:text-[#999]
          focus:outline-none focus:border-[#16C4BA] focus:ring-1 focus:ring-[#16C4BA]
          disabled:bg-[#f5f5f5] disabled:cursor-not-allowed
          ${error ? 'border-[#DC2626]' : 'border-[#ddd]'}
          ${className}
        `}
        {...props}
      />
      {error && <span className="text-xs text-[#DC2626]">{error}</span>}
      {hint && !error && <span className="text-xs text-[#888]">{hint}</span>}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ label, error, hint, options, placeholder, className = '', ...props }: SelectProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-[#555] uppercase tracking-wide">
          {label}
        </label>
      )}
      <select
        className={`
          w-full px-3 py-2 text-sm bg-white border text-[#070707]
          focus:outline-none focus:border-[#16C4BA] focus:ring-1 focus:ring-[#16C4BA]
          disabled:bg-[#f5f5f5] disabled:cursor-not-allowed
          ${error ? 'border-[#DC2626]' : 'border-[#ddd]'}
          ${className}
        `}
        {...props}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error && <span className="text-xs text-[#DC2626]">{error}</span>}
      {hint && !error && <span className="text-xs text-[#888]">{hint}</span>}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({ label, error, className = '', ...props }: TextareaProps) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-medium text-[#555] uppercase tracking-wide">
          {label}
        </label>
      )}
      <textarea
        className={`
          w-full px-3 py-2 text-sm bg-white border text-[#070707]
          placeholder:text-[#999] resize-y
          focus:outline-none focus:border-[#16C4BA] focus:ring-1 focus:ring-[#16C4BA]
          ${error ? 'border-[#DC2626]' : 'border-[#ddd]'}
          ${className}
        `}
        {...props}
      />
      {error && <span className="text-xs text-[#DC2626]">{error}</span>}
    </div>
  );
}
