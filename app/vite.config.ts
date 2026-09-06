/// <reference types="vitest/config" />
import fs from "node:fs/promises";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const devFixtureRoute = "/__bwmorpher__/fixtures/default-project.json";
const defaultDevFixturePath = path.resolve(
  import.meta.dirname,
  "dev-fixtures/default-project.morph.json",
);

function devFixturePlugin(): Plugin {
  return {
    name: "bwmorpher-dev-fixtures",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const requestPath = req.url?.split("?", 1)[0];
        if (requestPath !== devFixtureRoute) {
          next();
          return;
        }

        const fixturePath =
          process.env.BWMORPHER_DEV_FIXTURE ?? defaultDevFixturePath;
        try {
          const fixture = await fs.readFile(fixturePath);
          res.statusCode = 200;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(fixture);
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          server.config.logger.warn(
            `Could not serve dev morph fixture from ${fixturePath}: ${message}`,
          );
          res.statusCode = 404;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: "Dev morph fixture not available.",
              path: fixturePath,
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devFixturePlugin()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  worker: {
    format: "es",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
