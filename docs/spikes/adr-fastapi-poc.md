# ADR — FastAPI + Electron Loopback HTTP PoC

**Spike**: #5  
**Status**: Complete — Phase 1 unblocked  
**Date**: 2026-04-17  
**Canonical decision entry**: DECISIONS.md D16 (summary) and D02 (architecture)

---

## Context

D02 specifies FastAPI on `127.0.0.1:0` as the IPC channel between Electron and the Python engine. Before committing Phase 1 to that design, spike #5 needed to prove three things on a real Windows 11 Enterprise host:

1. The startup handshake (spawn → port-read → `/health`) works as designed.
2. Loopback HTTP is not intercepted or blocked by enterprise network policy.
3. SSE (`text/event-stream`) delivers events correctly over loopback.

---

## What was built

`spike/fastapi-poc/` contains three files:

| File | Purpose |
|------|---------|
| `server.py` | FastAPI + uvicorn server binding to `127.0.0.1:0`; `_ReadyNotifyServer` subclass emits `{"type":"event","name":"ready","port":N}` to stdout after the socket is listening |
| `electron_poc.js` | Standalone Node.js script (no Electron required): spawns Python, reads the ready event, calls `/health`, then streams `/stream/test` |
| `test_server.py` | 7 pytest tests covering `/health` (status, body, content-type) and `/stream/test` (status, content-type, event count, event shape) |

### Startup handshake

```
Electron spawns Python  →  uvicorn binds to :0
  →  OS assigns ephemeral port
  →  server.py prints {"type":"event","name":"ready","port":XXXX}\n
  →  Electron reads line, calls GET 127.0.0.1:{port}/health
  →  200 {"status":"ok"}
```

---

## Findings

### Loopback and enterprise firewall

`127.0.0.1` loopback traffic never crosses a network interface. Windows Firewall (including enterprise GPO profiles) only filters packets that cross an interface adapter. **No firewall prompts were observed** on Windows 11 Enterprise.

Enterprise TLS-inspection proxies (Zscaler, Blue Coat) operate by intercepting traffic at the network adapter level. They cannot intercept plain HTTP on loopback — and there is no benefit to HTTPS for traffic that never leaves the process boundary.

Port-0 binding eliminates hard-coded port collisions: each app instance gets its own OS-assigned ephemeral port.

### SSE

`GET /stream/test` delivers 5 events correctly over loopback. The `electron_poc.js` implementation buffers partial SSE lines across TCP chunks (SSE data can be split across packets at low buffer sizes). Manual spot-check command:

```sh
curl -N http://127.0.0.1:{port}/stream/test
```

### Automated tests

7 tests, all passing:

```
tests/TestHealth::test_returns_200          PASS
tests/TestHealth::test_body_is_status_ok    PASS
tests/TestHealth::test_content_type_is_json PASS
tests/TestStreamTest::test_returns_200                  PASS
tests/TestStreamTest::test_content_type_is_event_stream PASS
tests/TestStreamTest::test_emits_exactly_five_events    PASS
tests/TestStreamTest::test_events_have_correct_structure PASS
```

---

## Outstanding gap

**Cancel + restart** (SSE cancel-flag polling between CLIMADA steps) was not tested in this PoC. The plan notes this as a Phase 1 risk: "start → cancel → restart" against the `asyncio.Lock` single-job contract. Tracked on issue #12 (Phase 1 Area 2).

**Third-party endpoint-protection agents** (CrowdStrike, Carbon Black): not tested. D16 flags this as deferred; tracked on issue #24.

---

## Decision

The D02 architecture is confirmed viable on Windows 11 Enterprise. Phase 1 Areas 1, 2, and 5 are unblocked. See DECISIONS.md D16 for the canonical summary entry.
