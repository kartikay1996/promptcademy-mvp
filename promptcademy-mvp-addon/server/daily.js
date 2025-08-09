const dayKey = 'current_day';
const lessonKey = 'current_lesson_id';

function todayStrToronto() {
  const now = new Date();
  const tzOffsetMin = now.getTimezoneOffset();
  const local = new Date(now.getTime() - tzOffsetMin * 60 * 1000);
  return local.toISOString().slice(0, 10);
}

async function getAppState(db, key) {
  const row = await db.get('SELECT value FROM app_state WHERE key=?', [key]);
  return row?.value ?? null;
}
async function setAppState(db, key, value) {
  await db.run(
    'INSERT INTO app_state(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
    [key, String(value)]
  );
}

async function nextActiveLessonId(db, currentId) {
  const total = await db.get('SELECT COUNT(*) AS c FROM lessons WHERE is_active=1');
  if (!total?.c) throw new Error('No active lessons seeded.');
  const next = await db.get(
    `SELECT id FROM lessons WHERE is_active=1 AND id > ? ORDER BY id ASC LIMIT 1`,
    [Number(currentId || 0)]
  );
  if (next?.id) return next.id;
  const first = await db.get(`SELECT id FROM lessons WHERE is_active=1 ORDER BY id ASC LIMIT 1`);
  return first.id;
}

async function getTodayLesson(db) {
  const storedDay = await getAppState(db, dayKey);
  const storedLesson = await getAppState(db, lessonKey);
  const now = todayStrToronto();

  if (storedDay !== now) {
    const nid = await nextActiveLessonId(db, storedLesson);
    await setAppState(db, lessonKey, nid);
    await setAppState(db, dayKey, now);
  }

  const id = await getAppState(db, lessonKey);
  return db.get('SELECT id, title, track, content FROM lessons WHERE id=?', [id]);
}

module.exports = { getTodayLesson };
