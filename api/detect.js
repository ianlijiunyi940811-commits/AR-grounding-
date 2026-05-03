export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const { imageBase64, itemsToFind } = req.body || {};
  if (!imageBase64 || !itemsToFind) return res.status(400).json({ error: 'Missing params' });

  const prompt = `請仔細看這張圖片，判斷畫面中是否有以下物品（只找清楚在畫面前景的物品，不要猜測背景模糊物品）：${itemsToFind}。只回傳 JSON，不要其他文字：{"backpack":false,"pen":false,"book":false,"bottle":false,"phone":false}`;

  let response, data;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
      if (response.status === 503 || response.status === 429) {
        if (attempt < 3) { await new Promise(r => setTimeout(r, 2000)); continue; }
      }
      break;
    } catch (err) {
      clearTimeout(timer);
      if (attempt < 3) { await new Promise(r => setTimeout(r, 2000)); continue; }
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
