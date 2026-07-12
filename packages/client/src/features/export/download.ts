/** Triggers a client-side download of text content as a file. */
export function downloadTextFile(
  filename: string,
  contents: string,
  mimeType = "text/markdown",
): void {
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
