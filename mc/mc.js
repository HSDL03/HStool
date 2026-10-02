(function () {
  "use strict";
  function $(id) { return document.getElementById(id); }
  function escHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]; }); }
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast'); if (!el) return;
    el.textContent = msg; el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 1600);
  }
  var storage = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    getJSON: function (k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    setJSON: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  /* ═══ 设备检测 ═══ */
  var hasFine = false, hasCoarse = false;
  if (window.matchMedia) { try { hasFine = matchMedia('(pointer: fine)').matches; hasCoarse = matchMedia('(pointer: coarse)').matches; } catch (e) {} }
  if (!hasFine && !hasCoarse) { hasCoarse = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0); hasFine = !hasCoarse; }
  var isTouchUI = hasCoarse && !hasFine;
  var supportsTouch = hasCoarse || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  /* ═══ Supabase ═══ */
  var SUPABASE_URL = 'https://lxdyrajbsjftduesvosh.supabase.co';
  var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4ZHlyYWpic2pmdGR1ZXN2b3NoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0NzkyMzksImV4cCI6MjEwNjA1NTIzOX0.ZEC7EohRqr0YCxqACBRTVI3-TGNFWUGxq-aH_yqIhig';
  var sbClient = null, supabaseReady = false;
  (function () {
    if (window.supabase && window.supabase.createClient) {
      try {
        sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        supabaseReady = true;
        var st = $('supabaseStatus');
        st.textContent = '☁ 已连接'; st.classList.add('show');
        setTimeout(function () { st.classList.remove('show'); }, 3000);
      } catch (e) { console.error(e); }
    }
  })();

  var appState = 'mainMenu', prevScreen = 'mainMenu';
  var gameMode = 'creative', difficulty = 'normal', worldType = 'default';
  var pointerLocked = false, currentWorld = null, currentRoom = null;
  var isMultiplayer = false, flying = false, lastSpaceTap = 0;
  var inventoryOpen = false, chatOpen = false;
  var myPlayerName = storage.get('mc3d_player_name', '玩家' + Math.floor(Math.random() * 1000));

  var DEFAULT_SETTINGS = { fov: 75, brightness: 50, renderDistance: 4, viewBobbing: 1, sensitivity: 2.2, invertMouse: 0, autoJump: 0, maxFramerate: 60, showSun: 1, showClouds: 1 };
  var settings = Object.assign({}, DEFAULT_SETTINGS);
  (function () { var s = storage.getJSON('mc3d_settings', null); if (s) Object.assign(settings, s); })();
  function saveSettings() { storage.setJSON('mc3d_settings', settings); }

  var worlds = storage.getJSON('mc3d_worlds', []);
  if (!Array.isArray(worlds)) worlds = [];
  function saveWorlds() { storage.setJSON('mc3d_worlds', worlds); }

  /* ═══ Y 轴 ═══ */
  var WORLD_MIN_Y = -64, WORLD_MAX_Y = 320;
  var WORLD_HEIGHT = WORLD_MAX_Y - WORLD_MIN_Y;   // 384
  var SEA_LEVEL = 63, DEEPSLATE_Y = 0;

  var CHUNK_SIZE = 16;
  var LOAD_RADIUS = Math.max(1, Math.min(16, Math.round(settings.renderDistance / 2)));
  var EYE_HEIGHT = 1.62, PLAYER_HALF = 0.3, PLAYER_HEIGHT = 1.8;
  var GRAVITY = 30, JUMP_VELOCITY = 9.2, WALK_SPEED = 4.5, RUN_SPEED = 7.5, FLY_SPEED = 11;
  var REACH = 6, SWING_DURATION = 0.30;
  var MAX_CHUNK_REBUILDS_PER_FRAME = 3;
  var BREAK_COOLDOWN = 0.40, PLACE_COOLDOWN = 0.45;
  var CULL_DISTANCE_MUL = 1.5, VISIBILITY_UPDATE_INTERVAL = 0.35;

  /* ═══ 数据 ═══ */
  var GAME_DATA = window.GAME_DATA || null;
  var BLOCKS = {}, ALL_BLOCK_IDS = [], RECIPES = [], BIOMES = [], ORE_CONFIG = {};
  function initData() {
    var fb = {
      1:{name:'草方块',top:0,side:1,bottom:2},2:{name:'泥土',top:2,side:2,bottom:2},
      3:{name:'石头',top:3,side:3,bottom:3},4:{name:'橡木',top:5,side:4,bottom:5},
      5:{name:'橡树叶',top:6,side:6,bottom:6},6:{name:'沙子',top:7,side:7,bottom:7},
      7:{name:'基岩',top:8,side:8,bottom:8},8:{name:'木板',top:9,side:9,bottom:9},
      9:{name:'砖块',top:10,side:10,bottom:10},10:{name:'雪块',top:11,side:12,bottom:2},
      11:{name:'砂岩',top:13,side:14,bottom:13},12:{name:'仙人掌',top:16,side:15,bottom:16},
      13:{name:'云杉木',top:18,side:17,bottom:18},14:{name:'云杉叶',top:19,side:19,bottom:19},
      15:{name:'冰',top:20,side:20,bottom:20},16:{name:'深板岩',top:21,side:21,bottom:21},
      17:{name:'煤矿石',top:22,side:22,bottom:22},18:{name:'铁矿石',top:23,side:23,bottom:23},
      19:{name:'金矿石',top:24,side:24,bottom:24},20:{name:'钻石矿石',top:25,side:25,bottom:25},
      21:{name:'青金石矿石',top:26,side:26,bottom:26},22:{name:'深板岩煤矿石',top:27,side:27,bottom:27},
      23:{name:'深板岩铁矿石',top:28,side:28,bottom:28},24:{name:'深板岩金矿石',top:29,side:29,bottom:29},
      25:{name:'深板岩钻石矿石',top:30,side:30,bottom:30},26:{name:'深板岩青金石矿石',top:31,side:31,bottom:31}
    };
    var rawBlocks = (GAME_DATA && GAME_DATA.blocks) ? GAME_DATA.blocks : fb;
    for (var k in rawBlocks) BLOCKS[parseInt(k, 10)] = rawBlocks[k];
    ALL_BLOCK_IDS = [];
    for (var bid in BLOCKS) ALL_BLOCK_IDS.push(parseInt(bid, 10));

    RECIPES = (GAME_DATA && Array.isArray(GAME_DATA.recipes)) ? GAME_DATA.recipes :
      [{ result: 8, count: 4, ingredients: { 4: 1 } },
       { result: 9, count: 4, ingredients: { 2: 1, 3: 1 } },
       { result: 3, count: 1, ingredients: { 2: 4 } }];

    BIOMES = (GAME_DATA && Array.isArray(GAME_DATA.biomes)) ? GAME_DATA.biomes :
      [{name:'平原',color:'#8fd94f'},{name:'森林',color:'#3f9e3a'},{name:'沙漠',color:'#e8d47a'},{name:'雪原',color:'#bfe6ff'},{name:'山地',color:'#b8b8b8'}];

    var oresRaw = (GAME_DATA && GAME_DATA.ores) ? GAME_DATA.ores : {
      17: { veinsPerChunk: 20, veinSize: 17, minY: 0,   maxY: 320, deepBlock: 22 },
      18: { veinsPerChunk: 20, veinSize: 9,  minY: -64, maxY: 80,  deepBlock: 23 },
      19: { veinsPerChunk: 4,  veinSize: 9,  minY: -64, maxY: 32,  deepBlock: 24 },
      20: { veinsPerChunk: 1,  veinSize: 8,  minY: -64, maxY: 16,  deepBlock: 25 },
      21: { veinsPerChunk: 1,  veinSize: 7,  minY: -64, maxY: 32,  deepBlock: 26 }
    };
    for (var ok in oresRaw) ORE_CONFIG[parseInt(ok, 10)] = oresRaw[ok];
    if (GAME_DATA && typeof GAME_DATA.deepslateY === 'number') DEEPSLATE_Y = GAME_DATA.deepslateY;
  }

  /* ═══ 纹理图集 ═══ */
  var ATLAS_COLS = 8, ATLAS_ROWS = 4, TILE_PX = 16;
  var atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_COLS * TILE_PX;
  atlasCanvas.height = ATLAS_ROWS * TILE_PX;
  var atlasCtx = atlasCanvas.getContext('2d');
  function c255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v | 0); }
  function nf(g, r, gr, b, v) {
    for (var y = 0; y < TILE_PX; y++) for (var x = 0; x < TILE_PX; x++) {
      var d = (Math.random() - 0.5) * v;
      g.fillStyle = 'rgb(' + c255(r+d) + ',' + c255(gr+d) + ',' + c255(b+d) + ')';
      g.fillRect(x, y, 1, 1);
    }
  }
  function pxf(g, x, y, w, h, c) { g.fillStyle = c; g.fillRect(x, y, w, h); }
  function dt(ti, fn) {
    var c = ti % ATLAS_COLS, r = Math.floor(ti / ATLAS_COLS);
    atlasCtx.save(); atlasCtx.translate(c*TILE_PX, r*TILE_PX);
    atlasCtx.beginPath(); atlasCtx.rect(0,0,TILE_PX,TILE_PX); atlasCtx.clip();
    fn(atlasCtx); atlasCtx.restore();
  }
  function buildAtlas() {
    dt(0, function(g){ nf(g,106,170,64,34); for(var i=0;i<14;i++)pxf(g,(Math.random()*15)|0,(Math.random()*15)|0,1,1,'rgba(60,120,35,0.55)'); });
    dt(1, function(g){ nf(g,134,96,67,32); for(var x=0;x<TILE_PX;x++){var h=3+((Math.random()*3)|0);for(var y=0;y<h;y++){var d=(Math.random()-0.5)*34;g.fillStyle='rgb('+c255(106+d)+','+c255(170+d)+','+c255(64+d)+')';g.fillRect(x,y,1,1);}} });
    dt(2, function(g){ nf(g,134,96,67,34); });
    dt(3, function(g){ nf(g,128,128,128,26); for(var i=0;i<10;i++)pxf(g,(Math.random()*14)|0,(Math.random()*14)|0,2,1,'rgba(90,90,90,0.55)'); });
    dt(4, function(g){ nf(g,160,120,75,18); for(var i=0;i<5;i++){var x=1+((Math.random()*14)|0);pxf(g,x,0,1+((Math.random()*2)|0),16,'rgba(112,82,48,0.65)');} });
    dt(5, function(g){ nf(g,190,150,100,14); g.strokeStyle='rgba(130,96,56,0.75)';g.lineWidth=1; for(var r=2;r<=7;r+=2){g.beginPath();g.arc(8,8,r,0,Math.PI*2);g.stroke();} });
    dt(6, function(g){ nf(g,70,138,55,46); for(var i=0;i<22;i++)pxf(g,(Math.random()*16)|0,(Math.random()*16)|0,1,1,'rgba(30,72,24,0.55)'); });
    dt(7, function(g){ nf(g,220,205,140,22); });
    dt(8, function(g){ nf(g,78,78,78,40); for(var i=0;i<14;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,2,'rgba(30,30,30,0.8)'); });
    dt(9, function(g){ nf(g,180,140,85,16); pxf(g,0,5,16,1,'rgba(120,88,50,0.85)');pxf(g,0,11,16,1,'rgba(120,88,50,0.85)'); });
    dt(10, function(g){ nf(g,150,62,46,22); var m='rgba(196,186,176,0.9)'; pxf(g,0,0,16,1,m);pxf(g,0,7,16,1,m);pxf(g,0,15,16,1,m); });
    dt(11, function(g){ nf(g,245,248,252,12); });
    dt(12, function(g){ nf(g,134,96,67,30); for(var x=0;x<TILE_PX;x++){var h=4+((Math.random()*3)|0);for(var y=0;y<h;y++){g.fillStyle='rgb(245,248,252)';g.fillRect(x,y,1,1);}} });
    dt(13, function(g){ nf(g,220,205,155,16); });
    dt(14, function(g){ nf(g,214,198,148,14); for(var y=2;y<16;y+=4)pxf(g,0,y,16,1,'rgba(178,162,112,0.55)'); });
    dt(15, function(g){ nf(g,60,128,55,22); });
    dt(16, function(g){ nf(g,68,140,60,20); });
    dt(17, function(g){ nf(g,96,68,40,18); });
    dt(18, function(g){ nf(g,118,84,50,16); });
    dt(19, function(g){ nf(g,42,96,52,40); });
    dt(20, function(g){ nf(g,168,212,240,18); });
    // ★ 21 深板岩
    dt(21, function(g){ nf(g,60,60,66,20); for(var i=0;i<14;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,2,'rgba(35,35,40,0.8)'); });
    // ★ 22-26 石头矿石
    dt(22, function(g){ nf(g,128,128,128,26); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#1a1a1a'); });
    dt(23, function(g){ nf(g,128,128,128,26); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#d8a878'); });
    dt(24, function(g){ nf(g,128,128,128,26); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#ffd633'); });
    dt(25, function(g){ nf(g,128,128,128,26); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#5decf5'); });
    dt(26, function(g){ nf(g,128,128,128,26); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#2c47b8'); });
    // ★ 27-31 深板岩矿石
    dt(27, function(g){ nf(g,60,60,66,20); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#1a1a1a'); });
    dt(28, function(g){ nf(g,60,60,66,20); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#d8a878'); });
    dt(29, function(g){ nf(g,60,60,66,20); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#ffd633'); });
    dt(30, function(g){ nf(g,60,60,66,20); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#5decf5'); });
    dt(31, function(g){ nf(g,60,60,66,20); for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#2c47b8'); });
  }

  /* ═══ 噪声 ═══ */
  var WORLD_SEED = 12345678;
  function sh(x, y, s) {
    var h = Math.imul(x|0, 0x27d4eb2d); h ^= Math.imul(y|0, 0x165667b1);
    h ^= Math.imul((WORLD_SEED + (s|0))|0, 0x9e3779b9);
    h = Math.imul(h ^ (h>>>15), 0x85ebca6b); h = Math.imul(h ^ (h>>>13), 0xc2b2ae35);
    h ^= h >>> 16; return (h >>> 0) / 4294967296;
  }
  function sh3(x, y, z, s) {
    var h = Math.imul(x|0, 0x27d4eb2d); h ^= Math.imul(y|0, 0x165667b1);
    h ^= Math.imul(z|0, 0x9e3779b9); h ^= Math.imul((WORLD_SEED + (s|0))|0, 0x85ebca6b);
    h = Math.imul(h ^ (h>>>15), 0xc2b2ae35); h = Math.imul(h ^ (h>>>13), 0x85ebca6b);
    h ^= h >>> 16; return (h >>> 0) / 4294967296;
  }
  function sn(x, y, s) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x-x0, fy = y-y0;
    var sx = fx*fx*(3-2*fx), sy = fy*fy*(3-2*fy);
    var n00 = sh(x0,y0,s), n10 = sh(x0+1,y0,s);
    var n01 = sh(x0,y0+1,s), n11 = sh(x0+1,y0+1,s);
    var a = n00*(1-sx)+n10*sx, b = n01*(1-sx)+n11*sx;
    return a*(1-sy)+b*sy;
  }
  function fbm(x, y, s) { return sn(x,y,s)*0.5 + sn(x*2,y*2,s+1)*0.25 + sn(x*4,y*4,s+2)*0.125 + sn(x*8,y*8,s+3)*0.0625; }

  var BP = 0, BF = 1, BD = 2, BS = 3, BM = 4;
  function tp(wx, wz) {
    var bs = (worldType === 'largeBiomes') ? 0.25 : 1, hm = (worldType === 'amplified') ? 2.0 : 1.0;
    var bn = fbm(wx*0.055*bs, wz*0.055*bs, 10), mf = fbm(wx*0.035*bs+200, wz*0.035*bs+200, 110);
    var t = fbm(wx*0.013*bs+700, wz*0.013*bs+700, 210), hu = fbm(wx*0.016*bs+300, wz*0.016*bs+300, 310);
    var bh = SEA_LEVEL + bn*18*hm, mb = 0;
    if (mf > 0.54) mb = (mf - 0.54) * 130 * hm;
    var h = Math.floor(bh + mb);
    if (h < WORLD_MIN_Y + 4) h = WORLD_MIN_Y + 4;
    if (h > WORLD_MAX_Y - 6) h = WORLD_MAX_Y - 6;
    var biome;
    if (mf > 0.60 && h > SEA_LEVEL+40) biome = BM;
    else if (t > 0.53 && hu < 0.45) biome = BD;
    else if (t < 0.40) biome = BS;
    else if (hu > 0.53) biome = BF;
    else biome = BP;
    return { height: h, biome: biome };
  }

  /* ═══ 区块存储 ═══ */
  var chunkData = new Map(), chunkMeshes = new Map(), dirtyChunks = new Set(), loadingIndicators = new Map();
  function ck(cx, cz) { return cx + ',' + cz; }
  function yIdx(wy) { return wy - WORLD_MIN_Y; }
  function getBlock(wx, wy, wz) {
    if (wy < WORLD_MIN_Y || wy >= WORLD_MAX_Y) return 0;
    var cx = Math.floor(wx/CHUNK_SIZE), cz = Math.floor(wz/CHUNK_SIZE);
    var d = chunkData.get(ck(cx, cz)); if (!d) return 0;
    var lx = wx - cx*CHUNK_SIZE, lz = wz - cz*CHUNK_SIZE;
    return d[(yIdx(wy)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx];
  }
  function setBlock(wx, wy, wz, v) {
    if (wy < WORLD_MIN_Y || wy >= WORLD_MAX_Y) return;
    var cx = Math.floor(wx/CHUNK_SIZE), cz = Math.floor(wz/CHUNK_SIZE);
    var d = chunkData.get(ck(cx, cz)); if (!d) return;
    var lx = wx - cx*CHUNK_SIZE, lz = wz - cz*CHUNK_SIZE;
    d[(yIdx(wy)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx] = v;
  }
  function isSolid(wx, wy, wz) {
    if (wy < WORLD_MIN_Y) return true;
    if (wy >= WORLD_MAX_Y) return false;
    return getBlock(wx, wy, wz) !== 0;
  }
  function isOcc(wx, wy, wz) {
    if (wy < WORLD_MIN_Y || wy >= WORLD_MAX_Y) return false;
    return getBlock(wx, wy, wz) !== 0;
  }

  /* ═══ 区块生成 ═══ */
  function genChunk(cx, cz) {
    var d = new Uint8Array(CHUNK_SIZE * WORLD_HEIGHT * CHUNK_SIZE);
    var bx = cx*CHUNK_SIZE, bz = cz*CHUNK_SIZE;
    if (worldType === 'flat') {
      for (var lz = 0; lz < CHUNK_SIZE; lz++) for (var lx = 0; lx < CHUNK_SIZE; lx++) {
        d[(yIdx(WORLD_MIN_Y)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx] = 7;
        d[(yIdx(WORLD_MIN_Y+1)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx] = 2;
        d[(yIdx(WORLD_MIN_Y+2)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx] = 2;
        d[(yIdx(WORLD_MIN_Y+3)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx] = 1;
      }
      return d;
    }
    // 1) 基础地形
    for (var z = 0; z < CHUNK_SIZE; z++) for (var x = 0; x < CHUNK_SIZE; x++) {
      var wx = bx+x, wz = bz+z, p = tp(wx, wz), h = p.height, biome = p.biome;
      for (var y = WORLD_MIN_Y; y <= h; y++) {
        var b;
        if (y <= WORLD_MIN_Y) b = 7;
        else if (y <= WORLD_MIN_Y + 4) b = sh(wx,y,wz) < 0.5 ? 7 : 3;
        else if (y < DEEPSLATE_Y) b = 16;
        else if (y < h-4) b = (biome === BD) ? 11 : 3;
        else if (y < h) {
          switch (biome) { case BD: b=6;break; case BS: b=2;break; case BM: b=3;break; default: b=2; }
        } else {
          var lowland = h <= SEA_LEVEL;
          if (lowland) b = (biome === BS) ? 10 : 6;
          else {
            switch (biome) {
              case BD: b=6; break;
              case BS: b=10; break;
              case BM:
                if (h > SEA_LEVEL+40) b = 10;
                else if (h > SEA_LEVEL+20) b = 3;
                else b = 1;
                break;
              default: b = 1;
            }
          }
        }
        if (b !== 0) d[(yIdx(y)*CHUNK_SIZE+z)*CHUNK_SIZE+x] = b;
      }
    }
    // 2) ★ 矿脉生成
    for (var oidStr in ORE_CONFIG) {
      var oid = parseInt(oidStr, 10), cfg = ORE_CONFIG[oidStr];
      for (var v = 0; v < cfg.veinsPerChunk; v++) {
        var vx = bx + Math.floor(sh(cx*31+v, cz*17+oid, 100) * CHUNK_SIZE);
        var vz = bz + Math.floor(sh(cx*13+v, cz*29+oid, 200) * CHUNK_SIZE);
        var vy = cfg.minY + Math.floor(sh(cx+v, cz+oid, 300) * (cfg.maxY - cfg.minY));
        for (var k = 0; k < cfg.veinSize; k++) {
          var ox = vx + Math.floor((sh(vx+k, vz, 400) - 0.5) * 5);
          var oy = vy + Math.floor((sh(vx, vy+k, 500) - 0.5) * 5);
          var oz = vz + Math.floor((sh(vx, vz+k, 600) - 0.5) * 5);
          if (ox < bx || ox >= bx+CHUNK_SIZE || oz < bz || oz >= bz+CHUNK_SIZE) continue;
          if (oy < WORLD_MIN_Y || oy >= WORLD_MAX_Y) continue;
          var lx2 = ox-bx, lz2 = oz-bz, ay = yIdx(oy);
          var cur = d[(ay*CHUNK_SIZE+lz2)*CHUNK_SIZE+lx2];
          if (cur === 3) d[(ay*CHUNK_SIZE+lz2)*CHUNK_SIZE+lx2] = oid;
          else if (cur === 16 && cfg.deepBlock) d[(ay*CHUNK_SIZE+lz2)*CHUNK_SIZE+lx2] = cfg.deepBlock;
        }
      }
    }
    // 3) ★ 洞穴
    for (var cy = WORLD_MIN_Y+6; cy < 60; cy++) {
      for (var cz2 = 0; cz2 < CHUNK_SIZE; cz2++) for (var cx2 = 0; cx2 < CHUNK_SIZE; cx2++) {
        var gwx = bx+cx2, gwz = bz+cz2;
        var n1 = sh3(Math.floor(gwx/8), Math.floor(cy/8), Math.floor(gwz/8), 800);
        var n2 = sh3(gwx, cy, gwz, 700);
        if (n1 > 0.72 && n2 > 0.5) d[(yIdx(cy)*CHUNK_SIZE+cz2)*CHUNK_SIZE+cx2] = 0;
      }
    }
    // 4) 装饰
    var PAD = 4;
    for (var wz2 = bz-PAD; wz2 < bz+CHUNK_SIZE+PAD; wz2++)
      for (var wx2 = bx-PAD; wx2 < bx+CHUNK_SIZE+PAD; wx2++)
        tryDec(wx2, wz2, d, cx, cz);
    return d;
  }
  function hasTree(wx, wz) {
    var p = tp(wx, wz);
    if (p.height <= SEA_LEVEL) return false;
    var r = sh(wx, wz, 500);
    switch (p.biome) {
      case BP: return r < 0.010; case BF: return r < 0.090; case BD: return r < 0.022;
      case BS: return r < 0.045; case BM: return p.height < SEA_LEVEL+50 && r < 0.018;
    }
    return false;
  }
  function hasEarlier(wx, wz) {
    for (var dz = -1; dz <= 1; dz++) for (var dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      if (dx < 0 || (dx === 0 && dz < 0)) if (hasTree(wx+dx, wz+dz)) return true;
    }
    return false;
  }
  function tryDec(wx, wz, d, cx, cz) {
    if (!hasTree(wx, wz)) return;
    if (hasEarlier(wx, wz)) return;
    var p = tp(wx, wz), gy = p.height;
    if (p.biome === BD) plCactus(wx, gy, wz, d, cx, cz);
    else if (p.biome === BS || p.biome === BM) plSpruce(wx, gy, wz, d, cx, cz);
    else plOak(wx, gy, wz, d, cx, cz);
  }
  function sl(d, cx, cz, wx, wy, wz, v) {
    if (wy < WORLD_MIN_Y || wy >= WORLD_MAX_Y) return;
    var lx = wx-cx*CHUNK_SIZE, lz = wz-cz*CHUNK_SIZE;
    if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) return;
    d[(yIdx(wy)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx] = v;
  }
  function plOak(wx, gy, wz, d, cx, cz) {
    var th = 4 + Math.floor(sh(wx,wz,1000)*3), tt = gy+th;
    for (var y = gy+1; y <= tt; y++) sl(d,cx,cz,wx,y,wz,4);
    var layers = [{y:tt-1,r:2},{y:tt,r:2},{y:tt+1,r:1}];
    for (var L = 0; L < layers.length; L++) {
      var layer = layers[L], r = layer.r;
      for (var dx = -r; dx <= r; dx++) for (var dz = -r; dz <= r; dz++) {
        if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
        sl(d,cx,cz,wx+dx,layer.y,wz+dz,5);
      }
    }
  }
  function plSpruce(wx, gy, wz, d, cx, cz) {
    var th = 5 + Math.floor(sh(wx,wz,1100)*3), tt = gy+th;
    for (var y = gy+1; y <= tt; y++) sl(d,cx,cz,wx,y,wz,13);
    sl(d,cx,cz,wx,tt+1,wz,14);
    var pr = [0,1,1,2,2,3,3];
    for (var i = 0; i < pr.length; i++) {
      var yy = tt-i; if (yy <= gy) break;
      var r = pr[i]; if (r === 0) continue;
      for (var dx = -r; dx <= r; dx++) for (var dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r) continue;
        sl(d,cx,cz,wx+dx,yy,wz+dz,14);
      }
    }
  }
  function plCactus(wx, gy, wz, d, cx, cz) {
    var h = 1 + Math.floor(sh(wx,wz,1200)*3);
    for (var i = 1; i <= h; i++) sl(d,cx,cz,wx,gy+i,wz,12);
  }

  /* ═══ 面 & AO ═══ */
  var FACES = [
    { dir:[1,0,0],  corners:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]], uvs:[[0,0],[0,1],[1,1],[1,0]] },
    { dir:[-1,0,0], corners:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]], uvs:[[0,0],[0,1],[1,1],[1,0]] },
    { dir:[0,1,0],  corners:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]], uvs:[[0,0],[1,0],[1,1],[0,1]] },
    { dir:[0,-1,0], corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]], uvs:[[0,0],[1,0],[1,1],[0,1]] },
    { dir:[0,0,1],  corners:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]], uvs:[[0,0],[0,1],[1,1],[1,0]] },
    { dir:[0,0,-1], corners:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]], uvs:[[0,0],[0,1],[1,1],[1,0]] }
  ];
  function faceAO(x, y, z, fi) {
    var f = FACES[fi], n = f.dir;
    var ax=0,ay=0,az=0,bx=0,by=0,bz=0;
    if (n[0]!==0){ay=1;bz=1;} else if (n[1]!==0){ax=1;bz=1;} else {ax=1;by=1;}
    var ox=x+n[0],oy=y+n[1],oz=z+n[2],out=[0,0,0,0];
    for (var i = 0; i < 4; i++) {
      var c = f.corners[i], dirA, dirB;
      if (n[0]!==0){dirA=c[1]===0?-1:1;dirB=c[2]===0?-1:1;}
      else if (n[1]!==0){dirA=c[0]===0?-1:1;dirB=c[2]===0?-1:1;}
      else {dirA=c[0]===0?-1:1;dirB=c[1]===0?-1:1;}
      var s1x=ox+ax*dirA,s1y=oy+ay*dirA,s1z=oz+az*dirA;
      var s2x=ox+bx*dirB,s2y=oy+by*dirB,s2z=oz+bz*dirB;
      var ccx=s1x+bx*dirB,ccy=s1y+by*dirB,ccz=s1z+bz*dirB;
      var a1=isOcc(s1x,s1y,s1z)?1:0,a2=isOcc(s2x,s2y,s2z)?1:0,ac=isOcc(ccx,ccy,ccz)?1:0;
      out[i]=(a1&&a2)?0:(3-(a1+a2+ac));
    }
    return out;
  }
  function aoL(ao) { return 0.48 + (ao/3)*0.52; }

  /* ═══ Three.js ═══ */
  var scene, camera, renderer, atlasTexture, blockMaterial;
  var hemiLight, sunLight, fillLight, ambientLight, sunMesh, sunGlow, cloudPlane;
  var highlightMesh, handPivot, handBasePos, handBaseRot;
  function initThree() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x9fd4f0, 22, 58);
    camera = new THREE.PerspectiveCamera(settings.fov, window.innerWidth/window.innerHeight, 0.05, 500);
    camera.rotation.order = 'YXZ'; scene.add(camera);
    renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.id = 'game3d';
    document.body.insertBefore(renderer.domElement, document.body.firstChild);
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth/window.innerHeight;
      camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight);
    });
    hemiLight = new THREE.HemisphereLight(0xe8f4ff, 0x6a5a48, 0.90); scene.add(hemiLight);
    sunLight = new THREE.DirectionalLight(0xfff5e0, 0.55); sunLight.position.set(0.7,1.2,0.45); scene.add(sunLight);
    fillLight = new THREE.DirectionalLight(0xbfd4ff, 0.16); fillLight.position.set(-0.6,0.4,-0.7); scene.add(fillLight);
    ambientLight = new THREE.AmbientLight(0xffffff, 0.12); scene.add(ambientLight);
    sunMesh = new THREE.Mesh(new THREE.SphereGeometry(6,16,16), new THREE.MeshBasicMaterial({ color: 0xffdd66, fog: false }));
    sunMesh.visible = false; scene.add(sunMesh);
    sunGlow = new THREE.Mesh(new THREE.SphereGeometry(12,16,16), new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.3, depthWrite: false, fog: false }));
    sunGlow.visible = false; scene.add(sunGlow);
    (function(){
      var c = document.createElement('canvas'); c.width = 512; c.height = 512;
      var g = c.getContext('2d');
      for (var i = 0; i < 80; i++) {
        var x = Math.random()*512, y = Math.random()*512, r = 15+Math.random()*35;
        var grad = g.createRadialGradient(x,y,0,x,y,r);
        grad.addColorStop(0,'rgba(255,255,255,0.95)');
        grad.addColorStop(0.6,'rgba(255,255,255,0.5)');
        grad.addColorStop(1,'rgba(255,255,255,0)');
        g.fillStyle = grad; g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
      }
      var tex = new THREE.CanvasTexture(c);
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(3,3);
      cloudPlane = new THREE.Mesh(new THREE.PlaneGeometry(400,400),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      cloudPlane.rotation.x = -Math.PI/2;
      cloudPlane.position.y = WORLD_MAX_Y - 10;
      cloudPlane.visible = false; scene.add(cloudPlane);
    })();
    var skinMat = new THREE.MeshLambertMaterial({ color: 0xe8b48c });
    var shirtMat = new THREE.MeshLambertMaterial({ color: 0x2e9cc9 });
    handPivot = new THREE.Group(); handPivot.position.set(0.34,-0.30,-0.30); camera.add(handPivot);
    var handArm = new THREE.Mesh(new THREE.BoxGeometry(0.13,0.13,0.52), shirtMat); handArm.position.set(0,0,-0.26); handPivot.add(handArm);
    var handPalm = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.16,0.18), skinMat); handPalm.position.set(0,0,-0.60); handPivot.add(handPalm);
    var thumb = new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.10), skinMat); thumb.position.set(0.07,0.04,-0.58); handPivot.add(thumb);
    handBasePos = { x: 0.34, y: -0.30, z: -0.30 };
    handBaseRot = { x: 0.14, y: -0.06, z: 0 };
    highlightMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.004,1.004,1.004),
      new THREE.MeshBasicMaterial({ color: 0x000000, wireframe: true, transparent: true, opacity: 0.45 })
    );
    highlightMesh.visible = false; scene.add(highlightMesh);
    atlasTexture = new THREE.CanvasTexture(atlasCanvas);
    atlasTexture.magFilter = THREE.NearestFilter; atlasTexture.minFilter = THREE.NearestFilter;
    atlasTexture.generateMipmaps = false;
    atlasTexture.wrapS = THREE.ClampToEdgeWrapping; atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
    blockMaterial = new THREE.MeshLambertMaterial({ map: atlasTexture, side: THREE.FrontSide, vertexColors: true });
    applyBrightness();
  }
  function applyBrightness() {
    var b = settings.brightness / 100;
    ambientLight.intensity = 0.05 + b*0.45;
    hemiLight.intensity = 0.65 + b*0.5;
    sunLight.intensity = 0.22 + b*0.36;
    if (cloudPlane) cloudPlane.visible = !!settings.showClouds;
    if (sunMesh) sunMesh.visible = !!settings.showSun;
    if (sunGlow) sunGlow.visible = !!settings.showSun;
  }

  /* ═══ 区块几何 ═══ */
  function buildChunkGeo(cx, cz) {
    var data = chunkData.get(ck(cx, cz));
    if (!data) return null;
    var chXP = chunkData.get(ck(cx+1, cz));
    var chXN = chunkData.get(ck(cx-1, cz));
    var chZP = chunkData.get(ck(cx, cz+1));
    var chZN = chunkData.get(ck(cx, cz-1));
    function getL(lx, ay, lz) {
      if (ay < 0 || ay >= WORLD_HEIGHT) return 0;
      if (lx >= 0 && lx < CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) return data[(ay*CHUNK_SIZE+lz)*CHUNK_SIZE+lx];
      if (lx >= CHUNK_SIZE && lz >= 0 && lz < CHUNK_SIZE) return chXP ? chXP[(ay*CHUNK_SIZE+lz)*CHUNK_SIZE+(lx-CHUNK_SIZE)] : 0;
      if (lx < 0 && lz >= 0 && lz < CHUNK_SIZE) return chXN ? chXN[(ay*CHUNK_SIZE+lz)*CHUNK_SIZE+(lx+CHUNK_SIZE)] : 0;
      if (lz >= CHUNK_SIZE && lx >= 0 && lx < CHUNK_SIZE) return chZP ? chZP[(ay*CHUNK_SIZE+(lz-CHUNK_SIZE))*CHUNK_SIZE+lx] : 0;
      if (lz < 0 && lx >= 0 && lx < CHUNK_SIZE) return chZN ? chZN[(ay*CHUNK_SIZE+(lz+CHUNK_SIZE))*CHUNK_SIZE+lx] : 0;
      return 0;
    }
    var pos = [], nor = [], uvs = [], col = [], idx = [], vc = 0;
    var invC = 1/ATLAS_COLS, invR = 1/ATLAS_ROWS, rowOff = ATLAS_ROWS - 1;
    var bx = cx*CHUNK_SIZE, bz = cz*CHUNK_SIZE;
    for (var ay = 0; ay < WORLD_HEIGHT; ay++) {
      var wy = ay + WORLD_MIN_Y;
      for (var lz = 0; lz < CHUNK_SIZE; lz++) for (var lx = 0; lx < CHUNK_SIZE; lx++) {
        var b = data[(ay*CHUNK_SIZE+lz)*CHUNK_SIZE+lx];
        if (b === 0) continue;
        var def = BLOCKS[b]; if (!def) continue;
        var nP = getL(lx+1,ay,lz), nN = getL(lx-1,ay,lz);
        var nU = getL(lx,ay+1,lz), nD = getL(lx,ay-1,lz);
        var nQ = getL(lx,ay,lz+1), nB = getL(lx,ay,lz-1);
        if (nP !== 0 && nN !== 0 && nU !== 0 && nD !== 0 && nQ !== 0 && nB !== 0) continue;
        var wx = bx+lx, wz = bz+lz;
        for (var f = 0; f < 6; f++) {
          var solid;
          if (f===0) solid = nP !== 0;
          else if (f===1) solid = nN !== 0;
          else if (f===2) solid = nU !== 0;
          else if (f===3) solid = nD !== 0;
          else if (f===4) solid = nQ !== 0;
          else solid = nB !== 0;
          if (solid) continue;
          var face = FACES[f];
          var tile = (f===2) ? def.top : (f===3) ? def.bottom : def.side;
          var cc = tile % ATLAS_COLS, cr = Math.floor(tile/ATLAS_COLS);
          var ao = faceAO(wx, wy, wz, f);
          var u0 = (cc+face.uvs[0][0])*invC, v0 = (rowOff-cr+face.uvs[0][1])*invR;
          var u1 = (cc+face.uvs[1][0])*invC, v1 = (rowOff-cr+face.uvs[1][1])*invR;
          var u2 = (cc+face.uvs[2][0])*invC, v2 = (rowOff-cr+face.uvs[2][1])*invR;
          var u3 = (cc+face.uvs[3][0])*invC, v3 = (rowOff-cr+face.uvs[3][1])*invR;
          var c0 = face.corners[0], c1 = face.corners[1], c2 = face.corners[2], c3 = face.corners[3];
          pos.push(wx+c0[0],wy+c0[1],wz+c0[2], wx+c1[0],wy+c1[1],wz+c1[2], wx+c2[0],wy+c2[1],wz+c2[2], wx+c3[0],wy+c3[1],wz+c3[2]);
          nor.push(face.dir[0],face.dir[1],face.dir[2], face.dir[0],face.dir[1],face.dir[2], face.dir[0],face.dir[1],face.dir[2], face.dir[0],face.dir[1],face.dir[2]);
          uvs.push(u0,v0, u1,v1, u2,v2, u3,v3);
          var l0 = aoL(ao[0]), l1 = aoL(ao[1]), l2 = aoL(ao[2]), l3 = aoL(ao[3]);
          col.push(l0,l0,l0, l1,l1,l1, l2,l2,l2, l3,l3,l3);
          idx.push(vc,vc+1,vc+2, vc,vc+2,vc+3);
          vc += 4;
        }
      }
    }
    if (vc === 0) return null;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    var IA = vc > 65535 ? Uint32Array : Uint16Array;
    geo.setIndex(new THREE.BufferAttribute(new IA(idx), 1));
    geo.computeBoundingSphere();
    return geo;
  }
  function rebuildChunk(cx, cz) {
    var key = ck(cx, cz);
    var data = chunkData.get(key); if (!data) return;
    var old = chunkMeshes.get(key);
    if (old) { scene.remove(old); old.geometry.dispose(); chunkMeshes.delete(key); }
    var geo = buildChunkGeo(cx, cz);
    if (!geo) return;
    var mesh = new THREE.Mesh(geo, blockMaterial);
    mesh.frustumCulled = true; scene.add(mesh); chunkMeshes.set(key, mesh);
  }
  function createLoadInd(cx, cz) {
    var key = ck(cx, cz); if (loadingIndicators.has(key)) return;
    var geo = new THREE.BoxGeometry(CHUNK_SIZE, WORLD_HEIGHT, CHUNK_SIZE);
    var mat = new THREE.MeshBasicMaterial({ color: 0x8fd94f, wireframe: true, transparent: true, opacity: 0.25, depthWrite: false });
    var mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx*CHUNK_SIZE+CHUNK_SIZE/2, WORLD_MIN_Y+WORLD_HEIGHT/2, cz*CHUNK_SIZE+CHUNK_SIZE/2);
    mesh.renderOrder = 999; scene.add(mesh); loadingIndicators.set(key, mesh);
  }
  function removeLoadInd(cx, cz) {
    var key = ck(cx, cz); var mesh = loadingIndicators.get(key);
    if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); loadingIndicators.delete(key); }
  }
  function updateLoadAnim(now) {
    if (loadingIndicators.size === 0) return;
    var pulse = 0.15 + Math.abs(Math.sin(now*0.003))*0.35;
    loadingIndicators.forEach(function (m) {
      m.material.opacity = pulse;
      var s = 0.98 + Math.sin(now*0.004)*0.02; m.scale.set(s,s,s);
    });
  }
  var lastPCX = null, lastPCZ = null;
  function updateChunks(force, showLoading) {
    var pcx = Math.floor(player.pos.x/CHUNK_SIZE), pcz = Math.floor(player.pos.z/CHUNK_SIZE);
    if (!force && pcx === lastPCX && pcz === lastPCZ) return;
    lastPCX = pcx; lastPCZ = pcz;
    var need = new Set(), newLoaded = [];
    for (var dx = -LOAD_RADIUS; dx < LOAD_RADIUS; dx++) for (var dz = -LOAD_RADIUS; dz < LOAD_RADIUS; dz++) {
      var cx = pcx+dx, cz = pcz+dz, key = ck(cx, cz);
      need.add(key);
      if (!chunkData.has(key)) {
        if (showLoading) createLoadInd(cx, cz);
        chunkData.set(key, genChunk(cx, cz)); newLoaded.push([cx, cz]);
      }
    }
    var unload = [];
    chunkData.forEach(function (_, k) { if (!need.has(k)) unload.push(k); });
    for (var i = 0; i < unload.length; i++) {
      var k = unload[i], parts = k.split(',');
      var cx2 = parseInt(parts[0], 10), cz2 = parseInt(parts[1], 10);
      dirtyChunks.add(ck(cx2+1, cz2)); dirtyChunks.add(ck(cx2-1, cz2));
      dirtyChunks.add(ck(cx2, cz2+1)); dirtyChunks.add(ck(cx2, cz2-1));
      chunkData.delete(k);
      var mesh = chunkMeshes.get(k);
      if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); chunkMeshes.delete(k); }
      removeLoadInd(cx2, cz2);
    }
    for (var j = 0; j < newLoaded.length; j++) {
      var cx3 = newLoaded[j][0], cz3 = newLoaded[j][1];
      dirtyChunks.add(ck(cx3, cz3)); dirtyChunks.add(ck(cx3+1, cz3));
      dirtyChunks.add(ck(cx3-1, cz3)); dirtyChunks.add(ck(cx3, cz3+1));
      dirtyChunks.add(ck(cx3, cz3-1));
    }
  }
  function markDirty(wx, wz) {
    var cx = Math.floor(wx/CHUNK_SIZE), cz = Math.floor(wz/CHUNK_SIZE);
    var lx = wx-cx*CHUNK_SIZE, lz = wz-cz*CHUNK_SIZE;
    dirtyChunks.add(ck(cx, cz));
    if (lx === 0) dirtyChunks.add(ck(cx-1, cz));
    if (lx === CHUNK_SIZE-1) dirtyChunks.add(ck(cx+1, cz));
    if (lz === 0) dirtyChunks.add(ck(cx, cz-1));
    if (lz === CHUNK_SIZE-1) dirtyChunks.add(ck(cx, cz+1));
    if (lx === 0 && lz === 0) dirtyChunks.add(ck(cx-1, cz-1));
    if (lx === 0 && lz === CHUNK_SIZE-1) dirtyChunks.add(ck(cx-1, cz+1));
    if (lx === CHUNK_SIZE-1 && lz === 0) dirtyChunks.add(ck(cx+1, cz-1));
    if (lx === CHUNK_SIZE-1 && lz === CHUNK_SIZE-1) dirtyChunks.add(ck(cx+1, cz+1));
  }
  function processDirty() {
    if (dirtyChunks.size === 0) return;
    var cnt = 0, rem = [];
    dirtyChunks.forEach(function (key) {
      if (cnt >= MAX_CHUNK_REBUILDS_PER_FRAME) return;
      if (!chunkData.has(key)) { rem.push(key); return; }
      var parts = key.split(',');
      var cx = parseInt(parts[0], 10), cz = parseInt(parts[1], 10);
      rebuildChunk(cx, cz);
      removeLoadInd(cx, cz);
      rem.push(key); cnt++;
    });
    for (var i = 0; i < rem.length; i++) dirtyChunks.delete(rem[i]);
  }
  function clearAllChunks() {
    chunkData.clear();
    chunkMeshes.forEach(function (m) { scene.remove(m); m.geometry.dispose(); });
    chunkMeshes.clear(); dirtyChunks.clear();
    loadingIndicators.forEach(function (m) { scene.remove(m); m.geometry.dispose(); });
    loadingIndicators.clear();
    lastPCX = null; lastPCZ = null;
  }
  var visTimer = 0;
  function updateVisibility(dt) {
    visTimer += dt;
    if (visTimer < VISIBILITY_UPDATE_INTERVAL) return;
    visTimer = 0;
    var px = player.pos.x, pz = player.pos.z;
    var maxD = LOAD_RADIUS*CHUNK_SIZE*CULL_DISTANCE_MUL;
    var maxSq = maxD*maxD;
    chunkMeshes.forEach(function (mesh, key) {
      var parts = key.split(',');
      var cx = parseInt(parts[0],10)*CHUNK_SIZE+CHUNK_SIZE/2;
      var cz = parseInt(parts[1],10)*CHUNK_SIZE+CHUNK_SIZE/2;
      var dx = cx-px, dz = cz-pz;
      mesh.visible = (dx*dx + dz*dz) < maxSq;
    });
  }

  /* ═══ 玩家 ═══ */
  var player = {
    pos: { x: 0.5, y: SEA_LEVEL+2, z: 0.5 }, vel: { x: 0, y: 0, z: 0 },
    onGround: false, health: 20, maxHealth: 20,
    hunger: 20, maxHunger: 20, saturation: 5, exhaustion: 0,
    fallStartY: null, regenTimer: 0, hungerTimer: 0
  };
  var yaw = 0, pitch = 0, walkPhase = 0, swingTime = 0, bobPhase = 0;

  function spawnPlayer() {
    var sx = 0, sz = 0;
    var cx = Math.floor(sx/CHUNK_SIZE), cz = Math.floor(sz/CHUNK_SIZE);
    if (!chunkData.has(ck(cx, cz))) chunkData.set(ck(cx, cz), genChunk(cx, cz));
    var sy = WORLD_MAX_Y-1;
    for (var y = WORLD_MAX_Y-1; y >= WORLD_MIN_Y; y--) if (isSolid(sx, y, sz)) { sy = y; break; }
    player.pos.x = sx+0.5; player.pos.y = sy+1.05; player.pos.z = sz+0.5;
    player.vel.x = player.vel.y = player.vel.z = 0;
    player.health = player.maxHealth; player.hunger = player.maxHunger;
    player.fallStartY = null;
    yaw = 0; pitch = -0.10; flying = false;
  }
  function collide(axis, delta) {
    if (delta === 0) return;
    var p = player.pos; p[axis] += delta;
    var minX = Math.floor(p.x-PLAYER_HALF), maxX = Math.floor(p.x+PLAYER_HALF);
    var minY = Math.floor(p.y+0.001), maxY = Math.floor(p.y+PLAYER_HEIGHT-0.001);
    var minZ = Math.floor(p.z-PLAYER_HALF), maxZ = Math.floor(p.z+PLAYER_HALF);
    for (var x = minX; x <= maxX; x++) for (var y = minY; y <= maxY; y++) for (var z = minZ; z <= maxZ; z++) {
      if (!isSolid(x,y,z)) continue;
      if (axis === 'x') { if (delta>0) p.x = x-PLAYER_HALF-0.0001; else p.x = x+1+PLAYER_HALF+0.0001; player.vel.x = 0; }
      else if (axis === 'z') { if (delta>0) p.z = z-PLAYER_HALF-0.0001; else p.z = z+1+PLAYER_HALF+0.0001; player.vel.z = 0; }
      else { if (delta>0) { p.y = y-PLAYER_HEIGHT-0.0001; player.vel.y = 0; } else { p.y = y+1+0.0001; player.vel.y = 0; player.onGround = true; } }
      return;
    }
  }

  /* ═══ 输入 ═══ */
  var keys = {}, mouseHeld = [false, false, false];
  var breakTimer = 0, placeTimer = 0;
  function initInput() {
    window.addEventListener('keydown', function (e) {
      if (chatOpen) {
        if (e.key === 'Escape') { closeChat(); e.preventDefault(); }
        else if (e.key === 'Enter') { sendChat(); e.preventDefault(); }
        return;
      }
      var k = e.key.toLowerCase(); keys[k] = true;
      if (e.code === 'Space') keys[' '] = true;
      if (['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k) >= 0) e.preventDefault();
      if (appState !== 'playing') return;
      if (k === 't' && !inventoryOpen) { openChat(false); e.preventDefault(); return; }
      if (k === '/' && !inventoryOpen) { openChat(true); e.preventDefault(); return; }
      if (k === 'e' && gameMode !== 'spectator') { toggleInv(); return; }
      if (k === 'q' && !inventoryOpen && !chatOpen) { dropSelectedItem(); return; }
      if (k === 'm' && !inventoryOpen) {
        var ms = ['creative','survival','adventure','spectator'];
        setGameMode(ms[(ms.indexOf(gameMode)+1) % ms.length]); return;
      }
      if (e.code === 'Space' && !inventoryOpen && gameMode === 'creative') {
        var now = performance.now();
        if (now - lastSpaceTap < 280) {
          flying = !flying; player.vel.y = 0;
          toast(flying ? '✦ 飞行模式：开启' : '✦ 飞行模式：关闭');
          lastSpaceTap = 0;
        } else lastSpaceTap = now;
      }
      var n = parseInt(k, 10);
      if (!isNaN(n) && n >= 1 && n <= 9 && !inventoryOpen) selectSlot(n-1);
    });
    window.addEventListener('keyup', function (e) {
      var k = e.key.toLowerCase(); keys[k] = false;
      if (e.code === 'Space') keys[' '] = false;
    });
    window.addEventListener('blur', function () {
      for (var k in keys) keys[k] = false;
      mouseHeld[0] = mouseHeld[2] = false;
    });
    renderer.domElement.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    renderer.domElement.addEventListener('mousedown', function (e) {
      if (appState !== 'playing' || inventoryOpen || chatOpen) return;
      e.preventDefault();
      if (e.button === 0) { mouseHeld[0] = true; breakTimer = 0; doBreak(); }
      if (e.button === 2) { mouseHeld[2] = true; placeTimer = 0; doPlace(); }
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button === 0) mouseHeld[0] = false;
      if (e.button === 2) mouseHeld[2] = false;
    });
    window.addEventListener('mousemove', function (e) {
      if (!pointerLocked || appState !== 'playing' || inventoryOpen || chatOpen) return;
      var sens = settings.sensitivity * 0.001;
      yaw -= e.movementX * sens;
      var inv = settings.invertMouse ? -1 : 1;
      pitch -= e.movementY * sens * inv;
      var lim = Math.PI/2 - 0.01;
      if (pitch > lim) pitch = lim; if (pitch < -lim) pitch = -lim;
    });
    window.addEventListener('wheel', function (e) {
      if (appState !== 'playing' || inventoryOpen || chatOpen) return;
      if (gameMode === 'spectator') return;
      var dir = e.deltaY > 0 ? 1 : -1;
      selectSlot(((selectedSlot + dir) % 9 + 9) % 9);
    }, { passive: true });
    document.addEventListener('pointerlockchange', function () {
      pointerLocked = (document.pointerLockElement === renderer.domElement);
      if (!pointerLocked && appState === 'playing' && !inventoryOpen && !chatOpen && hasFine) setAppState('paused');
    });
    // 光标跟随物品
    document.addEventListener('mousemove', function (e) {
      if (cursorItem) {
        var el = $('cursorItem');
        el.style.left = e.clientX + 'px';
        el.style.top = e.clientY + 'px';
      }
    });
  }

  /* ═══ 触屏 ═══ */
  var moveTouchId = null, lookTouchId = null, lookTouchPos = null;
  var touchMoveX = 0, touchMoveY = 0;
  function initTouch() {
    if (!supportsTouch) return;
    var joyEl = $('moveJoystick'), stickEl = $('moveStick');
    if (!joyEl) return;
    var joyCX = 0, joyCY = 0, joyR = 50;
    function updateJoy(cx, cy) {
      var dx = cx-joyCX, dy = cy-joyCY, d = Math.hypot(dx, dy);
      if (d > joyR) { dx = dx/d*joyR; dy = dy/d*joyR; }
      stickEl.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
      touchMoveX = dx/joyR; touchMoveY = dy/joyR;
    }
    joyEl.addEventListener('touchstart', function (e) {
      if (appState !== 'playing' || inventoryOpen) return;
      e.preventDefault();
      var t = e.changedTouches[0], r = joyEl.getBoundingClientRect();
      joyCX = r.left + r.width/2; joyCY = r.top + r.height/2;
      moveTouchId = t.identifier; updateJoy(t.clientX, t.clientY);
    }, { passive: false });
    joyEl.addEventListener('touchmove', function (e) {
      e.preventDefault();
      for (var i = 0; i < e.changedTouches.length; i++)
        if (e.changedTouches[i].identifier === moveTouchId) updateJoy(e.changedTouches[i].clientX, e.changedTouches[i].clientY);
    }, { passive: false });
    joyEl.addEventListener('touchend', function (e) {
      for (var i = 0; i < e.changedTouches.length; i++)
        if (e.changedTouches[i].identifier === moveTouchId) {
          moveTouchId = null; touchMoveX = 0; touchMoveY = 0;
          stickEl.style.transform = 'translate(-50%,-50%)';
        }
    });
    var lookArea = $('mobileLookArea');
    if (lookArea) {
      lookArea.addEventListener('touchstart', function (e) {
        if (appState !== 'playing' || inventoryOpen || lookTouchId !== null) return;
        var t = e.changedTouches[0];
        lookTouchId = t.identifier; lookTouchPos = { x: t.clientX, y: t.clientY };
      }, { passive: false });
      lookArea.addEventListener('touchmove', function (e) {
        if (lookTouchId === null) return;
        for (var i = 0; i < e.changedTouches.length; i++) {
          var t = e.changedTouches[i];
          if (t.identifier === lookTouchId) {
            var dx = t.clientX-lookTouchPos.x, dy = t.clientY-lookTouchPos.y;
            lookTouchPos.x = t.clientX; lookTouchPos.y = t.clientY;
            var sens = settings.sensitivity * 0.0025;
            yaw -= dx*sens; pitch -= dy*sens;
            var lim = Math.PI/2 - 0.01;
            if (pitch > lim) pitch = lim; if (pitch < -lim) pitch = -lim;
          }
        }
        e.preventDefault();
      }, { passive: false });
      lookArea.addEventListener('touchend', function (e) {
        if (lookTouchId === null) return;
        for (var i = 0; i < e.changedTouches.length; i++)
          if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
      });
    }
    function bindHold(id, cb, stop) {
      var el = $(id); if (!el) return;
      el.addEventListener('touchstart', function (e) {
        if (appState !== 'playing' || inventoryOpen) return;
        e.preventDefault(); if (cb) cb();
      }, { passive: false });
      el.addEventListener('touchend', function (e) { e.preventDefault(); if (stop) stop(); }, { passive: false });
      el.addEventListener('touchcancel', function (e) { e.preventDefault(); if (stop) stop(); }, { passive: false });
    }
    bindHold('mBreakBtn', function () { mouseHeld[0] = true; breakTimer = 0; doBreak(); }, function () { mouseHeld[0] = false; });
    bindHold('mPlaceBtn', function () { mouseHeld[2] = true; placeTimer = 0; doPlace(); }, function () { mouseHeld[2] = false; });
    bindHold('mJumpBtn', function () {
      keys[' '] = true;
      var now = performance.now();
      if (gameMode === 'creative') {
        if (now - lastSpaceTap < 400) {
          flying = !flying; player.vel.y = 0;
          toast(flying ? '✦ 飞行模式：开启' : '✦ 飞行模式：关闭');
          lastSpaceTap = 0;
        } else lastSpaceTap = now;
      }
    }, function () { keys[' '] = false; });
    var fb = $('mFlyBtn');
    if (fb) fb.addEventListener('click', function (e) {
      e.preventDefault();
      if (gameMode !== 'creative') { toast('仅创造模式可飞行'); return; }
      flying = !flying; player.vel.y = 0;
      toast(flying ? '✦ 飞行模式：开启' : '✦ 飞行模式：关闭');
    });
    var ib = $('mInvBtn');
    if (ib) ib.addEventListener('click', function (e) { e.preventDefault(); if (gameMode !== 'spectator') toggleInv(); });
    var cb2 = $('mChatBtn');
    if (cb2) cb2.addEventListener('click', function (e) { e.preventDefault(); if (appState === 'playing') openChat(false); });
    var mb = $('mMenuBtn');
    if (mb) mb.addEventListener('click', function (e) {
      e.preventDefault();
      if (appState === 'playing') setAppState('paused');
      else if (appState === 'paused') setAppState('playing');
    });
  }

  /* ═══ 界面管理 ═══ */
  var screens = {
    mainMenu: 'mainMenuScreen', multiplayer: 'multiplayerScreen',
    createRoom: 'createRoomScreen', worldSelect: 'worldSelectScreen',
    createWorld: 'createWorldScreen', settings: 'settingsScreen', pause: 'pauseScreen'
  };
  function setAppState(s) {
    appState = s;
    for (var k in screens) {
      var el = $(screens[k]);
      if (el) el.classList.add('hidden');
    }
    if (screens[s]) { var target = $(screens[s]); if (target) target.classList.remove('hidden'); }
    var inGame = (s === 'playing' || s === 'paused' || s === 'dead');
    $('bgDecor').classList.toggle('hidden', inGame);
    $('hudTop').style.display = inGame ? 'flex' : 'none';
    $('tips').style.display = (inGame && !isTouchUI) ? 'block' : 'none';
    $('crosshair').style.display = (s === 'playing' && gameMode !== 'spectator' && !inventoryOpen && !chatOpen) ? 'block' : 'none';
    $('hotbar').style.display = (inGame && gameMode !== 'spectator') ? 'flex' : 'none';
    $('healthBar').style.display = (inGame && (gameMode === 'survival' || gameMode === 'hardcore')) ? 'block' : 'none';
    $('hungerBar').style.display = (inGame && (gameMode === 'survival' || gameMode === 'hardcore')) ? 'block' : 'none';
    $('chatBox').classList.toggle('visible', inGame);
    $('playerList').style.display = (inGame && isMultiplayer) ? 'flex' : 'none';
    $('mobileControls').classList.toggle('show', s === 'playing' && isTouchUI);
    if (s === 'playing') {
      if (hasFine && !document.pointerLockElement && !inventoryOpen && !chatOpen)
        try { renderer.domElement.requestPointerLock(); } catch (e) {}
    } else {
      if (document.pointerLockElement) document.exitPointerLock();
    }
  }
  function setGameMode(mode) {
    var prev = gameMode; gameMode = mode;
    var names = { creative:'创造', survival:'生存', spectator:'旁观', adventure:'冒险', hardcore:'极限' };
    $('hudMode').textContent = '模式：' + (names[mode] || mode);
    if (mode !== 'creative' && mode !== 'spectator') flying = false;
    if (mode === 'spectator') flying = true;
    player.vel.y = 0; player.fallStartY = null;
    if (prev !== mode && appState === 'playing') toast('✦ 已切换至' + (names[mode]||mode) + '模式');
    if (appState === 'playing' || appState === 'paused' || appState === 'dead') {
      $('crosshair').style.display = (mode !== 'spectator' && !inventoryOpen && !chatOpen) ? 'block' : 'none';
      $('hotbar').style.display = (mode !== 'spectator') ? 'flex' : 'none';
      $('healthBar').style.display = (mode === 'survival' || mode === 'hardcore') ? 'block' : 'none';
      $('hungerBar').style.display = (mode === 'survival' || mode === 'hardcore') ? 'block' : 'none';
    }
  }
  function showLoad() { $('loadingScreen').classList.remove('hidden'); $('loadingBar').style.width = '0%'; $('loadingStatus').textContent = '正在准备...'; }
  function setLoadProgress(c, t, s) { $('loadingBar').style.width = (t > 0 ? (c/t)*100 : 0) + '%'; $('loadingStatus').textContent = s || ('正在生成区块... ' + c + ' / ' + t); }
  function hideLoad() { $('loadingScreen').classList.add('hidden'); }

  /* ═══ 聊天 ═══ */
  function addChat(text, type) {
    var el = document.createElement('div');
    el.className = 'chat-msg ' + (type || ''); el.innerHTML = text;
    $('chatBox').appendChild(el);
    while ($('chatBox').children.length > 10) $('chatBox').removeChild($('chatBox').firstChild);
    setTimeout(function () {
      if (el.parentNode) { el.style.transition = 'opacity .5s'; el.style.opacity = '0';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 500); }
    }, 20000);
  }
  function openChat(isCmd) {
    if (appState !== 'playing') return;
    chatOpen = true; $('chatInput').classList.add('visible');
    var f = $('chatInputField'); f.value = isCmd ? '/' : '';
    $('chatPrefix').textContent = isCmd ? '/' : '>';
    if (document.pointerLockElement) document.exitPointerLock();
    setTimeout(function () { f.focus(); }, 10);
  }
  function closeChat() {
    chatOpen = false; $('chatInput').classList.remove('visible');
    $('chatInputField').value = '';
    if (appState === 'playing' && !inventoryOpen && hasFine && !document.pointerLockElement)
      renderer.domElement.requestPointerLock();
  }
  function sendChat() {
    var f = $('chatInputField'), text = f.value.trim();
    if (text === '') { closeChat(); return; }
    if (text.charAt(0) === '/') execCmd(text.slice(1));
    else {
      addChat('<span class="sender">' + escHtml(myPlayerName) + '</span> ' + escHtml(text), 'player');
      if (isMultiplayer && net && net.connected) net.sendChat(text);
    }
    f.value = ''; closeChat();
  }
  function execCmd(cmdStr) {
    var parts = cmdStr.trim().split(/\s+/), cmd = parts[0].toLowerCase(), args = parts.slice(1);
    switch (cmd) {
      case 'help': addChat('指令：/help /seed /gamemode /tp /kill /spawn /list /clear', 'system'); break;
      case 'seed': addChat('世界种子：' + WORLD_SEED, 'success'); break;
      case 'gamemode': case 'gm': {
        var mode = (args[0]||'').toLowerCase();
        var mm = { '0':'survival','1':'creative','2':'adventure','3':'spectator','s':'survival','c':'creative','a':'adventure','sp':'spectator' };
        mode = mm[mode] || mode;
        if (['creative','survival','adventure','spectator'].indexOf(mode) >= 0) { setGameMode(mode); addChat('已切换 ' + mode, 'success'); }
        else addChat('用法：/gamemode <模式>', 'error');
        break;
      }
      case 'tp':
        if (args.length === 3) {
          var tx = parseFloat(args[0]), ty = parseFloat(args[1]), tz = parseFloat(args[2]);
          if (!isNaN(tx) && !isNaN(ty) && !isNaN(tz)) {
            player.pos.x = tx+0.5; player.pos.y = ty; player.pos.z = tz+0.5; player.vel.y = 0;
            addChat('已传送', 'success');
          } else addChat('坐标必须是数字', 'error');
        } else addChat('用法：/tp <x> <y> <z>', 'error');
        break;
      case 'clear': $('chatBox').innerHTML = ''; break;
      case 'kill': applyDamage(20); addChat('已自杀', 'system'); break;
      case 'spawn': spawnPlayer(); updateChunks(true); addChat('已回出生点', 'success'); break;
      case 'list':
        if (isMultiplayer && net) {
          var names = [myPlayerName + ' (你)'];
          net.remotePlayers.forEach(function (p) { names.push(p.name); });
          addChat('在线 (' + names.length + '/' + (currentRoom ? currentRoom.max_players : 1) + ')：' + names.join(', '), 'system');
        } else addChat('在线 (1/1)：' + myPlayerName, 'system');
        break;
      default: addChat('未知指令：/' + cmd, 'error');
    }
  }
