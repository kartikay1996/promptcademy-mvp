const express = require('express');
const { getTodayLesson } = require('./daily');

module.exports = (db) => {
  const router = express.Router();

  router.get('/lesson/today', async (req, res) => {
    try {
      const lesson = await getTodayLesson(db);
      res.json({ ok: true, lesson });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.post('/progress', async (req, res) => {
    try {
      const userId = req.user?.id ?? 1;
      const { lessonId, status } = req.body;
      const now = new Date().toISOString();

      await db.run(
        `INSERT INTO progress(user_id, lesson_id, status, completed_at)
         VALUES(?,?,?, CASE WHEN ?='completed' THEN ? ELSE NULL END)
         ON CONFLICT(user_id, lesson_id) DO UPDATE SET
           status=excluded.status,
           completed_at=CASE WHEN excluded.status='completed' THEN excluded.completed_at ELSE progress.completed_at END`,
        [userId, lessonId, status, status, now]
      );

      const summary = await db.get(
        `SELECT
           SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed,
           COUNT(*) AS total
         FROM progress WHERE user_id=?`, [userId]
      );

      res.json({ ok: true, summary });
    } catch (e) {
      console.error(e);
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.get('/progress/summary', async (req, res) => {
    try {
      const userId = req.user?.id ?? 1;
      const rows = await db.all(
        `SELECT p.lesson_id, p.status, p.completed_at, l.title, l.track
         FROM progress p JOIN lessons l ON l.id=p.lesson_id
         WHERE p.user_id=? ORDER BY p.completed_at DESC NULLS LAST, p.lesson_id DESC`,
        [userId]
      );
      res.json({ ok: true, items: rows });
    } catch (e) {
      res.status(500).json({ ok: false, error: e.message });
    }
  });

  router.post('/rotate', async (req, res) => {
    try {
      await db.run(
        `INSERT INTO app_state(key,value) VALUES(?,?)
         ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        ['current_day', '1900-01-01']
      );
      const lesson = await getTodayLesson(db);
      res.json({ ok: true, forced: true, lesson });
    } catch (e) {
      res.status(500).json({ ok:false, error:e.message });
    }
  });

  return router;
};
