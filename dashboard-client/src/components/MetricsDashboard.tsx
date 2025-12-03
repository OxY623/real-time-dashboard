import { useCallback, useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import useSocketManager from "../hooks/useSocketManager";

type MetricsData = {
  cpu: number;
  memory: number;
  timestamp: number;
};

const MetricsDashboard = () => {
  const [metrics, setMetrics] = useState<MetricsData[]>([]);
  const [lastRaw, setLastRaw] = useState<string | null>(null);

  // Используем кастомный хук управления WebSocket (отправляет ping и поддерживает onMessage)
  const { readyState } = useSocketManager("ws://localhost:8000/ws", {
    onMessage: (e: MessageEvent) => {
      // Логируем и сохраняем последний raw-месседж для отладки
      console.debug("WS recv:", e.data);
      setLastRaw(String(e.data));
      // Обработка входящих сообщений и обновление состояния метрик
      if (e?.data) {
        try {
          const newData: MetricsData = JSON.parse(e.data);
          setMetrics((prev) => {
            const updated = [...prev, newData].slice(-50);
            return updated;
          });
        } catch (err) {
          console.error("Error parsing WebSocket data: ", err);
        }
      }
    },
    // Подключаемся без задержки
    autoConnect: true,
    connectDelayMs: 0,
  });

  // Простая мапа состояний WebSocket (0..3)
  const statusMap: Record<number, string> = {
    0: "connecting",
    1: "open",
    2: "closing",
    3: "closed",
  };

  useEffect(() => {
    // Логируем последний raw-месседж для отладки
    if (lastRaw) {
      console.debug("Last raw message:", lastRaw);
    }
  }, [lastRaw]);

  useEffect(() => {
    // Логируем метрики при их обновлении
    console.debug("Metrics updated:", metrics);
  }, [metrics]);

  const connectionStatus = statusMap[readyState] ?? "unknown";

  // Обработка сообщений теперь происходит через callback в useSocketManager
  useEffect(() => {
    // HINT: нет дополнительных эффектов здесь — обработка сообщений уже реализована в onMessage
  }, []);

  const formatTimestamp = useCallback((timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString(); //?
  }, []);

  return (
    <div className="dashboard">
      <h2>
        Server Metrics{" "}
        <span className={`readystate-${readyState}`}>{connectionStatus}</span>
      </h2>

      <LineChart width={800} data={metrics}>
        <CartesianGrid strokeDasharray={"3 3"} />
        <XAxis dataKey={"timestamp"} tickFormatter={formatTimestamp} />
        <YAxis yAxisId={"cpu"} orientation="left" domain={[0, 100]} />
        <YAxis yAxisId={"memory"} orientation="right" domain={[0, 20]} />
        <Tooltip />
        <Legend />
        <Line
          yAxisId="cpu"
          type="monotone"
          dataKey="cpu"
          stroke="orange"
          activeDot={{ r: 8 }}
        />
        <Line
          yAxisId={"memory"}
          type={"monotone"}
          dataKey={"memory"}
          stroke="green"
        />
      </LineChart>
    </div>
  );
};

export default MetricsDashboard;
