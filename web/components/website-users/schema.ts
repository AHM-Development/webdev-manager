import { z } from "zod";

export function credentialFormSchema(isEdit: boolean) {
  return z
    .object({
      name: z.string().trim().min(1, "Name is required"),
      userId: z.string(),
      projectId: z.string().min(1, "Client is required"),
      websiteId: z.string(),
      username: z.string().trim().min(1, "Username is required"),
      password: z.string(),
      note: z.string(),
    })
    .superRefine((value, ctx) => {
      if (!isEdit && !value.password.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "Password is required",
          path: ["password"],
        });
      }
    });
}

export type CredentialFormValues = z.infer<ReturnType<typeof credentialFormSchema>>;

export const credentialImportSchema = z.object({
  source: z.enum(["google", "csv", "excel"]),
  sheetUrl: z.string(),
  csvText: z.string(),
  mapping: z.object({
    name: z.string(),
    projectOrSite: z.string(),
    environment: z.string(),
    username: z.string(),
    password: z.string(),
    createdAt: z.string(),
    passwordUpdatedAt: z.string(),
    note: z.string(),
  }),
});

export type CredentialImportValues = z.infer<typeof credentialImportSchema>;
