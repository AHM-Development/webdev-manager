import { z } from "zod";

export const notificationChannelSchema = z.enum([
  "Off",
  "Email",
  "Discord",
  "Both",
]);

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => !value || /^https?:\/\/.+/i.test(value), {
    message: "Enter a valid URL.",
  });

const timeValue = z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid time.");

export const settingsSchema = z.object({
  workspaceName: z.string().trim().min(1, "Workspace name is required."),
  supportEmail: z.email("Enter a valid support email."),
  timezone: z.enum(["Dubai", "London", "Manila"]),
  defaultSenderName: z.string().trim().min(1, "Sender name is required."),
  taskAssignments: notificationChannelSchema,
  reviews: notificationChannelSchema,
  clientLogs: notificationChannelSchema,
  issues: notificationChannelSchema,
  security: notificationChannelSchema,
  healthAlerts: notificationChannelSchema,
  passwordAgeAlerts: notificationChannelSchema,
  dailyUserSummary: notificationChannelSchema,
  preShiftBriefing: notificationChannelSchema,
  weeklyDigest: notificationChannelSchema,
  dailySummaryTime: timeValue,
  preShiftBriefingTime: timeValue,
  managerNotes: z.string(),
  discordWebhookUrl: optionalUrl,
  googleClientId: z.string(),
  googleClientSecret: z.string(),
  googleRedirectUri: optionalUrl,
  taskOrganizerSystemPrompt: z
    .string()
    .trim()
    .min(1, "Task organizer system prompt is required."),
  taskOrganizerUserPrompt: z
    .string()
    .trim()
    .min(1, "Task organizer user prompt is required."),
  taskOrganizerModel: z.string(),
  taskOrganizerTemperature: z
    .string()
    .refine((value) => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1;
    }, "Enter a value between 0 and 1."),
  taskOrganizerMaxTokens: z
    .string()
    .refine((value) => {
      const parsed = Number(value);
      return Number.isInteger(parsed) && parsed >= 400 && parsed <= 4000;
    }, "Enter a whole number between 400 and 4000."),
  technicalSeoSystemPrompt: z.string().trim().min(1, "Technical SEO system prompt is required."),
  technicalSeoUserPrompt: z.string().trim().min(1, "Technical SEO user prompt is required."),
  designQaSystemPrompt: z.string().trim().min(1, "Design QA system prompt is required."),
  designQaUserPrompt: z.string().trim().min(1, "Design QA user prompt is required."),
});

export type SettingsFormValues = z.infer<typeof settingsSchema>;
