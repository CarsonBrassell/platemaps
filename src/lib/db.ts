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
};

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
  text: string;
  restaurant?: string;
  createdAt: string;
  likedBy: string[];
  likePointsAwardedTo: string[];
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
