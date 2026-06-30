"use client";

import {
  Button,
  Input,
  Label,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  TextField,
  useOverlayState,
} from "@heroui/react";
import { Camera, KeyRound, LogOut, Mail, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { PasswordField } from "@/components/ui/password";
import { DateOfBirthField } from "@/components/users/date-of-birth-field";
import { DiscordConnectionField } from "@/components/users/discord-connection-field";
import { GenderSelect } from "@/components/users/gender-select";
import { InternationalPhoneInput } from "@/components/users/international-phone-input";
import {
  profileSchema,
  profilePasswordSchema,
  type ProfilePasswordValues,
  type ProfileValues,
} from "@/components/users/user-form-schemas";
import {
  changeProfilePassword,
  getProfile,
  requestProfilePasswordOtp,
  updateProfile,
} from "@/libs/api/users";
import { notify } from "@/libs/notify";
import { listAuthSessions, revokeAuthSession, type AuthSession } from "@/libs/api/auth";
import { useAuthContext } from "@/libs/auth/auth-context";

export function MyProfileView() {
  const otpModal = useOverlayState();
  const { logout, logoutAll } = useAuthContext();
  const [otpSent, setOtpSent] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [initials, setInitials] = useState("AH");
  const [sessions, setSessions] = useState<AuthSession[]>([]);
  const form = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      phoneE164: "",
      discordId: "",
      dateOfBirth: "",
      gender: undefined,
    },
  });

  useEffect(() => {
    let active = true;

    async function loadProfile() {
      setProfileError("");
      try {
        const [user, activeSessions] = await Promise.all([getProfile(), listAuthSessions()]);
        if (!active) return;
        form.reset({
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          email: user.email,
          phoneE164: user.phoneE164 ?? "",
          discordId: user.discordId ?? "",
          dateOfBirth: user.dateOfBirth
            ? String(user.dateOfBirth).slice(0, 10)
            : "",
          gender: user.gender ?? undefined,
        });
        setRoleLabel(
          user.role === "superadmin"
            ? "Super Admin"
            : user.role === "developer"
              ? "Developer"
              : "Spectator"
        );
        setInitials(
          `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase() ||
            "AH"
        );
        setSessions(activeSessions);
      } catch (err) {
        if (!active) return;
        const message = err instanceof Error ? err.message : "Unable to load profile.";
        setProfileError(message);
        notify.error("Unable to load profile", { description: message });
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [form]);

  const submit = form.handleSubmit(async (values) => {
    setProfileSaved(false);
    setProfileError("");
    try {
      await updateProfile(values);
      setProfileSaved(true);
      notify.success("Profile saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save profile.";
      setProfileError(message);
      notify.error("Unable to save profile", { description: message });
    }
  });

  return (
    <div className="space-y-5">
      <form className="app-panel overflow-hidden" onSubmit={submit}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 p-5">
          <div>
            <h1 className="text-2xl font-semibold text-slate-950">
              My Profile
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Manage your profile, contact details, and security settings.
            </p>
          </div>
          <Button type="submit" variant="primary">Save Profile</Button>
        </div>

        <div className="grid gap-6 p-5 lg:grid-cols-[260px_1fr]">
          <div className="app-panel-subtle p-4">
            <div className="mx-auto grid h-28 w-28 place-items-center rounded-2xl bg-gradient-to-br from-[#24c7d5] to-[#082a78] text-3xl font-semibold text-white">
              {initials}
            </div>
            <Button className="mt-4 w-full" variant="tertiary">
              <Camera className="h-4 w-4" />
              Change Photo
            </Button>
            <p className="mt-3 text-center text-xs leading-5 text-slate-500">
              JPG, PNG, or WebP. Recommended square image.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Controller
              name="firstName"
              control={form.control}
              render={({ field, fieldState }) => (
            <TextField value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={!!fieldState.error}>
              <Label>First Name</Label>
              <Input />
              {fieldState.error && <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>}
            </TextField>
              )}
            />
            <Controller
              name="lastName"
              control={form.control}
              render={({ field, fieldState }) => (
            <TextField value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={!!fieldState.error}>
              <Label>Last Name</Label>
              <Input />
              {fieldState.error && <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>}
            </TextField>
              )}
            />
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
            <TextField value={field.value} isReadOnly isInvalid={!!fieldState.error}>
              <Label>Email</Label>
              <Input type="email" readOnly className="bg-slate-50 text-slate-500" />
              {fieldState.error && <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>}
            </TextField>
              )}
            />
            <Controller
              name="phoneE164"
              control={form.control}
              render={({ field, fieldState }) => (
            <InternationalPhoneInput
              defaultCountryCode="+971"
              value={field.value}
              onChange={field.onChange}
              helperText=""
              error={fieldState.error?.message}
            />
              )}
            />
            <Controller
              name="dateOfBirth"
              control={form.control}
              render={({ field, fieldState }) => (
                <DateOfBirthField value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
              )}
            />
            <Controller
              name="gender"
              control={form.control}
              render={({ field, fieldState }) => (
                <GenderSelect value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
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
            />
              )}
            />
            <TextField value={roleLabel} isReadOnly>
              <Label>Role</Label>
              <Input readOnly className="bg-slate-50 text-slate-500" />
            </TextField>
          </div>
        </div>
        {(profileSaved || profileError) && (
          <span className="sr-only">
            {profileSaved ? "Profile saved." : profileError}
          </span>
        )}
      </form>

      <section className="app-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-[#0b7de3]" />
              <h2 className="text-base font-semibold text-slate-950">
                Password & Security
              </h2>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
              Changing your password requires a one-time passcode sent to your
              email before the new password can be saved.
            </p>
          </div>
          <Button variant="primary" onPress={otpModal.open}>
            Change Password
          </Button>
        </div>
      </section>

      <section className="app-panel p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <MonitorSmartphone className="h-5 w-5 text-[#0b7de3]" />
              <h2 className="text-base font-semibold text-slate-950">Active Sessions</h2>
            </div>
            <p className="mt-2 text-sm text-slate-500">
              Review devices that can currently access your account.
            </p>
          </div>
          <Button variant="tertiary" onPress={() => void logoutAll()}>
            <LogOut className="h-4 w-4" />
            Log out all devices
          </Button>
        </div>
        <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
          {sessions.filter((session) => !session.revokedAt).map((session) => (
            <div key={session.id} className="flex items-center justify-between gap-4 py-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {session.userAgent || "Unknown device"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {session.ipAddress || "Unknown IP"} · Last active {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.lastSeenAt))}
                  {session.current ? " · Current session" : ""}
                </p>
              </div>
              <Button
                isIconOnly
                variant="ghost"
                aria-label={`Revoke session ${session.id}`}
                onPress={async () => {
                  if (session.current) {
                    await logout();
                    return;
                  }
                  await revokeAuthSession(session.id);
                  setSessions((current) => current.filter((item) => item.id !== session.id));
                  notify.success("Session revoked");
                }}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          ))}
          {!sessions.some((session) => !session.revokedAt) && (
            <p className="py-5 text-sm text-slate-500">No active sessions found.</p>
          )}
        </div>
      </section>

      <PasswordOtpModal
        state={otpModal}
        otpSent={otpSent}
        onSendOtp={async () => {
          try {
            await requestProfilePasswordOtp();
            setOtpSent(true);
            notify.success("OTP sent", {
              description: "Check your email for the password verification code.",
            });
          } catch (err) {
            const message = err instanceof Error ? err.message : "Unable to send OTP.";
            notify.error("Unable to send OTP", { description: message });
          }
        }}
        onSaved={() => setOtpSent(false)}
      />
    </div>
  );
}

function PasswordOtpModal({
  state,
  otpSent,
  onSendOtp,
  onSaved,
}: {
  state: ReturnType<typeof useOverlayState>;
  otpSent: boolean;
  onSendOtp: () => Promise<void>;
  onSaved: () => void;
}) {
  const [error, setError] = useState("");
  const passwordForm = useForm<ProfilePasswordValues>({
    resolver: zodResolver(profilePasswordSchema),
    defaultValues: { otp: "", newPassword: "", confirmPassword: "" },
  });

  const savePassword = passwordForm.handleSubmit(async (values) => {
    setError("");
    try {
      await changeProfilePassword(values);
      passwordForm.reset();
      onSaved();
      state.close();
      notify.success("Password changed");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to change password.";
      setError(message);
      notify.error("Unable to change password", { description: message });
    }
  });

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="md">
          <ModalDialog>
            <ModalHeader>
              <ModalHeading className="text-lg font-semibold">
                Verify Password Change
              </ModalHeading>
            </ModalHeader>
            <ModalBody className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-[#f7f8fa] p-4">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 text-[#0b7de3]" />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">
                      Email OTP verification
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Send a one-time passcode to your email before setting a
                      new password.
                    </p>
                  </div>
                </div>
                <Button className="mt-3" variant="tertiary" onPress={onSendOtp}>
                  Send OTP
                </Button>
              </div>

              {otpSent && (
                <p className="flex items-center gap-2 rounded-xl bg-[#e8f5ff] px-3 py-2 text-sm font-medium text-[#082a78]">
                  <ShieldCheck className="h-4 w-4" />
                  OTP sent to your email.
                </p>
              )}

              <Controller
                name="otp"
                control={passwordForm.control}
                render={({ field, fieldState }) => (
                  <TextField {...field} isInvalid={!!fieldState.error}>
                    <Label>OTP Code</Label>
                    <Input inputMode="numeric" autoComplete="one-time-code" placeholder="6-digit code" />
                    {fieldState.error && <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>}
                  </TextField>
                )}
              />
              <Controller
                name="newPassword"
                control={passwordForm.control}
                render={({ field, fieldState }) => (
                  <PasswordField
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    inputRef={field.ref}
                    label="New Password"
                    placeholder="New password"
                    autoComplete="new-password"
                    isInvalid={!!fieldState.error}
                    error={fieldState.error?.message}
                  />
                )}
              />
              <Controller
                name="confirmPassword"
                control={passwordForm.control}
                render={({ field, fieldState }) => (
                  <PasswordField
                    name={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    inputRef={field.ref}
                    label="Confirm New Password"
                    placeholder="Confirm new password"
                    autoComplete="new-password"
                    isInvalid={!!fieldState.error}
                    error={fieldState.error?.message}
                  />
                )}
              />
              {error && <span className="sr-only">{error}</span>}
            </ModalBody>
            <ModalFooter className="flex justify-end gap-2">
              <Button variant="tertiary" onPress={state.close}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onPress={() => void savePassword()}
                isDisabled={passwordForm.formState.isSubmitting}
              >
                Save Password
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
