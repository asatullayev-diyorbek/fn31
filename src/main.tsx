import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { bootstrapFirebase } from "@/lib/firebase/client";
import { installE2ETestHooksIfDev } from "@/testHooks";
import { App } from "@/app/App";
import "@/styles/global.css";

bootstrapFirebase();
installE2ETestHooksIfDev();

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("#root element missing from index.html");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
