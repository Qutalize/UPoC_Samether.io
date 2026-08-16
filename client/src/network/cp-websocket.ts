import type { ClientMsg, ServerMsg } from "./protocol";

/**
 * CP 専用の WebSocket 接続。
 * ゲーム用の `net` シングルトンとは完全に独立しており、
 * CP 計測中にサメが生成されたりゲーム状態に干渉することがない。
 */
export class CPNetClient {
  private ws: WebSocket | null = null;
  private handlers: Array<(m: ServerMsg) => void> = [];
  private closeHandlers: Array<() => void> = [];
 
  connect(): Promise<void> {
    // 既存の接続があれば閉じる
    this.disconnect();

    return new Promise((resolve, reject) => {
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      const backendHost = import.meta.env.VITE_WS_URL ?? location.host;
      const url = `${proto}//${backendHost}/ws`;
      const ws = new WebSocket(url);
      ws.onopen = () => {
        this.ws = ws;
        resolve();
      };
      ws.onerror = (e) => reject(e);
      ws.onmessage = (ev) => {
        try {
          const raw = JSON.parse(ev.data);
          if (
            raw &&
            typeof raw.type === "string" &&
            raw.payload &&
            typeof raw.payload === "object" &&
            !Array.isArray(raw.payload)
          ) {
            const msg = raw as ServerMsg;
            for (const h of this.handlers) h(msg);
          }
        } catch {
          /* ignore malformed */
        }
      };
      ws.onclose = () => {
        this.ws = null;
        for (const h of this.closeHandlers) h();
      };
    });
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(msg: ClientMsg): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  onMessage(h: (m: ServerMsg) => void): void {
    this.handlers.push(h);
  }

  offMessage(h: (m: ServerMsg) => void): void {
    this.handlers = this.handlers.filter((fn) => fn !== h);
  }

  onClose(h: () => void): void {
    this.closeHandlers.push(h);
  }

  offClose(h: () => void): void {
    this.closeHandlers = this.closeHandlers.filter((fn) => fn !== h);
  }

  /** Wait for a specific message type. Rejects after timeout or disconnect. */
  waitFor<T extends ServerMsg["type"]>(
    type: T,
    timeout = 10_000,
  ): Promise<Extract<ServerMsg, { type: T }>> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        this.offMessage(msgHandler);
        this.offClose(closeHandler);
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`timeout waiting for ${type}`));
      }, timeout);
      const msgHandler = (msg: ServerMsg) => {
        if (msg.type === type) {
          cleanup();
          resolve(msg as Extract<ServerMsg, { type: T }>);
        }
      };
      const closeHandler = () => {
        cleanup();
        reject(new Error(`disconnected while waiting for ${type}`));
      };
      this.handlers.push(msgHandler);
      this.closeHandlers.push(closeHandler);
    });
  }

  isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}
