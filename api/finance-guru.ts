import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the CFO of Respawn Media, a Chennai-based content marketing agency with 3 founders (Shlok, Tanay, Arihant) and ~11 team members. Verticals: restaurants/food (core), luxury menswear (e.g. Tissera ₹75K/mo), weddings (Knot).

You have TWO modes:

1. ADVISORY MODE: Give brutally practical financial advice grounded in actual numbers. Reference real figures, use INR (₹1,25,000 format), know Indian tax (GST 18%, TDS 194J/194C, advance tax Jun/Sep/Dec/Mar, TN professional tax).

2. TRANSACTION ENTRY MODE: When the user says things like "I paid X for Y" or "Got Z from client A" or "Add a transaction" — guide them through entering the transaction conversationally.

For transaction entry:
- Extract: amount, type (cash/bank, in/out), category, party, date, client (if any), reason/description
- ASK clarifying questions ONE AT A TIME if anything is missing or ambiguous. Don't ask 5 questions at once.
- When you have enough info, use the create_transaction tool to add it. Be confident — don't over-confirm.
- Default date to today unless specified
- For client-related expenses, try to link to a known client from context
- After creating: confirm briefly and offer to add another or analyze.

Available categories and clients are provided in context. Use them.

Be conversational, fast, action-oriented. Founders are busy.`;

const tools: Anthropic.Tool[] = [
  {
    name: 'create_transaction',
    description: 'Create a new transaction (bank or cash, in or out). Use after gathering all required info from the user. Confirms creation immediately.',
    input_schema: {
      type: 'object',
      properties: {
        transaction_type: { type: 'string', enum: ['cash', 'bank'], description: 'cash for petty cash, bank for bank account transactions' },
        direction: { type: 'string', enum: ['in', 'out'], description: 'in = money received, out = money spent' },
        amount: { type: 'number', description: 'Amount in INR (no currency symbol)' },
        date: { type: 'string', description: 'YYYY-MM-DD format. Default to today if user didn\'t specify' },
        category_id: { type: 'string', description: 'Category ID from the available categories list' },
        party: { type: 'string', description: 'Who the transaction was with (vendor, client, person name)' },
        description: { type: 'string', description: 'Brief description of what this was for' },
        reason: { type: 'string', description: 'Detailed reason / context for the transaction' },
        client_id: { type: 'string', description: 'Linked client ID if this transaction is attributable to a specific client. Optional.' },
      },
      required: ['transaction_type', 'direction', 'amount', 'date', 'category_id', 'party', 'description'],
    },
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, financialContext, categories, clients } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'No messages provided' });

  try {
    const contextSection = `

AVAILABLE CATEGORIES (use these IDs for category_id):
${(categories || []).map((c: { id: string; name: string; type: string }) => `- ${c.id}: ${c.name} (${c.type})`).join('\n')}

ACTIVE CLIENTS (use these IDs for client_id):
${(clients || []).map((c: { id: string; name: string; vertical: string }) => `- ${c.id}: ${c.name} (${c.vertical})`).join('\n')}

CURRENT FINANCIAL DATA (last 3 months):
${financialContext || 'No financial data available yet.'}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      system: SYSTEM_PROMPT + contextSection,
      tools,
      messages: messages.slice(-20),
    });

    // Extract text and tool uses from the response
    const textBlocks = response.content.filter(b => b.type === 'text');
    const toolUses = response.content.filter(b => b.type === 'tool_use');

    const reply = textBlocks.map(b => (b as { type: 'text'; text: string }).text).join('\n').trim();
    const actions = toolUses.map(b => {
      const tu = b as { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> };
      return { id: tu.id, name: tu.name, input: tu.input };
    });

    return res.json({ reply, actions, stop_reason: response.stop_reason });
  } catch (err) {
    console.error('Finance Guru error:', err);
    const message = err instanceof Error ? err.message : 'Finance Guru unavailable';
    return res.status(500).json({ error: message });
  }
}
