const express = require("express");
const cors = require("cors");
const http = require("http");
const WebSocket = require("ws");
const crypto = require("crypto");

console.log("====================================");
console.log("RUNNING SERVER:", __filename);
console.log("====================================");

const app = express();
const PORT = process.env.PORT || 3000;
const DEVICE_ID = "HP-001";

const DEVICE_PAIRING_SECRETS = (() => {
  try {
    return JSON.parse(
      process.env.DEVICE_PAIRING_SECRETS || "{}"
    );
  } catch (error) {
    console.error(
      "Invalid DEVICE_PAIRING_SECRETS configuration"
    );

    return {};
  }
})();

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
  process.env.SUPABASE_URL || "https://xkgiovddglqxcruwabtm.supabase.co";

const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || "";

function hashPairingCode(pairingCode) {
  return crypto
    .createHash("sha256")
    .update(String(pairingCode).trim().toUpperCase())
    .digest("hex");
}

function requireDevicePairingAuth(req, res, next) {
  const deviceId =
    typeof req.body?.deviceId === "string"
      ? req.body.deviceId.trim()
      : "";

  const providedSecret =
    typeof req.headers["x-device-secret"] === "string"
      ? req.headers["x-device-secret"].trim()
      : "";

  if (!deviceId || !providedSecret) {
    return res.status(401).json({
      success: false,
      error: "Device authentication required"
    });
  }

  const expectedSecret =
    DEVICE_PAIRING_SECRETS[deviceId];

  if (!expectedSecret) {
    return res.status(401).json({
      success: false,
      error: "Unknown device"
    });
  }

  const providedBuffer =
    Buffer.from(providedSecret);

  const expectedBuffer =
    Buffer.from(expectedSecret);

  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(
      providedBuffer,
      expectedBuffer
    )
  ) {
    return res.status(401).json({
      success: false,
      error: "Invalid device credentials"
    });
  }

  req.deviceId = deviceId;
  next();
}

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
  typeof req.params.deviceId === "string" &&
  req.params.deviceId.trim()
    ? req.params.deviceId.trim()
    : typeof req.body?.device_id === "string" &&
        req.body.device_id.trim()
      ? req.body.device_id.trim()
      : typeof req.body?.deviceId === "string" &&
          req.body.deviceId.trim()
        ? req.body.deviceId.trim()
        : DEVICE_ID;

  if (!deviceId) {
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
// One independent state object per HonorPole
// =========================================================

const states = new Map();

function createDeviceState(deviceId) {
  return {
    // Device
    deviceId,

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

    freeMemory: 0,
    uptime: 0,

    // Command delivery
    commandPending: false,
    commandId: null,
    commandSource: null,
    commandCreatedAt: null,
    commandDeliveredAt: null
  };
}

function getDeviceState(deviceId) {
  if (!states.has(deviceId)) {
    states.set(
      deviceId,
      createDeviceState(deviceId)
    );
  }

  return states.get(deviceId);
}

// Keep HP-001 initialized so the existing prototype
// continues to work during the multipole conversion.
const state = getDeviceState(DEVICE_ID);

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

function broadcastState(deviceId = DEVICE_ID) {
  const state = getDeviceState(deviceId);

  const data = JSON.stringify({
    type: "telemetry",
    deviceId,
    data: {
      ...state,
      deviceId
    }
  });

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

  ws.send(
  JSON.stringify({
    type: "telemetry",
    deviceId: DEVICE_ID,
    data: {
      ...getDeviceState(DEVICE_ID),
      deviceId: DEVICE_ID
    }
  })
);

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

  for (const [deviceId, state] of states.entries()) {
    if (
      state.online &&
      now - state.lastSeen > 15000
    ) {
      console.log("Device marked OFFLINE:", deviceId);

      state.online = false;

      broadcastState(deviceId);
    }
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

function queueCommand(deviceId, command, source = "MANUAL") {
  const targetDeviceId =
    typeof deviceId === "string" && deviceId.trim()
      ? deviceId.trim()
      : DEVICE_ID;

  const targetState = getDeviceState(targetDeviceId);
  const motor = normalizeCommand(command);

  if (!motor) {
    return null;
  }

  const commandId = makeId("cmd");
  const now = Date.now();

  targetState.motor = motor;
  targetState.status = "command_pending";

  targetState.commandPending = true;
  targetState.commandId = commandId;
  targetState.commandSource = source;
  targetState.commandCreatedAt = now;
  targetState.commandDeliveredAt = null;

  commandsByDevice.set(targetDeviceId, {
    commandId,
    motor,
    source,
    createdAt: now,
    deliveredAt: null
  });

  console.log("------------------------------------");
  console.log("COMMAND QUEUED");
  console.log("Device :", targetDeviceId);
  console.log("Command:", motor);
  console.log("Source :", source);
  console.log("ID     :", commandId);
  console.log("------------------------------------");

  broadcastState(targetDeviceId);

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

  const deviceId =
    typeof body.device_id === "string" && body.device_id.trim()
      ? body.device_id.trim()
      : typeof body.deviceId === "string" && body.deviceId.trim()
        ? body.deviceId.trim()
        : DEVICE_ID;

  console.log("POST /auto/control");
  console.log("DEVICE:", deviceId);
  console.log("BODY:", body);

  if (!motor) {
    return res.status(400).json({
      success: false,
      error: "Invalid or missing motor command",
      validCommands: Array.from(VALID_COMMANDS)
    });
  }

  const queued = queueCommand(
    deviceId,
    motor,
    "AUTO"
  );

  res.json({
    success: true,
    deviceId,
    command: queued.motor,
    commandId: queued.commandId,
    source: queued.source,
    status: "queued",
    createdAt: queued.createdAt
  });
});

app.post(
  "/control",
  requireSupabaseAuth,
  requireDeviceAccess,
  (req, res) => {
    const body = req.body || {};

    const requestedCommand =
      body.motor ||
      body.command;

    const deviceId =
      typeof body.device_id === "string" && body.device_id.trim()
        ? body.device_id.trim()
        : typeof body.deviceId === "string" && body.deviceId.trim()
          ? body.deviceId.trim()
          : DEVICE_ID;

    const source =
      typeof body.source === "string" &&
      body.source.trim()
        ? body.source.trim().toUpperCase()
        : "MANUAL";

    const motor = normalizeCommand(requestedCommand);

    console.log("POST /control");
    console.log("DEVICE:", deviceId);
    console.log("BODY:", body);

    if (!motor) {
      return res.status(400).json({
        success: false,
        error: "Invalid or missing motor command",
        validCommands: Array.from(VALID_COMMANDS)
      });
    }

    const queued = queueCommand(
      deviceId,
      motor,
      source
    );

    res.json({
      success: true,
      deviceId,
      command: queued.motor,
      commandId: queued.commandId,
      source: queued.source,
      status: "queued",
      createdAt: queued.createdAt
    });
  }
);

// =========================================================
// DEVICE COMMAND COMPATIBILITY ENDPOINT
// Mobile / Dashboard -> Central Command Queue
// =========================================================

app.post(
  "/api/device/:deviceId/command",
  requireSupabaseAuth,
  requireDeviceAccess,
  (req, res) => {
    const deviceId =
  typeof req.params.deviceId === "string"
    ? req.params.deviceId.trim()
    : "";

if (!deviceId) {
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
    deviceId,
    motor,
    source
  );

    res.json({
      success: true,
      deviceId,
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
  const deviceId =
    typeof req.query.device_id === "string" &&
    req.query.device_id.trim()
      ? req.query.device_id.trim()
      : typeof req.query.deviceId === "string" &&
          req.query.deviceId.trim()
        ? req.query.deviceId.trim()
        : DEVICE_ID;

  const state = getDeviceState(deviceId);

  let motor = "STOP";

  if (state.commandPending) {
    motor = state.motor;
  }

  const response = {
    deviceId,
    motor,
    status: state.status,
    lastSeen: state.lastSeen,

    commandId:
      state.commandPending
        ? state.commandId
        : null,

    source:
      state.commandPending
        ? state.commandSource
        : null
  };

  console.log(
    "GET /control ->",
    deviceId,
    response.motor,
    response.commandId || ""
  );

  // Send the command first.
  res.json(response);

  // -------------------------------------------------------
  // Mark command as delivered after ESP32 retrieved it.
  // -------------------------------------------------------

  if (state.commandPending) {
    const deliveredCommand =
      state.motor;

    const deliveredCommandId =
      state.commandId;

    const deliveredAt =
      Date.now();

    console.log("------------------------------------");
    console.log("COMMAND DELIVERED");
    console.log("Device :", deviceId);
    console.log("Command:", deliveredCommand);
    console.log("Source :", state.commandSource);
    console.log("ID     :", deliveredCommandId);
    console.log("------------------------------------");

    state.commandPending = false;
    state.commandDeliveredAt = deliveredAt;
    state.status = "delivered";

    const stored =
      commandsByDevice.get(deviceId);

    if (
      stored &&
      stored.commandId === deliveredCommandId
    ) {
      stored.deliveredAt = deliveredAt;

      commandsByDevice.set(
        deviceId,
        stored
      );
    }

    // Do NOT reset state.motor here.
    // ESP32 telemetry remains authoritative
    // for actual motor state after delivery.

    broadcastState(deviceId);
  }
});

// =========================================================
// ESP32 STATUS UPDATE
// =========================================================

app.post("/status", (req, res) => {
  console.log("POST /status HIT");

  const data = req.body || {};

  const deviceId =
    typeof data.device_id === "string" && data.device_id.trim()
      ? data.device_id.trim()
      : typeof data.deviceId === "string" && data.deviceId.trim()
        ? data.deviceId.trim()
        : DEVICE_ID;

  const state = getDeviceState(deviceId);

  console.log("DEVICE:", deviceId);
  console.log("ESP32 STATUS BODY:", JSON.stringify(data));

  state.online = true;
  state.lastSeen = Date.now();

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

  if (!state.commandPending) {
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
    state.state = data.mode;
  } else if (data.state !== undefined) {
    state.state = data.state;
  }

  // Explicit firmware error states take priority.
  if (espMode === "ERROR") {
    state.motor = "STOP";
    state.status = "error";
  }

  // Calibration/homing are special operating states.
  else if (espMode === "HOMING") {
    state.status = "homing";
  }

  else if (espMode === "CALIBRATING") {
    state.status = "calibrating";
  }

  // Explicit moving=true is authoritative proof of motion.
  else if (espMoving) {
    state.status = "moving";
  }

  // Explicit moving=false is authoritative proof that
  // physical motion has ended, even if mode is stale.
  else if (
    hasMovingTelemetry &&
    data.moving === false
  ) {
    state.motor = "STOP";
    state.status = "idle";
  }

  // If moving telemetry is absent, use the firmware mode.
  else if (espMode === "MOVING") {
    state.status = "moving";
  }

  else if (espMode === "IDLE") {
    state.motor = "STOP";
    state.status = "idle";
  }
}

console.log("NORMALIZE RESULT", {
  motor: state.motor,
  status: state.status,
  state: state.state
});

  if (data.position !== undefined) {
    state.position = data.position;
  }

  if (data.target !== undefined) {
    state.target = data.target;
  }

  if (data.full !== undefined) {
  state.full = data.full;
}

if (data.half !== undefined) {
  state.half = data.half;
}

// Calculate physical travel percentage from authoritative
// position/full telemetry when the ESP32 does not send percent.
if (data.percent !== undefined) {
  state.percent = data.percent;
} else if (
  Number.isFinite(Number(state.position)) &&
  Number.isFinite(Number(state.full)) &&
  Number(state.full) > 0
) {
  state.percent = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (Number(state.position) /
          Number(state.full)) *
          100
      )
    )
  );
}

if (typeof data.calibrated === "boolean") {
  state.calibrated = data.calibrated;
}

if (data.firmware !== undefined) {
  state.firmware = data.firmware;
}

if (data.wifi !== undefined) {
  state.wifi = data.wifi;
}

if (data.ip !== undefined) {
  state.ip = data.ip;
}

if (data.rssi !== undefined) {
  state.rssi = data.rssi;
}

if (data.freeMemory !== undefined) {
  state.freeMemory = data.freeMemory;
}

if (data.uptime !== undefined) {
  state.uptime = data.uptime;
}

console.table({
  online: state.online,
  motor: state.motor,
  state: state.state,
  status: state.status,
  position: state.position,
  target: state.target,
  full: state.full,
  half: state.half,
  percent: state.percent,
  firmware: state.firmware,
  wifi: state.wifi,
  ip: state.ip,
  rssi: state.rssi,
  commandPending: state.commandPending
});

  broadcastState(deviceId);

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
    deviceId,

    online: state.online,
status: state.status,
state: state.state,
motor: state.motor,

position: state.position,
target: state.target,
full: state.full,
half: state.half,
percent: state.percent,

firmware: state.firmware,
wifi: state.wifi,
ip: state.ip,
rssi: state.rssi,

lastSeen: state.lastSeen,

command: {
  pending: state.commandPending,
  id: state.commandId,
  source: state.commandSource,
  createdAt: state.commandCreatedAt,
  deliveredAt: state.commandDeliveredAt
}
});
});

// =========================================================
// DEVICE PAIRING CODE REGISTRATION
// Called by the physical HonorPole after it has Internet.
// Requires per-device authentication.
// =========================================================

app.post(
  "/api/device/pairing-code",
  requireDevicePairingAuth,
  async (req, res) => {
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return res.status(503).json({
        success: false,
        error: "Device pairing is unavailable"
      });
    }

    const pairingCode =
      typeof req.body?.pairingCode === "string"
        ? req.body.pairingCode.trim().toUpperCase()
        : "";

    if (!pairingCode) {
      return res.status(400).json({
        success: false,
        error: "Pairing code is required"
      });
    }

    if (!/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(pairingCode)) {
      return res.status(400).json({
        success: false,
        error: "Invalid pairing code format"
      });
    }

    const pairingCodeHash =
      hashPairingCode(pairingCode);

    const expiresAt =
      new Date(
        Date.now() + 60 * 60 * 1000
      ).toISOString();

    try {
      const response = await fetch(
        `${SUPABASE_URL}/rest/v1/devices` +
          `?device_id=eq.${encodeURIComponent(req.deviceId)}`,
        {
          method: "PATCH",
          headers: {
            Authorization:
              `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            apikey:
              SUPABASE_SERVICE_ROLE_KEY,
            "Content-Type":
              "application/json",
            Prefer:
              "return=representation"
          },
          body: JSON.stringify({
            pairing_code_hash:
              pairingCodeHash,
            pairing_code_expires_at:
              expiresAt,
            pairing_claimed_at:
              null
          })
        }
      );

      const body = await response.text();

      if (!response.ok) {
        console.error(
          "Pairing code registration failed:",
          response.status,
          body
        );

        return res.status(502).json({
          success: false,
          error:
            "Unable to register pairing code"
        });
      }

      return res.status(200).json({
        success: true,
        deviceId: req.deviceId,
        expiresAt
      });
    } catch (error) {
      console.error(
        "Pairing code registration error:",
        error instanceof Error
          ? error.message
          : "Unknown error"
      );

      return res.status(500).json({
        success: false,
        error:
          "Pairing code registration failed"
      });
    }
  }
);

// =========================================================
// DEVICE PAIRING / CLAIM
// Claims an unpaired HonorPole for the authenticated user.
// =========================================================

app.post(
  "/api/device/register",
  requireSupabaseAuth,
  async (req, res) => {
    if (!req.user?.id) {
      return res.status(401).json({
        success: false,
        error: "Authentication required"
      });
    }

    if (!SUPABASE_SERVICE_ROLE_KEY) {
      console.error(
        "SUPABASE_SERVICE_ROLE_KEY is not configured"
      );

      return res.status(503).json({
        success: false,
        error: "Device pairing is unavailable"
      });
    }

    const pairingCode =
      typeof req.body?.pairingCode === "string"
        ? req.body.pairingCode.trim().toUpperCase()
        : "";

    const deviceName =
      typeof req.body?.deviceName === "string"
        ? req.body.deviceName.trim()
        : "";

    if (!pairingCode) {
      return res.status(400).json({
        success: false,
        error: "Pairing code is required"
      });
    }

    const pairingCodeHash =
      hashPairingCode(pairingCode);

    try {
      const deviceUrl =
        `${SUPABASE_URL}/rest/v1/devices` +
        `?pairing_code_hash=eq.${encodeURIComponent(pairingCodeHash)}` +
        `&is_active=eq.true` +
        `&select=*` +
        `&limit=1`;

      const deviceResponse = await fetch(
        deviceUrl,
        {
          method: "GET",
          headers: {
            apikey: SUPABASE_SERVICE_ROLE_KEY
          }
        }
      );

      if (!deviceResponse.ok) {
        const details =
          await deviceResponse.text();

        console.error(
          "Pairing device lookup failed:",
          deviceResponse.status,
          details
        );

        return res.status(502).json({
          success: false,
          error: "Unable to verify pairing code"
        });
      }

      const devices =
        await deviceResponse.json();

      const device = devices?.[0];

      if (!device) {
        return res.status(404).json({
          success: false,
          error: "Invalid pairing code"
        });
      }

      if (device.pairing_claimed_at) {
        return res.status(409).json({
          success: false,
          error: "Pairing code has already been used"
        });
      }

      if (
        device.pairing_code_expires_at &&
        new Date(device.pairing_code_expires_at).getTime() <
          Date.now()
      ) {
        return res.status(410).json({
          success: false,
          error: "Pairing code has expired"
        });
      }
      const serviceHeaders = {
  Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
  apikey: SUPABASE_SERVICE_ROLE_KEY,
  "Content-Type": "application/json"
};

const membershipResponse = await fetch(
  `${SUPABASE_URL}/rest/v1/device_users`,
  {
    method: "POST",
    headers: {
      ...serviceHeaders,
      Prefer: "resolution=ignore-duplicates,return=representation"
    },
    body: JSON.stringify({
      device_id: device.device_id,
      user_id: req.user.id,
      role: "admin"
    })
  }
);

if (!membershipResponse.ok) {
  const details = await membershipResponse.text();

  console.error(
    "Device membership creation failed:",
    membershipResponse.status,
    details
  );

  return res.status(502).json({
    success: false,
    error: "Unable to assign device"
  });
}

const claimedAt = new Date().toISOString();

const claimResponse = await fetch(
  `${SUPABASE_URL}/rest/v1/devices` +
    `?device_id=eq.${encodeURIComponent(device.device_id)}`,
  {
    method: "PATCH",
    headers: {
      ...serviceHeaders,
      Prefer: "return=representation"
    },
    body: JSON.stringify({
      pairing_claimed_at: claimedAt
    })
  }
);

if (!claimResponse.ok) {
  const details = await claimResponse.text();

  console.error(
    "Pairing claim update failed:",
    claimResponse.status,
    details
  );

  return res.status(502).json({
    success: false,
    error: "Unable to finalize device pairing"
  });
}


      return res.status(200).json({
        success: true,
        verified: true,
        deviceId: device.device_id,
        deviceName:
          deviceName ||
          device.name ||
          "HonorPole"
      });
    } catch (error) {
      console.error(
        "Device pairing verification failed:",
        error instanceof Error
          ? error.message
          : "Unknown error"
      );

      return res.status(500).json({
        success: false,
        error: "Device pairing failed"
      });
    }
  }
);

// =========================================================
// DEVICE DISCOVERY
// Returns every HonorPole assigned to the authenticated user.
// =========================================================

app.get("/api/devices", requireSupabaseAuth, async (req, res) => {
  if (!req.accessToken || !req.user?.id) {
    return res.status(401).json({
      success: false,
      error: "Authentication required"
    });
  }

  try {
    // -----------------------------------------------------
    // Find all device memberships for this user
    // -----------------------------------------------------

    const membershipUrl =
      `${SUPABASE_URL}/rest/v1/device_users` +
      `?user_id=eq.${encodeURIComponent(req.user.id)}` +
      `&select=device_id,role`;

    const membershipResponse = await fetch(
      membershipUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${req.accessToken}`,
          apikey: process.env.SUPABASE_ANON_KEY || ""
        }
      }
    );

    if (!membershipResponse.ok) {
      console.error(
        "Device membership lookup failed:",
        membershipResponse.status
      );

      return res.status(503).json({
        success: false,
        error: "Unable to load HonorPoles"
      });
    }

    const memberships =
      await membershipResponse.json();

    if (
      !Array.isArray(memberships) ||
      memberships.length === 0
    ) {
      return res.json([]);
    }

    const deviceIds =
      memberships
        .map(item => item.device_id)
        .filter(Boolean);

    if (deviceIds.length === 0) {
      return res.json([]);
    }

    // -----------------------------------------------------
    // Load the actual device records
    // -----------------------------------------------------

    const encodedIds =
      deviceIds
        .map(id => `"${String(id).replace(/"/g, "")}"`)
        .join(",");

    const devicesUrl =
      `${SUPABASE_URL}/rest/v1/devices` +
      `?device_id=in.(${encodeURIComponent(encodedIds)})` +
      `&select=device_id,name,city,state,zip_code,county,timezone,latitude,longitude,country,firmware_version,online,last_seen`;

    const devicesResponse = await fetch(
      devicesUrl,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${req.accessToken}`,
          apikey: process.env.SUPABASE_ANON_KEY || ""
        }
      }
    );

    if (!devicesResponse.ok) {
      console.error(
        "Device list lookup failed:",
        devicesResponse.status
      );

      return res.status(503).json({
        success: false,
        error: "Unable to load HonorPoles"
      });
    }

    const rows =
      await devicesResponse.json();

    const devices =
      Array.isArray(rows)
        ? rows.map(row => ({
            deviceId: row.device_id,
            deviceName:
              row.name || row.device_id,
            firmware:
              row.firmware_version || "--",
            serialNumber:
              row.device_id,
            online:
              row.online === true,
            lastSeen:
              String(row.last_seen || ""),

            city:
              row.city || "",
            state:
              row.state || "",
            zipCode:
              row.zip_code || "",
            county:
              row.county || "",
            timezone:
              row.timezone || "",
            latitude:
              row.latitude ?? null,
            longitude:
              row.longitude ?? null,
            country:
              row.country || "US"
          }))
        : [];

    return res.json(devices);
  }
  catch (error) {
    console.error(
      "Device discovery failed:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return res.status(503).json({
      success: false,
      error: "Unable to load HonorPoles"
    });
  }
});

// =========================================================
// DEVICE TELEMETRY COMPATIBILITY ENDPOINT
// =========================================================

app.get(
  "/api/device/:deviceId/status",
  requireSupabaseAuth,
  requireDeviceAccess,
  (req, res) => {
    const deviceId =
  typeof req.params.deviceId === "string"
    ? req.params.deviceId.trim()
    : "";

if (!deviceId) {
  return res.status(404).json({
    error: "Device not found"
  });
}

const state = getDeviceState(deviceId);

    let movement = "STOPPED";

    const motor =
      String(state.motor || "")
        .toUpperCase();

    const status =
      String(state.status || "")
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
        state.online === true,

      firmware:
        state.firmware || "--",

      hardware:
        "ESP32-S3",

      serialNumber:
        deviceId,

      deviceName:
        "HonorPole",

      currentPosition:
        state.position || 0,

      targetPosition:
        state.target || 0,

      learnedTopPosition:
        state.full || 0,

      movement,

      moving:
        status === "moving",

      automaticMode:
        true,

      calibrated:
        state.calibrated === true,

      commandStatus:
        state.status || "idle",

      command: {
        pending:
          state.commandPending,

        id:
          state.commandId,

        source:
          state.commandSource,

        createdAt:
          state.commandCreatedAt,

        deliveredAt:
          state.commandDeliveredAt
      },

      network: {
        wifiConnected:
          state.wifi === true,

        cloudConnected:
          state.online === true,

        websocketConnected:
          false,

        ssid:
          state.ssid || "",

        ipAddress:
          state.ip || "",

        signalStrength:
          state.rssi || 0
      },

      health: {
  batteryVoltage: 0,
  motorCurrent: 0,
  cpuTemperature: 0,
  freeMemory: state.freeMemory || 0,
  uptime: state.uptime || 0,

  lastHeartbeat:
    String(
      state.lastSeen || ""
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


