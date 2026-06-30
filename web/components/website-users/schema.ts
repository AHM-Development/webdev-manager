import { z } from "zod";

export const credentialTargetKindSchema = z.enum(["project", "external"]);
export const credentialEnvironmentSchema = z.enum(["Live", "Staging"]);

export function credentialFormSchema(isEdit: boolean) {
  return z
    .object({
      name: z.string().trim().min(1, "Name is required"),
      targetKind: credentialTargetKindSchema,
      projectId: z.string(),
      websiteId: z.string(),
      externalSite: z.string().trim(),
      environment: credentialEnvironmentSchema,
      username: z.string().trim().min(1, "Username is required"),
      password: z.string(),
      note: z.string(),
    })
    .superRefine((value, ctx) => {
      if (value.targetKind === "project" && !value.projectId) {
        ctx.addIssue({
          code: "custom",
          message: "Project is required",
          path: ["projectId"],
        });
      }

      if (value.targetKind === "external" && !value.externalSite.trim()) {
        ctx.addIssue({
          code: "custom",
          message: "External site is required",
          path: ["externalSite"],
        });
      }

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
