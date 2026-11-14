import type { NextConfig } from 'next';

// STATIC_EXPORT=1 emits plain files in out/ for the desktop app; otherwise `next start` serves it.
const config: NextConfig = process.env.STATIC_EXPORT === '1' ? { output: 'export', images: { unoptimized: true } } : {};
export default config;
