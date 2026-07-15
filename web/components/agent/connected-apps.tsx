"use client";

import { Button } from "@heroui/react";
import { Bot } from "lucide-react";
import { useEffect, useState } from "react";

import { listAgentGrants, revokeAgentGrant, type AgentGrant } from "@/libs/api/agent";
import { notify } from "@/libs/notify";

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

export function ConnectedApps() {
  const [grants, setGrants] = useState<AgentGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listAgentGrants()
      .then(setGrants)
      .catch(() => setGrants([]))
      .finally(() => setLoading(false));
  }, []);

  const revoke = async (id: string) => {
    setBusyId(id);
    try {
      await revokeAgentGrant(id);
      setGrants((current) =>
        current.map((grant) => (grant.id === id ? { ...grant, revokedAt: new Date().toISOString() } : grant))
      );
      notify.success("Access revoked");
    } catch (error) {
      notify.error("Could not revoke access", {
        description: error instanceof Error ? error.message : "Please try again.",
      });
    } finally {
      setBusyId(null);
    }
  };

  const active = grants.filter((grant) => !grant.revokedAt);

  return (
    <section className="app-panel p-5">
      <div className="flex items-center gap-2">
        <Bot className="h-4 w-4 text-[#0b7de3]" />
        <h2 className="text-base font-semibold text-slate-950">Connected apps</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        AI assistants you&apos;ve allowed to act on your behalf. They can only do what your role permits, always ask
        before making a change, and can never delete anything. Revoking cuts access immediately.
      </p>

      <div className="mt-4 divide-y divide-slate-100">
        {loading ? (
          <p className="py-4 text-sm text-slate-500">Loading…</p>
        ) : active.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">No connected apps.</p>
        ) : (
          active.map((grant) => (
            <div key={grant.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className="text-sm font-medium capitalize text-slate-900">{grant.agent}</p>
                <p className="text-xs text-slate-500">
                  Connected {formatDate(grant.createdAt)}
                  {grant.lastUsedAt ? ` · last used ${formatDate(grant.lastUsedAt)}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="tertiary"
                className="text-rose-600"
                isDisabled={busyId === grant.id}
                onPress={() => void revoke(grant.id)}
              >
                {busyId === grant.id ? "Revoking…" : "Revoke"}
              </Button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
