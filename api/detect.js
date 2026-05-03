export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  // Safely parse body — handles both pre-parsed object and raw string
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch(e) { return res.status(400).json({ error: 'Invalid JSON body' }); }
  }
  if (!body) return res.status(400).json({ error: 'Empty request body' });

  const { imageBase64, itemsToFind } = body;
  if (!imageBase64) return res.status(400).json({ error: 'Missing imageBase64' });
  if (!itemsToFind) return res.status(400).json({ error: 'Missing itemsToFind' });

  const prompt = `看這張圖片，找出是否有以下物品。請放寬判斷標準，只要圖片中有看到就算，不需要很清楚。物品清單：${itemsToFind}。只回傳 JSON 格式，不要任何其他文字或解釋：{"backpack":false,"pen":false,"book":false,"bottle":false,"phone":false}`;

  let response, data;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [
              { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
              { text: prompt }
            ]}],
            generationConfig: { temperature: 0, maxOutputTokens: 150 }
          })
        }
      );
      clearTimeout(timer);
      data = await response.json();
      if (response.status === 429) {
        // Rate limited — tell frontend to wait, don't burn more quota retrying
        return res.status(429).json({ error: '額度暫時用完，請等 30 秒後再試', retryAfter: 30 });
      }
      if (response.status === 503) {
        if (attempt < 3) { await new Promise(r => setTimeout(r, 4000)); continue; }
      }
      break;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < 3) { await new Promise(r => setTimeout(r, 4000)); continue; }
      return res.status(500).json({ error: err.name === 'AbortError' ? 'Gemini timeout' : err.message });
    }
  }

  if (!response.ok) {
    return res.status(response.status).json({ error: data?.error?.message || 'Gemini error' });
  }

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  let result = {};
  try { const m = raw.match(/\{[\s\S]*?\}/); result = m ? JSON.parse(m[0]) : {}; } catch(e) {}
  return res.status(200).json({ result });
}
