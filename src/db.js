// src/db.js — lightweight JSON DB for PromptCademy (ESM)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// data folder next to src/
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE  = path.join(DATA_DIR, 'db.json');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: [],          // {id, name, email, password_hash, plan}
      prompts: {},        // userId -> [{title,input_text,output_text,ts}]
      completions: {},    // userId -> [lessonId,...]
    }, null, 2));
  }
}
function load()  { ensureFile(); return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); }
function save(db){ fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

// ---- q API used by server.js ----
export const q = {
  // Lessons (still stubbed — you can wire real content later)
  listLessons: () => [],
  listLessonsByCategory: (_cat) => [],
  getLesson: (_id) => null,
  getDailyLesson: () => null,

  // Users
  findUserByEmail(email) {
    const db = load();
    return db.users.find(u => u.email.toLowerCase() === String(email).toLowerCase()) || null;
  },
  findUserById(id) {
    const db = load();
    return db.users.find(u => u.id === Number(id)) || null;
  },
  createUser({ name, email, password }) {
    const db = load();
    if (db.users.some(u => u.email.toLowerCase() === String(email).toLowerCase())) {
      throw new Error('Email already exists');
    }
    const id = Date.now();
    const password_hash = bcrypt.hashSync(String(password || ''), 10);
    db.users.push({ id, name: String(name || ''), email: String(email || ''), password_hash, plan: 'free' });
    save(db);
    return id;
  },
  updateUserPlan(userId, plan) {
    const db = load();
    const u = db.users.find(x => x.id === Number(userId));
    if (u) { u.plan = plan; save(db); }
  },

  // Completions
  getCompletedIds(userId) {
    const db = load();
    return db.completions[String(userId)] || [];
  },
  markComplete(userId, lessonId) {
    const db = load();
    const key = String(userId);
    db.completions[key] = db.completions[key] || [];
    if (!db.completions[key].includes(lessonId)) db.completions[key].push(lessonId);
    save(db);
  },

  // Prompt library (per-user)
  listPromptsByUser(userId) {
    const db = load();
    return db.prompts[String(userId)] || [];
  },
  savePrompt({ title, input_text, output_text, user_id }) {
    const db = load();
    const key = String(user_id);
    db.prompts[key] = db.prompts[key] || [];
    db.prompts[key].push({ title, input_text, output_text, ts: Date.now() });
    save(db);
  },
};

export const seed = () => {}; // no-op
const db = {};                // default export (unused for now)
export default db;
