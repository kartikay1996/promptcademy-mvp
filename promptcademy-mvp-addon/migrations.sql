-- PromptCademy MVP migration
PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS lessons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  track TEXT CHECK(track IN ('marketing','hr','finance','general')) DEFAULT 'general',
  content TEXT NOT NULL,
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  pw_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER NOT NULL,
  lesson_id INTEGER NOT NULL,
  status TEXT CHECK(status IN ('started','completed')) NOT NULL,
  completed_at TEXT,
  PRIMARY KEY (user_id, lesson_id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(lesson_id) REFERENCES lessons(id)
);
