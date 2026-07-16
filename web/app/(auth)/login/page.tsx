"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Form,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  loginSchema,
  type LoginValues,
} from "@/components/login/schema/loginschema";
import { PasswordField } from "@/components/ui/password";
import type { ApiError } from "@/libs/api";
import { useAuth } from "@/libs/hooks/useAuth";
import { notify } from "@/libs/notify";

const LoginPage = () => {
  const { login, user, isLoading } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  useEffect(() => {
    if (!isLoading && user) router.replace("/dashboard");
  }, [isLoading, router, user]);

  const onSubmit = async (values: LoginValues) => {
    setServerError(null);
    try {
      await login(values);
    } catch (err) {
      const message = (err as ApiError).message || "Unable to sign in.";
      setServerError(message);
      notify.error("Sign in failed", { description: message });
    }
  };

  return (
    <Card className="blue-glow w-full max-w-md gap-0 rounded-lg border border-slate-200 bg-white/92 p-0 text-slate-950 shadow-2xl shadow-slate-300/30 backdrop-blur-xl">
      <CardHeader className="border-b border-slate-200 p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#cfe9ff] bg-[#e8f5ff] px-3 py-1.5 text-xs font-semibold text-[#082a78]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Secure access
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              Sign in to your workspace
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Pick up your projects, client timelines, site health, and
              credentials — right where you left off.
            </p>
          </div>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#24c7d5] via-[#0b7de3] to-[#082a78] text-white shadow-lg shadow-blue-500/20">
            <LockKeyhole className="h-5 w-5" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-7">
        <Form
          onSubmit={handleSubmit(onSubmit)}
          validationBehavior="aria"
          className="space-y-5"
        >
          <div className="w-full space-y-4">
            <Controller
              control={control}
              name="email"
              render={({ field, fieldState }) => (
                <TextField
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  isInvalid={!!fieldState.error}
                  type="email"
                >
                  <Label className="text-sm font-medium text-slate-700">
                    Email
                  </Label>
                  <Input
                    ref={field.ref}
                    type="email"
                    placeholder="you@alliedhealthmedia.co.uk"
                    autoComplete="email"
                    className="mt-1 border-slate-200 bg-white text-slate-950 placeholder:text-slate-400"
                  />
                  {fieldState.error && (
                    <p className="mt-1 text-sm text-red-600">
                      {fieldState.error.message}
                    </p>
                  )}
                </TextField>
              )}
            />

            <Controller
              control={control}
              name="password"
              render={({ field, fieldState }) => (
                <PasswordField
                  name={field.name}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  isInvalid={!!fieldState.error}
                  error={fieldState.error?.message}
                  inputRef={field.ref}
                />
              )}
            />

            {serverError && <span className="sr-only">{serverError}</span>}
          </div>

          <Button
            type="submit"
            className="h-11 w-full rounded-xl bg-gradient-to-r from-[#24c7d5] via-[#0b7de3] to-[#082a78] font-semibold text-white shadow-lg shadow-blue-500/20 hover:brightness-105"
            isDisabled={isSubmitting || isLoading}
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </Form>

        <p className="mt-5 text-xs leading-5 text-slate-500">
          For approved team members only. Never share your login, or keep client
          passwords anywhere but the vault.
        </p>
      </CardContent>
    </Card>
  );
};

export default LoginPage;
