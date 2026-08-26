const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");

console.log("====================================");
console.log("RUNNING SERVER:", __filename);
console.log("====================================");

const app = express();
const PORT = process.env.PORT || 3000;
const DEVICE_ID = "HP-001";

app.use(cors());
app.use(express.json());

// =========================================================
// OTA FILE HOSTING
// =========================================================

app.use(express.static("public"));

// =========================================================
// IN-MEMORY DATABASE
// =========================================================

const users = new Map();
const devicesByUser = new Map();
const deviceStatus = new Map();
const commandsByDevice = new Map();

function makeId(prefix = "id") {
  return `${prefix}-${Math.random()
    .toString(36)
    .slice(2, 10)}-${Date.now()}`;
}

// =========================================================
// AUTHENTICATION
// =========================================================

function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "Missing Authorization Bearer token"
    });
  }

  const token = auth.replace("Bearer ", "").trim();

  for (const [email, user] of users.entries()) {
    if (user.token === token) {
      req.user = {
        ...user,
        email
      };

      return next();
    }
  }

  return res.status(401).json({
    error: "Invalid token"
  });
}

// =========================================================
// HEALTH
// =========================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    service: "HonorPole Render Server",
    deviceId: DEVICE_ID,
    timestamp: Date.now()
  });
});

// =========================================================
// AUTH
// =========================================================

app.post("/auth/register", (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      error: "email and password required"
    });
  }

  if (users.has(email)) {
    return res.status(409).json({
      error: "User exists"
    });
  }

  const userId = makeId("user");
  const token = makeId("token");

  users.set(email, {
    userId,
    password,
    token
  });

  devicesByUser.set(userId, []);

  res.json({
    userId,
    token
  });
});

app.post("/auth/login", (req, res) => {
  const { email, password } = req.body || {};

  const user = users.get(email);

  if (!user || user.password !== password) {
    return res.status(401).json({
      error: "Invalid login"
    });
  }

  user.token = makeId("token");

  res.json({
    userId: user.userId,
    token: user.token
  });
});

// =========================================================
// DEVICE STATE
// =========================================================

let deviceState = {
  // Device
  deviceId: DEVICE_ID,

  // Connection
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
calibrated: false,

  // Network
  firmware: "4.0.0",
  wifi: false,
  ip: "",
  rssi: 0,

  // Command delivery
  commandPending: false,
  commandId: null,
  commandSource: null,
  commandCreatedAt: null,
  commandDeliveredAt: null
};

// =========================================================
// SERVER + WEBSOCKET
// =========================================================

const server = http.createServer(app);

const wss = new WebSocket.Server({
  server
});

// =========================================================
// BROADCAST HELPER
// =========================================================

function broadcastState() {
  const data = JSON.stringify(deviceState);

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// =========================================================
// WEBSOCKET CONNECTION
// =========================================================

wss.on("connection", (ws) => {
  console.log("WebSocket client connected");

  ws.isAlive = true;

  ws.send(JSON.stringify(deviceState));

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("close", () => {
    console.log("WebSocket client disconnected");
  });

  ws.on("error", (error) => {
    console.error("WebSocket error:", error.message);
  });
});

// =========================================================
// WEBSOCKET KEEPALIVE
// =========================================================

setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }

    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// =========================================================
// DEVICE OFFLINE DETECTION
// =========================================================

setInterval(() => {
  const now = Date.now();

  if (
    deviceState.online &&
    now - deviceState.lastSeen > 15000
  ) {
    console.log("Device marked OFFLINE");

    deviceState.online = false;

    broadcastState();
  }
}, 5000);

// =========================================================
// COMMAND VALIDATION
// =========================================================

const VALID_COMMANDS = new Set([
  "FULL",
  "HALF",
  "BOTTOM",
  "UP",
  "DOWN",
  "STOP",
  "CAL",
  "CANCEL",
  "STATUS",
  "RESET",
  "REBOOT"
]);

function normalizeCommand(command) {
  if (typeof command !== "string") {
    return null;
  }

  const normalized = command
    .trim()
    .toUpperCase();

  if (!VALID_COMMANDS.has(normalized)) {
    return null;
  }

  return normalized;
}

// =========================================================
// CENTRAL COMMAND QUEUE
// =========================================================

function queueCommand(command, source = "MANUAL") {
  const motor = normalizeCommand(command);

  if (!motor) {
    return null;
  }

  const commandId = makeId("cmd");
  const now = Date.now();

  deviceState.motor = motor;
  deviceState.status = "command_pending";

  deviceState.commandPending = true;
  deviceState.commandId = commandId;
  deviceState.commandSource = source;
  deviceState.commandCreatedAt = now;
  deviceState.commandDeliveredAt = null;

  commandsByDevice.set(DEVICE_ID, {
    commandId,
    motor,
    source,
    createdAt: now,
    deliveredAt: null
  });

  console.log("------------------------------------");
  console.log("COMMAND QUEUED");
  console.log("Device :", DEVICE_ID);
  console.log("Command:", motor);
  console.log("Source :", source);
  console.log("ID     :", commandId);
  console.log("------------------------------------");

  broadcastState();

  return {
    commandId,
    motor,
    source,
    createdAt: now
  };
}

// =========================================================
// CONTROL API
// APP / AUTO / TEST SEND COMMAND
// =========================================================

app.post("/control", (req, res) => {
  const body = req.body || {};

  const requestedCommand =
    body.motor ||
    body.command;

  const source =
    typeof body.source === "string" &&
    body.source.trim()
      ? body.source.trim().toUpperCase()
      : "MANUAL";

  const motor = normalizeCommand(requestedCommand);

  console.log("POST /control");
  console.log("BODY:", body);

  if (!motor) {
    return res.status(400).json({
      success: false,
      error: "Invalid or missing motor command",
      validCommands: Array.from(VALID_COMMANDS)
    });
  }

  const queued = queueCommand(
    motor,
    source
  );

  res.json({
    success: true,
    deviceId: DEVICE_ID,
    command: queued.motor,
    commandId: queued.commandId,
    source: queued.source,
    status: "queued",
    createdAt: queued.createdAt
  });
});
// =========================================================
// DEVICE COMMAND COMPATIBILITY ENDPOINT
// Mobile / Dashboard -> Central Command Queue
// =========================================================

app.post(
  "/api/device/:deviceId/command",
  (req, res) => {
    if (
      req.params.deviceId !== DEVICE_ID
    ) {
      return res.status(404).json({
        success: false,
        error: "Device not found"
      });
    }

    const body = req.body || {};

    const requestedCommand =
      body.motor ||
      body.command;

    const source =
      typeof body.source === "string" &&
      body.source.trim()
        ? body.source.trim().toUpperCase()
        : "MANUAL";

    const motor =
      normalizeCommand(
        requestedCommand
      );

    console.log(
      "POST /api/device/:deviceId/command"
    );

    console.log(
      "DEVICE:",
      req.params.deviceId
    );

    console.log(
      "BODY:",
      body
    );

    if (!motor) {
      return res.status(400).json({
        success: false,
        error:
          "Invalid or missing motor command",
        validCommands:
          Array.from(
            VALID_COMMANDS
          )
      });
    }

    const queued =
      queueCommand(
        motor,
        source
      );

    res.json({
      success: true,
      deviceId:
        DEVICE_ID,
      command:
        queued.motor,
      commandId:
        queued.commandId,
      source:
        queued.source,
      status:
        "queued",
      createdAt:
        queued.createdAt
    });
  }
);
// =========================================================
// ESP32 POLLS FOR COMMAND
// =========================================================

app.get("/control", (req, res) => {
  let motor = "STOP";

  if (deviceState.commandPending) {
    motor = deviceState.motor;
  }

  const response = {
    motor,
    status: deviceState.status,
    lastSeen: deviceState.lastSeen,

    commandId:
      deviceState.commandPending
        ? deviceState.commandId
        : null,

    source:
      deviceState.commandPending
        ? deviceState.commandSource
        : null
  };

  console.log(
    "GET /control ->",
    response.motor,
    response.commandId || ""
  );

  // Send the command first.
  res.json(response);

  // -------------------------------------------------------
  // Mark command as delivered after ESP32 retrieved it.
  // -------------------------------------------------------

  if (deviceState.commandPending) {
    const deliveredCommand =
      deviceState.motor;

    const deliveredCommandId =
      deviceState.commandId;

    const deliveredAt =
      Date.now();

    console.log("------------------------------------");
    console.log("COMMAND DELIVERED");
    console.log("Device :", DEVICE_ID);
    console.log("Command:", deliveredCommand);
    console.log("Source :", deviceState.commandSource);
    console.log("ID     :", deliveredCommandId);
    console.log("------------------------------------");

    deviceState.commandPending = false;
    deviceState.commandDeliveredAt = deliveredAt;
    deviceState.status = "delivered";

    const stored =
      commandsByDevice.get(DEVICE_ID);

    if (
      stored &&
      stored.commandId === deliveredCommandId
    ) {
      stored.deliveredAt = deliveredAt;

      commandsByDevice.set(
        DEVICE_ID,
        stored
      );
    }

    // IMPORTANT:
    //
    // Do NOT reset deviceState.motor here.
    //
    // The ESP32 telemetry is authoritative for
    // the actual motor state after command delivery.

    broadcastState();
  }
});

// =========================================================
// ESP32 STATUS UPDATE
// =========================================================

app.post("/status", (req, res) => {
  console.log("POST /status HIT");

  const data = req.body || {};

  console.log("ESP32 STATUS BODY:", JSON.stringify(data));

  deviceState.online = true;
  deviceState.lastSeen = Date.now();

  // -------------------------------------------------------
  // Only allow ESP32 telemetry to replace motor state
  // when there is no command waiting for delivery.
  // -------------------------------------------------------

    // -------------------------------------------------------
  // Normalize authoritative ESP32 motion telemetry.
  //
  // Current HonorPole firmware reports:
  //   mode:   IDLE / MOVING / HOMING / CALIBRATING / ...
  //   moving: true / false
  //
  // It does NOT report "motor" or "status".
  //
  // Once a queued command has been delivered, fresh ESP32
  // telemetry becomes authoritative for actual motion state.
  // -------------------------------------------------------

  if (!deviceState.commandPending) {
  const espMode =
  data.mode !== undefined
    ? String(data.mode).trim().toUpperCase()
    : data.state !== undefined
      ? String(data.state).trim().toUpperCase()
      : "";

  const hasMovingTelemetry =
    typeof data.moving === "boolean";

  const espMoving =
    data.moving === true;

  // Preserve the firmware mode separately for diagnostics.
  if (data.mode !== undefined) {
  deviceState.state = data.mode;
} else if (data.state !== undefined) {
  deviceState.state = data.state;
}

  // Explicit firmware error states take priority.
  if (espMode === "ERROR") {
    deviceState.motor = "STOP";
    deviceState.status = "error";
  }

  // Calibration/homing are special operating states.
  else if (espMode === "HOMING") {
    deviceState.status = "homing";
  }

  else if (espMode === "CALIBRATING") {
    deviceState.status = "calibrating";
  }

  // The ESP32's moving=true is authoritative proof that
  // physical motion is currently in progress.
  else if (espMoving || espMode === "MOVING") {
    deviceState.status = "moving";

    // Keep deviceState.motor as FULL/HALF/BOTTOM so we retain
    // the commanded destination while movement is occurring.
  }

  // Once the ESP32 explicitly reports moving=false, the
  // physical move has ended. Clear Render's delivered command
  // state even if mode has not yet changed back to IDLE.
  else if (
    (hasMovingTelemetry && data.moving === false) ||
    espMode === "IDLE"
  ) {
    deviceState.motor = "STOP";
    deviceState.status = "idle";
  }
}

console.log("NORMALIZE RESULT", {
  motor: deviceState.motor,
  status: deviceState.status,
  state: deviceState.state
});

  if (data.position !== undefined) {
    deviceState.position = data.position;
  }

  if (data.target !== undefined) {
    deviceState.target = data.target;
  }

  if (data.full !== undefined) {
  deviceState.full = data.full;
}

if (data.half !== undefined) {
  deviceState.half = data.half;
}

if (data.percent !== undefined) {
  deviceState.percent = data.percent;
}

if (typeof data.calibrated === "boolean") {
  deviceState.calibrated = data.calibrated;
}

  if (data.firmware !== undefined) {
    deviceState.firmware = data.firmware;
  }

  if (data.wifi !== undefined) {
    deviceState.wifi = data.wifi;
  }

  if (data.ip !== undefined) {
    deviceState.ip = data.ip;
  }

  if (data.rssi !== undefined) {
    deviceState.rssi = data.rssi;
  }

  console.table({
    online: deviceState.online,
    motor: deviceState.motor,
    state: deviceState.state,
    status: deviceState.status,
    position: deviceState.position,
    target: deviceState.target,
    full: deviceState.full,
    half: deviceState.half,
    percent: deviceState.percent,
    firmware: deviceState.firmware,
    wifi: deviceState.wifi,
    ip: deviceState.ip,
    rssi: deviceState.rssi,
    commandPending:
      deviceState.commandPending
  });

  broadcastState();

  res.json({
    success: true,
    serverTime: Date.now()
  });
});

// =========================================================
// DASHBOARD STATUS
// =========================================================

app.get("/status", (req, res) => {
  res.json({
    deviceId: DEVICE_ID,

    online: deviceState.online,
    status: deviceState.status,
    state: deviceState.state,
    motor: deviceState.motor,

    position: deviceState.position,
    target: deviceState.target,
    full: deviceState.full,
    half: deviceState.half,
    percent: deviceState.percent,

    firmware: deviceState.firmware,
    wifi: deviceState.wifi,
    ip: deviceState.ip,
    rssi: deviceState.rssi,

    lastSeen: deviceState.lastSeen,

    command: {
      pending: deviceState.commandPending,
      id: deviceState.commandId,
      source: deviceState.commandSource,
      createdAt: deviceState.commandCreatedAt,
      deliveredAt: deviceState.commandDeliveredAt
    }
  });
});

// =========================================================
// DEVICE DISCOVERY COMPATIBILITY ENDPOINT
// =========================================================

app.get("/api/devices", (req, res) => {
  res.json([
    {
      deviceId: DEVICE_ID,
      deviceName: "HonorPole",
      firmware:
        deviceState.firmware || "--",
      serialNumber: DEVICE_ID,
      ipAddress:
        deviceState.ip || "",
      online:
        deviceState.online === true,
      lastSeen:
        String(deviceState.lastSeen || ""),
      signalStrength:
        deviceState.rssi || 0
    }
  ]);
});

// =========================================================
// DEVICE TELEMETRY COMPATIBILITY ENDPOINT
// =========================================================

app.get(
  "/api/device/:deviceId/status",
  (req, res) => {
    if (
      req.params.deviceId !== DEVICE_ID
    ) {
      return res.status(404).json({
        error: "Device not found"
      });
    }

    let movement = "STOPPED";

    const motor =
      String(deviceState.motor || "")
        .toUpperCase();

    const status =
      String(deviceState.status || "")
        .toLowerCase();

    if (status === "moving") {
      if (
        motor === "UP" ||
        motor === "FULL"
      ) {
        movement = "RAISING";
      } else if (
        motor === "DOWN" ||
        motor === "BOTTOM"
      ) {
        movement = "LOWERING";
      }
    }

    res.json({
      online:
        deviceState.online === true,

      firmware:
        deviceState.firmware || "--",

      hardware:
        "ESP32-S3",

      serialNumber:
        DEVICE_ID,

      deviceName:
        "HonorPole",

      currentPosition:
        deviceState.position || 0,

      targetPosition:
        deviceState.target || 0,

      learnedTopPosition:
        deviceState.full || 0,

      movement,

      moving:
        status === "moving",

      automaticMode:
        true,

      calibrated:
        deviceState.calibrated === true,

      commandStatus:
        deviceState.status || "idle",

      command: {
        pending:
          deviceState.commandPending,

        id:
          deviceState.commandId,

        source:
          deviceState.commandSource,

        createdAt:
          deviceState.commandCreatedAt,

        deliveredAt:
          deviceState.commandDeliveredAt
      },

      network: {
        wifiConnected:
          deviceState.wifi === true,

        cloudConnected:
          deviceState.online === true,

        websocketConnected:
          false,

        ssid:
          "",

        ipAddress:
          deviceState.ip || "",

        signalStrength:
          deviceState.rssi || 0
      },

      health: {
        batteryVoltage: 0,
        motorCurrent: 0,
        cpuTemperature: 0,
        freeMemory: 0,
        uptime: 0,

        lastHeartbeat:
          String(
            deviceState.lastSeen || ""
          )
      },

      directives: {
        federal: "",
        state: "",
        source: "",
        updated: ""
      },

      events: []
    });
  }
);

// =========================================================
// COMMAND DEBUG ENDPOINT
// =========================================================

app.get("/api/command/status", (req, res) => {
  const command =
    commandsByDevice.get(DEVICE_ID) ||
    null;

  res.json({
    deviceId: DEVICE_ID,

    pending:
      deviceState.commandPending,

    currentMotor:
      deviceState.motor,

    status:
      deviceState.status,

    command
  });
});

// =========================================================
// TEST
// =========================================================

app.get("/test", (req, res) => {
  res.json({
    success: true,
    message: "HELLO FROM RENDER",
    deviceId: DEVICE_ID,
    serverTime: Date.now()
  });
});

// =========================================================
// START SERVER
// =========================================================

server.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Server + WebSocket running on ${PORT}`
    );

    console.log(
      `HonorPole Device: ${DEVICE_ID}`
    );
  }
);