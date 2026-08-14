import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth/auth";
import type { AppRole } from "@/lib/auth/permissions";

export async function requireSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return session;
}

export async function requireRole(allowedRoles: AppRole[]) {
  const session = await requireSession();
  const roles = String(session.user.role ?? "member").split(",");
  if (!allowedRoles.some((role) => roles.includes(role))) redirect("/forbidden");
  return session;
}

export async function requireAdminWithTwoFactor() {
  const session = await requireRole(["admin"]);
  if (!session.user.twoFactorEnabled) redirect("/account/security?required=admin");
  return session;
}
