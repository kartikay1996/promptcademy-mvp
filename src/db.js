import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

const DATA_DIR = path.resolve('./src/data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'data.sqlite'));

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    plan TEXT DEFAULT 'trial'
  );
  CREATE TABLE IF NOT EXISTS lessons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    summary TEXT,
    prompt_template TEXT,
    category TEXT,
    ord INTEGER
  );
  CREATE TABLE IF NOT EXISTS prompts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    input_text TEXT,
    output_text TEXT,
    user_id INTEGER,
    created_at TEXT
  );
  CREATE TABLE IF NOT EXISTS challenges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    slug TEXT,
    description TEXT,
    deadline TEXT,
    is_active INTEGER
  );
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenge_id INTEGER,
    content TEXT,
    user_id INTEGER,
    created_at TEXT
  );
  /* NEW: progress tracking */
  CREATE TABLE IF NOT EXISTS user_progress (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    lesson_id INTEGER,
    completed_at TEXT,
    UNIQUE(user_id, lesson_id)
  );
  /* NEW: daily challenge state */
  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT, price_id TEXT, price_usd REAL
  );
`);

export function seed() {
  const lessons = JSON.parse(fs.readFileSync(path.resolve('./src/data/lessons.json'),'utf-8'));
  const challenge = JSON.parse(fs.readFileSync(path.resolve('./src/data/challenge.json'),'utf-8'));
  const product = JSON.parse(fs.readFileSync(path.resolve('./src/data/product.json'),'utf-8'));

  const count = db.prepare('SELECT COUNT(*) as c FROM lessons').get().c;
  if (count === 0) {
    const stmt = db.prepare('INSERT INTO lessons (title, summary, prompt_template, category, ord) VALUES (?,?,?,?,?)');
    lessons.forEach((l,i)=> stmt.run(l.title, l.summary, l.prompt_template, l.category||'General', l.order||i+1));
    db.prepare('INSERT INTO challenges (title, slug, description, deadline, is_active) VALUES (?,?,?,?,?)')
      .run(challenge.title, challenge.slug, challenge.description, challenge.deadline, 1);
    db.prepare('INSERT INTO products (name, price_id, price_usd) VALUES (?,?,?)')
      .run(product.name, product.price_id, product.price_usd);
  }
}

export const q = {
  createUser({name,email,password}){
    const hash = bcrypt.hashSync(password,10);
    const info = db.prepare('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)')
      .run(name,email,hash);
    return info.lastInsertRowid;
  },
  findUserByEmail(email){ return db.prepare('SELECT * FROM users WHERE email=?').get(email); },
  findUserById(id){ return db.prepare('SELECT * FROM users WHERE id=?').get(id); },
  listLessons(){ return db.prepare('SELECT * FROM lessons ORDER BY ord ASC').all(); },
  listLessonsByCategory(cat){
    if (!cat || cat==='All') return q.listLessons();
    return db.prepare('SELECT * FROM lessons WHERE category=? ORDER BY ord ASC').all(cat);
  },
  getLesson(id){ return db.prepare('SELECT * FROM lessons WHERE id=?').get(id); },
  listPromptsByUser(user_id){ return db.prepare('SELECT * FROM prompts WHERE user_id=? ORDER BY id DESC').all(user_id); },
  savePrompt({title,input_text,output_text,user_id}){
    return db.prepare('INSERT INTO prompts (title,input_text,output_text,user_id,created_at) VALUES (?,?,?,?,datetime("now"))')
      .run(title,input_text,output_text,user_id).lastInsertRowid;
  },
  getActiveChallenge(){ return db.prepare('SELECT * FROM challenges WHERE is_active=1 LIMIT 1').get(); },
  createEntry({challenge_id,content,user_id}){
    return db.prepare('INSERT INTO entries (challenge_id,content,user_id,created_at) VALUES (?,?,?,datetime("now"))')
      .run(challenge_id,content,user_id);
  },
  updateUserPlan(user_id, plan){ return db.prepare('UPDATE users SET plan=? WHERE id=?').run(plan,user_id); },

  /* Progress */
  markComplete(user_id, lesson_id){
    db.prepare('INSERT OR IGNORE INTO user_progress (user_id, lesson_id, completed_at) VALUES (?,?,datetime("now"))')
      .run(user_id, lesson_id);
  },
  getCompletedIds(user_id){
    return db.prepare('SELECT lesson_id FROM user_progress WHERE user_id=?').all(user_id).map(r=>r.lesson_id);
  },

  /* Daily challenge (rotates every 24h) */
  getDailyLesson(){
    const todayKey = new Date().toISOString().slice(0,10);
    const state = db.prepare('SELECT value FROM app_state WHERE key=?').get('daily');
    let stored = state ? JSON.parse(state.value) : null;
    if (stored && stored.date === todayKey){
      return q.getLesson(stored.lesson_id);
    }
    // pick a random lesson different from yesterday
    const lessons = q.listLessons();
    let lesson = lessons[Math.floor(Math.random()*lessons.length)];
    if (stored && lessons.length>1 && lesson.id===stored.lesson_id){
      // pick another
      lesson = lessons[(lessons.indexOf(lesson)+1) % lessons.length];
    }
    const payload = JSON.stringify({ date: todayKey, lesson_id: lesson.id });
    db.prepare("INSERT INTO app_state(key, value) VALUES('daily', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value")
  .run(payload);
    return lesson;
  }
};

export default db;
