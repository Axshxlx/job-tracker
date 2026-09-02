import { z } from 'zod';

export const applicationSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  status: z.string().min(1),
  source: z.string().optional(),
  source_url: z.string().url().optional(),
  date_applied: z.string().datetime().optional(),
});

export const patchSchema = applicationSchema.partial();
