"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, CardContent, CardHeader, Input, Label, TextField } from "@heroui/react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";

import {
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from "@/components/login/schema/loginschema";
import { forgotPassword } from "@/libs/api/auth";
import { notify } from "@/libs/notify";

export default function ForgotPasswordPage() {
  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const submit = form.handleSubmit(async (values) => {
    try {
      const message = await forgotPassword(values);
      notify.success("Request received", { description: message });
      form.reset();
    } catch (error) {
      notify.error("Unable to request reset", {
        description: error instanceof Error ? error.message : "Try again later.",
      });
    }
  });

  return (
    <Card className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-0 shadow-xl">
      <CardHeader className="border-b border-slate-200 p-7">
        <div>
          <h1 className="text-2xl font-semibold">Reset your password</h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your account email and we will send a time-limited reset link.
          </p>
        </div>
      </CardHeader>
      <CardContent className="p-7">
        <form onSubmit={submit} className="space-y-5">
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <TextField {...field} isInvalid={!!fieldState.error} type="email">
                <Label>Email</Label>
                <Input type="email" autoComplete="email" placeholder="you@agency.com" />
                {fieldState.error && <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>}
              </TextField>
            )}
          />
          <Button type="submit" variant="primary" className="w-full" isDisabled={form.formState.isSubmitting}>
            Send reset link
          </Button>
          <Link href="/login" className="block text-center text-sm font-medium text-[#0b7de3] hover:underline">
            Back to sign in
          </Link>
        </form>
      </CardContent>
    </Card>
  );
}
