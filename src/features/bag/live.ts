import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { refreshBag } from './keys';

/**
 * Refetches the bag whenever it changes on any device (Realtime) and when the app returns to
 * the foreground (events missed while backgrounded). Events are signals only; the API is the
 * source of the bag, and refreshBag holds back while one of this device's changes is in flight.
 */
export function useBagLive(userId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    const refetch = () => void refreshBag(queryClient, userId);
    // A unique topic per subscription: realtime-js reuses channels by topic, so a fixed name
    // can hand a closing channel to the next subscriber.
    const channel = supabase
      .channel(`shopping:${userId}:${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_state', filter: `user_id=eq.${userId}` }, refetch)
      .subscribe();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state === 'active') refetch();
    });
    return () => {
      foreground.remove();
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);
}
