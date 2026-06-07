import type { Checkpoint, ReplicatedMessageDoc } from "@aside/shared";
import { EventEmitter } from "node:events";

export interface SyncEvent {
  documents: ReplicatedMessageDoc[];
  checkpoint: Checkpoint;
}

/**
 * In-process fan-out from push handlers to open SSE connections. Single
 * container, single process, so an EventEmitter is all the pub/sub we need.
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(0);

const CHANGE = "change";

export function emitChange(event: SyncEvent): void {
  emitter.emit(CHANGE, event);
}

/** Subscribe to changes; returns an unsubscribe function. */
export function onChange(listener: (event: SyncEvent) => void): () => void {
  emitter.on(CHANGE, listener);
  return () => emitter.off(CHANGE, listener);
}
