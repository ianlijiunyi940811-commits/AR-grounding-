export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  try {
    const { imageBase64, itemsToFind } = req.body;
    if (!imageBase64 || !itemsToFind) {
      return res.status(400).json({ error: 'Missing imageBase64 or itemsToFind' });
    }

    const prompt = `請仔細看這張圖片，判斷畫面中是否有以下物品（只找清楚、明確在畫面前景的物品，不要猜測背景模糊物品）：${itemsToFind}。請只回傳 JSON，不要有任何其他文字，格式如下，true 代表清楚看到，false 代表沒有或不確定：{"backpack":false,"pen":false,"book":false,"bottle":false,"phone":false}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: imageBase64
                }
              },
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 100
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      const msg = data.error?.message || `Gemini API error ${response.status}`;
      return res.status(response.status).json({ error: msg });
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    const match = raw.match(/\{[^}]+\}/);
    const result = match ? JSON.parse(match[0]) : {};

    return res.status(200).json({ result });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
