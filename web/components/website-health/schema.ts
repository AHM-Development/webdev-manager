import { z } from "zod";

export const healthChecksSchema = z
  .object({
    lighthouse: z.boolean(),
    technical_seo: z.boolean(),
    design_qa: z.boolean(),
    website_checklists: z.boolean(),
    security: z.boolean(),
  })
  .refine((checks) => Object.values(checks).some(Boolean), {
    message: "Select at least one check to run",
  });

export const startHealthScanSchema = z.object({
  websiteId: z.string().min(1, "Select a website"),
  sitemapUrl: z.string(),
  checks: healthChecksSchema,
});

export type StartHealthScanValues = z.infer<typeof startHealthScanSchema>;

export const websiteHealthProfileSchema = z.object({
  organizationName: z.string().trim(),
  approvedNames: z.string(),
  essentialPlugins: z.string(),
  maxPages: z.number().int().min(1).max(100),
});

export type WebsiteHealthProfileValues = z.infer<typeof websiteHealthProfileSchema>;
