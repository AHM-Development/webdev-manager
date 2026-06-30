"use client";

import {
  Button,
  Input,
  Label,
  TextField,
} from "@heroui/react";
import { ShieldCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { PasswordField } from "@/components/ui/password";
import { DateOfBirthField } from "@/components/users/date-of-birth-field";
import { DiscordConnectionField } from "@/components/users/discord-connection-field";
import { GenderSelect } from "@/components/users/gender-select";
import { InternationalPhoneInput } from "@/components/users/international-phone-input";
import {
  inviteRegistrationSchema,
  type InviteRegistrationValues,
} from "@/components/users/user-form-schemas";
import { acceptInvite, getInvite } from "@/libs/api/users";
import { notify } from "@/libs/notify";

export function InviteRegistrationForm() {
  const routeParams = useParams<{ token: string }>();
  const router = useRouter();
  const email = "";
  const [saved, setSaved] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [inviteExpiresAt, setInviteExpiresAt] = useState<string | null>(null);
  const form = useForm<InviteRegistrationValues>({
    resolver: zodResolver(inviteRegistrationSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email,
      dateOfBirth: "",
      gender: undefined,
      phoneE164: "",
      discordId: "",
      password: "",
      confirmPassword: "",
    },
  });
  const inviteEmail = useWatch({ control: form.control, name: "email" });

  useEffect(() => {
    let active = true;

    async function loadInvite() {
      setLoadingInvite(true);
      setSubmitError("");
      try {
        const invite = await getInvite(routeParams.token);
        if (!active) return;
        form.reset({
          firstName: invite.firstName,
          lastName: invite.lastName,
          email: invite.email,
          dateOfBirth: "",
          gender: undefined,
          phoneE164: "",
          discordId: "",
          password: "",
          confirmPassword: "",
        });
        setInviteExpiresAt(invite.expiresAt);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Invite link is invalid or expired.";
        setSubmitError(message);
        notify.error("Invite unavailable", { description: message });
      } finally {
        if (active) setLoadingInvite(false);
      }
    }

    loadInvite();
    return () => {
      active = false;
    };
  }, [form, routeParams.token]);

  const submit = form.handleSubmit(async (values) => {
    setSubmitError("");
    try {
      await acceptInvite(routeParams.token, values);
      setSaved(true);
      notify.success("Account profile saved", {
        description: "You can now sign in.",
      });
      router.replace("/login");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to complete registration.";
      setSubmitError(message);
      notify.error("Registration failed", { description: message });
    }
  });

  return (
    <div className="min-h-dvh bg-[#e8e8eb] px-4 py-8">
      <div className="mx-auto max-w-3xl">
        <div className="app-panel overflow-hidden">
          <div className="border-b border-slate-100 p-6">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-16 items-center justify-center rounded-xl bg-white ring-1 ring-slate-200">
                <Image src="/ahm-logo.png" alt="AHM" width={56} height={32} className="h-8 w-auto" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0b7de3]">
                  Team invite
                </p>
                <h1 className="mt-1 text-2xl font-semibold text-slate-950">
                  Complete your account
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  Confirm your profile details and set a secure password to
                  join AHM Web Manager.
                </p>
              </div>
            </div>
          </div>

          <form onSubmit={submit}>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <Controller
              name="firstName"
              control={form.control}
              render={({ field, fieldState }) => (
            <TextField
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              isInvalid={!!fieldState.error}
            >
              <Label>First Name</Label>
              <Input placeholder="First name" />
              {fieldState.error && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldState.error.message}
                </p>
              )}
            </TextField>
              )}
            />
            <Controller
              name="lastName"
              control={form.control}
              render={({ field, fieldState }) => (
            <TextField
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}
              isInvalid={!!fieldState.error}
            >
              <Label>Last Name</Label>
              <Input placeholder="Last name" />
              {fieldState.error && (
                <p className="mt-1 text-sm text-red-600">
                  {fieldState.error.message}
                </p>
              )}
            </TextField>
              )}
            />
            <TextField value={inviteEmail || email} isReadOnly className="sm:col-span-2">
              <Label>Email</Label>
              <Input readOnly className="bg-slate-50 text-slate-500" />
            </TextField>

            <Controller
              name="dateOfBirth"
              control={form.control}
              render={({ field, fieldState }) => (
                <DateOfBirthField
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="gender"
              control={form.control}
              render={({ field, fieldState }) => (
                <GenderSelect
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                />
              )}
            />

            <Controller
              name="phoneE164"
              control={form.control}
              render={({ field, fieldState }) => (
                <InternationalPhoneInput
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  className="sm:col-span-2"
                />
              )}
            />
            <Controller
              name="discordId"
              control={form.control}
              render={({ field, fieldState }) => (
                <DiscordConnectionField
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  className="sm:col-span-2"
                />
              )}
            />

            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <PasswordField
                  label="Password"
                  placeholder="Create password"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  isInvalid={!!fieldState.error}
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              name="confirmPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <PasswordField
                  label="Confirm Password"
                  placeholder="Confirm password"
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  isInvalid={!!fieldState.error}
                  error={fieldState.error?.message}
                />
              )}
            />
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-6">
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <ShieldCheck className="h-4 w-4 text-[#0b7de3]" />
              {inviteExpiresAt
                ? `Invite expires ${new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(inviteExpiresAt))}.`
                : "Invite expiration is being verified."}
            </p>
            <Button type="submit" variant="primary" isDisabled={loadingInvite || form.formState.isSubmitting}>
              Save Account
            </Button>
          </div>
          </form>
          {saved && <span className="sr-only">Account profile saved. You can now sign in.</span>}
          {submitError && <span className="sr-only">{submitError}</span>}
        </div>
      </div>
    </div>
  );
}
