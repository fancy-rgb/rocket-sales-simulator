// 시뮬레이터 피드백 → Slack 중계.
// webhook URL을 클라이언트에 노출하지 않으려고 둔 함수 (이 레포는 PUBLIC).
// verify_jwt 기본값(true) 유지 → 로그인한 사용자만 호출 가능.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CATEGORIES = ['버그/오류', '불편사항', '개선 제안', '기타'];

// GitHub Pages(다른 오리진)에서 호출하므로 preflight 응답이 필요하다.
const CORS = {
  'Access-Control-Allow-Origin': 'https://fancy-rgb.github.io',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  const webhook = Deno.env.get('SLACK_FEEDBACK_WEBHOOK');
  if (!webhook) {
    console.error('SLACK_FEEDBACK_WEBHOOK 미설정');
    return json({ error: 'not_configured' }, 500);
  }

  let body: { category?: string; content?: string; version?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const content = (body.content ?? '').trim();
  if (!content) return json({ error: 'empty_content' }, 400);

  const category = CATEGORIES.includes(body.category ?? '') ? body.category : '기타';
  const version = (body.version ?? '').slice(0, 40);

  // 제출자는 JWT에서 읽는다 — 클라이언트가 보낸 값을 믿지 않는다.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  const email = user?.email ?? '알 수 없음';
  const name =
    (user?.user_metadata?.full_name as string | undefined) ||
    (user?.user_metadata?.name as string | undefined) ||
    email;

  const text = [
    '*📝 시뮬레이터 피드백 접수*',
    `> *카테고리*: ${category}`,
    '> *내용*:',
    ...content.slice(0, 3000).split('\n').map((l) => `> ${l}`),
    `> *제출자*: ${name} (${email})`,
    `> *버전*: ${version || '미상'}`,
  ].join('\n');

  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    console.error('Slack 전송 실패', res.status, await res.text());
    return json({ error: 'slack_failed' }, 502);
  }

  return json({ ok: true });
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
