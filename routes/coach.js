// routes/coach.js — FIXED VERSION
import express from 'express';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// FIXED: Load coach prompt with proper error handling
function loadCoachPrompt() {
  const promptPath = path.join(process.cwd(), 'src', 'modules', 'coach.prompt.txt');
  
  if (fs.existsSync(promptPath)) {
    return fs.readFileSync(promptPath, 'utf-8');
  }
  
  // Fallback prompt if file doesn't exist
  return `You are a senior small-business marketing coach.
Score the user's submission against the supplied rubric.
Return strictly the following JSON:
{
  "scores": [{"name": "<rubric item>", "score": 0-5, "reason": "<1-2 sentences>"}],
  "total": <0-100 integer>,
  "summary": "<2-3 sentence overview>",
  "actions": ["<concrete improvement step>", "..."]
}
Be fair but rigorous. Avoid generic advice; use the user's context (business type, offer, audience).`;
}

// FIXED: Load rubric files
function loadRubric(rubricId) {
  const rubricPath = path.join(process.cwd(), 'src', 'modules', 'rubrics', `${rubricId}.json`);
  
  if (fs.existsSync(rubricPath)) {
    try {
      return JSON.parse(fs.readFileSync(rubricPath, 'utf-8'));
    } catch (e) {
      console.error(`Error loading rubric ${rubricId}:`, e);
    }
  }
  
  // Fallback rubric
  return [
    { "name": "Clarity", "max": 5 },
    { "name": "Relevance", "max": 5 },
    { "name": "Completeness", "max": 5 },
    { "name": "Actionability", "max": 5 },
    { "name": "Professional Quality", "max": 5 }
  ];
}

// FIXED: Coach scoring endpoint
router.post('/score', async (req, res) => {
  try {
    const { 
      deliverable, 
      rubric, 
      rubricId,
      context = {}, 
      model = 'gpt-4'  // FIXED: Use valid model
    } = req.body || {};

    // Validation
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ 
        error: 'OPENAI_API_KEY is not configured',
        scores: [],
        total: 0,
        summary: 'AI scoring unavailable - missing API key',
        actions: ['Contact administrator to configure OpenAI API key']
      });
    }

    if (!deliverable) {
      return res.status(400).json({ 
        error: 'Deliverable content is required',
        scores: [],
        total: 0,
        summary: 'No content provided for scoring',
        actions: ['Please provide content to score']
      });
    }

    // Load rubric - either from request or file
    let rubricItems = rubric;
    if (!rubricItems && rubricId) {
      rubricItems = loadRubric(rubricId);
    }
    
    if (!rubricItems || !Array.isArray(rubricItems)) {
      rubricItems = loadRubric('default'); // Load default rubric
    }

    // Load system prompt
    const systemPrompt = loadCoachPrompt();

    // Prepare messages
    const userContent = JSON.stringify({
      deliverable: deliverable.trim(),
      rubric: rubricItems,
      context: context || {}
    });

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent }
    ];

    console.log(`🤖 Scoring with ${model}...`);

    // Call OpenAI API
    const aiResponse = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages,
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1500
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    const content = aiResponse.data?.choices?.[0]?.message?.content || '{}';
    
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('JSON parsing error:', parseError);
      parsed = {
        scores: rubricItems.map(item => ({ 
          name: item.name, 
          score: 3, 
          reason: 'Unable to parse AI response' 
        })),
        total: 60,
        summary: 'Scoring completed but response format was invalid',
        actions: ['Try submitting again']
      };
    }

    // Validate and clean response
    const scores = Array.isArray(parsed.scores) ? parsed.scores : [];
    const total = Number.isFinite(parsed.total) ? Math.max(0, Math.min(100, parsed.total)) : 0;
    const summary = typeof parsed.summary === 'string' ? parsed.summary : 'Scoring completed';
    const actions = Array.isArray(parsed.actions) ? parsed.actions : ['Keep improving!'];

    // Calculate XP based on score
    const xpAwarded = total >= 80 ? 150 : total >= 60 ? 60 : 20;

    const response = {
      scores,
      total,
      summary,
      actions,
      xpAwarded,
      rubricUsed: rubricItems.map(r => r.name).join(', ')
    };

    console.log(`✅ Scored: ${total}/100 (${xpAwarded} XP)`);
    res.json(response);

  } catch (error) {
    console.error('Coach scoring error:', error?.response?.data || error.message);
    
    // Return a graceful error response
    res.status(500).json({
      error: 'AI scoring failed',
      detail: error.message,
      scores: [],
      total: 0,
      summary: 'Unable to score submission due to technical error',
      actions: [
        'Check your internet connection',
        'Try again in a moment',
        'Contact support if problem persists'
      ],
      xpAwarded: 0
    });
  }
});

// FIXED: Add rubric endpoint
router.get('/rubric/:id', (req, res) => {
  try {
    const rubric = loadRubric(req.params.id);
    res.json({ ok: true, rubric });
  } catch (error) {
    res.status(500).json({ 
      ok: false, 
      error: 'Failed to load rubric',
      rubric: loadRubric('default')
    });
  }
});

// Health check for coach system
router.get('/health', (req, res) => {
  const hasApiKey = !!process.env.OPENAI_API_KEY;
  const promptExists = fs.existsSync(path.join(process.cwd(), 'src', 'modules', 'coach.prompt.txt'));
  
  res.json({
    ok: hasApiKey && promptExists,
    apiKey: hasApiKey,
    promptFile: promptExists,
    timestamp: new Date().toISOString()
  });
});

export default router;
