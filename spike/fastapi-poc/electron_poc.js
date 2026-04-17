/**
 * Standalone Node.js handshake PoC — does NOT require Electron.
 * Run with:  node electron_poc.js
 *
 * What it verifies:
 *   1. Python subprocess spawns and prints a ready event with the port.
 *   2. GET /health returns 200 {"status":"ok"}.
 *   3. GET /stream/test delivers exactly 5 SSE events then closes.
 */

"use strict";

const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const SERVER_SCRIPT = path.join(__dirname, "server.py");
const PYTHON = process.platform === "win32" ? "python" : "python3";
const READY_TIMEOUT_MS = 10_000;

// ── spawn ────────────────────────────────────────────────────────────────────

console.log("[poc] spawning FastAPI server…");
const py = spawn(PYTHON, [SERVER_SCRIPT], { stdio: ["pipe", "pipe", "pipe"] });

py.on("error", (err) => {
  console.error("[poc] spawn error:", err.message);
  process.exit(1);
});
py.on("exit", (code, signal) => {
  if (code !== null) console.log(`[poc] python exited (code ${code})`);
  else console.log(`[poc] python killed (signal ${signal})`);
});
py.stderr.on("data", (d) => process.stderr.write(`[python] ${d}`));

// ── ready handshake ──────────────────────────────────────────────────────────

const readyTimer = setTimeout(() => {
  console.error(`[poc] timeout — no ready event within ${READY_TIMEOUT_MS} ms`);
  teardown(1);
}, READY_TIMEOUT_MS);

let stdoutBuf = "";

py.stdout.on("data", (chunk) => {
  stdoutBuf += chunk.toString();
  const lines = stdoutBuf.split("\n");
  stdoutBuf = lines.pop(); // keep any incomplete trailing fragment

  for (const line of lines) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      console.log(`[python/stdout] ${line}`);
      continue;
    }
    if (event.type === "event" && event.name === "ready") {
      clearTimeout(readyTimer);
      console.log(`[poc] ready — port ${event.port}`);
      verifyHealth(event.port);
    }
  }
});

// ── health check ─────────────────────────────────────────────────────────────

function verifyHealth(port) {
  const url = `http://127.0.0.1:${port}/health`;
  console.log(`[poc] GET ${url}`);

  http
    .get(url, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => {
        console.log(`[poc] status ${res.statusCode}  body ${body}`);
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          console.error("[poc] health FAILED — response is not JSON");
          return teardown(1);
        }
        if (res.statusCode === 200 && parsed.status === "ok") {
          console.log("[poc] health check PASSED");
          verifySse(port);
        } else {
          console.error("[poc] health check FAILED");
          teardown(1);
        }
      });
    })
    .on("error", (err) => {
      console.error("[poc] health error:", err.message);
      teardown(1);
    });
}

// ── SSE check ────────────────────────────────────────────────────────────────

function verifySse(port) {
  const url = `http://127.0.0.1:${port}/stream/test`;
  console.log(`[poc] GET ${url}  (SSE)`);

  let eventCount = 0;

  http
    .get(url, (res) => {
      res.on("data", (chunk) => {
        for (const line of chunk.toString().split("\n")) {
          if (!line.startsWith("data:")) continue;
          eventCount += 1;
          console.log(`[poc] SSE event ${eventCount}: ${line.slice(5).trim()}`);
        }
      });
      res.on("end", () => {
        if (eventCount === 5) {
          console.log("[poc] SSE test PASSED (5 events received)");
          teardown(0);
        } else {
          console.error(`[poc] SSE test FAILED — expected 5, got ${eventCount}`);
          teardown(1);
        }
      });
    })
    .on("error", (err) => {
      console.error("[poc] SSE error:", err.message);
      teardown(1);
    });
}

// ── cleanup ───────────────────────────────────────────────────────────────────

function teardown(code) {
  if (!py.killed) py.kill();
  process.exit(code);
}
