// src/server.js — CLEAN ESM VERSION for Render
// --------------------------------------------------
import 'dotenv/config';
import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import expressLayouts from 'express-ejs-layouts';
import cors from 'cors';

// IMPORTANT: routes folder is one level UP from /src
import coachRoutes from '../routes/coach.js';
import paymentRoutes from '../routes/payments.js';

// Local DB helpers (already ESM in your repo)
import db, { q, seed } from './db.js';

// --------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';

// Trust proxy (Render)
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

// Sessions (MemoryStore is fine for MVP; not for prod scale)
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: PROD,     // true on Render (https)
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    }
  })
);

// Make req visible to EJS (avoids template crashes)
app.use((req, res, next) => { res.locals.req = req; next(); });

// Static
app.use(
  express.static(path.join(__dirname, 'public'), {
    extensions: ['html'],
    maxAge: PROD ? '1d' : 0,
    setHeaders: (res) => res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate')
  })
);

// Seed if requested
if (process.env.SEED_ON_BOOT === 'true') {
  try { seed(); } catch (e) { console.error('Seed error:', e); }
}

// ---------- Helpers ----------
const requireAuth = (req, res, next) => {
  if (!req.session?.userId) return res.redirect('/login');
  next();
};

// ---------- Debug ----------
app.get('/debug/state', (req, res) => {
  try {
    const daily = q.getDailyLesson();
    res.json({ ok: true, dailyLessonId: daily?.id ?? null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ---------- Core routes ----------
app.get('/', (req, res) => res.render('index', { title: 'PromptCademy' }));

// Auth
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

app.get('/login',  (req, res) => res.render('login',  { title: 'Log in', error: null }));
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

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// Dashboard (SAFE even if no lessons)
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
    res.status(500).send('Internal Server Error');
  }
});

// Mount API routes
app.use('/api/coach',    coachRoutes);
app.use('/api/payments', paymentRoutes);

// ---------- Global error handler ----------
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  if (req.accepts('html')) return res.status(500).send('Internal Server Error');
  res.status(500).json({ error: err.message });
});

// ---------- 404 ----------
app.use((req, res) => {
  if (req.accepts('html')) {
    return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'), (err) => {
      if (err) res.status(404).send('404 — Not Found');
    });
  }
  res.status(404).json({ error: 'Not Found' });
});

// ---------- Start ----------
app.listen(PORT, () => {
  console.log('PromptCademy running on http://localhost:' + PORT);
});
