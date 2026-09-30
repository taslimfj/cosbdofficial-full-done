import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export function useCachedQuery<T>(
  queryKey: (string | number | boolean | null | undefined)[],
  queryFn: () => Promise<T>,
  tablesToSubscribe: string[] = []
) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey,
    queryFn,
    staleTime: 1000 * 60 * 60, // 1 hour stale time (will serve instantly from cache)
    gcTime: 1000 * 60 * 60 * 24, // Keep in cache for 24 hours
  });

  useEffect(() => {
    if (!tablesToSubscribe.length) return;

    const channel = supabase.channel(`realtime-cache-${queryKey.join('-')}`);

    tablesToSubscribe.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          // Instantly invalidate and refetch in background when Supabase broadcasts changes
          queryClient.invalidateQueries({ queryKey });
        }
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryKey.join('-'), tablesToSubscribe.join('-'), queryClient]);

  return query;
}
