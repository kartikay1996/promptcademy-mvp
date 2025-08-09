// src/db.js — temporary stub so deploy works without SQLite

export const q = {
  listLessons: () => [],
  listLessonsByCategory: (_cat) => [],
  getLesson: (_id) => null,
  getDailyLesson: () => null,
  getCompletedIds: (_userId) => [],
  findUserById: (_id) => null,
  findUserByEmail: (_email) => null,
  createUser: ({ name, email, password }) => Date.now(), // pretend user id
  markComplete: (_userId, _lessonId) => {},
  listPromptsByUser: (_userId) => [],
  savePrompt: (_p) => {},
  getActiveChallenge: () => ({ id: 1, title: 'Demo Challenge' }),
  createEntry: (_e) => {},
  updateUserPlan: (_userId, _plan) => {},
};

export const seed = () => {};   // no-op for now

const db = {};                  // default export (not used yet)
export default db;
