<img width="512" alt="image" src="https://github.com/user-attachments/assets/a8da096d-cd31-43f4-9586-386ae92a7086" />

## Aside

Aside is a local-first notetaking app. Sometimes, when you just want to save an idea, link, or quote for later, the last thing you want to do is manage a heap of Markdown files or organize your documents in just the right place; you just want to paste the link, or write the sentence, and move on with your day. Aside lets you take quick notes while giving you the tools to organize them later, if you want.

### Features

- **Multidevice, local-first**: Take notes on your phone and instantly view them on your laptop. Save things even while you're offline.
- **Selfhostable**: Runs in a single Docker container so your notes stay yours. Export to Markdown, HTML, or PDF if you need to.
- **Link previews**: Include a link in your message, and Aside will render it into a social preview.
- **Attachments**: Save pictures for later, or easily transfer them between devices.
- **Channels**: Tag a note with a #channel and it'll get moved there, or drag and drop it to a channel on the sidebar. Notes can exist in multiple channels.
- **Feeds**: Pull in your bookmarks from X (formerly Twitter), RSS, or webhooks
- **Ambient AI**: Optional AI can move new notes to an appropriate Channel, including notes from feeds.
- **Search**: Quickly search through all past notes and attachments, with filters for Channels and times.

### Screenshots

<img width="1440" alt="image" src="https://github.com/user-attachments/assets/c03f0f40-6e16-453b-a9d1-525815c931f6" />

<img width="1440" alt="image" src="https://github.com/user-attachments/assets/67fcdaef-d339-4798-8837-432bd3d9df2c" />


### Self-hosting

Aside runs as a single Docker Compose service with SQLite, blobs, and feed data
stored in the local `./data` directory:

```sh
git clone https://github.com/the-snesler/aside.git
cd aside
docker compose up
```

Then open `http://localhost:3001` and set up a new password.
