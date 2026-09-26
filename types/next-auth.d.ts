import type { DefaultSession } from "next-auth";

type Role = "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPER_ADMIN";
type UserStatus = "ACTIVE" | "SUSPENDED";

declare module "next-auth" {
  interface User {
    role: Role;
    status: UserStatus;
    /** True when this sign-in passed two-factor (Phase 13). */
    mfa?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: Role;
      status: UserStatus;
      /** ms timestamp of login; compared with User.passwordChangedAt to expire old sessions. */
      authAt: number;
      mfa?: boolean;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    id: string;
    role: Role;
    status: UserStatus;
    authAt: number;
    mfa?: boolean;
  }
}
