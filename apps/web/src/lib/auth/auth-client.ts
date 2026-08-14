"use client";

import { createAuthClient } from "better-auth/react";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

import { accessControl, authRoles } from "@/lib/auth/permissions";

export const authClient = createAuthClient({
  plugins: [adminClient({ ac: accessControl, roles: authRoles }), twoFactorClient(), passkeyClient()],
});
