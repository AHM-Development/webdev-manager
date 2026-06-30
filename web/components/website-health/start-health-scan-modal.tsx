"use client";

import {
  Button,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  TextField,
  type useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  HEALTH_CHECKS,
  type HealthCapabilities,
  type HealthCheck,
  type HealthWebsiteRow,
} from "@/libs/api/website-health";

import { startHealthScanSchema, type StartHealthScanValues } from "./schema";

const CHECK_LABELS: Record<HealthCheck, string> = {
  lighthouse: "Lighthouse",
  technical_seo: "Technical SEO",
  design_qa: "Design QA",
  website_checklists: "Website checklists",
  security: "Security",
};

const CHECK_HINTS: Record<HealthCheck, string> = {
  lighthouse: "Needs a PageSpeed API key",
  technical_seo: "Configure AI in Settings",
  design_qa: "Configure AI in Settings",
  website_checklists: "Connect WordPress first",
  security: "Connect WordPress first",
};

function hostOf(url: string) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
}

export type StartScanOptions = { checks: HealthCheck[]; sitemapUrl?: string };

export function StartHealthScanModal({
  state,
  websites,
  capabilities,
  defaultWebsiteId,
  lockWebsite = false,
  onStart,
}: {
  state: ReturnType<typeof useOverlayState>;
  websites: HealthWebsiteRow[];
  capabilities: HealthCapabilities | null;
  defaultWebsiteId?: string;
  lockWebsite?: boolean;
  onStart: (websiteId: string, options: StartScanOptions) => Promise<void>;
}) {
  const form = useForm<StartHealthScanValues>({
    resolver: zodResolver(startHealthScanSchema),
    defaultValues: {
      websiteId: defaultWebsiteId ?? "",
      sitemapUrl: "",
      checks: {
        lighthouse: false,
        technical_seo: false,
        design_qa: false,
        website_checklists: false,
        security: false,
      },
    },
  });

  const websiteId = form.watch("websiteId");
  const checks = form.watch("checks");
  const selected = websites.find((website) => website.id === websiteId) ?? null;

  const availability = useMemo<Record<HealthCheck, boolean>>(
    () => ({
      lighthouse: !!capabilities?.lighthouse,
      technical_seo: !!capabilities?.ai,
      design_qa: !!capabilities?.ai,
      website_checklists: selected?.connector.status === "connected",
      security: selected?.connector.status === "connected",
    }),
    [capabilities, selected]
  );

  // Reset the chosen website whenever the modal opens (supports per-row prefill).
  useEffect(() => {
    if (state.isOpen) form.setValue("websiteId", defaultWebsiteId ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isOpen, defaultWebsiteId]);

  // Pre-fill the sitemap + check selection from the website's saved defaults.
  useEffect(() => {
    if (!selected) return;
    const saved = selected.profile.defaultChecks;
    const next = HEALTH_CHECKS.reduce(
      (acc, key) => {
        acc[key] = availability[key] && (saved ? saved.includes(key) : true);
        return acc;
      },
      {} as Record<HealthCheck, boolean>
    );
    form.setValue("checks", next, { shouldValidate: false });
    form.setValue("sitemapUrl", selected.profile.sitemapUrl ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, capabilities]);

  const close = () => {
    form.reset();
    state.close();
  };

  const submit = form.handleSubmit(async (values) => {
    const site = websites.find((website) => website.id === values.websiteId);
    if (!site) {
      form.setError("websiteId", { message: "Select a website" });
      return;
    }

    const sitemap = values.sitemapUrl.trim();
    if (sitemap) {
      const sitemapHost = hostOf(sitemap);
      if (!sitemapHost) {
        form.setError("sitemapUrl", { message: "Enter a valid URL" });
        return;
      }
      if (sitemapHost !== hostOf(site.url)) {
        form.setError("sitemapUrl", {
          message: `Sitemap must be on ${hostOf(site.url)}`,
        });
        return;
      }
    }

    const selectedChecks = HEALTH_CHECKS.filter((key) => values.checks[key]);
    await onStart(values.websiteId, {
      checks: selectedChecks,
      sitemapUrl: sitemap || undefined,
    });
    close();
  });

  const setCheck = (key: HealthCheck, value: boolean) =>
    form.setValue("checks", { ...checks, [key]: value }, { shouldValidate: true });

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="md">
          <ModalDialog>
            <form onSubmit={submit}>
              <ModalHeader>
                <ModalHeading>Scan Website</ModalHeading>
              </ModalHeader>
              <ModalBody className="space-y-4">
                <Controller
                  control={form.control}
                  name="websiteId"
                  render={({ field, fieldState }) => (
                    <div>
                      <label className="mb-1 block text-sm font-medium">Website</label>
                      <Select
                        aria-label="Website to scan"
                        isDisabled={lockWebsite}
                        selectedKey={field.value || null}
                        onSelectionChange={(key) => field.onChange(String(key))}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue>
                            {selected ? `${selected.projectName} - ${selected.name}` : "Select website"}
                          </SelectValue>
                          <SelectIndicator />
                        </SelectTrigger>
                        <SelectPopover>
                          <ListBox>
                            {websites.map((website) => (
                              <ListBoxItem key={website.id} id={website.id} textValue={`${website.projectName} ${website.name}`}>
                                <div>
                                  <p className="font-medium">{website.projectName}</p>
                                  <p className="text-xs text-slate-500">{website.name} - {website.url}</p>
                                </div>
                              </ListBoxItem>
                            ))}
                          </ListBox>
                        </SelectPopover>
                      </Select>
                      {fieldState.error && <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>}
                    </div>
                  )}
                />

                <Controller
                  control={form.control}
                  name="sitemapUrl"
                  render={({ field, fieldState }) => (
                    <TextField
                      aria-label="Sitemap URL"
                      value={field.value}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      isInvalid={!!fieldState.error}
                    >
                      <Label>Sitemap URL (optional)</Label>
                      <Input
                        className="w-full"
                        placeholder={selected ? `https://${hostOf(selected.url)}/sitemap.xml` : "https://example.com/sitemap.xml"}
                      />
                      <p className="mt-1 text-xs text-slate-500">
                        Saved for next time. Must be on the same domain as the website; leave blank to auto-discover.
                      </p>
                      {fieldState.error && <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>}
                    </TextField>
                  )}
                />

                <div>
                  <p className="mb-2 text-sm font-medium">Checks to run</p>
                  <div className="space-y-2">
                    {HEALTH_CHECKS.map((key) => {
                      const available = availability[key];
                      return (
                        <label
                          key={key}
                          className={`flex items-start gap-2 rounded-md border p-2 ${
                            available ? "border-slate-200" : "cursor-not-allowed border-slate-100 opacity-60"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={!available}
                            checked={available && !!checks[key]}
                            onChange={(event) => setCheck(key, event.target.checked)}
                            className="mt-0.5 h-4 w-4 accent-[var(--brand)]"
                          />
                          <span className="min-w-0">
                            <span className="text-sm font-medium text-slate-800">{CHECK_LABELS[key]}</span>
                            {!available && (
                              <span className="block text-xs text-slate-400">{CHECK_HINTS[key]}</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  {form.formState.errors.checks && (
                    <p className="mt-1 text-sm text-red-600">
                      {form.formState.errors.checks.message as string}
                    </p>
                  )}
                </div>
              </ModalBody>
              <ModalFooter className="flex justify-end gap-2">
                <Button type="button" variant="tertiary" onPress={close}>Cancel</Button>
                <Button type="submit" variant="primary" isDisabled={form.formState.isSubmitting || !websites.length}>
                  {form.formState.isSubmitting ? "Starting..." : "Start Scan"}
                </Button>
              </ModalFooter>
            </form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
