import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'SaaS App', description: 'Dashboard with no content' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en"><body>{children}</body></html>;
}
