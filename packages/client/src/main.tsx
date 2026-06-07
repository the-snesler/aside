import { createRoot } from "react-dom/client";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

// No StrictMode: it double-invokes effects in dev, which would open two SSE
// connections and race the single-instance RxDB database.
createRoot(root).render(<App />);
