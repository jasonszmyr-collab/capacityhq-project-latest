import { createPortal } from "react-dom";
import { NavLink } from "react-router-dom";

const navItems = [
  { label: "\u{1F3E0}", title: "Home", path: "/" },
  { label: "\u{1F39B}\uFE0F", title: "Control", path: "/cloud" },
  { label: "\u2699\uFE0F", title: "Setup", path: "/setup" },
  { label: "\u{1F464}", title: "Settings", path: "/settings" },
];

export default function BottomNav() {
  const navigation = (
    <nav
      aria-label="Main navigation"
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        width: "100%",
        height: "72px",
        display: "flex",
        alignItems: "stretch",
        background: "rgba(10,10,10,0.96)",
        backdropFilter: "blur(18px)",
        borderTop: "1px solid rgba(255,255,255,.12)",
        zIndex: 2147483647,
        pointerEvents: "auto",
        isolation: "isolate",
      }}
    >
      {navItems.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.path === "/"}
          style={({ isActive }) => ({
            flex: "1 1 25%",
            minWidth: 0,
            height: "72px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "4px",
            color: isActive ? "#22c55e" : "#cfcfcf",
            textDecoration: "none",
            fontWeight: isActive ? 700 : 500,
            cursor: "pointer",
            touchAction: "manipulation",
            WebkitTapHighlightColor: "transparent",
            pointerEvents: "auto",
          })}
        >
          <span aria-hidden="true" style={{ fontSize: "24px", lineHeight: 1 }}>
            {item.label}
          </span>
          <span style={{ fontSize: "12px", lineHeight: 1.2 }}>
            {item.title}
          </span>
        </NavLink>
      ))}
    </nav>
  );

  return createPortal(navigation, document.body);
}
