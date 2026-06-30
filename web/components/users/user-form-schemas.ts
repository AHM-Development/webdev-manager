import { z } from "zod";
import { securePasswordSchema } from "@/components/login/schema/loginschema";

const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Select a valid date.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00`);
    return date >= new Date("1900-01-01T00:00:00") && date <= new Date();
  }, "Date of birth must be between 1900 and today.");

export const genderSchema = z.enum(["male", "female"], {
  error: "Select a gender.",
});

export const inviteRegistrationSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required."),
    lastName: z.string().trim().min(1, "Last name is required."),
    email: z.email("Enter a valid email."),
    dateOfBirth: dateString,
    gender: genderSchema,
    phoneE164: z.string().trim().min(7, "Phone number is required."),
    discordId: z.string().trim().min(3, "Discord ID is required."),
    password: securePasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.password === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required."),
  lastName: z.string().trim().min(1, "Last name is required."),
  email: z.email("Enter a valid email."),
  dateOfBirth: dateString,
  gender: genderSchema,
  phoneE164: z.string().trim().min(7, "Phone number is required."),
  discordId: z.string().trim().min(3, "Discord ID is required."),
});

export const profilePasswordSchema = z
  .object({
    otp: z.string().regex(/^\d{6}$/, "Enter the 6-digit code."),
    newPassword: securePasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match.",
  });

export type InviteRegistrationValues = z.infer<typeof inviteRegistrationSchema>;
export type ProfileValues = z.infer<typeof profileSchema>;
export type ProfilePasswordValues = z.infer<typeof profilePasswordSchema>;
