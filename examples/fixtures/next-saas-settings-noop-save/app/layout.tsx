import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'SaaS App', description: 'Settings with noop save' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
