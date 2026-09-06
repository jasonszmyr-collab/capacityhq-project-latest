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

const AUTO_CONTROL_SECRET =
  process.env.AUTO_CONTROL_SECRET || "";

app.use(cors());
app.use(express.json());

// =========================================================
// OTA FILE HOSTING
// =========================================================

app.use(express.static("public"));

// =========================================================
// IN-MEMORY DATABASE
// =========================================================

const deviceStatus = new Map();
const commandsByDevice = new Map();

function makeId(prefix = "id") {
  return `${prefix}-${Math.random()
    .toString(36)
    .slice(2, 10)}-${Date.now()}`;
}

// =========================================================
// SUPABASE USER AUTHENTICATION
// Validates mobile/dashboard Bearer tokens before allowing
// protected cloud API operations.
// =========================================================

const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://xkgiovddglqxcruwabtm.supabase.co";

async function requireSupabaseAuth(req, res, next) {
  const authorization =
    typeof req.headers.authorization === "string"
      ? req.headers.authorization.trim()
      : "";

  if (!authorization.startsWith("Bearer ")) {
    return res.status(401).json({
      success: false,
      error: "Authentication required"
    });
  }

  const token = authorization.slice(7).trim();

  if (!token) {
    return res.status(401).json({
      success: false,
      error: "Authentication required"
    });
  }

  try {
    const response = await fetch(
      `${SUPABASE_URL}/auth/v1/user`,
      {
        method: "GET",
                headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.SUPABASE_ANON_KEY || ""
        }
      }
    );

                if (!response.ok) {
      return res.status(401).json({
        success: false,
        error: "Invalid or expired authentication"
      });
    }

    const user = await response.json();

    if (!user?.id) {
      return res.status(401).json({
        success: false,
        error: "Invalid authentication"
      });
    }

    req.user = user;
      req.accessToken = token;
      next();
  } catch (error) {
    console.error(
      "Supabase authentication verification failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return res.status(503).json({
      success: false,
      error: "Authentication service unavailable"
    });
  }
}

function requireAutoControlAuth(req, res, next) {
  const providedSecret =
    typeof req.headers["x-honorpole-auto-secret"] === "string"
      ? req.headers["x-honorpole-auto-secret"].trim()
      : "";

  if (
    !AUTO_CONTROL_SECRET ||
    !providedSecret ||
    providedSecret !== AUTO_CONTROL_SECRET
  ) {
    return res.status(401).json({
      success: false,
      error: "AUTO authentication required"
    });
  }

  next();
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
// DEVICE AUTHORIZATION
// Confirms that the authenticated Supabase user has a
// device_users membership for the requested HonorPole.
// Supabase RLS limits the query to the caller's own rows.
// =========================================================

async function requireDeviceAccess(req, res, next) {
  const deviceId =
    typeof req.params.deviceId === "string"
      ? req.params.deviceId.trim()
      : DEVICE_ID;

  if (!deviceId || deviceId !== DEVICE_ID) {
    return res.status(404).json({
      success: false,
      error: "Device not found"
    });
  }

  if (!req.accessToken || !req.user?.id) {
    return res.status(401).json({
      success: false,
      error: "Authentication required"
    });
  }

  try {
    const url =
      `${SUPABASE_URL}/rest/v1/device_users` +
      `?device_id=eq.${encodeURIComponent(deviceId)}` +
      `&user_id=eq.${encodeURIComponent(req.user.id)}` +
      `&select=device_id,user_id,role`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${req.accessToken}`,
        apikey: process.env.SUPABASE_ANON_KEY || ""
      }
    });

    if (!response.ok) {
      console.error(
        "Device authorization lookup failed:",
        response.status
      );

      return res.status(503).json({
        success: false,
        error: "Authorization service unavailable"
      });
    }

    const memberships = await response.json();

    if (!Array.isArray(memberships) || memberships.length === 0) {
      return res.status(403).json({
        success: false,
        error: "Not authorized for this device"
      });
    }

    req.deviceMembership = memberships[0];
    next();
  } catch (error) {
    console.error(
      "Device authorization verification failed:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return res.status(503).json({
      success: false,
      error: "Authorization service unavailable"
    });
  }
}

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

app.post("/auto/control", requireAutoControlAuth, (req, res) => {
  const body = req.body || {};

  const requestedCommand =
    body.motor ||
    body.command;

  const motor = normalizeCommand(requestedCommand);

  console.log("POST /auto/control");
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
    "AUTO"
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

app.post("/control", requireSupabaseAuth, requireDeviceAccess, (req, res) => {
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
  requireSupabaseAuth,
  requireDeviceAccess,
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
    hasMovingTelemetry && data.moving === true;

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

  // Explicit moving=true is authoritative proof of motion.
  else if (espMoving) {
    deviceState.status = "moving";
  }

  // Explicit moving=false is authoritative proof that
  // physical motion has ended, even if mode is stale.
  else if (
    hasMovingTelemetry &&
    data.moving === false
  ) {
    deviceState.motor = "STOP";
    deviceState.status = "idle";
  }

  // If moving telemetry is absent, use the firmware mode.
  else if (espMode === "MOVING") {
    deviceState.status = "moving";
  }

  else if (espMode === "IDLE") {
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

// Calculate physical travel percentage from authoritative
// position/full telemetry when the ESP32 does not send percent.
if (data.percent !== undefined) {
  deviceState.percent = data.percent;
} else if (
  Number.isFinite(Number(deviceState.position)) &&
  Number.isFinite(Number(deviceState.full)) &&
  Number(deviceState.full) > 0
) {
  deviceState.percent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (Number(deviceState.position) /
          Number(deviceState.full)) *
          100
      )
    )
  );
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

app.get("/api/devices", requireSupabaseAuth, requireDeviceAccess, (req, res) => {
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
  requireSupabaseAuth,
  requireDeviceAccess,
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


