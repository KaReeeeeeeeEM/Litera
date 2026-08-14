import { RoleWorkspace } from "@/components/workspace/role-workspace";
import { requireRole } from "@/lib/auth/guards";
export default async function StakeholderPage(){const session=await requireRole(["stakeholder","admin"]);return <RoleWorkspace email={session.user.email} role="stakeholder"/>}
