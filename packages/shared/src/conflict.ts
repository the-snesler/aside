import type { RxConflictHandler } from "rxdb";
import type { MessageDoc } from "./types.js";

type ReplicatedMessageState = MessageDoc & { _deleted: boolean };

export const messageConflictHandler: RxConflictHandler<MessageDoc> = {
  isEqual(a, b) {
    return sameMessageState(a, b);
  },

  async resolve({ realMasterState, newDocumentState }) {
    if (newDocumentState.updatedAt !== realMasterState.updatedAt) {
      return newDocumentState.updatedAt > realMasterState.updatedAt
        ? newDocumentState
        : realMasterState;
    }

    if (newDocumentState._deleted !== realMasterState._deleted) {
      return newDocumentState._deleted ? newDocumentState : realMasterState;
    }

    return stableMessageKey(newDocumentState) >= stableMessageKey(realMasterState)
      ? newDocumentState
      : realMasterState;
  },
};

function sameMessageState(
  a: ReplicatedMessageState,
  b: ReplicatedMessageState,
): boolean {
  return (
    a.id === b.id &&
    a.channelId === b.channelId &&
    a.text === b.text &&
    a.createdAt === b.createdAt &&
    a.updatedAt === b.updatedAt &&
    a._deleted === b._deleted
  );
}

function stableMessageKey(doc: ReplicatedMessageState): string {
  return JSON.stringify({
    id: doc.id,
    channelId: doc.channelId,
    text: doc.text,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    _deleted: doc._deleted,
  });
}
