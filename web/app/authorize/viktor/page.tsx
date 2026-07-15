"use client";

import { Suspense } from "react";

import { AuthGuard } from "@/components/auth/auth-guard";
import { ViktorConsent } from "@/components/agent/viktor-consent";

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[#f7f8fa]">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-[#0b7de3]" />
    </div>
  );
}

export default function AuthorizeViktorPage() {
  return (
    <AuthGuard>
      <Suspense fallback={<Loading />}>
        <ViktorConsent />
      </Suspense>
    </AuthGuard>
  );
}
