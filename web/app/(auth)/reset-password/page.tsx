"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, CardContent, CardHeader } from "@heroui/react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { Suspense } from "react";

import {
  resetPasswordSchema,
  type ResetPasswordValues,
} from "@/components/login/schema/loginschema";
import { PasswordField } from "@/components/ui/password";
import { resetPassword } from "@/libs/api/auth";
import { notify } from "@/libs/notify";

function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    if (!token) {
      notify.error("Reset link is invalid");
      return;
    }
    try {
      const message = await resetPassword(token, values);
      notify.success("Password updated", { description: message });
      form.reset();
    } catch (error) {
      notify.error("Unable to reset password", {
        description: error instanceof Error ? error.message : "Try again later.",
      });
    }
  });

  return (
    <Card className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl">
      <CardHeader className="border-b border-slate-200 p-7">
        <div>
          <h1 className="text-2xl font-semibold">Choose a new password</h1>
          <p className="mt-2 text-sm text-slate-500">
            Use at least 12 characters with uppercase, lowercase, number, and symbol.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-7">
        <form onSubmit={submit} className="space-y-4">
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <PasswordField {...field} label="New password" autoComplete="new-password" isInvalid={!!fieldState.error} error={fieldState.error?.message} />
            )}
          />
          <Controller
            name="confirmPassword"
            control={form.control}
            render={({ field, fieldState }) => (
              <PasswordField {...field} label="Confirm password" autoComplete="new-password" isInvalid={!!fieldState.error} error={fieldState.error?.message} />
            )}
          />
          <Button type="submit" variant="primary" className="w-full" isDisabled={form.formState.isSubmitting || !token}>
            Update password
          </Button>
          <Link href="/login" className="block text-center text-sm font-medium text-[#0b7de3] hover:underline">
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#0b7de3]" />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
