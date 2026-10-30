# context-async-storage

A small wrapper around Node's `AsyncLocalStorage` that exposes a per-async-context `Map` via `get`, `set`, and `run`.

```js
import { ContextAsyncStorage } from "context-async-storage";

const ctx = new ContextAsyncStorage(new Map([["service", "billing"]]));

ctx.run((store) => {
  // store === ctx.get(): the live map for this async context
  store.set("requestId", 1234);
  doWork();
});

async function doWork() {
  // Same map, even across awaits — that's the whole point.
  console.log(ctx.get().get("requestId")); // 1234
}
```

## Why this exists

Request-scoped state in Node usually means hand-threading a `context` object through every function signature, or reaching for a framework that hides one. `AsyncLocalStorage` already solves the propagation; this library gives it a `Map`-shaped surface and a `set` that returns whether the key was new, so callers don't have to remember the `AsyncLocalStorage` API or manage their own store object.

The trade-off: `run` uses `AsyncLocalStorage#enterWith` rather than `#run`. `enterWith` attaches the store to the current execution context so it survives across `await`, timers, and callbacks — which is the behaviour you want from a context library. The cost is that it is **not stack-based**: a nested `run` does not restore the outer context when it returns. If you nest runs, the inner map stays active after the inner callback completes. The tests document this explicitly; if you need stack-style restore, wrap `AsyncLocalStorage#run` yourself.

## The awkward edge

Outside any `run`, `get()` returns a fresh empty `Map` on every call (not a shared singleton, so an accidental mutation can't leak), and `set()` is a no-op that returns `false`. There is intentionally no way to distinguish "no active context" from "active context with nothing in it" — if that distinction matters, this is the wrong library.

Run the tests with:

```
node --test
```

ESM only. Node 18+ for `AsyncLocalStorage` stability.

## Design notes

The window stores values eagerly rather than keeping running aggregates. Running
sums drift with floating point over long streams, and recomputing from a small
buffer is cheap enough that the drift is not worth the speed.

## Performance

The window keeps a bounded buffer, so `push` is constant time and memory does not
grow with the length of the stream. `peak` and `trough` are linear in the window
size, which is the trade that keeps `push` cheap.

## Limitations

Values are coerced to floats, so very large integers lose precision. If you need
exact integer aggregates over a window, this is the wrong tool.

## Contributing

Issues and pull requests are welcome. Please keep the dependency list empty —
that constraint is the point of the project, not an oversight.

