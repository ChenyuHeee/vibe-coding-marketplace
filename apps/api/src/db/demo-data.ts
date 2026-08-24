import type { ProjectCategory, Role } from '@vibe/shared';

/**
 * 演示种子数据（DECISIONS.md A6：空库可演示）。
 * 演示作品为真实的单文件 HTML（自包含、无外部依赖，可在 iframe sandbox 中运行），
 * seed 时写入 uploads/projects/<id>/index.html。
 */

export interface DemoUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
  roles: Role[];
  isAdmin: boolean;
  initialBalanceCr: number;
}

export interface DemoProject {
  id: string;
  sellerId: string;
  title: string;
  description: string;
  category: ProjectCategory;
  priceCr: number;
  trialScope: string;
  html: string;
}

export interface DemoCommission {
  id: string;
  buyerId: string;
  title: string;
  description: string;
  budgetMinCr: number;
  budgetMaxCr: number;
  timelineDays: number;
  acceptanceCriteria: string;
  referenceProjectIds: string[];
}

export interface DemoBid {
  id: string;
  commissionId: string;
  contractorId: string;
  amountCr: number;
  proposal: string;
}

// ---------------------------------------------------------------------------
// 演示账号（密码为演示用明文，seed 时 bcrypt 哈希）
// ---------------------------------------------------------------------------

export const DEMO_USERS: DemoUser[] = [
  {
    id: 'usr_admin',
    email: 'admin@vibes.local',
    password: 'admin123',
    displayName: '平台管理员',
    roles: ['buyer', 'seller', 'contractor'],
    isAdmin: true,
    initialBalanceCr: 0,
  },
  {
    id: 'usr_buyer',
    email: 'buyer@vibes.local',
    password: 'demo1234',
    displayName: '演示买家',
    roles: ['buyer'],
    isAdmin: false,
    initialBalanceCr: 5000,
  },
  {
    id: 'usr_seller',
    email: 'seller@vibes.local',
    password: 'demo1234',
    displayName: '演示卖家',
    roles: ['seller', 'buyer'],
    isAdmin: false,
    initialBalanceCr: 2000,
  },
  {
    id: 'usr_contractor',
    email: 'contractor@vibes.local',
    password: 'demo1234',
    displayName: '演示接单者',
    roles: ['contractor', 'buyer'],
    isAdmin: false,
    initialBalanceCr: 1500,
  },
];

// ---------------------------------------------------------------------------
// 演示作品（已上架 approved）—— HTML 为可运行的单文件作品
// ---------------------------------------------------------------------------

export const DEMO_PROJECTS: DemoProject[] = [
  {
    id: 'proj_snake',
    sellerId: 'usr_seller',
    title: '贪吃蛇 Classic',
    description: '经典贪吃蛇：方向键/WASD 控制，吃食物增长，速度随分数提升。像素风，无外部依赖，打开即玩。',
    category: 'game',
    priceCr: 500,
    trialScope: '完整版可玩，含计分与难度递增（演示环境不限时）',
    html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>贪吃蛇 Classic</title>
<style>
  body { margin:0; font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; }
  h1 { font-size:20px; margin:12px 0 4px; letter-spacing:2px; }
  .hud { display:flex; gap:24px; margin:8px 0 12px; font-size:14px; color:#94a3b8; }
  .hud b { color:#facc15; }
  canvas { background:#0b1120; border:2px solid #334155; border-radius:8px; }
  .hint { margin-top:10px; font-size:12px; color:#64748b; }
  .overlay { position:fixed; inset:0; background:rgba(2,6,23,.82); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; }
  .overlay.hidden { display:none; }
  button { background:#facc15; color:#0f172a; border:0; border-radius:8px; padding:10px 22px; font-size:15px; font-weight:700; cursor:pointer; }
  button:hover { background:#fde047; }
  .overlay p { margin:0; color:#e2e8f0; }
</style>
</head>
<body>
<h1>🐍 贪吃蛇 Classic</h1>
<div class="hud"><span>分数 <b id="score">0</b></span><span>最高 <b id="best">0</b></span><span>速度 <b id="speed">1x</b></span></div>
<canvas id="game" width="400" height="400"></canvas>
<div class="hint">方向键 / WASD 控制 · 吃到食物变长加速</div>
<div id="start" class="overlay">
  <p>🐍 准备好开始了吗？</p>
  <button id="btnStart">开始游戏</button>
</div>
<div id="over" class="overlay hidden">
  <p>💀 游戏结束</p>
  <p id="finalScore"></p>
  <button id="btnAgain">再来一局</button>
</div>
<script>
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var GRID = 20, CELL = canvas.width / GRID;
  var score = 0, best = 0, speedLevel = 1;
  var snake, dir, queue, food, alive, timer;

  function randCell() {
    return { x: Math.floor(Math.random() * GRID), y: Math.floor(Math.random() * GRID) };
  }
  function placeFood() {
    var c;
    do { c = randCell(); } while (snake.some(function (s) { return s.x === c.x && s.y === c.y; }));
    food = c;
  }
  function start() {
    snake = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dir = { x: 1, y: 0 };
    queue = [];
    score = 0; speedLevel = 1;
    alive = true;
    placeFood();
    updateHud();
    document.getElementById('over').classList.add('hidden');
    document.getElementById('start').classList.add('hidden');
    clearInterval(timer);
    timer = setInterval(tick, 140);
    draw();
  }
  function updateHud() {
    document.getElementById('score').textContent = score;
    document.getElementById('best').textContent = best;
    document.getElementById('speed').textContent = speedLevel + 'x';
  }
  function tick() {
    if (!alive) return;
    if (queue.length) { dir = queue.shift(); }
    var head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    var hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
    var hitSelf = snake.some(function (s) { return s.x === head.x && s.y === head.y; });
    if (hitWall || hitSelf) { gameOver(); return; }
    snake.unshift(head);
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      if (score > best) best = score;
      if (score % 30 === 0) {
        speedLevel++;
        clearInterval(timer);
        timer = setInterval(tick, Math.max(50, 140 - speedLevel * 12));
      }
      placeFood();
    } else {
      snake.pop();
    }
    updateHud();
    draw();
  }
  function gameOver() {
    alive = false;
    clearInterval(timer);
    document.getElementById('finalScore').textContent = '本局得分：' + score + '（最高 ' + best + '）';
    document.getElementById('over').classList.remove('hidden');
  }
  function draw() {
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#f87171';
    ctx.fillRect(food.x * CELL + 3, food.y * CELL + 3, CELL - 6, CELL - 6);
    snake.forEach(function (s, i) {
      ctx.fillStyle = i === 0 ? '#4ade80' : '#16a34a';
      ctx.fillRect(s.x * CELL + 1, s.y * CELL + 1, CELL - 2, CELL - 2);
    });
  }
  document.addEventListener('keydown', function (e) {
    var k = e.key.toLowerCase();
    var nd = null;
    if (k === 'arrowup' || k === 'w') nd = { x: 0, y: -1 };
    if (k === 'arrowdown' || k === 's') nd = { x: 0, y: 1 };
    if (k === 'arrowleft' || k === 'a') nd = { x: -1, y: 0 };
    if (k === 'arrowright' || k === 'd') nd = { x: 1, y: 0 };
    if (!nd) return;
    e.preventDefault();
    var last = queue.length ? queue[queue.length - 1] : dir;
    if (nd.x === -last.x && nd.y === -last.y) return;
    if (nd.x === last.x && nd.y === last.y) return;
    if (queue.length < 3) queue.push(nd);
  });
  document.getElementById('btnStart').addEventListener('click', start);
  document.getElementById('btnAgain').addEventListener('click', start);
  draw();
})();
</script>
</body>
</html>
`,
  },
  {
    id: 'proj_breakout',
    sellerId: 'usr_seller',
    title: '打砖块 Breakout',
    description: '鼠标/方向键控制挡板，反弹小球击碎全部砖块。三命制，含计分与胜利结算。',
    category: 'game',
    priceCr: 600,
    trialScope: '完整版可玩，全部关卡砖块布局（演示环境不限时）',
    html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>打砖块 Breakout</title>
<style>
  body { margin:0; font-family: system-ui, sans-serif; background:#1e1b2e; color:#e2e8f0; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; }
  h1 { font-size:20px; margin:12px 0 4px; letter-spacing:2px; }
  .hud { display:flex; gap:24px; margin:8px 0 12px; font-size:14px; color:#94a3b8; }
  .hud b { color:#22d3ee; }
  canvas { background:#0d0a1a; border:2px solid #4c1d95; border-radius:8px; cursor:none; }
  .hint { margin-top:10px; font-size:12px; color:#64748b; }
  .overlay { position:fixed; inset:0; background:rgba(10,6,24,.85); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:14px; }
  .overlay.hidden { display:none; }
  button { background:#22d3ee; color:#0f172a; border:0; border-radius:8px; padding:10px 22px; font-size:15px; font-weight:700; cursor:pointer; }
  button:hover { background:#67e8f9; }
  .overlay p { margin:0; }
</style>
</head>
<body>
<h1>🧱 打砖块 Breakout</h1>
<div class="hud"><span>分数 <b id="score">0</b></span><span>生命 <b id="lives">3</b></span></div>
<canvas id="game" width="480" height="340"></canvas>
<div class="hint">鼠标移动 / 方向键控制挡板 · 击碎全部砖块获胜</div>
<div id="start" class="overlay"><p>🧱 准备好了吗？</p><button id="btnStart">开始游戏</button></div>
<div id="over" class="overlay hidden"><p id="msg">游戏结束</p><p id="final"></p><button id="btnAgain">再来一局</button></div>
<script>
(function () {
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  var paddle = { w: 84, h: 12, x: W / 2 - 42, y: H - 22 };
  var ball = { r: 6, x: W / 2, y: H - 34, vx: 3, vy: -3.4 };
  var bricks = [];
  var ROWS = 5, COLS = 8, bw = 52, bh = 18, pad = 8, top = 44;
  var score = 0, lives = 3, running = false, anim = null;
  var colors = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee'];
  var keys = { left: false, right: false };

  function buildBricks() {
    bricks = [];
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        bricks.push({ x: pad + c * (bw + 4), y: top + r * (bh + 4), w: bw, h: bh, color: colors[r], alive: true });
      }
    }
  }
  function start() {
    buildBricks();
    ball.x = W / 2; ball.y = H - 34; ball.vx = 3; ball.vy = -3.4;
    score = 0; lives = 3; running = true;
    document.getElementById('over').classList.add('hidden');
    document.getElementById('start').classList.add('hidden');
    updateHud();
    cancelAnimationFrame(anim);
    loop();
  }
  function updateHud() {
    document.getElementById('score').textContent = score;
    document.getElementById('lives').textContent = lives;
  }
  function end(msg) {
    running = false;
    cancelAnimationFrame(anim);
    document.getElementById('msg').textContent = msg;
    document.getElementById('final').textContent = '本局得分：' + score;
    document.getElementById('over').classList.remove('hidden');
  }
  function loop() {
    if (!running) return;
    if (keys.left) paddle.x -= 6;
    if (keys.right) paddle.x += 6;
    paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));
    ball.x += ball.vx;
    ball.y += ball.vy;
    if (ball.x < ball.r || ball.x > W - ball.r) ball.vx = -ball.vx;
    if (ball.y < ball.r) ball.vy = -ball.vy;
    if (ball.y > H - ball.r) {
      lives--;
      updateHud();
      if (lives <= 0) { end('💀 生命耗尽'); return; }
      ball.x = W / 2; ball.y = H - 34; ball.vx = 3; ball.vy = -3.4;
    }
    if (ball.vy > 0 && ball.y + ball.r >= paddle.y && ball.y + ball.r <= paddle.y + 10 &&
        ball.x >= paddle.x - ball.r && ball.x <= paddle.x + paddle.w + ball.r) {
      var hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      ball.vy = -Math.abs(ball.vy);
      ball.vx = Math.max(-5.5, Math.min(5.5, hit * 5));
    }
    for (var i = 0; i < bricks.length; i++) {
      var b = bricks[i];
      if (!b.alive) continue;
      if (ball.x + ball.r > b.x && ball.x - ball.r < b.x + b.w &&
          ball.y + ball.r > b.y && ball.y - ball.r < b.y + b.h) {
        b.alive = false;
        score += 10;
        ball.vy = -ball.vy;
        updateHud();
      }
    }
    if (bricks.every(function (b) { return !b.alive; })) { end('🎉 你赢了！'); return; }
    draw();
    anim = requestAnimationFrame(loop);
  }
  function draw() {
    ctx.fillStyle = '#0d0a1a';
    ctx.fillRect(0, 0, W, H);
    bricks.forEach(function (b) {
      if (!b.alive) return;
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    });
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(paddle.x, paddle.y, paddle.w, paddle.h);
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  }
  canvas.addEventListener('mousemove', function (e) {
    var rect = canvas.getBoundingClientRect();
    paddle.x = (e.clientX - rect.left) * (W / rect.width) - paddle.w / 2;
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'ArrowRight') keys.right = true;
  });
  document.addEventListener('keyup', function (e) {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
  });
  document.getElementById('btnStart').addEventListener('click', start);
  document.getElementById('btnAgain').addEventListener('click', start);
  buildBricks();
  draw();
})();
</script>
</body>
</html>
`,
  },
  {
    id: 'proj_markdown',
    sellerId: 'usr_seller',
    title: 'Markdown 预览工具',
    description: '左侧写 Markdown，右侧实时渲染。支持标题/加粗/斜体/行内代码/代码块/列表/引用/链接/分隔线。',
    category: 'tool',
    priceCr: 300,
    trialScope: '完整功能可用，含示例文档（演示环境不限时）',
    html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Markdown 预览工具</title>
<style>
  body { margin:0; font-family: system-ui, sans-serif; background:#0f172a; color:#e2e8f0; height:100vh; display:flex; flex-direction:column; }
  header { padding:10px 16px; background:#1e293b; font-size:15px; font-weight:600; border-bottom:1px solid #334155; }
  main { flex:1; display:flex; min-height:0; }
  textarea { flex:1; resize:none; border:0; outline:none; padding:14px 16px; font:13px/1.7 ui-monospace, SFMono-Regular, Menlo, monospace; background:#0b1120; color:#cbd5e1; }
  .preview { flex:1; overflow:auto; padding:14px 20px; border-left:1px solid #334155; background:#f8fafc; color:#1e293b; }
  .preview h1 { font-size:22px; border-bottom:2px solid #e2e8f0; padding-bottom:6px; }
  .preview h2 { font-size:18px; }
  .preview h3 { font-size:15px; }
  .preview pre { background:#0f172a; color:#e2e8f0; padding:10px 12px; border-radius:8px; overflow:auto; }
  .preview code { font-family: ui-monospace, Menlo, monospace; }
  .preview pre code { background:none; padding:0; }
  .preview :not(pre) > code { background:#e2e8f0; padding:2px 5px; border-radius:4px; font-size:0.9em; }
  .preview blockquote { border-left:4px solid #94a3b8; margin:8px 0; padding:4px 12px; color:#475569; }
  .preview a { color:#2563eb; }
  .preview hr { border:0; border-top:2px dashed #cbd5e1; margin:14px 0; }
  .preview ul, .preview ol { padding-left:24px; }
  .hint { padding:8px 16px; font-size:12px; color:#64748b; border-top:1px solid #1e293b; }
</style>
</head>
<body>
<header>📝 Markdown 预览工具</header>
<main>
  <textarea id="src" spellcheck="false"></textarea>
  <div id="out" class="preview"></div>
</main>
<div class="hint">支持：# 标题 · **加粗** · *斜体* · &#96;行内代码&#96; · &#96;&#96;&#96; 代码块 &#96;&#96;&#96; · - 列表 · &gt; 引用 · [链接](url) · --- 分隔线</div>
<script>
(function () {
  var src = document.getElementById('src');
  var out = document.getElementById('out');
  var BT = String.fromCharCode(96); // 反引号（避免与模板字符串冲突）

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function inline(s) {
    s = s.replace(/\\*\\*([^*]+)\\*\\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\\*([^*]+)\\*(?!\\*)/g, '$1<em>$2</em>');
    s = s.replace(new RegExp(BT + '([^' + BT + ']+)' + BT, 'g'), '<code>$1</code>');
    s = s.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function render(md) {
    var FENCE = BT + BT + BT;
    var lines = md.replace(/\\r\\n/g, '\\n').split('\\n');
    var html = [];
    var i = 0, inCode = false, codeBuf = [], listType = null;
    while (i < lines.length) {
      var line = lines[i];
      if (line.indexOf(FENCE) === 0) {
        if (inCode) {
          html.push('<pre><code>' + esc(codeBuf.join('\\n')) + '</code></pre>');
          codeBuf = [];
          inCode = false;
        } else { inCode = true; }
        i++; continue;
      }
      if (inCode) { codeBuf.push(line); i++; continue; }
      if (/^### /.test(line)) { html.push('<h3>' + inline(esc(line.slice(4))) + '</h3>'); i++; continue; }
      if (/^## /.test(line)) { html.push('<h2>' + inline(esc(line.slice(3))) + '</h2>'); i++; continue; }
      if (/^# /.test(line)) { html.push('<h1>' + inline(esc(line.slice(2))) + '</h1>'); i++; continue; }
      if (/^> /.test(line)) { html.push('<blockquote>' + inline(esc(line.slice(2))) + '</blockquote>'); i++; continue; }
      if (/^---+$/.test(line.trim())) { html.push('<hr>'); i++; continue; }
      if (/^[-*] /.test(line)) {
        if (listType !== 'ul') { if (listType) html.push('</' + listType + '>'); html.push('<ul>'); listType = 'ul'; }
        html.push('<li>' + inline(esc(line.slice(2))) + '</li>'); i++; continue;
      }
      if (/^\\d+\\. /.test(line)) {
        if (listType !== 'ol') { if (listType) html.push('</' + listType + '>'); html.push('<ol>'); listType = 'ol'; }
        html.push('<li>' + inline(esc(line.replace(/^\\d+\\. /, ''))) + '</li>'); i++; continue;
      }
      if (listType) { html.push('</' + listType + '>'); listType = null; }
      if (line.trim() === '') { i++; continue; }
      html.push('<p>' + inline(esc(line)) + '</p>');
      i++;
    }
    if (inCode) html.push('<pre><code>' + esc(codeBuf.join('\\n')) + '</code></pre>');
    if (listType) html.push('</' + listType + '>');
    return html.join('\\n');
  }
  var sample = [
    '# 欢迎使用 Markdown 预览',
    '',
    '输入 **Markdown** 语法，右侧 *实时* 渲染。',
    '',
    '## 示例',
    '',
    '- 支持列表',
    '- 支持 ' + BT + '行内代码' + BT,
    '- 支持 [链接](https://example.com)',
    '',
    '> 引用：所见即所得。',
    '',
    FENCE + 'js',
    'function hello() {',
    '  console.log("hi");',
    '}',
    FENCE,
    '',
    '---',
    '',
    '1. 第一步',
    '2. 第二步'
  ].join('\\n');
  src.value = sample;
  src.addEventListener('input', function () { out.innerHTML = render(src.value); });
  out.innerHTML = render(sample);
})();
</script>
</body>
</html>
`,
  },
  {
    id: 'proj_pixel',
    sellerId: 'usr_seller',
    title: '像素画板 Pixel Board',
    description: '24×24 像素画板：点选颜色涂抹，右键擦除，一键清空，导出 PNG 下载。',
    category: 'art',
    priceCr: 400,
    trialScope: '完整功能可用：绘制/擦除/清空/导出 PNG（演示环境不限时）',
    html: `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>像素画板 Pixel Board</title>
<style>
  body { margin:0; font-family: system-ui, sans-serif; background:#18181b; color:#e4e4e7; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; }
  h1 { font-size:20px; margin:12px 0; letter-spacing:2px; }
  .toolbar { display:flex; align-items:center; gap:10px; margin-bottom:12px; flex-wrap:wrap; justify-content:center; }
  .swatch { width:26px; height:26px; border-radius:6px; cursor:pointer; border:2px solid transparent; }
  .swatch.active { border-color:#fff; transform:scale(1.15); }
  canvas { background:#09090b; border:2px solid #3f3f46; border-radius:8px; image-rendering:pixelated; }
  button { background:#3f3f46; color:#fafafa; border:0; border-radius:8px; padding:8px 14px; font-size:13px; cursor:pointer; }
  button:hover { background:#52525b; }
  button.primary { background:#22c55e; color:#052e16; font-weight:700; }
  input[type=color] { width:34px; height:30px; border:0; background:none; cursor:pointer; }
  .hint { margin-top:10px; font-size:12px; color:#71717a; }
</style>
</head>
<body>
<h1>🎨 像素画板</h1>
<div class="toolbar" id="toolbar"></div>
<canvas id="board" width="384" height="384"></canvas>
<div class="hint">左键绘制 · 右键擦除 · 底部按钮清空 / 导出 PNG</div>
<script>
(function () {
  var N = 24, SIZE = 384 / N;
  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var grid = [];
  for (var i = 0; i < N * N; i++) grid.push(null);
  var palette = ['#000000', '#ffffff', '#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899', '#a16207', '#71717a'];
  var color = palette[4];
  var painting = false;
  var toolbar = document.getElementById('toolbar');
  palette.forEach(function (c) {
    var sw = document.createElement('div');
    sw.className = 'swatch' + (c === color ? ' active' : '');
    sw.style.background = c;
    sw.addEventListener('click', function () {
      color = c;
      document.querySelectorAll('.swatch').forEach(function (s) { s.classList.remove('active'); });
      sw.classList.add('active');
    });
    toolbar.appendChild(sw);
  });
  var custom = document.createElement('input');
  custom.type = 'color';
  custom.value = '#f472b6';
  custom.addEventListener('input', function () {
    color = custom.value;
    document.querySelectorAll('.swatch').forEach(function (s) { s.classList.remove('active'); });
  });
  toolbar.appendChild(custom);

  function idx(x, y) { return y * N + x; }
  function paintAt(e) {
    var rect = canvas.getBoundingClientRect();
    var x = Math.floor((e.clientX - rect.left) * (N / rect.width));
    var y = Math.floor((e.clientY - rect.top) * (N / rect.height));
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    var erase = e.button === 2;
    grid[idx(x, y)] = erase ? null : color;
    draw();
  }
  function draw() {
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (var y = 0; y < N; y++) {
      for (var x = 0; x < N; x++) {
        var c = grid[idx(x, y)];
        if (c) {
          ctx.fillStyle = c;
          ctx.fillRect(x * SIZE, y * SIZE, SIZE, SIZE);
        }
      }
    }
  }
  canvas.addEventListener('mousedown', function (e) {
    e.preventDefault();
    painting = true;
    paintAt(e);
  });
  canvas.addEventListener('mousemove', function (e) { if (painting) paintAt(e); });
  window.addEventListener('mouseup', function () { painting = false; });
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); paintAt(e); });
  document.getElementById('clearBtn').addEventListener('click', function () {
    for (var i = 0; i < grid.length; i++) grid[i] = null;
    draw();
  });
  document.getElementById('saveBtn').addEventListener('click', function () {
    var a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = 'pixel-art.png';
    a.click();
  });
  draw();
})();
</script>
<button id="clearBtn">🗑 清空</button>
<button id="saveBtn" class="primary">⬇ 导出 PNG</button>
</body>
</html>
`,
  },
];

// ---------------------------------------------------------------------------
// 演示需求（open）+ 演示投标（submitted）
// ---------------------------------------------------------------------------

export const DEMO_COMMISSION: DemoCommission = {
  id: 'com_demo_game',
  buyerId: 'usr_buyer',
  title: '帮我做一个课堂小游戏',
  description:
    '面向编程课展示的小游戏，需要可运行、有计分，最好手机也能玩。参考「贪吃蛇 Classic」的风格即可，验收标准见下。',
  budgetMinCr: 1000,
  budgetMaxCr: 3000,
  timelineDays: 7,
  acceptanceCriteria: '1) 可运行 2) 有计分 3) 移动端可用',
  referenceProjectIds: ['proj_snake'],
};

export const DEMO_BIDS: DemoBid[] = [
  {
    id: 'bid_demo_1',
    commissionId: 'com_demo_game',
    contractorId: 'usr_contractor',
    amountCr: 1500,
    proposal: '做过 3 款小游戏，3 天内先交付可玩版本，后续按验收标准迭代。',
  },
  {
    id: 'bid_demo_2',
    commissionId: 'com_demo_game',
    contractorId: 'usr_contractor',
    amountCr: 2200,
    proposal: '优先保证移动端触控体验，含音效与难度曲线，验收期可免费微调。',
  },
];
