// routes/coach.js
const express = require('express');
const router = express.Router();
const axios = require('axios');

router.post('/score', async (req, res) => {
  try {
    const { deliverable, rubric, context = {}, model = 'gpt-5' } = req.body;
    if (!deliverable || !rubric) return res.status(400).json({ error: 'Missing deliverable or rubric' });

    const fs = require('fs');
    const path = require('path');
    const promptPath = path.join(process.cwd(), 'src', 'modules', 'coach.prompt.txt');
    const systemPrompt = fs.readFileSync(promptPath, 'utf-8');

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ deliverable, rubric, context }) }
    ];

    const aiResp = await axios.post('https://api.openai.com/v1/chat/completions', {
      model, messages, response_format: { type: 'json_object' }
    }, { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } });

    const parsed = JSON.parse(aiResp.data.choices?.[0]?.message?.content || '{}');
    const total = parsed.total ?? 0;
    const xpAwarded = total >= 80 ? 150 : total >= 60 ? 60 : 20;
    res.json({ ...parsed, xpAwarded });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Coach scoring failed', detail: e.message });
  }
});

module.exports = router;
