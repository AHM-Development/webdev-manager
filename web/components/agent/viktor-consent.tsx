"use client";

import { Button } from "@heroui/react";
import { Bot, Check, ShieldCheck, X } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";

import { authorizeAgent } from "@/libs/api/agent";
import { useAuth } from "@/libs/hooks/useAuth";
import { notify } from "@/libs/notify";

export function ViktorConsent() {
  const params = useSearchParams();
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const state = params.get("state");
  const scope = params.get("scope") ?? "agent:read agent:write";
  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");

  const invalid = !clientId || !redirectUri;

  const finish = (target: string) => {
    window.location.href = target;
  };

  const allow = async () => {
    setBusy(true);
    try {
      const { code, redirectUri: uri, state: returned } = await authorizeAgent({
        clientId,
        redirectUri,
        scope,
        state,
        codeChallenge,
        codeChallengeMethod,
      });
      const url = new URL(uri);
      url.searchParams.set("code", code);
      if (returned) url.searchParams.set("state", returned);
      finish(url.toString());
    } catch (error) {
      notify.error("Could not authorize Viktor", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
      setBusy(false);
    }
  };

  const deny = () => {
    if (!redirectUri) return;
    try {
      const url = new URL(redirectUri);
      url.searchParams.set("error", "access_denied");
      if (state) url.searchParams.set("state", state);
      finish(url.toString());
    } catch {
      /* malformed redirect — nothing to send them back to */
    }
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-[#f7f8fa] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-[#24c7d5] to-[#0b7de3] text-white">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-950">Authorize Viktor</h1>
            <p className="text-sm text-slate-500">AI assistant · AHM Web Manager</p>
          </div>
        </div>

        {invalid ? (
          <p className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            This authorization link is missing required details. Ask Viktor to send the connect link again.
          </p>
        ) : (
          <>
            <p className="mt-5 text-sm text-slate-600">
              Viktor is asking to act on your behalf as{" "}
              <strong className="text-slate-900">{user?.name ?? "you"}</strong>. It will be able to:
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Read your projects, tasks, client logs, issues, website health, and your own notes.
              </li>
              <li className="flex items-start gap-2">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                Propose changes that you approve before they happen.
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0b7de3]" />
                Only within your own permissions — it can never delete anything.
              </li>
            </ul>
            <p className="mt-3 text-xs text-slate-400">
              You can revoke this anytime from your profile. Connecting to{" "}
              <span className="font-mono">{safeHost(redirectUri)}</span>.
            </p>

            <div className="mt-6 flex gap-2">
              <Button variant="tertiary" className="flex-1" isDisabled={busy} onPress={deny}>
                <X className="mr-1 h-4 w-4" />
                Deny
              </Button>
              <Button variant="primary" className="flex-1" isDisabled={busy} onPress={() => void allow()}>
                {busy ? "Authorizing…" : "Allow Viktor"}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function safeHost(uri: string) {
  try {
    return new URL(uri).host;
  } catch {
    return uri;
  }
}
