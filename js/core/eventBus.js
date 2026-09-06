// Minimal pub/sub used to decouple systems (movement, combat, UI, etc.)
// from each other. Systems emit events; anything can subscribe without
// the emitter needing to know who's listening.

export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  on(eventName, handler) {
    if (!this.listeners.has(eventName)) this.listeners.set(eventName, new Set());
    this.listeners.get(eventName).add(handler);
    return () => this.off(eventName, handler); // returns an unsubscribe fn
  }

  off(eventName, handler) {
    this.listeners.get(eventName)?.delete(handler);
  }

  emit(eventName, payload) {
    this.listeners.get(eventName)?.forEach((handler) => handler(payload));
  }
}

// Single shared bus for the whole game. Import this everywhere.
export const bus = new EventBus();
