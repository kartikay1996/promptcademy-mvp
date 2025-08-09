// src/server.js — FIXED VERSION
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import expressLayouts from 'express-ejs-layouts';
import cors from 'cors';

// FIXED: Correct import paths
import coachRoutes from '../routes/coach.js';
import paymentRoutes from '../routes/payments.js';

// local JSON DB helpers
import db, { q, seed } from './db.js';

const BUILD_ID = 'FIXED-2025-08-09-01';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';

// FIXED: Environment validation
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required');
  process.exit(1);
}

// Trust proxy
app.set('trust proxy', 1);

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

// Core middleware
app.use(cors({
  origin: [
    'https://promptcademy-mvp.onrender.com',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ],
  credentials: true
}));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Sessions
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: PROD,
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

// FIXED: User middleware
app.use((req, res, next) => {
  res.locals.req = req;
  res.locals.user = req.session?.userId ? q.findUserById(req.session.userId) : null;
  next();
});

// Static files
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'],
  maxAge: PROD ? '1d' : 0
}));

// Optional seed
if (process.env.SEED_ON_BOOT === 'true') {
  try { seed(); } catch (e) { console.error('Seed error:', e); }
}

// Helper
const requireAuth = (req, res, next) => {
  if (!req.session?.userId) return res.redirect('/login');
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, build: BUILD_ID, env: process.env.NODE_ENV });
});

// ===== CORE ROUTES =====

// Home
app.get('/', (req, res) => res.render('index', { title: 'PromptCademy' }));

// Auth routes
app.get('/signup', (req, res) => res.render('signup', { title: 'Sign up', error: null }));
app.post('/signup', (req, res) => {
  try {
    const { name, email, password } = req.body || {};
    if (!email || !password) return res.render('signup', { error: 'Email and password required' });
    if (q.findUserByEmail(email)) return res.render('signup', { error: 'Email already exists' });
    const id = q.createUser({ name, email, password });
    req.session.userId = id;
    res.redirect('/dashboard');
  } catch (e) {
    console.error('Signup error:', e);
    res.status(500).render('signup', { error: 'Unable to create account' });
  }
});

app.get('/login', (req, res) => res.render('login', { title: 'Log in', error: null }));
app.post('/login', (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = q.findUserByEmail(email);
    if (!user) return res.render('login', { error: 'Invalid credentials' });
    const ok = bcrypt.compareSync(String(password || ''), user.password_hash);
    if (!ok) return res.render('login', { error: 'Invalid credentials' });
    req.session.userId = user.id;
    res.redirect('/dashboard');
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).render('login', { error: 'Unable to log in' });
  }
});

app.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/')));

// FIXED: Dashboard route
app.get('/dashboard', requireAuth, (req, res) => {
  try {
    const user = q.findUserById(req.session.userId);
    if (!user) return res.redirect('/logout');

    const daily = q.getDailyLesson() || { id: null, title: 'No daily lesson available' };
    const lessons = q.listLessons();
    const completedIds = q.getCompletedIds(user.id);

    const totalCount = lessons.length;
    const completedCount = completedIds.length;
    const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

    res.render('dashboard', {
      title: 'Dashboard',
      user,
      daily,
      lessons,
      completedIds,
      totalCount,
      completedCount,
      progressPct
    });
  } catch (e) {
    console.error('Dashboard error:', e);
    res.status(500).send('Internal Server Error');
  }
});

// FIXED: Add missing routes
app.get('/catalog', (req, res) => {
  const category = req.query.cat || 'All';
  const lessons = category === 'All' ? q.listLessons() : q.listLessonsByCategory(category);
  res.render('catalog', { 
    title: 'Lessons Catalog',
    lessons,
    activeCat: category
  });
});

app.get('/lesson/:id', (req, res) => {
  const lesson = q.getLesson(req.params.id);
  if (!lesson) return res.status(404).send('Lesson not found');
  res.render('lesson', { 
    title: lesson.title,
    lesson
  });
});

app.get('/playground/:id?', requireAuth, (req, res) => {
  const lessonId = req.params.id;
  const lesson = lessonId ? q.getLesson(lessonId) : q.getDailyLesson();
  if (!lesson) return res.status(404).send('Lesson not found');
  
  const completedIds = q.getCompletedIds(req.session.userId);
  const completed = completedIds.includes(lesson.id);
  
  res.render('playground', {
    title: `Playground - ${lesson.title}`,
    lesson,
    completed,
    lastInput: '',
    ai_text: ''
  });
});

app.get('/challenge', (req, res) => {
  const challenge = q.getWeeklyChallenge();
  res.render('challenge', {
    title: 'Weekly Challenge',
    challenge: challenge || { title: 'No challenge available', description: 'Check back soon!' },
    message: null
  });
});

app.post('/challenge', requireAuth, (req, res) => {
  const { content } = req.body;
  if (content) {
    // Save challenge submission
    q.saveChallengeSubmission(req.session.userId, content);
  }
  res.redirect('/challenge?submitted=true');
});

app.get('/library', requireAuth, (req, res) => {
  const curated = q.getCuratedPrompts();
  const mine = q.listPromptsByUser(req.session.userId);
  res.render('library', {
    title: 'Prompt Library',
    curated,
    mine
  });
});

app.get('/settings', requireAuth, (req, res) => {
  const user = q.findUserById(req.session.userId);
  res.render('settings', {
    title: 'Settings',
    user,
    message: null
  });
});

app.post('/complete/:id', requireAuth, (req, res) => {
  q.markComplete(req.session.userId, req.params.id);
  res.redirect('/dashboard');
});

// API routes
app.use('/api/coach', coachRoutes);
app.use('/api/payments', paymentRoutes);

// FIXED: Add missing API endpoints
app.get('/api/lesson/today', (req, res) => {
  try {
    const lesson = q.getDailyLesson();
    res.json({ ok: true, lesson });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/progress/summary', requireAuth, (req, res) => {
  try {
    const completedIds = q.getCompletedIds(req.session.userId);
    const lessons = q.listLessons();
    const items = lessons.map(l => ({
      lesson_id: l.id,
      title: l.title,
      status: completedIds.includes(l.id) ? 'completed' : 'not_started',
      completed_at: completedIds.includes(l.id) ? new Date().toISOString() : null
    }));
    res.json({ ok: true, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/progress', requireAuth, (req, res) => {
  try {
    const { lessonId, status } = req.body;
    if (status === 'completed') {
      q.markComplete(req.session.userId, lessonId);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.accepts('html')) return res.status(500).send('Internal Server Error');
  res.status(500).json({ error: err.message });
});

// 404
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
      if (err) res.status(404).send('404 — Not Found');
    });
  }
  res.status(404).json({ error: 'Not Found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 PromptCademy running on http://localhost:${PORT}`);
  console.log(`📦 Build: ${BUILD_ID}`);
});
