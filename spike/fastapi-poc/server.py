"""
FastAPI + uvicorn PoC server for the Electron loopback HTTP spike.

Startup protocol:
  1. Bind to 127.0.0.1:0 so the OS picks a free port.
  2. After uvicorn is fully listening, print:
       {"type":"event","name":"ready","port":<N>}
  3. Electron reads that line, then calls GET /health to confirm the round-trip.

Endpoints
---------
GET /health       -> 200 {"status":"ok"}
GET /stream/test  -> text/event-stream with 5 progress events, then EOF
"""

import asyncio
import json
import socket
import sys

import uvicorn
from fastapi import FastAPI
from fastapi.responses import StreamingResponse

app = FastAPI()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/stream/test")
async def stream_test():
    async def _events():
        for i in range(1, 6):
            data = json.dumps({"type": "progress", "step": i, "total": 5})
            yield f"data: {data}\n\n"
            await asyncio.sleep(0.2)

    return StreamingResponse(_events(), media_type="text/event-stream")


class _ReadyNotifyServer(uvicorn.Server):
    """Prints the ready event to stdout after uvicorn starts listening."""

    async def startup(self, sockets=None):
        await super().startup(sockets)
        if self.should_exit:
            return
        for server in self.servers:
            for sock in server.sockets:
                port = sock.getsockname()[1]
                sys.stdout.write(
                    json.dumps({"type": "event", "name": "ready", "port": port}) + "\n"
                )
                sys.stdout.flush()
                return


if __name__ == "__main__":
    # Pre-bind to port 0 so the OS assigns a free port before we hand it to uvicorn.
    # We keep the socket open (no close) so the port stays reserved until uvicorn
    # calls listen() on it inside startup().
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", 0))

    config = uvicorn.Config(app, log_level="warning")
    server = _ReadyNotifyServer(config)
    server.run(sockets=[sock])
