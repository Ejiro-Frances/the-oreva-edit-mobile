export const colors = {
  background: '#faf8f3',
  surface: '#f0ece4',
  elevated: '#fffdf8',
  foreground: '#292721',
  muted: '#6b655e',
  primary: '#62283a',
  primaryPressed: '#491b2b',
  border: '#dcd7ce',
  destructive: '#a12d2d',
  success: '#2f6249',
} as const;

export const fonts = {
  display: 'CormorantGaramond_500Medium',
  displayBold: 'CormorantGaramond_600SemiBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodyBold: 'Manrope_700Bold',
} as const;

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
