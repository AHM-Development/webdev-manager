import { z } from "zod";

export const issueStatusSchema = z.enum(["Open", "In Progress", "Fixed"]);
export const issuePrioritySchema = z.enum(["Low", "Medium", "High"]);

/** One schema drives both the create and edit issue modals. The checklist and
 *  the selected-client set are managed as local component state (like the task
 *  detail modal), so only the scalar fields live in the form. */
export const issueFormSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  description: z.string(),
  priority: issuePrioritySchema,
  status: issueStatusSchema,
  assignee: z.string(),
  assigneeUserId: z.string(),
  dueDate: z.string(),
  scope: z.enum(["all", "selected"]),
});

export type IssueFormValues = z.infer<typeof issueFormSchema>;
