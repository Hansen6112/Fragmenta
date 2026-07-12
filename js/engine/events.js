/*
 * FRAGMENTA — Event Bus
 * A small, synchronous, fire-and-forget pub/sub layer: `Events.on(name,
 * handler)` registers a listener, `Events.emit(name, payload)` calls
 * every listener registered for that name, in registration order.
 *
 * Scope, deliberately: this is for SIDE EFFECTS/bookkeeping that don't
 * need to contribute to what's printed to the player — reputation
 * changes, ally/party bookkeeping, unlocking things, flags. The
 * narrative "what do we print this turn" flow is untouched by this and
 * stays exactly as it's always been: a function returning an array of
 * strings, called directly. Handler return values are never collected —
 * emit() always returns undefined. If a caller needs output text from
 * something, that's a signal it doesn't belong behind an event; call the
 * function directly instead, same as before this file existed.
 *
 * Listeners are registered once, at script-load time, by whichever file
 * owns that concern (see combat.js's "ally.died" listener,
 * engine/jobs.js's "job.completed" listeners, state.js's
 * "player.leveledUp" listener) — not per-GameState-instance. There's
 * only ever one GameState alive in a tab at a time, so a single global
 * bus (matching how every other engine file is already just global
 * functions/consts, no module system) is simplest.
 */
const Events = (() => {
  const listeners = {};

  function on(name, handler) {
    (listeners[name] || (listeners[name] = [])).push(handler);
  }

  function off(name, handler) {
    if (!listeners[name]) return;
    listeners[name] = listeners[name].filter((h) => h !== handler);
  }

  function emit(name, payload) {
    (listeners[name] || []).forEach((handler) => handler(payload));
  }

  return { on, off, emit };
})();
