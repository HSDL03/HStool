/*! qrcodejs 兼容层 —— 让只认 `new QRCode(el, opts)` 的老页面
    也能用站内 assets/vendor/qrcode.js（qrcode-generator）离线条码，不再依赖 CDN。
    opts: { text, width, height, colorDark, colorLight, correctLevel } */
(function () {
  'use strict';
  if (typeof window.QRCode !== 'undefined' || typeof window.qrcode === 'undefined') return;

  /* qrcodejs 的枚举是数字，qrcode-generator 用字母 */
  var LEVELS = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' };

  function QRCode(el, opts) {
    if (!(this instanceof QRCode)) return new QRCode(el, opts);
    opts = opts || {};
    var qr = window.qrcode(0, LEVELS[opts.correctLevel] || 'M');
    qr.addData(String(opts.text == null ? '' : opts.text));
    qr.make();

    var n = qr.getModuleCount();
    var size = Math.max(64, opts.width || opts.height || 200);
    var cell = Math.max(1, Math.floor(size / n));
    var px = cell * n;

    var cv = document.createElement('canvas');
    cv.width = cv.height = px;
    cv.style.width = cv.style.height = size + 'px';
    cv.style.imageRendering = 'pixelated';
    var ctx = cv.getContext('2d');
    ctx.fillStyle = opts.colorLight || '#fff';
    ctx.fillRect(0, 0, px, px);
    ctx.fillStyle = opts.colorDark || '#000';
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
      }
    }

    var host = (typeof el === 'string') ? document.getElementById(el) : el;
    if (host) {
      host.innerHTML = '';
      host.appendChild(cv);
    }
    this._canvas = cv;
  }

  QRCode.CorrectLevel = { L: 1, M: 0, Q: 3, H: 2 };
  window.QRCode = QRCode;
})();
