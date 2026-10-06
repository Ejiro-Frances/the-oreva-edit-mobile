import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadLegacyBag } from '@/features/bag/legacy';

const KEY = 'oreva-bag-v1';
const A = '00000000-0000-4000-8000-000000000001';

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('loadLegacyBag', () => {
  it('reads a bag an older version kept on the phone', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify([{ variantId: A, quantity: 2 }]));
    expect(await loadLegacyBag()).toEqual([{ variantId: A, quantity: 2 }]);
  });

  it('is empty when the phone holds no old bag', async () => {
    expect(await loadLegacyBag()).toEqual([]);
  });

  it.each([
    ['is not JSON', '{oops'],
    ['is not a bag', JSON.stringify({ variantId: 'x' })],
  ])('removes a stored value that %s and returns an empty bag', async (_label, value) => {
    await AsyncStorage.setItem(KEY, value);
    expect(await loadLegacyBag()).toEqual([]);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });
});
