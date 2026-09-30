import {z} from 'zod';

const submitJobSchema = z.object({
  body: z.object({
    code: z
      .string({error: 'Code must be a string'})
      .min(1, {message: 'Code cannot be empty'})
      .max(50_000, {message: 'Code cannot exceed 50,000 characters'}),

    language: z
      .literal('typescript', {error: 'Language must be "typescript"'})
      .optional(),
  }),
});

const cancelJobSchema = z.object({
  params: z.object({
    jobId: z.uuid({error: 'Job ID must be a uuid'}),
  }),
});

export default {submitJobSchema, cancelJobSchema};
