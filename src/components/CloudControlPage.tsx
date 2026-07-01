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

  console.error(
    "POST FAILED:",
    err
  );

  alert(
    JSON.stringify(
      {
        name: err?.name,
        message: err?.message,
        stack: err?.stack
      },
      null,
      2
    )
  );

  setStatus("Error");
}

  setLoading(null);
};

  console.log(
  "URL:",
  window.location.href
);

console.log(
  "ORIGIN:",
  window.location.origin
);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-white px-6 space-y-6">

      <h1 className="text-2xl font-bold">
        HonorPole Cloud Control
      </h1>

      {/* STATUS */}
      <div className="text-center">
        <p className="text-lg">Status:</p>
        <p className="text-xl font-bold">{status}</p>

        <div className="text-xs break-all">
          URL: {window.location.href}
        </div>

        <div className="text-xs break-all">
          Origin: {window.location.origin}
        </div>

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

<button
  onClick={() => {
    alert(
      "ONLINE: " + navigator.onLine
    );
  }}
  className="w-full p-4 rounded-lg bg-gray-600"
>
  Test Online
</button>

<button
  onClick={() => {
    window.open(
      "https://capacityhq-project-latest.onrender.com/control",
      "_blank"
    );
  }}
  className="w-full p-4 rounded-lg bg-indigo-600"
>
  Open Render
</button>
<button
  onClick={() => {
    window.location.href =
      "https://capacityhq-project-latest.onrender.com/test";
  }}
  className="w-full p-4 rounded-lg bg-pink-600"
>
  Navigate To Test
</button>

<button
  onClick={async () => {

    try {

  const r = await fetch(
    "https://capacityhq-project-latest.onrender.com/test",
    {
      method: "GET",
      headers: {
        Accept: "application/json"
      }
    }
  );

  const text = await r.text();

  alert(
    JSON.stringify(
      {
        ok: r.ok,
        status: r.status,
        body: text
      },
      null,
      2
    )
  );

} catch (e: any) {

  console.error("FAILED", e);

  alert(
    JSON.stringify(
      {
        name: e?.name,
        message: e?.message,
        stack: e?.stack,
        toString: String(e),
        keys: Object.keys(e || {})
      },
      null,
      2
    )
  );

}

  }}
  className="w-full p-4 rounded-lg bg-purple-600"
>
  Test GET
</button>

      </div>
    </div>
  );
}