import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
import i18n, { languageReady } from "@/i18n";
import "@/pwa/register";
import { App } from "@/app/App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element #root not found");
}

const root = createRoot(rootElement);
root.render(
  <p role="status" className="p-6 text-sm text-muted-foreground">
    {i18n.t("shell.loading")}
  </p>,
);

void languageReady.then(() =>
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);
