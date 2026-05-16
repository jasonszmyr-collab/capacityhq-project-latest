import { useNavigate, useLocation } from "react-router-dom";
import { useSystemStatus } from "../services/useSystemStatus";

export default function AppHeader({ title }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isOnline, compliance } = useSystemStatus();

  const mainRoutes = ["/", "/cloud", "/setup", "/wifi"];
  const isMainRoute = mainRoutes.includes(location.pathname);

  const handleBack = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate("/");
  };

  return (
    <div className="fixed top-0 left-0 w-full z-50 flex items-center justify-between px-6 py-4 bg-black/50 backdrop-blur border-b border-white/10">

      {/* BACK */}
      {!isMainRoute ? (
        <button onClick={handleBack} className="text-white text-sm">
          ← Back
        </button>
      ) : <div />}

      {/* TITLE */}
      <h1 className="absolute left-1/2 -translate-x-1/2 text-white font-semibold">
        {title}
      </h1>

      {/* RIGHT */}
      <div className="flex items-center gap-3">

        <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
          compliance === "HALF"
            ? "bg-yellow-400 text-black"
            : "bg-green-500 text-white"
        }`}>
          🇺🇸 {compliance === "HALF" ? "Half Mast" : "Full Mast"}
        </div>

        <div className="flex items-center gap-2 text-xs text-white/80">
          <div className={`w-2 h-2 rounded-full ${
            isOnline ? "bg-green-400 animate-pulse" : "bg-red-500"
          }`} />
          {isOnline ? "Online" : "Offline"}
        </div>

      </div>
    </div>
  );
}