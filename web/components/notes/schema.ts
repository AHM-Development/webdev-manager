import { z } from "zod";

export const noteSchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  content: z.string().trim().min(1, "Note is required"),
  color: z.enum(["white", "blue", "green", "yellow", "pink"]),
});

export type NoteValues = z.infer<typeof noteSchema>;
