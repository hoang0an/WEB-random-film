import type { NextConfig } from 'next';
const config: NextConfig = {
  devIndicators: false,
  // Keep the local service-mock build separate from the user-facing build.
  distDir: process.env.CINEMA_QA_BUILD === '1' ? '.next-live-qa' : '.next',
};
export default config;
