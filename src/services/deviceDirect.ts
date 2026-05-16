const DEVICE_IP = "192.168.10.32";

// ✅ FIXED STATUS
export async function getDirectDeviceStatus() {
  try {
    const res = await fetch(`http://${DEVICE_IP}/status`);

    if (!res.ok) throw new Error("Device not reachable");

    return await res.json();
  } catch (err) {
    console.error("Direct device error:", err);
    return null;
  }
}

// ✅ COMMAND (already working)
export async function sendCommand(cmd: string) {
  const url = `http://${DEVICE_IP}/cmd?c=${cmd}`;

  alert("SENDING: " + cmd);

  try {
    const res = await fetch(url);

    alert("STATUS: " + res.status);

  } catch (err) {
    alert("ERROR: " + err);
    console.error("Command error:", err);
  }
}