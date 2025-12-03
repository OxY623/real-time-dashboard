import { useEffect, useRef, useState } from "react";

// Хук управления WebSocket-соединением
// Параметры: url - адрес WS, options.onMessage - колбэк для сообщений
const useSocketManager = (
  url: string,
  options: {
    onMessage?: (e: MessageEvent) => void;
    autoConnect?: boolean; // автоматически подключаться при монтировании
    connectDelayMs?: number; // задержка перед созданием соединения (ms)
  } = {}
) => {
  const CONNECTING = 0;
  const OPEN = 1;

  const ws = useRef<WebSocket | null>(null);

  const reconnectAttempts = useRef(0);
  const initializedRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  // Локальный стейт для состояния соединения (0/1/2/3 как в WebSocket)
  const [readyState, setReadyState] = useState<number>(CONNECTING);

  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Флаг, показывающий, что компонент всё ещё смонтирован
  const isMountedRef = useRef(true);
  // Таймер для отложенного реконнекта (чтобы можно было его очистить)
  const reconnectTimeoutRef = useRef<number | null>(null);
  // Флаг, показывающий, что мы сами вызываем .close() (чтобы игнорировать onerror)
  const selfClosingRef = useRef(false);
  // Таймаут для отложенного создания соединения
  const connectTimeoutRef = useRef<number | null>(null);

  const startPing = () => {
    if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    // Проверяем, что ws.current всё ещё валиден перед отправкой
    pingIntervalRef.current = setInterval(() => {
      if (ws.current && ws.current.readyState === OPEN) {
        try {
          ws.current.send("ping");
        } catch (err) {
          // Игнорируем ошибки отправки в период гонки закрытия/открытия
          console.debug("Ping send failed:", err);
        }
      }
    }, 1000); // ping каждую секунду
  };

  const stopPing = () => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  };

  const connect = () => {
    console.log("[WS] Connecting to", url);
    ws.current = new WebSocket(url);
    // Обработчик открытия соединения
    ws.current.onopen = () => {
      console.log("[WS] Connected");
      reconnectAttempts.current = 0;
      setReadyState(ws.current?.readyState ?? OPEN);
      startPing();
    };

    // Обработчик входящих сообщений - проксируем наружу через options.onMessage
    ws.current.onmessage = (e: MessageEvent) => {
      try {
        options.onMessage?.(e);
      } catch (err) {
        console.error("[WS] Error in onMessage handler:", err);
      }
    };

    ws.current.onerror = (event: Event) => {
      // Игнорируем ошибки, если мы сами закрываем сокет (чистый unmount)
      if (selfClosingRef.current || !isMountedRef.current) return;
      console.error("[WS] Error event:", event);
      console.error("[WS] WS readyState:", ws.current?.readyState);
      setReadyState(ws.current?.readyState ?? CONNECTING);
    };

    ws.current.onclose = (event) => {
      // При закрытии соединения останавливаем ping
      console.log("[WS] Closed, code:", event.code, "reason:", event.reason);
      stopPing();
      setReadyState(ws.current?.readyState ?? 3);
      // Если это было намеренное закрытие (selfClosing), не планируем реконнект
      if (!isMountedRef.current || selfClosingRef.current) return;
      const delay = Math.min(
        1000 * Math.pow(2, reconnectAttempts.current),
        30_000
      );
      // Сохраняем id таймаута, чтобы можно было его очистить при размонтировании
      reconnectTimeoutRef.current = window.setTimeout(() => {
        reconnectAttempts.current += 1;
        // Перед вызовом connect проверяем, что компонент всё ещё смонтирован
        if (isMountedRef.current) connectRef.current();
      }, delay);
    };
  };

  // Сохраняем функцию connect в ref для использования в замыканиях обработчиков
  connectRef.current = connect;

  // Используем initializedRef для гарантирования одноразовой инициализации
  // несмотря на перезапуск эффекта при изменении url/options (StrictMode double-mount)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    // отмечаем, что компонент смонтирован
    isMountedRef.current = true;
    selfClosingRef.current = false;

    // если авто-подключение отключено, ждём ручного вызова connect
    if (options.autoConnect === false) return undefined;

    // Инициализируем только один раз (защита от StrictMode double-mount)
    if (initializedRef.current) return undefined;
    initializedRef.current = true;

    const delay = options.connectDelayMs ?? 0;
    // откладываем создание соединения на короткий интервал (если указан)
    connectTimeoutRef.current = window.setTimeout(() => {
      if (isMountedRef.current) {
        connect();
      }
    }, delay);

    return () => {
      // при размонтировании выключаем флаг, помечаем что мы сами закрываем соединение,
      // чтобы игнорировать события onerror/onclose, затем закрываем и очищаем таймеры
      isMountedRef.current = false;
      selfClosingRef.current = true;
      try {
        ws.current?.close();
      } catch (err) {
        // Игнорируем возможные ошибки при закрытии
      }
      stopPing();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (connectTimeoutRef.current) {
        clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    // Функция отправки данных (обёртка JSON.stringify)
    send: (data: any) => {
      if (ws.current?.readyState === OPEN) {
        ws.current.send(JSON.stringify(data));
      }
    },
    // Текущее состояние соединения, совпадает со значениями WebSocket.readyState
    readyState,
  };
};

export default useSocketManager;
