import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM_PROMPT = `You are the CFO of Respawn Media, a Chennai-based content marketing agency with 3 founders (Shlok, Tanay, Arihant) and ~11 team members.

The agency operates across three verticals:
- Restaurants & food brands (core, highest volume)
- Luxury bespoke menswear (highest ticket, e.g. Tissera at ₹75K/month)
- Weddings (via sister brand Knot)

Your job: Give brutally practical, specific financial advice grounded in the actual numbers provided. Never give generic financial wisdom. Every answer must reference actual figures from the data.

Context:
- You know Indian tax law: GST (18% on services), TDS (194J professional services, 194C contracts), advance tax (Jun/Sep/Dec/Mar), Tamil Nadu professional tax
- Expenses in Indian Rupees (₹), format as Indian numbering (₹1,25,000 not ₹125,000)
- Agency runway, burn rate, margin analysis — these founders make decisions fast and need clarity
- Keep answers concise but complete. Use bullet points where helpful. Flag concerns directly.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages, financialContext } = req.body;
  if (!messages?.length) return res.status(400).json({ error: 'No messages provided' });

  try {
    const contextualSystem = `${SYSTEM_PROMPT}

CURRENT FINANCIAL DATA (last 3 months):
${financialContext || 'No financial data available yet — advise the user to add transactions first.'}`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: contextualSystem,
      messages: messages.slice(-20), // Last 20 messages for context
    });

    const reply = response.content[0].type === 'text' ? response.content[0].text : 'Unable to generate response.';
    return res.json({ reply });
  } catch (err) {
    console.error('Finance Guru error:', err);
    return res.status(500).json({ error: 'Finance Guru unavailable' });
  }
}
