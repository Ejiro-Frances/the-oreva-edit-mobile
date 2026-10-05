// Same rules and messages as the web store's lib/validation.ts
import { z } from 'zod';

const nigerianMobile = /^(?:\+234|234|0)[789][01]\d{8}$/;
export const localPhone = (phone: string) =>
  phone.trim().replace(/^\+?234(?=[789][01]\d{8}$)/, '0');

// 72 bytes is the bcrypt limit Supabase Auth applies.
const password = z.string().min(8, 'Use at least 8 characters').max(72, 'Use 72 characters or fewer');
const accountEmail = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Enter a valid email address').max(254));

export const signUpSchema = z.object({
  firstName: z.string().trim().min(1, 'Enter your first name').max(60),
  lastName: z.string().trim().min(1, 'Enter your last name').max(60),
  email: accountEmail,
  password,
  phone: z
    .string()
    .trim()
    .refine((v) => v === '' || nigerianMobile.test(v), 'Enter a Nigerian mobile number, e.g. 08012345678')
    .transform(localPhone),
});
export type SignUpInput = z.input<typeof signUpSchema>;
export const signInSchema = z.object({
  email: accountEmail,
  password: z.string().min(1, 'Enter your password').max(1024),
});
export type SignInInput = z.input<typeof signInSchema>;
export const emailOnlySchema = z.object({ email: accountEmail });
export const cartSchema = z
  .array(z.object({ variantId: z.uuid(), quantity: z.number().int().min(1).max(20) }))
  .max(50);
