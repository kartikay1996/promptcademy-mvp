// src/server.js — ESM clean version
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
// import compression from 'compression';
import cors from 'cors';

// since this file lives in src/, routes are one level up
import coachRoutes from '../routes/coach.js';
import paymentRoutes from '../routes/payments.js';

// Import db module defensively
import * as dbmod from './db.js';
const q = dbmod.q ?? {
  listLessons: () => [], listLessonsByCategory: () => [],
  getLesson: () => null, getDailyLesson: () => null, getCompletedIds: () => [],
  findUserById: () => null, findUserByEmail: () => null,
  createUser: () => Date.now(), markComplete: () => {},
  listPromptsByUser: () => [], savePrompt: () => {},
  getActiveChallenge: () => ({ id: 1, title: 'Demo Challenge' }),
  createEntry: () => {}, updateUserPlan: () => {},
};
const seed = dbmod.seed ?? (() => {});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set('trust proxy', 1);

const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const SESSION_SECRET = process.env.SESSION_SECRET || 'dev-secret';
const PORT = process.env.PORT || 3000;
const SEED_ON_BOOT = process.env.SEED_ON_BOOT === 'true';
if (SEED_ON_BOOT) seed();

/* Views */
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

/* Core middleware */
// app.use(compression());
app.use(cors({
  origin: ['https://promptcademy-mvp.onrender.com','http://localhost:3000','http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Make req available to EJS
app.use((req, res, next) => { res.locals.req = req; next(); });

/* Static */
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
  },
}));
// serve modules JSON to the browser
app.use('/src/modules', express.static(path.join(__dirname, 'modules')));

/* Sessions */
app.use(session({ secret: SESSION_SECRET, resave: false, saveUninitialized: false }));

/* User in templates */
function requireAuth(req, res, next) { if (!req.session.userId) return res.redirect('/login'); next(); }
function setUser(req, res, next) { res.locals.user = req.session.userId ? q.findUserById(req.session.userId) : null; next(); }
app.use(setUser);

/* Health/debug */
app.get('/healthz', (req, res) => {
  try { res.json({ ok: true, lessons: q.listLessons().length, user: !!res.locals.user }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get('/debug/state', (req, res) => {
  try { const daily = q.getDailyLesson(); res.json({ ok: true, dailyLessonId: daily?.id ?? null }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.get('/debug/db-exports', (req,res)=>{ res.json({ keys: Object.keys(dbmod) }); });

/* API routes */
app.use('/api/coach', coachRoutes);
app.use('/api/payments', paymentRoutes);

/* App routes (kept simple) */
app.get('/', (req, res) => res.render('index', { title: 'PromptCademy' }));
app.get('/index', (req, res) => res.redirect('/'));
app.get('/catalog', (req, res) => {
  const cat = req.query.cat || 'All';
  const lessons = q.listLessonsByCategory(cat);
  res.render('catalog', { lessons, activeCat: cat });
});
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
app.get('/logout', (req, res) => { req.session.destroy(() => res.redirect('/')); });
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
app.get('/lesson/:id', (req, res) => {
  const lesson = q.getLesson(req.params.id);
  if (!lesson) return res.status(404).send('Not found');
  res.render('lesson', { lesson });
});
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

/* 404 */
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
      if (err) res.status(404).send('404 — Not Found');
    });
  }
  res.status(404).json({ error: 'Not Found' });
});

app.listen(PORT, () => console.log('PromptCademy running on http://localhost:' + PORT));
