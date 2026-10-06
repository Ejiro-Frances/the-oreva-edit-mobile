import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { colors } from './theme';

type Toast = { message: string; action?: { label: string; onPress: () => void } };
type ToastContext = { show: (toast: Toast) => void };

const Context = createContext<ToastContext | null>(null);
const VISIBLE_MS = 4000;
/** Clears the tab bar on tab screens; on pushed screens it simply sits a little higher. */
const ABOVE_TABS = 64;

/** Short confirmations (e.g. "Added to your bag") shown above every screen, then dismissed. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);
  const show = useCallback(
    (next: Toast) => {
      if (timer.current) clearTimeout(timer.current);
      setToast(next);
      AccessibilityInfo.announceForAccessibility(next.message);
      timer.current = setTimeout(hide, VISIBLE_MS);
    },
    [hide],
  );
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <Context.Provider value={{ show }}>
      {children}
      {toast ? (
        <View pointerEvents="box-none" style={[styles.layer, { bottom: insets.bottom + ABOVE_TABS }]}>
          <View style={styles.toast} accessibilityLiveRegion="polite">
            <AppText style={styles.message}>{toast.message}</AppText>
            {toast.action ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={toast.action.label}
                onPress={() => {
                  hide();
                  toast.action!.onPress();
                }}
                style={styles.action}
              >
                <AppText style={[styles.message, styles.actionLabel]}>{toast.action.label}</AppText>
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}
    </Context.Provider>
  );
}

export function useToast() {
  const context = useContext(Context);
  if (!context) throw new Error('ToastProvider is required');
  return context;
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 16, right: 16 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingLeft: 16,
    backgroundColor: colors.foreground,
  },
  message: { flex: 1, color: colors.elevated },
  action: { minHeight: 48, paddingHorizontal: 16, justifyContent: 'center' },
  actionLabel: { flex: 0, textDecorationLine: 'underline' },
});
