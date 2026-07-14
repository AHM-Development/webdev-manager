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
import { Check, Copy, Download, Plug } from "lucide-react";
import { useEffect, useState } from "react";

import {
  createWordPressPairingCode,
  type HealthWebsiteRow,
} from "@/libs/api/website-health";
import { notify } from "@/libs/notify";

type Pairing = Awaited<ReturnType<typeof createWordPressPairingCode>>;

export function AhmCorePairingModal({
  state,
  website,
}: {
  state: ReturnType<typeof useOverlayState>;
  website: HealthWebsiteRow | null;
}) {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<"code" | "url" | null>(null);

  useEffect(() => {
    if (!state.isOpen) {
      setPairing(null);
      setCopied(null);
    }
  }, [state.isOpen]);

  const generate = async () => {
    if (!website) return;
    setLoading(true);
    try {
      setPairing(await createWordPressPairingCode(website.id));
    } catch (error) {
      const message = error instanceof Error ? error.message : "A pairing code could not be created.";
      notify.error("Unable to create pairing code", { description: message });
    } finally {
      setLoading(false);
    }
  };

  const copy = async (which: "code" | "url", value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <Modal isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <ModalBackdrop>
        <ModalContainer placement="center" size="md">
          <ModalDialog>
            <ModalHeader><ModalHeading>Connect AHM Core</ModalHeading></ModalHeader>
            <ModalBody className="space-y-4">
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                <p className="font-medium text-slate-950">{website?.projectName}</p>
                <p className="mt-1 text-sm text-slate-500">{website?.name} · {website?.url}</p>
              </div>
              <ol className="space-y-2 text-sm text-slate-600">
                <li>1. Download and install AHM Core on this WordPress website.</li>
                <li>2. Open Settings → AHM Core in WordPress.</li>
                <li>3. Paste the API URL and pairing code below, then click Connect to AHM.</li>
              </ol>
              {pairing ? (
                <div className="space-y-3">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-slate-500">Manager API URL</p>
                    <button
                      type="button"
                      onClick={() => void copy("url", pairing.apiUrl)}
                      className="mt-1 flex w-full items-center justify-between gap-2 text-sm font-medium break-all text-slate-900"
                    >
                      <span>{pairing.apiUrl}</span>
                      {copied === "url" ? <Check className="h-4 w-4 shrink-0" /> : <Copy className="h-4 w-4 shrink-0 text-slate-400" />}
                    </button>
                  </div>
                  <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-center">
                    <p className="text-xs font-medium uppercase tracking-[0.12em] text-blue-700">Pairing code</p>
                    <button type="button" onClick={() => void copy("code", pairing.code)} className="mt-2 inline-flex items-center gap-2 text-3xl font-semibold tracking-[0.2em] text-blue-950">
                      {pairing.code}
                      {copied === "code" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </button>
                    <p className="mt-2 text-xs text-blue-700">Expires {new Date(pairing.expiresAt).toLocaleTimeString()}</p>
                  </div>
                </div>
              ) : (
                <Button variant="secondary" onPress={() => void generate()} isDisabled={loading}>
                  <Plug className="h-4 w-4" />{loading ? "Generating..." : "Generate pairing code"}
                </Button>
              )}
            </ModalBody>
            <ModalFooter className="flex justify-between gap-2">
              <a
                href="/downloads/ahm-core.zip"
                download="ahm-core.zip"
                className="inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Download className="h-4 w-4" />Download Plugin
              </a>
              <Button variant="primary" onPress={state.close}>Done</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </Modal>
  );
}
