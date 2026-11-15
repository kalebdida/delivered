/**
 * Namespaced localStorage that never throws (private mode, blocked storage, SSR).
 * Every key in the project is `delivered:<namespace>:<key>`.
 */
export interface Store {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  remove(key: string): void;
}

const memory = new Map<string, string>();

function raw(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function rawGet(fullKey: string): string | null {
  try {
    return raw()?.getItem(fullKey) ?? memory.get(fullKey) ?? null;
  } catch {
    return memory.get(fullKey) ?? null;
  }
}

export function rawSet(fullKey: string, value: string): void {
  memory.set(fullKey, value);
  try {
    raw()?.setItem(fullKey, value);
  } catch {
    /* storage full or blocked: memory fallback already holds it */
  }
}

export function rawRemove(fullKey: string): void {
  memory.delete(fullKey);
  try {
    raw()?.removeItem(fullKey);
  } catch {
    /* ignore */
  }
}

/** Create a store for one namespace, e.g. `createStore('wretched')` → keys `delivered:wretched:*`. */
export function createStore(namespace: string): Store {
  const k = (key: string) => `delivered:${namespace}:${key}`;
  return {
    get<T>(key: string, fallback: T): T {
      const v = rawGet(k(key));
      if (v === null) return fallback;
      try {
        return JSON.parse(v) as T;
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      rawSet(k(key), JSON.stringify(value));
    },
    remove(key) {
      rawRemove(k(key));
    },
  };
}

/** Tiny typed event emitter used across the core. */
export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<(payload: never) => void>>();
  on<K extends keyof Events>(type: K, fn: (payload: Events[K]) => void): () => void {
    let set = this.listeners.get(type);
    if (!set) this.listeners.set(type, (set = new Set()));
    set.add(fn as (payload: never) => void);
    return () => set.delete(fn as (payload: never) => void);
  }
  emit<K extends keyof Events>(type: K, payload: Events[K]): void {
    this.listeners.get(type)?.forEach((fn) => (fn as (p: Events[K]) => void)(payload));
  }
  clear(): void {
    this.listeners.clear();
  }
}
