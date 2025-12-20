import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Ensure dark mode is always enabled for OLED battery saving
document.documentElement.classList.add('dark');

createRoot(document.getElementById("root")!).render(<App />);
