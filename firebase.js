/* Firebase được nạp NỀN: nếu CDN bị chặn / mất mạng / cấu hình lỗi thì game vẫn chạy (chơi khách). */
const offline = async () => { throw new Error("Chưa kết nối được Firebase."); };
let fbFailed = false;
let FB = {
  enabled: false, onUser: cb => cb(null), currentUser: () => null,
  topScores: async () => [], submitScore: async () => null, fetchMe: async () => null,
  loginUser: offline, registerUser: offline, logout: async () => {}
};

/* ============ Hằng số & tiện ích ============ */
const W = 420, H = 700, GROUND = 470, STICK_W = 5, MAX_LEN = 340, GROW = 230, HERO_OFF = 18;
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const cv = $("c"), ctx = cv.getContext("2d");

const store = {
  get(k, d) { try { const v = localStorage.getItem("ib_" + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem("ib_" + k, JSON.stringify(v)); } catch {} }
};
let best = store.get("best", 0), plays = store.get("plays", 0), soundOn = store.get("sound", true);

function resize() {
  const r = window.devicePixelRatio || 1, b = cv.getBoundingClientRect();
  cv.width = Math.round(b.width * r); cv.height = Math.round(b.height * r);
}
addEventListener("resize", resize); resize();

/* ============ Âm thanh ============ */
let ac;
function beep(f, d = 0.08, type = "sine", v = 0.12) {
  if (!soundOn) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = v;
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
  } catch {}
}

/* ============ Chủ đề theo điểm ============ */
// [top RGB, bottom RGB, cột RGB, cầu RGB, độ sáng sao]
const THEMES = [
  [90, 170, 255, 205, 235, 255, 52, 64, 86, 255, 213, 74, 0],      // 0–20 : trời xanh
  [255, 120, 90, 255, 205, 130, 74, 45, 84, 255, 245, 210, 0.1],   // 21–50: hoàng hôn
  [15, 20, 60, 50, 60, 120, 32, 42, 74, 120, 255, 220, 1],         // 51–100: đêm
  [40, 10, 80, 130, 40, 150, 52, 26, 96, 255, 120, 200, 1]         // >100: thiên hà
];
const themeOf = s => (s <= 20 ? 0 : s <= 50 ? 1 : s <= 100 ? 2 : 3);
let th = THEMES[0].slice();
const rgb = (a, i) => `rgb(${a[i] | 0},${a[i + 1] | 0},${a[i + 2] | 0})`;

const stars = Array.from({ length: 70 }, () => ({ x: rand(0, W), y: rand(0, H * 0.6), s: rand(1, 2.4), p: rand(0, 6) }));
const clouds = Array.from({ length: 6 }, (_, i) => ({ x: i * 90 + rand(0, 40), y: rand(60, 280), r: rand(18, 34), k: rand(0.1, 0.3) }));
const islands = Array.from({ length: 4 }, (_, i) => ({ x: i * 130, y: rand(120, 360), w: rand(40, 80), k: rand(0.25, 0.5) }));


/* ============ Sprite đại bàng pixel-art (18×20) ============ */
const SPR_BODY = [
".......KKKK.......","......KWWWWK......",".....KWWWWWWK.....",".....KWWWAEWYK....",
".....KWWWWWYYYK...",".....KWWWWWWYOK...","....KKWWWWWWKK....","...KBBKWWWWWK.....",
"..KBLBBKWWWK......","..KBLLBBBBBK......",".KBLBLLBBBBBK.....",".KBBLBBLBBBBK.....",
".KBBBLBBBBBBK.....","KWGBBBBBBBBBK.....","KGWWBBBBBBBK......",".KGWWKBBBBBK......","..KKGKBBBBK......."];
const SPR_FEET = [
 [".....KYYKKYYK.....",".....KYYYKYYYK....","......KKK.KKK....."],   // chân đứng
 ["....KYYK..KYYK....","....KYYYK.KYYYK...",".....KKK...KKK...."]];  // chân bước
const PAL = { K: "#2a1a10", B: "#6b3f1f", L: "#a5662f", W: "#f4f4f4", G: "#c8cddc", Y: "#f2b632", O: "#e08a1e", A: "#e8a020", E: "#111111" };
function makeSprite(feet) {
  const c = document.createElement("canvas"); c.width = 18; c.height = 20;
  const x = c.getContext("2d");
  SPR_BODY.concat(feet).forEach((row, y) => [...row].forEach((ch, i) => { if (PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, y, 1, 1); } }));
  return c;
}
const EAGLE = [makeSprite(SPR_FEET[0]), makeSprite(SPR_FEET[1])];
$("eagleBig").getContext("2d").drawImage(EAGLE[0], 0, 0);

/* ============ Trạng thái game ============ */
const g = { state: "menu", pillars: [], sticks: [], stick: null, hero: null, cam: 0, camT: 0, score: 0, shake: 0, success: false, perfect: false, av: 0, tick: 0, started: false };
let t = 0;

function spawn() {
  const last = g.pillars[g.pillars.length - 1];
  const d = Math.min(g.score / 80, 1);                 // độ khó 0 → 1
  const gap = rand(35 + d * 25, 110 + d * 130);        // khoảng cách luôn ≤ 240 < MAX_LEN
  const bonus = g.pillars.length > 1 && Math.random() < 0.14 * (1 - d * 0.7);
  const w = rand(34, 82 - d * 30);
  g.pillars.push({ x: last.x + last.w + gap, w, bonus });
}

function reset() {
  g.pillars = [{ x: 30, w: 80, bonus: false }]; g.sticks = []; g.stick = null;
  g.score = 0; g.cam = 0; g.camT = 0; g.shake = 0; g.started = false;
  spawn();
  g.hero = { x: 30 + 80 - HERO_OFF, y: GROUND, vy: 0, tx: 0 };
  $("score").textContent = "0";
}
const cur = () => g.pillars[g.pillars.length - 2];
const nxt = () => g.pillars[g.pillars.length - 1];

function say(txt) {
  const m = $("msg"); m.textContent = txt; m.classList.remove("pop"); void m.offsetWidth; m.classList.add("pop");
}

/* ============ Điều khiển ============ */
function down() {
  if (g.state !== "idle") return;
  if (!g.started) { g.started = true; $("hint").classList.add("hidden"); }
  const c = cur();
  g.stick = { bx: c.x + c.w, len: 0, angle: 0 };
  g.sticks.push(g.stick);
  g.state = "growing"; g.tick = 0;
}
function up() {
  if (g.state !== "growing") return;
  g.state = "falling"; g.av = 0;
}
cv.addEventListener("pointerdown", e => { e.preventDefault(); down(); });
addEventListener("pointerup", up);
addEventListener("pointercancel", up);
addEventListener("keydown", e => { if (e.code === "Space" && !e.repeat && !/INPUT/.test(document.activeElement.tagName)) { e.preventDefault(); down(); } });
addEventListener("keyup", e => { if (e.code === "Space") up(); });

/* ============ Cập nhật ============ */
function update(dt) {
  t += dt;
  const target = THEMES[themeOf(g.score)];
  for (let i = 0; i < th.length; i++) th[i] += (target[i] - th[i]) * Math.min(1, dt * 2);
  g.cam += (g.camT - g.cam) * Math.min(1, dt * 5);
  g.shake = Math.max(0, g.shake - dt * 30);

  if (g.state === "growing") {
    g.stick.len = Math.min(MAX_LEN, g.stick.len + GROW * dt);
    g.tick += dt;
    if (g.tick > 0.07) { g.tick = 0; beep(220 + g.stick.len * 1.5, 0.05, "triangle", 0.05); }
  }
  else if (g.state === "falling") {
    g.av += 20 * dt; g.stick.angle += g.av * dt;
    if (g.stick.angle >= Math.PI / 2) { g.stick.angle = Math.PI / 2; settle(); }
  }
  else if (g.state === "walking") {
    const speed = Math.min(420, 250 + g.score * 2.5);          // nhân vật nhanh dần
    g.hero.x = Math.min(g.hero.tx, g.hero.x + speed * dt);
    if (g.hero.x >= g.hero.tx) {
      if (g.success) land();
      else { g.state = "dying"; g.hero.vy = 0; beep(300, 0.4, "sawtooth", 0.1); }
    }
  }
  else if (g.state === "dying") {
    g.hero.vy += 1500 * dt; g.hero.y += g.hero.vy * dt;
    g.stick.angle = Math.min(Math.PI, g.stick.angle + dt * 4);   // cầu đổ theo
    if (g.hero.y > H + 60) gameOver();
  }

  // dọn đối tượng ở phía sau để tiết kiệm bộ nhớ
  while (g.pillars.length > 3 && g.pillars[0].x + g.pillars[0].w < g.cam - 60) g.pillars.shift();
  g.sticks = g.sticks.filter(s => s.bx + s.len > g.cam - 60);
}

function settle() {            // cầu đã đổ xong → kiểm tra
  const s = g.stick, n = nxt(), end = s.bx + s.len;
  g.shake = 6; beep(110, 0.12, "square", 0.12);
  g.success = end >= n.x && end <= n.x + n.w;
  g.perfect = g.success && Math.abs(end - (n.x + n.w / 2)) <= 5;
  g.hero.tx = g.success ? n.x + n.w - HERO_OFF : end;
  g.state = "walking";
}

function land() {
  const n = nxt();
  let pts = 1, txt = "";
  if (g.perfect) { pts += 1; txt = "Hoàn hảo! +1"; }
  if (n.bonus) { pts += 2; txt = (txt ? txt + "  " : "") + "Cột thưởng +2"; }
  g.score += pts;
  $("score").textContent = g.score;
  if (txt) say(txt);
  g.perfect ? beep(880, 0.2, "sine", 0.15) : beep(520, 0.1, "sine", 0.12);
  g.shake = 3;
  g.camT = n.x + n.w - 110;
  spawn();
  g.stick = null; g.state = "idle";
}

/* ============ Vẽ ============ */
function drawHero(h) {
  const walking = g.state === "walking";
  const frame = walking ? (Math.floor(t * 10) % 2) : 0;
  const bob = walking ? Math.abs(Math.sin(t * 20)) * -2 : 0;
  const SC = 2;                                        // mỗi pixel = 2 đơn vị
  ctx.save();
  ctx.translate(h.x, h.y + bob);
  if (g.state === "dying") ctx.rotate(Math.min(1.6, h.vy / 700));
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(EAGLE[frame], -9 * SC, -20 * SC, 18 * SC, 20 * SC);
  ctx.restore();
}

function draw() {
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  const gr = ctx.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, rgb(th, 0)); gr.addColorStop(1, rgb(th, 3));
  ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);

  if (th[12] > 0.02) {                                           // sao
    ctx.fillStyle = "#fff";
    for (const s of stars) { ctx.globalAlpha = th[12] * (0.45 + 0.55 * Math.sin(t * 2 + s.p)); ctx.fillRect(s.x, s.y, s.s, s.s); }
  }
  ctx.globalAlpha = 0.5 * (1 - Math.min(1, th[12]));             // mây
  ctx.fillStyle = "#fff";
  for (const c of clouds) {
    const x = (((c.x - g.cam * c.k) % (W + 160)) + (W + 160)) % (W + 160) - 80;
    ctx.beginPath(); ctx.ellipse(x, c.y, c.r * 1.8, c.r, 0, 0, 7); ctx.ellipse(x + c.r, c.y - c.r * 0.5, c.r, c.r * 0.8, 0, 0, 7); ctx.fill();
  }
  const ia = Math.max(0, Math.min(1, (g.score - 80) / 40));      // đảo bay (thiên hà)
  if (ia > 0) {
    ctx.globalAlpha = ia * 0.7;
    for (const i of islands) {
      const x = (((i.x - g.cam * i.k) % (W + 200)) + (W + 200)) % (W + 200) - 100, y = i.y + Math.sin(t + i.x) * 5;
      ctx.fillStyle = "#6b4d9e"; ctx.beginPath(); ctx.moveTo(x - i.w / 2, y); ctx.lineTo(x + i.w / 2, y); ctx.lineTo(x, y + i.w * 0.45); ctx.fill();
      ctx.fillStyle = "#58d68d"; ctx.fillRect(x - i.w / 2, y - 4, i.w, 5);
    }
  }
  ctx.globalAlpha = 1;

  ctx.save();
  ctx.translate(-g.cam + (Math.random() - 0.5) * g.shake, (Math.random() - 0.5) * g.shake);

  g.pillars.forEach((p, idx) => {                                // cột
    ctx.fillStyle = p.bonus ? "#f2b632" : rgb(th, 6);
    ctx.fillRect(p.x, GROUND, p.w, H - GROUND + 20);
    if (!p.bonus) { ctx.fillStyle = "#5aa845"; ctx.fillRect(p.x, GROUND, p.w, 5); }
    ctx.fillStyle = "rgba(255,255,255,.18)"; ctx.fillRect(p.x, GROUND, p.w, 2);
    if (p.bonus) { ctx.fillStyle = "rgba(255,255,255,.7)"; ctx.font = "20px sans-serif"; ctx.textAlign = "center"; ctx.fillText("★", p.x + p.w / 2, GROUND + 40); }
    if (idx > 0) { ctx.fillStyle = "#ff4d4d"; ctx.fillRect(p.x + p.w / 2 - 3, GROUND, 6, 4); }  // vùng hoàn hảo
  });

  for (const s of g.sticks) {                                    // cầu
    ctx.save(); ctx.translate(s.bx, GROUND); ctx.rotate(s.angle);
    ctx.fillStyle = rgb(th, 9); ctx.fillRect(-STICK_W / 2, -s.len, STICK_W, s.len);
    ctx.restore();
  }
  if (g.hero) drawHero(g.hero);
  ctx.restore();
}

/* ============ Vòng lặp ============ */
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); draw();
  requestAnimationFrame(loop);
}

/* ============ Giao diện ============ */
const show = id => $(id).classList.remove("hidden");
const hide = id => $(id).classList.add("hidden");
let user = null;

function refreshLabels() {
  $("menuBest").textContent = best;
  $("overBest").textContent = best;
  $("userInfo").textContent = user ? `Đã đăng nhập: ${user.displayName || (user.email || '').split('@')[0]}` : (FB.enabled ? "Đang chơi khách (điểm lưu trên máy)" : "Đang chơi khách (chưa cấu hình Firebase)");
  $("btnAuth").textContent = user ? "🚪 Đăng xuất" : "👤 Đăng nhập";
  $("btnSound").textContent = `${soundOn ? "🔊" : "🔇"} Âm thanh: ${soundOn ? "bật" : "tắt"}`;
}

function startGame() {
  hide("menu"); hide("over"); show("hud"); show("hint");
  reset(); g.state = "idle";
}
function goHome() { hide("over"); hide("hud"); hide("hint"); hide("login"); reset(); g.state = "menu"; show("menu"); refreshLabels(); }
function goLogin() { hide("menu"); hide("over"); hide("hud"); hide("hint"); $("loginErr").textContent = ""; reset(); g.state = "menu"; show("login"); }

async function gameOver() {
  g.state = "over";
  plays++; store.set("plays", plays);
  const isNew = g.score > best;
  if (isNew) { best = g.score; store.set("best", best); }
  $("overScore").textContent = g.score;
  $("overNew").textContent = isNew && g.score > 0 ? "🎉 Kỷ lục mới!" : "";
  refreshLabels();
  hide("hud"); hide("hint"); show("over");
  if (user && g.score > 0) {
    try { await FB.submitScore(g.score); } catch (e) { console.warn("Không gửi được điểm:", e); }
  }
}

$("btnPlay").onclick = startGame;
$("btnReplay").onclick = startGame;
$("btnHome").onclick = goHome;
$("btnSound").onclick = () => { soundOn = !soundOn; store.set("sound", soundOn); refreshLabels(); beep(600); };

/* --- Bảng xếp hạng --- */
let lbKind = "all";
async function openLb() {
  show("lb"); loadLb(lbKind);
}
async function loadLb(kind) {
  lbKind = kind;
  $("tabAll").classList.toggle("on", kind === "all");
  $("tabWeek").classList.toggle("on", kind === "week");
  const ul = $("lbList"), note = $("lbNote");
  ul.innerHTML = ""; note.textContent = "";
  if (!FB.enabled) { note.textContent = "Chưa cấu hình Firebase (xem firebase-config.js)."; return; }
  note.textContent = "Đang tải…";
  try {
    const rows = await FB.topScores(kind, 20);
    note.textContent = rows.length ? "" : "Chưa có ai trên bảng xếp hạng.";
    const me = FB.currentUser();
    rows.forEach((r, i) => {
      const li = document.createElement("li");
      if (me && me.uid === r.uid) li.className = "me";
      const a = document.createElement("span"); a.className = "rk"; a.textContent = i + 1;
      const b = document.createElement("span"); b.className = "nm"; b.textContent = r.name + (me && me.uid === r.uid ? " (Bạn)" : "");
      const c = document.createElement("span"); c.className = "sc"; c.textContent = r.score;
      li.append(a, b, c); ul.append(li);
    });
    if (!me) note.textContent = (note.textContent + " Đăng nhập để có tên trên bảng.").trim();
  } catch (e) {
    console.warn(e);
    note.textContent = kind === "week" ? "Không tải được. Có thể cần tạo index Firestore (xem Console trình duyệt)." : "Không tải được bảng xếp hạng.";
  }
}
$("btnLbMenu").onclick = openLb;
$("btnLbOver").onclick = openLb;
$("lbClose").onclick = () => hide("lb");
$("tabAll").onclick = () => loadLb("all");
$("tabWeek").onclick = () => loadLb("week");

/* --- Đăng nhập --- */
const ERR = {
  "auth/invalid-credential": "Sai tên hoặc mật khẩu.", "auth/wrong-password": "Sai mật khẩu.",
  "auth/user-not-found": "Tên này chưa đăng ký.", "auth/email-already-in-use": "Tên này đã có người dùng, hãy chọn tên khác.",
  "auth/weak-password": "Mật khẩu quá yếu (từ 6 ký tự).", "auth/invalid-email": "Tên không hợp lệ.",
  "auth/operation-not-allowed": "Chưa bật Email/Password trong Firebase (Authentication → Sign-in method).",
  "auth/too-many-requests": "Thử quá nhiều lần, hãy đợi một lát.", "auth/network-request-failed": "Lỗi mạng, thử lại."
};
const NAME_RE = /^[A-Za-z0-9_]{3,20}$/;
async function doAuth(kind) {
  const err = $("loginErr"); err.textContent = "";
  const name = $("lgName").value.trim(), pass = $("lgPass").value;
  if (!NAME_RE.test(name)) { err.textContent = "Tên 3–20 ký tự: chữ không dấu, số hoặc dấu _"; return; }
  if (pass.length < 6) { err.textContent = "Mật khẩu cần ít nhất 6 ký tự."; return; }
  if (!FB.enabled) {
    err.textContent = fbFailed ? "Không tải được Firebase (kiểm tra mạng hoặc trình chặn quảng cáo). Bạn vẫn có thể chơi khách." : "Chưa cấu hình Firebase (firebase-config.js) hoặc đang tải… Bạn vẫn có thể chơi khách.";
    return;
  }
  const btns = [$("btnLogin"), $("btnRegister")]; btns.forEach(b => b.disabled = true);
  err.textContent = kind === "register" ? "Đang đăng ký…" : "Đang đăng nhập…";
  try {
    await (kind === "register" ? FB.registerUser(name, pass) : FB.loginUser(name, pass));
    user = FB.currentUser(); $("lgPass").value = ""; err.textContent = "";
    refreshLabels();
    if (!$("login").classList.contains("hidden")) goHome();
  } catch (e) { err.textContent = ERR[e.code] || e.message; }
  finally { btns.forEach(b => b.disabled = false); }
}
$("btnAuth").onclick = async () => { if (user) { try { await FB.logout(); } catch {} } goLogin(); };
$("btnLogin").onclick = () => doAuth("login");
$("btnRegister").onclick = () => doAuth("register");
$("lgPass").addEventListener("keydown", e => { if (e.key === "Enter") doAuth("login"); });
$("btnGuest").onclick = goHome;

// Khi đăng nhập: đồng bộ điểm cao nhất giữa máy và máy chủ
function watchUser() {
  FB.onUser(async u => {
    user = u; refreshLabels();
    if (!u) return;
    if (!$("login").classList.contains("hidden")) goHome();   // đăng nhập xong → vào menu
    try {
      const remote = await FB.fetchMe();
      const rb = remote?.bestScore || 0;
      if (rb > best) { best = rb; store.set("best", best); }
      else if (best > rb) await FB.submitScore(best, { countPlay: false });
      refreshLabels();
    } catch (e) { console.warn("Đồng bộ lỗi:", e); }
  });
}
import("./firebase.js?v=4")
  .then(m => { FB = m; watchUser(); refreshLabels(); })
  .catch(e => { fbFailed = true; console.warn("Không nạp được Firebase:", e); refreshLabels(); });

/* ============ Khởi động ============ */
reset(); refreshLabels();
requestAnimationFrame(loop);
window.__ibReady = true;
