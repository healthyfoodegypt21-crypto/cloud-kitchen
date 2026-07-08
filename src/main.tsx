import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";

createRoot(document.getElementById("root")!).render(<App />);
