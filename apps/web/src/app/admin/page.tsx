import { RoleWorkspace } from "@/components/workspace/role-workspace";
import { requireAdminWithTwoFactor } from "@/lib/auth/guards";
export default async function AdminPage(){const session=await requireAdminWithTwoFactor();return <RoleWorkspace email={session.user.email} role="admin"/>}
