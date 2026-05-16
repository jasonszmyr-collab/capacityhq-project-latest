import { useNavigate, useLocation } from "react-router-dom";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    { label: "Home", path: "/" },
    { label: "Cloud", path: "/cloud" },
    { label: "Setup", path: "/setup" },
    { label: "WiFi", path: "/wifi" },
  ];

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        width: "100%",
        height: "60px",
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        background: "rgba(0,0,0,0.7)",
        backdropFilter: "blur(10px)",
        zIndex: 9999,
      }}
    >
      {navItems.map((item) => {
        const active = location.pathname.startsWith(item.path);

        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              color: active ? "#4ade80" : "white",
              background: "none",
              border: "none",
              fontSize: "14px",
              cursor: "pointer",
              fontWeight: active ? "600" : "400",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}