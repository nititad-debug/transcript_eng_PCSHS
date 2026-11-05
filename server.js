// Zero-dependency server (Node >= 18): static files + shared course catalog + Anthropic proxy.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = +process.env.PORT || 3000;
const PASS = process.env.APP_PASSWORD || '';
const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
const API = process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages';
const DATA = path.resolve(process.env.DATA_DIR || path.join(DIR, 'data'));
const FILE = path.join(DATA, 'catalog.json');
const PUB = path.join(DIR, 'public');
const PER_HOUR = +process.env.EXTRACT_PER_HOUR || 30;

// LLM provider: 'anthropic' (default) or 'gemini'. Set LLM_PROVIDER, or just provide only one key.
const GKEY = process.env.GEMINI_API_KEY || '';
const PROVIDER = (process.env.LLM_PROVIDER || (KEY ? 'anthropic' : GKEY ? 'gemini' : 'anthropic')).toLowerCase();
const GMODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const GAPI = process.env.GEMINI_API_URL || 'https://generativelanguage.googleapis.com/v1beta/models';
const HAVE_KEY = PROVIDER === 'gemini' ? !!GKEY : !!KEY;

async function callLLM(prompt, imgs) {
  if (PROVIDER === 'gemini') {
    const r = await fetch(`${GAPI}/${encodeURIComponent(GMODEL)}:generateContent`, {method: 'POST',
      headers: {'x-goog-api-key': GKEY, 'content-type': 'application/json'},
      body: JSON.stringify({contents: [{role: 'user', parts: [
        ...imgs.map(b => ({inline_data: {mime_type: 'image/jpeg', data: b}})), {text: prompt}]}],
        generationConfig: {temperature: 0, responseMimeType: 'application/json', maxOutputTokens: 32000}})});
    const j = await r.json();
    if (!r.ok) throw new Error(j.error?.message || 'Gemini API ' + r.status);
    const c = j.candidates?.[0], t = (c?.content?.parts || []).map(p => p.text || '').join('');
    if (!t) throw new Error('Gemini returned no text' + (c?.finishReason ? ' (' + c.finishReason + ')' : ''));
    return t;
  }
  const r = await fetch(API, {method: 'POST',
    headers: {'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json'},
    body: JSON.stringify({model: MODEL, max_tokens: 16000, messages: [{role: 'user', content: [
      ...imgs.map(b => ({type: 'image', source: {type: 'base64', media_type: 'image/jpeg', data: b}})),
      {type: 'text', text: prompt}]}]})});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || 'API ' + r.status);
  return (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

const PFX = {ท:'TH', ค:'MA', ว:'ST', ส:'SO', พ:'HP', ศ:'AR', ง:'OC', อ:'EN', ญ:'JA', จ:'CH'};
const rid = c => { c = String(c).replace(/\s/g, ''); const e = (PFX[c[0]] || c[0]) + c.slice(1);
  return /^[A-Za-z0-9]+$/.test(e) ? e : 'x' + [...c].map(ch => ch.codePointAt(0).toString(16)).join('-'); };

let cat = {}, queue = Promise.resolve();
const save = () => queue = queue.then(async () => {
  await fs.mkdir(DATA, {recursive: true});
  const tmp = FILE + '.tmp'; await fs.writeFile(tmp, JSON.stringify(cat)); await fs.rename(tmp, FILE);
}).catch(e => console.error('save failed', e));
async function load() {
  try { cat = JSON.parse(await fs.readFile(FILE, 'utf8')); }
  catch { const seed = JSON.parse(await fs.readFile(path.join(DIR, 'seed-catalog.json'), 'utf8'));
    cat = {}; seed.forEach(r => cat[rid(r.code)] = {code: r.code, title: r.title}); await save(); }
}

const send = (res, s, o) => { res.writeHead(s, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}); res.end(JSON.stringify(o)); };
const body = (req, max = 30e6) => new Promise((ok, no) => { let n = 0; const a = [];
  req.on('data', c => { n += c.length; if (n > max) { no(Object.assign(new Error('too large'), {status: 413})); req.destroy(); } else a.push(c); });
  req.on('end', () => ok(Buffer.concat(a).toString())); req.on('error', no); });
const authed = req => { if (!PASS) return true; const a = Buffer.from(String(req.headers['x-app-token'] || '')), b = Buffer.from(PASS);
  return a.length === b.length && crypto.timingSafeEqual(a, b); };
const hits = new Map();
const limited = ip => { const now = Date.now(), l = (hits.get(ip) || []).filter(t => now - t < 36e5);
  if (l.length >= PER_HOUR) { hits.set(ip, l); return true; } l.push(now); hits.set(ip, l); return false; };

async function extract(req, res) {
  if (!HAVE_KEY) return send(res, 503, {error: `server has no ${PROVIDER === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY'}`});
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',')[0].trim();
  if (limited(ip)) return send(res, 429, {error: 'ใช้งานเกินจำนวนต่อชั่วโมง ลองใหม่ภายหลัง'});
  const d = JSON.parse(await body(req)), imgs = Array.isArray(d.images) ? d.images : [];
  if (!d.prompt || String(d.prompt).length > 12000 || !imgs.length || imgs.length > 5 || imgs.some(x => typeof x !== 'string' || x.length > 9e6))
    return send(res, 400, {error: 'invalid request'});
  res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  const hb = setInterval(() => res.write(' '), 10000); // keep-alive for long reads (leading spaces are valid JSON)
  try {
    let t = await callLLM(String(d.prompt), imgs);
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    res.end(JSON.stringify({data: JSON.parse(t.slice(a, b + 1))}));
  } catch (e) { res.end(JSON.stringify({error: 'อ่านเอกสารไม่สำเร็จ: ' + e.message})); }
  finally { clearInterval(hb); }
}

const MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon'};
http.createServer(async (req, res) => { try {
  const p = new URL(req.url, 'http://x').pathname;
  if (p === '/api/health') return send(res, 200, {ok: true, auth: !!PASS, ai: HAVE_KEY, provider: PROVIDER});
  if (p.startsWith('/api/')) {
    if (!authed(req)) return send(res, 401, {error: 'unauthorized'});
    if (p === '/api/catalog' && req.method === 'GET') return send(res, 200, {rows: Object.entries(cat).map(([id, v]) => ({id, ...v}))});
    const m = p.match(/^\/api\/catalog\/([A-Za-z0-9_-]{1,80})$/);
    if (m && req.method === 'PUT') { const d = JSON.parse(await body(req, 1e4));
      const code = String(d.code || '').trim().slice(0, 30), title = String(d.title || '').trim().slice(0, 200);
      if (!code || !title) return send(res, 400, {error: 'code and title required'});
      cat[m[1]] = {code, title}; save(); return send(res, 200, {ok: true}); }
    if (m && req.method === 'DELETE') { delete cat[m[1]]; save(); return send(res, 200, {ok: true}); }
    if (p === '/api/extract' && req.method === 'POST') return extract(req, res);
    return send(res, 404, {error: 'not found'});
  }
  const f = path.normalize(path.join(PUB, p === '/' ? 'index.html' : p));
  if (!f.startsWith(PUB)) return send(res, 403, {error: 'forbidden'});
  try { const b = await fs.readFile(f); res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'}); res.end(b); }
  catch { send(res, 404, {error: 'not found'}); }
} catch (e) { if (!res.headersSent) send(res, e.status || 500, {error: e.status ? e.message : 'server error'}); else res.end(); } })
.listen(PORT, async () => { await load(); console.log(`TranscriptEN on http://localhost:${PORT}  (auth ${PASS ? 'on' : 'OFF'}, AI ${HAVE_KEY ? PROVIDER : 'OFF'})`); });
