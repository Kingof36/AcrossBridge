import { firebaseConfig } from "./firebase-config.js?v=4";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, collection, query, orderBy, where, limit, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

export const enabled = !!firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR");
let auth, db;
if (enabled) {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
}

export function onUser(cb) {
  if (!enabled) { cb(null); return; }
  onAuthStateChanged(auth, cb);
}
export const currentUser = () => (enabled ? auth.currentUser : null);

// Đăng nhập bằng "tên + mật khẩu": Firebase cần email nên tên được đổi thành email nội bộ (không gửi thư).
const toEmail = n => `${n.toLowerCase()}@daibang.game`;
export const loginUser = (name, pass) => signInWithEmailAndPassword(auth, toEmail(name), pass);
export async function registerUser(name, pass) {
  const cred = await createUserWithEmailAndPassword(auth, toEmail(name), pass);
  await updateProfile(cred.user, { displayName: name });
  return cred;
}
export const logout = () => signOut(auth);

// Mã tuần ISO, vd "2026-W43"
export function weekId(d = new Date()) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t - Date.UTC(y, 0, 1)) / 864e5 + 1) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

const userRef = () => doc(db, "users", auth.currentUser.uid);

export async function fetchMe() {
  if (!enabled || !auth.currentUser) return null;
  const s = await getDoc(userRef());
  return s.exists() ? s.data() : null;
}

// Gửi điểm của 1 lượt chơi (chỉ ghi nếu là tài khoản đã đăng nhập)
export async function submitScore(score, { countPlay = true } = {}) {
  if (!enabled || !auth.currentUser) return null;
  const u = auth.currentUser;
  const prev = await fetchMe();
  const wk = weekId();
  const best = Math.max(score, prev?.bestScore || 0);
  const weekScore = prev && prev.weekId === wk ? Math.max(prev.weekScore || 0, score) : score;
  const data = {
    name: (u.displayName || (u.email || "Player").split("@")[0]).slice(0, 20),
    photo: u.photoURL || null,
    bestScore: best,
    weekId: wk,
    weekScore: Math.min(weekScore, best),
    plays: (prev?.plays || 0) + (countPlay ? 1 : 0),
    updatedAt: serverTimestamp()
  };
  await setDoc(userRef(), data);
  return data;
}

export async function topScores(kind = "all", n = 20) {
  if (!enabled) return [];
  const col = collection(db, "users");
  const q = kind === "week"
    ? query(col, where("weekId", "==", weekId()), orderBy("weekScore", "desc"), limit(n))
    : query(col, orderBy("bestScore", "desc"), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ uid: d.id, name: d.data().name, score: kind === "week" ? d.data().weekScore : d.data().bestScore }));
}
