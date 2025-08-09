// Temporary DB stub so the app runs without SQLite
export const db = {
  get: async () => null,
  all: async () => [],
  run: async () => ({ changes: 0 }),
};
export default db;
