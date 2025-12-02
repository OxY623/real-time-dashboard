# Real time dashboard

## Activate virtual env

window

`venv\Scripts\Activate.ps1`

linux `source venv/bin/activate`

exit `deactivate`

Fixed dependencies
`pip freeze > requirements.txt`
for install `pip install -r requirements.txt`

## Frontend

React, Recharts, react-use-websocket

## Backend

FastAPI, WebSockets, Uvicorn

## Architecture Overview

graph TD
A[Client: React Dashboard] <-->|WebSocket| B[Python Server]
B <--> C[(Data Source: e.g., Sensors/DB)]
