import { setTimeout, clearTimeout } from 'timers';

interface CacheEntry<T> {
  tid: NodeJS.Timeout;
  value: T;
}

export default class Cache<K, V> {
  private timeout: number;
  private cache: Map<K, CacheEntry<V>>;

  constructor(timeout = 1000) {
    this.cache = new Map<K, CacheEntry<V>>();
    this.timeout = timeout;
  }

  set(key: K, value: V): this {
    if (this.has(key)) {
      const entry = this.cache.get(key);
      if (entry) {
        clearTimeout(entry.tid);
      }
    }

    this.cache.set(key, {
      tid: setTimeout(this.delete.bind(this, key), this.timeout).unref(),
      value,
    });

    return this;
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (entry) {
      return entry.value;
    }
    return null;
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  getOrSet<T>(key: K, fn: () => T): T {
    if (this.has(key)) {
      const value = this.get(key);
      return value !== null ? (value as unknown as T) : fn();
    } else {
      const value = fn();
      this.set(key, value as unknown as V);

      void (async (): Promise<void> => {
        try {
          if (value instanceof Promise) {
            await value;
          }
        } catch (err) {
          this.delete(key);
        }
      })();

      return value;
    }
  }

  delete(key: K): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      clearTimeout(entry.tid);
      return this.cache.delete(key);
    }
    return false;
  }

  clear(): void {
    for (const entry of this.cache.values()) {
      clearTimeout(entry.tid);
    }
    this.cache.clear();
  }
}
