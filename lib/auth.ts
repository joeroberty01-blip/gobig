import NextAuth, { CredentialsSignin } from "next-auth";
import { clientIpFrom } from "@/lib/clientIp";
import Credentials from "next-auth/providers/credentials";
import { loginSchema } from "@/lib/validators/auth";
import { verifyCredentials } from "@/lib/services/auth";
import { hit, LIMITS, reset } from "@/lib/services/rateLimit";
import { hasTwoFactor, verifySecondFactor } from "@/lib/services/twoFactor";

class InvalidCredentialsError extends CredentialsSignin {
  code = "invalidCredentials";
}

class SuspendedError extends CredentialsSignin {
  code = "suspended";
}

class RateLimitedError extends CredentialsSignin {
  code = "rateLimited";
}

// Phase 13: accounts with two-factor need a code after the password.
class OtpRequiredError extends CredentialsSignin {
  code = "otpRequired";
}

class OtpInvalidError extends CredentialsSignin {
  code = "otpInvalid";
}

// One login for every role (email or phone + password). Role decides where the user lands,
// not which form they use.
export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      id: "credentials",
      name: "Go Big",
      credentials: {
        identifier: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" },
        otp: { label: "Authentication code", type: "text" },
      },
      async authorize(raw, request) {
        const parsed = loginSchema.safeParse(raw);
        if (!parsed.success) throw new InvalidCredentialsError();

        // SEC-010: slow down credential stuffing — per account and per address, checked before
        // the password so a locked-out attacker learns nothing more.
        const ip = request?.headers ? clientIpFrom(request.headers) : "unknown";
        const identifier = parsed.data.identifier.trim().toLowerCase();
        const [byId, byIp] = await Promise.all([hit(LIMITS.loginPerIdentifier, identifier), hit(LIMITS.loginPerIp, ip)]);
        if (!byId.ok || !byIp.ok) throw new RateLimitedError();

        const result = await verifyCredentials(parsed.data.identifier, parsed.data.password);
        if (!result.ok) throw result.error === "suspended" ? new SuspendedError() : new InvalidCredentialsError();

        // Two-factor (Phase 13). Attempts count against the same per-account limit as passwords.
        let mfa = false;
        if (await hasTwoFactor(result.user.id)) {
          const otp = typeof (raw as { otp?: unknown })?.otp === "string" ? ((raw as { otp: string }).otp).trim() : "";
          if (!otp) throw new OtpRequiredError();
          if (otp.length > 20 || !(await verifySecondFactor(result.user.id, otp)).ok) throw new OtpInvalidError();
          mfa = true;
        }
        await reset(LIMITS.loginPerIdentifier, identifier);
        return { ...result.user, mfa };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.role = user.role;
        token.status = user.status;
        token.authAt = Date.now();
        token.mfa = user.mfa === true;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.id;
      session.user.role = token.role;
      session.user.status = token.status;
      session.user.authAt = token.authAt;
      session.user.mfa = token.mfa === true;
      return session;
    },
  },
});
