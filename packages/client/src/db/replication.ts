import type { Checkpoint, MessageDoc } from "@aside/shared";
import type { RxReplicationPullStreamItem } from "rxdb";
import { replicateRxCollection } from "rxdb/plugins/replication";
import { Subject } from "rxjs";
import type { MessageCollection } from "./database";

type PullStreamItem = RxReplicationPullStreamItem<MessageDoc, Checkpoint>;

let started = false;

/**
 * Wires the messages collection to the server's pull/push/stream endpoints.
 * - pull.handler fetches changes since the last checkpoint.
 * - pull.stream$ is fed by an SSE connection so a second instance updates live.
 * - push.handler ships local changes and returns any conflicts.
 * Guarded so it only runs once even if React re-renders.
 */
export function startReplication(collection: MessageCollection): void {
  if (started) return;
  started = true;

  const pullStream$ = new Subject<PullStreamItem>();

  const events = new EventSource("/api/sync/stream");
  events.onmessage = (event) => {
    if (!event.data) return;
    pullStream$.next(JSON.parse(event.data) as PullStreamItem);
  };
  events.onerror = () => {
    // Connection dropped/reconnecting — tell RxDB to resync from its checkpoint.
    pullStream$.next("RESYNC");
  };

  replicateRxCollection<MessageDoc, Checkpoint>({
    collection,
    replicationIdentifier: "aside-messages-http",
    live: true,
    retryTime: 5000,
    pull: {
      async handler(checkpoint, batchSize) {
        const res = await fetch("/api/sync/pull", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ checkpoint: checkpoint ?? null, batchSize }),
        });
        if (!res.ok) throw new Error(`pull failed: ${res.status}`);
        return res.json();
      },
      stream$: pullStream$.asObservable(),
    },
    push: {
      async handler(rows) {
        const res = await fetch("/api/sync/push", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(rows),
        });
        if (!res.ok) throw new Error(`push failed: ${res.status}`);
        return res.json();
      },
    },
  });
}
