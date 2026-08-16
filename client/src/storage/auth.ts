const USERS_KEY = "samether_users";
const SESSION_KEY = "samether_session";

interface UserRecord {
  name: string;
  passwordHash: string;
}

async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function loadUsers(): UserRecord[] {
  const raw = localStorage.getItem(USERS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function saveUsers(users: UserRecord[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export async function register(
  name: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!name || !password) {
    return { ok: false, error: "名前とパスワードを入力してください" };
  }
  const users = loadUsers();
  if (users.some((u) => u.name === name)) {
    return { ok: false, error: "この名前は既に使用されています" };
  }
  const passwordHash = await hashPassword(password);
  users.push({ name, passwordHash });
  saveUsers(users);
  setSession(name);
  return { ok: true };
}

export async function login(
  name: string,
  password: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!name || !password) {
    return { ok: false, error: "名前とパスワードを入力してください" };
  }
  const users = loadUsers();
  const user = users.find((u) => u.name === name);
  if (!user) {
    return { ok: false, error: "ユーザーが見つかりません" };
  }
  const passwordHash = await hashPassword(password);
  if (user.passwordHash !== passwordHash) {
    return { ok: false, error: "パスワードが正しくありません" };
  }
  setSession(name);
  return { ok: true };
}

export function getSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

function setSession(name: string): void {
  localStorage.setItem(SESSION_KEY, name);
}

export function logout(): void {
  localStorage.removeItem(SESSION_KEY);
}
