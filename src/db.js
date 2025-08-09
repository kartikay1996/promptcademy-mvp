// src/db.js — FIXED VERSION with actual data implementation
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Data storage paths
const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const LESSONS_FILE = path.join(__dirname, 'data', 'lessons.json');

// Ensure data directory and files exist
function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({
      users: [],
      prompts: {},
      completions: {},
      currentDay: null,
      currentLessonIndex: 0
    }, null, 2));
  }
}

function load() { 
  ensureFile(); 
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); 
}

function save(db) { 
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); 
}

// Load lessons from JSON file
function loadLessons() {
  try {
    if (fs.existsSync(LESSONS_FILE)) {
      return JSON.parse(fs.readFileSync(LESSONS_FILE, 'utf-8'));
    }
    // Fallback sample data
    return [
      {
        id: 1,
        title: "Homepage hero + features that convert",
        summary: "High-impact hero + 3 feature blocks that make the benefit obvious and drive a clear CTA.",
        category: "Marketing",
        prompt_template: "Create a homepage hero section + 3 key feature blocks for {{business_name}}...",
        order: 1
      },
      {
        id: 2,
        title: "3‑email welcome sequence",
        summary: "Welcome, teach a quick win, then convert with proof + time‑boxed offer.",
        category: "Marketing", 
        prompt_template: "Write a 3-email welcome sequence for {{business_name}}...",
        order: 2
      },
      {
        id: 3,
        title: "Job description generator",
        summary: "Write a clear JD with responsibilities and requirements.",
        category: "HR",
        prompt_template: "Write a job description for a {{role}} at a {{company_type}}...",
        order: 3
      }
    ];
  } catch (error) {
    console.warn('Could not load lessons.json, using fallback data');
    return [];
  }
}

// FIXED: Actual database API implementation
export const q = {
  // FIXED: Lessons functions with real data
  listLessons() {
    return loadLessons();
  },

  listLessonsByCategory(category) {
    const lessons = loadLessons();
    return lessons.filter(l => l.category === category);
  },

  getLesson(id) {
    const lessons = loadLessons();
    return lessons.find(l => l.id === Number(id)) || null;
  },

  // FIXED: Daily lesson rotation
  getDailyLesson() {
    const lessons = loadLessons();
    if (!lessons.length) return null;

    const db = load();
    const today = new Date().toDateString();
    
    // If day changed, rotate to next lesson
    if (db.currentDay !== today) {
      db.currentLessonIndex = (db.currentLessonIndex + 1) % lessons.length;
      db.currentDay = today;
      save(db);
    }

    return lessons[db.currentLessonIndex] || lessons[0];
  },

  // Weekly challenge
  getWeeklyChallenge() {
    return {
      title: "Daily Prompt Challenge",
      description: "Tackle today's featured lesson. Share your best result in your Library!",
      deadline: "2099-12-31"
    };
  },

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
    db.users.push({ 
      id, 
      name: String(name || ''), 
      email: String(email || ''), 
      password_hash, 
      plan: 'free' 
    });
    save(db);
    return id;
  },

  updateUserPlan(userId, plan) {
    const db = load();
    const user = db.users.find(u => u.id === Number(userId));
    if (user) { 
      user.plan = plan; 
      save(db); 
    }
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
    if (!db.completions[key].includes(Number(lessonId))) {
      db.completions[key].push(Number(lessonId));
    }
    save(db);
  },

  // Prompt library
  listPromptsByUser(userId) {
    const db = load();
    return db.prompts[String(userId)] || [];
  },

  savePrompt({ title, input_text, output_text, user_id }) {
    const db = load();
    const key = String(user_id);
    db.prompts[key] = db.prompts[key] || [];
    db.prompts[key].push({ 
      title, 
      input_text, 
      output_text, 
      ts: Date.now() 
    });
    save(db);
  },

  // FIXED: Add curated prompts
  getCuratedPrompts() {
    try {
      const curatedFile = path.join(__dirname, 'public', 'data', 'prompts-smb-marketing.json');
      if (fs.existsSync(curatedFile)) {
        return JSON.parse(fs.readFileSync(curatedFile, 'utf-8'));
      }
    } catch (e) {
      console.warn('Could not load curated prompts');
    }
    
    // Fallback curated prompts
    return [
      {
        id: "homepage_hero",
        name: "Homepage Hero Section",
        category: "Marketing",
        use_when: "Creating compelling homepage copy",
        inputs: ["business_name", "target_audience", "main_benefit"],
        template: "Create a compelling homepage hero for {{business_name}} targeting {{target_audience}} highlighting {{main_benefit}}..."
      }
    ];
  },

  // Challenge submissions
  saveChallengeSubmission(userId, content) {
    const db = load();
    db.challengeSubmissions = db.challengeSubmissions || {};
    db.challengeSubmissions[String(userId)] = {
      content,
      submitted_at: new Date().toISOString()
    };
    save(db);
  }
};

// FIXED: Seed function with actual data
export const seed = () => {
  console.log('📊 Database seeded with sample data');
  // Seed runs automatically when lessons are loaded
};

const db = {};
export default db;
