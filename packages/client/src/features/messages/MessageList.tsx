import { DEFAULT_CHANNEL_ID, type MessageDoc } from "@aside/shared";
import { useEffect, useState } from "react";
import type { RxDocument } from "rxdb";
import type { MessageCollection } from "../../db/database";

export function MessageList({ collection }: { collection: MessageCollection }) {
  const [docs, setDocs] = useState<RxDocument<MessageDoc>[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    // find() defaults to sorting by primary key; we re-sort chronologically in
    // JS to avoid needing a numeric secondary index for this POC.
    const sub = collection.find().$.subscribe((found) => {
      setDocs([...found].sort((a, b) => a.createdAt - b.createdAt));
    });
    return () => sub.unsubscribe();
  }, [collection]);

  async function addMessage(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = Date.now();
    await collection.insert({
      id: crypto.randomUUID(),
      channelId: DEFAULT_CHANNEL_ID,
      text: trimmed,
      createdAt: now,
      updatedAt: now,
    });
    setText("");
  }

  async function deleteMessage(doc: RxDocument<MessageDoc>) {
    // Bump updatedAt so the soft-delete wins timestamp-based conflict handling.
    // The server assigns the replication seq when this change is pushed.
    // incrementalPatch returns the doc at its new revision; remove() must run on
    // that, not the stale `doc` reference, or RxDB throws a CONFLICT.
    const bumped = await doc.incrementalPatch({ updatedAt: Date.now() });
    await bumped.remove();
  }

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "2rem auto", padding: "0 1rem" }}>
      <h1>Aside</h1>
      <form onSubmit={addMessage} style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Jot something down…"
          style={{ flex: 1, padding: 8 }}
        />
        <button type="submit">Save</button>
      </form>
      <ul style={{ listStyle: "none", padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {docs.map((doc) => (
          <li key={doc.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, padding: 8, border: "1px solid #ddd", borderRadius: 6 }}>
            <span>{doc.text}</span>
            <button onClick={() => deleteMessage(doc)} aria-label="Delete">✕</button>
          </li>
        ))}
        {docs.length === 0 && <li style={{ color: "#888" }}>No messages yet.</li>}
      </ul>
    </main>
  );
}
