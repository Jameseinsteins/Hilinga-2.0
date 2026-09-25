#!/usr/bin/env node
// Hilinga Autorun — watches vite.config.ts / tsconfig.json / .env and restarts `npm run dev`.
// Usage: node scripts/hilinga-autorun.mjs
// Keep this running instead of `npm run dev` when you are tweaking config/env.
import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname ?? ".", "..");
const WATCH_FILES = ["vite.config.ts", "tsconfig.json", ".env", "package.json"].map(f => resolve(ROOT, f));

let child = null;
let restarting = false;
let debounce = null;

function start() {
  if (child) return;
  console.log("\x1b[36m[hilinga-autorun]\x1b[0m starting \u2192 npm run dev");
  child = spawn("npm", ["run", "dev"], { cwd: ROOT, stdio: "inherit", shell: true });
  child.on("exit", (code, sig) => {
    console.log(`\x1b[33m[hilinga-autorun] dev exited code=${code} sig=${sig}\x1b[0m`);
    child = null;
    if (!restarting) {
      console.log("[hilinga-autorun] not restarting — exit with Ctrl+C or rerun node scripts/hilinga-autorun.mjs");
    }
  });
}

function scheduleRestart(reason) {
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(async () => {
    if (!child || restarting) return;
    restarting = true;
    console.log(`\x1b[35m[hilinga-autorun] ${reason} changed \u2014 restarting dev server\x1b[0m`);
    child.kill("SIGTERM");
    await new Promise(r => setTimeout(r, 900));
    try { child.kill("SIGKILL"); } catch {}
    child = null;
    restarting = false;
    start();
  }, 500);
}

start();

for (const f of WATCH_FILES) {
  try {
    watch(f, (ev) => {
      if (ev === "change") scheduleRestart(f.split(/[/\\]/).pop());
    });
    console.log(`[hilinga-autorun] watching ${f}`);
  } catch (e) {
    console.warn(`[hilinga-autorun] cannot watch ${f}: ${e.message}`);
  }
}

process.on("SIGINT", () => {
  console.log("\n[hilinga-autorun] SIGINT — stopping");
  if (child) child.kill("SIGTERM");
  process.exit(0);
});
process.on("SIGTERM", () => {
  if (child) child.kill("SIGTERM");
  process.exit(0);
});
