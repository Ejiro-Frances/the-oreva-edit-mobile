import AsyncStorage from '@react-native-async-storage/async-storage';
import { cartSchema } from '@/lib/schemas';
import type { CartLine } from '@/lib/types';

const KEY = 'oreva-bag-v1';

/** A guest bag an older version kept on the phone; it is uploaded once, then removed. */
export async function loadLegacyBag(): Promise<CartLine[]> {
  try {
    return cartSchema.parse(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'));
  } catch {
    return [];
  }
}
export const clearLegacyBag = () => AsyncStorage.removeItem(KEY);
