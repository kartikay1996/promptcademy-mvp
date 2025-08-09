import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.post('/score', async (req, res) => {
  try {
    const { deliverable, rubric, context = {}, model = 'gpt-5' } = req.body || {};
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY is not set' });
    if (!deliverable || !rubric) return res.status(400).json({ error: 'Missing deliverable or rubric' });

    const promptPath = path.join(process.cwd(), 'src', 'modules', 'coach.prompt.txt');
    const systemPrompt = fs.existsSync(promptPath)
      ? fs.readFileSync(promptPath, 'utf-8')
      : 'You are a strict small-business marketing coach. Return JSON with scores, total, summary, actions.';

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ deliverable, rubric, context }) },
    ];

    const aiResp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model,
      messages,
      response_format: { type: 'json_object' },
    }, {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      timeout: 30000
    });

    const content = aiResp.data?.choices?.[0]?.message?.content || '{}';
    let parsed; try { parsed = JSON.parse(content); } catch { parsed = {}; }
    const total = Number.isFinite(parsed.total) ? parsed.total : 0;
    const xpAwarded = total >= 80 ? 150 : total >= 60 ? 60 : 20;

    res.json({ ...parsed, xpAwarded });
  } catch (e) {
    console.error('Coach error:', e?.response?.data || e.message);
    res.status(500).json({ error: 'Coach scoring failed', detail: e.message });
  }
});

export default router;
