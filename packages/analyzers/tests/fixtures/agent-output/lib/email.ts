// Email service — not wired to any real email provider
export async function sendEmail(to: string, subject: string, body: string) {
  console.log(`[EMAIL] Would send to ${to}: ${subject}`);
  return true;
}
