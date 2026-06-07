import { useState } from "react";

export default function CloudControlPage() {

  const API = "https://capacityhq-project-latest.onrender.com";

  const [loading, setLoading] = useState<string | null>(null);
  const [lastCommand, setLastCommand] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Connected");

  const sendCommand = async (command: string) => {

  console.log("Sending:", command);

  setLoading(command);
  setStatus("Sending...");

  try {

    const res = await fetch(
      API + "/control",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          motor: command
        })
      }
    );

    console.log(
      "HTTP Status:",
      res.status
    );

    const text =
      await res.text();

    console.log(
      "Response:",
      text
    );

    if (!res.ok) {

      setStatus(
        "HTTP " + res.status
      );

      return;
    }

    setLastCommand(command);
    setStatus("Sent");

  } catch (err: any) {

  console.error("POST FAILED", err);

  alert(
    "POST FAILED:\n" +
    String(err) +
    "\n\n" +
    JSON.stringify(err, null, 2)
  );

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