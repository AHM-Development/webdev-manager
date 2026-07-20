"use client";

import {
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  TextArea,
  TextField,
  TimeField,
} from "@heroui/react";
import { Time } from "@internationalized/date";
import { zodResolver } from "@hookform/resolvers/zod";
import { Mail, PlugZap, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  connectGoogleEmailConnector,
  disconnectGoogleEmailConnector,
  getEmailConnectorSettings,
  getAiPromptSettings,
  getWorkspaceSettings,
  sendTestEmail,
  testEmailConnector,
  updateAiPromptSettings,
  updateEmailConnectorSettings,
  updateWorkspaceSettings,
} from "@/libs/api/settings";
import {
  getNotificationSettings,
  testDiscordWebhook,
  updateNotificationSettings,
  type NotificationChannel as ApiNotificationChannel,
} from "@/libs/api/notifications";
import { notify } from "@/libs/notify";

import { settingsSchema, type SettingsFormValues } from "./schema";
import { ClientLogsTemplateSection } from "./client-logs-template-section";

type GoogleStatus = "Disconnected" | "Connected";
type GoogleTestStatus = "Not tested" | "Ready" | "Failed";
type NotificationChannel = "Off" | "Email" | "Discord" | "Both";

const TIMEZONES = ["Dubai", "London", "Manila"];
const NOTIFICATION_CHANNELS: NotificationChannel[] = [
  "Off",
  "Email",
  "Discord",
  "Both",
];

const defaultValues: SettingsFormValues = {
  workspaceName: "AHM Web Manager",
  supportEmail: "support@alliedhealthmedia.co.uk",
  timezone: "Dubai",
  defaultSenderName: "AHM Web Team",
  taskAssignments: "Email",
  reviews: "Both",
  clientLogs: "Both",
  issues: "Email",
  security: "Both",
  healthAlerts: "Both",
  passwordAgeAlerts: "Discord",
  dailyUserSummary: "Email",
  preShiftBriefing: "Both",
  weeklyDigest: "Off",
  dailySummaryTime: "18:00",
  preShiftBriefingTime: "08:30",
  managerNotes: "",
  discordWebhookUrl: "",
  googleClientId: "",
  googleClientSecret: "",
  googleRedirectUri: "http://localhost:3000/api/auth/google/callback",
  taskOrganizerSystemPrompt: "",
  taskOrganizerUserPrompt: "",
  taskOrganizerModel: "claude-sonnet-4-6",
  taskOrganizerTemperature: "0.2",
  taskOrganizerMaxTokens: "1400",
  technicalSeoSystemPrompt: "",
  technicalSeoUserPrompt: "",
  designQaSystemPrompt: "",
  designQaUserPrompt: "",
};

const toApiChannel: Record<NotificationChannel, ApiNotificationChannel> = {
  Off: "off",
  Email: "email",
  Discord: "discord",
  Both: "both",
};

const fromApiChannel: Record<ApiNotificationChannel, NotificationChannel> = {
  off: "Off",
  email: "Email",
  discord: "Discord",
  both: "Both",
};

function Section({
  icon,
  title,
  description,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="app-panel rounded-xl p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-[#e8f5ff] text-[#0b7de3]">
            {icon}
          </div>
          <div>
            <h2 className="text-base font-semibold text-gray-900">{title}</h2>
            <p className="mt-1 text-sm text-gray-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

function parseTimeValue(value?: string) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  return new Time(hour, minute);
}

function formatTimeValue(value: { hour: number; minute: number } | null) {
  if (!value) return "";
  return `${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}`;
}

function ControlledField({
  control,
  name,
  label,
  placeholder,
  type = "text",
}: {
  control: ReturnType<typeof useForm<SettingsFormValues>>["control"];
  name: keyof SettingsFormValues;
  label: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <TextField
          value={String(field.value ?? "")}
          onChange={field.onChange}
          onBlur={field.onBlur}
          type={type}
          isInvalid={!!fieldState.error}
        >
          <Label>{label}</Label>
          <Input ref={field.ref} className="w-full" placeholder={placeholder} />
          <FieldError message={fieldState.error?.message} />
        </TextField>
      )}
    />
  );
}

function ControlledSelect({
  control,
  name,
  label,
  options,
}: {
  control: ReturnType<typeof useForm<SettingsFormValues>>["control"];
  name: keyof SettingsFormValues;
  label: string;
  options: string[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <div>
          <label className="mb-1 block text-sm font-medium">{label}</label>
          <Select
            aria-label={label}
            selectedKey={String(field.value)}
            onSelectionChange={(key) => field.onChange(String(key))}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{String(field.value)}</SelectValue>
              <SelectIndicator />
            </SelectTrigger>
            <SelectPopover>
              <ListBox>
                {options.map((option) => (
                  <ListBoxItem key={option} id={option}>
                    {option}
                  </ListBoxItem>
                ))}
              </ListBox>
            </SelectPopover>
          </Select>
          <FieldError message={fieldState.error?.message} />
        </div>
      )}
    />
  );
}

function ScheduleTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
}) {
  return (
    <TimeField
      aria-label={label}
      value={parseTimeValue(value)}
      onChange={(nextValue) => onChange(formatTimeValue(nextValue))}
      className="mt-3 max-w-[180px]"
    >
      <TimeField.Group fullWidth>
        <TimeField.Input>
          {(segment) => <TimeField.Segment segment={segment} />}
        </TimeField.Input>
      </TimeField.Group>
    </TimeField>
  );
}

function NotificationRow({
  control,
  label,
  description,
  name,
  timeName,
  timePlaceholder,
}: {
  control: ReturnType<typeof useForm<SettingsFormValues>>["control"];
  label: string;
  description: string;
  name: keyof SettingsFormValues;
  timeName?: keyof SettingsFormValues;
  timePlaceholder?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="min-w-[220px] flex-1">
        <span className="block text-sm font-medium text-gray-900">{label}</span>
        <span className="mt-1 block text-sm text-gray-500">{description}</span>
        {timeName && (
          <Controller
            control={control}
            name={timeName}
            render={({ field, fieldState }) => (
              <>
                <ScheduleTimeField
                  label={timePlaceholder ?? `${label} time`}
                  value={String(field.value ?? "")}
                  onChange={field.onChange}
                />
                <FieldError message={fieldState.error?.message} />
              </>
            )}
          />
        )}
      </div>
      <Controller
        control={control}
        name={name}
        render={({ field, fieldState }) => (
          <div>
            <Select
              aria-label={`${label} delivery channel`}
              selectedKey={String(field.value)}
              onSelectionChange={(key) => field.onChange(String(key))}
            >
              <SelectTrigger className="min-w-[150px]">
                <SelectValue>{String(field.value)}</SelectValue>
                <SelectIndicator />
              </SelectTrigger>
              <SelectPopover>
                <ListBox>
                  {NOTIFICATION_CHANNELS.map((channel) => (
                    <ListBoxItem key={channel} id={channel}>
                      {channel}
                    </ListBoxItem>
                  ))}
                </ListBox>
              </SelectPopover>
            </Select>
            <FieldError message={fieldState.error?.message} />
          </div>
        )}
      />
    </div>
  );
}

export function SettingsView() {
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [googleStatus, setGoogleStatus] =
    useState<GoogleStatus>("Disconnected");
  const [googleTestStatus, setGoogleTestStatus] =
    useState<GoogleTestStatus>("Not tested");
  const [discordTesting, setDiscordTesting] = useState(false);
  const [testRecipient, setTestRecipient] = useState("");
  const [sendingTestEmail, setSendingTestEmail] = useState(false);

  const {
    control,
    handleSubmit,
    reset,
    getValues,
    formState: { isSubmitting },
  } = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsSchema),
    defaultValues,
  });

  useEffect(() => {
    let active = true;

    async function loadSettings() {
      setLoadError("");
      try {
        const [workspace, notifications, connector, taskPrompt, technicalSeoPrompt, designQaPrompt] = await Promise.all([
          getWorkspaceSettings(),
          getNotificationSettings(),
          getEmailConnectorSettings(),
          getAiPromptSettings("task_organizer"),
          getAiPromptSettings("website_technical_seo"),
          getAiPromptSettings("website_design_content_qa"),
        ]);

        if (!active) return;

        reset({
          workspaceName: workspace.workspaceName,
          supportEmail: workspace.supportEmail,
          timezone: workspace.timezone as SettingsFormValues["timezone"],
          defaultSenderName: workspace.defaultSenderName,
          taskAssignments: fromApiChannel[notifications.taskAssignments],
          reviews: fromApiChannel[notifications.reviews],
          clientLogs: fromApiChannel[notifications.clientLogs],
          issues: fromApiChannel[notifications.issues],
          security: fromApiChannel[notifications.security],
          healthAlerts: fromApiChannel[notifications.healthAlerts],
          passwordAgeAlerts: fromApiChannel[notifications.passwordAgeAlerts],
          dailyUserSummary: fromApiChannel[notifications.dailyUserSummary],
          preShiftBriefing: fromApiChannel[notifications.preShiftBriefing],
          weeklyDigest: fromApiChannel[notifications.weeklyDigest],
          dailySummaryTime: notifications.dailySummaryTime,
          preShiftBriefingTime: notifications.preShiftBriefingTime,
          managerNotes: notifications.managerNotes,
          discordWebhookUrl: notifications.discordWebhookUrl,
          googleClientId: connector.clientId,
          googleClientSecret: "",
          googleRedirectUri: connector.redirectUri || defaultValues.googleRedirectUri,
          taskOrganizerSystemPrompt: taskPrompt.systemPrompt,
          taskOrganizerUserPrompt: taskPrompt.userPromptTemplate,
          taskOrganizerModel: taskPrompt.model || defaultValues.taskOrganizerModel,
          taskOrganizerTemperature: String(taskPrompt.temperature),
          taskOrganizerMaxTokens: String(taskPrompt.maxTokens),
          technicalSeoSystemPrompt: technicalSeoPrompt.systemPrompt,
          technicalSeoUserPrompt: technicalSeoPrompt.userPromptTemplate,
          designQaSystemPrompt: designQaPrompt.systemPrompt,
          designQaUserPrompt: designQaPrompt.userPromptTemplate,
        });
        setGoogleStatus(connector.status === "connected" ? "Connected" : "Disconnected");
        setGoogleTestStatus(
          connector.lastTestStatus === "ready"
            ? "Ready"
            : connector.lastTestStatus === "failed"
              ? "Failed"
              : "Not tested"
        );
      } catch (err) {
        if (active) {
          const message = err instanceof Error ? err.message : "Unable to load settings.";
          setLoadError(message);
          notify.error("Unable to load settings", { description: message });
        }
      }
    }

    loadSettings();
    return () => {
      active = false;
    };
  }, [reset]);

  const save = handleSubmit(async (values) => {
    try {
      await Promise.all([
        updateWorkspaceSettings({
          workspaceName: values.workspaceName,
          supportEmail: values.supportEmail,
          timezone: values.timezone,
          defaultSenderName: values.defaultSenderName,
        }),
        updateNotificationSettings({
          taskAssignments: toApiChannel[values.taskAssignments],
          reviews: toApiChannel[values.reviews],
          clientLogs: toApiChannel[values.clientLogs],
          issues: toApiChannel[values.issues],
          security: toApiChannel[values.security],
          healthAlerts: toApiChannel[values.healthAlerts],
          passwordAgeAlerts: toApiChannel[values.passwordAgeAlerts],
          dailyUserSummary: toApiChannel[values.dailyUserSummary],
          preShiftBriefing: toApiChannel[values.preShiftBriefing],
          weeklyDigest: toApiChannel[values.weeklyDigest],
          dailySummaryTime: values.dailySummaryTime,
          preShiftBriefingTime: values.preShiftBriefingTime,
          managerNotes: values.managerNotes,
          discordWebhookUrl: values.discordWebhookUrl,
          inAppRealtimeEnabled: true,
        }),
        updateEmailConnectorSettings({
          clientId: values.googleClientId,
          clientSecret: values.googleClientSecret || undefined,
          redirectUri: values.googleRedirectUri,
        }),
        updateAiPromptSettings("task_organizer", {
          systemPrompt: values.taskOrganizerSystemPrompt,
          userPromptTemplate: values.taskOrganizerUserPrompt,
          model: values.taskOrganizerModel,
          temperature: Number(values.taskOrganizerTemperature),
          maxTokens: Number(values.taskOrganizerMaxTokens),
          enabled: true,
        }),
        updateAiPromptSettings("website_technical_seo", {
          systemPrompt: values.technicalSeoSystemPrompt,
          userPromptTemplate: values.technicalSeoUserPrompt,
          model: values.taskOrganizerModel,
          temperature: Number(values.taskOrganizerTemperature),
          maxTokens: Number(values.taskOrganizerMaxTokens),
          enabled: true,
        }),
        updateAiPromptSettings("website_design_content_qa", {
          systemPrompt: values.designQaSystemPrompt,
          userPromptTemplate: values.designQaUserPrompt,
          model: values.taskOrganizerModel,
          temperature: Number(values.taskOrganizerTemperature),
          maxTokens: Number(values.taskOrganizerMaxTokens),
          enabled: true,
        }),
      ]);

      setSaved(true);
      notify.success("Settings saved");
      window.setTimeout(() => setSaved(false), 2200);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to save settings.";
      notify.error("Unable to save settings", { description: message });
    }
  });

  const connectGoogle = async () => {
    try {
      const connector =
        googleStatus === "Connected"
          ? await disconnectGoogleEmailConnector()
          : await connectGoogleEmailConnector();
      setGoogleStatus(connector.status === "connected" ? "Connected" : "Disconnected");
      notify.success(
        connector.status === "connected" ? "Google email connected" : "Google email disconnected"
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to update Google email connector.";
      notify.error("Google email update failed", { description: message });
    }
  };

  const testGoogle = async () => {
    try {
      const values = getValues();
      await updateEmailConnectorSettings({
        clientId: values.googleClientId,
        clientSecret: values.googleClientSecret || undefined,
        redirectUri: values.googleRedirectUri,
      });
      const connector = await testEmailConnector();
      setGoogleTestStatus(
        connector.lastTestStatus === "ready"
          ? "Ready"
          : connector.lastTestStatus === "failed"
            ? "Failed"
            : "Not tested"
      );
      notify.success("Google email test complete", {
        description:
          connector.lastTestStatus === "ready"
            ? "Email connector is ready."
            : "Check the connector settings.",
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to test Google email connector.";
      notify.error("Google email test failed", { description: message });
    }
  };

  const handleSendTestEmail = async () => {
    const to = testRecipient.trim();
    if (!to.includes("@")) {
      notify.error("Enter a recipient", { description: "Type a valid email address to send the test to." });
      return;
    }
    setSendingTestEmail(true);
    try {
      // Persist the connector fields first so the test uses what's on screen.
      const values = getValues();
      await updateEmailConnectorSettings({
        clientId: values.googleClientId,
        clientSecret: values.googleClientSecret || undefined,
        redirectUri: values.googleRedirectUri,
      });
      await sendTestEmail(to);
      setGoogleTestStatus("Ready");
      notify.success("Test email sent", { description: `Delivered to ${to}. Check the inbox.` });
    } catch (err) {
      setGoogleTestStatus("Failed");
      notify.error("Test email failed", {
        description: err instanceof Error ? err.message : "Could not send the test email.",
      });
    } finally {
      setSendingTestEmail(false);
    }
  };

  const testDiscord = async () => {
    setDiscordTesting(true);
    try {
      // Persist the URL first so the backend tests the value on screen.
      const values = getValues();
      await updateNotificationSettings({ discordWebhookUrl: values.discordWebhookUrl });
      const result = await testDiscordWebhook();
      if (result.ok) {
        notify.success("Discord test sent", { description: result.message });
      } else {
        notify.error("Discord test failed", { description: result.message });
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to reach Discord.";
      notify.error("Discord test failed", { description: message });
    } finally {
      setDiscordTesting(false);
    }
  };

  return (
    <div className="space-y-5">
    <form className="space-y-5" onSubmit={save}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure workspace defaults, notification routing, and Google email
            delivery.
          </p>
          {loadError && <span className="sr-only">{loadError}</span>}
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="sr-only">Saved</span>}
          <Button type="submit" variant="primary" isDisabled={isSubmitting}>
            <Save className="h-4 w-4" />
            Save Settings
          </Button>
        </div>
      </div>

      <Section
        icon={<Mail className="h-5 w-5" />}
        title="Workspace"
        description="Set the defaults used across projects, reports, and notification emails."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <ControlledField control={control} name="workspaceName" label="Workspace Name" />
          <ControlledField
            control={control}
            name="supportEmail"
            label="Support Email"
            type="email"
          />
          <ControlledSelect
            control={control}
            name="timezone"
            label="Timezone"
            options={TIMEZONES}
          />
          <ControlledField
            control={control}
            name="defaultSenderName"
            label="Default Sender Name"
          />
        </div>
      </Section>

      <Section
        icon={<PlugZap className="h-5 w-5" />}
        title="Website Health AI Reviews"
        description="Required Claude prompts for evidence-based technical SEO and design/content reviews. Figma comparison remains deferred."
      >
        <div className="grid gap-6">
          <div className="grid gap-4">
            <h3 className="text-sm font-semibold text-slate-900">Technical SEO</h3>
            <Controller
              control={control}
              name="technicalSeoSystemPrompt"
              render={({ field, fieldState }) => (
                <TextField value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={!!fieldState.error}>
                  <Label>System Prompt</Label>
                  <TextArea ref={field.ref} rows={4} className="w-full resize-y" placeholder="Define Claude's technical SEO review role and evidence rules." />
                  <FieldError message={fieldState.error?.message} />
                </TextField>
              )}
            />
            <Controller
              control={control}
              name="technicalSeoUserPrompt"
              render={({ field, fieldState }) => (
                <TextField value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={!!fieldState.error}>
                  <Label>User Prompt Template</Label>
                  <TextArea ref={field.ref} rows={5} className="w-full resize-y" placeholder="Use {{checklist}}, {{identity}}, and {{evidence}}." />
                  <FieldError message={fieldState.error?.message} />
                </TextField>
              )}
            />
          </div>
          <div className="grid gap-4 border-t border-slate-200 pt-5">
            <h3 className="text-sm font-semibold text-slate-900">Design and Content QA</h3>
            <Controller
              control={control}
              name="designQaSystemPrompt"
              render={({ field, fieldState }) => (
                <TextField value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={!!fieldState.error}>
                  <Label>System Prompt</Label>
                  <TextArea ref={field.ref} rows={4} className="w-full resize-y" placeholder="Define Claude's responsive layout, typography, and content review role." />
                  <FieldError message={fieldState.error?.message} />
                </TextField>
              )}
            />
            <Controller
              control={control}
              name="designQaUserPrompt"
              render={({ field, fieldState }) => (
                <TextField value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={!!fieldState.error}>
                  <Label>User Prompt Template</Label>
                  <TextArea ref={field.ref} rows={5} className="w-full resize-y" placeholder="Use {{checklist}}, {{identity}}, and {{evidence}}." />
                  <FieldError message={fieldState.error?.message} />
                </TextField>
              )}
            />
          </div>
        </div>
      </Section>

      <Section
        icon={<PlugZap className="h-5 w-5" />}
        title="Notifications"
        description="Choose whether each alert is off, sent by email, sent to Discord, or sent to both."
      >
        <div className="mb-4 flex items-end gap-3">
          <div className="flex-1">
            <ControlledField
              control={control}
              name="discordWebhookUrl"
              label="Discord Webhook URL"
              placeholder="https://discord.com/api/webhooks/..."
              type="url"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onPress={testDiscord}
            isDisabled={discordTesting}
          >
            {discordTesting ? "Sending…" : "Send test"}
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <NotificationRow
            control={control}
            name="taskAssignments"
            label="Task assignments"
            description="Notify a user when a task or client-log stage is assigned to them."
          />
          <NotificationRow
            control={control}
            name="reviews"
            label="Review requests"
            description="Notify the reviewer when a task or stage needs their review."
          />
          <NotificationRow
            control={control}
            name="clientLogs"
            label="Client Logs"
            description="Blocked stages and meeting actions awaiting confirmation."
          />
          <NotificationRow
            control={control}
            name="issues"
            label="Issue boards"
            description="Issues applied to a client, and issues marked fixed."
          />
          <NotificationRow
            control={control}
            name="security"
            label="Security"
            description="Sensitive account events, e.g. when Viktor is connected."
          />
          <NotificationRow
            control={control}
            name="healthAlerts"
            label="Website health alerts"
            description="Scan finished, critical findings, or a failed scan."
          />
          <NotificationRow
            control={control}
            name="passwordAgeAlerts"
            label="Password age alerts"
            description="Notify admins when stored credentials become stale."
          />
          <NotificationRow
            control={control}
            name="dailyUserSummary"
            timeName="dailySummaryTime"
            timePlaceholder="Send at 18:00"
            label="Daily user summary"
            description="Send each user a daily summary of what they completed."
          />
          <NotificationRow
            control={control}
            name="preShiftBriefing"
            timeName="preShiftBriefingTime"
            timePlaceholder="Send at 08:30"
            label="Pre-shift briefing"
            description="Before shift starts, send each user their todos, priorities, and manager notes."
          />
          <NotificationRow
            control={control}
            name="weeklyDigest"
            label="Weekly digest"
            description="Send a weekly summary of project movement and website health."
          />
        </div>
        <div className="mt-4 grid gap-4">
          <Controller
            control={control}
            name="managerNotes"
            render={({ field, fieldState }) => (
              <TextField
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                isInvalid={!!fieldState.error}
              >
                <Label>Default Manager Notes</Label>
                <TextArea
                  ref={field.ref}
                  rows={4}
                  className="w-full resize-y"
                  placeholder="Optional notes included in the pre-shift briefing, such as priorities, blockers to watch, or client expectations."
                />
                <FieldError message={fieldState.error?.message} />
              </TextField>
            )}
          />
        </div>
      </Section>

      <Section
        icon={<PlugZap className="h-5 w-5" />}
        title="Google OAuth Email Connector"
        description="Connect a Google account and use Gmail OAuth to send task notifications, reports, and alerts."
        action={
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="tertiary" onPress={testGoogle}>
              Test
            </Button>
            <Button type="button" size="sm" variant="tertiary" onPress={connectGoogle}>
              {googleStatus === "Connected" ? "Disconnect" : "Connect Google"}
            </Button>
          </div>
        }
      >
        <div className="mb-4 flex items-center gap-2">
          <Chip
            size="sm"
            variant="soft"
            color={googleStatus === "Connected" ? "success" : "default"}
          >
            {googleStatus}
          </Chip>
          <Chip
            size="sm"
            variant="soft"
            color={
              googleTestStatus === "Ready"
                ? "success"
                : googleTestStatus === "Failed"
                  ? "danger"
                  : "default"
            }
          >
            Test: {googleTestStatus}
          </Chip>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <ControlledField
            control={control}
            name="googleClientId"
            label="Google Client ID"
            placeholder="Google OAuth client ID"
          />
          <ControlledField
            control={control}
            name="googleClientSecret"
            label="Google Client Secret"
            placeholder="Stored encrypted on backend"
            type="password"
          />
          <ControlledField
            control={control}
            name="googleRedirectUri"
            label="Redirect URI"
          />
        </div>

        <div className="mt-4 border-t border-slate-100 pt-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Send a test email
          </label>
          <p className="mb-2 text-xs text-slate-500">
            Sends a real email to confirm delivery is working.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Input
                type="email"
                aria-label="Test email recipient"
                placeholder="recipient@example.com"
                value={testRecipient}
                onChange={(event) => setTestRecipient(event.target.value)}
                className="w-full"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              onPress={handleSendTestEmail}
              isDisabled={sendingTestEmail}
              isPending={sendingTestEmail}
            >
              {sendingTestEmail ? "Sending…" : "Send test email"}
            </Button>
          </div>
        </div>
      </Section>

      <Section
        icon={<PlugZap className="h-5 w-5" />}
        title="AI Task Organizer"
        description="Required prompt used by Claude when organizing pasted messages, links, and attachments into task drafts."
      >
        <div className="grid gap-4">
          <Controller
            control={control}
            name="taskOrganizerSystemPrompt"
            render={({ field, fieldState }) => (
              <TextField
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                isInvalid={!!fieldState.error}
              >
                <Label>System Prompt</Label>
                <TextArea
                  ref={field.ref}
                  rows={5}
                  className="w-full resize-y"
                  placeholder="Define Claude's role, rules, and output discipline for organizing tasks."
                />
                <FieldError message={fieldState.error?.message} />
              </TextField>
            )}
          />
          <Controller
            control={control}
            name="taskOrganizerUserPrompt"
            render={({ field, fieldState }) => (
              <TextField
                value={field.value}
                onChange={field.onChange}
                onBlur={field.onBlur}
                isInvalid={!!fieldState.error}
              >
                <Label>User Prompt Template</Label>
                <TextArea
                  ref={field.ref}
                  rows={7}
                  className="w-full resize-y"
                  placeholder="Use {{inputJson}} for full source context. Return strict JSON only."
                />
                <FieldError message={fieldState.error?.message} />
              </TextField>
            )}
          />
          <div className="grid gap-4 md:grid-cols-3">
            <ControlledField
              control={control}
              name="taskOrganizerModel"
              label="Claude Model"
              placeholder="claude-sonnet-4-6"
            />
            <ControlledField
              control={control}
              name="taskOrganizerTemperature"
              label="Temperature"
              type="number"
            />
            <ControlledField
              control={control}
              name="taskOrganizerMaxTokens"
              label="Max Tokens"
              type="number"
            />
          </div>
        </div>
      </Section>
    </form>
    <ClientLogsTemplateSection />
    </div>
  );
}
