import { ActivityLogsView } from "@/components/activity-logs/activity-logs-view";
import { RoleGuard } from "@/components/auth/role-guard";

const WebsiteLogsPage = () => {
  return <RoleGuard roles={["superadmin", "developer"]}><ActivityLogsView /></RoleGuard>;
};

export default WebsiteLogsPage;
