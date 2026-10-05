import { AppText } from './AppText';
import { colors } from './theme';
import { money } from '@/lib/money';

export function Price({ amount, compareAt, from }: { amount: number; compareAt?: number | null; from?: boolean }) {
  return (
    <AppText variant="body">
      {from ? 'From ' : ''}
      {money(amount)}
      {compareAt && compareAt > amount ? (
        <AppText style={{ color: colors.muted, textDecorationLine: 'line-through' }}> {money(compareAt)}</AppText>
      ) : null}
    </AppText>
  );
}
