import { z } from 'zod';

const dateOrDatetime = z.preprocess((val) => {
  if (typeof val === "string" && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return `${val}T00:00:00Z`; // plain date -> midnight UTC
  }
  return val;
}, z.string().datetime());


export const applicationSchema = z.object({
  company: z.string().min(1),
  role: z.string().min(1),
  status: z.string().min(1),
  source: z.string().optional(),
  source_url: z.string().url().optional(),
  date_applied: dateOrDatetime.optional(),
});

export const patchSchema = applicationSchema.partial();
