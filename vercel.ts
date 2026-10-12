import type {VercelConfig} from '@vercel/config/v1';

// Literal initial values also support static Preview preflight extraction.
export const config: VercelConfig = {
  functions: {
    'app/api/account/images/route.ts': {regions: ['hnd1']},
    'app/api/maintenance/account-images/route.ts': {regions: ['hnd1'], maxDuration: 60},
  },
  crons: [],
};

// Runtime evaluation selects Production settings; verify hosted resolution before release.
if (process.env.VERCEL_ENV === 'production') {
  config.functions = {
    'app/api/account/images/route.ts': {regions: ['sin1']},
    'app/api/maintenance/account-images/route.ts': {regions: ['sin1'], maxDuration: 60},
  };
  config.crons = [{path: '/api/maintenance/account-images', schedule: '0 18 * * *'}];
}
