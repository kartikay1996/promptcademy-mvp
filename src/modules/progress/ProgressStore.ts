
// src/modules/progress/ProgressStore.ts
export type Badge = { id: string; label: string; earnedAt: string };
export type Progress = {
  xp: number;
  streak: number;
  lastCheckIn: string | null;
  badges: Badge[];
};

const KEY = "pc_progress_v1";

export function loadProgress(): Progress {
  if (typeof window === "undefined") return { xp:0, streak:0, lastCheckIn:null, badges: [] };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : { xp:0, streak:0, lastCheckIn:null, badges: [] };
  } catch {
    return { xp:0, streak:0, lastCheckIn:null, badges: [] };
  }
}

export function saveProgress(p: Progress) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(p));
}

export function addXP(amount: number) {
  const p = loadProgress();
  p.xp += amount;
  saveProgress(p);
  return p;
}

export function checkInToday() {
  const p = loadProgress();
  const today = new Date().toDateString();
  if (p.lastCheckIn === today) return p;
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  p.streak = (p.lastCheckIn === yesterday) ? p.streak + 1 : 1;
  p.lastCheckIn = today;
  saveProgress(p);
  return p;
}

export function awardBadge(id: string, label: string) {
  const p = loadProgress();
  if (!p.badges.find(b => b.id === id)) {
    p.badges.push({ id, label, earnedAt: new Date().toISOString() });
    saveProgress(p);
  }
  return p;
}
