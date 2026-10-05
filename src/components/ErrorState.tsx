import { View } from 'react-native';
import { AppText } from './AppText';
import { Button } from './Button';

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ padding: 24, gap: 16, alignItems: 'flex-start' }}>
      <AppText>{message}</AppText>
      <Button title="Try again" variant="secondary" onPress={onRetry} />
    </View>
  );
}
