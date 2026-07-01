const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

// Allow your Vite dev server
app.use(cors());

app.options("*", cors());

app.use(express.json());

// --------------------
// In-memory "database"
// --------------------
const users = new Map(); // email -> { userId, password, token }
const devicesByUser = new Map(); // userId -> array of devices
const deviceStatus = new Map(); // deviceId -> status object
const commandsByDevice = new Map(); // deviceId -> array of commands

function makeId(prefix = "id") {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now()}`;
}

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing Authorization Bearer token" });
  }
  const token = auth.replace("Bearer ", "").trim();
  // Find user by token
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
  res.json({ ok: true, service: "local-cloud-api", port: PORT });
});

// --------------------
// Auth
// --------------------
app.post("/auth/register", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  if (users.has(email)) {
    return res.status(409).json({ error: "User already exists" });
  }

  const userId = makeId("user");
  const token = makeId("token");
  users.set(email, { userId, password, token });

  devicesByUser.set(userId, []);
  return res.json({ userId, token });
});

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email and password required" });

  const u = users.get(email);
  if (!u || u.password !== password) {
    return res.status(401).json({ error: "Invalid email/password" });
  }

  // refresh token each login
  u.token = makeId("token");
  return res.json({ userId: u.userId, token: u.token });
});

// --------------------
// Devices
// --------------------
app.post("/devices/register", requireAuth, (req, res) => {
  const { pairingCode, deviceName, userId } = req.body || {};
  if (!pairingCode || !deviceName || !userId) {
    return res.status(400).json({ error: "pairingCode, deviceName, userId required" });
  }

  if (req.user.userId !== userId) {
    return res.status(403).json({ error: "Cannot register device for different user" });
  }

  const deviceId = makeId("device");
  const device = {
    deviceId,
    deviceName,
    lastSeen: new Date().toISOString(),
    online: true,
    firmware: "local-dev",
  };

  const list = devicesByUser.get(userId) || [];
  list.push(device);
  devicesByUser.set(userId, list);

  deviceStatus.set(deviceId, {
    deviceId,
    currentPosition: "down",
    arduinoStatus: "LOCAL",
    lastUpdate: new Date().toISOString(),
    online: true,
    federalDirective: { active: false, expiresAt: null, reason: null },
    stateDirective: { active: false, expiresAt: null, reason: null },
  });

  commandsByDevice.set(deviceId, []);

  res.json({ deviceId, pairingCode, userId, deviceName });
});

app.get("/devices", requireAuth, (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "userId required" });
  if (req.user.userId !== userId) return res.status(403).json({ error: "Forbidden" });

  res.json(devicesByUser.get(userId) || []);
});

app.get("/devices/:deviceId/status", requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const status = deviceStatus.get(deviceId);
  if (!status) return res.status(404).json({ error: "Device not found" });
  res.json(status);
});

app.post("/devices/:deviceId/command", requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const { command, userId } = req.body || {};
  if (!command || !userId) return res.status(400).json({ error: "command and userId required" });
  if (req.user.userId !== userId) return res.status(403).json({ error: "Forbidden" });

  const status = deviceStatus.get(deviceId);
  if (!status) return res.status(404).json({ error: "Device not found" });

  const commandId = makeId("cmd");
  const cmdObj = {
    commandId,
    deviceId,
    command,
    timestamp: new Date().toISOString(),
    status: "executed",
    userId,
  };

  const list = commandsByDevice.get(deviceId) || [];
  list.unshift(cmdObj);
  commandsByDevice.set(deviceId, list);

  // update status position
  status.currentPosition = command;
  status.lastUpdate = new Date().toISOString();
  deviceStatus.set(deviceId, status);

  res.json(cmdObj);
});

app.get("/devices/:deviceId/commands", requireAuth, (req, res) => {
  const { deviceId } = req.params;
  const limit = parseInt(req.query.limit || "50", 10);
  const list = commandsByDevice.get(deviceId) || [];
  res.json(list.slice(0, limit));
});

// =======================
// ESP32 + APP REAL-TIME CONTROL (FINAL)
// =======================

let deviceState = {
  motor: "STOP",
  status: "idle",
  lastSeen: Date.now(),
  commandPending: false
};

// 📥 APP sends command
app.post("/control", (req, res) => {
  const { motor } = req.body;

  console.log("Command received:", motor);

  if (motor) {
    deviceState.motor = motor;
    deviceState.status = "command_sent";
    deviceState.commandPending = true;
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

});

// 📡 ESP32 sends heartbeat/status
app.post("/status", (req, res) => {

  const { motor, status } = req.body;

  if (motor) deviceState.motor = motor;
  if (status) deviceState.status = status;

  deviceState.lastSeen = Date.now();

  // 🔥 IMPORTANT: mark command completed
  if (status === "done") {
    deviceState.commandPending = false;
  }

  console.log("DEVICE UPDATE:", deviceState);

  res.json({ ok: true });
});

// 🧪 TEST ROUTE
app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "HELLO FROM RENDER"
  });
});

// --------------------
// Start
// --------------------
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Cloud API running: ${PORT}`);
});