<img width="192" height="192" alt="icon-192" src="https://github.com/user-attachments/assets/b6565d8f-16be-492f-a0e2-97a606a2a57e" />

## Aside

Aside is a local-first notetaking app. Sometimes, when you just want to save an idea, link, or quote for later, the last thing you want to do is manage a heap of Markdown files or file your document in just the right place; you just want to paste the link, or write a sentence, and move on with your day. Aside lets you take quick notes while giving you the tools to organize them later, if you want.

### Features

- **Multidevice, local-first**: Take notes on your phone and instantly view them on your laptop. Save things even while you're offline.
- **Selfhostable**: Runs in a single Docker container so your notes stay yours. Export to Markdown, HTML, or PDF if you need to.
- **Link previews**: Include a link in your message, and Aside will render it into a social preview.
- **Attachments**: Save pictures for later, or easily transfer them between devices.
- **Channels**: Tag a note with a #channel and it'll get moved there, or drag and drop it to a channel on the sidebar. Notes can exist in multiple channels.
- **Feeds**: Pull in your bookmarks from X (formerly Twitter), RSS, or webhooks
- **Ambient AI**: Optional AI can move new notes to an appropriate Channel, including notes from feeds.
- **Search**: Quickly search through all past notes and attachments, with filters for Channels and times.

<img width="2996" height="1976" alt="image" src="https://github.com/user-attachments/assets/92d8612d-c4b8-4dec-a93d-fbcdf715274c" />

<img width="2996" height="1976" alt="image" src="https://github.com/user-attachments/assets/7d801c68-bfb3-41b9-9242-e597dc67ab47" />

### Self-hosting

Aside runs as a single Docker Compose service with SQLite, blobs, and feed data
stored in the local `./data` directory:

```sh
git clone https://github.com/the-snesler/aside.git
cd aside
docker compose up
```

Then open `http://localhost:3001`. For local/dev installs, the default UI
password is `admin`.
