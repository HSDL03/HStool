// 应招器读取器：把页面上的棋盘状态发给本机程序。
// 设计原则：这里只做「看」，不做判断。认不出身份就原样上报标识，
// 由程序那边（可随时更新）决定怎么解释，扩展不用重装。
(function () {
  const ENDPOINT = "http://127.0.0.1:8765/board";
  const KNOWN = ["wc-chess-board", "cg-board", "[data-board]", "#board", ".board",
                 "[class*=chessboard]", "[class*=chess-board]", "[class*=board]"];

  const isSq = (r) => r.width > 0 && r.height > 0 && Math.abs(r.width - r.height) < Math.max(8, r.width * 0.12);
  const inBoard = (b, r) => r.left >= b.left - 2 && r.top >= b.top - 2 &&
                             r.right <= b.right + 2 && r.bottom <= b.bottom + 2;

  function tokensOf(el) {
    const out = [];
    if (el.className && typeof el.className === "string") out.push(el.className);
    for (const a of el.getAttributeNames ? el.getAttributeNames() : []) {
      const v = el.getAttribute(a);
      if (v && v.length < 80 && /(piece|role|name|type|alt|title|aria)/i.test(a)) out.push(v);
    }
    if (el.tagName === "IMG") out.push(el.getAttribute("src") || "");
    const bg = getComputedStyle(el).backgroundImage || "";
    if (bg && bg !== "none") out.push(bg);
    return out.join(" ").slice(0, 200);
  }

  function findBoard() {
    const cands = [];
    const seen = new Set();
    for (const sel of KNOWN) {
      for (const el of document.querySelectorAll(sel)) {
        if (seen.has(el)) continue;
        seen.add(el);
        const r = el.getBoundingClientRect();
        if (r.width < 200 || !isSq(r)) continue;
        cands.push({ el, r, how: sel });
      }
    }
    // 通用兜底：任何「方形、够大、里面躺着一堆 1/8 大小方块」的元素
    if (!cands.length) {
      let n = 0;
      for (const el of document.querySelectorAll("div,table,canvas,section")) {
        if (n++ > 3000) break;
        const r = el.getBoundingClientRect();
        if (r.width < 240 || r.width > Math.min(window.innerWidth, window.innerHeight) || !isSq(r)) continue;
        const cell = r.width / 8;
        let hits = 0;
        for (const c of el.children) {
          const cr = c.getBoundingClientRect();
          if (cr.width > cell * 0.4 && cr.width < cell * 1.6 &&
              Math.abs(cr.height - cr.width) < cell * 0.5 && inBoard(r, cr)) hits++;
        }
        if (hits >= 16) cands.push({ el, r, how: "generic" });
      }
    }
    if (!cands.length) return null;
    // 挑「棋子最多、最方」的那个
    let best = null;
    for (const c of cands) {
      const cell = c.r.width / 8;
      let pieces = 0;
      for (const d of c.el.querySelectorAll("*")) {
        const dr = d.getBoundingClientRect();
        if (dr.width > cell * 0.35 && dr.width < cell * 1.7 &&
            Math.abs(dr.height - dr.width) < cell * 0.6 && inBoard(c.r, dr)) pieces++;
        if (pieces > 200) break;
      }
      const score = pieces + (c.how === "generic" ? 0 : 40);
      if (!best || score > best.score) best = { ...c, score, pieces };
    }
    return best;
  }

  function readLabels(board, r) {
    // 站点常在格子里画 a~h / 1~8：靠它判朝向（黑方视角会转 180°）
    const cell = r.width / 8;
    let aX = null, oneY = null;
    const walk = document.createTreeWalker(board, NodeFilter.SHOW_TEXT);
    let node, n = 0;
    while ((node = walk.nextNode()) && n < 200) {
      const t = (node.textContent || "").trim();
      if (t.length !== 1) continue;
      const p = node.parentElement;
      if (!p) continue;
      const pr = p.getBoundingClientRect();
      if (pr.width > cell * 0.9 || pr.height > cell * 0.9) continue;
      n++;
      const cx = pr.left + pr.width / 2, cy = pr.top + pr.height / 2;
      if (t === "a") aX = (cx - r.left) / r.width;
      if (t === "h") aX = 1 - (cx - r.left) / r.width;
      if (t === "1") oneY = (cy - r.top) / r.height;
      if (t === "8") oneY = 1 - (cy - r.top) / r.height;
    }
    if (aX !== null && aX < 0.3) return false;   // a 在左边：白在下面
    if (aX !== null && aX > 0.7) return true;    // a 在右边：转了 180°
    if (oneY !== null) return oneY > 0.6;        // “1”在下面 = 白在下面
    return null;
  }

  function pawnFlip(cells) {
    // 没有坐标时就猜：兵离底线近的那一方在下面
    let wSum = 0, wN = 0, bSum = 0, bN = 0;
    cells.forEach((t, i) => {
      if (!/[pP]/.test(t)) return;
      const r = Math.floor(i / 8);
      if (/[A-Z]/.test(t)) { wSum += r; wN++; } else { bSum += r; bN++; }
    });
    if (!wN || !bN) return null;
    return (wSum / wN) > (bSum / bN);            // 白兵更靠下 = 白在下面 = 没转
  }

  function scan() {
    let payload = { url: location.href, title: document.title, cells: [], dpr: window.devicePixelRatio || 1 };
    try {
      const b = findBoard();
      if (!b) {
        payload.note = "页面上没找到棋盘";
        send(payload);
        return;
      }
      const r = b.r, cell = r.width / 8;
      const cells = new Array(64).fill("");
      const raw = {};
      let shown = 0;
      for (const d of b.el.querySelectorAll("*")) {
        const dr = d.getBoundingClientRect();
        if (dr.width < cell * 0.35 || dr.width > cell * 1.7) continue;
        if (Math.abs(dr.height - dr.width) > cell * 0.6) continue;
        if (!inBoard(r, dr)) continue;
        const col = Math.max(0, Math.min(7, Math.floor((dr.left + dr.width / 2 - r.left) / cell)));
        const row = Math.max(0, Math.min(7, Math.floor((dr.top + dr.height / 2 - r.top) / cell)));
        const tok = tokensOf(d);
        if (!tok) continue;
        const i = row * 8 + col;
        if (cells[i] && cells[i].length >= tok.length) continue;
        cells[i] = tok;
        raw[tok] = (raw[tok] || 0) + 1;
        shown++;
      }
      let flip = readLabels(b.el, r);
      if (flip === null) flip = pawnFlip(cells);
      if (flip === null) flip = false;

      const borderX = Math.max(0, (window.outerWidth - window.innerWidth) / 2);
      const chromeH = Math.max(0, window.outerHeight - window.innerHeight - borderX);
      payload.board = {
        left: r.left, top: r.top, width: r.width, height: r.height,
        screenX: window.screenX + borderX,
        screenY: window.screenY + chromeH,
      };
      payload.cells = cells;
      payload.flip = !!flip;
      payload.tokens = raw;
      payload.note = (b.how === "generic" ? "通用匹配" : b.how) + " · 棋子 " + shown;
      send(payload);
    } catch (e) {
      payload.note = "读取出错：" + e;
      send(payload);
    }
  }

  let busy = false;
  function send(p) {
    if (busy) return;
    busy = true;
    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(p),
    }).catch(() => {}).finally(() => { busy = false; });
  }

  setInterval(scan, 220);
  scan();
})();
