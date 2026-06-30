import { UsersTable } from "@/components/users/users-table";
import { RoleGuard } from "@/components/auth/role-guard";

const UsersPage = () => {
  return <RoleGuard roles={["superadmin"]}><UsersTable /></RoleGuard>;
};

export default UsersPage;
