import type {VercelConfig} from '@vercel/config/v1';

// Evaluated at deployment build time; Preview stays near TEST storage.
const production = process.env.VERCEL_ENV === 'production';
const region = production ? 'sin1' : 'hnd1';

export const config: VercelConfig = {
  functions: {
    'app/api/account/images/route.ts': {regions: [region]},
    'app/api/maintenance/account-images/route.ts': {regions: [region], maxDuration: 60},
  },
  crons: production ? [{path: '/api/maintenance/account-images', schedule: '0 18 * * *'}] : [],
};
