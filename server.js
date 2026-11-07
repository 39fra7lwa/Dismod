const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const Database = require("better-sqlite3");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;
const SECRET = process.env.JWT_SECRET || "change-this-secret-before-deploying";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, "chat.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 username TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS friendships (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL,
 friend_id INTEGER NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE(user_id, friend_id)
);
CREATE TABLE IF NOT EXISTS messages (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 sender_id INTEGER NOT NULL,
 receiver_id INTEGER NOT NULL,
 body TEXT,
 image_path TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS messages_pair ON messages(sender_id, receiver_id, id);
`);
app.use(express.json({ limit: "1mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(null, crypto.randomUUID() + ext);
    }
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpeg|jpg|gif|webp)$/.test(file.mimetype)) return cb(new Error("Only image files are allowed."));
    cb(null, true);
  }
});

function tokenFor(user) {
  return jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: "30d" });
}
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Please sign in again." });
  }
}
function safeUser(row) { return { id: row.id, username: row.username }; }

app.post("/api/register", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
    return res.status(400).json({ error: "Username must be 3–20 characters (letters, numbers or _)." });
  if (password.length < 6 || password.length > 72)
    return res.status(400).json({ error: "Password must be 6–72 characters." });
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run(username, hash);
    const user = { id: Number(result.lastInsertRowid), username };
    res.json({ token: tokenFor(user), user });
  } catch (e) {
    if (String(e).includes("UNIQUE")) return res.status(409).json({ error: "That username is already taken." });
    res.status(500).json({ error: "Could not create account." });
  }
});
app.post("/api/login", async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const row = db.prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE").get(username);
  if (!row || !(await bcrypt.compare(password, row.password_hash)))
    return res.status(401).json({ error: "Incorrect username or password." });
  const user = safeUser(row);
  res.json({ token: tokenFor(user), user });
});
app.get("/api/me", auth, (req, res) => res.json({ user: req.user }));
app.get("/api/friends", auth, (req, res) => {
  const rows = db.prepare(`SELECT u.id,u.username FROM friendships f JOIN users u ON u.id=f.friend_id
    WHERE f.user_id=? ORDER BY u.username COLLATE NOCASE`).all(req.user.id);
  res.json({ friends: rows.map(safeUser) });
});
app.post("/api/friends", auth, (req, res) => {
  const username = String(req.body.username || "").trim();
  const friend = db.prepare("SELECT id,username FROM users WHERE username=? COLLATE NOCASE").get(username);
  if (!friend) return res.status(404).json({ error: "No account found with that username." });
  if (friend.id === req.user.id) return res.status(400).json({ error: "You cannot add yourself." });
  try {
    const add = db.transaction(() => {
      db.prepare("INSERT OR IGNORE INTO friendships(user_id,friend_id) VALUES(?,?)").run(req.user.id, friend.id);
      db.prepare("INSERT OR IGNORE INTO friendships(user_id,friend_id) VALUES(?,?)").run(friend.id, req.user.id);
    });
    add();
    res.json({ friend: safeUser(friend) });
  } catch { res.status(500).json({ error: "Could not add friend." }); }
});
app.get("/api/messages/:friendId", auth, (req, res) => {
  const friendId = Number(req.params.friendId);
  const isFriend = db.prepare("SELECT 1 FROM friendships WHERE user_id=? AND friend_id=?").get(req.user.id, friendId);
  if (!isFriend) return res.status(403).json({ error: "Add this user as a friend first." });
  const rows = db.prepare(`SELECT id,sender_id AS senderId,receiver_id AS receiverId,body,
    image_path AS imagePath,created_at AS createdAt FROM messages
    WHERE (sender_id=? AND receiver_id=?) OR (sender_id=? AND receiver_id=?)
    ORDER BY id ASC`).all(req.user.id, friendId, friendId, req.user.id);
  res.json({ messages: rows });
});
app.post("/api/messages/:friendId", auth, upload.single("image"), (req, res) => {
  const friendId = Number(req.params.friendId);
  const isFriend = db.prepare("SELECT 1 FROM friendships WHERE user_id=? AND friend_id=?").get(req.user.id, friendId);
  if (!isFriend) return res.status(403).json({ error: "Add this user as a friend first." });
  const body = String(req.body.body || "").trim().slice(0, 4000);
  if (!body && !req.file) return res.status(400).json({ error: "Write a message or attach an image." });
  const imagePath = req.file ? "/uploads/" + req.file.filename : null;
  const result = db.prepare("INSERT INTO messages(sender_id,receiver_id,body,image_path) VALUES(?,?,?,?)")
    .run(req.user.id, friendId, body || null, imagePath);
  const message = db.prepare(`SELECT id,sender_id AS senderId,receiver_id AS receiverId,body,
    image_path AS imagePath,created_at AS createdAt FROM messages WHERE id=?`).get(result.lastInsertRowid);
  io.to("user:" + friendId).emit("new-message", message);
  io.to("user:" + req.user.id).emit("new-message", message);
  res.json({ message });
});

io.use((socket, next) => {
  try {
    socket.user = jwt.verify(socket.handshake.auth?.token, SECRET);
    next();
  } catch { next(new Error("Unauthorized")); }
});
io.on("connection", socket => socket.join("user:" + socket.user.id));

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || "Request failed." });
});
server.listen(PORT, () => console.log(`Dismod Chat running on ${PORT}`));
