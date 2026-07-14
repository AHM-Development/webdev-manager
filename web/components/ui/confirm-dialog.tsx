"use client";

import {
  Button,
  Modal,
  ModalBackdrop,
  ModalBody,
  ModalContainer,
  ModalDialog,
  ModalFooter,
  ModalHeader,
  ModalHeading,
  type useOverlayState,
} from "@heroui/react";
import { AlertTriangle } from "lucide-react";
import { useState, type ReactNode } from "react";

/**
 * Reusable confirmation dialog for destructive or irreversible actions.
 * Runs `onConfirm`, keeps the buttons disabled while it resolves, and closes
 * on success. Any error thrown by `onConfirm` is left to the caller's
 * notifier (the dialog just re-enables so the user can retry or cancel).
 */
export function ConfirmDialog({
  state,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: {
  state: ReturnType<typeof useOverlayState>;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      state.close();
    } catch {
      // Caller surfaces the error via notify; keep the dialog open for retry.
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={state.isOpen}
      onOpenChange={(open) => {
        if (!busy) state.setOpen(open);
      }}
    >
      <ModalBackdrop>
        <ModalContainer placement="center" size="sm">
          <ModalDialog>
            <ModalHeader>
              <div className="flex items-center gap-3">
                {destructive && (
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                    <AlertTriangle className="h-5 w-5" />
                  </span>
                )}
                <ModalHeading className="text-base font-semibold text-slate-900">
                  {title}
                </ModalHeading>
              </div>
            </ModalHeader>

            <ModalBody>
              <div className="text-sm leading-relaxed text-slate-600">{description}</div>
            </ModalBody>

            <ModalFooter className="flex justify-end gap-2">
              <Button type="button" variant="tertiary" isDisabled={busy} onPress={state.close}>
                {cancelLabel}
              </Button>
              <Button
                type="button"
                variant="primary"
                isDisabled={busy}
                onPress={run}
                className={destructive ? "bg-red-600 text-white hover:bg-red-700" : undefined}
              >
                {busy ? "Working…" : confirmLabel}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
