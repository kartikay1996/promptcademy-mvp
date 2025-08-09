// Seed a few example lessons
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

(async () => {
  const db = await open({ filename: 'app.db', driver: sqlite3.Database });

  await db.exec(`INSERT INTO lessons(title,track,content,is_active) VALUES
    ('Prompting 101: Roles & Constraints','general','Write a role, goal, constraints, and steps.',1),
    ('Marketing: 5 Ad Variants Fast','marketing','Generate 5 paid ad variants using a brand voice.',1),
    ('HR: Structured Interview Rubric','hr','Create a rubric with 4 competencies and behavior questions.',1),
    ('Finance: Cashflow Summary','finance','Summarize last 30 days transactions into 5 insights.',1)
  `);

  console.log('Seeded lessons');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
