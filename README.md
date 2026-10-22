# Đại Bàng – Tự do, Vươn xa

Game HTML5 (Canvas) chạy trên GitHub Pages, dùng Firebase Auth + Firestore cho đăng nhập và bảng xếp hạng.
Không cấu hình Firebase vẫn chơi được (lưu kỷ lục bằng localStorage).

## Cấu trúc
- `index.html` – giao diện, menu, modal
- `game.js` – toàn bộ gameplay
- `firebase.js` – Auth, Firestore, bảng xếp hạng
- `firebase-config.js` – **điền cấu hình Firebase của bạn**
- `firestore.rules` – luật bảo mật Firestore

## 1. Tạo Firebase
1. https://console.firebase.google.com → Add project.
2. Build → Authentication → Sign-in method: bật **Google**, **Facebook** và **Email/Password**.
   - Facebook: tạo app tại https://developers.facebook.com → lấy *App ID* và *App Secret* dán vào Firebase, rồi copy *OAuth redirect URI* của Firebase vào mục *Facebook Login → Valid OAuth Redirect URIs*.
3. Authentication → Settings → Authorized domains: thêm `TEN_BAN.github.io`.
4. Build → Firestore Database → Create database (production mode).
5. Firestore → Rules: dán nội dung `firestore.rules` → Publish.
6. Project settings → Your apps → Web (`</>`) → copy `firebaseConfig` vào `firebase-config.js`.
7. Bảng "Tuần này" cần index: lần đầu mở, xem Console trình duyệt (F12), bấm link Firebase tạo index rồi chờ vài phút.

## 2. Chạy thử trên máy
ES Modules cần http, không mở file trực tiếp:
```
python -m http.server 8000
```
Mở http://localhost:8000 (thêm `localhost` vào Authorized domains nếu chưa có).

## 3. Đưa lên GitHub Pages
```
git init && git add . && git commit -m "Đại Bàng"
git branch -M main
git remote add origin https://github.com/TEN_BAN/infinity-bridge.git
git push -u origin main
```
Repo → Settings → Pages → Source: *Deploy from a branch* → `main` / `(root)`.
Game ở: `https://TEN_BAN.github.io/infinity-bridge/`

## Ghi chú
- `apiKey` của Firebase Web là công khai; bảo mật nằm ở `firestore.rules` (điểm chỉ tăng, giới hạn ≤ 5000, chỉ ghi vào hồ sơ của chính mình).
- Chống gian lận mạnh hơn (xác thực lượt chơi) cần Cloud Functions; đăng nhập Apple cần tài khoản Apple Developer.
