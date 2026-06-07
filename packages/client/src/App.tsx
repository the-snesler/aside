import { useEffect, useState } from "react";
import { getDatabase, type AsideDatabase } from "./db/database";
import { startReplication } from "./db/replication";
import { MessageList } from "./features/messages/MessageList";

export function App() {
  const [db, setDb] = useState<AsideDatabase | null>(null);

  useEffect(() => {
    let active = true;
    void getDatabase().then((database) => {
      if (!active) return;
      startReplication(database.messages);
      setDb(database);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!db) {
    return <p style={{ fontFamily: "system-ui, sans-serif", padding: 16 }}>Loading…</p>;
  }
  return <MessageList collection={db.messages} />;
}
