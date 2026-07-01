const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.options("*", cors());
app.use(express.json());

// --------------------
// In-memory "database"
// --------------------
const users = new Map();
const devicesByUser = new Map();
const deviceStatus = new Map();
const commandsByDevice = new Map();

function makeId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization Bearer token" });
  }

  const token = auth.replace("Bearer ", "").trim();

  for (const [email, u] of users.entries()) {
    if (u.token === token) {
      req.user = u;
      req.user.email = email;
      return next();
    }
  }

  return res.status(401).json({ error: "Invalid token" });
}

// --------------------
// Health
// --------------------
app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// --------------------
// Auth
// --------------------
app.post("/auth/register", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "email and password required" });
  }

  if (users.has(email)) {
    return res.status(409).json({ error: "User exists" });
  }

  const userId = makeId("user");
  const token = makeId("token");

  users.set(email, { userId, password, token });
  devicesByUser.set(userId, []);

  res.json({ userId, token });
});

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};

  const u = users.get(email);

  if (!u || u.password !== password) {
    return res.status(401).json({ error: "Invalid login" });
  }

  u.token = makeId("token");

  res.json({ userId: u.userId, token: u.token });
});

// --------------------
// DEVICE STATE (REAL-TIME)
// --------------------
let deviceState = {
  motor: "STOP",
  status: "idle",
  lastSeen: Date.now(),
  commandPending: false
};

// --------------------
// SERVER + WEBSOCKET
// --------------------
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 🔌 WebSocket connection
wss.on("connection", (ws) => {
  console.log("📱 WebSocket client connected");

  ws.isAlive = true;

  ws.send(JSON.stringify(deviceState));

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("close", () => {
    console.log("❌ WebSocket disconnected");
  });
});

// 🔥 Keep connections alive
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) return ws.terminate();

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// 📡 Broadcast helper
function broadcastState() {
  const data = JSON.stringify(deviceState);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// --------------------
// CONTROL API
// --------------------

// 📥 APP sends command
app.post("/control", (req, res) => {
  const { motor } = req.body;

  console.log("Command received:", motor);

  if (motor) {
    deviceState.motor = motor;
    deviceState.status = "command_sent";
    deviceState.commandPending = true;

    broadcastState();
  }

  res.json({ success: true });
});

// 📤 ESP32 reads command
app.get("/control", (req, res) => {
  res.json({
    motor: deviceState.commandPending ? deviceState.motor : "STOP",
    status: deviceState.status,
    lastSeen: deviceState.lastSeen
  });

  // 🔥 reset command after read
  deviceState.commandPending = false;
});

// 📡 ESP32 heartbeat
app.post("/status", (req, res) => {
  const { motor, status } = req.body;

  if (motor) deviceState.motor = motor;
  if (status) deviceState.status = status;

  deviceState.lastSeen = Date.now();

  if (status === "done") {
    deviceState.commandPending = false;
  }

  console.log("DEVICE UPDATE:", deviceState);

  broadcastState();

  res.json({ ok: true });
});

// --------------------
// TEST
// --------------------
app.get("/test", (req, res) => {
  res.json({ success: true, message: "HELLO FROM RENDER" });
});

// --------------------
// START SERVER
// --------------------
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server + WebSocket running on ${PORT}`);
});