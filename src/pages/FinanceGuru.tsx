import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Star, Plus, MessageSquare, Loader2 } from 'lucide-react';
import { PageHeader } from '@/components/layout/Layout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  getGuruConversations, addGuruConversation, updateGuruConversation,
  getGuruMessages, addGuruMessage, updateGuruMessage,
  getBankTransactions, getCashTransactions, getInvoices,
  getClients, getCategories, addAuditEntry
} from '@/lib/storage';
import { formatCurrency, currentMonth, monthsAgo } from '@/utils/format';
import type { GuruConversation, GuruMessage } from '@/types';

const SUGGESTED_PROMPTS = [
  "Where can we cut costs without hurting operations?",
  "Which vertical has the best margins?",
  "Are any expenses growing faster than revenue?",
  "Which clients are most profitable?",
  "How much runway do we have if revenue stops today?",
  "What should I set aside this month for taxes?",
];

function buildFinancialContext(): string {
  const bankTxns = getBankTransactions();
  const cashTxns = getCashTransactions();
  const invoices = getInvoices();
  const clients = getClients();
  const categories = getCategories();

  // Last 3 months data
  const months = [0, 1, 2].map(i => monthsAgo(i));

  const monthlyData = months.map(month => {
    const bank = bankTxns.filter(t => t.date.startsWith(month));
    const cash = cashTxns.filter(t => t.date.startsWith(month));
    const monthInvoices = invoices.filter(i => i.invoice_date.startsWith(month));

    const inflow = bank.reduce((s, t) => s + t.credit, 0) + cash.filter(t => t.type === 'Cash In').reduce((s, t) => s + t.amount, 0);
    const outflow = bank.reduce((s, t) => s + t.debit, 0) + cash.filter(t => t.type === 'Cash Out').reduce((s, t) => s + t.amount, 0);

    // Category breakdown
    const catBreakdown: Record<string, number> = {};
    bank.filter(t => t.debit > 0).forEach(t => {
      const cat = categories.find(c => c.id === t.category_id)?.name || t.category_id;
      catBreakdown[cat] = (catBreakdown[cat] || 0) + t.debit;
    });

    return { month, inflow, outflow, net: inflow - outflow, invoicedRevenue: monthInvoices.reduce((s, i) => s + i.amount, 0), catBreakdown };
  });

  // Client payment health
  const clientHealth = clients.map(c => {
    const clientInvoices = invoices.filter(i => i.client_id === c.id);
    const paid = clientInvoices.filter(i => i.status === 'Paid').reduce((s, i) => s + i.total, 0);
    const pending = clientInvoices.filter(i => i.status !== 'Paid').reduce((s, i) => s + i.total, 0);
    return { name: c.name, vertical: c.vertical, retainer: c.retainer_amount, paid, pending, status: c.status };
  });

  return JSON.stringify({ monthlyData, clientHealth, totalClients: clients.length, currentMonth: currentMonth() }, null, 2);
}

export function FinanceGuruPage() {
  const [conversations, setConversations] = useState<GuruConversation[]>(getGuruConversations());
  const [activeConvId, setActiveConvId] = useState<string | null>(conversations[0]?.id || null);
  const [messages, setMessages] = useState<GuruMessage[]>(activeConvId ? getGuruMessages(activeConvId) : []);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  function newConversation() {
    const conv = addGuruConversation({ started_at: new Date().toISOString(), title: 'New conversation' });
    setConversations(getGuruConversations());
    setActiveConvId(conv.id);
    setMessages([]);
  }

  function switchConversation(id: string) {
    setActiveConvId(id);
    setMessages(getGuruMessages(id));
  }

  function toggleStar(msg: GuruMessage) {
    updateGuruMessage(msg.id, { starred: !msg.starred });
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, starred: !m.starred } : m));
  }

  async function sendMessage(content: string) {
    if (!content.trim() || loading) return;

    // Ensure conversation exists
    let convId = activeConvId;
    if (!convId) {
      const conv = addGuruConversation({ started_at: new Date().toISOString(), title: content.slice(0, 40) });
      convId = conv.id;
      setActiveConvId(conv.id);
      setConversations(getGuruConversations());
    }

    // Add user message
    const userMsg = addGuruMessage({ conversation_id: convId, role: 'user', content, timestamp: new Date().toISOString(), starred: false });
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    // Update conversation title if first message
    const convMsgs = getGuruMessages(convId);
    if (convMsgs.length <= 1) {
      updateGuruConversation(convId, { title: content.slice(0, 50) });
      setConversations(getGuruConversations());
    }

    addAuditEntry({ user_id: 'founder', action: 'GURU_QUERY', entity: 'guru_conversation', entity_id: convId });

    try {
      const financialContext = buildFinancialContext();
      const response = await fetch('/api/finance-guru', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...convMsgs, userMsg].map(m => ({ role: m.role, content: m.content })),
          financialContext,
        }),
      });

      if (!response.ok) throw new Error('Request failed');
      const { reply } = await response.json();

      const assistantMsg = addGuruMessage({ conversation_id: convId, role: 'assistant', content: reply, timestamp: new Date().toISOString(), starred: false });
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      const errMsg = addGuruMessage({ conversation_id: convId, role: 'assistant', content: "Sorry, I couldn't reach the Finance Guru right now. Check your API configuration.", timestamp: new Date().toISOString(), starred: false });
      setMessages(prev => [...prev, errMsg]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full">
      {/* Sidebar: conversation list */}
      <div className="w-56 border-r border-[#e8e8e8] bg-white flex flex-col flex-shrink-0">
        <div className="p-3 border-b border-[#e8e8e8]">
          <Button variant="secondary" size="sm" icon={<Plus className="w-3.5 h-3.5" />} onClick={newConversation} className="w-full justify-center">
            New Chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 ? (
            <p className="text-xs text-[#888] p-3">No conversations yet.</p>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => switchConversation(conv.id)}
                className={`w-full text-left px-3 py-2.5 text-xs hover:bg-[#f7f7f5] transition-colors border-b border-[#f0f0f0] ${activeConvId === conv.id ? 'bg-[#f0f0f0]' : ''}`}
              >
                <p className="font-medium text-[#333] truncate">{conv.title}</p>
                <p className="text-[#888] mt-0.5">{new Date(conv.started_at).toLocaleDateString('en-IN')}</p>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#e8e8e8] bg-white flex-shrink-0">
          <h1 className="font-['Barlow_Condensed'] text-2xl font-bold text-[#070707] uppercase">Finance Guru</h1>
          <p className="text-xs text-[#888] mt-0.5">Your CFO — grounded in actual Respawn Media numbers</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && !loading && (
            <div className="max-w-xl">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-[#16C4BA] flex items-center justify-center">
                  <MessageSquare className="w-5 h-5 text-[#070707]" />
                </div>
                <div>
                  <p className="font-semibold text-[#070707]">Finance Guru</p>
                  <p className="text-xs text-[#888]">Ask me anything about Respawn's finances</p>
                </div>
              </div>
              <p className="text-sm text-[#555] mb-4">Try one of these:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {SUGGESTED_PROMPTS.map(p => (
                  <button
                    key={p}
                    onClick={() => sendMessage(p)}
                    className="text-left text-xs px-4 py-3 border border-[#e0e0e0] text-[#555] hover:border-[#16C4BA] hover:text-[#16C4BA] transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'bg-[#070707] text-white' : 'bg-white border border-[#e8e8e8]'} px-4 py-3`}>
                <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                <div className={`flex items-center gap-2 mt-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <span className="text-xs opacity-50">
                    {new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                  {msg.role === 'assistant' && (
                    <button onClick={() => toggleStar(msg)} className={`text-xs ${msg.starred ? 'text-[#F59E0B]' : 'text-[#ccc] hover:text-[#F59E0B]'}`}>
                      <Star className="w-3 h-3" fill={msg.starred ? '#F59E0B' : 'none'} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-white border border-[#e8e8e8] px-4 py-3 flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-[#16C4BA]" />
                <span className="text-sm text-[#888]">Guru is thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-6 py-4 border-t border-[#e8e8e8] bg-white flex-shrink-0">
          <div className="flex gap-3">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder="Ask about cash flow, expenses, client margins..."
              className="flex-1 px-4 py-2.5 text-sm border border-[#ddd] focus:outline-none focus:border-[#16C4BA] focus:ring-1 focus:ring-[#16C4BA]"
            />
            <Button variant="primary" onClick={() => sendMessage(input)} loading={loading} icon={<Send className="w-4 h-4" />}>
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
