// src/config/appConfig.ts

export const AppConfig = {
  APP_NAME: "HonorPole",
  VERSION: "2.0.0",

  CLOUD_URL: "https://capacityhq-project-latest.onrender.com",

  AP: {
    SSID: "HonorPole-Setup",
    IP: "http://192.168.4.1",
    TIMEOUT: 10000
  },

  DEVICE: {
    DEFAULT_NAME: "HonorPole",
    MDNS: "honorpole.local"
  },

  API: {
    STATUS: "/status",
    SCAN: "/scan",
    SAVE_WIFI: "/save",
    COMMAND: "/control",
    CALIBRATION: "/api/calibration",
    CALIBRATION_STATUS: "/api/calibration/status",
    DIAGNOSTICS: "/diagnostics"
  },

  HEARTBEAT: {
    INTERVAL: 5000,
    OFFLINE_TIMEOUT: 15000
  }
};