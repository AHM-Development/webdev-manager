import { z } from "zod";

import { STATUSES } from "./data";

export const taskPrioritySchema = z.enum(["Low", "Medium", "High"]);
export const taskStatusSchema = z.enum(STATUSES);

export const addTaskSchema = z
  .object({
    projectId: z.string().min(1, "Client is required"),
    assignee: z.string().min(1, "Assignee is required"),
    assigneeUserId: z.string(),
    startDate: z.string(),
    dueDate: z.string(),
    sourceText: z.string().trim().min(1, "Task details are required"),
    title: z.string().trim().min(1, "Title is required"),
    description: z.string(),
    checklistText: z.string(),
    priority: taskPrioritySchema,
    status: taskStatusSchema,
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "Due date must be after the start date",
        path: ["dueDate"],
      });
    }
  });

export type AddTaskValues = z.infer<typeof addTaskSchema>;

export const editTaskSchema = z
  .object({
    projectId: z.string().min(1, "Client is required"),
    title: z.string().trim().min(1, "Title is required"),
    description: z.string(),
    assignee: z.string().min(1, "Assignee is required"),
    assigneeUserId: z.string(),
    priority: taskPrioritySchema,
    status: taskStatusSchema,
    startDate: z.string(),
    dueDate: z.string(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.dueDate && value.dueDate < value.startDate) {
      ctx.addIssue({
        code: "custom",
        message: "Due date must be after the start date",
        path: ["dueDate"],
      });
    }
  });

export type EditTaskValues = z.infer<typeof editTaskSchema>;
