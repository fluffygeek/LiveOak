const POSTMARK_SEND_URL = 'https://api.postmarkapp.com/email';
const REQUEST_TIMEOUT_MS = 10_000;

export interface SendEmailArgs {
  serverToken: string;
  from: string;
  to: string;
  subject: string;
  htmlBody: string;
}

/**
 * Sends a single transactional email via Postmark's REST API directly
 * (rather than pulling in their SDK) — the digest is one simple POST, and
 * this keeps the worker's dependency footprint small, matching the raw-fetch
 * approach already used for USPS (packages/usps).
 */
export async function sendEmail(args: SendEmailArgs): Promise<void> {
  const res = await fetch(POSTMARK_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Postmark-Server-Token': args.serverToken,
    },
    body: JSON.stringify({
      From: args.from,
      To: args.to,
      Subject: args.subject,
      HtmlBody: args.htmlBody,
      MessageStream: 'outbound',
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!res.ok) {
    // Deliberately excludes the response body from the error message — it
    // can echo back the recipient's email address, which would otherwise
    // flow straight into logs and Sentry via the caller's catch block.
    throw new Error(`Postmark send failed (${res.status})`);
  }
}
