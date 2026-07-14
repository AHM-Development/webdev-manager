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
  TextArea,
  TextField,
  type useOverlayState,
} from "@heroui/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";

import {
  getWebsiteHealth,
  updateWebsiteHealthProfile,
  type HealthWebsiteRow,
} from "@/libs/api/website-health";
import { notify } from "@/libs/notify";

import {
  websiteHealthProfileSchema,
  type WebsiteHealthProfileValues,
} from "./schema";

const DEFAULT_ESSENTIAL_PLUGINS = ["Elementor", "PRO Elements", "WP Rocket", "UpdraftPlus", "Kadence Security Basic", "WP Activity", "WP Mail SMTP", "Rank Math SEO", "Rank Math SEO PRO", "AHM Core"];

const defaults: WebsiteHealthProfileValues = {
  organizationName: "",
  approvedNames: "",
  essentialPlugins: DEFAULT_ESSENTIAL_PLUGINS.join("\n"),
  maxPages: 25,
  contentStalenessDays: 90,
};

function lines(value: unknown) {
  return Array.isArray(value) ? value.join("\n") : "";
}

export function WebsiteHealthProfileModal({
  state,
  website,
}: {
  state: ReturnType<typeof useOverlayState>;
  website: HealthWebsiteRow | null;
}) {
  const {
    control,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<WebsiteHealthProfileValues>({
    resolver: zodResolver(websiteHealthProfileSchema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (!state.isOpen || !website) return;
    let active = true;
    void getWebsiteHealth(website.id)
      .then((detail) => {
        if (!active) return;
        const identity = detail.profile.approvedIdentity || {};
        reset({
          organizationName: String(identity.organizationName || ""),
          approvedNames: lines(identity.approvedNames),
          essentialPlugins: detail.profile.essentialPlugins.length
            ? detail.profile.essentialPlugins.join("\n")
            : DEFAULT_ESSENTIAL_PLUGINS.join("\n"),
          maxPages: detail.profile.maxPages,
          contentStalenessDays: detail.profile.contentStalenessDays ?? 90,
        });
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : "Scan settings could not be loaded.";
        notify.error("Unable to load scan settings", { description: message });
      });
    return () => { active = false; };
  }, [reset, state.isOpen, website]);

  const save = handleSubmit(async (values) => {
    if (!website) return;
    try {
      await updateWebsiteHealthProfile(website.id, {
        approvedIdentity: {
          organizationName: values.organizationName.trim(),
          approvedNames: values.approvedNames.split("\n").map((value) => value.trim()).filter(Boolean),
        },
        essentialPlugins: values.essentialPlugins.split("\n").map((value) => value.trim()).filter(Boolean),
        formTestPolicy: { mode: "detect_only", allowedForms: [] },
        maxPages: values.maxPages,
        contentStalenessDays: values.contentStalenessDays,
        figmaComparisonEnabled: false,
      });
      notify.success("Website scan settings saved");
      state.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Scan settings could not be saved.";
      notify.error("Unable to save scan settings", { description: message });
    }
  });

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="lg">
          <ModalDialog>
            <form onSubmit={save}>
              <ModalHeader><ModalHeading>Website Scan Settings</ModalHeading></ModalHeader>
              <ModalBody className="space-y-4">
                <p className="text-sm text-slate-500">{website?.projectName} · {website?.name}</p>
                <Controller control={control} name="organizationName" render={({ field, fieldState }) => (
                  <TextField value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={!!fieldState.error}>
                    <Label>Approved organization name</Label><Input ref={field.ref} placeholder="Allied Health Media" />
                  </TextField>
                )} />
                <Controller control={control} name="approvedNames" render={({ field, fieldState }) => (
                  <TextField value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={!!fieldState.error}>
                    <Label>Approved people and practitioner names</Label><TextArea ref={field.ref} rows={4} className="w-full resize-y" placeholder="One approved name per line" />
                  </TextField>
                )} />
                <Controller control={control} name="essentialPlugins" render={({ field, fieldState }) => (
                  <TextField value={field.value} onChange={field.onChange} onBlur={field.onBlur} isInvalid={!!fieldState.error}>
                    <Label>Essential WordPress plugins</Label><TextArea ref={field.ref} rows={4} className="w-full resize-y" placeholder="One plugin name per line" />
                    <p className="mt-1 text-xs text-slate-500">One plugin name per line (matched case-insensitively). Pre-filled with the recommended baseline — edit to match this site&apos;s stack.</p>
                  </TextField>
                )} />
                <Controller control={control} name="contentStalenessDays" render={({ field, fieldState }) => (
                  <TextField value={String(field.value)} onChange={(value) => field.onChange(Number(value))} onBlur={field.onBlur} isInvalid={!!fieldState.error} type="number">
                    <Label>Content staleness threshold (days)</Label><Input ref={field.ref} min={1} max={3650} />
                    <p className="mt-1 text-xs text-slate-500">Warn when no blog post or content update has happened within this many days. Default 90.</p>
                    {fieldState.error && <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>}
                  </TextField>
                )} />
                <Controller control={control} name="maxPages" render={({ field, fieldState }) => (
                  <TextField value={String(field.value)} onChange={(value) => field.onChange(Number(value))} onBlur={field.onBlur} isInvalid={!!fieldState.error} type="number">
                    <Label>Maximum pages per scan</Label><Input ref={field.ref} min={1} max={100} />
                    {fieldState.error && <p className="mt-1 text-sm text-red-600">{fieldState.error.message}</p>}
                  </TextField>
                )} />
              </ModalBody>
              <ModalFooter className="flex justify-end gap-2">
                <Button type="button" variant="tertiary" onPress={state.close}>Cancel</Button>
                <Button type="submit" variant="primary" isDisabled={isSubmitting}>{isSubmitting ? "Saving..." : "Save Settings"}</Button>
              </ModalFooter>
            </form>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
