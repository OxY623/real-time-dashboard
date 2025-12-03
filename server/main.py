import os
import json
import asyncio
import logging
import time
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import uuid


BROADCAST_INTERVAL = 0.5  # 500ms

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("WebSocketServer")


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, WebSocket] = {}
        self.lock: asyncio.Lock = asyncio.Lock()
        self.last_broadcast_time = 0

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        conn_id = str(uuid.uuid4())
        async with self.lock:
            self.active_connections[conn_id] = websocket
        logger.info(f"New connection: {conn_id}")
        return conn_id

    async def disconnect(self, conn_id: str):
        if conn_id in self.active_connections:
            async with self.lock:
                del self.active_connections[conn_id]
            logger.info(f"Disconnected: {conn_id}")

    async def broadcast(self, message: str):
        current_time = asyncio.get_event_loop().time()
        if current_time - self.last_broadcast_time > BROADCAST_INTERVAL:
            self.last_broadcast_time = current_time
            # Логируем количество получателей и само сообщение в debug
            logger.info(
                f"Broadcasting message to {len(self.active_connections)} connections"
            )
            for conn_id, connection in list(self.active_connections.items()):
                try:
                    await connection.send_text(message)
                except Exception as e:
                    logger.error(f"Error sending to {conn_id}: {e}")
                    await self.disconnect(conn_id)

    async def close_all(self):
        # Правильная итерация по ключам словаря соединений
        for conn_id in list(self.active_connections.keys()):
            await self.disconnect(conn_id)
        self.active_connections.clear()
        logger.info("All active connections closed")


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
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "ws://localhost:3000",
        "ws://127.0.0.1:3000",
        "ws://localhost:3000/ws",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for real-time communication"""
    logger.info(f"WebSocket connection attempt from {websocket.client}")
    conn_id = await manager.connect(websocket)
    try:
        # Просто держим соединение открытым, не требуя никаких сообщений от клиента.
        # Сервер рассылает данные через broadcast(), клиент только слушает.
        # Используем asyncio.sleep() вместо receive_text() для периодической проверки
        # состояния соединения, но не требуя явных сообщений.
        while True:
            await asyncio.sleep(1)  # Проверяем соединение каждую секунду
    except WebSocketDisconnect:
        await manager.disconnect(conn_id)


async def generate_sensor_data():
    """Simulates server metrics stream"""
    import random

    # Используем unix-время (секунды с 1970) — это ожидаемый формат для клиента
    while True:
        await asyncio.sleep(1)  # Emit every second
        data = json.dumps(
            {
                "cpu": random.uniform(0, 100),
                "memory": random.uniform(1, 16),
                "timestamp": int(time.time()),
            }
        )
        # Логируем сообщение в DEBUG и рассылаем
        logger.debug(f"Broadcast: {data}")
        await manager.broadcast(data)
