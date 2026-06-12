import type { ClientEvent, ServerEvent } from "@/lib/ws-types";

type EventHandler = (event: ServerEvent) => void;
type StatusHandler = (status: "idle" | "connecting" | "connected" | "closed") => void;

export class SessionWebSocketClient {
  private socket: WebSocket | null = null;
  private eventHandler: EventHandler | null = null;
  private statusHandler: StatusHandler | null = null;

  connect() {
    if (this.socket && this.socket.readyState < WebSocket.CLOSING) {
      return;
    }

    this.statusHandler?.("connecting");
    const protocol = window.location.protocol === "https:" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/ws/session`;

    this.socket = new WebSocket(wsUrl);

    this.socket.addEventListener("open", () => {
      this.statusHandler?.("connected");
    });

    this.socket.addEventListener("message", (message) => {
      const payload = JSON.parse(message.data) as ServerEvent;
      this.eventHandler?.(payload);
    });

    this.socket.addEventListener("close", () => {
      this.statusHandler?.("closed");
    });

    this.socket.addEventListener("error", () => {
      this.statusHandler?.("closed");
    });
  }

  disconnect() {
    this.socket?.close();
    this.socket = null;
    this.statusHandler?.("closed");
  }

  send(event: ClientEvent) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket 尚未连接。");
    }
    this.socket.send(JSON.stringify(event));
  }

  onEvent(handler: EventHandler) {
    this.eventHandler = handler;
  }

  onStatusChange(handler: StatusHandler) {
    this.statusHandler = handler;
  }
}
