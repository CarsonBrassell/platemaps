import fs from "node:fs";
import path from "node:path";

const DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const SESSIONS_FILE = path.join(DATA_DIR, "sessions.json");
const POSTS_FILE = path.join(DATA_DIR, "posts.json");

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  points: number;
  monthlyPoints: number;
  monthlyPointsMonth: string;
  avatarUrl?: string;
};

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function addPoints(user: User, amount: number) {
  const monthKey = currentMonthKey();
  if (user.monthlyPointsMonth !== monthKey) {
    user.monthlyPointsMonth = monthKey;
    user.monthlyPoints = 0;
  }
  user.points += amount;
  user.monthlyPoints += amount;
}

export function effectiveMonthlyPoints(user: User): number {
  return user.monthlyPointsMonth === currentMonthKey() ? user.monthlyPoints : 0;
}

export type Comment = {
  id: string;
  userId: string;
  authorName: string;
  text: string;
  createdAt: string;
};

export type Post = {
  id: string;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  restaurant?: string;
  createdAt: string;
  likedBy: string[];
  likePointsAwardedTo: string[];
  savedBy: string[];
  comments: Comment[];
};

function readJson<T>(file: string, initial: T): T {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(initial));
  return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
}

function writeJson(file: string, data: unknown) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export function getUsers(): User[] {
  return readJson<User[]>(USERS_FILE, []);
}

export function saveUsers(users: User[]) {
  writeJson(USERS_FILE, users);
}

export function getSessions(): Record<string, string> {
  return readJson<Record<string, string>>(SESSIONS_FILE, {});
}

export function saveSessions(sessions: Record<string, string>) {
  writeJson(SESSIONS_FILE, sessions);
}

export function getPosts(): Post[] {
  return readJson<Post[]>(POSTS_FILE, []);
}

export function savePosts(posts: Post[]) {
  writeJson(POSTS_FILE, posts);
}
