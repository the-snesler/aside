<p align="center">
<img width="512" alt="image" src="https://github.com/user-attachments/assets/2d828c67-c123-4fdd-96c9-4404a7b8a68d" />
</p>

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

<img width="2851" height="1688" alt="Screenshot 2026-07-18 at 21-03-51 Aside" src="https://github.com/user-attachments/assets/415edb39-6911-47c1-bd8d-7649e10004b0" />

<img width="2851" height="1688" alt="Screenshot 2026-07-18 at 21-02-48 Aside" src="https://github.com/user-attachments/assets/f041d087-18b4-4bd6-b1fc-471e2288721c" />


### Self-hosting

Aside runs as a single Docker Compose service with SQLite, blobs, and feed data
stored in the local `./data` directory:

```sh
git clone https://github.com/the-snesler/aside.git
cd aside
docker compose up
```

Then open `http://localhost:3001` and set up a new password.
