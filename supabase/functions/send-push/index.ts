import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Require internal shared secret (set by DB trigger's http_post header)
    const { data: expected } = await supabase.rpc('get_internal_secret', { _name: 'send_push_secret' });
    const provided = req.headers.get('x-internal-secret') || '';
    if (!expected || provided !== expected) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Prefer function secrets; fall back to private.internal_secrets for self-hosted migrations
    let vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY') || '';
    let vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY') || '';
    if (!vapidPublic || !vapidPrivate) {
      const { data: pub } = await supabase.rpc('get_internal_secret', { _name: 'vapid_public_key' });
      const { data: priv } = await supabase.rpc('get_internal_secret', { _name: 'vapid_private_key' });
      vapidPublic = vapidPublic || pub || '';
      vapidPrivate = vapidPrivate || priv || '';
    }
    if (!vapidPublic || !vapidPrivate) {
      return new Response(JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    webpush.setVapidDetails(VAPID_SUBJECT, vapidPublic, vapidPrivate);

    const { user_ids, title, body, url, tag, image } = await req.json();
    if (!Array.isArray(user_ids) || user_ids.length === 0 || !title) {
      return new Response(JSON.stringify({ error: 'user_ids[] and title required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { data: subs, error } = await supabase
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth')
      .in('user_id', user_ids);
    if (error) throw error;

    const payload = JSON.stringify({ title, body: body || '', url: url || '/', tag: tag || undefined, image });
    const results = await Promise.allSettled((subs || []).map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (e: any) {
        // Drop invalid/expired subscriptions
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('id', s.id);
        } else {
          console.error('push failed', s.endpoint, e?.statusCode, e?.body);
        }
      }
    }));

    return new Response(JSON.stringify({ sent: results.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    console.error('send-push error', e);
    return new Response(JSON.stringify({ error: e?.message || 'unknown' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
