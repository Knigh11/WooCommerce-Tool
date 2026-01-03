// Description Builder Schemas using Zod

import { z } from "zod"

export const LeafItemSchema = z.object({
  id: z.string(),
  rel_path: z.string(),
  title: z.string(),
  category: z.string().nullable(),
  has_description: z.boolean(),
})

export const UploadResponseSchema = z.object({
  upload_id: z.string(),
  upload_token: z.string(),
  root_name: z.string().nullable(),
  multiple_roots: z.boolean(),
  zip_size: z.number(),
  items: z.array(LeafItemSchema),
  summary: z.object({
    leaf_count: z.number(),
    with_description: z.number(),
    without_description: z.number(),
  }),
})

export const ConfigSchema = z.object({
  preset: z
    .object({
      product_type: z.string().optional(),
      fit: z.string().optional(),
      use: z.string().optional(),
      seo_keywords: z.union([z.array(z.string()), z.string()]).optional(),
    })
    .optional(),
  template: z.string().optional(),
  anchors: z
    .object({
      keywords: z.union([z.array(z.string()), z.string()]).optional(),
    })
    .optional(),
  anchor_options: z
    .object({
      append_to_keywords: z.boolean().optional(),
      append_as_bullet: z.boolean().optional(),
      append_at_end: z.boolean().optional(),
    })
    .optional(),
})

export const PreviewRequestSchema = z.object({
  upload_id: z.string(),
  upload_token: z.string(),
  rel_path: z.string(),
  config: ConfigSchema,
})

export const PreviewResponseSchema = z.object({
  text: z.string(),
})

export const GenerateRequestSchema = z.object({
  upload_id: z.string(),
  upload_token: z.string(),
  rel_paths: z.array(z.string()),
  config: ConfigSchema,
  overwrite: z.boolean().default(true),
})

export const GenerateResponseSchema = z.object({
  job_id: z.string(),
  job_token: z.string(),
})

// SSE Event Schema (safe parse, ignore unknown)
export const SseEventSchema = z
  .object({
    event: z.string(),
    data: z.string(),
    id: z.string().optional(),
  })
  .passthrough()

// Inferred TypeScript types
export type LeafItem = z.infer<typeof LeafItemSchema>
export type UploadResponse = z.infer<typeof UploadResponseSchema>
export type Config = z.infer<typeof ConfigSchema>
export type PreviewRequest = z.infer<typeof PreviewRequestSchema>
export type PreviewResponse = z.infer<typeof PreviewResponseSchema>
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>
export type GenerateResponse = z.infer<typeof GenerateResponseSchema>
export type SseEvent = z.infer<typeof SseEventSchema>

