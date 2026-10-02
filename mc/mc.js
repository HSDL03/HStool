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
        var st = $('supabaseStatus'); st.textContent = '☁ 已连接'; st.classList.add('show');
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

  /* ═══ Y 轴常量 ═══ */
  var WORLD_MIN_Y = -64, WORLD_MAX_Y = 320;
  var WORLD_HEIGHT = WORLD_MAX_Y - WORLD_MIN_Y;
  var SEA_LEVEL = 63, DEEPSLATE_Y = 0;
  var CHUNK_SIZE = 16;
  var LOAD_RADIUS = Math.max(1, Math.min(16, Math.round(settings.renderDistance / 2)));
  var EYE_HEIGHT = 1.62, PLAYER_HALF = 0.3, PLAYER_HEIGHT = 1.8;
  var GRAVITY = 30, JUMP_VELOCITY = 9.2, WALK_SPEED = 4.5, RUN_SPEED = 7.5, FLY_SPEED = 11;
  var REACH = 6, SWING_DURATION = 0.30;
  var MAX_CHUNK_REBUILDS_PER_FRAME = 3;
  var BREAK_COOLDOWN = 0.40, PLACE_COOLDOWN = 0.45;
  var CULL_DISTANCE_MUL = 1.5, VISIBILITY_UPDATE_INTERVAL = 0.35;

  /* ═══ 数据加载 ═══ */
  var GAME_DATA = window.GAME_DATA || null;
  var BLOCKS = {}, ALL_BLOCK_IDS = [], RECIPES = [], BIOMES = [], ORE_CONFIG = {};
  (function initData() {
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
      17:{veinsPerChunk:20,veinSize:17,minY:0,maxY:320,deepBlock:22},
      18:{veinsPerChunk:20,veinSize:9,minY:-64,maxY:80,deepBlock:23},
      19:{veinsPerChunk:4,veinSize:9,minY:-64,maxY:32,deepBlock:24},
      20:{veinsPerChunk:1,veinSize:8,minY:-64,maxY:16,deepBlock:25},
      21:{veinsPerChunk:1,veinSize:7,minY:-64,maxY:32,deepBlock:26}
    };
    for (var ok in oresRaw) ORE_CONFIG[parseInt(ok, 10)] = oresRaw[ok];
    if (GAME_DATA && typeof GAME_DATA.deepslateY === 'number') DEEPSLATE_Y = GAME_DATA.deepslateY;
  })();

  /* ═══ 纹理图集 ═══ */
  var ATLAS_COLS = 8, ATLAS_ROWS = 4, TILE_PX = 16;
  var atlasCanvas = document.createElement('canvas');
  atlasCanvas.width = ATLAS_COLS * TILE_PX;
  atlasCanvas.height = ATLAS_ROWS * TILE_PX;
  var atlasCtx = atlasCanvas.getContext('2d');
  function c255(v) { return v < 0 ? 0 : (v > 255 ? 255 : v | 0); }
  function nf(g, r, gr, b, v) {
    for (var y = 0; y < TILE_PX; y++) for (var x = 0; x < TILE_PX; x++) {
      var d = (Math.random()-0.5)*v;
      g.fillStyle = 'rgb('+c255(r+d)+','+c255(gr+d)+','+c255(b+d)+')';
      g.fillRect(x,y,1,1);
    }
  }
  function pxf(g,x,y,w,h,c) { g.fillStyle=c; g.fillRect(x,y,w,h); }
  function dt(ti, fn) {
    var c = ti % ATLAS_COLS, r = Math.floor(ti / ATLAS_COLS);
    atlasCtx.save(); atlasCtx.translate(c*TILE_PX, r*TILE_PX);
    atlasCtx.beginPath(); atlasCtx.rect(0,0,TILE_PX,TILE_PX); atlasCtx.clip();
    fn(atlasCtx); atlasCtx.restore();
  }
  (function buildAtlas(){
    dt(0,function(g){nf(g,106,170,64,34);for(var i=0;i<14;i++)pxf(g,(Math.random()*15)|0,(Math.random()*15)|0,1,1,'rgba(60,120,35,0.55)');});
    dt(1,function(g){nf(g,134,96,67,32);for(var x=0;x<TILE_PX;x++){var h=3+((Math.random()*3)|0);for(var y=0;y<h;y++){var d=(Math.random()-0.5)*34;g.fillStyle='rgb('+c255(106+d)+','+c255(170+d)+','+c255(64+d)+')';g.fillRect(x,y,1,1);}}});
    dt(2,function(g){nf(g,134,96,67,34);});
    dt(3,function(g){nf(g,128,128,128,26);for(var i=0;i<10;i++)pxf(g,(Math.random()*14)|0,(Math.random()*14)|0,2,1,'rgba(90,90,90,0.55)');});
    dt(4,function(g){nf(g,160,120,75,18);for(var i=0;i<5;i++){var x=1+((Math.random()*14)|0);pxf(g,x,0,1+((Math.random()*2)|0),16,'rgba(112,82,48,0.65)');}});
    dt(5,function(g){nf(g,190,150,100,14);g.strokeStyle='rgba(130,96,56,0.75)';g.lineWidth=1;for(var r=2;r<=7;r+=2){g.beginPath();g.arc(8,8,r,0,Math.PI*2);g.stroke();}});
    dt(6,function(g){nf(g,70,138,55,46);for(var i=0;i<22;i++)pxf(g,(Math.random()*16)|0,(Math.random()*16)|0,1,1,'rgba(30,72,24,0.55)');});
    dt(7,function(g){nf(g,220,205,140,22);});
    dt(8,function(g){nf(g,78,78,78,40);for(var i=0;i<14;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,2,'rgba(30,30,30,0.8)');});
    dt(9,function(g){nf(g,180,140,85,16);pxf(g,0,5,16,1,'rgba(120,88,50,0.85)');pxf(g,0,11,16,1,'rgba(120,88,50,0.85)');});
    dt(10,function(g){nf(g,150,62,46,22);var m='rgba(196,186,176,0.9)';pxf(g,0,0,16,1,m);pxf(g,0,7,16,1,m);pxf(g,0,15,16,1,m);});
    dt(11,function(g){nf(g,245,248,252,12);});
    dt(12,function(g){nf(g,134,96,67,30);for(var x=0;x<TILE_PX;x++){var h=4+((Math.random()*3)|0);for(var y=0;y<h;y++){g.fillStyle='rgb(245,248,252)';g.fillRect(x,y,1,1);}}});
    dt(13,function(g){nf(g,220,205,155,16);});
    dt(14,function(g){nf(g,214,198,148,14);for(var y=2;y<16;y+=4)pxf(g,0,y,16,1,'rgba(178,162,112,0.55)');});
    dt(15,function(g){nf(g,60,128,55,22);});
    dt(16,function(g){nf(g,68,140,60,20);});
    dt(17,function(g){nf(g,96,68,40,18);});
    dt(18,function(g){nf(g,118,84,50,16);});
    dt(19,function(g){nf(g,42,96,52,40);});
    dt(20,function(g){nf(g,168,212,240,18);});
    dt(21,function(g){nf(g,60,60,66,20);for(var i=0;i<14;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,2,'rgba(35,35,40,0.8)');});
    dt(22,function(g){nf(g,128,128,128,26);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#1a1a1a');});
    dt(23,function(g){nf(g,128,128,128,26);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#d8a878');});
    dt(24,function(g){nf(g,128,128,128,26);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#ffd633');});
    dt(25,function(g){nf(g,128,128,128,26);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#5decf5');});
    dt(26,function(g){nf(g,128,128,128,26);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#2c47b8');});
    dt(27,function(g){nf(g,60,60,66,20);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#1a1a1a');});
    dt(28,function(g){nf(g,60,60,66,20);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#d8a878');});
    dt(29,function(g){nf(g,60,60,66,20);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#ffd633');});
    dt(30,function(g){nf(g,60,60,66,20);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#5decf5');});
    dt(31,function(g){nf(g,60,60,66,20);for(var i=0;i<8;i++)pxf(g,(Math.random()*13)|0,(Math.random()*13)|0,3,3,'#2c47b8');});
  })();

  /* ═══ 噪声 ═══ */
  var WORLD_SEED = 12345678;
  function sh(x,y,s){var h=Math.imul(x|0,0x27d4eb2d);h^=Math.imul(y|0,0x165667b1);h^=Math.imul((WORLD_SEED+(s|0))|0,0x9e3779b9);h=Math.imul(h^(h>>>15),0x85ebca6b);h=Math.imul(h^(h>>>13),0xc2b2ae35);h^=h>>>16;return(h>>>0)/4294967296;}
  function sh3(x,y,z,s){var h=Math.imul(x|0,0x27d4eb2d);h^=Math.imul(y|0,0x165667b1);h^=Math.imul(z|0,0x9e3779b9);h^=Math.imul((WORLD_SEED+(s|0))|0,0x85ebca6b);h=Math.imul(h^(h>>>15),0xc2b2ae35);h=Math.imul(h^(h>>>13),0x85ebca6b);h^=h>>>16;return(h>>>0)/4294967296;}
  function sn(x,y,s){var x0=Math.floor(x),y0=Math.floor(y),fx=x-x0,fy=y-y0;var sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);var n00=sh(x0,y0,s),n10=sh(x0+1,y0,s),n01=sh(x0,y0+1,s),n11=sh(x0+1,y0+1,s);var a=n00*(1-sx)+n10*sx,b=n01*(1-sx)+n11*sx;return a*(1-sy)+b*sy;}
  function fbm(x,y,s){return sn(x,y,s)*0.5+sn(x*2,y*2,s+1)*0.25+sn(x*4,y*4,s+2)*0.125+sn(x*8,y*8,s+3)*0.0625;}

  var BP=0,BF=1,BD=2,BS=3,BM=4;
  function tp(wx,wz){
    var bs=(worldType==='largeBiomes')?0.25:1,hm=(worldType==='amplified')?2.0:1.0;
    var bn=fbm(wx*0.055*bs,wz*0.055*bs,10),mf=fbm(wx*0.035*bs+200,wz*0.035*bs+200,110);
    var t=fbm(wx*0.013*bs+700,wz*0.013*bs+700,210),hu=fbm(wx*0.016*bs+300,wz*0.016*bs+300,310);
    var bh=SEA_LEVEL+bn*18*hm,mb=0;
    if(mf>0.54)mb=(mf-0.54)*130*hm;
    var h=Math.floor(bh+mb);
    if(h<WORLD_MIN_Y+4)h=WORLD_MIN_Y+4;
    if(h>WORLD_MAX_Y-6)h=WORLD_MAX_Y-6;
    var biome;
    if(mf>0.60&&h>SEA_LEVEL+40)biome=BM;
    else if(t>0.53&&hu<0.45)biome=BD;
    else if(t<0.40)biome=BS;
    else if(hu>0.53)biome=BF;
    else biome=BP;
    return {height:h,biome:biome};
  }

  /* ═══ 区块存储 ═══ */
  var chunkData = new Map(), chunkMeshes = new Map(), dirtyChunks = new Set(), loadingIndicators = new Map();
  function ck(cx,cz){return cx+','+cz;}
  function yIdx(wy){return wy-WORLD_MIN_Y;}
  function getBlock(wx,wy,wz){if(wy<WORLD_MIN_Y||wy>=WORLD_MAX_Y)return 0;var cx=Math.floor(wx/CHUNK_SIZE),cz=Math.floor(wz/CHUNK_SIZE);var d=chunkData.get(ck(cx,cz));if(!d)return 0;var lx=wx-cx*CHUNK_SIZE,lz=wz-cz*CHUNK_SIZE;return d[(yIdx(wy)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx];}
  function setBlock(wx,wy,wz,v){if(wy<WORLD_MIN_Y||wy>=WORLD_MAX_Y)return;var cx=Math.floor(wx/CHUNK_SIZE),cz=Math.floor(wz/CHUNK_SIZE);var d=chunkData.get(ck(cx,cz));if(!d)return;var lx=wx-cx*CHUNK_SIZE,lz=wz-cz*CHUNK_SIZE;d[(yIdx(wy)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx]=v;}
  function isSolid(wx,wy,wz){if(wy<WORLD_MIN_Y)return true;if(wy>=WORLD_MAX_Y)return false;return getBlock(wx,wy,wz)!==0;}
  function isOcc(wx,wy,wz){if(wy<WORLD_MIN_Y||wy>=WORLD_MAX_Y)return false;return getBlock(wx,wy,wz)!==0;}

  /* ═══ 区块生成（含矿石/深板岩/洞穴） ═══ */
  function genChunk(cx,cz){
    var d=new Uint8Array(CHUNK_SIZE*WORLD_HEIGHT*CHUNK_SIZE);
    var bx=cx*CHUNK_SIZE,bz=cz*CHUNK_SIZE;
    if(worldType==='flat'){
      for(var lz=0;lz<CHUNK_SIZE;lz++)for(var lx=0;lx<CHUNK_SIZE;lx++){
        d[(yIdx(WORLD_MIN_Y)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx]=7;
        d[(yIdx(WORLD_MIN_Y+1)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx]=2;
        d[(yIdx(WORLD_MIN_Y+2)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx]=2;
        d[(yIdx(WORLD_MIN_Y+3)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx]=1;
      }
      return d;
    }
    // 1) 地形
    for(var z=0;z<CHUNK_SIZE;z++)for(var x=0;x<CHUNK_SIZE;x++){
      var wx=bx+x,wz=bz+z,p=tp(wx,wz),h=p.height,biome=p.biome;
      for(var y=WORLD_MIN_Y;y<=h;y++){
        var b;
        if(y<=WORLD_MIN_Y)b=7;
        else if(y<=WORLD_MIN_Y+4)b=sh(wx,y,wz)<0.5?7:3;
        else if(y<DEEPSLATE_Y)b=16;
        else if(y<h-4)b=(biome===BD)?11:3;
        else if(y<h){switch(biome){case BD:b=6;break;case BS:b=2;break;case BM:b=3;break;default:b=2;}}
        else{
          var lowland=h<=SEA_LEVEL;
          if(lowland)b=(biome===BS)?10:6;
          else{
            switch(biome){
              case BD:b=6;break;
              case BS:b=10;break;
              case BM:if(h>SEA_LEVEL+40)b=10;else if(h>SEA_LEVEL+20)b=3;else b=1;break;
              default:b=1;
            }
          }
        }
        if(b!==0)d[(yIdx(y)*CHUNK_SIZE+z)*CHUNK_SIZE+x]=b;
      }
    }
    // 2) 矿脉
    for(var oidStr in ORE_CONFIG){
      var oid=parseInt(oidStr,10),cfg=ORE_CONFIG[oidStr];
      for(var v=0;v<cfg.veinsPerChunk;v++){
        var vx=bx+Math.floor(sh(cx*31+v,cz*17+oid,100)*CHUNK_SIZE);
        var vz=bz+Math.floor(sh(cx*13+v,cz*29+oid,200)*CHUNK_SIZE);
        var vy=cfg.minY+Math.floor(sh(cx+v,cz+oid,300)*(cfg.maxY-cfg.minY));
        for(var k=0;k<cfg.veinSize;k++){
          var ox=vx+Math.floor((sh(vx+k,vz,400)-0.5)*5);
          var oy=vy+Math.floor((sh(vx,vy+k,500)-0.5)*5);
          var oz=vz+Math.floor((sh(vx,vz+k,600)-0.5)*5);
          if(ox<bx||ox>=bx+CHUNK_SIZE||oz<bz||oz>=bz+CHUNK_SIZE)continue;
          if(oy<WORLD_MIN_Y||oy>=WORLD_MAX_Y)continue;
          var lx2=ox-bx,lz2=oz-bz,ay=yIdx(oy);
          var cur=d[(ay*CHUNK_SIZE+lz2)*CHUNK_SIZE+lx2];
          if(cur===3)d[(ay*CHUNK_SIZE+lz2)*CHUNK_SIZE+lx2]=oid;
          else if(cur===16&&cfg.deepBlock)d[(ay*CHUNK_SIZE+lz2)*CHUNK_SIZE+lx2]=cfg.deepBlock;
        }
      }
    }
    // 3) 洞穴
    for(var cy=WORLD_MIN_Y+6;cy<60;cy++){
      for(var cz2=0;cz2<CHUNK_SIZE;cz2++)for(var cx2=0;cx2<CHUNK_SIZE;cx2++){
        var gwx=bx+cx2,gwz=bz+cz2;
        var n1=sh3(Math.floor(gwx/8),Math.floor(cy/8),Math.floor(gwz/8),800);
        var n2=sh3(gwx,cy,gwz,700);
        if(n1>0.72&&n2>0.5)d[(yIdx(cy)*CHUNK_SIZE+cz2)*CHUNK_SIZE+cx2]=0;
      }
    }
    // 4) 装饰
    var PAD=4;
    for(var wz2=bz-PAD;wz2<bz+CHUNK_SIZE+PAD;wz2++)
      for(var wx2=bx-PAD;wx2<bx+CHUNK_SIZE+PAD;wx2++)
        tryDec(wx2,wz2,d,cx,cz);
    return d;
  }
  function hasTree(wx,wz){var p=tp(wx,wz);if(p.height<=SEA_LEVEL)return false;var r=sh(wx,wz,500);
    switch(p.biome){case BP:return r<0.010;case BF:return r<0.090;case BD:return r<0.022;case BS:return r<0.045;case BM:return p.height<SEA_LEVEL+50&&r<0.018;}
    return false;}
  function hasEarlier(wx,wz){for(var dz=-1;dz<=1;dz++)for(var dx=-1;dx<=1;dx++){if(dx===0&&dz===0)continue;if(dx<0||(dx===0&&dz<0))if(hasTree(wx+dx,wz+dz))return true;}return false;}
  function tryDec(wx,wz,d,cx,cz){if(!hasTree(wx,wz))return;if(hasEarlier(wx,wz))return;var p=tp(wx,wz),gy=p.height;
    if(p.biome===BD)plCactus(wx,gy,wz,d,cx,cz);else if(p.biome===BS||p.biome===BM)plSpruce(wx,gy,wz,d,cx,cz);else plOak(wx,gy,wz,d,cx,cz);}
  function sl(d,cx,cz,wx,wy,wz,v){if(wy<WORLD_MIN_Y||wy>=WORLD_MAX_Y)return;var lx=wx-cx*CHUNK_SIZE,lz=wz-cz*CHUNK_SIZE;if(lx<0||lx>=CHUNK_SIZE||lz<0||lz>=CHUNK_SIZE)return;d[(yIdx(wy)*CHUNK_SIZE+lz)*CHUNK_SIZE+lx]=v;}
  function plOak(wx,gy,wz,d,cx,cz){var th=4+Math.floor(sh(wx,wz,1000)*3),tt=gy+th;for(var y=gy+1;y<=tt;y++)sl(d,cx,cz,wx,y,wz,4);
    var layers=[{y:tt-1,r:2},{y:tt,r:2},{y:tt+1,r:1}];
    for(var L=0;L<layers.length;L++){var layer=layers[L],r=layer.r;
      for(var dx=-r;dx<=r;dx++)for(var dz=-r;dz<=r;dz++){if(Math.abs(dx)===r&&Math.abs(dz)===r)continue;sl(d,cx,cz,wx+dx,layer.y,wz+dz,5);}}}
  function plSpruce(wx,gy,wz,d,cx,cz){var th=5+Math.floor(sh(wx,wz,1100)*3),tt=gy+th;for(var y=gy+1;y<=tt;y++)sl(d,cx,cz,wx,y,wz,13);sl(d,cx,cz,wx,tt+1,wz,14);
    var pr=[0,1,1,2,2,3,3];
    for(var i=0;i<pr.length;i++){var yy=tt-i;if(yy<=gy)break;var r=pr[i];if(r===0)continue;
      for(var dx=-r;dx<=r;dx++)for(var dz=-r;dz<=r;dz++){if(dx===0&&dz===0)continue;if(Math.abs(dx)===r&&Math.abs(dz)===r)continue;sl(d,cx,cz,wx+dx,yy,wz+dz,14);}}}
  function plCactus(wx,gy,wz,d,cx,cz){var h=1+Math.floor(sh(wx,wz,1200)*3);for(var i=1;i<=h;i++)sl(d,cx,cz,wx,gy+i,wz,12);}

  /* ═══ 面 & AO ═══ */
  var FACES=[
    {dir:[1,0,0],corners:[[1,0,0],[1,1,0],[1,1,1],[1,0,1]],uvs:[[0,0],[0,1],[1,1],[1,0]]},
    {dir:[-1,0,0],corners:[[0,0,1],[0,1,1],[0,1,0],[0,0,0]],uvs:[[0,0],[0,1],[1,1],[1,0]]},
    {dir:[0,1,0],corners:[[0,1,1],[1,1,1],[1,1,0],[0,1,0]],uvs:[[0,0],[1,0],[1,1],[0,1]]},
    {dir:[0,-1,0],corners:[[0,0,0],[1,0,0],[1,0,1],[0,0,1]],uvs:[[0,0],[1,0],[1,1],[0,1]]},
    {dir:[0,0,1],corners:[[1,0,1],[1,1,1],[0,1,1],[0,0,1]],uvs:[[0,0],[0,1],[1,1],[1,0]]},
    {dir:[0,0,-1],corners:[[0,0,0],[0,1,0],[1,1,0],[1,0,0]],uvs:[[0,0],[0,1],[1,1],[1,0]]}
  ];
  function faceAO(x,y,z,fi){
    var f=FACES[fi],n=f.dir;
    var ax=0,ay=0,az=0,bx=0,by=0,bz=0;
    if(n[0]!==0){ay=1;bz=1;}else if(n[1]!==0){ax=1;bz=1;}else{ax=1;by=1;}
    var ox=x+n[0],oy=y+n[1],oz=z+n[2],out=[0,0,0,0];
    for(var i=0;i<4;i++){
      var c=f.corners[i],dirA,dirB;
      if(n[0]!==0){dirA=c[1]===0?-1:1;dirB=c[2]===0?-1:1;}
      else if(n[1]!==0){dirA=c[0]===0?-1:1;dirB=c[2]===0?-1:1;}
      else{dirA=c[0]===0?-1:1;dirB=c[1]===0?-1:1;}
      var s1x=ox+ax*dirA,s1y=oy+ay*dirA,s1z=oz+az*dirA;
      var s2x=ox+bx*dirB,s2y=oy+by*dirB,s2z=oz+bz*dirB;
      var ccx=s1x+bx*dirB,ccy=s1y+by*dirB,ccz=s1z+bz*dirB;
      var a1=isOcc(s1x,s1y,s1z)?1:0,a2=isOcc(s2x,s2y,s2z)?1:0,ac=isOcc(ccx,ccy,ccz)?1:0;
      out[i]=(a1&&a2)?0:(3-(a1+a2+ac));
    }
    return out;
  }
  function aoL(ao){return 0.48+(ao/3)*0.52;}

  /* ═══ Three.js ═══ */
  var scene, camera, renderer, atlasTexture, blockMaterial;
  var hemiLight, sunLight, fillLight, ambientLight, sunMesh, sunGlow, cloudPlane;
  var highlightMesh, handPivot, handBasePos, handBaseRot;
  function initThree(){
    scene=new THREE.Scene();
    scene.background=new THREE.Color(0x87ceeb);
    scene.fog=new THREE.Fog(0x9fd4f0,22,58);
    camera=new THREE.PerspectiveCamera(settings.fov,window.innerWidth/window.innerHeight,0.05,500);
    camera.rotation.order='YXZ';scene.add(camera);
    renderer=new THREE.WebGLRenderer({antialias:false,powerPreference:'high-performance'});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
    renderer.setSize(window.innerWidth,window.innerHeight);
    renderer.domElement.id='game3d';
    document.body.insertBefore(renderer.domElement,document.body.firstChild);
    window.addEventListener('resize',function(){camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();renderer.setSize(window.innerWidth,window.innerHeight);});
    hemiLight=new THREE.HemisphereLight(0xe8f4ff,0x6a5a48,0.90);scene.add(hemiLight);
    sunLight=new THREE.DirectionalLight(0xfff5e0,0.55);sunLight.position.set(0.7,1.2,0.45);scene.add(sunLight);
    fillLight=new THREE.DirectionalLight(0xbfd4ff,0.16);fillLight.position.set(-0.6,0.4,-0.7);scene.add(fillLight);
    ambientLight=new THREE.AmbientLight(0xffffff,0.12);scene.add(ambientLight);
    sunMesh=new THREE.Mesh(new THREE.SphereGeometry(6,16,16),new THREE.MeshBasicMaterial({color:0xffdd66,fog:false}));
    sunMesh.visible=false;scene.add(sunMesh);
    sunGlow=new THREE.Mesh(new THREE.SphereGeometry(12,16,16),new THREE.MeshBasicMaterial({color:0xffdd88,transparent:true,opacity:0.3,depthWrite:false,fog:false}));
    sunGlow.visible=false;scene.add(sunGlow);
    (function(){
      var c=document.createElement('canvas');c.width=512;c.height=512;
      var g=c.getContext('2d');
      for(var i=0;i<80;i++){
        var x=Math.random()*512,y=Math.random()*512,r=15+Math.random()*35;
        var grad=g.createRadialGradient(x,y,0,x,y,r);
        grad.addColorStop(0,'rgba(255,255,255,0.95)');
        grad.addColorStop(0.6,'rgba(255,255,255,0.5)');
        grad.addColorStop(1,'rgba(255,255,255,0)');
        g.fillStyle=grad;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
      }
      var tex=new THREE.CanvasTexture(c);
      tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(3,3);
      cloudPlane=new THREE.Mesh(new THREE.PlaneGeometry(400,400),
        new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:0.55,depthWrite:false,side:THREE.DoubleSide}));
      cloudPlane.rotation.x=-Math.PI/2;
      cloudPlane.position.y=WORLD_MAX_Y-10;
      cloudPlane.visible=false;scene.add(cloudPlane);
    })();
    var skinMat=new THREE.MeshLambertMaterial({color:0xe8b48c});
    var shirtMat=new THREE.MeshLambertMaterial({color:0x2e9cc9});
    handPivot=new THREE.Group();handPivot.position.set(0.34,-0.30,-0.30);camera.add(handPivot);
    var handArm=new THREE.Mesh(new THREE.BoxGeometry(0.13,0.13,0.52),shirtMat);handArm.position.set(0,0,-0.26);handPivot.add(handArm);
    var handPalm=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.16,0.18),skinMat);handPalm.position.set(0,0,-0.60);handPivot.add(handPalm);
    var thumb=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.05,0.10),skinMat);thumb.position.set(0.07,0.04,-0.58);handPivot.add(thumb);
    handBasePos={x:0.34,y:-0.30,z:-0.30};
    handBaseRot={x:0.14,y:-0.06,z:0};
    highlightMesh=new THREE.Mesh(
      new THREE.BoxGeometry(1.004,1.004,1.004),
      new THREE.MeshBasicMaterial({color:0x000000,wireframe:true,transparent:true,opacity:0.45})
    );
    highlightMesh.visible=false;scene.add(highlightMesh);
    atlasTexture=new THREE.CanvasTexture(atlasCanvas);
    atlasTexture.magFilter=THREE.NearestFilter;atlasTexture.minFilter=THREE.NearestFilter;
    atlasTexture.generateMipmaps=false;
    atlasTexture.wrapS=THREE.ClampToEdgeWrapping;atlasTexture.wrapT=THREE.ClampToEdgeWrapping;
    blockMaterial=new THREE.MeshLambertMaterial({map:atlasTexture,side:THREE.FrontSide,vertexColors:true});
    applyBrightness();
  }
  function applyBrightness(){
    var b=settings.brightness/100;
    ambientLight.intensity=0.05+b*0.45;
    hemiLight.intensity=0.65+b*0.5;
    sunLight.intensity=0.22+b*0.36;
    if(cloudPlane)cloudPlane.visible=!!settings.showClouds;
    if(sunMesh)sunMesh.visible=!!settings.showSun;
    if(sunGlow)sunGlow.visible=!!settings.showSun;
  }

  /* ═══ 区块几何 ═══ */
  function buildChunkGeo(cx,cz){
    var data=chunkData.get(ck(cx,cz));if(!data)return null;
    var chXP=chunkData.get(ck(cx+1,cz)),chXN=chunkData.get(ck(cx-1,cz));
    var chZP=chunkData.get(ck(cx,cz+1)),chZN=chunkData.get(ck(cx,cz-1));
    function getL(lx,ay,lz){
      if(ay<0||ay>=WORLD_HEIGHT)return 0;
      if(lx>=0&&lx<CHUNK_SIZE&&lz>=0&&lz<CHUNK_SIZE)return data[(ay*CHUNK_SIZE+lz)*CHUNK_SIZE+lx];
      if(lx>=CHUNK_SIZE&&lz>=0&&lz<CHUNK_SIZE)return chXP?chXP[(ay*CHUNK_SIZE+lz)*CHUNK_SIZE+(lx-CHUNK_SIZE)]:0;
      if(lx<0&&lz>=0&&lz<CHUNK_SIZE)return chXN?chXN[(ay*CHUNK_SIZE+lz)*CHUNK_SIZE+(lx+CHUNK_SIZE)]:0;
      if(lz>=CHUNK_SIZE&&lx>=0&&lx<CHUNK_SIZE)return chZP?chZP[(ay*CHUNK_SIZE+(lz-CHUNK_SIZE))*CHUNK_SIZE+lx]:0;
      if(lz<0&&lx>=0&&lx<CHUNK_SIZE)return chZN?chZN[(ay*CHUNK_SIZE+(lz+CHUNK_SIZE))*CHUNK_SIZE+lx]:0;
      return 0;
    }
    var pos=[],nor=[],uvs=[],col=[],idx=[],vc=0;
    var invC=1/ATLAS_COLS,invR=1/ATLAS_ROWS,rowOff=ATLAS_ROWS-1;
    var bx=cx*CHUNK_SIZE,bz=cz*CHUNK_SIZE;
    for(var ay=0;ay<WORLD_HEIGHT;ay++){
      var wy=ay+WORLD_MIN_Y;
      for(var lz=0;lz<CHUNK_SIZE;lz++)for(var lx=0;lx<CHUNK_SIZE;lx++){
        var b=data[(ay*CHUNK_SIZE+lz)*CHUNK_SIZE+lx];
        if(b===0)continue;
        var def=BLOCKS[b];if(!def)continue;
        var nP=getL(lx+1,ay,lz),nN=getL(lx-1,ay,lz);
        var nU=getL(lx,ay+1,lz),nD=getL(lx,ay-1,lz);
        var nQ=getL(lx,ay,lz+1),nB=getL(lx,ay,lz-1);
        if(nP!==0&&nN!==0&&nU!==0&&nD!==0&&nQ!==0&&nB!==0)continue;
        var wx=bx+lx,wz=bz+lz;
        for(var f=0;f<6;f++){
          var solid;
          if(f===0)solid=nP!==0;
          else if(f===1)solid=nN!==0;
          else if(f===2)solid=nU!==0;
          else if(f===3)solid=nD!==0;
          else if(f===4)solid=nQ!==0;
          else solid=nB!==0;
          if(solid)continue;
          var face=FACES[f];
          var tile=(f===2)?def.top:(f===3)?def.bottom:def.side;
          var cc=tile%ATLAS_COLS,cr=Math.floor(tile/ATLAS_COLS);
          var ao=faceAO(wx,wy,wz,f);
          var u0=(cc+face.uvs[0][0])*invC,v0=(rowOff-cr+face.uvs[0][1])*invR;
          var u1=(cc+face.uvs[1][0])*invC,v1=(rowOff-cr+face.uvs[1][1])*invR;
          var u2=(cc+face.uvs[2][0])*invC,v2=(rowOff-cr+face.uvs[2][1])*invR;
          var u3=(cc+face.uvs[3][0])*invC,v3=(rowOff-cr+face.uvs[3][1])*invR;
          var c0=face.corners[0],c1=face.corners[1],c2=face.corners[2],c3=face.corners[3];
          pos.push(wx+c0[0],wy+c0[1],wz+c0[2],wx+c1[0],wy+c1[1],wz+c1[2],wx+c2[0],wy+c2[1],wz+c2[2],wx+c3[0],wy+c3[1],wz+c3[2]);
          nor.push(face.dir[0],face.dir[1],face.dir[2],face.dir[0],face.dir[1],face.dir[2],face.dir[0],face.dir[1],face.dir[2],face.dir[0],face.dir[1],face.dir[2]);
          uvs.push(u0,v0,u1,v1,u2,v2,u3,v3);
          var l0=aoL(ao[0]),l1=aoL(ao[1]),l2=aoL(ao[2]),l3=aoL(ao[3]);
          col.push(l0,l0,l0,l1,l1,l1,l2,l2,l2,l3,l3,l3);
          idx.push(vc,vc+1,vc+2,vc,vc+2,vc+3);
          vc+=4;
        }
      }
    }
    if(vc===0)return null;
    var geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));
    geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
    var IA=vc>65535?Uint32Array:Uint16Array;
    geo.setIndex(new THREE.BufferAttribute(new IA(idx),1));
    geo.computeBoundingSphere();
    return geo;
  }
  function rebuildChunk(cx,cz){
    var key=ck(cx,cz);var data=chunkData.get(key);if(!data)return;
    var old=chunkMeshes.get(key);
    if(old){scene.remove(old);old.geometry.dispose();chunkMeshes.delete(key);}
    var geo=buildChunkGeo(cx,cz);
    if(!geo)return;
    var mesh=new THREE.Mesh(geo,blockMaterial);
    mesh.frustumCulled=true;scene.add(mesh);chunkMeshes.set(key,mesh);
  }
  function createLoadInd(cx,cz){
    var key=ck(cx,cz);if(loadingIndicators.has(key))return;
    var geo=new THREE.BoxGeometry(CHUNK_SIZE,WORLD_HEIGHT,CHUNK_SIZE);
    var mat=new THREE.MeshBasicMaterial({color:0x8fd94f,wireframe:true,transparent:true,opacity:0.25,depthWrite:false});
    var mesh=new THREE.Mesh(geo,mat);
    mesh.position.set(cx*CHUNK_SIZE+CHUNK_SIZE/2,WORLD_MIN_Y+WORLD_HEIGHT/2,cz*CHUNK_SIZE+CHUNK_SIZE/2);
    mesh.renderOrder=999;scene.add(mesh);loadingIndicators.set(key,mesh);
  }
  function removeLoadInd(cx,cz){
    var key=ck(cx,cz);var mesh=loadingIndicators.get(key);
    if(mesh){scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();loadingIndicators.delete(key);}
  }
  function updateLoadAnim(now){
    if(loadingIndicators.size===0)return;
    var pulse=0.15+Math.abs(Math.sin(now*0.003))*0.35;
    loadingIndicators.forEach(function(m){m.material.opacity=pulse;var s=0.98+Math.sin(now*0.004)*0.02;m.scale.set(s,s,s);});
  }
  var lastPCX=null,lastPCZ=null;
  function updateChunks(force,showLoading){
    var pcx=Math.floor(player.pos.x/CHUNK_SIZE),pcz=Math.floor(player.pos.z/CHUNK_SIZE);
    if(!force&&pcx===lastPCX&&pcz===lastPCZ)return;
    lastPCX=pcx;lastPCZ=pcz;
    var need=new Set(),newLoaded=[];
    for(var dx=-LOAD_RADIUS;dx<LOAD_RADIUS;dx++)for(var dz=-LOAD_RADIUS;dz<LOAD_RADIUS;dz++){
      var cx=pcx+dx,cz=pcz+dz,key=ck(cx,cz);need.add(key);
      if(!chunkData.has(key)){
        if(showLoading)createLoadInd(cx,cz);
        chunkData.set(key,genChunk(cx,cz));newLoaded.push([cx,cz]);
      }
    }
    var unload=[];
    chunkData.forEach(function(_,k){if(!need.has(k))unload.push(k);});
    for(var i=0;i<unload.length;i++){
      var k=unload[i],parts=k.split(',');
      var cx2=parseInt(parts[0],10),cz2=parseInt(parts[1],10);
      dirtyChunks.add(ck(cx2+1,cz2));dirtyChunks.add(ck(cx2-1,cz2));
      dirtyChunks.add(ck(cx2,cz2+1));dirtyChunks.add(ck(cx2,cz2-1));
      chunkData.delete(k);
      var mesh=chunkMeshes.get(k);
      if(mesh){scene.remove(mesh);mesh.geometry.dispose();chunkMeshes.delete(k);}
      removeLoadInd(cx2,cz2);
    }
    for(var j=0;j<newLoaded.length;j++){
      var cx3=newLoaded[j][0],cz3=newLoaded[j][1];
      dirtyChunks.add(ck(cx3,cz3));dirtyChunks.add(ck(cx3+1,cz3));
      dirtyChunks.add(ck(cx3-1,cz3));dirtyChunks.add(ck(cx3,cz3+1));
      dirtyChunks.add(ck(cx3,cz3-1));
    }
  }
  function markDirty(wx,wz){
    var cx=Math.floor(wx/CHUNK_SIZE),cz=Math.floor(wz/CHUNK_SIZE);
    var lx=wx-cx*CHUNK_SIZE,lz=wz-cz*CHUNK_SIZE;
    dirtyChunks.add(ck(cx,cz));
    if(lx===0)dirtyChunks.add(ck(cx-1,cz));
    if(lx===CHUNK_SIZE-1)dirtyChunks.add(ck(cx+1,cz));
    if(lz===0)dirtyChunks.add(ck(cx,cz-1));
    if(lz===CHUNK_SIZE-1)dirtyChunks.add(ck(cx,cz+1));
    if(lx===0&&lz===0)dirtyChunks.add(ck(cx-1,cz-1));
    if(lx===0&&lz===CHUNK_SIZE-1)dirtyChunks.add(ck(cx-1,cz+1));
    if(lx===CHUNK_SIZE-1&&lz===0)dirtyChunks.add(ck(cx+1,cz-1));
    if(lx===CHUNK_SIZE-1&&lz===CHUNK_SIZE-1)dirtyChunks.add(ck(cx+1,cz+1));
  }
  function processDirty(){
    if(dirtyChunks.size===0)return;
    var cnt=0,rem=[];
    dirtyChunks.forEach(function(key){
      if(cnt>=MAX_CHUNK_REBUILDS_PER_FRAME)return;
      if(!chunkData.has(key)){rem.push(key);return;}
      var parts=key.split(',');
      rebuildChunk(parseInt(parts[0],10),parseInt(parts[1],10));
      removeLoadInd(parseInt(parts[0],10),parseInt(parts[1],10));
      rem.push(key);cnt++;
    });
    for(var i=0;i<rem.length;i++)dirtyChunks.delete(rem[i]);
  }
  function clearAllChunks(){
    chunkData.clear();
    chunkMeshes.forEach(function(m){scene.remove(m);m.geometry.dispose();});
    chunkMeshes.clear();dirtyChunks.clear();
    loadingIndicators.forEach(function(m){scene.remove(m);m.geometry.dispose();});
    loadingIndicators.clear();
    lastPCX=null;lastPCZ=null;
  }
  var visTimer=0;
  function updateVisibility(dt){
    visTimer+=dt;
    if(visTimer<VISIBILITY_UPDATE_INTERVAL)return;
    visTimer=0;
    var px=player.pos.x,pz=player.pos.z;
    var maxD=LOAD_RADIUS*CHUNK_SIZE*CULL_DISTANCE_MUL;
    var maxSq=maxD*maxD;
    chunkMeshes.forEach(function(mesh,key){
      var parts=key.split(',');
      var cx=parseInt(parts[0],10)*CHUNK_SIZE+CHUNK_SIZE/2;
      var cz=parseInt(parts[1],10)*CHUNK_SIZE+CHUNK_SIZE/2;
      var dx=cx-px,dz=cz-pz;
      mesh.visible=(dx*dx+dz*dz)<maxSq;
    });
  }

  /* ═══ 玩家 ═══ */
  var player={
    pos:{x:0.5,y:SEA_LEVEL+2,z:0.5},vel:{x:0,y:0,z:0},
    onGround:false,health:20,maxHealth:20,
    hunger:20,maxHunger:20,saturation:5,exhaustion:0,
    fallStartY:null,regenTimer:0,hungerTimer:0
  };
  var yaw=0,pitch=0,walkPhase=0,swingTime=0,bobPhase=0;

  function spawnPlayer(){
    var sx=0,sz=0;
    var cx=Math.floor(sx/CHUNK_SIZE),cz=Math.floor(sz/CHUNK_SIZE);
    if(!chunkData.has(ck(cx,cz)))chunkData.set(ck(cx,cz),genChunk(cx,cz));
    var sy=WORLD_MAX_Y-1;
    for(var y=WORLD_MAX_Y-1;y>=WORLD_MIN_Y;y--)if(isSolid(sx,y,sz)){sy=y;break;}
    player.pos.x=sx+0.5;player.pos.y=sy+1.05;player.pos.z=sz+0.5;
    player.vel.x=player.vel.y=player.vel.z=0;
    player.health=player.maxHealth;player.hunger=player.maxHunger;
    player.fallStartY=null;
    yaw=0;pitch=-0.10;flying=false;
  }
  function collide(axis,delta){
    if(delta===0)return;
    var p=player.pos;p[axis]+=delta;
    var minX=Math.floor(p.x-PLAYER_HALF),maxX=Math.floor(p.x+PLAYER_HALF);
    var minY=Math.floor(p.y+0.001),maxY=Math.floor(p.y+PLAYER_HEIGHT-0.001);
    var minZ=Math.floor(p.z-PLAYER_HALF),maxZ=Math.floor(p.z+PLAYER_HALF);
    for(var x=minX;x<=maxX;x++)for(var y=minY;y<=maxY;y++)for(var z=minZ;z<=maxZ;z++){
      if(!isSolid(x,y,z))continue;
      if(axis==='x'){if(delta>0)p.x=x-PLAYER_HALF-0.0001;else p.x=x+1+PLAYER_HALF+0.0001;player.vel.x=0;}
      else if(axis==='z'){if(delta>0)p.z=z-PLAYER_HALF-0.0001;else p.z=z+1+PLAYER_HALF+0.0001;player.vel.z=0;}
      else{if(delta>0){p.y=y-PLAYER_HEIGHT-0.0001;player.vel.y=0;}else{p.y=y+1+0.0001;player.vel.y=0;player.onGround=true;}}
      return;
    }
  }

  /* ═══ 输入 ═══ */
  var keys={},mouseHeld=[false,false,false];
  var breakTimer=0,placeTimer=0;
  function initInput(){
    window.addEventListener('keydown',function(e){
      if(chatOpen){
        if(e.key==='Escape'){closeChat();e.preventDefault();}
        else if(e.key==='Enter'){sendChat();e.preventDefault();}
        return;
      }
      var k=e.key.toLowerCase();keys[k]=true;
      if(e.code==='Space')keys[' ']=true;
      if(['arrowup','arrowdown','arrowleft','arrowright',' '].indexOf(k)>=0)e.preventDefault();
      if(appState!=='playing')return;
      if(k==='t'&&!inventoryOpen){openChat(false);e.preventDefault();return;}
      if(k==='/'&&!inventoryOpen){openChat(true);e.preventDefault();return;}
      if(k==='e'&&gameMode!=='spectator'){toggleInv();return;}
      if(k==='q'){if(inventoryOpen){dropCursorItem();e.preventDefault();return;}if(!chatOpen){dropSelectedItem();return;}}
      if(k==='m'&&!inventoryOpen){
        var ms=['creative','survival','adventure','spectator'];
        setGameMode(ms[(ms.indexOf(gameMode)+1)%ms.length]);return;
      }
      if(e.code==='Space'&&!inventoryOpen&&gameMode==='creative'){
        var now=performance.now();
        if(now-lastSpaceTap<280){flying=!flying;player.vel.y=0;toast(flying?'✦ 飞行模式：开启':'✦ 飞行模式：关闭');lastSpaceTap=0;}
        else lastSpaceTap=now;
      }
      var n=parseInt(k,10);
      if(!isNaN(n)&&n>=1&&n<=9&&!inventoryOpen)selectSlot(n-1);
    });
    window.addEventListener('keyup',function(e){var k=e.key.toLowerCase();keys[k]=false;if(e.code==='Space')keys[' ']=false;});
    window.addEventListener('blur',function(){for(var k in keys)keys[k]=false;mouseHeld[0]=mouseHeld[2]=false;});
    renderer.domElement.addEventListener('contextmenu',function(e){e.preventDefault();});
    renderer.domElement.addEventListener('mousedown',function(e){
      if(appState!=='playing'||inventoryOpen||chatOpen)return;
      e.preventDefault();
      if(e.button===0){mouseHeld[0]=true;breakTimer=0;doBreak();}
      if(e.button===2){mouseHeld[2]=true;placeTimer=0;doPlace();}
    });
    window.addEventListener('mouseup',function(e){
      if(e.button===0)mouseHeld[0]=false;
      if(e.button===2)mouseHeld[2]=false;
    });
    window.addEventListener('mousemove',function(e){
      if(!pointerLocked||appState!=='playing'||inventoryOpen||chatOpen)return;
      var sens=settings.sensitivity*0.001;
      yaw-=e.movementX*sens;
      var inv=settings.invertMouse?-1:1;
      pitch-=e.movementY*sens*inv;
      var lim=Math.PI/2-0.01;
      if(pitch>lim)pitch=lim;if(pitch<-lim)pitch=-lim;
    });
    window.addEventListener('wheel',function(e){
      if(appState!=='playing'||inventoryOpen||chatOpen)return;
      if(gameMode==='spectator')return;
      var dir=e.deltaY>0?1:-1;
      selectSlot(((selectedSlot+dir)%9+9)%9);
    },{passive:true});
    document.addEventListener('pointerlockchange',function(){
      pointerLocked=(document.pointerLockElement===renderer.domElement);
      if(!pointerLocked&&appState==='playing'&&!inventoryOpen&&!chatOpen&&hasFine)setAppState('paused');
    });
    document.addEventListener('mousemove',function(e){
      if(cursorItem){var el=$('cursorItem');el.style.left=e.clientX+'px';el.style.top=e.clientY+'px';}
    });
  }

  /* ═══ 触屏 ═══ */
  var moveTouchId=null,lookTouchId=null,lookTouchPos=null;
  var touchMoveX=0,touchMoveY=0;
  function initTouch(){
    if(!supportsTouch)return;
    var joyEl=$('moveJoystick'),stickEl=$('moveStick');
    if(!joyEl)return;
    var joyCX=0,joyCY=0,joyR=50;
    function updateJoy(cx,cy){
      var dx=cx-joyCX,dy=cy-joyCY,d=Math.hypot(dx,dy);
      if(d>joyR){dx=dx/d*joyR;dy=dy/d*joyR;}
      stickEl.style.transform='translate(calc(-50% + '+dx+'px), calc(-50% + '+dy+'px))';
      touchMoveX=dx/joyR;touchMoveY=dy/joyR;
    }
    joyEl.addEventListener('touchstart',function(e){
      if(appState!=='playing'||inventoryOpen)return;e.preventDefault();
      var t=e.changedTouches[0],r=joyEl.getBoundingClientRect();
      joyCX=r.left+r.width/2;joyCY=r.top+r.height/2;
      moveTouchId=t.identifier;updateJoy(t.clientX,t.clientY);
    },{passive:false});
    joyEl.addEventListener('touchmove',function(e){
      e.preventDefault();
      for(var i=0;i<e.changedTouches.length;i++)
        if(e.changedTouches[i].identifier===moveTouchId)updateJoy(e.changedTouches[i].clientX,e.changedTouches[i].clientY);
    },{passive:false});
    joyEl.addEventListener('touchend',function(e){
      for(var i=0;i<e.changedTouches.length;i++)
        if(e.changedTouches[i].identifier===moveTouchId){moveTouchId=null;touchMoveX=0;touchMoveY=0;stickEl.style.transform='translate(-50%,-50%)';}
    });
    var lookArea=$('mobileLookArea');
    if(lookArea){
      lookArea.addEventListener('touchstart',function(e){
        if(appState!=='playing'||inventoryOpen||lookTouchId!==null)return;
        var t=e.changedTouches[0];lookTouchId=t.identifier;lookTouchPos={x:t.clientX,y:t.clientY};
      },{passive:false});
      lookArea.addEventListener('touchmove',function(e){
        if(lookTouchId===null)return;
        for(var i=0;i<e.changedTouches.length;i++){
          var t=e.changedTouches[i];
          if(t.identifier===lookTouchId){
            var dx=t.clientX-lookTouchPos.x,dy=t.clientY-lookTouchPos.y;
            lookTouchPos.x=t.clientX;lookTouchPos.y=t.clientY;
            var sens=settings.sensitivity*0.0025;
            yaw-=dx*sens;pitch-=dy*sens;
            var lim=Math.PI/2-0.01;
            if(pitch>lim)pitch=lim;if(pitch<-lim)pitch=-lim;
          }
        }
        e.preventDefault();
      },{passive:false});
      lookArea.addEventListener('touchend',function(e){
        if(lookTouchId===null)return;
        for(var i=0;i<e.changedTouches.length;i++)
          if(e.changedTouches[i].identifier===lookTouchId)lookTouchId=null;
      });
    }
    function bindHold(id,cb,stop){
      var el=$(id);if(!el)return;
      el.addEventListener('touchstart',function(e){
        if(appState!=='playing'||inventoryOpen)return;e.preventDefault();if(cb)cb();
      },{passive:false});
      el.addEventListener('touchend',function(e){e.preventDefault();if(stop)stop();},{passive:false});
      el.addEventListener('touchcancel',function(e){e.preventDefault();if(stop)stop();},{passive:false});
    }
    bindHold('mBreakBtn',function(){mouseHeld[0]=true;breakTimer=0;doBreak();},function(){mouseHeld[0]=false;});
    bindHold('mPlaceBtn',function(){mouseHeld[2]=true;placeTimer=0;doPlace();},function(){mouseHeld[2]=false;});
    bindHold('mJumpBtn',function(){
      keys[' ']=true;
      var now=performance.now();
      if(gameMode==='creative'){
        if(now-lastSpaceTap<400){flying=!flying;player.vel.y=0;toast(flying?'✦ 飞行模式：开启':'✦ 飞行模式：关闭');lastSpaceTap=0;}
        else lastSpaceTap=now;
      }
    },function(){keys[' ']=false;});
    var fb=$('mFlyBtn');
    if(fb)fb.addEventListener('click',function(e){e.preventDefault();if(gameMode!=='creative'){toast('仅创造模式可飞行');return;}flying=!flying;player.vel.y=0;toast(flying?'✦ 飞行模式：开启':'✦ 飞行模式：关闭');});
    var ib=$('mInvBtn');
    if(ib)ib.addEventListener('click',function(e){e.preventDefault();if(gameMode!=='spectator')toggleInv();});
    var cb2=$('mChatBtn');
    if(cb2)cb2.addEventListener('click',function(e){e.preventDefault();if(appState==='playing')openChat(false);});
    var mb=$('mMenuBtn');
    if(mb)mb.addEventListener('click',function(e){e.preventDefault();if(appState==='playing')setAppState('paused');else if(appState==='paused')setAppState('playing');});
  }

  /* ═══ 界面管理 ═══ */
  var screenIds={
    mainMenu:'mainMenuScreen',multiplayer:'multiplayerScreen',
    createRoom:'createRoomScreen',worldSelect:'worldSelectScreen',
    createWorld:'createWorldScreen',settings:'settingsScreen',pause:'pauseScreen'
  };
  function setAppState(s){
    if(!s)s='mainMenu';
    appState=s;
    for(var k in screenIds){var el=$(screenIds[k]);if(el)el.classList.add('hidden');}
    if(screenIds[s]){var t=$(screenIds[s]);if(t)t.classList.remove('hidden');}
    var inGame=(s==='playing'||s==='paused'||s==='dead');
    $('bgDecor').classList.toggle('hidden',inGame);
    $('hudTop').style.display=inGame?'flex':'none';
    $('tips').style.display=(inGame&&!isTouchUI)?'block':'none';
    $('crosshair').style.display=(s==='playing'&&gameMode!=='spectator'&&!inventoryOpen&&!chatOpen)?'block':'none';
    $('hotbar').style.display=(inGame&&gameMode!=='spectator')?'flex':'none';
    $('healthBar').style.display=(inGame&&(gameMode==='survival'||gameMode==='hardcore'))?'block':'none';
    $('hungerBar').style.display=(inGame&&(gameMode==='survival'||gameMode==='hardcore'))?'block':'none';
    $('chatBox').classList.toggle('visible',inGame);
    $('playerList').style.display=(inGame&&isMultiplayer)?'flex':'none';
    $('mobileControls').classList.toggle('show',s==='playing'&&isTouchUI);
    if(s==='playing'){
      if(hasFine&&!document.pointerLockElement&&!inventoryOpen&&!chatOpen)
        try{renderer.domElement.requestPointerLock();}catch(e){}
    }else{
      if(document.pointerLockElement)document.exitPointerLock();
    }
  }
  function setGameMode(mode){
    var prev=gameMode;gameMode=mode;
    var names={creative:'创造',survival:'生存',spectator:'旁观',adventure:'冒险',hardcore:'极限'};
    $('hudMode').textContent='模式：'+(names[mode]||mode);
    if(mode!=='creative'&&mode!=='spectator')flying=false;
    if(mode==='spectator')flying=true;
    player.vel.y=0;player.fallStartY=null;
    if(prev!==mode&&appState==='playing')toast('✦ 已切换至'+(names[mode]||mode)+'模式');
    if(appState==='playing'||appState==='paused'||appState==='dead'){
      $('crosshair').style.display=(mode!=='spectator'&&!inventoryOpen&&!chatOpen)?'block':'none';
      $('hotbar').style.display=(mode!=='spectator')?'flex':'none';
      $('healthBar').style.display=(mode==='survival'||mode==='hardcore')?'block':'none';
      $('hungerBar').style.display=(mode==='survival'||mode==='hardcore')?'block':'none';
    }
  }
  function showLoad(){$('loadingScreen').classList.remove('hidden');$('loadingBar').style.width='0%';$('loadingStatus').textContent='正在准备...';}
  function setLoadProgress(c,t,s){$('loadingBar').style.width=(t>0?(c/t)*100:0)+'%';$('loadingStatus').textContent=s||('正在生成区块... '+c+' / '+t);}
  function hideLoad(){$('loadingScreen').classList.add('hidden');}

  /* ═══ 聊天 ═══ */
  function addChat(text,type){
    var el=document.createElement('div');
    el.className='chat-msg '+(type||'');el.innerHTML=text;
    $('chatBox').appendChild(el);
    while($('chatBox').children.length>10)$('chatBox').removeChild($('chatBox').firstChild);
    setTimeout(function(){
      if(el.parentNode){el.style.transition='opacity .5s';el.style.opacity='0';
        setTimeout(function(){if(el.parentNode)el.parentNode.removeChild(el);},500);}
    },20000);
  }
  function openChat(isCmd){
    if(appState!=='playing')return;
    chatOpen=true;$('chatInput').classList.add('visible');
    var f=$('chatInputField');f.value=isCmd?'/':'';
    $('chatPrefix').textContent=isCmd?'/':'>';
    if(document.pointerLockElement)document.exitPointerLock();
    setTimeout(function(){f.focus();},10);
  }
  function closeChat(){
    chatOpen=false;$('chatInput').classList.remove('visible');
    $('chatInputField').value='';
    if(appState==='playing'&&!inventoryOpen&&hasFine&&!document.pointerLockElement)
      renderer.domElement.requestPointerLock();
  }
  function sendChat(){
    var f=$('chatInputField'),text=f.value.trim();
    if(text===''){closeChat();return;}
    if(text.charAt(0)==='/')execCmd(text.slice(1));
    else{
      addChat('<span class="sender">'+escHtml(myPlayerName)+'</span> '+escHtml(text),'player');
      if(isMultiplayer&&net&&net.connected)net.sendChat(text);
    }
    f.value='';closeChat();
  }
  function execCmd(cmdStr){
    var parts=cmdStr.trim().split(/\s+/),cmd=parts[0].toLowerCase(),args=parts.slice(1);
    switch(cmd){
      case 'help':addChat('指令：/help /seed /gamemode /tp /kill /spawn /list /clear','system');break;
      case 'seed':addChat('世界种子：'+WORLD_SEED,'success');break;
      case 'gamemode':case 'gm':{
        var mode=(args[0]||'').toLowerCase();
        var mm={'0':'survival','1':'creative','2':'adventure','3':'spectator','s':'survival','c':'creative','a':'adventure','sp':'spectator'};
        mode=mm[mode]||mode;
        if(['creative','survival','adventure','spectator'].indexOf(mode)>=0){setGameMode(mode);addChat('已切换 '+mode,'success');}
        else addChat('用法：/gamemode <模式>','error');
        break;
      }
      case 'tp':
        if(args.length===3){
          var tx=parseFloat(args[0]),ty=parseFloat(args[1]),tz=parseFloat(args[2]);
          if(!isNaN(tx)&&!isNaN(ty)&&!isNaN(tz)){player.pos.x=tx+0.5;player.pos.y=ty;player.pos.z=tz+0.5;player.vel.y=0;addChat('已传送','success');}
          else addChat('坐标必须是数字','error');
        }else addChat('用法：/tp <x> <y> <z>','error');
        break;
      case 'clear':$('chatBox').innerHTML='';break;
      case 'kill':applyDamage(20);addChat('已自杀','system');break;
      case 'spawn':spawnPlayer();updateChunks(true);addChat('已回出生点','success');break;
      case 'list':
        if(isMultiplayer&&net){
          var names=[myPlayerName+' (你)'];
          net.remotePlayers.forEach(function(p){names.push(p.name);});
          addChat('在线 ('+names.length+'/'+(currentRoom?currentRoom.max_players:1)+')：'+names.join(', '),'system');
        }else addChat('在线 (1/1)：'+myPlayerName,'system');
        break;
      default:addChat('未知指令：/'+cmd,'error');
    }
  }

  /* ═══ UI 绑定 ═══ */
  function initUI(){
    var btn;
    btn=$('singlePlayerBtn');if(btn)btn.addEventListener('click',function(){refreshWorlds();setAppState('worldSelect');});
    btn=$('multiPlayerBtn');if(btn)btn.addEventListener('click',function(){refreshRooms();setAppState('multiplayer');});
    btn=$('optionsBtn');if(btn)btn.addEventListener('click',function(){prevScreen='mainMenu';setAppState('settings');});
    btn=$('quitGameBtn');if(btn)btn.addEventListener('click',function(){if(confirm('确定要退出游戏吗？')){window.close();setTimeout(function(){setAppState('mainMenu');},100);}});
    btn=$('worldBackBtn');if(btn)btn.addEventListener('click',function(){setAppState('mainMenu');});
    btn=$('createWorldBtn');if(btn)btn.addEventListener('click',function(){$('newWorldName').value='新的世界';$('newWorldSeed').value='';setAG('createModeGroup','survival');setAG('createDifficultyGroup','normal');setAG('createTypeGroup','default');setAppState('createWorld');});
    btn=$('createHeaderBack');if(btn)btn.addEventListener('click',function(){setAppState('worldSelect');});
    btn=$('createCancelBtn');if(btn)btn.addEventListener('click',function(){setAppState('worldSelect');});
    btn=$('createConfirmBtn');if(btn)btn.addEventListener('click',function(){
      var name=$('newWorldName').value.trim()||'新的世界';
      var ss=$('newWorldSeed').value.trim(),seed;
      if(ss==='')seed=Math.floor(Math.random()*99999999)+1;
      else{var n=parseInt(ss,10);
        if(!isNaN(n)&&String(n)===ss)seed=n;
        else{seed=0;for(var i=0;i<ss.length;i++)seed=(seed*31+ss.charCodeAt(i))|0;seed=Math.abs(seed)%99999999+1;}}
      var w={id:'w_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),
        name:name,seed:seed,gameMode:getAG('createModeGroup'),difficulty:getAG('createDifficultyGroup'),
        worldType:getAG('createTypeGroup'),
        createdAt:Date.now(),lastPlayedAt:0,playerPos:null,playerYaw:0,playerPitch:0};
      worlds.push(w);saveWorlds();enterWorld(w);
    });
    ['createModeGroup','createDifficultyGroup','createTypeGroup'].forEach(function(gid){
      var g=$(gid);if(!g)return;var bs=g.querySelectorAll('.option-btn');
      for(var i=0;i<bs.length;i++)bs[i].addEventListener('click',function(){setAG(gid,this.getAttribute('data-value'));});
    });
    btn=$('multiBackBtn');if(btn)btn.addEventListener('click',function(){setAppState('mainMenu');});
    btn=$('refreshRoomsBtn');if(btn)btn.addEventListener('click',refreshRooms);
    btn=$('createRoomBtn');if(btn)btn.addEventListener('click',function(){
      if(worlds.length===0){toast('请先创建单人存档');return;}
      $('roomNameInput').value='我的房间';$('roomHostInput').value=myPlayerName;
      setAG('maxPlayersGroup','10');setAG('visibilityGroup','public');
      selSaveIdx=0;refreshSaveList();setAppState('createRoom');
    });
    btn=$('createRoomBackBtn');if(btn)btn.addEventListener('click',function(){setAppState('multiplayer');});
    btn=$('createRoomCancelBtn');if(btn)btn.addEventListener('click',function(){setAppState('multiplayer');});
    btn=$('createRoomConfirmBtn');if(btn)btn.addEventListener('click',confirmCreateRoom);
    ['maxPlayersGroup','visibilityGroup'].forEach(function(gid){
      var g=$(gid);if(!g)return;var bs=g.querySelectorAll('.option-btn');
      for(var i=0;i<bs.length;i++)bs[i].addEventListener('click',function(){setAG(gid,this.getAttribute('data-value'));});
    });
    buildSettings();
    btn=$('settingsDoneBtn');if(btn)btn.addEventListener('click',closeSettings);
    btn=$('settingsCloseBtn');if(btn)btn.addEventListener('click',closeSettings);
    btn=$('resumeBtn');if(btn)btn.addEventListener('click',function(){setAppState('playing');});
    btn=$('pauseOptionsBtn');if(btn)btn.addEventListener('click',function(){prevScreen='paused';setAppState('settings');});
    btn=$('saveAndQuitBtn');if(btn)btn.addEventListener('click',function(){
      if(isMultiplayer&&net){net.disconnect();isMultiplayer=false;currentRoom=null;clearAllChunks();setAppState('multiplayer');refreshRooms();}
      else{captureWorld();clearAllChunks();currentWorld=null;refreshWorlds();setAppState('worldSelect');}
    });
    btn=$('invCloseBtn');if(btn)btn.addEventListener('click',closeInv);
    var invScreen=$('inventoryScreen');
    if(invScreen)invScreen.addEventListener('click',function(e){if(e.target===invScreen)closeInv();});
  }
  function setAG(gid,val){var g=$(gid);if(!g)return;var bs=g.querySelectorAll('.option-btn');for(var i=0;i<bs.length;i++)bs[i].classList.toggle('active',bs[i].getAttribute('data-value')===val);}
  function getAG(gid){var g=$(gid);if(!g)return null;var bs=g.querySelectorAll('.option-btn');for(var i=0;i<bs.length;i++)if(bs[i].classList.contains('active'))return bs[i].getAttribute('data-value');return null;}

  /* ═══ 世界列表 ═══ */
  function fmtDate(ts){if(!ts)return '从未';var d=Date.now()-ts;
    if(d<60000)return '刚刚';if(d<3600000)return Math.floor(d/60000)+' 分钟前';
    if(d<86400000)return Math.floor(d/3600000)+' 小时前';
    var t=new Date(ts);return t.getFullYear()+'-'+String(t.getMonth()+1).padStart(2,'0')+'-'+String(t.getDate()).padStart(2,'0');}
  function modeLabel(m){return{survival:'生存',creative:'创造',hardcore:'极限',adventure:'冒险'}[m]||'生存';}
  function typeLabel(t){return{default:'默认',flat:'超平坦',largeBiomes:'大型群系',amplified:'放大化'}[t]||'默认';}
  function refreshWorlds(){
    var list=$('worldList');if(!list)return;list.innerHTML='';
    if(worlds.length===0){
      var empty=document.createElement('div');empty.className='world-empty';
      empty.innerHTML='<div>还没有世界</div><div class="hint">点击下方按钮创建新世界</div>';
      list.appendChild(empty);return;
    }
    var sorted=worlds.slice().sort(function(a,b){return(b.lastPlayedAt||0)-(a.lastPlayedAt||0);});
    sorted.forEach(function(w){
      var card=document.createElement('div');card.className='world-card';
      var thumb=document.createElement('div');thumb.className='world-thumb';card.appendChild(thumb);
      var info=document.createElement('div');info.className='world-info';
      var name=document.createElement('div');name.className='name';name.textContent=w.name||'未命名';info.appendChild(name);
      var meta=document.createElement('div');meta.className='meta';
      var mt=document.createElement('span');mt.className='tag '+(w.gameMode||'survival');mt.textContent=modeLabel(w.gameMode);meta.appendChild(mt);
      var ts=document.createElement('span');ts.textContent=typeLabel(w.worldType);meta.appendChild(ts);
      var ss=document.createElement('span');ss.textContent='种子: '+w.seed;meta.appendChild(ss);
      var tm=document.createElement('span');tm.textContent='游玩: '+fmtDate(w.lastPlayedAt);meta.appendChild(tm);
      info.appendChild(meta);card.appendChild(info);
      var actions=document.createElement('div');actions.className='world-actions-card';
      var eb=document.createElement('button');eb.className='mc-btn primary small';eb.textContent='进入';
      eb.addEventListener('click',function(){enterWorld(w);});actions.appendChild(eb);
      var db=document.createElement('button');db.className='mc-btn danger small';db.textContent='删除';
      db.addEventListener('click',function(){if(confirm('确定删除世界「'+(w.name||'未命名')+'」吗？')){var i=worlds.indexOf(w);if(i>=0)worlds.splice(i,1);saveWorlds();refreshWorlds();}});
      actions.appendChild(db);card.appendChild(actions);list.appendChild(card);
    });
  }
  function enterWorld(w){
    currentWorld=w;isMultiplayer=false;currentRoom=null;
    WORLD_SEED=w.seed;worldType=w.worldType||'default';difficulty=w.difficulty||'normal';
    clearAllChunks();setGameMode(w.gameMode||'survival');
    showLoad();setLoadProgress(0,1,'正在准备世界...');
    setTimeout(function(){
      if(w.playerPos){
        player.pos.x=w.playerPos.x;player.pos.y=w.playerPos.y;player.pos.z=w.playerPos.z;
        yaw=w.playerYaw||0;pitch=w.playerPitch||0;
        player.vel.x=player.vel.y=player.vel.z=0;player.health=player.maxHealth;
      }else spawnPlayer();
      var total=LOAD_RADIUS*2*LOAD_RADIUS*2;
      updateChunks(true,true);
      var steps=0;
      function step(){
        processDirty();var rem=dirtyChunks.size;
        setLoadProgress(total-rem,total,rem>0?'构建中... ('+rem+')':'完成');
        if(rem>0&&steps<200){steps++;requestAnimationFrame(step);}
        else{hideLoad();setAppState('playing');addChat('欢迎来到 '+escHtml(w.name),'system');}
      }
      step();
    },50);
  }
  function captureWorld(){
    if(!currentWorld||isMultiplayer)return;
    currentWorld.playerPos={x:player.pos.x,y:player.pos.y,z:player.pos.z};
    currentWorld.playerYaw=yaw;currentWorld.playerPitch=pitch;
    currentWorld.gameMode=gameMode;currentWorld.lastPlayedAt=Date.now();
    saveWorlds();
  }

  /* ═══ 多人游戏 ═══ */
  var roomsChannel=null,selSaveIdx=0;
  function refreshRooms(){
    var list=$('roomList');if(!list)return;
    list.innerHTML='<div class="room-empty"><div class="cloud-icon">☁</div><div>正在加载…</div></div>';
    if(!supabaseReady){
      if($('roomServerStatus'))$('roomServerStatus').textContent='离线';
      list.innerHTML='<div class="room-empty"><div class="cloud-icon">⚠</div><div>Supabase 未连接</div></div>';
      return;
    }
    if($('roomServerStatus'))$('roomServerStatus').textContent='☁ 已连接';
    var fiveMinAgo=Date.now()-5*60*1000;
    sbClient.from('rooms').delete().lt('last_active',fiveMinAgo).then(function(){});
    sbClient.from('rooms').select('*').eq('status','waiting').order('created_at',{ascending:false}).limit(50)
      .then(function(res){
        if(res.error){list.innerHTML='<div class="room-empty"><div class="cloud-icon">⚠</div><div>加载失败</div></div>';return;}
        renderRooms(res.data||[]);subscribeRooms();
      });
  }
  function renderRooms(rooms){
    var list=$('roomList');if(!list)return;list.innerHTML='';
    if(!rooms||rooms.length===0){list.innerHTML='<div class="room-empty"><div class="cloud-icon">☁</div><div>暂无房间</div><div class="hint">点击下方按钮创建</div></div>';return;}
    rooms.forEach(function(room){
      var card=document.createElement('div');card.className='room-card';
      var full=room.current_players>=room.max_players;
      if(full)card.classList.add('full');
      var icon=document.createElement('div');icon.className='room-icon';icon.textContent='🌍';card.appendChild(icon);
      var info=document.createElement('div');info.className='room-info';
      var name=document.createElement('div');name.className='name';name.textContent=room.name;info.appendChild(name);
      var meta=document.createElement('div');meta.className='meta';
      var ps=document.createElement('span');ps.className='players'+(full?' full':'');ps.textContent='👤 '+room.current_players+' / '+room.max_players;meta.appendChild(ps);
      var hs=document.createElement('span');hs.textContent='房主: '+(room.host_name||'未知');meta.appendChild(hs);
      var ss=document.createElement('span');ss.textContent='种子: '+room.seed;meta.appendChild(ss);
      info.appendChild(meta);card.appendChild(info);
      var actions=document.createElement('div');actions.className='room-actions';
      var jb=document.createElement('button');jb.className='mc-btn primary small';jb.textContent=full?'已满':'加入';jb.disabled=full;
      jb.addEventListener('click',function(){joinRoom(room);});actions.appendChild(jb);
      card.appendChild(actions);list.appendChild(card);
    });
  }
  function subscribeRooms(){
    if(!supabaseReady||roomsChannel)return;
    roomsChannel=sbClient.channel('rooms-list').on('postgres_changes',{event:'*',schema:'public',table:'rooms'},function(){
      if(appState==='multiplayer')refreshRooms();
    }).subscribe();
  }
  function refreshSaveList(){
    var list=$('saveListForRoom');if(!list)return;list.innerHTML='';
    worlds.forEach(function(w,i){
      var card=document.createElement('div');
      card.className='save-card'+(i===selSaveIdx?' selected':'');
      var thumb=document.createElement('div');thumb.className='save-thumb';card.appendChild(thumb);
      var info=document.createElement('div');info.className='save-info';
      var name=document.createElement('div');name.className='name';name.textContent=w.name||'未命名';info.appendChild(name);
      var meta=document.createElement('div');meta.className='meta';
      meta.textContent=modeLabel(w.gameMode)+' · 种子 '+w.seed;info.appendChild(meta);
      card.appendChild(info);
      card.addEventListener('click',function(){selSaveIdx=i;refreshSaveList();});
      list.appendChild(card);
    });
  }
  function confirmCreateRoom(){
    if(worlds.length===0){toast('没有可用存档');return;}
    var save=worlds[selSaveIdx];
    if(!save){toast('请选择存档');return;}
    if(!supabaseReady){toast('Supabase 未连接');return;}
    var rn=$('roomNameInput').value.trim()||'我的房间';
    var hn=$('roomHostInput').value.trim()||myPlayerName;
    var mp=parseInt(getAG('maxPlayersGroup'),10)||10;
    var vis=getAG('visibilityGroup')||'public';
    myPlayerName=hn;storage.set('mc3d_player_name',hn);
    var roomData={
      name:rn,host_name:hn,seed:save.seed,
      world_type:save.worldType||'default',game_mode:save.gameMode||'survival',
      difficulty:save.difficulty||'normal',max_players:mp,current_players:1,
      status:'waiting',visibility:vis,cheats:true,
      created_at:Date.now(),last_active:Date.now()
    };
    $('createRoomConfirmBtn').disabled=true;
    $('createRoomConfirmBtn').textContent='创建中...';
    sbClient.from('rooms').insert([roomData]).select().then(function(res){
      $('createRoomConfirmBtn').disabled=false;
      $('createRoomConfirmBtn').textContent='创建并进入';
      if(res.error){toast('创建失败：'+res.error.message);return;}
      var room=res.data[0];
      sbClient.from('room_players').insert([{room_id:room.id,player_name:hn,x:0.5,y:SEA_LEVEL+2,z:0.5}]).then(function(){
        enterMP(room,save,true);
      });
    });
  }
  function joinRoom(room){
    if(room.current_players>=room.max_players){toast('房间已满');return;}
    if(!supabaseReady){toast('Supabase 未连接');return;}
    var name=prompt('输入你的昵称：',myPlayerName);
    if(!name)return;
    myPlayerName=name.trim()||myPlayerName;
    storage.set('mc3d_player_name',myPlayerName);
    sbClient.from('rooms').update({current_players:room.current_players+1,last_active:Date.now()}).eq('id',room.id).then(function(){
      sbClient.from('room_players').insert([{room_id:room.id,player_name:myPlayerName,x:0.5,y:SEA_LEVEL+2,z:0.5}]).then(function(){
        var save={seed:room.seed,worldType:room.world_type,gameMode:room.game_mode,difficulty:room.difficulty};
        enterMP(room,save,false);
      });
    });
  }
  function enterMP(room,save,isHost){
    currentRoom=room;currentRoom.isHost=!!isHost;isMultiplayer=true;
    WORLD_SEED=save.seed;worldType=save.worldType||'default';difficulty=save.difficulty||'normal';
    clearAllChunks();setGameMode(save.gameMode||'survival');
    showLoad();setLoadProgress(0,1,'正在准备世界...');
    setTimeout(function(){
      spawnPlayer();
      var total=LOAD_RADIUS*2*LOAD_RADIUS*2;
      updateChunks(true,true);
      var steps=0;
      function step(){
        processDirty();var rem=dirtyChunks.size;
        setLoadProgress(total-rem,total,rem>0?'构建中... ('+rem+')':'完成');
        if(rem>0&&steps<200){steps++;requestAnimationFrame(step);}
        else{
          hideLoad();
          net.connect(room,isHost);
          setAppState('playing');
          addChat('已加入房间「'+escHtml(room.name)+'」'+(isHost?'（房主）':''),'success');
          updatePlayerList();
        }
      }
      step();
    },50);
  }

  /* ═══ 设置 ═══ */
  function buildSettings(){
    var SDEFS=[
      {id:'graphics',name:'图形',items:[
        {key:'fov',label:'视角广度',type:'slider',min:30,max:110,step:1,fmt:function(v){return v+'°';}},
        {key:'brightness',label:'亮度',type:'slider',min:0,max:100,step:1,fmt:function(v){return v+'%';}},
        {key:'renderDistance',label:'渲染距离',type:'slider',min:2,max:32,step:2,fmt:function(v){return v+' 区块';}},
        {key:'maxFramerate',label:'最大帧率',type:'slider',min:20,max:260,step:10,fmt:function(v){return v>=260?'无限':v+' fps';}},
        {key:'viewBobbing',label:'视角摇晃',type:'toggle'},
        {key:'showSun',label:'显示太阳',type:'toggle'},
        {key:'showClouds',label:'显示云层',type:'toggle'}
      ]},
      {id:'controls',name:'控制',items:[
        {key:'sensitivity',label:'鼠标灵敏度',type:'slider',min:0.5,max:10,step:0.1,fmt:function(v){return v.toFixed(1);}},
        {key:'invertMouse',label:'鼠标反转',type:'toggle'},
        {key:'autoJump',label:'自动跳跃',type:'toggle'}
      ]}
    ];
    var tabsEl=$('settingsTabs'),panelsEl=$('settingsPanels');
    if(!tabsEl||!panelsEl)return;
    tabsEl.innerHTML='';panelsEl.innerHTML='';
    SDEFS.forEach(function(def,i){
      var btn=document.createElement('button');
      btn.className='tab-btn'+(i===0?' active':'');btn.textContent=def.name;
      btn.addEventListener('click',function(){
        var tabs=tabsEl.querySelectorAll('.tab-btn');
        for(var t=0;t<tabs.length;t++)tabs[t].classList.toggle('active',tabs[t]===btn);
        var panels=panelsEl.querySelectorAll('.settings-panel');
        for(var p=0;p<panels.length;p++)panels[p].classList.toggle('active',panels[p].getAttribute('data-panel')===def.id);
      });
      tabsEl.appendChild(btn);
      var panel=document.createElement('div');
      panel.className='settings-panel'+(i===0?' active':'');
      panel.setAttribute('data-panel',def.id);
      def.items.forEach(function(item){
        var row=document.createElement('div');row.className='setting-row';
        var label=document.createElement('label');label.textContent=item.label;row.appendChild(label);
        if(item.type==='slider'){
          var input=document.createElement('input');
          input.type='range';input.min=item.min;input.max=item.max;input.step=item.step;
          input.value=settings[item.key];row.appendChild(input);
          var val=document.createElement('span');val.className='valBox';
          val.textContent=item.fmt?item.fmt(settings[item.key]):settings[item.key];row.appendChild(val);
          input.addEventListener('input',function(){
            var v=parseFloat(input.value);settings[item.key]=v;
            val.textContent=item.fmt?item.fmt(v):v;
            onSettingChange(item.key,v);saveSettings();
          });
        }else if(item.type==='toggle'){
          var btn3=document.createElement('button');
          btn3.className='toggle-settings-btn'+(settings[item.key]?' on':'');
          btn3.textContent=settings[item.key]?'开启':'关闭';row.appendChild(btn3);
          btn3.addEventListener('click',function(){
            var v=settings[item.key]?0:1;settings[item.key]=v;
            btn3.textContent=v?'开启':'关闭';btn3.classList.toggle('on',!!v);
            onSettingChange(item.key,v);saveSettings();
          });
        }
        panel.appendChild(row);
      });
      panelsEl.appendChild(panel);
    });
  }
  function onSettingChange(key,value){
    switch(key){
      case 'fov':if(camera){camera.fov=value;camera.updateProjectionMatrix();}break;
      case 'brightness':applyBrightness();break;
      case 'renderDistance':
        LOAD_RADIUS=Math.max(1,Math.min(16,Math.round(value/2)));
        if(appState==='playing'||appState==='paused')updateChunks(true);
        break;
      case 'showSun':if(sunMesh)sunMesh.visible=!!value;if(sunGlow)sunGlow.visible=!!value;break;
      case 'showClouds':if(cloudPlane)cloudPlane.visible=!!value;break;
    }
  }
  function closeSettings(){
    LOAD_RADIUS=Math.max(1,Math.min(16,Math.round(settings.renderDistance/2)));
    if(camera){camera.fov=settings.fov;camera.updateProjectionMatrix();}
    applyBrightness();saveSettings();
    if(prevScreen==='paused')setAppState('paused');else setAppState('mainMenu');
  }

  /* ═══════════════════════════════════════════════════
     物品栏（重做：默认空、合成、光标跟随、Shift、Q、护甲、配方）
     ═══════════════════════════════════════════════════ */
  var hotbarSlots=[null,null,null,null,null,null,null,null,null];  // ★ 默认全空
  var BACKPACK_SIZE=36;
  var backpackSlots=[];
  for(var _bi=0;_bi<BACKPACK_SIZE;_bi++)backpackSlots.push(null);   // ★ 默认全空
  var armorSlots=[null,null,null,null];
  var craftSlots=[null,null,null,null,null,null,null,null,null];
  var selectedSlot=0,cursorItem=null,craftResultItem=null;

  function makeIcon(bid){
    var def=BLOCKS[bid];if(!def)return null;
    var tile=def.side;
    var col=tile%ATLAS_COLS,row=Math.floor(tile/ATLAS_COLS);
    var c=document.createElement('canvas');c.width=32;c.height=32;
    var g=c.getContext('2d');g.imageSmoothingEnabled=false;
    g.drawImage(atlasCanvas,col*TILE_PX,row*TILE_PX,TILE_PX,TILE_PX,0,0,32,32);
    return c;
  }
  function buildHotbar(){
    var hotbarEl=$('hotbar');if(!hotbarEl)return;
    hotbarEl.innerHTML='';
    for(var i=0;i<9;i++)(function(idx){
      var slot=document.createElement('div');slot.className='slot';
      updateHotbarSlot(slot,hotbarSlots[idx]);
      slot.addEventListener('click',function(){selectSlot(idx);});
      hotbarEl.appendChild(slot);
    })(i);
    selectSlot(0);
  }
  function updateHotbarSlot(el,item){
    while(el.firstChild)el.removeChild(el.firstChild);
    if(item&&item.id&&item.count>0){
      var icon=makeIcon(item.id);
      if(icon){
        el.appendChild(icon);
        var b=document.createElement('span');b.className='count';b.textContent=item.count;
        el.appendChild(b);el.title=BLOCKS[item.id].name+' x'+item.count;
      }
    }else el.title='空';
  }
  function selectSlot(i){
    if(i<0||i>=9)return;
    selectedSlot=i;
    var hotbarEl=$('hotbar');if(!hotbarEl)return;
    var kids=hotbarEl.children;
    for(var j=0;j<kids.length;j++)kids[j].classList.toggle('active',j===i);
  }
  function getSelectedBlockId(){
    var item=hotbarSlots[selectedSlot];
    if(gameMode==='creative')return item?item.id:1;
    return item?item.id:0;
  }
  function addItem(bid,count){
    count=count||1;
    if(!BLOCKS[bid])return false;
    for(var i=0;i<9;i++){var s=hotbarSlots[i];
      if(s&&s.id===bid&&s.count<64){s.count=Math.min(64,s.count+count);updateHotbarSlot($('hotbar').children[i],s);return true;}}
    for(var j=0;j<BACKPACK_SIZE;j++){var b=backpackSlots[j];
      if(b&&b.id===bid&&b.count<64){b.count=Math.min(64,b.count+count);return true;}}
    for(var k=0;k<9;k++){if(!hotbarSlots[k]||hotbarSlots[k].count<=0){
      hotbarSlots[k]={id:bid,count:Math.min(64,count)};updateHotbarSlot($('hotbar').children[k],hotbarSlots[k]);return true;}}
    for(var m=0;m<BACKPACK_SIZE;m++){if(!backpackSlots[m]||backpackSlots[m].count<=0){
      backpackSlots[m]={id:bid,count:Math.min(64,count)};return true;}}
    toast('背包已满');return false;
  }
  function dropSelectedItem(){
    var item=hotbarSlots[selectedSlot];
    if(!item||!item.id){toast('手上没有物品');return;}
    addChat('丢弃：'+BLOCKS[item.id].name+' x1','system');
    item.count--;
    if(item.count<=0)hotbarSlots[selectedSlot]=null;
    updateHotbarSlot($('hotbar').children[selectedSlot],hotbarSlots[selectedSlot]);
  }
  function dropCursorItem(){
    if(!cursorItem){toast('光标上没有物品');return;}
    addChat('丢弃：'+BLOCKS[cursorItem.id].name+' x'+cursorItem.count,'system');
    cursorItem=null;hideCursorItem();buildInventoryUI();
  }
  function hideCursorItem(){var el=$('cursorItem');if(el)el.style.display='none';}
  function showCursorItem(item){
    var el=$('cursorItem');if(!el)return;
    while(el.firstChild)el.removeChild(el.firstChild);
    var icon=makeIcon(item.id);
    if(icon)el.appendChild(icon);
    if(item.count>1){var cnt=document.createElement('div');cnt.className='cnt';cnt.textContent=item.count;el.appendChild(cnt);}
    el.style.display='block';
    var e=window.event;
    if(e){el.style.left=e.clientX+'px';el.style.top=e.clientY+'px';}
  }
  function toggleInv(){if(inventoryOpen)closeInv();else openInv();}
  function openInv(){
    if(appState!=='playing')return;
    inventoryOpen=true;
    var el=$('inventoryScreen');if(el)el.classList.remove('hidden');
    $('crosshair').style.display='none';
    buildInventoryUI();
    if(document.pointerLockElement)document.exitPointerLock();
    if($('mobileControls'))$('mobileControls').classList.remove('show');
    hideCursorItem();
  }
  function closeInv(){
    // 光标物品归还背包
    if(cursorItem){
      var placed=false;
      for(var i=0;i<9&&!placed;i++){var s=hotbarSlots[i];
        if(s&&s.id===cursorItem.id&&s.count<64){var mv=Math.min(64-s.count,cursorItem.count);s.count+=mv;cursorItem.count-=mv;if(cursorItem.count<=0){cursorItem=null;placed=true;}}}
      for(var j=0;j<BACKPACK_SIZE&&!placed;j++){var b=backpackSlots[j];
        if(b&&b.id===cursorItem.id&&b.count<64){var mv2=Math.min(64-b.count,cursorItem.count);b.count+=mv2;cursorItem.count-=mv2;if(cursorItem.count<=0){cursorItem=null;placed=true;}}}
      for(var k=0;k<9&&!placed&&cursorItem;k++)if(!hotbarSlots[k]){hotbarSlots[k]=cursorItem;cursorItem=null;placed=true;}
      for(var m=0;m<BACKPACK_SIZE&&!placed&&cursorItem;m++)if(!backpackSlots[m]){backpackSlots[m]=cursorItem;cursorItem=null;placed=true;}
      if(cursorItem){toast('背包已满，物品被丢弃');cursorItem=null;}
      hideCursorItem();
      var kids=$('hotbar').children;
      for(var n=0;n<kids.length;n++)updateHotbarSlot(kids[n],hotbarSlots[n]);
    }
    inventoryOpen=false;
    var el=$('inventoryScreen');if(el)el.classList.add('hidden');
    if(gameMode!=='spectator')$('crosshair').style.display='block';
    if(appState==='playing'){
      if(isTouchUI){if($('mobileControls'))$('mobileControls').classList.add('show');}
      else if(hasFine&&!document.pointerLockElement)renderer.domElement.requestPointerLock();
    }
  }

  /* 单元格点击（左键）：光标为空则拾起，光标有物品则放下/交换/叠加 */
  function handleSlotLeftClick(slots,idx,type){
    var slot=slots[idx];
    if(cursorItem){
      if(!slot){slots[idx]=cursorItem;cursorItem=null;hideCursorItem();}
      else if(slot.id===cursorItem.id&&slot.count<64){
        var mv=Math.min(64-slot.count,cursorItem.count);
        slot.count+=mv;cursorItem.count-=mv;
        if(cursorItem.count<=0){cursorItem=null;hideCursorItem();}
        else showCursorItem(cursorItem);
      }else{
        var tmp=slots[idx];slots[idx]=cursorItem;cursorItem=tmp;
        showCursorItem(cursorItem);
      }
    }else if(slot){
      cursorItem=slot;slots[idx]=null;showCursorItem(cursorItem);
    }
    afterSlotChange(type);
  }
  /* 单元格右键：取一半 / 放一个 */
  function handleSlotRightClick(slots,idx,type){
    var slot=slots[idx];
    if(cursorItem){
      if(!slot){slots[idx]={id:cursorItem.id,count:1};cursorItem.count--;
        if(cursorItem.count<=0){cursorItem=null;hideCursorItem();}else showCursorItem(cursorItem);}
      else if(slot.id===cursorItem.id&&slot.count<64){slot.count++;cursorItem.count--;
        if(cursorItem.count<=0){cursorItem=null;hideCursorItem();}else showCursorItem(cursorItem);}
    }else if(slot){
      var half=Math.ceil(slot.count/2);
      cursorItem={id:slot.id,count:half};
      slot.count-=half;
      if(slot.count<=0)slots[idx]=null;
      showCursorItem(cursorItem);
    }
    afterSlotChange(type);
  }
  /* Shift+左键：快速移动到目标容器 */
  function handleShiftClick(fromSlots,idx,toSlots,type){
    var item=fromSlots[idx];if(!item)return;
    var moved=false;
    for(var i=0;i<toSlots.length&&item.count>0;i++){
      var s=toSlots[i];
      if(s&&s.id===item.id&&s.count<64){
        var mv=Math.min(64-s.count,item.count);
        s.count+=mv;item.count-=mv;moved=true;
      }
    }
    if(item.count>0)for(var j=0;j<toSlots.length&&item.count>0;j++){
      if(!toSlots[j]){toSlots[j]={id:item.id,count:item.count};item.count=0;moved=true;}
    }
    if(item.count<=0)fromSlots[idx]=null;
    afterSlotChange(type);
  }
  function afterSlotChange(type){
    if(type==='hotbar'){
      var kids=$('hotbar').children;
      for(var i=0;i<kids.length;i++)updateHotbarSlot(kids[i],hotbarSlots[i]);
    }
    buildInventoryUI();
  }
  function checkRecipe(){
    craftResultItem=null;
    var counts={},nonEmpty=0;
    for(var i=0;i<9;i++){var s=craftSlots[i];if(s){counts[s.id]=(counts[s.id]||0)+s.count;nonEmpty++;}}
    if(nonEmpty===0)return;
    for(var r=0;r<RECIPES.length;r++){
      var rec=RECIPES[r];
      var ok=true,recCount=Object.keys(rec.ingredients).length;
      for(var id in rec.ingredients)if((counts[id]||0)<rec.ingredients[id]){ok=false;break;}
      if(Object.keys(counts).length!==recCount)ok=false;
      for(var cid in counts)if(!rec.ingredients[cid]){ok=false;break;}
      if(ok){craftResultItem={id:rec.result,count:rec.count};return;}
    }
  }
  function buildInventoryUI(){
    var cg=$('craftGrid'),cgResult=$('craftResult');
    var bg=$('invGridBackpack'),hg=$('invGridHotbar'),ag=$('armorCol');
    var rl=$('recipeList');
    if(!cg)return;
    cg.innerHTML='';cgResult.innerHTML='';bg.innerHTML='';hg.innerHTML='';ag.innerHTML='';rl.innerHTML='';

    // 合成格
    for(var i=0;i<9;i++)(function(idx){
      var cell=document.createElement('div');cell.className='inv-cell';
      var item=craftSlots[idx];
      if(item){
        var icon=makeIcon(item.id);if(icon)cell.appendChild(icon);
        var cnt=document.createElement('div');cnt.className='cnt';cnt.textContent=item.count;cell.appendChild(cnt);
      }
      cell.addEventListener('click',function(e){e.preventDefault();handleSlotLeftClick(craftSlots,idx,'craft');});
      cell.addEventListener('contextmenu',function(e){e.preventDefault();handleSlotRightClick(craftSlots,idx,'craft');});
      cg.appendChild(cell);
    })(i);

    checkRecipe();
    if(craftResultItem){
      var ri=makeIcon(craftResultItem.id);
      if(ri)cgResult.appendChild(ri);
      if(craftResultItem.count>1){var rc=document.createElement('div');rc.className='cnt';rc.textContent=craftResultItem.count;cgResult.appendChild(rc);}
    }
    cgResult.onclick=function(){
      if(craftResultItem&&!cursorItem){
        cursorItem={id:craftResultItem.id,count:craftResultItem.count};
        showCursorItem(cursorItem);
        for(var i=0;i<9;i++){if(craftSlots[i]){craftSlots[i].count--;if(craftSlots[i].count<=0)craftSlots[i]=null;}}
        buildInventoryUI();
      }
    };

    // 背包 36
    for(var j=0;j<BACKPACK_SIZE;j++)(function(idx){
      var cell=document.createElement('div');cell.className='inv-cell';
      var item=backpackSlots[idx];
      if(item){
        var icon=makeIcon(item.id);if(icon)cell.appendChild(icon);
        var cnt=document.createElement('div');cnt.className='cnt';cnt.textContent=item.count;cell.appendChild(cnt);
      }
      cell.addEventListener('click',function(e){
        e.preventDefault();
        if(e.shiftKey){handleShiftClick(backpackSlots,idx,hotbarSlots,'backpack');return;}
        handleSlotLeftClick(backpackSlots,idx,'backpack');
      });
      cell.addEventListener('contextmenu',function(e){e.preventDefault();handleSlotRightClick(backpackSlots,idx,'backpack');});
      bg.appendChild(cell);
    })(j);

    // 快捷栏 9
    for(var k=0;k<9;k++)(function(idx){
      var cell=document.createElement('div');
      cell.className='inv-cell'+(idx===selectedSlot?' selected':'');
      var item=hotbarSlots[idx];
      if(item){
        var icon=makeIcon(item.id);if(icon)cell.appendChild(icon);
        var cnt=document.createElement('div');cnt.className='cnt';cnt.textContent=item.count;cell.appendChild(cnt);
      }
      cell.addEventListener('click',function(e){
        e.preventDefault();
        if(e.shiftKey){handleShiftClick(hotbarSlots,idx,backpackSlots,'hotbar');return;}
        handleSlotLeftClick(hotbarSlots,idx,'hotbar');
      });
      cell.addEventListener('contextmenu',function(e){e.preventDefault();handleSlotRightClick(hotbarSlots,idx,'hotbar');});
      hg.appendChild(cell);
    })(k);

    // 护甲
    for(var a=0;a<4;a++)(function(idx){
      var cell=document.createElement('div');cell.className='inv-cell';
      var item=armorSlots[idx];
      if(item){var icon=makeIcon(item.id);if(icon)cell.appendChild(icon);}
      cell.addEventListener('click',function(e){e.preventDefault();handleSlotLeftClick(armorSlots,idx,'armor');});
      ag.appendChild(cell);
    })(a);

    // 配方列表
    RECIPES.forEach(function(rec){
      var div=document.createElement('div');div.className='recipe-item';
      var ings=[];
      for(var id in rec.ingredients)if(BLOCKS[id])ings.push(BLOCKS[id].name+' x'+rec.ingredients[id]);
      div.textContent='→ '+BLOCKS[rec.result].name+' x'+rec.count;
      div.title=ings.join(' + ')+' → '+BLOCKS[rec.result].name;
      div.addEventListener('click',function(){addChat('配方：'+ings.join(' + ')+' → '+BLOCKS[rec.result].name+' x'+rec.count,'system');});
      rl.appendChild(div);
    });
  }

  /* ═══ 生命 & 饥饿 ═══ */
  var hpC=document.createElement('canvas');hpC.width=10*20+4;hpC.height=22;
  hpC.style.height='20px';hpC.style.width=(10*20+4)*(20/22)+'px';hpC.style.imageRendering='pixelated';
  $('healthBar').appendChild(hpC);
  var hpCtx=hpC.getContext('2d');
  var hgC=document.createElement('canvas');hgC.width=10*20+4;hgC.height=22;
  hgC.style.height='20px';hgC.style.width=(10*20+4)*(20/22)+'px';hgC.style.imageRendering='pixelated';
  $('hungerBar').appendChild(hgC);
  var hgCtx=hgC.getContext('2d');

  function drawHeart(g,x,y,size,color,fr){
    var s=size/24;g.save();g.translate(x,y);g.scale(s,s);
    g.beginPath();g.moveTo(12,21.35);g.lineTo(10.55,20.03);
    g.bezierCurveTo(5.4,15.36,2,12.28,2,8.5);g.bezierCurveTo(2,5.42,4.42,3,7.5,3);
    g.bezierCurveTo(9.24,3,10.91,3.81,12,5.09);g.bezierCurveTo(13.09,3.81,14.76,3,16.5,3);
    g.bezierCurveTo(19.58,3,22,5.42,22,8.5);g.bezierCurveTo(22,12.28,18.6,15.36,13.45,20.03);
    g.closePath();
    if(fr>=1){g.fillStyle=color;g.fill();}
    else{g.clip();g.fillStyle='#3a3a3a';g.fillRect(0,0,24,24);g.fillStyle=color;g.fillRect(0,0,24*fr,24);}
    g.strokeStyle='rgba(0,0,0,0.55)';g.lineWidth=1;g.stroke();g.restore();
  }
  function drawHunger(g,x,y,size,fr){
    var s=size/24;g.save();g.translate(x,y);g.scale(s,s);
    g.beginPath();g.arc(9,9,6,0,Math.PI*2);g.arc(16,16,5,0,Math.PI*2);g.closePath();
    if(fr>=1){g.fillStyle='#c89050';g.fill();}
    else{g.clip();g.fillStyle='#3a3a3a';g.fillRect(0,0,24,24);g.fillStyle='#c89050';g.fillRect(0,0,24*fr,24);}
    g.strokeStyle='rgba(0,0,0,0.55)';g.lineWidth=1;g.stroke();g.restore();
  }
  function updateHP(){
    hpCtx.clearRect(0,0,hpC.width,hpC.height);
    if(gameMode!=='survival'&&gameMode!=='hardcore')return;
    for(var i=0;i<10;i++){
      var x=2+i*20,hp=player.health-i*2;
      if(hp>=2)drawHeart(hpCtx,x,1,20,'#ff3030',1);
      else if(hp===1)drawHeart(hpCtx,x,1,20,'#ff3030',0.5);
      else drawHeart(hpCtx,x,1,20,'#3a3a3a',1);
    }
  }
  function updateHunger(){
    hgCtx.clearRect(0,0,hgC.width,hgC.height);
    if(gameMode!=='survival'&&gameMode!=='hardcore')return;
    for(var i=0;i<10;i++){
      var x=2+(9-i)*20,hunger=player.hunger-i*2;
      if(hunger>=2)drawHunger(hgCtx,x,1,20,1);
      else if(hunger===1)drawHunger(hgCtx,x,1,20,0.5);
      else drawHunger(hgCtx,x,1,20,0);
    }
  }
  function applyDamage(amt){
    if(gameMode!=='survival'&&gameMode!=='hardcore')return;
    if(difficulty==='peaceful')return;
    player.health-=amt;
    if(player.health<=0){player.health=0;updateHP();onDeath();}
    else updateHP();
  }
  function onDeath(){
    setAppState('dead');
    var ds=$('deathScreen');ds.classList.remove('hidden');
    addChat('你死了！','error');
    setTimeout(function(){
      ds.classList.add('hidden');
      spawnPlayer();updateChunks(true);updateHP();updateHunger();
      setAppState('playing');
    },2000);
  }
  /* 饥饿系统 */
  function addExhaustion(amt){
    if(gameMode!=='survival'&&gameMode!=='hardcore')return;
    player.exhaustion+=amt;
    if(player.exhaustion>=4){
      player.exhaustion-=4;
      if(player.saturation>0)player.saturation=Math.max(0,player.saturation-1);
      else if(player.hunger>0)player.hunger=Math.max(0,player.hunger-1);
      updateHunger();
    }
  }
  function tickHunger(dt){
    if(gameMode!=='survival'&&gameMode!=='hardcore')return;
    player.hungerTimer+=dt;
    if(player.hungerTimer>=4){
      player.hungerTimer=0;
      if(player.hunger>=18&&player.health<player.maxHealth){
        player.health=Math.min(player.maxHealth,player.health+1);
        addExhaustion(0.6);updateHP();
      }else if(player.hunger<=0&&player.health>1){
        applyDamage(1);
      }
    }
  }

  /* ═══ 射线 & 挖掘/放置 ═══ */
  function getLook(){var cp=Math.cos(pitch);return{x:-Math.sin(yaw)*cp,y:Math.sin(pitch),z:-Math.cos(yaw)*cp};}
  function raycast(ox,oy,oz,dx,dy,dz,maxD){
    var x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
    var sx=dx>0?1:(dx<0?-1:0),sy=dy>0?1:(dy<0?-1:0),sz=dz>0?1:(dz<0?-1:0);
    var tdx=sx!==0?Math.abs(1/dx):Infinity,tdy=sy!==0?Math.abs(1/dy):Infinity,tdz=sz!==0?Math.abs(1/dz):Infinity;
    var tmx=sx!==0?(sx>0?(x+1-ox):(ox-x))/Math.abs(dx):Infinity;
    var tmy=sy!==0?(sy>0?(y+1-oy):(oy-y))/Math.abs(dy):Infinity;
    var tmz=sz!==0?(sz>0?(z+1-oz):(oz-z))/Math.abs(dz):Infinity;
    var nrm={x:0,y:0,z:0};
    if(isSolid(x,y,z))return{x:x,y:y,z:z,normal:{x:0,y:1,z:0}};
    var t=0,g=0;
    while(t<=maxD&&g++<512){
      if(tmx<tmy){
        if(tmx<tmz){x+=sx;t=tmx;tmx+=tdx;nrm={x:-sx,y:0,z:0};}
        else{z+=sz;t=tmz;tmz+=tdz;nrm={x:0,y:0,z:-sz};}
      }else{
        if(tmy<tmz){y+=sy;t=tmy;tmy+=tdy;nrm={x:0,y:-sy,z:0};}
        else{z+=sz;t=tmz;tmz+=tdz;nrm={x:0,y:0,z:-sz};}
      }
      if(t>maxD)break;
      if(isSolid(x,y,z))return{x:x,y:y,z:z,normal:nrm};
    }
    return null;
  }
  function camHit(){var d=getLook();return raycast(camera.position.x,camera.position.y,camera.position.z,d.x,d.y,d.z,REACH);}
  function triggerSwing(){swingTime=SWING_DURATION;}
  function doBreak(){
    if(gameMode==='spectator'||gameMode==='adventure')return;
    var hit=camHit();if(!hit)return;
    var b=getBlock(hit.x,hit.y,hit.z);
    if(b===0||b===7)return;
    setBlock(hit.x,hit.y,hit.z,0);markDirty(hit.x,hit.z);triggerSwing();
    if(gameMode==='survival'||gameMode==='hardcore')addItem(b,1);
    addExhaustion(0.005);
    if(isMultiplayer&&net&&net.connected)net.sendBlockChange(hit.x,hit.y,hit.z,0);
  }
  function doPlace(){
    if(gameMode==='spectator')return;
    var hit=camHit();if(!hit)return;
    var x=hit.x+hit.normal.x,y=hit.y+hit.normal.y,z=hit.z+hit.normal.z;
    if(getBlock(x,y,z)!==0)return;
    var bid=getSelectedBlockId();
    if(gameMode==='survival'||gameMode==='hardcore'){
      if(!bid||bid===0){toast('空手无法放置');return;}
      var it=hotbarSlots[selectedSlot];
      if(!it||it.count<=0){toast('没有物品');return;}
    }
    if(gameMode==='survival'||gameMode==='hardcore'||gameMode==='adventure'){
      var p=player.pos;
      var ox=(x+1>p.x-PLAYER_HALF)&&(x<p.x+PLAYER_HALF);
      var oy=(y+1>p.y)&&(y<p.y+PLAYER_HEIGHT);
      var oz=(z+1>p.z-PLAYER_HALF)&&(z<p.z+PLAYER_HALF);
      if(ox&&oy&&oz)return;
    }
    setBlock(x,y,z,bid);markDirty(x,z);triggerSwing();
    if(gameMode==='survival'||gameMode==='hardcore'){
      var it2=hotbarSlots[selectedSlot];
      if(it2){it2.count--;if(it2.count<=0)hotbarSlots[selectedSlot]=null;
        updateHotbarSlot($('hotbar').children[selectedSlot],hotbarSlots[selectedSlot]);}
    }
    if(isMultiplayer&&net&&net.connected)net.sendBlockChange(x,y,z,bid);
  }

  /* ═══ 物理 ═══ */
  function physics(dt){
    var ix=0,iz=0;
    if(keys['w']||keys['arrowup'])iz-=1;
    if(keys['s']||keys['arrowdown'])iz+=1;
    if(keys['a']||keys['arrowleft'])ix-=1;
    if(keys['d']||keys['arrowright'])ix+=1;
    if(supportsTouch&&moveTouchId!==null){ix+=touchMoveX;iz+=touchMoveY;}
    var len=Math.hypot(ix,iz);if(len>0){ix/=len;iz/=len;}
    var sy=Math.sin(yaw),cy=Math.cos(yaw);
    var wdx=sy*iz+cy*ix,wdz=cy*iz-sy*ix;
    var isFly=(gameMode==='creative'||gameMode==='spectator')&&flying;
    var sprint=keys['shift']&&!isFly;
    var speed=isFly?(keys['shift']?FLY_SPEED*1.7:FLY_SPEED):(sprint?RUN_SPEED:WALK_SPEED);
    if(gameMode==='survival'&&player.hunger<=0)speed*=0.6;
    var tvx=wdx*speed,tvz=wdz*speed;
    var accel=(player.onGround||isFly)?16:4;
    var k=Math.min(1,accel*dt);
    player.vel.x+=(tvx-player.vel.x)*k;
    player.vel.z+=(tvz-player.vel.z)*k;
    if(isFly){
      var fy=0;
      if(keys[' '])fy+=1;
      if(keys['shift'])fy-=1;
      player.vel.y+=(fy*FLY_SPEED-player.vel.y)*Math.min(1,14*dt);
    }else{
      if(keys[' ']&&player.onGround){
        player.vel.y=JUMP_VELOCITY;player.onGround=false;
        if(gameMode==='survival')addExhaustion(sprint?0.2:0.05);
      }
      if(settings.autoJump&&player.onGround){
        var moving=Math.abs(player.vel.x)>0.5||Math.abs(player.vel.z)>0.5;
        if(moving){
          var dx=player.vel.x,dz=player.vel.z,lh=Math.hypot(dx,dz);
          if(lh>0.5){
            var nx=dx/lh,nz=dz/lh;
            var fx=Math.floor(player.pos.x+nx*0.45),fz=Math.floor(player.pos.z+nz*0.45);
            var fy2=Math.floor(player.pos.y);
            if(isSolid(fx,fy2,fz)&&!isSolid(fx,fy2+1,fz)&&!isSolid(fx,fy2+2,fz)){player.vel.y=JUMP_VELOCITY;player.onGround=false;}
          }
        }
      }
      player.vel.y-=GRAVITY*dt;
      if(player.vel.y<-50)player.vel.y=-50;
    }
    if(gameMode==='spectator'){
      player.pos.x+=player.vel.x*dt;player.pos.y+=player.vel.y*dt;player.pos.z+=player.vel.z*dt;
      player.onGround=false;
    }else{
      player.onGround=false;
      collide('x',player.vel.x*dt);collide('z',player.vel.z*dt);collide('y',player.vel.y*dt);
    }
    // 疾跑消耗
    if(sprint&&player.onGround&&(Math.abs(player.vel.x)>0.5||Math.abs(player.vel.z)>0.5)){
      if(gameMode==='survival')addExhaustion(dt*0.1);
    }
    // 掉落伤害
    if((gameMode==='survival'||gameMode==='hardcore')&&difficulty!=='peaceful'){
      if(!player.onGround&&player.vel.y<0){
        if(player.fallStartY===null)player.fallStartY=player.pos.y;
        else if(player.pos.y>player.fallStartY)player.fallStartY=player.pos.y;
      }else if(player.onGround&&player.fallStartY!==null){
        var dist=player.fallStartY-player.pos.y;
        if(dist>3)applyDamage(Math.floor(dist-3));
        player.fallStartY=null;
      }else if(player.onGround)player.fallStartY=null;
    }
    if(player.pos.y<WORLD_MIN_Y-20){
      if(gameMode==='survival'||gameMode==='hardcore')applyDamage(20);
      if(player.health>0||gameMode==='creative'||gameMode==='spectator'||gameMode==='adventure'){
        spawnPlayer();updateChunks(true);
      }
    }
    tickHunger(dt);
    var s2=Math.hypot(player.vel.x,player.vel.z);
    if(s2>0.8&&(player.onGround||isFly)){walkPhase+=dt*(s2*2.2);bobPhase+=dt*(s2*2.0);}
    else{walkPhase*=0.86;bobPhase*=0.86;}
  }

  /* ═══ 手 & 相机 ═══ */
  function updateHand(dt){
    if(!handPivot)return;
    var sx=0,sz=0;
    if(swingTime>0){
      swingTime-=dt;if(swingTime<0)swingTime=0;
      var t=1-swingTime/SWING_DURATION,s=Math.sin(t*Math.PI);
      sx=-s*1.05;sz=s*0.28;
    }
    var it=performance.now()/1000;
    var ix=Math.sin(it*1.6)*0.020,iy=Math.sin(it*1.1)*0.010,iz=Math.sin(it*0.9)*0.014;
    var ma=Math.min(0.05,Math.hypot(player.vel.x,player.vel.z)*0.010);
    var wx=Math.sin(walkPhase*2)*ma,wy=Math.cos(walkPhase)*ma*0.7;
    var lp=Math.min(1,dt*16);
    handPivot.rotation.x+=(handBaseRot.x+sx+ix+wx-handPivot.rotation.x)*lp;
    handPivot.rotation.y+=(handBaseRot.y+iz-handPivot.rotation.y)*lp;
    handPivot.rotation.z+=(handBaseRot.z+sz-handPivot.rotation.z)*lp;
    handPivot.position.x+=(handBasePos.x+iy-handPivot.position.x)*lp;
    handPivot.position.y+=(handBasePos.y+iy*0.6-handPivot.position.y)*lp;
    handPivot.position.z+=(handBasePos.z-handPivot.position.z)*lp;
    handPivot.visible=(gameMode!=='spectator');
  }
  function updateCamera(){
    if(!camera)return;
    var by=0,bx=0;
    if(settings.viewBobbing){by=Math.sin(bobPhase*2)*0.022;bx=Math.cos(bobPhase)*0.014;}
    camera.position.set(player.pos.x+bx,player.pos.y+EYE_HEIGHT+by,player.pos.z);
    camera.rotation.x=pitch;camera.rotation.y=yaw;camera.rotation.z=0;
  }

  /* ═══ HUD ═══ */
  var lastCX=null,lastCY=null,lastCZ=null,lastBiome=null;
  function updateHUD(){
    var cx=Math.floor(player.pos.x),cy=Math.floor(player.pos.y),cz=Math.floor(player.pos.z);
    if(cx!==lastCX||cy!==lastCY||cz!==lastCZ){
      $('hudCoord').textContent='X '+cx+' · Y '+cy+' · Z '+cz;
      lastCX=cx;lastCY=cy;lastCZ=cz;
    }
    var p=tp(cx,cz);
    if(p.biome!==lastBiome){
      lastBiome=p.biome;var info=BIOMES[p.biome]||BIOMES[0];
      $('hudBiomeName').textContent=info.name;
      $('hudBiomeDot').style.background=info.color;
    }
    if(isMultiplayer&&currentRoom){
      $('hudOnline').style.display='block';
      $('hudOnline').textContent='联机 · '+currentRoom.name+' ('+((net?net.remotePlayers.size:0)+1)+'/'+currentRoom.max_players+')'+(currentRoom.isHost?' [房主]':'');
    }else $('hudOnline').style.display='none';
  }
  function updatePlayerList(){
    if(!isMultiplayer){$('playerList').innerHTML='';return;}
    var html='<div class="player-tag me">★ '+escHtml(myPlayerName)+' (你)'+(currentRoom&&currentRoom.isHost?' [房主]':'')+'</div>';
    if(net)net.remotePlayers.forEach(function(p){html+='<div class="player-tag">'+escHtml(p.name)+'</div>';});
    $('playerList').innerHTML=html;
  }

  /* ═══ 太阳 ═══ */
  var sunAngle=0;
  function updateSun(dt){
    sunAngle+=dt*0.05;
    var sx=Math.cos(sunAngle)*120,sy=140+Math.sin(sunAngle*0.5)*40,sz=Math.sin(sunAngle)*120;
    if(sunLight)sunLight.position.set(sx,sy,sz);
    if(sunMesh&&sunMesh.visible){sunMesh.position.set(sx*1.5,sy*1.5,sz*1.5);sunGlow.position.copy(sunMesh.position);}
    if(cloudPlane&&cloudPlane.visible){cloudPlane.position.x=(sunAngle*8)%160-80;cloudPlane.position.z=(sunAngle*4)%160-80;}
  }

  /* ═══ 主循环 ═══ */
  var FIXED_STEP=1/120,accumulator=0,lastTime=performance.now();
  var fpsCounter=0,fpsTimer=0,lastFrameTime=0;
  function updateActions(dt){
    breakTimer-=dt;placeTimer-=dt;
    if(mouseHeld[0]&&breakTimer<=0){breakTimer=BREAK_COOLDOWN;doBreak();}
    if(mouseHeld[2]&&placeTimer<=0){placeTimer=PLACE_COOLDOWN;doPlace();}
  }
  function updateHighlight(){
    if(!highlightMesh)return;
    if(gameMode==='spectator'||inventoryOpen||chatOpen){highlightMesh.visible=false;return;}
    var hit=camHit();
    if(hit){highlightMesh.position.set(hit.x+0.5,hit.y+0.5,hit.z+0.5);highlightMesh.visible=true;}
    else highlightMesh.visible=false;
  }
  function loop(now){
    requestAnimationFrame(loop);
    if(settings.maxFramerate>0&&settings.maxFramerate<260){
      var interval=1000/settings.maxFramerate;
      if(now-lastFrameTime<interval)return;
      lastFrameTime=now;
    }
    var dt=(now-lastTime)/1000;lastTime=now;
    if(dt>0.25)dt=0.25;if(dt<0)dt=0;
    fpsCounter++;fpsTimer+=dt;
    if(fpsTimer>=0.5){if($('hudFps'))$('hudFps').textContent='FPS '+Math.round(fpsCounter/fpsTimer);fpsCounter=0;fpsTimer=0;}
    if(appState==='playing')updateSun(dt);
    if(appState==='playing'&&!inventoryOpen&&!chatOpen){
      accumulator+=dt;var iter=0;
      while(accumulator>=FIXED_STEP&&iter<20){physics(FIXED_STEP);accumulator-=FIXED_STEP;iter++;}
      if(iter>=20)accumulator=0;
      updateActions(dt);
      var pcx=Math.floor(player.pos.x/CHUNK_SIZE),pcz=Math.floor(player.pos.z/CHUNK_SIZE);
      if(pcx!==lastPCX||pcz!==lastPCZ)updateChunks();
      processDirty();updateVisibility(dt);
    }
    updateLoadAnim(now);
    if(dirtyChunks.size>0){
      $('chunkLoading').classList.add('show');
      var total=LOAD_RADIUS*LOAD_RADIUS*4;
      var loaded=total-Math.min(dirtyChunks.size,total);
      $('chunkLoadingBar').style.width=((loaded/total)*100)+'%';
      $('chunkLoadingCount').textContent=Math.max(0,dirtyChunks.size);
    }else $('chunkLoading').classList.remove('show');
    if(appState==='playing'||appState==='paused'||appState==='dead'){
      updateCamera();updateHand(dt);updateHighlight();updateHUD();
    }
    if(isMultiplayer&&net&&net.connected)net.tick(now);
    if(renderer&&scene&&camera)renderer.render(scene,camera);
  }

  /* ═══ 粒子背景 ═══ */
  function initParticles(){
    var canvas=$('particles');if(!canvas)return;
    var ctx=canvas.getContext('2d'),parts=[];
    function resize(){canvas.width=window.innerWidth;canvas.height=window.innerHeight;}
    resize();window.addEventListener('resize',resize);
    for(var i=0;i<36;i++)parts.push({
      x:Math.random()*canvas.width,y:Math.random()*canvas.height,
      size:4+Math.random()*10,vx:(Math.random()-0.5)*0.25,
      vy:-0.15-Math.random()*0.35,rot:Math.random()*Math.PI,
      vr:(Math.random()-0.5)*0.015,alpha:0.10+Math.random()*0.22
    });
    function loop2(){
      requestAnimationFrame(loop2);
      if(appState==='playing'||appState==='paused'||appState==='dead'){ctx.clearRect(0,0,canvas.width,canvas.height);return;}
      ctx.clearRect(0,0,canvas.width,canvas.height);
      for(var i=0;i<parts.length;i++){
        var p=parts[i];p.x+=p.vx;p.y+=p.vy;p.rot+=p.vr;
        if(p.y<-30){p.y=canvas.height+30;p.x=Math.random()*canvas.width;}
        if(p.x<-30)p.x=canvas.width+30;
        if(p.x>canvas.width+30)p.x=-30;
        ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);
        ctx.fillStyle='rgba(61,82,31,'+p.alpha+')';
        ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size);
        ctx.restore();
      }
    }
    loop2();
  }

  /* ═══ 网络 ═══ */
  var net=null;
  (function setupNet(){
    net={
      connected:false,isHost:false,roomChannel:null,
      myPlayerId:null,remotePlayers:new Map(),announcedPlayers:new Set(),
      lastMoveSent:0,lastActiveUpdate:0,moveSendInterval:80,activeUpdateInterval:30000,
      _timeoutInterval:null,
      connect:function(room,isHost){
        if(!supabaseReady){this.connected=false;addChat('⚠️ Supabase 未连接','error');return;}
        this.connected=true;this.isHost=!!isHost;
        this.myPlayerId='p_'+Date.now()+'_'+Math.random().toString(36).slice(2,6);
        var self=this;
        this.roomChannel=sbClient.channel('room-'+room.id,{config:{broadcast:{self:false}}});
        this.roomChannel.on('broadcast',{event:'move'},function(p){self.handleMove(p.payload);});
        this.roomChannel.on('broadcast',{event:'block'},function(p){var d=p.payload;setBlock(d.x,d.y,d.z,d.block);markDirty(d.x,d.z);});
        this.roomChannel.on('broadcast',{event:'chat'},function(p){var d=p.payload;addChat('<span class="sender">'+escHtml(d.from)+'</span> '+escHtml(d.text),'player');});
        this.roomChannel.on('broadcast',{event:'join'},function(p){
          var d=p.payload;
          if(d.id===self.myPlayerId)return;
          if(self.remotePlayers.has(d.id))return;
          if(self.announcedPlayers.has(d.id))return;
          self.announcedPlayers.add(d.id);
          addChat('<span class="sender">'+escHtml(d.name)+'</span> 加入了游戏','system');
          self.addRemote(d.id,d.name);updatePlayerList();
        });
        this.roomChannel.on('broadcast',{event:'leave'},function(p){
          var d=p.payload,rp=self.remotePlayers.get(d.id);
          if(rp){addChat(rp.name+' 离开了游戏','system');if(rp.mesh)scene.remove(rp.mesh);self.remotePlayers.delete(d.id);self.announcedPlayers.delete(d.id);updatePlayerList();}
        });
        this.roomChannel.on('broadcast',{event:'hostLeave'},function(p){
          if(p.payload.roomId===room.id){
            addChat('房主已关闭房间','error');
            setTimeout(function(){net.disconnect();isMultiplayer=false;currentRoom=null;clearAllChunks();setAppState('multiplayer');refreshRooms();},1500);
          }
        });
        this.roomChannel.subscribe(function(s){
          if(s==='SUBSCRIBED'){self.broadcast('join',{id:self.myPlayerId,name:myPlayerName});addChat('已连接到实时服务器 ✓','success');}
        });
        if(this._timeoutInterval)clearInterval(this._timeoutInterval);
        this._timeoutInterval=setInterval(function(){
          var now=Date.now();
          self.remotePlayers.forEach(function(rp,id){
            if(rp.lastSeen&&now-rp.lastSeen>15000){
              addChat(rp.name+' 超时离开','system');
              if(rp.mesh)scene.remove(rp.mesh);
              self.remotePlayers.delete(id);self.announcedPlayers.delete(id);
              updatePlayerList();
            }
          });
        },5000);
      },
      disconnect:function(){
        if(this._timeoutInterval){clearInterval(this._timeoutInterval);this._timeoutInterval=null;}
        if(this.roomChannel){
          this.broadcast('leave',{id:this.myPlayerId});
          if(this.isHost&&currentRoom&&supabaseReady){
            this.broadcast('hostLeave',{roomId:currentRoom.id});
            var rid=currentRoom.id;
            setTimeout(function(){sbClient.from('rooms').delete().eq('id',rid).then(function(){});},200);
          }else if(currentRoom&&supabaseReady){
            var nc=Math.max(1,currentRoom.current_players-1);
            sbClient.from('rooms').update({current_players:nc}).eq('id',currentRoom.id).then(function(){});
          }
          try{sbClient.removeChannel(this.roomChannel);}catch(e){}
        }
        this.remotePlayers.forEach(function(rp){if(rp.mesh)scene.remove(rp.mesh);});
        this.remotePlayers.clear();this.announcedPlayers.clear();
        this.connected=false;
        if($('playerList'))$('playerList').innerHTML='';
      },
      broadcast:function(evt,pl){if(this.roomChannel)this.roomChannel.send({type:'broadcast',event:evt,payload:pl});},
      sendChat:function(t){this.broadcast('chat',{from:myPlayerName,text:t});},
      sendBlockChange:function(x,y,z,b){this.broadcast('block',{x:x,y:y,z:z,block:b});},
      tick:function(now){
        if(!this.connected)return;
        if(now-this.lastMoveSent>=this.moveSendInterval){
          this.lastMoveSent=now;
          this.broadcast('move',{id:this.myPlayerId,name:myPlayerName,
            x:player.pos.x,y:player.pos.y,z:player.pos.z,yaw:yaw,pitch:pitch});
        }
        if(now-this.lastActiveUpdate>=this.activeUpdateInterval){
          this.lastActiveUpdate=now;
          if(currentRoom&&supabaseReady)sbClient.from('rooms').update({last_active:Date.now()}).eq('id',currentRoom.id).then(function(){});
        }
        this.remotePlayers.forEach(function(rp){
          if(!rp.mesh||rp.tx===undefined)return;
          var px=rp.mesh.position.x,pz=rp.mesh.position.z;
          rp.mesh.position.x+=(rp.tx-rp.mesh.position.x)*0.2;
          rp.mesh.position.y+=(rp.ty-rp.mesh.position.y)*0.2;
          rp.mesh.position.z+=(rp.tz-rp.mesh.position.z)*0.2;
          if(rp.tyaw!==undefined){
            var dy=rp.tyaw-rp.mesh.rotation.y;
            while(dy>Math.PI)dy-=Math.PI*2;
            while(dy<-Math.PI)dy+=Math.PI*2;
            rp.mesh.rotation.y+=dy*0.2;
          }
          if(rp.head&&rp.tpitch!==undefined){
            var targetRotX=-rp.tpitch;
            var dp=targetRotX-rp.head.rotation.x;
            var newX=rp.head.rotation.x+dp*0.2;
            var lim=Math.PI/2;
            if(newX>lim)newX=lim;if(newX<-lim)newX=-lim;
            rp.head.rotation.x=newX;
          }
          var dx=rp.mesh.position.x-px,dz=rp.mesh.position.z-pz;
          var dist=Math.hypot(dx,dz);
          if(dist>0.005)rp.walkPhase=(rp.walkPhase||0)+dist*8;
          var sw=Math.sin(rp.walkPhase||0)*0.7;
          if(rp.armL)rp.armL.rotation.x=sw;
          if(rp.armR)rp.armR.rotation.x=-sw;
          if(rp.legL)rp.legL.rotation.x=-sw;
          if(rp.legR)rp.legR.rotation.x=sw;
          if(dist<0.005){
            if(rp.armL)rp.armL.rotation.x*=0.9;
            if(rp.armR)rp.armR.rotation.x*=0.9;
            if(rp.legL)rp.legL.rotation.x*=0.9;
            if(rp.legR)rp.legR.rotation.x*=0.9;
          }
        });
      },
      handleMove:function(d){
        if(d.id===this.myPlayerId)return;
        var rp=this.remotePlayers.get(d.id);
        if(!rp){
          if(!this.announcedPlayers.has(d.id)){
            this.announcedPlayers.add(d.id);
            addChat('<span class="sender">'+escHtml(d.name||'玩家')+'</span> 加入了游戏','system');
          }
          this.addRemote(d.id,d.name||'玩家');
          rp=this.remotePlayers.get(d.id);updatePlayerList();
        }
        if(rp){
          rp.lastSeen=Date.now();
          rp.tx=d.x;rp.ty=d.y;rp.tz=d.z;rp.tyaw=d.yaw;rp.tpitch=d.pitch;
        }
      },
      addRemote:function(id,name){
        if(this.remotePlayers.has(id))return;
        if(typeof THREE==='undefined')return;
        var g=new THREE.Group();
        var skinM=new THREE.MeshLambertMaterial({color:0xe8b48c});
        var shirtM=new THREE.MeshLambertMaterial({color:0x2e9cc9});
        var pantsM=new THREE.MeshLambertMaterial({color:0x3b4a8c});
        var hairM=new THREE.MeshLambertMaterial({color:0x4a3020});
        var shoeM=new THREE.MeshLambertMaterial({color:0x3a3a3a});
        var headGroup=new THREE.Group();headGroup.position.y=1.55;g.add(headGroup);
        var head=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5),skinM);headGroup.add(head);
        var hairTop=new THREE.Mesh(new THREE.BoxGeometry(0.52,0.10,0.52),hairM);hairTop.position.y=0.27;headGroup.add(hairTop);
        var hairBack=new THREE.Mesh(new THREE.BoxGeometry(0.52,0.42,0.08),hairM);hairBack.position.set(0,0,0.23);headGroup.add(hairBack);
        var eyeM=new THREE.MeshBasicMaterial({color:0x2b2b2b});
        var eL=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.08,0.02),eyeM);eL.position.set(-0.11,0.05,-0.251);headGroup.add(eL);
        var eR=eL.clone();eR.position.x=0.11;headGroup.add(eR);
        var torso=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.65,0.28),shirtM);torso.position.y=0.97;g.add(torso);
        var aL=new THREE.Group();aL.position.set(-0.33,1.28,0);
        var aLm=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.62,0.16),skinM);aLm.position.y=-0.31;aL.add(aLm);
        var sL=new THREE.Mesh(new THREE.BoxGeometry(0.17,0.20,0.17),shirtM);sL.position.y=-0.10;aL.add(sL);g.add(aL);
        var aR=new THREE.Group();aR.position.set(0.33,1.28,0);
        var aRm=new THREE.Mesh(new THREE.BoxGeometry(0.16,0.62,0.16),skinM);aRm.position.y=-0.31;aR.add(aRm);
        var sR=new THREE.Mesh(new THREE.BoxGeometry(0.17,0.20,0.17),shirtM);sR.position.y=-0.10;aR.add(sR);g.add(aR);
        var lL=new THREE.Group();lL.position.set(-0.13,0.65,0);
        var lLm=new THREE.Mesh(new THREE.BoxGeometry(0.20,0.65,0.20),pantsM);lLm.position.y=-0.32;lL.add(lLm);
        var shL=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.10,0.24),shoeM);shL.position.set(0,-0.65,0.02);lL.add(shL);g.add(lL);
        var lR=new THREE.Group();lR.position.set(0.13,0.65,0);
        var lRm=new THREE.Mesh(new THREE.BoxGeometry(0.20,0.65,0.20),pantsM);lRm.position.y=-0.32;lR.add(lRm);
        var shR=new THREE.Mesh(new THREE.BoxGeometry(0.22,0.10,0.24),shoeM);shR.position.set(0,-0.65,0.02);lR.add(shR);g.add(lR);
        var c=document.createElement('canvas');c.width=256;c.height=64;
        var ctx=c.getContext('2d');
        ctx.font='bold 32px "Microsoft YaHei",sans-serif';
        ctx.textAlign='center';ctx.textBaseline='middle';
        ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(0,0,256,64);
        ctx.fillStyle='#fff';ctx.fillText(name,128,32);
        var tex=new THREE.CanvasTexture(c);tex.minFilter=THREE.LinearFilter;
        var sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,depthTest:false}));
        sp.scale.set(1.8,0.45,1);sp.position.y=2.2;g.add(sp);
        scene.add(g);
        this.remotePlayers.set(id,{
          name:name,mesh:g,lastSeen:Date.now(),
          head:headGroup,armL:aL,armR:aR,legL:lL,legR:lR,walkPhase:0
        });
      }
    };
  })();

  /* ═══ 启动 ═══ */
  function initGame(){
    initData();
    initThree();
    initInput();
    try{initTouch();}catch(e){console.error('[initTouch]',e);}
    try{initParticles();}catch(e){console.error('[initParticles]',e);}
    initUI();
    spawnPlayer();
    updateChunks(true,false);
    processDirty();
    updateHUD();updateHP();updateHunger();
    buildHotbar();
    setGameMode('creative');
    setAppState('mainMenu');
    requestAnimationFrame(loop);
  }
  if(document.readyState==='complete'){initGame();}
else{window.addEventListener('load',function(){initGame();});}
