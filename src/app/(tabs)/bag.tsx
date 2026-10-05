import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';

export default function BagScreen() {
  return (
    <SafeAreaView style={{ flex: 1, padding: 16 }}>
      <AppText variant="display">Bag</AppText>
    </SafeAreaView>
  );
}
