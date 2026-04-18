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

    let response, data;
    for(let attempt=1; attempt<=3; attempt++){
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
                { text: prompt }
              ]
            }],
            generationConfig: { temperature: 0, maxOutputTokens: 150 }
          })
        }
      );
      data = await response.json();
      if(response.status === 503 || response.status === 429){
        if(attempt < 3){ await new Promise(r => setTimeout(r, 2000)); continue; }
      }
      break;
    }

    if (!response.ok) {
      const msg = data.error?.message || `Gemini API error ${response.status}`;
      console.error('Gemini error:', JSON.stringify(data));
      return res.status(response.status).json({ error: msg, detail: data.error });
    }

    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    let result = {};
    try {
      const match = raw.match(/\{[\s\S]*?\}/);
      result = match ? JSON.parse(match[0]) : {};
    } catch(parseErr) {
      console.error('JSON parse error:', raw);
    }

    return res.status(200).json({ result });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
