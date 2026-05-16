const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
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

// 📱 App fetches status
app.get("/status", (req, res) => {
  res.json(deviceState);
});

app.listen(3000, () => {
  console.log("Server running on port 3000");
});