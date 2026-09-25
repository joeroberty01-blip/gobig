import { z } from "zod";
import { normalizePhone } from "@/lib/phone";
import { parseIdentifier } from "@/lib/identifier";
import { SELF_SERVICE_ROLES } from "@/lib/roles";

// Error strings are keys into dictionary.errors, so the form shows them in the user's language.
export type ErrorKey =
  | "nameRequired"
  | "emailInvalid"
  | "phoneInvalid"
  | "contactRequired"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordsDontMatch"
  | "identifierInvalid"
  | "passwordRequired"
  | "roleRequired"
  | "tokenInvalid";

const e = (key: ErrorKey) => ({ error: key });

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? undefined : v))
  .optional();

export const passwordSchema = z
  .string()
  .min(8, e("passwordTooShort"))
  .max(128, e("passwordTooLong"));

export const signupSchema = z
  .object({
    role: z.enum(SELF_SERVICE_ROLES, e("roleRequired")),
    name: z.string().trim().min(2, e("nameRequired")).max(80, e("nameRequired")),
    email: optionalText.pipe(z.email(e("emailInvalid")).max(254).optional()),
    phone: optionalText.refine((v) => v === undefined || normalizePhone(v) !== null, e("phoneInvalid")),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.email || d.phone, { ...e("contactRequired"), path: ["phone"] })
  .refine((d) => d.password === d.confirmPassword, {
    ...e("passwordsDontMatch"),
    path: ["confirmPassword"],
  })
  .transform((d) => ({
    role: d.role,
    name: d.name,
    email: d.email?.toLowerCase(),
    phone: d.phone ? (normalizePhone(d.phone) ?? undefined) : undefined,
    password: d.password,
  }));

export type SignupFormInput = z.input<typeof signupSchema>;
export type SignupData = z.output<typeof signupSchema>;

export const loginSchema = z.object({
  identifier: z.string().trim().refine((v) => parseIdentifier(v) !== null, e("identifierInvalid")),
  password: z.string().min(1, e("passwordRequired")).max(128, e("passwordTooLong")),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  identifier: z.string().trim().refine((v) => parseIdentifier(v) !== null, e("identifierInvalid")),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20, e("tokenInvalid")).max(200, e("tokenInvalid")),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    ...e("passwordsDontMatch"),
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const createAdminSchema = z
  .object({
    name: z.string().trim().min(2, e("nameRequired")).max(80, e("nameRequired")),
    email: z.string().trim().toLowerCase().pipe(z.email(e("emailInvalid")).max(254)),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    ...e("passwordsDontMatch"),
    path: ["confirmPassword"],
  });
export type CreateAdminInput = z.input<typeof createAdminSchema>;
