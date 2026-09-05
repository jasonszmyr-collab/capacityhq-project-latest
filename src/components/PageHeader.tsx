import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "../services/supabaseClient";

export default function AppHeader({ title }: { title: string }) {
  const navigate = useNavigate();
  const location = useLocation();

  const isHome = location.pathname === "/";

  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error("Logout failed:", error);
        return;
      }

      localStorage.removeItem("demoMode");

      // App.tsx listens for Supabase SIGNED_OUT and will
      // automatically render the Login screen.
      navigate("/", { replace: true });
    } catch (error) {
      console.error("Unexpected logout error:", error);
    }
  };

  return (
    <div className="fixed top-0 left-0 w-full z-50 h-14 flex items-center px-4 bg-black/60 backdrop-blur border-b border-white/10">

      {/* LEFT */}
      <div className="w-1/3 flex justify-start">
        {!isHome && (
          <button
            onClick={handleBack}
            className="text-white text-lg px-2 py-1"
            aria-label="Go back"
          >
            ←
          </button>
        )}
      </div>

      {/* CENTER */}
      <div className="w-1/3 flex justify-center">
        <h1 className="text-white font-semibold text-lg">
          {title}
        </h1>
      </div>

      {/* RIGHT */}
      <div className="w-1/3 flex justify-end">
        <button
          onClick={() => {
            void handleLogout();
          }}
          className="text-xs text-white bg-white/10 px-3 py-1 rounded-lg"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}