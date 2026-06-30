import { WebsiteUsersTable } from "@/components/website-users/website-users-table";
import { RoleGuard } from "@/components/auth/role-guard";

const WebsiteUsersPage = () => {
  return <RoleGuard roles={["superadmin", "developer"]}><WebsiteUsersTable /></RoleGuard>;
};

export default WebsiteUsersPage;
