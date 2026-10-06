import { signInSchema, signUpSchema } from '@/lib/schemas';

const valid = { firstName: 'Mary Jane', lastName: 'Bello', email: 'Tolu@Example.com ', password: 'correct horse', phone: '' };

describe('account schemas', () => {
  it('normalises email and phone like the website', () => {
    const parsed = signUpSchema.parse({ ...valid, phone: '+2348012345678' });
    expect(parsed).toMatchObject({ email: 'tolu@example.com', phone: '08012345678' });
  });
  it.each([
    [{ password: 'short' }, 'Use at least 8 characters'],
    [{ phone: '12345' }, 'Enter a Nigerian mobile number, e.g. 08012345678'],
    [{ email: 'nope' }, 'Enter a valid email address'],
  ])('rejects %o', (change, message) => {
    const result = signUpSchema.safeParse({ ...valid, ...change });
    expect(result.error?.issues[0].message).toBe(message);
  });
  it('only needs a non-empty password to sign in', () => {
    expect(signInSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
