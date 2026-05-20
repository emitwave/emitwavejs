// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EventMap = { [key: string]: (...args: any[]) => void };

export class TypedEmitter<T extends EventMap = EventMap> {
  private listeners = new Map<keyof T, Set<T[keyof T]>>();

  on<K extends keyof T>(event: K, callback: T[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.off(event, callback);
  }

  once<K extends keyof T>(event: K, callback: T[K]): () => void {
    const wrapper = ((...args: any[]) => {
      this.off(event, wrapper as T[K]);
      (callback as Function)(...args);
    }) as T[K];
    return this.on(event, wrapper);
  }

  off<K extends keyof T>(event: K, callback: T[K]): void {
    this.listeners.get(event)?.delete(callback);
  }

  emit<K extends keyof T>(event: K, ...args: Parameters<T[K]>): void {
    this.listeners.get(event)?.forEach((cb) => {
      (cb as Function)(...args);
    });
  }

  removeAllListeners(event?: keyof T): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}
