/**
 * Wedding RSVP Worker
 *  POST  /            … フォーム送信を D1 に保存
 *  GET   /admin?token=… … 集計ダッシュボード（HTML）
 *  GET   /export.csv?token=… … CSV ダウンロード
 *  GET   /health      … 疎通確認用（DB件数を返す）
 */

function allowOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim());
  return allowed.includes(origin) ? origin : allowed[0] || '*';
}

function corsHeaders(request, env) {
  return {
    'Access-Control-Allow-Origin':  allowOrigin(request, env),
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Vary': 'Origin',
  };
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function csvCell(s) {
  const v = String(s ?? '');
  return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    // ---- 疎通確認 ----
    if (path === '/health' && request.method === 'GET') {
      let count = null, ok = true, err = null;
      try {
        const r = await env.DB.prepare('SELECT COUNT(*) AS c FROM rsvp').first();
        count = r?.c ?? 0;
      } catch (e) { ok = false; err = e.message; }
      return json({ ok, count, error: err }, 200, corsHeaders(request, env));
    }

    // ---- フォーム送信の保存 ----
    if (path === '/' && request.method === 'POST') {
      let data = {};
      try {
        const ct = request.headers.get('Content-Type') || '';
        if (ct.includes('application/json')) {
          data = await request.json();
        } else {
          const fd = await request.formData();
          for (const [k, v] of fd.entries()) data[k] = v;
        }
      } catch (e) {
        return json({ ok: false, error: 'invalid body' }, 400, corsHeaders(request, env));
      }

      const y = data.birthday_year, m = data.birthday_month, d = data.birthday_day;
      const birthday = (y || m || d) ? `${y || ''}年${m || ''}月${d || ''}日` : '';

      try {
        await env.DB.prepare(
          `INSERT INTO rsvp (created_at, name, furigana, attendance, birthday, email, allergy, message)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(
          new Date().toISOString(),
          data['name'] || '',
          data['furigana'] || '',
          data['attendance'] || '',
          birthday,
          data['メールアドレス'] || data['email'] || '',
          data['allergy'] || '',
          data['message'] || ''
        ).run();
      } catch (e) {
        return json({ ok: false, error: e.message }, 500, corsHeaders(request, env));
      }
      return json({ ok: true, next: '/thanks' }, 200, corsHeaders(request, env));
    }

    // ---- 管理ページ / CSV（token 必須）----
    if (path === '/admin' || path === '/export.csv') {
      const token = url.searchParams.get('token') || '';
      if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
        return new Response('Unauthorized', { status: 401 });
      }
      const { results } = await env.DB
        .prepare('SELECT * FROM rsvp ORDER BY id DESC').all();

      if (path === '/export.csv') {
        const header = ['id', 'created_at', 'name', 'furigana', 'attendance', 'birthday', 'email', 'allergy', 'message'];
        const lines = [header.join(',')];
        for (const r of results) lines.push(header.map(h => csvCell(r[h])).join(','));
        return new Response('﻿' + lines.join('\n'), {
          headers: {
            'Content-Type': 'text/csv; charset=utf-8',
            'Content-Disposition': 'attachment; filename="rsvp.csv"',
          },
        });
      }
      return new Response(adminHtml(results, token), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...(headers || {}) },
  });
}

function adminHtml(rows, token) {
  const yes = rows.filter(r => /出席/.test(r.attendance) && !/欠席/.test(r.attendance)).length;
  const no  = rows.filter(r => /欠席/.test(r.attendance)).length;
  const withAllergy = rows.filter(r => r.allergy && !/^(特になし|なし|無し|)$/.test(r.allergy.trim())).length;

  const tr = rows.map(r => `
    <tr>
      <td>${r.id}</td>
      <td>${esc((r.created_at || '').replace('T', ' ').slice(0, 16))}</td>
      <td>${esc(r.name)}</td>
      <td>${esc(r.furigana)}</td>
      <td class="${/欠席/.test(r.attendance) ? 'no' : 'yes'}">${esc(r.attendance)}</td>
      <td>${esc(r.birthday)}</td>
      <td>${esc(r.email)}</td>
      <td>${esc(r.allergy)}</td>
      <td>${esc(r.message)}</td>
    </tr>`).join('');

  return `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>RSVP 管理</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #faf7f8; color: #2E3E4E; }
  header { background: #E8829A; color: #fff; padding: 18px 20px; }
  header h1 { margin: 0; font-size: 18px; }
  .stats { display: flex; gap: 12px; flex-wrap: wrap; padding: 20px; }
  .stat { background: #fff; border-radius: 12px; padding: 16px 22px; box-shadow: 0 2px 8px rgba(0,0,0,.06); }
  .stat b { display: block; font-size: 30px; }
  .stat.yes b { color: #3EA0C0; } .stat.no b { color: #E8829A; }
  .bar { padding: 0 20px 12px; }
  .bar a { display: inline-block; background: #58B4D4; color: #fff; text-decoration: none; padding: 9px 16px; border-radius: 8px; font-size: 14px; }
  .wrap { overflow-x: auto; padding: 0 20px 40px; }
  table { border-collapse: collapse; width: 100%; background: #fff; font-size: 13px; min-width: 900px; }
  th, td { border: 1px solid #eee; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #FDE8EE; position: sticky; top: 0; }
  td.yes { color: #3EA0C0; } td.no { color: #E8829A; }
</style></head><body>
<header><h1>💐 RSVP 管理ページ</h1></header>
<div class="stats">
  <div class="stat"><b>${rows.length}</b>回答総数</div>
  <div class="stat yes"><b>${yes}</b>出席</div>
  <div class="stat no"><b>${no}</b>欠席</div>
  <div class="stat"><b>${withAllergy}</b>アレルギー等あり</div>
</div>
<div class="bar"><a href="/export.csv?token=${encodeURIComponent(token)}">⬇ CSV ダウンロード</a></div>
<div class="wrap"><table>
  <tr><th>ID</th><th>受信</th><th>お名前</th><th>フリガナ</th><th>出欠</th><th>誕生日</th><th>メール</th><th>アレルギー</th><th>メッセージ</th></tr>
  ${tr || '<tr><td colspan="9">まだ回答はありません</td></tr>'}
</table></div>
</body></html>`;
}
