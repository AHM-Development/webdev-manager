"use client";

import { Plug } from "lucide-react";

export function WebsiteChecklistTab() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-slate-200 px-6 py-14 text-center">
      <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-100 text-slate-400">
        <Plug className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-semibold text-slate-700">No WordPress health data yet</p>
        <p className="mt-1 max-w-sm text-sm text-slate-500">
          The site stats and health checks populate once the AHM Core plugin is
          connected to this website.
        </p>
      </div>
    </div>
  );
}
