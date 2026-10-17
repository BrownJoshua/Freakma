/* who is using this copy of Freakma: shown on comments and to collaborators */
const KEY = "freakma:user";
const COLORS = ["#E5484D", "#F76B15", "#FFB224", "#30A46C", "#12A594", "#0090FF", "#6E56CF", "#D6409F"];

export interface User {
  id: string;
  name: string;
  color: string;
}

let user: User | null = null;

export function getUser(): User {
  if (user) return user;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) user = JSON.parse(raw);
  } catch {}
  if (!user) {
    user = { id: Math.random().toString(36).slice(2, 10), name: "", color: COLORS[Math.floor(Math.random() * COLORS.length)] };
    saveUser(user);
  }
  return user;
}

export function saveUser(u: User) {
  user = u;
  try {
    localStorage.setItem(KEY, JSON.stringify(u));
  } catch {}
}

export const displayName = () => getUser().name || "Guest";
