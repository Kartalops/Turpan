import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'SaaS App', description: 'Billing with fake success' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
