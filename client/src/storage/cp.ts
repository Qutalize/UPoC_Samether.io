const DAILY_DIST_KEY = "samether_daily_dist";
const DAILY_DATE_KEY = "samether_daily_date";

function getTodayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function loadDailyDistance(): number {
  if (localStorage.getItem(DAILY_DATE_KEY) !== getTodayStr()) return 0;
  const raw = localStorage.getItem(DAILY_DIST_KEY);
  const n = raw != null ? parseFloat(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function addDailyDistance(meters: number): number {
  const today = getTodayStr();
  const current = loadDailyDistance();
  const next = current + Math.max(0, meters);
  localStorage.setItem(DAILY_DATE_KEY, today);
  localStorage.setItem(DAILY_DIST_KEY, String(next));
  return next;
}

export function calcMaxCp(distanceM: number): number {
  if (distanceM >= 3000) return 100;
  if (distanceM >= 2000) return 80;
  if (distanceM >= 1000) return 50;
  if (distanceM >= 501) return 30;
  if (distanceM >= 201) return 20;
  return 10;
}
