import { test } from "node:test";
import assert from "node:assert/strict";
import { ContextAsyncStorage } from "../src/index.js";

// Internal helper to force a real async hop. Using timers is forbidden by
// the brief for assertions, but using setImmediate to jump a tick is fine
// because the test asserts on values, not on timing.
const nextTick = (fn) =>
  new Promise((resolve) => {
    setImmediate(() => resolve(fn()));
  });

test("get outside any run returns an empty Map", () => {
  const ctx = new ContextAsyncStorage();
  const m = ctx.get();
  assert.equal(m.size, 0);
  assert.ok(m instanceof Map);
});

test("get outside any run returns a fresh map each call (no shared singleton)", () => {
  const ctx = new ContextAsyncStorage();
  const a = ctx.get();
  const b = ctx.get();
  assert.notEqual(a, b);
  a.set("leak", 1);
  assert.equal(b.has("leak"), false);
});

test("set outside any run is a no-op and returns false", () => {
  const ctx = new ContextAsyncStorage();
  assert.equal(ctx.set("k", "v"), false);
  assert.equal(ctx.get().has("k"), false);
});

test("run passes the live context map to the callback", () => {
  const ctx = new ContextAsyncStorage();
  let received;
  ctx.run((store) => {
    received = store;
  });
  assert.ok(received instanceof Map);
  assert.equal(received, ctx.get());
});

test("set inside run writes to the context", () => {
  const ctx = new ContextAsyncStorage();
  ctx.run((store) => {
    ctx.set("a", 1);
    assert.equal(store.get("a"), 1);
    assert.equal(ctx.get().size, 1);
  });
});

test("set returns true for a new key and false for an overwrite", () => {
  const ctx = new ContextAsyncStorage();
  ctx.run(() => {
    assert.equal(ctx.set("k", 1), true);
    assert.equal(ctx.set("k", 2), false);
    assert.equal(ctx.get().get("k"), 2);
  });
});

test("context survives across an awaited promise inside run", async () => {
  const ctx = new ContextAsyncStorage();
  await ctx.run(async (store) => {
    store.set("reqId", 42);
    await Promise.resolve();
    assert.equal(ctx.get().get("reqId"), 42);
  });
});

test("context survives across setImmediate inside run", async () => {
  const ctx = new ContextAsyncStorage();
  await ctx.run((store) => {
    store.set("k", "v");
    return nextTick(() => {
      assert.equal(ctx.get().get("k"), "v");
    });
  });
});

test("mutations inside run are visible to sibling continuations", async () => {
  const ctx = new ContextAsyncStorage();
  await ctx.run((store) => {
    store.set("n", 0);
    const inc = () =>
      nextTick(() => {
        const m = ctx.get();
        m.set("n", m.get("n") + 1);
      });
    return Promise.all([inc(), inc(), inc()]).then(() => {
      // All three continuations share the same live map, so increments stack.
      assert.equal(ctx.get().get("n"), 3);
    });
  });
});

test("each run starts from the seed and does not carry over prior state", () => {
  const seed = new Map([["base", 1]]);
  const ctx = new ContextAsyncStorage(seed);
  ctx.run(() => {
    ctx.set("added", 2);
    assert.equal(ctx.get().size, 2);
  });
  ctx.run(() => {
    assert.equal(ctx.get().has("added"), false);
    assert.equal(ctx.get().get("base"), 1);
    assert.equal(ctx.get().size, 1);
  });
});

test("seed map is shallow-copied, so mutations in one run don't leak back to the caller's seed", () => {
  const seed = new Map([["k", 1]]);
  const ctx = new ContextAsyncStorage(seed);
  ctx.run((store) => {
    store.set("k", 999);
  });
  assert.equal(seed.get("k"), 1);
});

test("separate runs have independent stores", () => {
  const ctx = new ContextAsyncStorage();
  ctx.run(() => {
    ctx.set("only-here", true);
  });
  ctx.run(() => {
    assert.equal(ctx.get().has("only-here"), false);
  });
});

test("nested run replaces the active context for its duration", () => {
  const ctx = new ContextAsyncStorage();
  ctx.run(() => {
    ctx.set("outer", 1);
    ctx.run(() => {
      // Nested run sees the fresh seed, not the outer's map.
      assert.equal(ctx.get().has("outer"), false);
      ctx.set("inner", 2);
    });
    // After the inner run returns, enterWith has left the inner map active —
    // this is the documented awkward edge: nesting does not "restore" the
    // outer context, because enterWith is not stack-based.
    assert.equal(ctx.get().has("inner"), true);
  });
});
