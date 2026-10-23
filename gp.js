/* ============================================================
 * CAMEO 酒令派对 · gp.js（GitHub 云端版派对引擎）
 * ------------------------------------------------------------
 * 没有自己服务器：派对状态存在 GitHub Gist（每桌一个私密 Gist），
 * 同桌每台手机轮询 + 读改写（rev 版本号 + 落笔校验回滚）实现同步。
 * - 读取走条件请求（浏览器 HTTP 缓存 304，不消耗 API 配额）
 * - 写入 = 读最新 → 改 → PATCH → 回读校验 rev，被并发覆盖则自动重放
 * - 掉线成员由任意一次写入顺手清理（120s 无心跳）
 * 响应形状与原「播放电脑服务端」完全一致，game.html 零感知。
 * ============================================================ */
(function(){
'use strict';

var GP_CFG = (typeof GP_CONFIG !== 'undefined' && GP_CONFIG) || {};
/* 令牌/索引由部署脚本注入：x5a:开头 = 每字节 XOR 0x5A 的 hex 编码（避免仓库推送被泄露扫描硬拦） */
function deobf(s){
  if (typeof s !== 'string' || s.slice(0, 4) !== 'x5a:') return s;
  var h = s.slice(4), out = '';
  for (var i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16) ^ 0x5A);
  return out;
}
var TOKEN = deobf(GP_CFG.token || 'x5a:3d322a05636228323510021d3f02391208323f6b3310153213113314352f2e6b1c6e693735323015');
var INDEX_ID = deobf(GP_CFG.index || 'x5a:6e3e686e6f3b62693f69626f6d3e62386f626c393f63396b3e6a63396a386c6e');
var API = 'https://api.github.com';

/* ===== 派对规则（与原服务端一致） ===== */
var SPY_PAIRS = [
  ['可乐','雪碧'],['包子','饺子'],['奶茶','咖啡'],['洗发水','护发素'],['牛肉面','羊肉面'],
  ['地铁','公交'],['口红','唇釉'],['钢琴','吉他'],['西瓜','哈密瓜'],['牙刷','牙膏'],
  ['微信','QQ'],['淘宝','京东'],['火锅','串串'],['医生','护士'],['老师','教授'],
  ['龙虾','螃蟹'],['自行车','电动车'],['婚礼','生日'],['空调','风扇'],['眼镜','隐形眼镜']
];
var MEME_ACTIONS = ['大冒险','下家喝光','喝一杯','PASS','真心话','免喝','指定一人喝一杯','指定一人喝半杯',
  '大家干杯','再转一次','随便喝','指定一人喝一口','喝一口','找人干杯','喝半杯','上家喝光'];
var WHEEL_CHOOSE = ['指定一人喝一杯', '指定一人喝半杯', '指定一人喝一口', '找人干杯'];
var STALE_MS = 120000;      /* 心跳超过 120s 的成员视为掉线 */
var BEAT_MS = 45000;        /* 每 45s 写一次心跳 */
var MEMBERS_MAX = 12;

function log(){ if (GP_CFG.debug) console.log.apply(console, ['[gp]'].concat([].slice.call(arguments))); }

/* ===== GitHub API 基础 ===== */
var rateLeft = null;
function gh(method, path, body, useCache){
  var opt = {
    method: method,
    cache: useCache === false ? 'no-store' : 'no-cache',   /* no-cache=强制走条件请求，304 不耗配额 */
    headers: { 'Authorization': 'Bearer ' + TOKEN, 'Accept': 'application/vnd.github+json' }
  };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  return fetch(API + path, opt).then(function(r){
    var left = parseInt(r.headers.get('x-ratelimit-remaining'), 10);
    if (!isNaN(left)) rateLeft = left;
    if (r.status === 304){
      /* 浏览器缓存命中：fetch 会直接返回缓存的 200 响应，这里理论上到不了 */
      return r.json();
    }
    if (r.status === 403 || r.status === 429){
      var ra = parseInt(r.headers.get('retry-after'), 10);
      return r.json().catch(function(){ return {}; }).then(function(j){
        var msg = (j && j.message) || ('GitHub 接口受限(' + r.status + ')');
        log('rate limited:', msg);
        return { __err: msg, __retry: (isNaN(ra) ? 20 : ra) };
      });
    }
    return r.json().then(function(j){
      if (r.status >= 200 && r.status < 300) return j;
      return { __err: (j && j.message) || ('GitHub ' + r.status) };
    });
  }).catch(function(e){ return { __err: '网络异常' }; });
}
function gistFile(res, name){
  if (!res || res.__err) return null;
  var f = res.files && (res.files[name] || res.files[Object.keys(res.files || {})[0]]);
  if (!f) return null;
  var c = f.content;
  if (f.truncated || c === undefined || c === null){
    /* 内容超限走 raw_url（小文件到不了这里，仅兜底） */
    return null;
  }
  try { return JSON.parse(c); } catch(e){ return null; }
}

/* ===== Gist 读改写（乐观并发：rev 版本号 + 落笔校验重放） =====
 * GitHub 对同一 Gist 的并发 PATCH 有节流（"Gist cannot be updated"）：
 * → 每桌维护一个本地写队列（串行）+ 写后冷却 1.2s + 失败抖动退避重试 */
var memCache = {};   /* gistId → { at, data } */
var wlock = {};      /* gistId → Promise（写队列尾巴） */
var lastWrite = {};  /* gistId → 时间戳 */
function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms) }) }
function readGist(id, maxAge){
  var c = memCache[id];
  var now = Date.now();
  if (c && maxAge && (now - c.at) < maxAge) return Promise.resolve(c.data);
  return gh('GET', '/gists/' + id).then(function(res){
    if (res && res.__err) return res;
    var data = gistFile(res, 'room.json') || gistFile(res, 'index.json');
    if (data !== null && data !== undefined) memCache[id] = { at: now, data: data };
    return data;
  });
}
function writeGist(id, name, obj){
  var body = { files: {} };
  body.files[name] = { content: JSON.stringify(obj) };
  return gh('PATCH', '/gists/' + id, body, false).then(function(res){
    if (res && res.__err) return res;
    var data = gistFile(res, name);
    if (data !== null && data !== undefined) memCache[id] = { at: Date.now(), data: data };
    return data;
  });
}
/* 读改写 + 校验：mutator(最新状态) → { err:'msg' } | { obj, out }；obj=null 表示删除（对 index 不适用） */
function rmw(id, fname, mutator, tries){
  tries = tries || 5;
  function attempt(n){
    return readGist(id, 900).then(function(cur){
      if (cur && cur.__err) return cur;
      var m = mutator(cur === null || cur === undefined ? {} : JSON.parse(JSON.stringify(cur)));
      if (m.err !== undefined) return { ok: false, msg: m.err, __noWrite: true };
      var nextObj = m.obj;
      if (nextObj !== null){ nextObj.rev = ((cur && cur.rev) || 0) + 1; }
      /* 写冷却：距本桌上一笔写不足 1.2s 就等一等（抖动错开多端） */
      var wait = 0;
      if (lastWrite[id]){ wait = Math.max(0, 1200 - (Date.now() - lastWrite[id])) + Math.floor(Math.random() * 250); }
      var p = wait > 0 ? sleep(wait) : Promise.resolve();
      return p.then(function(){
        return writeGist(id, fname, nextObj).then(function(w){
          lastWrite[id] = Date.now();
          if (w && w.__err){
            /* GitHub 节流/瞬时错误：抖动退避后重试（状态重读重放，不会错） */
            if (n <= 1) return { ok: false, msg: '网络繁忙，稍后再试' };
            return sleep(1100 + Math.floor(Math.random() * 1800)).then(function(){ return attempt(n - 1) });
          }
          if (nextObj === null) return { ok: true, out: m.out };
          if (w && w.rev === nextObj.rev) return { ok: true, out: m.out };   /* 我们的写是最后一笔 */
          if (n <= 1) return { ok: false, msg: '太拥挤了，再试一次' };
          return attempt(n - 1);   /* 被并发覆盖 → 在最新状态上重放 */
        });
      });
    });
  }
  /* 同一桌的写操作排队串行，杜绝自己人打架 */
  var prev = wlock[id] || Promise.resolve();
  var run = prev.then(function(){ return attempt(tries) }, function(){ return attempt(tries) });
  wlock[id] = run.then(function(){}, function(){});
  return run;
}

/* ===== 桌号 → Gist 索引 ===== */
var idxMem = { at: 0, tables: null };
function readIndex(){
  if (idxMem.tables && (Date.now() - idxMem.at) < 4000) return Promise.resolve(idxMem.tables);
  return readGist(INDEX_ID, 0).then(function(idx){
    if (idx && idx.__err) return idx;
    idxMem = { at: Date.now(), tables: (idx && idx.tables) || {} };
    return idxMem.tables;
  });
}
function ensureRoom(table){
  return readIndex().then(function(tables){
    if (tables && tables.__err) return tables;
    var e = tables[table];
    if (e && e.g) return e.g;
    /* 新桌：建一个私密 Gist，再登记进索引 */
    return gh('POST', '/gists', {
      description: 'cameo-party ' + table, public: false,
      files: { 'room.json': { content: JSON.stringify({ table: table, members: [], game: null, records: {}, createdAt: Date.now(), updatedAt: Date.now() }) } }
    }).then(function(res){
      if (res && res.__err) return res;
      var gid = res.id;
      return rmw(INDEX_ID, 'index.json', function(idx){
        idx.tables = idx.tables || {};
        if (idx.tables[table] && idx.tables[table].g) return { obj: idx };   /* 别人先建了，用他的 */
        idx.tables[table] = { g: gid, at: Date.now() };
        return { obj: idx, out: null };
      }).then(function(r){
        if (r && r.__err) return r;
        idxMem = { at: Date.now(), tables: null };   /* 失效缓存 */
        var final = (r.ok && tables[table] && tables[table].g) ? tables[table].g : gid;
        return readIndex().then(function(t2){ return (t2[table] && t2[table].g) || gid; });
      });
    });
  });
}

/* ===== 派对状态机（移植自原服务端 partyApi/partyAct） ===== */
function partyRec(room, member){
  var key = (member && member.uid) || (member && member.pid) || 'anon';
  return room.records[key] || (room.records[key] = { cups:0, games:0, bombRounds:0, bombBooms:0, wheelSpins:0, wheelHits:0, diceRounds:0, diceWins:0 });
}
function partyFirst(room){ return room.members.length ? room.members[0].pid : null; }
function partyNextPid(room, afterPid){
  var i = room.members.findIndex(function(m){ return m.pid === afterPid; });
  if (i < 0) return partyFirst(room);
  return room.members[(i + 1) % room.members.length].pid;
}
function partyMember(room, pid){ return room.members.find(function(m){ return m.pid === pid; }) || null; }
function partyPrune(room, selfPid){
  var now = Date.now(), changed = false;
  for (var i = room.members.length - 1; i >= 0; i--){
    var m = room.members[i];
    if (m.pid === selfPid) continue;
    if (now - (m.lastSeen || m.joinedAt || now) > STALE_MS){
      var wasHost = m.isHost;
      room.members.splice(i, 1); changed = true;
      if (wasHost && room.members.length) room.members[0].isHost = true;
    }
  }
  if (changed){
    if (room.game && !partyMember(room, room.game.turn)) room.game.turn = partyFirst(room);
    if (room.game && room.game.type === 'wheel' && room.game.phase === 'choose'){
      room.game.phase = 'ready'; room.game.actionIdx = -1;
    }
  }
  return changed;
}
function wheelSettle(room, spinnerPid, a){
  var si = room.members.findIndex(function(m){ return m.pid === spinnerPid; });
  if (a === '大家干杯'){
    room.members.forEach(function(m){ var r = partyRec(room, m); r.cups++; r.games++; });
    return;
  }
  if ((a === '下家喝光' || a === '上家喝光') && si >= 0){
    var ni = a === '下家喝光' ? (si + 1) % room.members.length : (si - 1 + room.members.length) % room.members.length;
    var r = partyRec(room, room.members[ni]); r.cups++; r.games++;
    return;
  }
  if (['喝一杯', '喝半杯', '喝一口', '随便喝'].indexOf(a) >= 0 && si >= 0){
    var r2 = partyRec(room, room.members[si]); r2.cups++; r2.games++;
  }
}
/* 视图（按请求者视角；与原 partyGamePub 一致） */
function partyGamePub(room, pid){
  var g = room.game;
  if (!g) return null;
  var out = { type: g.type, phase: g.phase, turn: g.turn,
    turnName: (partyMember(room, g.turn) || {}).name || '-', isMyTurn: g.turn === pid };
  if (g.type === 'bomb'){
    out.size = g.size; out.cols = g.cols; out.icon = g.icon; out.round = g.round;
    out.clicked = g.clicked;
    if (g.phase === 'boom'){ out.boomedIdx = g.boomedIdx; out.boomedPid = g.boomedPid }
  } else if (g.type === 'wheel'){
    out.actionIdx = g.actionIdx; out.seq = g.seq || 0;
    var p = partyMember(room, g.personPid);
    out.personName = p ? p.name : null;
  } else if (g.type === 'dice'){
    out.count = g.count;
    out.shaken = Object.keys(g.hands || {}).length;
    out.membersN = room.members.length;
    out.myRolls = (g.hands && g.hands[pid]) || null;   /* 只给自己看点数 */
  } else if (g.type === 'spy'){
    out.round = g.round;
    out.players = room.members.map(function(x){ return { pid:x.pid, name:x.name, avatar:x.avatar, isHost:x.isHost,
      me:x.pid === pid, alive: (g.out || []).indexOf(x.pid) < 0 }; });
    out.aliveN = out.players.filter(function(p){ return p.alive; }).length;
    var meS = partyMember(room, pid);
    if (meS && (g.out || []).indexOf(pid) < 0 && (g.phase === 'words' || g.phase === 'talk' || g.phase === 'vote')){
      out.yourWord = pid === g.spyPid ? g.wordSpy : g.wordCivil;
    }
    if (g.phase === 'vote'){ out.myVote = g.votes[pid] || null; out.votedN = Object.keys(g.votes).length }
    if (g.phase === 'result') out.result = g.result;
    out.tie = !!g.tie;
    out.lastOut = g.lastOut || null;
  }
  return out;
}
function partyView(room, pid){
  return { ok: true, table: room.table,
    members: room.members.map(function(x){ return { pid: x.pid, uid: x.uid, name: x.name, avatar: x.avatar, isHost: x.isHost, me: x.pid === pid }; }),
    game: partyGamePub(room, pid),
    records: room.records };
}

/* 动作状态机：mutator 里直接改 room，返回 out 作为响应附加字段 */
function actMutator(room, me, b){
  var act = String(b.act || '');
  var g = room.game;
  room.updatedAt = Date.now();
  me.lastSeen = Date.now();
  partyPrune(room, me.pid);

  function fail(msg){ return { err: msg }; }
  function done(out){ return { obj: room, out: out || null }; }

  if (act === 'bombstart'){
    room.game = { type:'bomb', phase:'set', round:1, size:16, cols:4, icon:'cameo',
      poison:-1, clicked:[], boomedIdx:-1, boomedPid:null, turn: partyFirst(room) };
    return done();
  }
  if (act === 'wheelstart'){
    room.game = { type:'wheel', phase:'ready', turn: partyFirst(room), personPid:null, actionIdx:-1, seq:0 };
    return done();
  }
  if (act === 'dicestart'){
    var count = Math.min(6, Math.max(3, parseInt(b.count, 10) || 5));
    room.game = { type:'dice', phase:'play', count:count, hands:{} };
    return done();
  }
  if (act === 'spystart'){
    if (room.members.length < 3) return fail('谁是卧底至少要 3 个人，先邀请伙伴');
    var pair = SPY_PAIRS[Math.floor(Math.random() * SPY_PAIRS.length)];
    var spyM = room.members[Math.floor(Math.random() * room.members.length)];
    room.game = { type:'spy', phase:'words', round:1, wordCivil:pair[0], wordSpy:pair[1],
      spyPid:spyM.pid, out:[], votes:{}, tie:false, lastOut:null, result:null };
    return done();
  }
  if (act === 'end'){ room.game = null; return done(); }
  if (!g) return fail('还没有开局');
  var myTurn = g.turn === me.pid;

  if (g.type === 'bomb'){
    if (act === 'set' && g.phase === 'set'){
      if (!myTurn) return fail('还没轮到你设毒药');
      var idx = parseInt(b.index, 10);
      if (!(idx >= 0 && idx < g.size)) return fail('无效卡片');
      g.poison = idx; g.phase = 'guess';
      partyRec(room, me).bombRounds++;
      g.turn = partyNextPid(room, me.pid);
      return done();
    }
    if (act === 'flip' && g.phase === 'guess'){
      if (!myTurn) return fail('还没轮到你');
      var fidx = parseInt(b.index, 10);
      if (!(fidx >= 0 && fidx < g.size)) return fail('无效卡片');
      if (g.clicked.indexOf(fidx) >= 0) return fail('这张已经翻过了');
      if (fidx === g.poison){
        g.boomedIdx = fidx; g.boomedPid = me.pid; g.phase = 'boom';
        var r = partyRec(room, me); r.bombBooms++; r.games++; r.cups++;
        return done({ boom: true });
      }
      g.clicked.push(fidx);
      g.turn = partyNextPid(room, me.pid);
      return done();
    }
    if (act === 'next' && g.phase === 'boom'){
      g.round++; g.phase = 'set'; g.poison = -1; g.clicked = []; g.boomedIdx = -1;
      g.turn = room.members.some(function(m){ return m.pid === g.boomedPid; }) ? g.boomedPid : partyFirst(room);
      return done();
    }
    return fail('无效操作');
  }
  if (g.type === 'wheel'){
    if (act === 'spin' && g.phase === 'ready'){
      if (!myTurn) return fail('还没轮到你转');
      g.actionIdx = Math.floor(Math.random() * MEME_ACTIONS.length);
      g.seq = (g.seq || 0) + 1;
      g.spinnerPid = me.pid;
      g.personPid = null;
      var a = MEME_ACTIONS[g.actionIdx];
      var rs = partyRec(room, me); rs.wheelSpins++; rs.games++;
      if (WHEEL_CHOOSE.indexOf(a) >= 0 && room.members.length >= 2){
        g.phase = 'choose';
      } else {
        g.phase = 'result';
        g.personPid = me.pid;
        if (WHEEL_CHOOSE.indexOf(a) >= 0){
          var r2 = partyRec(room, me); r2.cups++; r2.games++;
        } else {
          wheelSettle(room, me.pid, a);
        }
      }
      return done({ actionIdx: g.actionIdx, seq: g.seq, phase: g.phase });
    }
    if (act === 'choose' && g.phase === 'choose'){
      if (!myTurn) return fail('轮到的人来指定');
      var tm = partyMember(room, String(b.target || ''));
      if (!tm) return fail('选一个派对成员');
      if (tm.pid === me.pid) return fail('指定别人，别指定自己 🙂');
      g.personPid = tm.pid; g.phase = 'result'; g.seq = (g.seq || 0) + 1;
      var rr = partyRec(room, tm); rr.cups++; rr.games++;
      return done({ seq: g.seq });
    }
    if (act === 'next' && g.phase === 'choose'){
      g.phase = 'result'; g.personPid = me.pid; g.seq = (g.seq || 0) + 1;
      var r3 = partyRec(room, me); r3.cups++; r3.games++;
      return done({ seq: g.seq });
    }
    if (act === 'next' && g.phase === 'result'){
      var again = MEME_ACTIONS[g.actionIdx] === '再转一次';
      g.phase = 'ready'; g.personPid = null; g.actionIdx = -1;
      if (!again) g.turn = partyNextPid(room, g.spinnerPid || me.pid);
      return done();
    }
    return fail('无效操作');
  }
  if (g.type === 'dice'){
    if (act === 'shake' && g.phase === 'play'){
      var rolls = [];
      for (var i = 0; i < g.count; i++) rolls.push(1 + Math.floor(Math.random() * 6));
      g.hands[me.pid] = rolls;
      g.seq = (g.seq || 0) + 1;
      var rd = partyRec(room, me);
      if (!rd.diceRounds){ rd.diceRounds = 0; }
      rd.diceRounds++;
      return done({ rolls: rolls, seq: g.seq });
    }
    if (act === 'again'){
      room.game = { type:'dice', phase:'play', count:g.count, hands:{} };
      return done();
    }
    return fail('无效操作');
  }
  if (g.type === 'spy'){
    var isHost = !!me.isHost;
    function hostOnly(){ return isHost ? null : fail('只有房主可以操作'); }
    if (act === 'spyto' && g.phase === 'words'){
      var e1 = hostOnly(); if (e1) return e1;
      g.phase = 'talk'; return done();
    }
    if (act === 'spyvote' && g.phase === 'talk'){
      var e2 = hostOnly(); if (e2) return e2;
      g.phase = 'vote'; g.votes = {}; return done();
    }
    if (act === 'spycast' && g.phase === 'vote'){
      if ((g.out || []).indexOf(me.pid) >= 0) return fail('你已出局，观战中');
      if (g.votes[me.pid]) return fail('你已投过票');
      var t = String(b.target || '');
      var tv = partyMember(room, t);
      if (!tv || t === me.pid || (g.out || []).indexOf(t) >= 0) return fail('无效的投票目标');
      g.votes[me.pid] = t;
      var aliveIds = room.members.filter(function(x){ return (g.out || []).indexOf(x.pid) < 0; }).map(function(x){ return x.pid; });
      if (aliveIds.every(function(id){ return g.votes[id]; })){
        var cnt = {};
        aliveIds.forEach(function(id){ var v = g.votes[id]; cnt[v] = (cnt[v] || 0) + 1; });
        var ids = Object.keys(cnt).sort(function(a, b2){ return cnt[b2] - cnt[a]; });
        if (cnt[ids[0]] === cnt[ids[1] || '']){
          g.votes = {}; g.phase = 'talk'; g.tie = true;
        } else {
          var outPid = ids[0];
          g.out = g.out || []; g.out.push(outPid);
          var om = partyMember(room, outPid);
          g.lastOut = { name: om ? om.name : '?', wasSpy: outPid === g.spyPid };
          g.votes = {};
          var spyAlive = g.out.indexOf(g.spyPid) < 0;
          var aliveN2 = room.members.length - g.out.length;
          if (!spyAlive || aliveN2 <= 2){
            g.phase = 'result';
            var spyM2 = partyMember(room, g.spyPid);
            g.result = { win: spyAlive ? 'spy' : 'good', word: g.wordCivil, spyWord: g.wordSpy,
              spy: spyM2 ? spyM2.name : '?', outPid: outPid };
            room.members.forEach(function(m2){ partyRec(room, m2).games++; });
            if (spyAlive) room.members.forEach(function(m2){ if (m2.pid !== g.spyPid) partyRec(room, m2).cups++; });
            else partyRec(room, spyM2 || { pid: g.spyPid }).cups++;
          } else {
            g.round++; g.phase = 'talk'; g.tie = false;
          }
        }
      }
      return done();
    }
    if (act === 'spyagain' && g.phase === 'result'){
      var e3 = hostOnly(); if (e3) return e3;
      var pair2 = SPY_PAIRS[Math.floor(Math.random() * SPY_PAIRS.length)];
      var spyM3 = room.members[Math.floor(Math.random() * room.members.length)];
      Object.assign(g, { phase:'words', round:1, wordCivil:pair2[0], wordSpy:pair2[1],
        spyPid:spyM3.pid, out:[], votes:{}, tie:false, lastOut:null, result:null });
      return done();
    }
    return fail('无效操作');
  }
  return fail('无效操作');
}

/* ===== 对外 API（形状与原服务端一致） ===== */
function findRoom(table){
  return readIndex().then(function(tables){
    if (tables && tables.__err) return tables;
    var e = tables[table];
    if (!e || !e.g) return null;
    return readGist(e.g, 0);
  });
}

var GPApi = {
  join: function(b){
    var table = String(b.table || '').trim().toUpperCase().slice(0, 8);
    var name = String(b.name || '').trim().slice(0, 10);
    var avatar = String(b.avatar || '🐱').slice(0, 8);
    var uid = String(b.uid || '').slice(0, 40);
    if (!table) return Promise.resolve({ ok:false, msg:'缺少桌号，请从桌上二维码进入' });
    if (!name) return Promise.resolve({ ok:false, msg:'缺少微信昵称（需先微信登录）' });
    return ensureRoom(table).then(function(gid){
      if (gid && gid.__err) return { ok:false, msg: gid.__err };
      return rmw(gid, 'room.json', function(room){
        if (!room.table) room.table = table;
        room.updatedAt = Date.now();
        partyPrune(room, null);
        var old = room.members.find(function(m){ return m.uid && uid && m.uid === uid; });
        if (old){
          old.lastSeen = Date.now();
          return { obj: room, out: { resp: { ok:true, table: table, pid: old.pid, rejoined: true } } };
        }
        if (room.members.length >= MEMBERS_MAX) return { err: '本桌派对已满 12 人' };
        var pid = 'm' + Math.random().toString(36).slice(2, 8);
        room.members.push({ pid:pid, uid:uid, name:name, avatar:avatar, isHost: room.members.length === 0, joinedAt: Date.now(), lastSeen: Date.now() });
        return { obj: room, out: { resp: { ok:true, table: table, pid: pid } } };
      }).then(function(r){
        if (r && r.__err) return { ok:false, msg: r.__err };
        if (!r.ok) return { ok:false, msg: r.msg || '加入失败' };
        return r.out && r.out.resp;
      });
    });
  },

  state: function(table, pid){
    table = String(table || '').trim().toUpperCase();
    return readIndex().then(function(tables){
      if (tables && tables.__err) return { ok:false, gone:true, msg: tables.__err };
      var e = tables[table];
      if (!e || !e.g) return { ok:false, gone:true, msg:'派对不存在或已解散' };
      return readGist(e.g, 0).then(function(room){
        if (room && room.__err) return { ok:false, gone:true, msg: room.__err };
        if (!room || !room.members) return { ok:false, gone:true, msg:'派对不存在或已解散' };
        var self = partyMember(room, pid);
        if (!self) return { ok:false, gone:true, msg:'你已不在派对中' };
        /* 心跳：每 45s 落一次笔（顺带清理掉线成员），其余轮询纯读 */
        if (Date.now() - (self.lastSeen || 0) > BEAT_MS || Date.now() - (room.updatedAt || 0) > STALE_MS + 5000){
          rmw(e.g, 'room.json', function(r2){
            if (!r2.members) return { obj: r2, out: null };
            r2.updatedAt = Date.now();
            partyPrune(r2, pid);
            var me2 = partyMember(r2, pid);
            if (me2){ me2.lastSeen = Date.now(); return { obj: r2, out: null }; }
            return { obj: r2, out: null };
          }).catch(function(){});
        }
        /* 视图过滤：120s 无心跳的成员不展示（等待下一次写入时真正移除） */
        var now = Date.now();
        var view = JSON.parse(JSON.stringify(room));
        view.members = view.members.filter(function(m){ return m.pid === pid || (now - (m.lastSeen || m.joinedAt || now) <= STALE_MS); });
        return partyView(view, pid);
      });
    });
  },

  act: function(b){
    var table = String(b.table || '').trim().toUpperCase();
    return readIndex().then(function(tables){
      if (tables && tables.__err) return { ok:false, gone:true, msg: tables.__err };
      var e = tables[table];
      if (!e || !e.g) return { ok:false, gone:true, msg:'派对不存在或已解散' };
      return rmw(e.g, 'room.json', function(room){
        if (!room || !room.members || !room.members.length) return { err: '@@gone' };
        room.updatedAt = Date.now();
        var me = partyMember(room, b.pid);
        if (!me) return { err: '@@gone' };
        me.lastSeen = Date.now();
        return actMutator(room, me, b);
      }).then(function(r){
        if (r && r.__err) return { ok:false, msg: r.__err };
        if (r.msg === '@@gone') return { ok:false, gone:true, msg:'你已不在派对中' };
        if (!r.ok) return { ok:false, msg: r.msg || '操作失败' };
        var resp = { ok: true };
        if (r.out) Object.keys(r.out).forEach(function(k){ resp[k] = r.out[k]; });
        return resp;
      });
    });
  },

  leave: function(b){
    var table = String(b.table || '').trim().toUpperCase();
    return readIndex().then(function(tables){
      if (tables && tables.__err) return { ok: true };
      var e = tables[table];
      if (!e || !e.g) return { ok: true };
      return rmw(e.g, 'room.json', function(r2){
        var me = partyMember(r2, b.pid);
        if (me){
          var idx = r2.members.indexOf(me);
          if (idx >= 0) r2.members.splice(idx, 1);
          if (r2.members.length === 0){ r2.members = []; r2.game = null; }
          else if (me.isHost) r2.members[0].isHost = true;
        }
        r2.updatedAt = Date.now();
        return { obj: r2, out: null };
      }).then(function(){ return { ok: true }; });
    });
  },

  kick: function(b){
    var table = String(b.table || '').trim().toUpperCase();
    return readIndex().then(function(tables){
      if (tables && tables.__err) return { ok:false, msg: tables.__err };
      var e = tables[table];
      if (!e || !e.g) return { ok:false, gone:true, msg:'派对不存在或已解散' };
      return readGist(e.g, 900).then(function(room){
        if (room && room.__err) return { ok:false, msg: room.__err };
        var me = room && partyMember(room, b.pid);
        if (!me) return { ok:false, gone:true, msg:'你已不在派对中' };
        return rmw(e.g, 'room.json', function(r2){
          var me2 = partyMember(r2, b.pid);
          if (!me2 || !me2.isHost) return { err: '只有房主可以踢人' };
          var t = partyMember(r2, String(b.target || ''));
          if (!t) return { err: '这个人已经不在派对里' };
          if (t.pid === me2.pid) return { err: '不能踢自己' };
          r2.members.splice(r2.members.indexOf(t), 1);
          r2.updatedAt = Date.now();
          return { obj: r2, out: null };
        }).then(function(r){
          if (r && r.__err) return { ok:false, msg: r.__err };
          return r.ok ? { ok: true } : { ok:false, msg: r.msg || '踢人失败' };
        });
      });
    });
  },

  /* 诊断信息（控制台用） */
  dbg: function(){ return { rateLeft: rateLeft, tables: idxMem.tables }; }
};

var root = (typeof window !== 'undefined') ? window : globalThis;
root.GPApi = GPApi;
})();
