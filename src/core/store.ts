// ---------------------------------------------------------------------------
// A tiny framework-agnostic observable store. Deliberately NOT a Svelte store
// so the core stays portable — but it implements the Svelte store contract
// (a `subscribe` method returning an unsubscribe fn), so Svelte's `$store`
// auto-subscription works out of the box.
// ---------------------------------------------------------------------------

export type Subscriber<T> = (value: T) => void
export type Unsubscribe = () => void

export interface ReadableStore<T> {
  get(): T
  subscribe(run: Subscriber<T>): Unsubscribe
}

export interface WritableStore<T> extends ReadableStore<T> {
  set(value: T): void
  update(fn: (value: T) => T): void
}

export function createStore<T>(initial: T): WritableStore<T> {
  let value = initial
  const subscribers = new Set<Subscriber<T>>()

  return {
    get: () => value,
    set(next: T) {
      if (next === value) return
      value = next
      for (const run of subscribers) run(value)
    },
    update(fn) {
      this.set(fn(value))
    },
    subscribe(run) {
      subscribers.add(run)
      run(value) // Svelte contract: call immediately with the current value.
      return () => subscribers.delete(run)
    },
  }
}
