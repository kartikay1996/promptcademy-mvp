// server.js — PromptCademy (ESM, fixed)
// - Preserves your original routes and behaviors
// - Adds req -> res.locals for EJS (prevents 500 on Sign In)
// - Clean URLs for static files + branded 404
// - Gzip compression + trust proxy
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import OpenAI from 'openai';
import fs from 'fs';
import expressLayouts from 'express-ejs-layouts';
import coachRoutes from './routes/coach.js';
//import compression from 'compression';

import db, { q, seed } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // Render/NGINX/etc.

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
const PORT = process.env.PORT || 3000;
const SEED_ON_BOOT = process.env.SEED_ON_BOOT === 'true';
if (SEED_ON_BOOT) seed();

/* ---------- Views ---------- */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

/* ---------- Core middleware ---------- */
//app.use(compression());                 // gzip
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const cors = require('cors');
app.use(cors({ origin: ['https://promptcademy-mvp.onrender.com','http://localhost:3000','http://127.0.0.1:3000'], credentials: true }));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Make `req` available in all EJS templates/partials (fixes 500 on login)
app.use((req, res, next) => { res.locals.req = req; next(); });

/* ---------- Static (clean URLs + caching) ---------- */
app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],              // /lessons -> /lessons/index.html or .html
    maxAge: '7d',
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

/* ---------- Sessions ---------- */
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

/* ---------- Auth helpers ---------- */
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}
function setUser(req, res, next) {
  res.locals.user = req.session.userId ? q.findUserById(req.session.userId) : null;
  next();
}
app.use(setUser);

/* ---------- Diagnostics ---------- */
app.get('/healthz', (req, res) => {
  try {
    const total = q.listLessons().length;
    res.json({ ok: true, lessons: total, user: !!res.locals.user });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/debug/state', (req, res) => {
  try {
    const daily = q.getDailyLesson();
    res.json({ ok: true, dailyLessonId: daily?.id ?? null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ---------- Routes (preserved from your app) ---------- */
// Landing
app.get('/', (req, res) => res.render('index', { title: 'PromptCademy' }));

// Optional convenience: /index -> /
app.get('/index', (req, res) => res.redirect('/'));

// Catalog (public) with category filter
app.get('/catalog', (req, res) => {
  const cat = req.query.cat || 'All';
  const lessons = q.listLessonsByCategory(cat);
  res.render('catalog', { lessons, activeCat: cat });
});
const coachRoutes = require('./routes/coach');
app.use('/api/coach', coachRoutes);

const paymentRoutes = require('./routes/payments');
app.use('/api/payments', paymentRoutes);

// Auth
app.get('/signup', (req, res) => res.render('signup', { title: 'Sign up', error: null }));
app.post('/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (q.findUserByEmail(email)) return res.render('signup', { error: 'Email already exists' });
  const id = q.createUser({ name, email, password });
  req.session.userId = id;
  res.redirect('/dashboard');
});

app.get('/login', (req, res) => res.render('login', { title: 'Log in', error: null }));
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = q.findUserByEmail(email);
  if (!user) return res.render('login', { error: 'Invalid credentials' });
  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) return res.render('login', { error: 'Invalid credentials' });
  req.session.userId = user.id;
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Dashboard with daily challenge + progress
// Auth gate
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) return res.redirect('/login');
  next();
}

app.get('/dashboard', requireAuth, (req, res) => {
  try {
    const user = q.findUserById(req.session.userId);
    if (!user) return res.redirect('/logout');

    const daily = (() => { try { return q.getDailyLesson(); } catch { return null; } })();
    const completed = (() => { try { return q.getCompletedIds(user.id); } catch { return []; } })();

    res.render('dashboard', {
      title: 'Your Dashboard',
      user,
      daily: daily || { id: null, title: 'No daily lesson available', items: [] },
      completed: Array.isArray(completed) ? completed : []
    });
  } catch (e) {
    console.error('Dashboard error:', e);
    if (req.accepts('html')) return res.status(500).send('Internal Server Error');
    res.status(500).json({ error: e.message });
  }
});

});

// Public lesson preview
app.get('/lesson/:id', (req, res) => {
  const lesson = q.getLesson(req.params.id);
  if (!lesson) return res.status(404).send('Not found');
  res.render('lesson', { lesson });
});

// Playground (requires auth)
app.get('/playground/:id', requireAuth, (req, res) => {
  const lesson = q.getLesson(req.params.id);
  if (!lesson) return res.status(404).send('Not found');
  const completed = q.getCompletedIds(req.session.userId).includes(lesson.id);
  res.render('playground', { lesson, ai_text: null, lastInput: '', completed });
});

app.get('/complete/:id', requireAuth, (req, res) => {
  const lesson = q.getLesson(req.params.id);
  if (!lesson) return res.status(404).send('Not found');
  q.markComplete(req.session.userId, lesson.id);
  res.redirect('/playground/' + lesson.id);
});

app.post('/api/run/:id', requireAuth, async (req, res) => {
  const lesson = q.getLesson(req.params.id);
  if (!lesson) return res.status(404).send('Not found');
  const userInput = req.body.user_input || '';
  if (!openai) return res.status(500).send('OpenAI not configured');
  const prompt = `${lesson.prompt_template}\n\n${userInput}`;
  try {
    const chat = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo-0125',
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });
    const ai_text = chat.choices?.[0]?.message?.content || '';
    const completed = q.getCompletedIds(req.session.userId).includes(lesson.id);
    res.render('playground', { lesson, ai_text, lastInput: userInput, completed });
  } catch (err) {
    console.error(err);
    const completed = q.getCompletedIds(req.session.userId).includes(lesson.id);
    res.render('playground', { lesson, ai_text: 'Error calling OpenAI: ' + err.message, lastInput: userInput, completed });
  }
});

// Library
app.get('/library', requireAuth, (req, res) => {
  res.render('library', { prompts: q.listPromptsByUser(req.session.userId) });
});
app.get('/library/save/:lessonId', requireAuth, (req, res) => {
  const lesson = q.getLesson(req.params.lessonId);
  if (!lesson) return res.status(404).send('Not found');
  const title = `From: ${lesson.title}`;
  q.savePrompt({ title, input_text: lesson.prompt_template, output_text: '', user_id: req.session.userId });
  res.redirect('/library');
});

// Challenge
app.get('/challenge', requireAuth, (req, res) => {
  const challenge = q.getActiveChallenge();
  res.render('challenge', { challenge, message: null });
});
app.post('/challenge', requireAuth, (req, res) => {
  const challenge = q.getActiveChallenge();
  q.createEntry({ challenge_id: challenge.id, content: req.body.content, user_id: req.session.userId });
  res.render('challenge', { challenge, message: 'Submitted!' });
});

// Settings / Stripe (optional)
app.get('/settings', requireAuth, (req, res) => {
  const success = req.query.success === 'true';
  if (success) q.updateUserPlan(req.session.userId, 'paid');
  res.render('settings', { message: success ? "You're upgraded!" : null });
});
app.post('/api/checkout', requireAuth, async (req, res) => {
  if (!stripe) return res.render('settings', { message: 'Stripe not configured.' });
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      success_url: `${req.protocol}://${req.get('host')}/settings?success=true`,
      cancel_url: `${req.protocol}://${req.get('host')}/settings?canceled=true`,
    });
    res.redirect(303, session.url);
  } catch (err) {
    console.error(err);
    res.render('settings', { message: 'Stripe error: ' + err.message });
  }
});


/* ---------- Prompt Library (Curated + My Library) ---------- */
app.get('/library', async (req, res) => {
  try {
    const curatedPath = path.join(__dirname, 'public', 'data', 'prompts-smb-marketing.json');
    let curated = [];
    try { curated = JSON.parse(await fs.promises.readFile(curatedPath, 'utf-8')); } catch (e) { curated = []; }
    // TODO: replace with real DB prompts; fallback to session storage
    const mine = Array.isArray(req.session?.myPrompts) ? req.session.myPrompts : [];
    res.render('library', { title: 'Prompt Library', curated, mine });
  } catch (err) {
    console.error('Library route error:', err);
    res.status(500).send('Library temporarily unavailable');
  }
});


/* ---------- Global error handler ---------- */
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.accepts('html')) return res.status(500).send('Internal Server Error');
  res.status(500).json({ error: err.message });
});

/* ---------- Branded 404 fallback ---------- */
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
      if (err) res.status(404).send('404 — Not Found');
    });
  }
  res.status(404).json({ error: 'Not Found' });
});

/* ---------- Start ---------- */
app.listen(PORT, () => console.log('PromptCademy running on http://localhost:' + PORT));
