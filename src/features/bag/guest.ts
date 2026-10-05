import AsyncStorage from '@react-native-async-storage/async-storage';
import { cartSchema } from '@/lib/schemas';
import type { CartLine } from '@/lib/types';

const KEY = 'oreva-bag-v1';

export async function loadGuestBag(): Promise<CartLine[]> {
  try {
    return cartSchema.parse(JSON.parse((await AsyncStorage.getItem(KEY)) ?? '[]'));
  } catch {
    return []; // Corrupt storage starts empty.
  }
}
export const saveGuestBag = (lines: CartLine[]) => AsyncStorage.setItem(KEY, JSON.stringify(lines));
export const clearGuestBag = () => AsyncStorage.removeItem(KEY);
