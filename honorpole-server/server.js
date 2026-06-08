const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"]
}));

app.use(express.json());

// In-memory state (simple for now)
let deviceState = {
  motor: "OFF",
  speed: 0,
  lastSeen: null
};

// 📥 ESP32 sends status
app.post("/status", (req, res) => {
  deviceState = {
    ...deviceState,
    ...req.body,
    lastSeen: new Date()
  };
  console.log("ESP32 status:", deviceState);
  res.sendStatus(200);
});

// 📤 ESP32 fetches commands
app.get("/control", (req, res) => {
  res.json({
    motor: deviceState.motor,
    speed: deviceState.speed
  });
});

// 📱 App sends control command
app.post("/control", (req, res) => {
  deviceState.motor = req.body.motor;
  deviceState.speed = req.body.speed;
  console.log("New command:", deviceState);
  res.sendStatus(200);
});

app.get("/test", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.send("HELLO");
});

// 📱 App fetches status
app.get("/status", (req, res) => {
  res.json(deviceState);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});