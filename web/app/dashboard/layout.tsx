import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
    <div className="flex h-dvh overflow-hidden bg-[#e8e8eb]">
      <div className="flex min-h-0 flex-1 overflow-hidden bg-[#f7f8fa] shadow-[0_28px_90px_rgba(15,23,42,0.13)] ring-1 ring-white/80">
        <Sidebar />

        <div className="relative flex flex-1 flex-col overflow-hidden">
          <Header />
          <main className="premium-scrollbar flex-1 overflow-y-auto px-4 py-4 sm:px-5 lg:px-6">
            <div className="mx-auto w-full max-w-[1700px]">{children}</div>
          </main>
        </div>
      </div>
    </div>
    </AuthGuard>
  );
}
