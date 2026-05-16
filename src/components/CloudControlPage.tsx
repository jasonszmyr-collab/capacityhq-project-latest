import { useState, useEffect } from "react";

export default function CloudControlPage() {

  const API = "http://192.168.0.169:3000";

  const [loading, setLoading] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Checking...");

  // 🔥 REAL CONNECTION CHECK
  useEffect(() => {
    const checkConnection = async () => {
      try {
        const res = await fetch(API + "/control");
        if (res.ok) {
          setStatus("Device Online");
        } else {
          setStatus("Offline");
        }
      } catch {
        setStatus("Offline");
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, []);

  const sendCommand = async (command: string) => {
    setLoading(command);
    setStatus("Sending...");

    try {
      console.log("Sending:", command);

      await fetch(API + "/control", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          motor: command,
        }),
      });

      setLastCommand(command);
      setStatus("Command Sent");

    } catch (err) {
      console.error("ERROR:", err);
      setStatus("Error");
    }

    setLoading(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-white px-6 space-y-6">

      <h1 className="text-2xl font-bold">
        HonorPole Cloud Control
      </h1>

      {/* STATUS */}
      <div className="text-center">
        <p className="text-lg">Status:</p>
        <p className="text-xl font-bold">{status}</p>

        {lastCommand && (
          <p className="text-sm mt-2">
            Last Command: {lastCommand}
          </p>
        )}
      </div>

      {/* BUTTONS */}
      <div className="w-full max-w-md space-y-4">

        <button
          onClick={() => sendCommand("UP")}
          disabled={loading !== null}
          className="w-full p-4 rounded-lg bg-blue-600"
        >
          {loading === "UP" ? "Sending..." : "Raise Flag (UP)"}
        </button>

        <button
          onClick={() => sendCommand("HALF")}
          disabled={loading !== null}
          className="w-full p-4 rounded-lg bg-yellow-500"
        >
          {loading === "HALF" ? "Sending..." : "Half Mast"}
        </button>

        <button
          onClick={() => sendCommand("DOWN")}
          disabled={loading !== null}
          className="w-full p-4 rounded-lg bg-green-600"
        >
          {loading === "DOWN" ? "Sending..." : "Lower Flag (DOWN)"}
        </button>

        <button
          onClick={() => sendCommand("STOP")}
          disabled={loading !== null}
          className="w-full p-4 rounded-lg bg-red-600"
        >
          {loading === "STOP" ? "Sending..." : "Stop"}
        </button>

      </div>
    </div>
  );
}