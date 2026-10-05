import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { refreshBag } from './keys';

const RESUBSCRIBE_MS = 2000;

/**
 * Refetches the bag whenever it changes on any device (Realtime) and when the app returns to
 * the foreground (events missed while backgrounded). Events are signals only; the API is the
 * source of the bag, and refreshBag holds back while one of this device's changes is in flight.
 *
 * The channel is replaced on every return to the foreground (it may have closed while the app
 * was suspended or its token expired), and again shortly after it errors, times out or closes.
 */
export function useBagLive(userId: string | null) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!userId) return;
    let stopped = false;
    let channel: RealtimeChannel | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    const refetch = () => void refreshBag(queryClient, userId);

    const drop = () => {
      const old = channel;
      channel = null; // Before removing, so the old channel's CLOSED status is ignored.
      if (old) void supabase.removeChannel(old);
    };
    const later = () => {
      if (retry || stopped) return;
      retry = setTimeout(() => {
        retry = null;
        if (stopped) return;
        subscribe();
        refetch();
      }, RESUBSCRIBE_MS);
    };
    const subscribe = () => {
      drop();
      // A unique topic per subscription: realtime-js reuses channels by topic, so a fixed name
      // can hand a closing channel to the next subscriber.
      const next = supabase
        .channel(`shopping:${userId}:${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_state', filter: `user_id=eq.${userId}` }, refetch);
      channel = next;
      next.subscribe((status) => {
        if (stopped || channel !== next) return;
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') later();
      });
    };

    subscribe();
    const foreground = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (retry) clearTimeout(retry);
      retry = null;
      subscribe();
      refetch();
    });
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      foreground.remove();
      drop();
    };
  }, [userId, queryClient]);
}
