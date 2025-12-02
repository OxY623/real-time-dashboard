import os
import json
import asyncio
import logging
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import uuid

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WebSocketServer")


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        conn_id = str(uuid.uuid4())
        self.active_connections[conn_id] = websocket
        logger.info(f"New connection: {conn_id}")
        return conn_id

    async def disconnect(self, conn_id: str):
        if conn_id in self.active_connections:
            del self.active_connections[conn_id]
            logger.info(f"Disconnected: {conn_id}")

    async def broadcast(self, message: str):
        for conn_id, connection in self.active_connections.copy().items():
            try:
                await connection.send_text(message)
            except RuntimeError as e:
                logger.error(f"Error sending to {conn_id}: {e}")
                await self.disconnect(conn_id)


manager = ConnectionManager()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start data simulation task
    task = asyncio.create_task(generate_sensor_data())
    yield
    # Cleanup
    task.cancel()


app = FastAPI(lifespan=lifespan)

# Configure CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    conn_id = await manager.connect(websocket)
    try:
        while True:
            # Keep connection open (handle pings)
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(conn_id)


async def generate_sensor_data():
    """Simulates server metrics stream"""
    import random

    while True:
        await asyncio.sleep(1)  # Emit every second
        data = json.dumps(
            {
                "cpu": random.uniform(0, 100),
                "memory": random.uniform(1, 16),
                "timestamp": int(asyncio.get_event_loop().time()),
            }
        )
        await manager.broadcast(data)
        logger.debug(f"Broadcast: {data}")
