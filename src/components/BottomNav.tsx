import { useNavigate, useLocation } from "react-router-dom";

export default function BottomNav() {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    {
      label: "🏠",
      title: "Home",
      path: "/",
    },
    {
      label: "🎛",
      title: "Control",
      path: "/cloud",
    },
    {
      label: "⚙",
      title: "Setup",
      path: "/setup",
    },
    {
      label: "👤",
      title: "Settings",
      path: "/settings",
    },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        width: "100%",
        height: "72px",
        display: "flex",
        justifyContent: "space-evenly",
        alignItems: "center",
        background: "rgba(10,10,10,0.90)",
        backdropFilter: "blur(18px)",
        borderTop: "1px solid rgba(255,255,255,.12)",
        zIndex: 9999,
      }}
    >
      {navItems.map((item) => {
        const active =
          item.path === "/"
            ? location.pathname === "/"
            : location.pathname.startsWith(item.path);

        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              color: active ? "#22c55e" : "#cfcfcf",
              transition: ".25s",
              minWidth: "70px",
            }}
          >
            <span
              style={{
                fontSize: "24px",
              }}
            >
              {item.label}
            </span>

            <span
              style={{
                fontSize: "12px",
                fontWeight: active ? 700 : 500,
              }}
            >
              {item.title}
            </span>
          </button>
        );
      })}
    </nav>
  );
}