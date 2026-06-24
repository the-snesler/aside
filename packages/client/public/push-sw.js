self.addEventListener("push", (event) => {
  const payload = event.data ? event.data.json() : {};
  const title = payload.title || "Aside";
  const options = {
    body: payload.body || "",
    data: { url: payload.url || "/", messageId: payload.messageId },
    tag: payload.messageId ? `aside-reminder-${payload.messageId}` : undefined,
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if ("focus" in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
