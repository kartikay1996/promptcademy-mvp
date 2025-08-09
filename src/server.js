// server.js — PromptCademy (ESM)
// Enhancements: clean static URLs, caching, compression, trust proxy, branded 404 fallback

import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import Stripe from 'stripe';
import OpenAI from 'openai';
import expressLayouts from 'express-ejs-layouts';
import compression from 'compression';

import db, { q, seed } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1); // Render/any proxy

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
const PORT = process.env.PORT || 3000;
const SEED_ON_BOOT = process.env.SEED_ON_BOOT === 'true';
if (SEED_ON_BOOT) seed();

// View engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

// Core middleware
app.use(compression()); // gzip
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static with clean URLs and caching
app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'], // /path -> /path.html or /path/index.html
    maxAge: '7d',
    setHeaders: (res, filePath) => {
      // Don’t cache HTML; cache assets
      if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  })
);

// Sessions
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
  })
);

// Auth helpers
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.redirect('/login');
  next();
}
function setUser(req, res, next) {
  res.locals.user = req.session.userId ? q.findUserById(req.session.userId) : null;
  next();
}
app.use(setUser);

// --- Diagnostics ---
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

// --- Routes ---
// Landing
app.get('/', (req, res) => res.render('index', { title: 'PromptCademy' }));

// Optional: redirect /index -> /
app.get('/index', (req, res) => res.redirect('/'));

// Catalog (public) with category filter
app.get('/catalog', (req, res) => {
  const cat = req.query.cat || 'All';
  const lessons = q.listLessonsByCategory(cat);
  res.render('catalog', { lessons, activeCat: cat });
});

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
app.get('/dashboard', requireAuth, (req, res) => {
  const cat = req.query.cat || 'All';
  const lessons = q.listLessonsByCategory(cat);
  const completedIds = q.getCompletedIds(req.session.userId);
  const totalCount = q.listLessons().length;
  const completedCount = completedIds.length;
  const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;
  const daily = q.getDailyLesson();
  res.render('dashboard', { lessons, activeCat: cat, completedIds, totalCount, completedCount, progressPct, daily });
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

// ---- Branded 404 fallback (after all routes) ----
app.use((req, res) => {
  if (req.accepts('html')) {
    // Try rendering EJS 404 if you add `views/404.ejs`
    try {
      return res.status(404).render('404', { title: 'Not Found' });
    } catch (e) {
      // Else serve static public/404.html if present
      const fallback = path.join(__dirname, 'public', '404.html');
      return res.sendFile(fallback, (err) => {
        if (err) res.status(404).send('404 — Not Found');
      });
    }
  }
  res.status(404).json({ error: 'Not Found' });
});

// Start server
app.listen(PORT, () => console.log('PromptCademy running on http://localhost:' + PORT));
