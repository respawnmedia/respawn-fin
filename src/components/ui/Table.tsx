import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortable?: boolean;
  align?: 'left' | 'right' | 'center';
  width?: string;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  sortKey?: string;
  sortDir?: 'asc' | 'desc';
  onSort?: (key: string) => void;
  emptyMessage?: string;
  loading?: boolean;
  onRowClick?: (row: T) => void;
}

export function Table<T>({
  columns, data, keyExtractor, sortKey, sortDir, onSort,
  emptyMessage = 'No data yet.', loading = false, onRowClick,
}: TableProps<T>) {
  if (loading) {
    return (
      <div className="border border-[#e8e8e8] bg-white">
        <div className="flex items-center justify-center py-16 text-[#888] text-sm">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[#e8e8e8] overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#e8e8e8] bg-[#fafafa]">
            {columns.map(col => (
              <th
                key={col.key}
                className={`
                  px-4 py-3 text-xs font-semibold text-[#555] uppercase tracking-wide whitespace-nowrap
                  ${col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left'}
                  ${col.sortable ? 'cursor-pointer select-none hover:text-[#070707]' : ''}
                  ${col.width ? `w-[${col.width}]` : ''}
                `}
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.header}
                  {col.sortable && sortKey === col.key && (
                    sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-[#888] text-sm">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map(row => (
              <tr
                key={keyExtractor(row)}
                className={`
                  border-b border-[#f0f0f0] last:border-0
                  ${onRowClick ? 'cursor-pointer hover:bg-[#fafafa]' : 'hover:bg-[#fcfcfc]'}
                  transition-colors
                `}
                onClick={() => onRowClick?.(row)}
              >
                {columns.map(col => (
                  <td
                    key={col.key}
                    className={`
                      px-4 py-3 text-[#333]
                      ${col.align === 'right' ? 'text-right tabular-nums' : col.align === 'center' ? 'text-center' : 'text-left'}
                    `}
                  >
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
