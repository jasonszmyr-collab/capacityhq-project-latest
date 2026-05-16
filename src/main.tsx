import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom"; // 👈 ADD THIS
import "./index.css";
import App from "./App.tsx";
import { queryClient } from "./lib/query-client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter> {/* 👈 ADD THIS */}
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>
);