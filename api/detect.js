export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const { imageBase64, itemsToFind } = req.body;

    if (!imageBase64 || !itemsToFind) {
      return res.status(400).json({ error: 'Missing imageBase64 or itemsToFind' });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: imageBase64 }
            },
            {
              type: 'text',
              text: `請仔細看這張圖片，判斷畫面中是否有以下物品（只找清楚、明確在畫面前景的物品，不要猜測背景模糊物品）：${itemsToFind}。請只回傳 JSON，格式如下，true 代表清楚看到，false 代表沒有或不確定：{"backpack":false,"pen":false,"book":false,"bottle":false,"phone":false}`
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    const text = data.content?.[0]?.text || '{}';
    const match = text.match(/\{[^}]+\}/);
    const result = match ? JSON.parse(match[0]) : {};

    return res.status(200).json({ result });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
