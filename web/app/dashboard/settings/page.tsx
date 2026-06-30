import { SettingsView } from "@/components/settings/settings-view";
import { RoleGuard } from "@/components/auth/role-guard";

const SettingsPage = () => {
  return <RoleGuard roles={["superadmin"]}><SettingsView /></RoleGuard>;
};

export default SettingsPage;
