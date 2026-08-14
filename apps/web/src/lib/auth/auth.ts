import "server-only";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { nextCookies } from "better-auth/next-js";
import { admin } from "better-auth/plugins/admin";
import { twoFactor } from "better-auth/plugins/two-factor";
import { passkey } from "@better-auth/passkey";

import { db } from "@/lib/db";
import { sendAuthEmail } from "@/lib/auth/email";
import { accessControl, authRoles } from "@/lib/auth/permissions";

const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";

export const auth = betterAuth({
  appName: "Litera",
  baseURL: baseUrl,
  database: drizzleAdapter(db, { provider: "pg" }),
  trustedOrigins: [baseUrl],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 30,
    sendResetPassword: async ({ user, url }) => {
      void sendAuthEmail({ kind: "password-reset", recipient: user.email, url });
    },
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      ...coreFields,
      role: "member",
      banned: false,
      banReason: null,
      banExpires: null,
      twoFactorEnabled: false,
      ...additionalFields,
      id,
    }),
  },
  emailVerification: {
    sendOnSignUp: true,
    sendOnSignIn: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      void sendAuthEmail({ kind: "verification", recipient: user.email, url });
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  rateLimit: { enabled: true, window: 60, max: 100, storage: "database" },
  advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
  plugins: [
    admin({
      ac: accessControl,
      roles: authRoles,
      defaultRole: "member",
      adminRoles: ["admin"],
      impersonationSessionDuration: 60 * 30,
    }),
    twoFactor({ issuer: "Litera" }),
    passkey({ rpName: "Litera" }),
    nextCookies(),
  ],
});

export type AuthSession = typeof auth.$Infer.Session;
