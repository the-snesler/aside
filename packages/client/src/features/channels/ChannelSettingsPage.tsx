import { DEFAULT_CHANNEL_ID, type ChannelDoc } from "@aside/shared";
import { useEffect, useState } from "react";
import type { RxDocument } from "rxdb";
import IconHash from "~icons/lucide/hash";
import IconMenu from "~icons/lucide/menu";
import IconTrash from "~icons/lucide/trash-2";
import type { ChannelCollection } from "../../db/database";
import { ALL_ID } from "../views";
import { channelColor, channelType } from "./channelMeta";
import { slugifyChannelName } from "./channelName";

interface Props {
  channels: ChannelCollection;
  channelId: string;
  onOpenMenu: () => void;
  onClose: (nextView?: string) => void;
}

export function ChannelSettingsPage({
  channels,
  channelId,
  onOpenMenu,
  onClose,
}: Props) {
  const [doc, setDoc] = useState<RxDocument<ChannelDoc> | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState("#3ba55d");
  const [type, setType] = useState<"standard" | "todo">("standard");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const sub = channels.findOne(channelId).$.subscribe((channel) => {
      setDoc(channel ?? null);
      if (!channel) return;
      setName(channel.name);
      setDescription(channel.description ?? "");
      setColor(channelColor(channel));
      setType(channelType(channel));
    });
    return () => sub.unsubscribe();
  }, [channelId, channels]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!doc) return;
    const nextName = slugifyChannelName(name);
    if (!nextName) {
      setError("Channel name is required.");
      return;
    }
    setError(null);
    await doc.incrementalPatch({
      name: nextName,
      description: description.trim() || undefined,
      color,
      type,
      updatedAt: Date.now(),
    });
    onClose(doc.id);
  }

  async function deleteChannel() {
    if (!doc || doc.id === DEFAULT_CHANNEL_ID) return;
    const ok = window.confirm(
      `Delete #${doc.name}? Notes stay in other channels.`,
    );
    if (!ok) return;
    const bumped = await doc.incrementalPatch({ updatedAt: Date.now() });
    await bumped.remove();
    onClose(ALL_ID);
  }

  return (
    <main className="relative z-10 flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-chat md:-ml-5 md:rounded-[28px] md:shadow-xl md:ring-1 md:ring-black/5">
      <header className="flex h-14 shrink-0 items-center gap-2.5 px-4 md:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open sidebar"
          className="rounded-lg p-1.5 text-muted hover:bg-hover hover:text-ink md:hidden"
        >
          <IconMenu className="h-5 w-5" />
        </button>
        <IconHash className="hidden h-5 w-5 text-accent md:block" />
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold text-ink">
          Channel settings
        </h1>
      </header>

      <section className="min-h-0 flex-1 overflow-y-auto border-t border-divider px-4 py-5 md:px-8">
        {!doc ? (
          <div className="text-sm text-muted">Channel not found.</div>
        ) : (
          <form
            onSubmit={(e) => void save(e)}
            className="mx-auto flex w-full max-w-2xl flex-col gap-5"
          >
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-4 rounded-[5px]"
                  style={{ backgroundColor: color }}
                />
                <h2 className="text-lg font-semibold text-ink">#{doc.name}</h2>
              </div>
              <p className="mt-1 text-sm text-muted">
                Edit how this channel appears and behaves.
              </p>
            </div>

            <label className="block text-sm font-medium text-muted">
              Name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1 w-full rounded-lg bg-panel px-3 py-2 text-ink outline-none ring-1 ring-divider focus:ring-accent"
              />
            </label>

            <label className="block text-sm font-medium text-muted">
              Description
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="mt-1 w-full resize-y rounded-lg bg-panel px-3 py-2 text-ink outline-none ring-1 ring-divider focus:ring-accent"
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-medium text-muted">
                Color
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.currentTarget.value)}
                  className="mt-1 h-10 w-16 cursor-pointer block rounded border border-divider bg-panel"
                />
              </label>

              <label className="block text-sm font-medium text-muted">
                Type
                <select
                  value={type}
                  onChange={(e) =>
                    setType(
                      e.currentTarget.value === "todo" ? "todo" : "standard",
                    )
                  }
                  className="mt-1 w-full rounded-lg bg-panel px-3 py-2 text-ink outline-none ring-1 ring-divider focus:ring-accent"
                >
                  <option value="standard">Standard</option>
                  <option value="todo">Todo</option>
                </select>
              </label>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-4">
              <button
                type="button"
                onClick={() => void deleteChannel()}
                disabled={doc.id === DEFAULT_CHANNEL_ID}
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-danger hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                <IconTrash className="h-4 w-4" />
                Delete channel
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => onClose(doc.id)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted hover:bg-hover hover:text-ink"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </form>
        )}
      </section>
    </main>
  );
}
