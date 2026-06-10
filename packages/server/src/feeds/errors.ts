/**
 * Thrown by a source when its stored session is no longer authenticated (e.g.
 * X redirected to the login flow). The orchestrator maps this to the
 * `auth_required` status so the UI can prompt the user to re-seed cookies,
 * distinct from a generic scrape failure.
 */
export class FeedAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeedAuthError";
  }
}
