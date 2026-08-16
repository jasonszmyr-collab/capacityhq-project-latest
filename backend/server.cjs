const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

console.log("====================================");
console.log("RUNNING SERVER:", __filename);
console.log("====================================");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// --------------------
// OTA FILE HOSTING
// --------------------
app.use(express.static("public"));

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

    // Device Connection
    online: false,
    lastSeen: Date.now(),

    // Motion
    motor: "STOP",
    state: "IDLE",
    status: "idle",

    // Position
    position: 0,
    target: 0,
    full: 8000,
    half: 4000,
    percent: 0,

    // Network
    firmware: "4.0.0",
    wifi: false,
    ip: "",
    rssi: 0,

    // Commands
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

// 🔥 mark device offline if no heartbeat
setInterval(() => {
  const now = Date.now();

  if (now - deviceState.lastSeen > 15000) {
    deviceState.online = false;
  }
}, 5000);

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
  console.log("BODY:", req.body);

const motor = req.body.motor || req.body.command;

console.log("Command received:", motor);

  console.log("Command received:", motor);

  if (motor) {
    deviceState.motor = motor;
    deviceState.status = "command_sent";
    deviceState.commandPending = true;

    broadcastState();
  }

  res.json({ success: true });
});

// 📡 ESP32 Status Update
app.post("/status", (req, res) => {

  console.log("POST /status HIT");

  const data = req.body;

  deviceState.online = true;
  deviceState.lastSeen = Date.now();

  if (
    data.motor !== undefined &&
    !deviceState.commandPending
) {
    deviceState.motor = data.motor;
}

  if (data.status !== undefined)
    deviceState.status = data.status;

  if (data.state !== undefined)
    deviceState.state = data.state;

  if (data.position !== undefined)
    deviceState.position = data.position;

  if (data.state !== undefined)
    deviceState.state = data.state;

  if (data.target !== undefined)
    deviceState.target = data.target;

  if (data.full !== undefined)
    deviceState.full = data.full;

  if (data.half !== undefined)
    deviceState.half = data.half;

  if (data.percent !== undefined)
    deviceState.percent = data.percent;

  if (data.firmware !== undefined)
    deviceState.firmware = data.firmware;

  if (data.wifi !== undefined)
    deviceState.wifi = data.wifi;

  if (data.ip !== undefined)
    deviceState.ip = data.ip;

  if (data.rssi !== undefined)
    deviceState.rssi = data.rssi;

  console.table(deviceState);

  broadcastState();

  res.json({
    success: true
  });

});

// ---------------------------------------------------------
// Dashboard status endpoint
// ---------------------------------------------------------

app.get("/status", (req, res) => {

  res.json({
    online: deviceState.online,
    status: deviceState.status,
    motor: deviceState.motor,

    position: deviceState.position,
    target: deviceState.target,
    full: deviceState.full,
    half: deviceState.half,
    percent: deviceState.percent,

    firmware: deviceState.firmware,
    wifi: deviceState.wifi,
    ip: deviceState.ip,

    lastSeen: deviceState.lastSeen
  });

});

// 📤 ESP32 polls for commands
app.get("/control", (req, res) => {

  const response = {
    motor: deviceState.commandPending ? deviceState.motor : "STOP",
    status: deviceState.status,
    lastSeen: deviceState.lastSeen
  };

  console.log("GET /control ->", response.motor);

  res.json(response);

  if (deviceState.commandPending) {

    console.log("Command delivered:", deviceState.motor);

    deviceState.commandPending = false;
    deviceState.status = "delivered";

    // DO NOT reset motor here.
    // The ESP32 status update will tell us when
    // the command has actually completed.

    broadcastState();
  }

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