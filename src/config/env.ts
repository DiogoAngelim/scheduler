import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().url().optional(),
    CRON_SCHEDULE: z.string().min(1).default('0 * * * *')
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production' && !value.DATABASE_URL) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'DATABASE_URL is required in production'
      });
    }
  });

export type RuntimeConfig = z.infer<typeof envSchema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  return envSchema.parse(source);
}
