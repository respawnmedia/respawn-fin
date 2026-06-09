import type { VercelRequest, VercelResponse } from '@vercel/node';
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pdfBase64, fileName } = req.body;
  if (!pdfBase64) return res.status(400).json({ error: 'No PDF provided' });

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: 'application/pdf',
                data: pdfBase64,
              },
            } as never,
            {
              type: 'text',
              text: `You are a bank statement parser. Extract ALL transactions from this Indian bank statement PDF.

Respond with a JSON object ONLY (no markdown, no explanation) with this exact structure:
{
  "bankName": "HDFC Bank" (or ICICI, SBI, Kotak, Axis, etc — detect from the document),
  "month": "YYYY-MM" (the statement period month, e.g. "2025-04"),
  "transactions": [
    {
      "date": "YYYY-MM-DD",
      "narration": "full narration text",
      "debit": 0,
      "credit": 0,
      "balance": 0,
      "ref_no": "",
      "confidence_score": 0.95
    }
  ]
}

Rules:
- Extract every single transaction, do not skip any
- debit = money going out, credit = money coming in (never both non-zero for the same row)
- balance = running balance after the transaction
- confidence_score: 1.0 = fully confident, 0.5 = uncertain about one field, 0.2 = guessed
- ref_no: transaction reference/UTR number if present
- date: use actual date from statement, not today's date
- If you cannot extract a field, use 0 for numbers and "" for strings`,
            },
          ],
        },
      ],
    });

    const text = message.content[0].type === 'text' ? message.content[0].text : '';
    // Strip any markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.json(parsed);
  } catch (err) {
    console.error('Extraction error:', err);
    const message = err instanceof Error ? err.message : 'Extraction failed';
    return res.status(500).json({ error: message });
  }
}
