import { z } from "zod";

const optionalUrl = z.url("Enter a valid URL").or(z.literal(""));

export const projectFormSchema = z.object({
  clientName: z.string().min(1, "Client name is required"),
  type: z.enum(["One Pager", "Full Web Dev"]),
  assignee: z.string().min(1, "Assignee is required"),
  priority: z.enum(["High", "Medium", "Low"]),
  status: z.enum([
    "Live",
    "Staging",
    "Churned",
    "In Progress",
    "Site Handed Over",
  ]),
  websites: z
    .array(
      z.object({
        name: z.string().min(1, "Website name is required"),
        url: z.url("Enter a valid URL"),
      })
    )
    .min(1, "Add at least one website/domain"),
  liveLink: optionalUrl,
  stagingLink: optionalUrl,
  figmaLink: optionalUrl,
  domainManagement: z.enum(["Client Domain", "Cloudflare"]),
  serverLocation: z.enum(["Client", "Hetzner", "AWS"]),
});

export type ProjectFormValues = z.infer<typeof projectFormSchema>;
