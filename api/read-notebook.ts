import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { imageBase64, mediaType, categories, clients } = req.body as {
    imageBase64: string;
    mediaType: string;
    categories: { id: string; name: string }[];
    clients: { id: string; name: string }[];
  };

  if (!imageBase64) return res.status(400).json({ error: 'No image provided' });

  const categoryList = categories.map(c => `${c.id}: ${c.name}`).join('\n');
  const clientList = clients.length > 0 ? clients.map(c => `${c.id}: ${c.name}`).join('\n') : 'None';

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 3000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: (mediaType || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp',
                data: imageBase64,
              },
            },
            {
              type: 'text',
              text: `This is a photo of a handwritten notebook or paper with cash transaction notes. Extract every transaction you can read.

Available categories (use exact IDs):
${categoryList}

Active clients (use exact IDs, or null if not mentioned):
${clientList}

Return ONLY a JSON array, no markdown, no explanation:
[
  {
    "date": "YYYY-MM-DD",
    "type": "Cash In" or "Cash Out",
    "amount": number,
    "party": "who paid / who was paid",
    "description": "what for",
    "reason": "any additional context from the notes",
    "category_id": "use best matching id from the list above",
    "client_id": "matching client id if mentioned, else null",
    "confidence": "high" | "medium" | "low",
    "raw_text": "exact text you read from the notebook for this entry"
  }
]

Rules:
- Today's date is ${new Date().toISOString().split('T')[0]}. If no year, assume current year. If no month, assume current month.
- If amount is unclear, use your best read and mark confidence "low"
- If text is illegible for a field, use your best guess and mark confidence "low"
- Cash In = money received. Cash Out = money spent.
- Extract EVERY line item you can see, even partial ones
- If you see "GST" mentioned, note it in the reason field`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    const transactions = JSON.parse(clean);

    return res.json({ transactions, count: transactions.length });
  } catch (err) {
    console.error('Notebook read error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to read notebook' });
  }
}
