import { useState } from "react";
import { useNavigate } from "react-router-dom"; // ✅ ADD THIS

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tapCount, setTapCount] = useState(0);

  const navigate = useNavigate(); // ✅ ADD THIS

  const DEMO_USER = "jasonszmyr@honorpoleinnovations.com";
  const DEMO_PASS = "test1234";

  const handleLogin = () => {
    const normalizedEmail = email.trim().toLowerCase();

    if (
      normalizedEmail === DEMO_USER.toLowerCase() &&
      password === DEMO_PASS
    ) {
      localStorage.setItem("demoMode", "true");
      navigate("/home"); // ✅ FIXED
    } else {
      alert("Invalid login. Use credentials provided in Play Console.");
    }
  };

  const handleDemoLogin = () => {
    console.log("DEMO CLICKED"); // 🔍 debug
    localStorage.setItem("demoMode", "true");
    navigate("/home"); // ✅ FIXED
  };

  const handleHiddenTap = () => {
    const newCount = tapCount + 1;
    setTapCount(newCount);

    setTimeout(() => setTapCount(0), 1500);

    if (newCount >= 5) {
      setTapCount(0);
      localStorage.setItem("demoMode", "true");
      navigate("/home"); // ✅ FIXED
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md p-8 rounded-2xl border shadow-lg bg-white">

        <h2
          onClick={handleHiddenTap}
          className="text-2xl font-semibold mb-6 text-center cursor-pointer"
        >
          HonorPole Login
        </h2>

        <h2 style={{ color: "red" }}>NEW BUILD TEST</h2>

        <div className="space-y-4">

          <input
            className="w-full p-3 border rounded-lg"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full p-3 border rounded-lg"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            onClick={handleLogin}
            className="w-full py-3 rounded-lg bg-black text-white font-medium hover:opacity-90"
          >
            Login
          </button>

          <button
            onClick={() => {
            alert("BUTTON CLICKED");
            console.log("DEMO CLICKED");

            localStorage.setItem("demoMode", "true");
            window.location.href = "/home"; // force navigation
          }}
>
          Continue as Demo
        </button>

        </div>
      </div>
    </div>
  );
}