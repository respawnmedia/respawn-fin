import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, X, AlertTriangle, HelpCircle, Info, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react';
import { computeInsights, dismissInsight, clearDismissed, type Insight } from '@/lib/insights';

const SEVERITY_CONFIG = {
  warning: { icon: AlertTriangle, color: 'text-[#DC2626]', bg: 'bg-[#fee2e2]', border: 'border-[#fca5a5]', label: 'Warning' },
  question: { icon: HelpCircle, color: 'text-[#16C4BA]', bg: 'bg-[#f0fdfa]', border: 'border-[#99f6e4]', label: 'Question' },
  info: { icon: Info, color: 'text-[#888]', bg: 'bg-[#f7f7f5]', border: 'border-[#e8e8e8]', label: 'Info' },
};

export function InsightsTray() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  function refresh() {
    setInsights(computeInsights());
  }

  useEffect(() => {
    refresh();
    // Re-check every 5 minutes
    const interval = setInterval(refresh, 5 * 60 * 1000);
    // Also refresh when Supabase sync completes
    window.addEventListener('supabase-sync-complete', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('supabase-sync-complete', refresh);
    };
  }, []);

  function dismiss(id: string) {
    dismissInsight(id);
    setInsights(prev => prev.filter(i => i.id !== id));
  }

  function handleAction(insight: Insight) {
    if (insight.actionRoute) navigate(insight.actionRoute);
    setOpen(false);
  }

  const warningCount = insights.filter(i => i.severity === 'warning').length;
  const questionCount = insights.filter(i => i.severity === 'question').length;
  const total = insights.length;

  return (
    <div className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center w-8 h-8 text-[#888] hover:text-[#070707] transition-colors"
        title={`${total} insight${total !== 1 ? 's' : ''}`}
      >
        <Bell className="w-4 h-4" />
        {total > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 w-4 h-4 text-[9px] font-bold flex items-center justify-center text-white ${warningCount > 0 ? 'bg-[#DC2626]' : 'bg-[#16C4BA]'}`}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 w-[420px] max-w-[95vw] bg-white border border-[#e8e8e8] shadow-xl z-50 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#e8e8e8] flex-shrink-0">
              <div>
                <h3 className="font-['Barlow_Condensed'] font-bold text-sm uppercase tracking-wide text-[#070707]">
                  Smart Questions
                </h3>
                <p className="text-xs text-[#888] mt-0.5">
                  {total === 0 ? 'Everything looks good' : `${warningCount} warning${warningCount !== 1 ? 's' : ''} · ${questionCount} question${questionCount !== 1 ? 's' : ''}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={refresh} className="text-[#888] hover:text-[#070707]" title="Refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setOpen(false)} className="text-[#888] hover:text-[#070707]">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Insights list */}
            <div className="overflow-y-auto flex-1">
              {total === 0 ? (
                <div className="px-4 py-10 text-center">
                  <div className="w-10 h-10 bg-[#dcfce7] flex items-center justify-center mx-auto mb-3">
                    <span className="text-[#16A34A] text-lg">✓</span>
                  </div>
                  <p className="text-sm text-[#555] font-medium">All clear</p>
                  <p className="text-xs text-[#888] mt-1">No misalignments or open questions found</p>
                </div>
              ) : (
                insights.map(insight => {
                  const cfg = SEVERITY_CONFIG[insight.severity];
                  const Icon = cfg.icon;
                  const isExpanded = expanded === insight.id;
                  return (
                    <div key={insight.id} className={`border-b border-[#f0f0f0] last:border-0`}>
                      <div className={`px-4 py-3 ${isExpanded ? cfg.bg : ''}`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5 ${cfg.bg} border ${cfg.border}`}>
                            <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <button
                              onClick={() => setExpanded(isExpanded ? null : insight.id)}
                              className="text-left w-full"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-medium text-[#070707] leading-tight">{insight.title}</p>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-[#888] flex-shrink-0 mt-0.5" /> : <ChevronDown className="w-3.5 h-3.5 text-[#888] flex-shrink-0 mt-0.5" />}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="mt-2">
                                <p className="text-xs text-[#555] leading-relaxed whitespace-pre-line">{insight.body}</p>
                                <div className="flex items-center gap-2 mt-3">
                                  {insight.action && (
                                    <button
                                      onClick={() => handleAction(insight)}
                                      className={`px-3 py-1.5 text-xs font-medium ${cfg.color} border ${cfg.border} hover:${cfg.bg} transition-colors`}
                                    >
                                      {insight.action} →
                                    </button>
                                  )}
                                  {insight.dismissible && (
                                    <button onClick={() => dismiss(insight.id)} className="px-3 py-1.5 text-xs text-[#aaa] hover:text-[#555]">
                                      Dismiss
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer */}
            {total > 0 && (
              <div className="px-4 py-2 border-t border-[#e8e8e8] flex-shrink-0">
                <button onClick={() => { clearDismissed(); refresh(); }} className="text-xs text-[#aaa] hover:text-[#555]">
                  Restore dismissed
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
