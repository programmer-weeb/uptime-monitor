import { z } from 'zod';

const intervalSchema = z.union([
  z.literal(1),
  z.literal(5),
  z.literal(15),
  z.literal(30),
  z.literal(60),
]);

const nameSchema = z.string().trim().min(1, 'Name is required').max(100, 'Name is too long');

const urlSchema = z
  .string()
  .min(1)
  .max(2048)
  .url('Must be a valid URL')
  .refine((url) => url.startsWith('https://'), { message: 'URL must use HTTPS' });

export const createMonitorSchema = z
  .object({
    name: nameSchema,
    url: urlSchema,
    intervalMinutes: intervalSchema,
  })
  .strict();

export const patchMonitorSchema = z
  .object({
    name: nameSchema.optional(),
    url: urlSchema.optional(),
    intervalMinutes: intervalSchema.optional(),
    isPaused: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });

export const monitorIdParamsSchema = z
  .object({
    id: z.string().min(1),
  })
  .strict();

export const monitorChecksQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(100),
  })
  .strict();

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type PatchMonitorInput = z.infer<typeof patchMonitorSchema>;
export type MonitorChecksQuery = z.infer<typeof monitorChecksQuerySchema>;
