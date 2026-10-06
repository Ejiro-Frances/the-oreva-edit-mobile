describe('assetUrl', () => {
  const load = () => {
    jest.resetModules();
    process.env.EXPO_PUBLIC_API_URL = 'https://the-oreva-edit.vercel.app';
    return require('@/lib/config') as typeof import('@/lib/config');
  };
  it('prefixes site-relative paths with the API origin', () => {
    expect(load().assetUrl('/images/shirt.jpg')).toBe(
      'https://the-oreva-edit.vercel.app/images/shirt.jpg',
    );
  });
  it('keeps absolute URLs and handles missing paths', () => {
    const { assetUrl } = load();
    expect(assetUrl('https://cdn.example.com/a.jpg')).toBe('https://cdn.example.com/a.jpg');
    expect(assetUrl(null)).toBeNull();
    expect(assetUrl('')).toBeNull();
  });
});
