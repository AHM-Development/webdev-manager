"use client";

import {
  Button,
  Drawer,
  DrawerBackdrop,
  DrawerBody,
  DrawerContent,
  DrawerDialog,
  DrawerHeader,
  DrawerHeading,
  type useOverlayState,
} from "@heroui/react";
import { ExternalLink } from "lucide-react";
import { useRouter } from "next/navigation";

import type { RealtimeNotification } from "@/hooks/use-notifications-socket";

function formatWhen(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function NotificationDetailDrawer({
  state,
  notification,
}: {
  state: ReturnType<typeof useOverlayState>;
  notification: RealtimeNotification | null;
}) {
  const router = useRouter();

  const openRelated = () => {
    if (!notification?.actionUrl) return;
    const url = notification.actionUrl;
    state.close();
    if (url.startsWith("/")) router.push(url);
    else window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <Drawer isOpen={state.isOpen} onOpenChange={state.setOpen}>
      <DrawerBackdrop variant="blur">
        <DrawerContent placement="right">
          <DrawerDialog className="w-full max-w-[440px]">
            <DrawerHeader>
              <DrawerHeading>Notification</DrawerHeading>
            </DrawerHeader>
            <DrawerBody className="flex min-h-0 flex-col bg-slate-50">
              {notification && (
                <>
                  <div className="flex-1 space-y-4 overflow-y-auto">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <h3 className="text-base font-semibold text-slate-950">{notification.title}</h3>
                      <p className="mt-1 text-xs text-slate-400">{formatWhen(notification.createdAt)}</p>
                      {notification.message && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                          {notification.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex gap-2 border-t border-slate-200 pt-4">
                    <Button variant="tertiary" className="flex-1" onPress={() => state.close()}>
                      Close
                    </Button>
                    {notification.actionUrl && (
                      <Button variant="primary" className="flex-1" onPress={openRelated}>
                        <ExternalLink className="mr-1.5 h-4 w-4" />
                        Open related
                      </Button>
                    )}
                  </div>
                </>
              )}
            </DrawerBody>
          </DrawerDialog>
        </DrawerContent>
      </DrawerBackdrop>
    </Drawer>
  );
}
