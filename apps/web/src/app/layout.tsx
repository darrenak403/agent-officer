import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = { title: 'Agent Office', description: 'Local observation for Claude and Codex agents' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="vi"><body>{children}</body></html>;
}
