import { firebaseConfig } from "./firebase-config.js?v=4";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, query, orderBy, where, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const enabled = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR");
let db;
if (enabled) db = getFirestore(initializeApp(firebaseConfig));

// Mã tuần ISO, vd "2026-W43"
export function weekId(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

// Hồ sơ người chơi nằm ở players/{tên tài khoản viết thường}
export async function fetchMe(acc) {
  if (!enabled) return null;
  const s = await getDoc(doc(db, "players", acc));
  return s.exists() ? s.data() : null;
}

export async function submitScore(acc, name, score, { countPlay = true } = {}) {
  if (!enabled) return null;
  const prev = await fetchMe(acc);
  const wk = weekId();
  const best = Math.max(score, prev?.bestScore || 0);
  const weekScore = prev && prev.weekId === wk ? Math.max(prev.weekScore || 0, score) : score;
  const data = {
    name: String(name).slice(0, 20),
    bestScore: best,
    weekId: wk,
    weekScore: Math.min(weekScore, best),
    plays: (prev?.plays || 0) + (countPlay ? 1 : 0),
    updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, "players", acc), data);
  return data;
}

export async function topScores(kind = "all", n = 20) {
  if (!enabled) return [];
  const col = collection(db, "players");
  const q = kind === "week"
    ? query(col, where("weekId", "==", weekId()), orderBy("weekScore", "desc"), limit(n))
    : query(col, orderBy("bestScore", "desc"), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, name: d.data().name, score: kind === "week" ? d.data().weekScore : d.data().bestScore }));
}
