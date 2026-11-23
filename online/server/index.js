// The host owns simulation. The relay stores ordered control and fallback telemetry batches.
const json = (data, status = 200) => Response.json(data, {status, headers:{'cache-control':'no-store'}});
const ttl = 45_000;
export default {async fetch(req, env) {
  const url = new URL(req.url);
  if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
  const db = env.DB, now = Date.now();
  const query = (sql, ...params) => db.prepare(sql).bind(...params);
  const route = url.pathname.slice(5);
  if (req.method === 'GET' && route === 'rooms') {
    const {results} = await query('SELECT r.id,r.name,r.track,r.capacity,count(p.id) AS count FROM rooms r LEFT JOIN pilots p ON p.room=r.id AND p.seen>? WHERE r.seen>? GROUP BY r.id ORDER BY r.seen DESC LIMIT 80',now-ttl,now-ttl).all();
    return json(results);
  }
  if (req.method !== 'POST' || (req.headers.get('origin') && req.headers.get('origin') !== url.origin)) return json({},403);
  const raw = await req.text();
  if (raw.length > 180000) return json({},413);
  let b; try { b=JSON.parse(raw); } catch { return json({},400); }
  if (!b || typeof b !== 'object') return json({},400);
  if (route === 'host' || route === 'join') {
    const id = crypto.randomUUID(), token = crypto.randomUUID();
    const room = route === 'host' ? crypto.randomUUID() : String(b.room);
    if (route === 'host') {
      await db.batch([query('DELETE FROM rooms WHERE seen<?',now-ttl),query('INSERT INTO rooms(id,host,name,track,seen) VALUES(?,?,?,?,?)',room,id,String(b.name||'Player').slice(0,12),String(b.track||'').slice(0,48),now),query('INSERT INTO pilots VALUES(?,?,?,?)',id,room,token,now)]);
    } else {
      const inserted = await query('INSERT INTO pilots SELECT ?,r.id,?,? FROM rooms r WHERE r.id=? AND r.seen>? AND (SELECT count(*) FROM pilots WHERE room=r.id AND seen>?)<r.capacity',id,token,now,room,now-ttl,now-ttl).run();
      if (!inserted.meta.changes) return json({},409);
    }
    const r=await query('SELECT host FROM rooms WHERE id=?',room).first();
    const last=await query('SELECT max(id) AS n FROM packets WHERE room=?',room).first();
    return json({id,token,room,host:r.host,cursor:last.n||0});
  }
  const pilot=await query('SELECT p.id,p.room,r.host,r.seen FROM pilots p JOIN rooms r ON r.id=p.room WHERE p.id=? AND p.token=?',String(b.id),String(b.token)).first();
  if (!pilot || pilot.seen<now-ttl) return json({},410);
  const host=pilot.host===pilot.id;
  if (route==='leave') {
    await (host ? query('DELETE FROM rooms WHERE id=?',pilot.room) : query('DELETE FROM pilots WHERE id=?',pilot.id)).run();
    return json({});
  }
  if (route!=='sync' || !Array.isArray(b.out) || b.out.length>160 || !Number.isSafeInteger(b.seq)) return json({},400);
  const ops=[query('UPDATE pilots SET seen=? WHERE id=?',now,pilot.id)];
  if (host) ops.push(query('UPDATE rooms SET seen=?,track=?,capacity=? WHERE id=?',now,String(b.track||'').slice(0,48),b.capacity===22?22:11,pilot.room));
  // Guests may only address their host. Only the authenticated sender ID is forwarded.
  const out=b.out.filter(e=>e && typeof e.to==='string' && (host || e.to===pilot.host) && e.m && typeof e.m.t==='string');
  if (out.length) ops.push(query('INSERT OR IGNORE INTO packets(room,sender,seq,body,created) VALUES(?,?,?,?,?)',pilot.room,pilot.id,b.seq,JSON.stringify(out),now));
  if (host && b.seq%30===0) ops.push(query('DELETE FROM packets WHERE room=? AND created<?',pilot.room,now-90000));
  ops.push(query('SELECT id,sender,body FROM packets WHERE room=? AND id>? AND sender<>? AND (?=1 OR sender=?) ORDER BY id LIMIT 64',pilot.room,Number(b.cursor)||0,pilot.id,+host,pilot.host));
  if(host) ops.push(query('SELECT id FROM pilots WHERE room=? AND seen>?',pilot.room,now-ttl));
  const res=await db.batch(ops), rows=res[ops.length-(host?2:1)].results;
  return json({cursor:rows.at(-1)?.id||b.cursor, messages:rows.flatMap(r=>JSON.parse(r.body).filter(e=>e.to===pilot.id || (r.sender===pilot.host && e.to==='*')).map(e=>({from:r.sender,m:e.m}))),members:host?res.at(-1).results.map(r=>r.id):undefined});
}};
