import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

const statement = {
  ...defaultStatements,
  project: ["create", "read", "update", "delete", "publish"],
  review: ["read", "comment", "approve"],
  analytics: ["read"],
  platform: ["manage"],
} as const;

export const accessControl = createAccessControl(statement);

export const memberRole = accessControl.newRole({
  project: ["create", "read", "update", "delete", "publish"],
  review: ["read"],
});

export const stakeholderRole = accessControl.newRole({
  project: ["read"],
  review: ["read", "comment", "approve"],
  analytics: ["read"],
});

export const adminRole = accessControl.newRole({
  ...adminAc.statements,
  project: ["create", "read", "update", "delete", "publish"],
  review: ["read", "comment", "approve"],
  analytics: ["read"],
  platform: ["manage"],
});

export const authRoles = {
  member: memberRole,
  stakeholder: stakeholderRole,
  admin: adminRole,
};

export type AppRole = keyof typeof authRoles;
