import { AsyncLocalStorage } from "node:async_hooks";

/**
 * A small wrapper around Node's `AsyncLocalStorage` that presents the context
 * as a mutable `Map`.
 *
 * Design decisions, stated plainly:
 *
 * 1. The underlying store is a `Map`, not a plain object. Map keys can be any
 *    type (symbols, objects), insertion order is preserved, and there is no
 *    risk of colliding with `Object.prototype` properties like `__proto__`.
 *    That last point is the real reason — accepting arbitrary string keys on a
 *    plain object is a prototype-pollution footgun.
 *
 * 2. The `run` callback receives the store directly as its first argument.
 *    This mirrors `AsyncLocalStorage#run` and saves callers from having to call
 *    `get()` to reach the map they just populated. The store passed is the
 *    live map for that async context; mutations inside `run` are visible to
 *    everything within it.
 *
 * 3. `run` uses `enterWith`, not `run`. `AsyncLocalStorage#run` snapshots the
 *    store for the duration of the callback; `enterWith` makes the store the
 *    current context for any continuation (timers, resolved promises, etc.)
 *    created within it. For a context library whose whole point is "the map
 *    survives across async boundaries", `enterWith` is the correct primitive.
 *
 * 4. `get` outside any `run` returns an empty `Map`, never `undefined`. A
 *    caller that does `store.get("k")` should not have to null-check the
 *    context itself. This does mean there is no way to distinguish "no active
 *    context" from "active context with nothing in it"; if that matters to
 *    you, this is not the right library.
 */
export class ContextAsyncStorage {
  /**
   * @param {Map} [initial] A seed map copied into every fresh context.
   *   The map is shallow-copied so mutations in one run cannot bleed into
   *   another run or back into the caller's map.
   */
  constructor(initial) {
    this._als = new AsyncLocalStorage();
    this._initial = initial ? new Map(initial) : new Map();
  }

  /**
   * Returns the context `Map` for the current async continuation, or an empty
   * standalone `Map` when no `run` is active on the current path. The returned
   * map is the live one inside a `run`; mutating it affects siblings in the
   * same context.
   *
   * @returns {Map}
   */
  get() {
    const store = this._als.getStore();
    if (store) return store;
    // A fresh empty map each call: returning a shared "empty" singleton would
    // let an accidental mutation leak into other no-context callers.
    return new Map();
  }

  /**
   * Sets `key` on the current context. Returns `true` if the key was new,
   * `false` if it overwrote an existing value — matching `Map#set`'s
   * "did it already exist" semantics via `has`.
   *
   * Outside any `run`, `set` is a no-op and returns `false`: there is no
   * context to mutate, and creating a hidden global one would surprise
   * callers who forgot to wrap.
   *
   * @param {*} key
   * @param {*} value
   * @returns {boolean}
   */
  set(key, value) {
    const store = this._als.getStore();
    if (!store) return false;
    const had = store.has(key);
    store.set(key, value);
    return !had;
  }

  /**
   * Runs `callback` inside a fresh async context seeded from the
   * constructor's initial map. The callback receives the live context `Map`
   * as its first argument. Continuations started inside the callback (timers,
 *   `then`, `await`, `setImmediate`, etc.) inherit the same context.
   *
   * A shallow copy of the seed is taken per `run`, so each run starts from the
   * same baseline but cannot mutate another run's state.
   *
   * @template T
   * @param {(store: Map) => T} callback
   * @returns {T}
   */
  run(callback) {
    const store = new Map(this._initial);
    this._als.enterWith(store);
    return callback(store);
  }
}
