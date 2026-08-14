import { redirect } from "next/navigation";
import { RoleWorkspace } from "@/components/workspace/role-workspace";
import { requireSession } from "@/lib/auth/guards";
import type { AppRole } from "@/lib/auth/permissions";

export default async function WorkspacePage(){const session=await requireSession();const role=String(session.user.role??"member").split(",")[0] as AppRole;if(role==="admin")redirect("/admin");if(role==="stakeholder")redirect("/stakeholder");return <RoleWorkspace email={session.user.email} role="member"/>}
