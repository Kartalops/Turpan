import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'SaaS App', description: 'A broken login app' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}