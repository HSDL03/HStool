# -*- coding: utf-8 -*-
"""本地桥：浏览器扩展把棋盘状态 POST 到这里，界面线程来取。

只做三件事：收 JSON、验证、排队。所有解析放在主程序里，方便随时调，
不需要重装扩展。端口固定 127.0.0.1:8765，只监听本机。

协议（扩展 → 程序）：
  POST /board
  {
    "url": "https://...", "title": "...",
    "board": {"left": 120, "top": 80, "width": 640, "height": 640, "screenX": 220, "screenY": 180},
    "cells": ["br", "bn", "", ...],      # 64 个，屏幕顺序：左上 → 右下，"" = 空
    "tokens": {"br": "piece br square-56", ...},   # 调试：原始标识
    "flip": false,                        # 站点是否把棋盘转了 180°（白在上）
    "note": "chess.com"
  }
  GET /ping -> {"ok": true, "app": "国象应招器"}
"""
import json
import queue
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8765
CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
}


class Bridge:
    """收数据的信箱。线程安全，界面每 60ms 掏一次。"""

    def __init__(self, port=PORT):
        self.port = port
        self.queue = queue.Queue()
        self.last = None
        self.recv_at = 0.0
        self.server = None
        self.error = ""

    # ---------- 生命周期 ----------
    def start(self):
        bridge = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def _cors(self):
                for k, v in CORS.items():
                    self.send_header(k, v)

            def _say(self, obj, code=200):
                body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
                self.send_response(code)
                self._cors()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def do_OPTIONS(self):
                self.send_response(204)
                self._cors()
                self.send_header("Content-Length", "0")
                self.end_headers()

            def do_GET(self):
                if self.path.startswith("/ping"):
                    self._say({"ok": True, "app": "国象应招器"})
                else:
                    self._say({"ok": False, "err": "unknown"}, 404)

            def do_POST(self):
                try:
                    n = int(self.headers.get("Content-Length") or 0)
                    raw = self.rfile.read(n) if n else b"{}"
                    data = json.loads(raw.decode("utf-8") or "{}")
                    if not isinstance(data, dict) or "cells" not in data:
                        self._say({"ok": False, "err": "no cells"}, 400)
                        return
                    bridge.push(data)
                    self._say({"ok": True})
                except Exception as e:                # noqa: BLE001
                    self._say({"ok": False, "err": str(e)}, 400)

            def log_message(self, fmt, *args):        # 别刷控制台
                pass

        try:
            self.server = ThreadingHTTPServer(("127.0.0.1", self.port), Handler)
        except OSError as e:
            self.error = "端口 %d 打不开：%s" % (self.port, e)
            return False
        t = threading.Thread(target=self.server.serve_forever, daemon=True)
        t.start()
        return True

    def stop(self):
        try:
            if self.server:
                self.server.shutdown()
                self.server.server_close()
        except Exception:                             # noqa: BLE001
            pass
        self.server = None

    # ---------- 数据 ----------
    def push(self, data):
        import time
        self.last = data
        self.recv_at = time.time()
        # 只留最新一帧：棋盘状态本来就是「当前值」，堆着没用
        while not self.queue.empty():
            try:
                self.queue.get_nowait()
            except queue.Empty:
                break
        self.queue.put(data)

    def poll(self):
        """取最新一帧（没有就 None）。"""
        data = None
        while True:
            try:
                data = self.queue.get_nowait()
            except queue.Empty:
                break
        return data
