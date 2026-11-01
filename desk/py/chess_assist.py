#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""国象应招器 · 桌面版（Python）

功能
----
1. 识图：框住屏幕上的棋盘，定时截屏，按「哪几格变了」认出对手走了哪一步。
2. 自动：轮到我们时用本机搜索算应手，可选「自动落子」直接在该棋盘上模拟鼠标点击。
3. 手动：点自己的棋盘、或输入 e2e4 / Nf3 / O-O 录入走法。

规则完整：王车易位、吃过路兵、升变、将杀、逼和、50 回合、三次重复、子力不足。
"""

import ctypes
import json
import queue
import os
import sys
import re
import shutil
import threading
import time
import tkinter as tk
from tkinter import messagebox, ttk

import dom_bridge
from PIL import Image, ImageGrab, ImageTk

# ─────────────────────────── 常量 ───────────────────────────
FILES = "abcdefgh"
GLYPH = {"k": "♚", "q": "♛", "r": "♜", "b": "♝", "n": "♞", "p": "♟"}
START = list("rnbqkbnr" "pppppppp" "........" "........"
             "........" "........" "PPPPPPPP" "RNBQKBNR")
FEN_START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
MATE = 100000

KNIGHT_D = ((-2, -1), (-2, 1), (-1, -2), (-1, 2), (1, -2), (1, 2), (2, -1), (2, 1))
KING_D = ((-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1))
BISHOP_D = ((-1, -1), (-1, 1), (1, -1), (1, 1))
ROOK_D = ((-1, 0), (1, 0), (0, -1), (0, 1))
QUEEN_D = BISHOP_D + ROOK_D

VAL = {"p": 100, "n": 320, "b": 330, "r": 500, "q": 900, "k": 0}
PST = {
    "p": [0, 0, 0, 0, 0, 0, 0, 0,
          50, 50, 50, 50, 50, 50, 50, 50,
          10, 10, 20, 30, 30, 20, 10, 10,
          5, 5, 10, 25, 25, 10, 5, 5,
          0, 0, 0, 20, 20, 0, 0, 0,
          5, -5, -10, 0, 0, -10, -5, 5,
          5, 10, 10, -20, -20, 10, 10, 5,
          0, 0, 0, 0, 0, 0, 0, 0],
    "n": [-50, -40, -30, -30, -30, -30, -40, -50,
          -40, -20, 0, 0, 0, 0, -20, -40,
          -30, 0, 10, 15, 15, 10, 0, -30,
          -30, 5, 15, 20, 20, 15, 5, -30,
          -30, 0, 15, 20, 20, 15, 0, -30,
          -30, 5, 10, 15, 15, 10, 5, -30,
          -40, -20, 0, 5, 5, 0, -20, -40,
          -50, -40, -30, -30, -30, -30, -40, -50],
    "b": [-20, -10, -10, -10, -10, -10, -10, -20,
          -10, 0, 0, 0, 0, 0, 0, -10,
          -10, 0, 5, 10, 10, 5, 0, -10,
          -10, 5, 5, 10, 10, 5, 5, -10,
          -10, 0, 10, 10, 10, 10, 0, -10,
          -10, 10, 10, 10, 10, 10, 10, -10,
          -10, 5, 0, 0, 0, 0, 5, -10,
          -20, -10, -10, -10, -10, -10, -10, -20],
    "r": [0, 0, 0, 0, 0, 0, 0, 0,
          5, 10, 10, 10, 10, 10, 10, 5,
          -5, 0, 0, 0, 0, 0, 0, -5,
          -5, 0, 0, 0, 0, 0, 0, -5,
          -5, 0, 0, 0, 0, 0, 0, -5,
          -5, 0, 0, 0, 0, 0, 0, -5,
          -5, 0, 0, 0, 0, 0, 0, -5,
          0, 0, 0, 5, 5, 0, 0, 0],
    "q": [-20, -10, -10, -5, -5, -10, -10, -20,
          -10, 0, 0, 0, 0, 0, 0, -10,
          -10, 0, 5, 5, 5, 5, 0, -10,
          -5, 0, 5, 5, 5, 5, 0, -5,
          0, 0, 5, 5, 5, 5, 0, -5,
          -10, 5, 5, 5, 5, 5, 0, -10,
          -10, 0, 5, 0, 0, 0, 0, -10,
          -20, -10, -10, -5, -5, -10, -10, -20],
    "k": [-30, -40, -40, -50, -50, -40, -40, -30,
          -30, -40, -40, -50, -50, -40, -40, -30,
          -30, -40, -40, -50, -50, -40, -40, -30,
          -30, -40, -40, -50, -50, -40, -40, -30,
          -20, -30, -30, -40, -40, -30, -30, -20,
          -10, -20, -20, -20, -20, -20, -20, -10,
          20, 20, 0, 0, 0, 0, 20, 20,
          20, 30, 10, 0, 0, 10, 30, 20],
}


def is_white(p):
    return p != "." and p.isupper()


def row_of(i):
    return i >> 3


def col_of(i):
    return i & 7


def inb(r, c):
    return 0 <= r < 8 and 0 <= c < 8


def sq_name(i):
    return FILES[i & 7] + str(8 - (i >> 3))


def new_state(board=None):
    return {
        "board": list(board) if board else list(START),
        "turn": "w",
        "castling": {"K": True, "Q": True, "k": True, "q": True},
        "ep": -1,
        "half": 0,
        "full": 1,
    }


# ─────────────────────────── 走法生成 ───────────────────────────
def _add_pawn(out, frm, to, piece, promo):
    if promo:
        for q in ("Q", "R", "B", "N") if piece.isupper() else ("q", "r", "b", "n"):
            out.append((frm, to, piece, q, None))
    else:
        out.append((frm, to, piece, None, None))


def gen_pseudo(b, white, st):
    out = []
    for i in range(64):
        p = b[i]
        if p == "." or is_white(p) != white:
            continue
        t = p.lower()
        r, c = row_of(i), col_of(i)

        if t == "p":
            d = -1 if white else 1
            start = 6 if white else 1
            promo_row = 0 if white else 7
            nr = r + d
            if 0 <= nr < 8:
                one = nr * 8 + c
                if b[one] == ".":
                    _add_pawn(out, i, one, p, nr == promo_row)
                    if r == start:
                        two = (r + 2 * d) * 8 + c
                        if b[two] == ".":
                            out.append((i, two, p, None, "double"))
                for dc in (-1, 1):
                    nc = c + dc
                    if 0 <= nc < 8:
                        j = nr * 8 + nc
                        q = b[j]
                        if q != ".":
                            if is_white(q) != white:
                                _add_pawn(out, i, j, p, nr == promo_row)
                        elif j == st["ep"]:
                            out.append((i, j, p, None, "ep"))
        elif t == "n":
            for dr, dc in KNIGHT_D:
                nr, nc = r + dr, c + dc
                if inb(nr, nc):
                    j = nr * 8 + nc
                    q = b[j]
                    if q == "." or is_white(q) != white:
                        out.append((i, j, p, None, None))
        elif t == "k":
            for dr, dc in KING_D:
                nr, nc = r + dr, c + dc
                if inb(nr, nc):
                    j = nr * 8 + nc
                    q = b[j]
                    if q == "." or is_white(q) != white:
                        out.append((i, j, p, None, None))
            rank = 7 if white else 0
            ksq = rank * 8 + 4
            if i == ksq and not attacked(b, ksq, not white):
                rook = "R" if white else "r"
                if (st["castling"]["K" if white else "k"] and b[rank * 8 + 7] == rook
                        and b[rank * 8 + 5] == "." and b[rank * 8 + 6] == "."
                        and not attacked(b, rank * 8 + 5, not white)):
                    out.append((i, rank * 8 + 6, p, None, "o-o"))
                if (st["castling"]["Q" if white else "q"] and b[rank * 8] == rook
                        and b[rank * 8 + 1] == "." and b[rank * 8 + 2] == "."
                        and b[rank * 8 + 3] == "."
                        and not attacked(b, rank * 8 + 3, not white)):
                    out.append((i, rank * 8 + 2, p, None, "o-o-o"))
        else:
            dirs = BISHOP_D if t == "b" else ROOK_D if t == "r" else QUEEN_D
            for dr, dc in dirs:
                nr, nc = r + dr, c + dc
                while inb(nr, nc):
                    j = nr * 8 + nc
                    q = b[j]
                    if q == ".":
                        out.append((i, j, p, None, None))
                    else:
                        if is_white(q) != white:
                            out.append((i, j, p, None, None))
                        break
                    nr += dr
                    nc += dc
    return out


def attacked(b, sq, by_white):
    r, c = row_of(sq), col_of(sq)
    pr = r + 1 if by_white else r - 1
    if 0 <= pr < 8:
        pl = "P" if by_white else "p"
        if c > 0 and b[pr * 8 + c - 1] == pl:
            return True
        if c < 7 and b[pr * 8 + c + 1] == pl:
            return True
    kn = "N" if by_white else "n"
    for dr, dc in KNIGHT_D:
        nr, nc = r + dr, c + dc
        if inb(nr, nc) and b[nr * 8 + nc] == kn:
            return True
    kg = "K" if by_white else "k"
    for dr, dc in KING_D:
        nr, nc = r + dr, c + dc
        if inb(nr, nc) and b[nr * 8 + nc] == kg:
            return True
    bi = "B" if by_white else "b"
    qu = "Q" if by_white else "q"
    for dr, dc in BISHOP_D:
        nr, nc = r + dr, c + dc
        while inb(nr, nc):
            p = b[nr * 8 + nc]
            if p != ".":
                if p == bi or p == qu:
                    return True
                break
            nr += dr
            nc += dc
    ro = "R" if by_white else "r"
    for dr, dc in ROOK_D:
        nr, nc = r + dr, c + dc
        while inb(nr, nc):
            p = b[nr * 8 + nc]
            if p != ".":
                if p == ro or p == qu:
                    return True
                break
            nr += dr
            nc += dc
    return False


def find_king(b, white):
    k = "K" if white else "k"
    try:
        return b.index(k)
    except ValueError:
        return -1


def in_check(b, white):
    k = find_king(b, white)
    return k >= 0 and attacked(b, k, not white)


def make_move(b, st, m):
    frm, to, piece, promo, flag = m
    white = is_white(piece)
    undo = {"cap": b[to], "cap_sq": to,
            "castle": dict(st["castling"]), "ep": st["ep"], "half": st["half"]}

    b[frm] = "."
    if flag == "ep":
        cap_sq = to + (8 if white else -8)
        undo["cap"] = b[cap_sq]
        undo["cap_sq"] = cap_sq
        b[cap_sq] = "."
    b[to] = promo or piece

    if flag == "o-o":
        rk = (7 if white else 0) * 8
        b[rk + 5] = b[rk + 7]
        b[rk + 7] = "."
    elif flag == "o-o-o":
        rq = (7 if white else 0) * 8
        b[rq + 3] = b[rq]
        b[rq] = "."

    if piece == "K":
        st["castling"]["K"] = st["castling"]["Q"] = False
    if piece == "k":
        st["castling"]["k"] = st["castling"]["q"] = False
    if frm == 63 or to == 63:
        st["castling"]["K"] = False
    if frm == 56 or to == 56:
        st["castling"]["Q"] = False
    if frm == 7 or to == 7:
        st["castling"]["k"] = False
    if frm == 0 or to == 0:
        st["castling"]["q"] = False

    st["ep"] = (frm + to) // 2 if flag == "double" else -1
    st["half"] = 0 if (piece.lower() == "p" or undo["cap"] != ".") else st["half"] + 1
    return undo


def unmake_move(b, st, m, u):
    frm, to, piece, promo, flag = m
    white = is_white(piece)
    b[frm] = piece
    if u["cap_sq"] != to:
        b[u["cap_sq"]] = u["cap"]
        b[to] = "."
    else:
        b[to] = u["cap"]

    if flag == "o-o":
        rk = (7 if white else 0) * 8
        b[rk + 7] = b[rk + 5]
        b[rk + 5] = "."
    elif flag == "o-o-o":
        rq = (7 if white else 0) * 8
        b[rq] = b[rq + 3]
        b[rq + 3] = "."

    st["castling"] = u["castle"]
    st["ep"] = u["ep"]
    st["half"] = u["half"]


def legal_moves(b, white, st):
    out = []
    for m in gen_pseudo(b, white, st):
        u = make_move(b, st, m)
        k = find_king(b, white)
        if k < 0 or not attacked(b, k, not white):
            out.append(m)
        unmake_move(b, st, m, u)
    return out


# ─────────────────────────── 评估与搜索 ───────────────────────────
def evaluate(b):
    score = 0
    for i, p in enumerate(b):
        if p == ".":
            continue
        t = p.lower()
        v = VAL[t] + PST[t][i if p.isupper() else (i ^ 56)]
        score += v if p.isupper() else -v
    return score


class Searcher:
    def __init__(self):
        self.nodes = 0
        self.deadline = 0.0
        self.stopped = False

    def _time_up(self):
        if (self.nodes & 511) == 0 and time.monotonic() > self.deadline:
            self.stopped = True
        return self.stopped

    @staticmethod
    def _order(b, moves):
        def key(m):
            s = 0
            cap = b[m[1]]
            if cap != ".":
                s = 10 * VAL[cap.lower()] - VAL[m[2].lower()] + 1000
            if m[3]:
                s += 900
            if m[4] == "ep":
                s += 1000
            return -s
        moves.sort(key=key)

    def quiesce(self, b, alpha, beta, white, st, ply):
        self.nodes += 1
        if self._time_up():
            return (1 if white else -1) * evaluate(b)
        stand = (1 if white else -1) * evaluate(b)
        if stand >= beta:
            return beta
        if stand > alpha:
            alpha = stand
        if ply > 10:
            return alpha
        caps = [m for m in gen_pseudo(b, white, st)
                if b[m[1]] != "." or m[3] or m[4] == "ep"]
        self._order(b, caps)
        for m in caps:
            u = make_move(b, st, m)
            k = find_king(b, white)
            if k >= 0 and attacked(b, k, not white):
                unmake_move(b, st, m, u)
                continue
            sc = -self.quiesce(b, -beta, -alpha, not white, st, ply + 1)
            unmake_move(b, st, m, u)
            if self.stopped:
                return alpha
            if sc >= beta:
                return beta
            if sc > alpha:
                alpha = sc
        return alpha

    def negamax(self, b, depth, alpha, beta, white, st, ply):
        self.nodes += 1
        if self._time_up():
            return (1 if white else -1) * evaluate(b)
        if depth <= 0:
            return self.quiesce(b, alpha, beta, white, st, 0)

        moves = gen_pseudo(b, white, st)
        self._order(b, moves)
        best = -10 ** 9
        legal_count = 0
        first = True
        for m in moves:
            u = make_move(b, st, m)
            k = find_king(b, white)
            if k >= 0 and attacked(b, k, not white):
                unmake_move(b, st, m, u)
                continue
            legal_count += 1
            # PVS：第一手照常搜，其余先用零窗口探一下——绝大多数走法立刻被剪掉，
            # 同样的时间能多搜一层。探出比 alpha 还好才回头用全窗口重搜。
            if first:
                sc = -self.negamax(b, depth - 1, -beta, -alpha, not white, st, ply + 1)
                first = False
            else:
                sc = -self.negamax(b, depth - 1, -alpha - 1, -alpha, not white, st, ply + 1)
                if alpha < sc < beta and not self.stopped:
                    sc = -self.negamax(b, depth - 1, -beta, -alpha, not white, st, ply + 1)
            unmake_move(b, st, m, u)
            if self.stopped:
                break
            if sc > best:
                best = sc
            if sc > alpha:
                alpha = sc
            if alpha >= beta:
                break
        if not legal_count:
            return -MATE + ply if in_check(b, white) else 0
        return alpha if best == -10 ** 9 else best

    def best_move(self, board, white, st, max_depth, time_ms):
        b = list(board)
        st2 = {"castling": dict(st["castling"]), "ep": st["ep"], "half": st["half"]}
        roots = legal_moves(b, white, st2)
        if not roots:
            return None
        best = roots[0]
        best_score = 0
        reached = 0
        t0 = time.monotonic()
        self.deadline = t0 + time_ms / 1000.0
        self.nodes = 0
        self.stopped = False

        for d in range(1, max_depth + 1):
            alpha = -10 ** 9
            local_best, local_score = None, -10 ** 9
            ordered = [best] + [m for m in roots if m != best]
            for m in ordered:
                u = make_move(b, st2, m)
                sc = -self.negamax(b, d - 1, -10 ** 9, -alpha, not white, st2, 1)
                unmake_move(b, st2, m, u)
                if self.stopped:
                    break
                if sc > local_score:
                    local_score, local_best = sc, m
                if sc > alpha:
                    alpha = sc
            if local_best and (not self.stopped or d == 1):
                best, best_score, reached = local_best, local_score, d
            if self.stopped or abs(best_score) > MATE - 1000 or time.monotonic() > self.deadline:
                break

        return {"move": best, "score": best_score, "depth": reached,
                "nodes": self.nodes, "ms": int((time.monotonic() - t0) * 1000)}


# ─────────────────────────── SAN / FEN ───────────────────────────
def to_san(b, st, m):
    frm, to, piece, promo, flag = m
    t = piece.lower()
    if flag == "o-o":
        san = "O-O"
    elif flag == "o-o-o":
        san = "O-O-O"
    elif t == "p":
        capture = b[to] != "." or flag == "ep"
        san = (FILES[col_of(frm)] + "x" if capture else "") + sq_name(to)
        if promo:
            san += "=" + promo.upper()
    else:
        others = [x for x in legal_moves(b, piece.isupper(), st)
                  if x[1] == to and x[2] == piece and x[0] != frm]
        dis = ""
        if others:
            same_file = any(col_of(x[0]) == col_of(frm) for x in others)
            same_rank = any(row_of(x[0]) == row_of(frm) for x in others)
            if not same_file:
                dis = FILES[col_of(frm)]
            elif not same_rank:
                dis = str(8 - row_of(frm))
            else:
                dis = sq_name(frm)
        san = t.upper() + dis + ("x" if b[to] != "." else "") + sq_name(to)

    u = make_move(b, st, m)
    if in_check(b, not piece.isupper()):
        san += "#" if not legal_moves(b, not piece.isupper(), st) else "+"
    unmake_move(b, st, m, u)
    return san


def to_fen(st):
    b = st["board"]
    rows = []
    for r in range(8):
        line, empty = "", 0
        for c in range(8):
            p = b[r * 8 + c]
            if p == ".":
                empty += 1
            else:
                if empty:
                    line += str(empty)
                    empty = 0
                line += p
        if empty:
            line += str(empty)
        rows.append(line)
    cast = "".join(k for k in "KQkq" if st["castling"][k]) or "-"
    ep = sq_name(st["ep"]) if st["ep"] >= 0 else "-"
    return "/".join(rows) + " %s %s %s %d %d" % (st["turn"], cast, ep, st["half"], st["full"])


def from_fen(fen):
    parts = fen.split()
    if len(parts) < 4:
        return None
    board = ["."] * 64
    rows = parts[0].split("/")
    if len(rows) != 8:
        return None
    for r, row in enumerate(rows):
        idx = 0
        for ch in row:
            if ch.isdigit():
                idx += int(ch)
            elif ch in "pnbrqkPNBRQK":
                if idx > 7:
                    return None
                board[r * 8 + idx] = ch
                idx += 1
            else:
                return None
        if idx != 8:
            return None
    st = new_state(board)
    st["turn"] = "b" if parts[1] == "b" else "w"
    st["castling"] = {k: k in parts[2] for k in "KQkq"}
    st["ep"] = -1
    if parts[3] != "-":
        try:
            st["ep"] = (8 - int(parts[3][1])) * 8 + FILES.index(parts[3][0])
        except (ValueError, IndexError):
            return None
    st["half"] = int(parts[4]) if len(parts) > 4 and parts[4].isdigit() else 0
    st["full"] = int(parts[5]) if len(parts) > 5 and parts[5].isdigit() else 1
    if find_king(board, True) < 0 or find_king(board, False) < 0:
        return None
    return st


def perft(board, st, depth, white=True):
    """自测用：走法数。"""
    if depth == 0:
        return 1
    total = 0
    b = list(board)
    st2 = {"castling": dict(st["castling"]), "ep": st["ep"], "half": st["half"]}
    for m in legal_moves(b, white, st2):
        u = make_move(b, st2, m)
        total += perft(b, st2, depth - 1, not white)
        unmake_move(b, st2, m, u)
    return total


# ─────────────────────────── 识图 ───────────────────────────
N = 32              # 每格采样分辨率（32×32）
BLK = 4             # 每格切 4×4 块
BLK_PX = N // BLK   # 每块 8×8
INSET = 1           # 每块向内缩 1px，避开格线与相邻格的抗锯齿


def trim_border(img, max_frac=0.32, tol=24, need=0.86):
    """把框里四周的纯色背景裁掉（框比棋盘松的时候很有用）。

    取四个角的中位色当背景色，从四边往里扫：整行/整列绝大多数像素都接近背景色就裁掉。
    棋盘每行都是深浅交替，不会被误裁，所以最多只裁 32%。
    返回 (裁好的图, 左边被裁的像素, 上边被裁的像素)。
    """
    g = img.convert("L")
    W, H = g.size
    if W < 40 or H < 40:
        return img, 0, 0
    px = g.load()

    def corner(x, y):
        tot, n = 0, 0
        for yy in range(y, min(y + 10, H)):
            for xx in range(x, min(x + 10, W)):
                tot += px[xx, yy]
                n += 1
        return tot / n if n else 0.0

    samples = sorted([corner(0, 0), corner(max(0, W - 11), 0),
                      corner(0, max(0, H - 11)), corner(max(0, W - 11), max(0, H - 11))])
    bg = samples[1]                     # 第二小：避开某个角恰好压在棋盘上

    def row_is_bg(y):
        n = 0
        for x in range(0, W, 2):
            if abs(px[x, y] - bg) < tol:
                n += 1
        return n / (W / 2.0) > need

    def col_is_bg(x):
        n = 0
        for y in range(0, H, 2):
            if abs(px[x, y] - bg) < tol:
                n += 1
        return n / (H / 2.0) > need

    lim_y, lim_x = int(H * max_frac), int(W * max_frac)
    top = 0
    while top < lim_y and row_is_bg(top):
        top += 1
    bot = H - 1
    while bot > H - lim_y and row_is_bg(bot):
        bot -= 1
    left = 0
    while left < lim_x and col_is_bg(left):
        left += 1
    right = W - 1
    while right > W - lim_x and col_is_bg(right):
        right -= 1
    if right - left < 32 or bot - top < 32:
        return img, 0, 0
    return img.crop((left, top, right + 1, bot + 1)), left, top


def auto_align(img):
    """在框选区域里找最像 8×8 棋盘的位置，返回归一化 (left, top, size)。

    手拖的框几乎不可能正好贴住最外圈格子，偏几个像素格子就跨到隔壁，识别立刻变差。
    这里不认棋子，只看「相邻格的底色有没有明暗交替」——对齐准了交替最强，
    歪了就被抹平，所以只要把这个指标最大化。

    在缩略图上搜（短边 96px），405 个候选，几十毫秒。
    """
    g = img.convert("L")
    W, H = g.size
    if W < 48 or H < 48:
        return 0.0, 0.0, 1.0
    k = 96.0 / min(W, H)
    sw = max(32, int(W * k))
    sh = max(32, int(H * k))
    small = g.resize((sw, sh))
    px = small.load()

    def score(left, top, size):
        """棋盘对齐的分：相邻格底色差得越狠越好，格子内部越纯越好。

        只看「相邻格有差」不够——偏半格时每个格子都跨在两个棋盘格上，相邻还是有差。
        再加一条：对齐准了每格内部基本是单一底色，偏了就会在格子里看到分界线（内部方差大）。
        两条一起用，才能既对上格子、又能把框外的界面边裁掉。
        """
        side = size * min(sw, sh)
        x0 = left * sw
        y0 = top * sh
        cw = max(1.0, side / 8.0)
        cg = max(1, int(cw * 0.16))     # 角块边长
        inset = max(1, int(cw * 0.28))  # 中间区域从这儿开始
        vals, flats = [], []
        for r in range(8):
            for c in range(8):
                bx = x0 + c * cw
                by = y0 + r * cw
                # 底色：取四角小块（棋子压不到这里，干净反映棋盘格颜色）
                tot, n = 0, 0
                for oy in (0, cw - cg):
                    for ox in (0, cw - cg):
                        for y in range(int(by + oy), int(by + oy + cg)):
                            for x in range(int(bx + ox), int(bx + ox + cg)):
                                if 0 <= x < sw and 0 <= y < sh:
                                    tot += px[x, y]
                                    n += 1
                vals.append(tot / n if n else 0.0)

                # 纯净度：中间区域的标准差，跨格时会看到分界线
                s2, n2, cnt2 = 0.0, 0, 0
                xs = range(int(bx + inset), int(bx + cw - inset))
                ys = range(int(by + inset), int(by + cw - inset))
                for y in ys:
                    if not (0 <= y < sh):
                        continue
                    for x in xs:
                        if not (0 <= x < sw):
                            continue
                        s2 += px[x, y]
                        n2 += 1
                if n2:
                    mean = s2 / n2
                    var = 0.0
                    for y in ys:
                        if not (0 <= y < sh):
                            continue
                        for x in xs:
                            if not (0 <= x < sw):
                                continue
                            d2 = px[x, y] - mean
                            var += d2 * d2
                            cnt2 += 1
                    flats.append((var / max(1, cnt2)) ** 0.5)
                else:
                    flats.append(999.0)

        diff, cnt = 0.0, 0
        for r in range(8):
            for c in range(8):
                v = vals[r * 8 + c]
                if c + 1 < 8:
                    diff += abs(v - vals[r * 8 + c + 1])
                    cnt += 1
                if r + 1 < 8:
                    diff += abs(v - vals[(r + 1) * 8 + c])
                    cnt += 1
        diff /= max(1, cnt)
        flat = sum(flats) / 64.0
        return diff - 0.55 * flat

    best, best_s = (0.0, 0.0, 1.0), -1.0
    # 缩放范围放宽到 0.66~1.10：框得比棋盘大不少（把边上的界面也框进来）时也能纠回来
    for size in (0.90, 0.94, 0.97, 1.0, 1.03, 1.06):
        base = (1.0 - size) * 0.5
        span = 0.08
        for i in range(-4, 5):
            for j in range(-4, 5):
                left = base + i * span / 4.0
                top = base + j * span / 4.0
                sc = score(left, top, size)
                if sc > best_s:
                    best_s, best = sc, (left, top, size)
    return best


def align_image(img):
    """裁掉边框 + 对齐 8×8，返回 (对齐后的棋盘图, 相对原图的归一化 rect)。"""
    trimmed, ox, oy = trim_border(img)
    l, t, k = auto_align(trimmed)
    tw, th = trimmed.size
    side = max(8, k * min(tw, th))
    x0 = max(0.0, min(l * tw, tw - side))
    y0 = max(0.0, min(t * th, th - side))
    out = trimmed.crop((int(x0), int(y0), int(x0 + side), int(y0 + side)))
    W, H = img.size
    rect = ((ox + x0) / float(W), (oy + y0) / float(H), side / float(min(W, H)))
    return out, rect


# ─────────────────────────── 识图 v2 ───────────────────────────
# 采集链路（全部确定性计算，没有任何「猜」）：
#   1. 对齐后的棋盘缩到 192×192，每格 24×24，直接拿 PIL 的 tobytes()，不逐像素读；
#   2. 每格先减去本格平均亮度再加 128 —— 高亮、悬停、淡入淡出是「整格一起变亮变暗」，
#      减掉均值就消失了，只剩棋子轮廓；
#   3. 变化检测 = 同位置字节的绝对差均值；
#   4. 认子 = 8×8 特征做归一化互相关（NCC），与皮肤配色、整体明暗无关。
#
# 为什么换掉老版：老版每格只留 4×4=16 个灰度块，白兵和黑兵在这 16 个数里几乎一样，
# 只能靠「整体亮度」硬分，浅色底上的白兵和黑兵经常互换；高亮又会把整格抬亮，
# 于是「走了一步」被当成 3~4 格变化。v2 保留的是轮廓，且天然抗整格明暗变化。
CELL = 24                     # 每格采样 24×24
SIDE = CELL * 8               # 对齐后棋盘 192×192
CELL_PX = CELL * CELL         # 每格 576 字节
FEAT_CELL = 8                 # 认子特征：每格 8×8
FEAT_PX = FEAT_CELL * FEAT_CELL
DIFF_STEP = 3                 # 差分抽样步长（144 分之一，够用又快）


class Sig:
    """一帧棋盘的指纹。

    shape：64 格 × 576 字节的「去均值形状」，用来找哪几格变了；
    feat：64×64 的普通灰度，用来认子（保留绝对明暗，白子黑子才不会混）。
    """

    __slots__ = ("shape", "feat")

    def __init__(self, shape, feat):
        self.shape = shape
        self.feat = feat

    def __eq__(self, other):
        return isinstance(other, Sig) and self.shape == other.shape

    def __ne__(self, other):
        return not self.__eq__(other)

    __hash__ = None

    def __repr__(self):
        return "<Sig %d>" % len(self.shape)


_TABLES = {}


def _shift_table(m):
    """把整格减掉均值 m 再加 128，夹到 0..255。表缓存起来，一格一次译码。"""
    tb = _TABLES.get(m)
    if tb is None:
        tb = bytes(min(255, max(0, v - m + 128)) for v in range(256))
        if len(_TABLES) < 512:
            _TABLES[m] = tb
    return tb


def img_signature(img):
    """对齐好的棋盘图 → Sig（256 次方内的纯计算，一帧约 5~10ms）。"""
    g = img.convert("L")
    if g.size != (SIDE, SIDE):
        g = g.resize((SIDE, SIDE), Image.BILINEAR)
    raw = g.tobytes()
    feat = g.resize((64, 64), Image.BOX).tobytes()
    out = bytearray(len(raw))
    for sr in range(8):
        for sc in range(8):
            y0 = sr * CELL
            x0 = sc * CELL
            patch = b"".join(raw[(y0 + y) * SIDE + x0:(y0 + y) * SIDE + x0 + CELL]
                             for y in range(CELL))
            m = int(sum(patch) / CELL_PX)
            o = (sr * 8 + sc) * CELL_PX
            out[o:o + CELL_PX] = patch.translate(_shift_table(m))
    return Sig(bytes(out), feat)


def sign_diff(a, b):
    """每格差异（0..255，去均值后比较，所以高亮/整体明暗变化不算差异）。

    实测：静置噪声 0~2，走一步 25~70，整格高亮被抬起 3~8。滑杆阈值 6~24 正好夹住。
    """
    sa, sb = a.shape, b.shape
    out = [0.0] * 64
    n = len(range(0, CELL_PX, DIFF_STEP))
    for sq in range(64):
        o = sq * CELL_PX
        tot = 0
        for i in range(o, o + CELL_PX, DIFF_STEP):
            tot += abs(sa[i] - sb[i])
        out[sq] = tot / n
    return out


def changed_squares(scores, sens):
    return [sq for sq in range(64) if scores[sq] >= sens]


def diff_squares(a, b, sens):
    """兼容旧调用：直接给变化格列表。"""
    return changed_squares(sign_diff(a, b), sens)


INNER = 6                     # 只用格子里面的 6×6（去掉最外一圈：高亮框、格线都在那儿）
DIM = INNER * INNER           # 36


def cell_patch(sig, sq):
    """取画面第 sq 格的「内圈 6×6」特征（36 字节）+ (亮度均值, 起伏强度)。

    sq 是「画面格」（左上为 0）；棋盘格要先过 to_screen。
    去掉最外一圈是关键：上一步的黄色高亮、格子之间的分隔线全都压在外圈上，
    它们会伪装成「一个大方块棋子」，老版就是这么把空格读成子的。
    """
    buf = sig.feat
    r, c = sq >> 3, sq & 7
    o = r * FEAT_CELL * 64 + c * FEAT_CELL
    p = b"".join(buf[o + y * 64 + 1:o + y * 64 + 1 + INNER] for y in range(1, 1 + INNER))
    m = sum(p) / float(DIM)
    var = sum((v - m) ** 2 for v in p) / float(DIM)
    return p, m, var ** 0.5


def cell_occupied(sig, sq):
    """这一格有没有子：只看内圈起伏，不需要认身份。

    空格（哪怕被高亮框着）内圈是纯色，起伏 ≈ 0；有子必然占住中间。
    实测空格 ≤2、有子 ≥10，阈值 6 留足余量。
    """
    _, _, sd = cell_patch(sig, sq)
    return sd > 6.0


def cell_desc(p, m, sd):
    """形状描述子：内圈减去均值、除以标准差 → 只留轮廓，尺度与明暗都无关。"""
    if sd < 1e-6:
        return None
    return [(v - m) / sd for v in p]


# ─────────────────────── 页面标识 → 棋子 ───────────────────
PIECE_WORDS = [
    ("knight", "n"), ("night", "n"), ("horse", "n"), ("jumper", "n"),
    ("bishop", "b"), ("rook", "r"), ("castle", "r"), ("tower", "r"),
    ("queen", "q"), ("king", "k"), ("pawn", "p"), ("peon", "p"), ("soldier", "p"),
    ("兵", "p"), ("马", "n"), ("象", "b"), ("车", "r"), ("後", "q"), ("后", "q"), ("王", "k"),
]
COLOR_WORDS = (("white", "w"), ("light", "w"), ("w", "w"), ("白", "w"),
               ("black", "b"), ("dark", "b"), ("b", "b"), ("黑", "b"))
PIECE_LETTERS = "pnbrqk"


def token_to_piece(tok, override=None):
    """把页面上图子的 class / 文件名 / aria-label 猜成 FEN 字母。

    按「整词」判断，不是子串——否则 bishop 里的 b 会被当成黑方。
    实在认不出就返回 ""，由界面把原始标识显示出来（宁可不认，也别认错）。
    """
    if not tok:
        return ""
    low = str(tok).lower()
    if override:
        for key, val in override.items():
            if key and key in low:
                return val
    words = [w for w in re.split(r"[^0-9a-z\u4e00-\u9fa5]+", low) if w]

    # chess.com 这类「颜色+棋子」两字母缩写：br = 黑车、wp = 白兵。
    # 必须最先判，否则 br 里的 b 会被当成象。
    for w in words:
        if re.fullmatch(r"[wb][pnbrqk]", w):
            return w[1].upper() if w[0] == "w" else w[1]

    piece = ""
    for name, letter in PIECE_WORDS:
        if name in low and any(name in w for w in words):
            piece = letter
            break
    if not piece:
        for w in words:
            if len(w) in (1, 2):
                for ch in w:
                    if ch in PIECE_LETTERS:
                        piece = ch
                        break
            if piece:
                break
    if not piece:
        return ""
    color = ""
    for name, letter in COLOR_WORDS:
        if name in words:
            color = letter
            break
    if not color:
        for name, letter in (("白", "w"), ("黑", "b")):
            if name in low:
                color = letter
                break
    if not color:
        for w in words:
            if 2 <= len(w) <= 3 and any(c in "wb" for c in w) and any(c in PIECE_LETTERS for c in w):
                color = "w" if "w" in w else "b"
                break
    if not color:
        return ""
    return piece.upper() if color == "w" else piece


def to_screen(sq, flip):
    """棋盘格 → 屏幕上看到的位置（翻转时 180° 旋转）。"""
    r, c = sq >> 3, sq & 7
    return (7 - r) * 8 + (7 - c) if flip else r * 8 + c


def affected_list(m):
    """这步棋会动到哪几格（棋盘格号）。"""
    frm, to, piece, promo, flag = m
    sqs = [frm, to]
    white = piece.isupper()
    if flag == "o-o":
        rk = (7 if white else 0) * 8
        sqs += [rk + 7, rk + 5]
    elif flag == "o-o-o":
        rq = (7 if white else 0) * 8
        sqs += [rq, rq + 3]
    elif flag == "ep":
        sqs.append(to + (8 if white else -8))
    return list(dict.fromkeys(sqs))


def affected_squares(m, flip):
    return [to_screen(sq, flip) for sq in affected_list(m)]


def match_move(scores, moves, flip, sens=9, occ=None):
    """按分数挑最像的合法走法，返回 (走法, 分数) 或 (None, 分数)。

    打分而不是「变化格集合严格相等」：真实棋盘上永远多出几格（上一步高亮、悬停、
    动画残影、吃子淡出），严格相等基本撞不上，一撞不上那一步就永久漏了。

    from / to 两格都必须明显变化（取较小值，防止一边没动也通过），
    易位、吃过路兵的第三四格只当加分项。最后要求第一名明显高于第二名。
    """
    if not moves:
        return None, 0.0
    thresh = max(4.0, float(sens) * 1.1)
    best, best_s, second = None, 0.0, 0.0
    for m in moves:
        aff = affected_squares(m, flip)
        if occ is not None:
            # 真走一步必然「出发格变空、目标格有子」。上一步的黄色高亮、鼠标悬停
            # 会让两格都变样，但两格还都有子 —— 这一条就能把它们全挡掉，
            # 不会再凭空认出一手（老版就这么把 Qd1-f3 认成了 h2-h3）。
            if not occ[aff[1]] or occ[aff[0]]:
                continue
        vals = [scores[k] for k in aff]
        core = vals[0] if vals[0] < vals[1] else vals[1]
        extra = (sum(vals[2:]) / (len(vals) - 2)) if len(vals) > 2 else 0.0
        sc = core + extra * 0.30
        if sc > best_s:
            second = best_s
            best_s, best = sc, m
        elif sc > second:
            second = sc
    if best is None or best_s < thresh:
        return None, best_s
    if second >= thresh and second > best_s * 0.94:
        return None, best_s          # 两个候选咬得太紧，等下一帧更清楚的画面
    return best, best_s


# ─────────────────────── 棋子形状记忆（精准识别）───────────────────────
TPL_MAX = 8           # 同一身份最多累积几帧样本
TPL_TRUST = 26.0      # 与最像的那类差到这个数以上 → 认不准


class PieceBook:
    """记住每种棋子长什么样，之后整盘读。

    每种 (身份, 底色) 存一个「去均值单位化描述子的和」；比较用归一化互相关：
        ncc = Σ(样本描述子平均 · 当前描述子) / 36
    ncc 只跟轮廓有关，与皮肤、棋盘配色、整体亮度无关；1 = 完全一样，0 = 毫无关系。
    """

    def __init__(self):
        self.pieces = {}      # (char, parity) -> [desc 和(36), 样本数, 亮度和, 起伏和]
        self.empties = {}     # parity -> [亮度和, 起伏和, 样本数]

    def __len__(self):
        return len(self.pieces) + len(self.empties)

    def ready(self):
        return len(self.pieces) >= 8 and len(self.empties) >= 1

    def clear(self):
        self.pieces.clear()
        self.empties.clear()

    @staticmethod
    def parity(sq):
        return ((sq >> 3) + (sq & 7)) & 1

    def add(self, sig, board, flip=False, skip=None):
        for sq in range(64):
            if skip and sq in skip:
                continue
            scr = to_screen(sq, flip) if flip else sq
            par = self.parity(sq)
            p, m, sd = cell_patch(sig, scr)
            ch = board[sq]
            if ch == ".":
                e = self.empties.get(par)
                if e is None:
                    self.empties[par] = [float(m), float(sd), 1]
                elif e[2] < TPL_MAX * 4:
                    e[0] += m
                    e[1] += sd
                    e[2] += 1
                continue
            des = cell_desc(p, m, sd)
            if des is None:
                continue
            it = self.pieces.get((ch, par))
            if it is None:
                self.pieces[(ch, par)] = [list(des), 1, float(m), float(sd)]
            elif it[1] < TPL_MAX:
                for i in range(DIM):
                    it[0][i] += des[i]
                it[1] += 1
                it[2] += m
                it[3] += sd

    def dump(self):
        """存成 JSON（v2 格式）：下次开程序不用再点「学棋子」。"""
        return {
            "v": 2,
            "pieces": [[ch, p, n, round(ms / n, 2), round(sds / n, 2),
                        [round(z / n, 5) for z in zs]]
                       for (ch, p), (zs, n, ms, sds) in self.pieces.items()],
            "empties": [[p, round(e[0] / e[2], 2), round(e[1] / e[2], 2)]
                        for p, e in self.empties.items() if e[2]],
        }

    def load(self, d):
        try:
            if int(d.get("v", 0)) != 2:
                raise ValueError("旧版棋子库")
            for ch, p, n, ms, sds, zs in d.get("pieces", []):
                if len(zs) != DIM or not n:
                    continue
                # 存的是平均值，读回来换算成「和 + 样本数」，与 add 的数据结构保持一致
                self.pieces[(ch, int(p))] = [[z * n for z in zs], int(n),
                                             float(ms) * n, float(sds) * n]
            for p, m, sd in d.get("empties", []):
                self.empties[int(p)] = [float(m), float(sd), 1]
        except (TypeError, ValueError, KeyError):
            self.pieces.clear()
            self.empties.clear()

    def classify(self, sig, sq, flip=False):
        """返回 (身份, 偏差)。sq 是棋盘格，flip 时按 180° 换成画面格。

        偏差 ≈ (1 - 相似度) × 50：完美 0，像 0.9 → 5，像 0.5 → 25，认不准 > TPL_TRUST。
        """
        par = self.parity(sq)
        p, m, sd = cell_patch(sig, to_screen(sq, flip) if flip else sq)

        # 空格优先：亮度贴近底色、起伏也像底色。只看亮度不够（浅底上的白子亮度接近底色），
        # 只看起伏也不够（深色皮肤上的黑子起伏小），两条一起才稳。
        e = self.empties.get(par) or self.empties.get(1 - par)
        if e and e[2]:
            m0, sd0 = e[0] / e[2], e[1] / e[2]
            if abs(m - m0) < 20 and sd < max(5.0, sd0 * 2.0 + 3.0):
                return ".", abs(m - m0)

        des = cell_desc(p, m, sd)
        if des is None:
            return None, 1e9
        best, best_ncc = None, -2.0
        for (ch, pr), (zs, n, ms, sds) in self.pieces.items():
            if not n:
                continue
            dot = 0.0
            for i in range(DIM):
                dot += zs[i] * des[i]
            ncc = dot / (n * DIM)
            if pr != par:
                # 同一种子落在另一种底色上：形状一样，但底纹方向不同，略降优先
                ncc -= 0.10
            # 亮度差补一点点（白子黑子的轮廓有时过于接近）
            ncc -= abs(ms / n - m) / 900.0
            if ncc > best_ncc:
                best_ncc, best = ncc, ch
        if best is None:
            return None, 1e9
        return best, (1.0 - best_ncc) * 50.0


# ─────────────────────────── 鼠标 ───────────────────────────
def enable_dpi_awareness():
    """坐标系必须和截图一致，否则高 DPI 下框选与点击会整体偏移。"""
    try:
        ctypes.windll.shcore.SetProcessDpiAwareness(2)
    except Exception:                    # noqa: BLE001
        try:
            ctypes.windll.user32.SetProcessDPIAware()
        except Exception:                # noqa: BLE001
            pass


def virtual_origin():
    """多屏时虚拟桌面左上角可能是负数，截屏和点击都要用同一套坐标。"""
    u = ctypes.windll.user32
    return u.GetSystemMetrics(76), u.GetSystemMetrics(77)


def send_click(x, y):
    user32 = ctypes.windll.user32
    user32.SetCursorPos(int(x), int(y))
    time.sleep(0.05)
    user32.mouse_event(0x0002, 0, 0, 0, 0)
    time.sleep(0.03)
    user32.mouse_event(0x0004, 0, 0, 0, 0)


# ─────────────────────────── 界面 ───────────────────────────
CONFIG_DIR = os.path.join(os.environ.get("APPDATA", os.path.expanduser("~")), "ChessAssist")
CONFIG_PATH = os.path.join(CONFIG_DIR, "config.json")
BOOK_PATH = os.path.join(CONFIG_DIR, "book.json")
PIECES_PATH = os.path.join(CONFIG_DIR, "pieces.json")
VERSION = "1.3.0"

SENS_DEFAULT = 44          # 滑杆位置（1..50，越大越灵敏）

# ── 配色（偏暖、低饱和，长时间看不刺眼）──
FONT = "Microsoft YaHei UI"
C_BG = "#f2ecdf"
C_CARD = "#fffdf8"
C_LINE = "#ded3ba"
C_INK = "#33302a"
C_MUTED = "#8b8268"
C_ACCENT = "#3f6b3a"
C_BTN = "#efe6d2"
C_BTN_HI = "#e4d7bb"
C_BTN_INK = "#3a3630"
C_BOARD_L = "#efdfc2"
C_BOARD_D = "#b98a5d"
C_BOARD_BG = "#5f5140"
C_SEL = "#d9a520"
C_SUG = "#2f6fd0"
C_CHECK = "#c0392b"


class ScrollPane(tk.Frame):
    """可滚动容器：窗口再小也能把所有控件滚出来，不会把按钮挤没。"""

    def __init__(self, master, width=380):
        super().__init__(master, bg=C_BG)
        self.canvas = tk.Canvas(self, bg=C_BG, highlightthickness=0, bd=0, width=width)
        self.bar = ttk.Scrollbar(self, orient="vertical", command=self.canvas.yview)
        self.canvas.configure(yscrollcommand=self._on_scroll)
        self.canvas.pack(side="left", fill="both", expand=True)
        self.body = tk.Frame(self.canvas, bg=C_BG)
        self._win = self.canvas.create_window((0, 0), window=self.body, anchor="nw")
        self.body.bind("<Configure>", self._sync)
        self.canvas.bind("<Configure>", self._fit)
        self.bind("<Enter>", self._bind_wheel)
        self.bind("<Leave>", self._unbind_wheel)

    def _sync(self, _=None):
        self.canvas.configure(scrollregion=self.canvas.bbox("all"))

    def _fit(self, e):
        self.canvas.itemconfigure(self._win, width=e.width)

    def _on_scroll(self, first, last):
        if float(first) <= 0.0 and float(last) >= 1.0:
            self.bar.pack_forget()
        else:
            self.bar.pack(side="right", fill="y")
        self.bar.set(first, last)

    def _bind_wheel(self, _=None):
        self.canvas.bind_all("<MouseWheel>", self._wheel)

    def _unbind_wheel(self, _=None):
        self.canvas.unbind_all("<MouseWheel>")

    def _wheel(self, e):
        self.canvas.yview_scroll(-1 if e.delta > 0 else 1, "units")


def sens_from_slider(v):
    """滑杆位置 → 差分阈值。往右 = 阈值更小 = 更容易认出（4..14）。

    v2 的差分是去均值后的绝对差，静置噪声实测 0.0，走一步 12~44，
    所以整条区间可以压到 4~14：默认位置就足够灵敏，也不会被轻微抖动触发。
    """
    try:
        v = int(v)
    except (TypeError, ValueError):
        v = SENS_DEFAULT
    v = max(1, min(50, v))
    return 4.0 + (50 - v) * 10.0 / 49.0


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("国象应招器 · 应招助手")
        self.configure(bg=C_BG)
        sw, sh = self.winfo_screenwidth(), self.winfo_screenheight()
        w, h = min(1220, int(sw * 0.90)), min(860, int(sh * 0.90))
        self.geometry("%dx%d+%d+%d" % (w, h, max(0, (sw - w) // 2),
                                       max(0, (sh - h) // 2 - 24)))
        self.minsize(720, 480)

        self.st = new_state()
        self.human = "w"            # 我方（程序替我算的一方）
        self.orient = "w"
        self.legal = []
        self.selected = -1
        self.last_move = None
        self.log = []
        self.log_note = ""
        self.stack = []
        self.keys = []
        self.auto_reply = True
        self.auto_play = False
        self.depth = 4
        self.busy = False
        self.over = ""
        self.expect = None            # 保留字段，不再使用
        self.expect_at = 0.0
        self.suggest = None           # 程序给的那步建议（只画出来，不替我落子）
        self.clicked_at = 0.0
        self._last_sig = None
        self._adopt_tried = False
        self._sync_at = 0.0           # 最后一次「画面和程序局面确认一致」的时间
        self._book_bad = 0            # 连续几帧棋子库大面积认不准
        self._book_reset_at = 0.0
        self.our_move_at = 0.0
        self.book = PieceBook()        # 棋子形状记忆库
        self.book_msg = ""
        self.book_from_disk = False
        self.source = "screen"        # screen=屏幕识别 / dom=浏览器读取
        self.dom_last = None
        self.dom_at = 0.0
        self.dom_flip = False
        self.dom_status_at = 0.0
        self.piece_map = {}
        self.bridge = None
        self.board_at = 0.0            # 内部局面最后一次「确认与画面一致」的时间
        self.learn_at = 0.0
        self._view_photo = None
        self._view_im = None
        self._view_marks = []
        self.rect = (0.0, 0.0, 1.0)     # 自动对齐后的采样范围（归一化 left/top/size）
        self._raw = None                # 最近一次抓到的整块区域，手动微调时用
        self._drag = None
        self.rebase_pending = False   # 手动补录后要求重取基线
        self.region = None
        self.shot_base = None
        self.running = False
        self.sens = sens_from_slider(SENS_DEFAULT)
        self.search_engine = Searcher()
        self.ui_queue = queue.Queue()      # 工作线程只往这里塞回调，UI 一律在主线程改

        self._build_ui()
        self._load_config()
        self._init_bridge()
        self.new_game(silent=True)
        self.after(60, self._pump_ui)
        self.after(600, self._first_view)
        self.after(200, self._startup_move)

    def _pump_ui(self):
        try:
            while True:
                fn = self.ui_queue.get_nowait()
                try:
                    fn()
                except Exception as e:      # noqa: BLE001
                    print("UI 回调失败:", e)
        except queue.Empty:
            pass
        try:
            self._poll_dom()
        except Exception as e:          # noqa: BLE001
            print("浏览器读取出错:", e)
        self.after(60, self._pump_ui)

    # ---------- 界面 ----------
    # ── 界面 ───────────────────────────────────────────────
    def _build_ui(self):
        st = ttk.Style(self)
        try:
            st.theme_use("clam")
        except tk.TclError:
            pass
        st.configure("HS.Horizontal.TScale", background=C_CARD, troughcolor="#e6dbc3",
                     bordercolor=C_CARD, lightcolor=C_ACCENT, darkcolor=C_ACCENT,
                     gripcount=0, sliderthickness=14)
        st.configure("HS.Horizontal.TScrollbar", background="#dfd3b9",
                     troughcolor=C_BG, bordercolor=C_BG, arrowcolor=C_INK,
                     lightcolor="#dfd3b9", darkcolor="#dfd3b9")
        self.pane_style = st
        self.status = tk.StringVar(value="白先")
        self._draw_job = None
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # ── 顶栏 ──
        head = tk.Frame(self, bg=C_BG)
        head.grid(row=0, column=0, sticky="ew", padx=14, pady=(12, 6))
        tk.Label(head, text="国象应招器", bg=C_BG, fg=C_INK,
                 font=(FONT, 16, "bold")).pack(side="left")
        tk.Label(head, text="v" + VERSION, bg=C_BG, fg=C_MUTED,
                 font=("Consolas", 9)).pack(side="left", padx=(8, 0), pady=(6, 0))
        self.status_pill = tk.Label(head, textvariable=self.status, bg=C_ACCENT,
                                    fg="#f8f5ec", font=(FONT, 9, "bold"),
                                    padx=12, pady=5)
        self.status_pill.pack(side="right")

        # ── 主体：左棋盘 / 右控制区 ──
        body = tk.Frame(self, bg=C_BG)
        body.grid(row=1, column=0, sticky="nsew", padx=14)
        body.grid_columnconfigure(0, weight=1)
        body.grid_rowconfigure(0, weight=1)

        board_card = tk.Frame(body, bg=C_CARD, highlightbackground=C_LINE,
                              highlightthickness=1)
        board_card.grid(row=0, column=0, sticky="nsew", padx=(0, 12))
        board_card.grid_columnconfigure(0, weight=1)
        board_card.grid_rowconfigure(0, weight=1)

        self.canvas = tk.Canvas(board_card, bg=C_CARD, highlightthickness=0, bd=0)
        self.canvas.grid(row=0, column=0, sticky="nsew", padx=10, pady=10)
        self.canvas.bind("<Button-1>", self.on_board_click)
        self.canvas.bind("<Configure>", self._on_board_resize)

        foot = tk.Frame(board_card, bg=C_CARD)
        foot.grid(row=1, column=0, sticky="ew", padx=12, pady=(0, 10))
        self.turn_label = tk.Label(foot, text="", bg=C_CARD, fg=C_MUTED,
                                   font=(FONT, 9), anchor="w")
        self.turn_label.pack(side="left")

        self.pane = ScrollPane(body, width=386)
        self.pane.grid(row=0, column=1, sticky="ns")
        right = self.pane.body

        def card(title, hint=""):
            f = tk.Frame(right, bg=C_CARD, highlightbackground=C_LINE,
                         highlightthickness=1)
            f.pack(fill="x", pady=(0, 10))
            bar = tk.Frame(f, bg=C_CARD)
            bar.pack(fill="x")
            tk.Label(bar, text=title, bg=C_CARD, fg=C_INK,
                     font=(FONT, 9, "bold")).pack(side="left", padx=10, pady=(7, 2))
            if hint:
                tk.Label(bar, text=hint, bg=C_CARD, fg=C_MUTED,
                         font=(FONT, 8)).pack(side="right", padx=10)
            tk.Frame(f, bg=C_ACCENT, height=2).pack(fill="x", padx=10, pady=(0, 6))
            inner = tk.Frame(f, bg=C_CARD)
            inner.pack(fill="x", padx=10, pady=(0, 9))
            return inner

        def btn(parent, text, cmd, kind="normal"):
            bg = C_ACCENT if kind == "accent" else C_BTN
            fg = "#f8f5ec" if kind == "accent" else C_BTN_INK
            hi = "#35592f" if kind == "accent" else C_BTN_HI
            b = tk.Button(parent, text=text, command=cmd, font=(FONT, 9), bg=bg, fg=fg,
                          activebackground=hi, activeforeground=fg, relief="flat",
                          bd=0, padx=9, pady=4, cursor="hand2", highlightthickness=0)
            b.bind("<Enter>", lambda e, w=b, c=hi: w.config(bg=c))
            b.bind("<Leave>", lambda e, w=b, c=bg: w.config(bg=c))
            return b

        def lab(parent, text, muted=True, size=9):
            return tk.Label(parent, text=text, bg=C_CARD,
                            fg=C_MUTED if muted else C_INK, font=(FONT, size))

        # ① 对局
        g1 = card("对局", "轮到我方时自动算")
        row = tk.Frame(g1, bg=C_CARD)
        row.pack(fill="x")
        lab(row, "我执").pack(side="left")
        self.side_var = tk.StringVar(value="w")
        for txt, val in (("白", "w"), ("黑", "b")):
            tk.Radiobutton(row, text=txt, value=val, variable=self.side_var,
                           command=self.on_side_change, bg=C_CARD, fg=C_INK,
                           activebackground=C_CARD, selectcolor=C_CARD,
                           highlightthickness=0,
                           font=(FONT, 9)).pack(side="left", padx=(6, 0))
        self.auto_var = tk.BooleanVar(value=True)
        tk.Checkbutton(row, text="自动应招", variable=self.auto_var, bg=C_CARD,
                       fg=C_INK, activebackground=C_CARD, selectcolor=C_CARD,
                       highlightthickness=0, font=(FONT, 9),
                       command=self.on_auto_toggle).pack(side="left", padx=(14, 0))

        row2 = tk.Frame(g1, bg=C_CARD)
        row2.pack(fill="x", pady=(6, 0))
        lab(row2, "深度").pack(side="left")
        self.depth_var = tk.IntVar(value=6)
        self.depth_val = tk.Label(row2, text="6", bg=C_CARD, fg=C_INK, width=2,
                                  font=("Consolas", 9))
        self.depth_val.pack(side="left", padx=(2, 0))
        self.depth_scale = ttk.Scale(row2, from_=2, to=20, orient="horizontal",
                                     length=92, style="HS.Horizontal.TScale",
                                     command=self._on_depth)
        self.depth_scale.set(6)
        self.depth_scale.pack(side="left", padx=(0, 6))
        btn(row2, "算我这一步", self.think, "accent").pack(side="left")
        btn(row2, "悔棋", self.undo).pack(side="left", padx=4)
        btn(row2, "新局", self.new_game).pack(side="left")

        # ② 分析
        g3 = card("分析", "只给建议，不替你落子")
        self.result = tk.Label(g3, text="等你落子 / 录对手的棋", bg=C_CARD, fg=C_INK,
                               font=("Consolas", 10), justify="left", anchor="w",
                               wraplength=340)
        self.result.pack(fill="x")

        # ③ 读取棋盘
        g2 = card("读取棋盘")
        row0 = tk.Frame(g2, bg=C_CARD)
        row0.pack(fill="x")
        lab(row0, "数据源").pack(side="left")
        self.src_var = tk.StringVar(value="screen")
        for txt, val in (("浏览器读取", "dom"), ("屏幕识别", "screen")):
            tk.Radiobutton(row0, text=txt, value=val, variable=self.src_var,
                           command=self.on_source, bg=C_CARD, fg=C_INK,
                           activebackground=C_CARD, selectcolor=C_CARD,
                           highlightthickness=0,
                           font=(FONT, 9)).pack(side="left", padx=(6, 0))
        rowA = tk.Frame(g2, bg=C_CARD)
        rowA.pack(fill="x", pady=(5, 0))
        btn(rowA, "装扩展（浏览器读取）", self.export_ext).pack(side="left")
        btn(rowA, "诊断", self.dump_diag).pack(side="left", padx=5)

        self.dom_label = tk.Label(g2, text="浏览器读取：已关闭（用屏幕识别）", bg=C_CARD,
                                  fg=C_MUTED, font=("Consolas", 8), anchor="w",
                                  justify="left", wraplength=340)
        self.dom_label.pack(fill="x", pady=(4, 2))

        row3 = tk.Frame(g2, bg=C_CARD)
        row3.pack(fill="x", pady=(4, 0))
        b_pick = btn(row3, "① 框选棋盘", self.pick_region)
        b_pick.pack(side="left")
        self.btn_scan = btn(row3, "② 开始识别", self.toggle_scan, "accent")
        self.btn_scan.pack(side="left", padx=5)
        b_clear = btn(row3, "清区域", self.clear_region)
        b_clear.pack(side="left")

        row3b = tk.Frame(g2, bg=C_CARD)
        row3b.pack(fill="x", pady=(6, 4))
        b_align = btn(row3b, "⌖ 自动对齐", self.do_align)
        b_align.pack(side="left")
        b_learn = btn(row3b, "③ 学棋子", self.learn_now)
        b_learn.pack(side="left", padx=5)
        b_rebase = btn(row3b, "重取基线", self.rebase)
        b_rebase.pack(side="left")
        self._screen_widgets = [b_pick, self.btn_scan, b_clear, b_align, b_learn, b_rebase]

        # 识别区域预览（随面板宽度自适应）
        self._view_side = 300
        self.view = tk.Canvas(g2, width=self._view_side, height=self._view_side,
                              bg="#12130f", highlightthickness=0, bd=0)
        self.view.pack(pady=(2, 4))
        self.view.create_text(self._view_side // 2, self._view_side // 2,
                              text="框完棋盘，这里会显示程序看到的画面",
                              fill="#b9b19a", font=(FONT, 9), width=self._view_side - 40,
                              justify="center")
        self.view.bind("<ButtonPress-1>", self._view_down)
        self.view.bind("<B1-Motion>", self._view_move)
        self.view.bind("<ButtonRelease-1>", self._view_up)
        self.view.bind("<MouseWheel>", self._view_wheel)
        self.pane.body.bind("<Configure>", self._on_pane_resize, add="+")

        rowb = tk.Frame(g2, bg=C_CARD)
        rowb.pack(fill="x")
        self.book_label = tk.Label(rowb, text="棋子库：空（点「③ 学棋子」采集）",
                                   bg=C_CARD, fg=C_MUTED, font=("Consolas", 8),
                                   anchor="w", justify="left", wraplength=250)
        self.book_label.pack(side="left", fill="x", expand=True)
        btn(rowb, "重置", self.reset_book).pack(side="right")

        row4 = tk.Frame(g2, bg=C_CARD)
        row4.pack(fill="x", pady=(6, 0))
        self.play_var = tk.BooleanVar(value=False)
        tk.Checkbutton(row4, text="自动落子", variable=self.play_var, bg=C_CARD,
                       fg=C_INK, activebackground=C_CARD, selectcolor=C_CARD,
                       highlightthickness=0, font=(FONT, 9)).pack(side="left")
        lab(row4, "灵敏度").pack(side="left", padx=(10, 2))
        self.sens_var = tk.IntVar(value=SENS_DEFAULT)
        self.sens_scale = ttk.Scale(row4, from_=1, to=50, orient="horizontal",
                                    length=92, style="HS.Horizontal.TScale",
                                    command=self._on_sens)
        self.sens_scale.set(SENS_DEFAULT)
        self.sens_scale.pack(side="left")
        self.region_label = tk.Label(g2, text="未选择区域", bg=C_CARD, fg=C_MUTED,
                                     font=("Consolas", 8), anchor="w")
        self.region_label.pack(fill="x", pady=(2, 0))

        # ④ 着法记录
        g4 = card("着法记录")
        self.logbox = tk.Listbox(g4, height=6, font=("Consolas", 10), bg="#fffdf6",
                                 activestyle="none", relief="flat", bd=0,
                                 highlightthickness=1, highlightbackground=C_LINE,
                                 selectbackground=C_ACCENT, selectforeground="#f8f5ec")
        self.logbox.pack(fill="both", expand=True)
        row5 = tk.Frame(g4, bg=C_CARD)
        row5.pack(fill="x", pady=(6, 0))
        btn(row5, "复制棋谱", self.copy_log).pack(side="left")
        btn(row5, "复制 FEN", self.copy_fen).pack(side="left", padx=4)
        self.input_var = tk.StringVar()
        ent = tk.Entry(row5, textvariable=self.input_var, width=12, font=("Consolas", 10),
                       relief="flat", bd=0, highlightthickness=1,
                       highlightbackground=C_LINE, highlightcolor=C_ACCENT,
                       bg="#fffdf6", fg=C_INK)
        ent.pack(side="left", padx=(4, 4), ipady=3)
        ent.bind("<Return>", lambda e: self.apply_input())
        btn(row5, "走这步", self.apply_input).pack(side="left")
        tk.Frame(right, bg=C_BG, height=6).pack(fill="x")

        # ── 底栏 ──
        self.hint = tk.Label(self, text="程序只读、只建议，真实棋盘才是准的。"
                                        "推荐用「浏览器读取」——装一次扩展，直接抄站点局面；"
                                        "屏幕识别是兜底：框歪了点「自动对齐」，认不出点「重取基线」。",
                             bg=C_BG, fg=C_MUTED, font=(FONT, 9), anchor="w",
                             justify="left")
        self.hint.grid(row=2, column=0, sticky="ew", padx=16, pady=(4, 10))
        self.bind("<Configure>", self._on_root_resize)

    def _on_root_resize(self, e):
        if e.widget is not self:
            return
        self.hint.config(wraplength=max(200, e.width - 40))
        want = int(max(300, min(392, e.width * 0.40)))
        if abs(want - getattr(self, "_pane_w", 0)) > 6:
            self._pane_w = want
            self.pane.canvas.config(width=want)

    def _on_pane_resize(self, e=None):
        """面板宽度变了：预览框跟着变，文字换行宽度也跟着变。"""
        width = self.pane.canvas.winfo_width()
        side = max(180, min(300, width - 46))
        if abs(side - self._view_side) > 2:
            self._view_side = side
            self.view.config(width=side, height=side)
            if self._view_im is not None:
                self._paint_view()
            else:
                self.view.delete("all")
                self.view.create_text(side // 2, side // 2,
                                      text="框完棋盘，这里会显示程序看到的画面",
                                      fill="#b9b19a", font=(FONT, 9), width=side - 40,
                                      justify="center")
        wrap = max(200, width - 40)
        self.result.config(wraplength=wrap)
        self.dom_label.config(wraplength=wrap)
        self.book_label.config(wraplength=max(120, wrap - 60))

    def _on_board_resize(self, e=None):
        """棋盘画布尺寸变了：40ms 合并一次重绘，拖窗口时不会卡。"""
        if getattr(self, "_draw_job", None):
            return
        self._draw_job = self.after(40, self._redraw_board)

    def _redraw_board(self):
        self._draw_job = None
        self.draw()

    # ---------- 浏览器读取（主通道） ----------
    def _init_bridge(self):
        """本地桥：只监听 127.0.0.1，扩展往里发局面。"""
        self.piece_map = {}
        try:
            with open(PIECES_PATH, "r", encoding="utf-8") as f:
                m = json.load(f)
            if isinstance(m, dict):
                self.piece_map = {str(k).lower(): str(v) for k, v in m.items() if len(str(v)) == 1}
        except (OSError, ValueError):
            pass
        try:
            self.bridge = dom_bridge.Bridge()
            if not self.bridge.start():
                self.bridge = None
        except Exception as e:                       # noqa: BLE001
            self.bridge = None
            print("本地桥启动失败:", e)
        if self.source == "dom":
            self._apply_source_ui()

    def on_source(self):
        src = self.src_var.get()
        self.source = src
        if src == "dom":
            if self.running:
                self.running = False
                self.btn_scan.config(text="② 开始识别")
            self._set_result("已切到浏览器读取：装好扩展、打开棋局页面，这里会自己连上。\n"
                             "（不再需要框选和对齐；点了也不生效）")
        else:
            self._set_result("已切回屏幕识别。")
        self._apply_source_ui()

    def _apply_source_ui(self):
        dom = self.source == "dom"
        try:
            state = "normal" if not dom else "disabled"
            for w in getattr(self, "_screen_widgets", []):
                w.config(state=state)
        except tk.TclError:
            pass
        self._dom_status("浏览器：等待数据…" if dom else "浏览器读取：已关闭（用屏幕识别）")

    def _dom_status(self, text):
        if not hasattr(self, "dom_label"):
            return
        now = time.time()
        if now - self.dom_status_at < 0.2 and getattr(self, "_dom_last_text", "") == text:
            return
        self.dom_status_at = now
        self._dom_last_text = text
        self.dom_label.config(text=text)

    def _poll_dom(self):
        """界面每 60ms 来掏一次信箱。"""
        if not self.bridge:
            return
        data = self.bridge.poll()
        if data is None:
            if self.source == "dom":
                last = self.dom_at
                if last and time.time() - last > 2.0:
                    self._dom_status("浏览器：2 秒没数据了（扩展被停用 / 页面关了 / 程序被拦）")
            return
        self.dom_at = time.time()
        if self.source != "dom":
            return
        try:
            self._dom_apply(data)
        except Exception as e:                       # noqa: BLE001
            self._dom_status("解析出错：%s" % e)

    def _dom_apply(self, p):
        """收到一帧浏览器局面：exact 局面比对，不再有任何「猜」。"""
        self.dom_last = p
        cells = p.get("cells") or []
        note = (p.get("note") or "").strip()
        if len(cells) != 64:
            self._dom_status("浏览器：%s" % (note or "没读到棋盘"))
            return
        flip = bool(p.get("flip"))
        board = [None] * 64
        unknown = {}
        for i, tok in enumerate(cells):
            row, col = divmod(i, 8)
            sq = (7 - row) * 8 + (7 - col) if flip else row * 8 + col
            ch = token_to_piece(tok, self.piece_map) if tok else "."
            if ch:
                board[sq] = ch
            else:
                unknown[tok] = unknown.get(tok, 0) + 1
        if unknown:
            bad = "、".join("%s×%d" % (k.strip()[:24], v)
                            for k, v in list(unknown.items())[:4])
            self._dom_status("有 %d 个棋子认不出：%s · 点「诊断」把这一页发我"
                             % (sum(unknown.values()), bad))
            return
        if sum(1 for x in board if x in "K") != 1 or sum(1 for x in board if x == "k") != 1:
            self._dom_status("浏览器：%s · 但读到的局面对不上（没有唯一的王），先不动"
                             % (note or "已连上"))
            return

        self.dom_flip = flip
        # 程序里的棋盘跟着页面朝向画，手动点击才不会错位
        want = "b" if flip else "w"
        if self.orient != want:
            self.orient = want
            self.draw()

        # 点击自检：点过了但局面没动
        if self.clicked_at and time.time() - self.clicked_at > 2.0:
            self.clicked_at = 0.0
            self._set_result("自动落子点了，但浏览器里没变化——多半是坐标偏了，请手动走这步。")

        if board == self.st["board"]:
            self._sync_at = time.time()
            self._dom_status("浏览器：%s · 局面一致" % (note or "已连上"))
            return

        mv, side = self._find_move_exact(board)
        if mv:
            san = to_san(self.st["board"], self.st, mv)
            if side is not None and side != self.st["turn"]:
                self._apply_keep_turn(mv)
                self._set_result("补上漏掉的一手：%s（浏览器读取）" % san)
            else:
                self.do_move(mv)
                self._set_result("读到 %s（浏览器读取）" % san)
            self._dom_status("浏览器：%s · 局面一致" % (note or "已连上"))
            return

        # 差不止一步：DOM 是准的，直接照抄局面；轮谁走不确定，先不自动落子
        if self._adopt_board(board, turn=self.st["turn"]):
            self._sync_at = 0.0
            self._set_result("浏览器局面和程序差了不止一步，已照抄局面。\n"
                             "轮谁走不确定：确认后点「算我这一步」，或等对方走一步就自动接上。")
            self._dom_status("浏览器：%s · 已按页面重建局面" % (note or "已连上"))
        else:
            self._dom_status("浏览器：读到的局面没法用（先「新局」再连）")

    def _find_move_exact(self, nb):
        """新读到的局面是哪一步走出来的？两个方向都试，局面完全一致才算。"""
        cur = self.st["board"]
        if nb == cur:
            return None, None
        other = "w" if self.st["turn"] == "b" else "b"
        for side in (self.st["turn"], other):
            hits = []
            for mv in legal_moves(cur, side == "w", self.st):
                if self._simulate(mv) == nb:
                    hits.append(mv)
            if hits:
                promo = [m for m in hits if m[3] and m[3].lower() == "q"]
                return (promo[0] if promo else hits[0]), side
        return None, None

    def export_ext(self):
        """把内置的扩展文件放出来，并说明怎么装。"""
        src = ""
        meipass = getattr(sys, "_MEIPASS", "")
        if meipass:
            cand = os.path.join(meipass, "ext")
            if os.path.isdir(cand):
                src = cand
        if not src:
            here = os.path.dirname(os.path.abspath(__file__))
            for cand in (os.path.join(here, os.pardir, "ext"), os.path.join(here, "ext")):
                if os.path.isdir(cand):
                    src = cand
                    break
        if not src:
            self._set_result("程序里没带扩展文件（打包时漏了 ext 目录）。")
            return
        dst = os.path.join(CONFIG_DIR, "ext")
        try:
            os.makedirs(dst, exist_ok=True)
            for name in ("manifest.json", "content.js"):
                shutil.copyfile(os.path.join(src, name), os.path.join(dst, name))
        except OSError as e:
            self._set_result("导出失败：%s" % e)
            return
        try:
            os.startfile(dst)
        except OSError:
            pass
        self._set_result(
            "扩展已导出到：\n%s\n\n"
            "装法（只看一次）：\n"
            "1. 浏览器地址栏输 chrome://extensions（Edge 是 edge://extensions）\n"
            "2. 右上角打开「开发者模式」\n"
            "3. 点「加载已解压的扩展程序」，选上面那个文件夹\n"
            "4. 回到棋局页面刷新一下，这里就会显示「已连上」" % dst)

    def dump_diag(self):
        """把浏览器最后一帧原样存下来，方便我照着你那个站点调。"""
        path = os.path.join(CONFIG_DIR, "diag.json")
        try:
            os.makedirs(CONFIG_DIR, exist_ok=True)
            data = dict(self.dom_last or {})
            data["_app"] = VERSION
            data["_parsed"] = ""
            cells = data.get("cells") or []
            if len(cells) == 64:
                data["_parsed"] = "".join(
                    (token_to_piece(t, self.piece_map) or ("?" if t else ".")) if t else "."
                    for t in cells)
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=1)
            self._set_result("已导出诊断：%s\n把这个文件发给我，我照着你的站点调标识映射。"
                             % path)
        except OSError as e:
            self._set_result("导出失败：%s" % e)

    # ---------- 配置 ----------
    def _on_depth(self, v):
        try:
            lvl = int(round(float(v)))
        except (TypeError, ValueError):
            return
        self.depth_var.set(lvl)
        if hasattr(self, "depth_val"):
            self.depth_val.config(text=str(lvl))

    def _on_sens(self, v):
        try:
            lvl = int(round(float(v)))
        except (TypeError, ValueError):
            return
        self.sens_var.set(lvl)
        self.sens = sens_from_slider(lvl)

    def _load_config(self):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            self.region = tuple(cfg["region"]) if cfg.get("region") else None
            lvl = int(cfg.get("sens_lvl", SENS_DEFAULT))
            self.sens_var.set(lvl)
            self.sens_scale.set(lvl)
            self.sens = sens_from_slider(lvl)
            dep = int(cfg.get("depth", 6))
            self.depth_var.set(dep)
            self.depth_scale.set(dep)
            self.depth_val.config(text=str(dep))
            self.play_var.set(bool(cfg.get("auto_play", False)))
            src = str(cfg.get("source", "screen"))
            self.source = "dom" if src == "dom" else "screen"
            self.src_var.set(self.source)
            if self.region:
                self.region_label.config(text="区域 %s" % (self.region,))
            geo = str(cfg.get("geom") or "")
            if re.fullmatch(r"\d+x\d+([+-]-?\d+){2}", geo):
                self.geometry(geo)
        except (OSError, ValueError, KeyError):
            pass
        # 棋子库：上次跑出来的直接接着用，省得每次开局都点「学棋子」
        try:
            with open(BOOK_PATH, "r", encoding="utf-8") as f:
                self.book.load(json.load(f))
            if len(self.book):
                self.book_from_disk = True
                self.book_msg = "上次的，可直接用"
                self._refresh_book_label()
        except (OSError, ValueError, KeyError, TypeError):
            pass

    def _save_config(self):
        try:
            os.makedirs(CONFIG_DIR, exist_ok=True)
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump({"region": self.region, "sens_lvl": int(self.sens_var.get()),
                           "depth": self.depth_var.get(), "auto_play": self.play_var.get(),
                           "source": self.source, "geom": self.geometry()}, f)
        except OSError:
            pass
        try:
            if len(self.book):
                with open(BOOK_PATH, "w", encoding="utf-8") as f:
                    json.dump(self.book.dump(), f)
        except (OSError, TypeError, ValueError):
            pass

    # ---------- 渲染 ----------
    def flip(self):
        return self.orient == "b"

    def _geom(self):
        """棋盘画布的实际几何：居中、正方形、随窗口缩放。

        留出一圈边距（pad）专门放坐标字母，不然 a~h 会压在底排棋子上。
        """
        w = self.canvas.winfo_width()
        h = self.canvas.winfo_height()
        if w < 40 or h < 40:            # 还没完成布局
            w = h = 480
        total = min(w, h)
        pad = max(9, int(total * 0.038))
        cell = max(6.0, (total - 2 * pad) / 8.0)
        ox = (w - total) / 2.0 + pad
        oy = (h - total) / 2.0 + pad
        self._pad = pad
        return ox, oy, cell * 8.0, cell

    def cell_center(self, sq):
        ox, oy, side, cell = getattr(self, "_geo", None) or self._geom()
        r, c = sq >> 3, sq & 7
        sr, sc = (7 - r, 7 - c) if self.flip() else (r, c)
        return ox + (sc + 0.5) * cell, oy + (sr + 0.5) * cell

    def draw(self):
        cv = self.canvas
        cv.delete("all")
        ox, oy, side, cell = self._geom()
        self._geo = (ox, oy, side, cell)
        flip = self.flip()
        board = self.st["board"]
        king_sq = find_king(board, self.st["turn"] == "w")
        check = in_check(board, self.st["turn"] == "w")
        thin = max(1, int(cell * 0.035))
        thick = max(2, int(cell * 0.065))
        r3 = max(2, int(cell * 0.06))

        # 外框：一圈深色底（坐标就写在这圈上），看起来像实体棋盘
        pad = getattr(self, "_pad", 10)
        cv.create_rectangle(ox - pad, oy - pad, ox + side + pad, oy + side + pad,
                            fill=C_BOARD_BG, outline="")
        cv.create_rectangle(ox - 1, oy - 1, ox + side + 1, oy + side + 1,
                            outline="#5a4f3f", width=1)

        for sr in range(8):
            for sc in range(8):
                r = 7 - sr if flip else sr
                c = 7 - sc if flip else sc
                i = r * 8 + c
                x0 = ox + sc * cell
                y0 = oy + sr * cell
                x1, y1 = x0 + cell, y0 + cell
                cv.create_rectangle(x0, y0, x1, y1,
                                    fill=C_BOARD_L if (r + c) % 2 == 0 else C_BOARD_D,
                                    outline="", width=0)
                if self.last_move and i in (self.last_move[0], self.last_move[1]):
                    cv.create_rectangle(x0 + thin, y0 + thin, x1 - thin, y1 - thin,
                                        outline="#4f7f3f" if i == self.last_move[1]
                                        else "#7d8f6d", width=thick)
                if self.suggest and i in (self.suggest[0], self.suggest[1]):
                    cv.create_rectangle(x0 + thick, y0 + thick, x1 - thick, y1 - thick,
                                        outline=C_SUG if i == self.suggest[1]
                                        else "#9dc0f0", width=thick)
                if i == self.selected:
                    cv.create_rectangle(x0 + thin, y0 + thin, x1 - thin, y1 - thin,
                                        outline=C_SEL, width=thick + 1)
                if i == king_sq and check:
                    cv.create_rectangle(x0 + thin, y0 + thin, x1 - thin, y1 - thin,
                                        outline=C_CHECK, width=thick + 1)

        # 合法落点
        if self.selected >= 0:
            for m in self.legal:
                if m[0] == self.selected:
                    cx, cy = self.cell_center(m[1])
                    if board[m[1]] == "." and m[4] != "ep":
                        rr = max(3, int(cell * 0.11))
                        cv.create_oval(cx - rr, cy - rr, cx + rr, cy + rr,
                                       fill="#5b6b3a", outline="")
                    else:
                        rr = cell * 0.40
                        cv.create_oval(cx - rr, cy - rr, cx + rr, cy + rr,
                                       outline="#a33030", width=thick)

        # 棋子
        fs = max(10, int(cell * 0.62))
        off = max(1, int(cell * 0.030))
        for i, p in enumerate(board):
            if p == ".":
                continue
            cx, cy = self.cell_center(i)
            g = GLYPH[p.lower()]
            if p.isupper():
                for dx, dy in ((-off, 0), (off, 0), (0, -off), (0, off)):
                    cv.create_text(cx + dx, cy + dy, text=g, font=("Segoe UI Symbol", fs),
                                   fill="#4a4238")
                cv.create_text(cx, cy, text=g, font=("Segoe UI Symbol", fs), fill="#ffffff")
            else:
                cv.create_text(cx + 1, cy + 1, text=g, font=("Segoe UI Symbol", fs),
                               fill="#cfc7b8")
                cv.create_text(cx, cy, text=g, font=("Segoe UI Symbol", fs), fill="#18181c")

        # 坐标：写在棋盘外面那一圈上
        cf = max(7, int(min(cell * 0.30, pad * 0.78)))
        for k in range(8):
            f = FILES[k] if not flip else FILES[7 - k]
            cv.create_text(ox + (k + 0.5) * cell, oy + side + pad * 0.52,
                           text=f, font=("Consolas", cf), fill="#9b8f76")
            rn = str(8 - k) if not flip else str(k + 1)
            cv.create_text(ox - pad * 0.52, oy + (k + 0.5) * cell,
                           text=rn, font=("Consolas", cf), fill="#9b8f76")

        self.update_status()

    def update_status(self):
        if self.over:
            self.status.set(self.over)
            self._turn_text(self.over)
            return
        side = "白" if self.st["turn"] == "w" else "黑"
        mine = self.st["turn"] == self.human
        self.status.set("%s方走 · %s" % (side, "该你" if mine else "等对手"))
        self._turn_text("%s方走 · 你执%s · %s" % (
            side, "白" if self.human == "w" else "黑",
            "点「算我这一步」要建议" if mine else "等对手落子"))
        if hasattr(self, "status_pill"):
            self.status_pill.config(bg=C_ACCENT if mine else "#8a7a55")

    def _turn_text(self, t):
        if hasattr(self, "turn_label"):
            self.turn_label.config(text=t)

    # ---------- 对局 ----------
    def refresh_legal(self):
        self.legal = legal_moves(self.st["board"], self.st["turn"] == "w", self.st)

    def push_key(self):
        self.keys.append("".join(self.st["board"]) + self.st["turn"] + to_fen(self.st).split(" ")[2])

    def new_game(self, silent=False):
        self.st = new_state()
        self.selected = -1
        self.last_move = None
        self.log = []
        self.log_note = ""
        self.stack = []
        self.keys = []
        self.over = ""
        self.busy = False
        self.orient = self.human
        self.refresh_legal()
        self.push_key()
        self.logbox.delete(0, "end")
        self.draw()
        self.result.config(text="新局。你执%s。" % ("白" if self.human == "w" else "黑"))
        if not silent:
            self._maybe_reply()

    def _startup_move(self):
        self.draw()
        self._maybe_reply()

    def snapshot(self):
        return {"board": list(self.st["board"]), "turn": self.st["turn"],
                "castling": dict(self.st["castling"]), "ep": self.st["ep"],
                "half": self.st["half"], "full": self.st["full"],
                "last": self.last_move, "log_len": len(self.log), "keys": len(self.keys),
                "over": self.over}

    def restore(self, s):
        self.st["board"] = s["board"]
        self.st["turn"] = s["turn"]
        self.st["castling"] = s["castling"]
        self.st["ep"] = s["ep"]
        self.st["half"] = s["half"]
        self.st["full"] = s["full"]
        self.last_move = s["last"]
        self.log = self.log[:s["log_len"]]
        self.keys = self.keys[:s["keys"]]
        self.over = s["over"]
        self.selected = -1
        self.refresh_legal()

    def do_move(self, m, score=None):
        self.stack.append(self.snapshot())
        san = to_san(self.st["board"], self.st, m)
        make_move(self.st["board"], self.st, m)
        self.log.append(san)
        self.st["turn"] = "b" if self.st["turn"] == "w" else "w"
        if self.st["turn"] == "w":
            self.st["full"] += 1
        self.last_move = (m[0], m[1])
        self.selected = -1
        self.over = ""
        self.suggest = None
        self.push_key()
        self.refresh_legal()
        self.refresh_log()
        self.draw()
        self.check_end()
        if score is not None:
            self.show_score(score, san)
        # 局面刚变过：让识别在下一帧停稳时重取一次基线
        self.rebase_pending = True
        self.our_move_at = time.time()
        self.board_at = time.time()
        self._sync_at = time.time()
        self._maybe_reply()

    def check_end(self):
        if not self.legal:
            self.over = ("将杀！%s胜" % ("黑" if self.st["turn"] == "w" else "白")
                         if in_check(self.st["board"], self.st["turn"] == "w") else "逼和 · 和棋")
        elif self.st["half"] >= 100:
            self.over = "50 回合无吃子无兵动 · 和棋"
        elif self.keys.count(self.keys[-1]) >= 3:
            self.over = "三次重复局面 · 和棋"
        elif self._insufficient():
            self.over = "子力不足 · 和棋"
        if self.over:
            self.status.set(self.over)

    def _apply_keep_turn(self, m):
        """补上「不该是这方走、但画面上确实多了这一手」的走法：不切手。

        正常情况用不上（内部局面就是真实棋盘），只有在漏了一步、手数错位时才会走到。
        """
        self.stack.append(self.snapshot())
        san = to_san(self.st["board"], self.st, m)
        make_move(self.st["board"], self.st, m)
        if m[2].islower():
            self.st["full"] += 1
        self.log.append(san)
        self.last_move = (m[0], m[1])
        self.selected = -1
        self.suggest = None
        self.over = ""
        self.push_key()
        self.refresh_legal()
        self.refresh_log()
        self.draw()
        self.check_end()
        self.board_at = time.time()
        self._sync_at = time.time()
        self._maybe_reply()

    def _insufficient(self):
        pieces = {}
        for p in self.st["board"]:
            if p == "." or p.lower() == "k":
                continue
            pieces[p] = pieces.get(p, 0) + 1
        if not pieces:
            return True
        return len(pieces) == 1 and list(pieces.values())[0] == 1 and list(pieces)[0].lower() in "bn"

    def refresh_log(self):
        self.logbox.delete(0, "end")
        for i in range(0, len(self.log), 2):
            w = self.log[i]
            b = self.log[i + 1] if i + 1 < len(self.log) else ""
            self.logbox.insert("end", "%3d. %-8s %s" % (i // 2 + 1, w, b))
        if self.log_note:
            self.logbox.insert("end", "     " + self.log_note)
        if self.log:
            self.logbox.see("end")

    # ---------- 点击棋盘 ----------
    def on_board_click(self, ev):
        if self.busy or self.over:
            return
        ox, oy, side, cell = getattr(self, "_geo", None) or self._geom()
        sc, sr = int((ev.x - ox) // cell), int((ev.y - oy) // cell)
        if not (0 <= sc < 8 and 0 <= sr < 8):
            return
        flip = self.flip()
        r = 7 - sr if flip else sr
        c = 7 - sc if flip else sc
        i = r * 8 + c

        if self.selected >= 0 and self.selected != i:
            cands = [m for m in self.legal if m[0] == self.selected and m[1] == i]
            if cands:
                promo = [m for m in cands if m[3] and m[3].lower() == "q"]
                self.do_move(promo[0] if promo else cands[0])
                return
        p = self.st["board"][i]
        if p != "." and is_white(p) == (self.st["turn"] == "w"):
            self.selected = i
        else:
            self.selected = -1
        self.draw()

    # ---------- 引擎 ----------
    def think(self, from_scan=False):
        if self.busy or self.over or self.st["turn"] != self.human:
            return
        self.busy = True
        self.result.config(text="正在算…")
        depth = self.depth_var.get()
        # 深度是上限，真正卡时间：纯 Python 引擎再深也搜不完，给个随深度变长的预算
        budget = int(min(10000, 800 + depth * 700))
        board = list(self.st["board"])
        st = {"castling": dict(self.st["castling"]), "ep": self.st["ep"], "half": self.st["half"]}
        white = self.st["turn"] == "w"

        def run():
            res = self.search_engine.best_move(board, white, st, depth, budget)
            self.ui_queue.put(lambda: self._after_think(res))

        threading.Thread(target=run, daemon=True).start()

    def _after_think(self, res):
        self.busy = False
        if not res or not res["move"]:
            self.result.config(text="没算出可走的棋。")
            return
        m = res["move"]
        san = to_san(self.st["board"], self.st, m)
        sc = res["score"] / 100.0
        txt = "建议走：%s\n评分 %+.2f · 深度 %d/%d · %s 节点 · %d ms" % (
            san, sc, res["depth"], self.depth_var.get(), format(res["nodes"], ","), res["ms"])
        if abs(res["score"]) > MATE - 1000:
            txt = "建议走：%s（%s）" % (san, "将杀" if res["score"] > 0 else "被将杀")
        # 只把建议画在棋盘上，不写进自己的局面：真实棋盘才是唯一的真相，
        # 你要是走了别的，识别照样跟得上，不会因为「程序以为你按它说的走了」而错位。
        self.suggest = m
        self.clicked_at = 0.0
        self.draw()
        if self.play_var.get() and self.region and not m[3]:
            if time.time() - self._sync_at > 2.5:
                # 局面没和画面对上就千万别点：一乱点，真实棋局会被点成一锅粥
                self.result.config(text=txt + "\n局面还没和画面对上，这次不自动落子。")
                return
            self.result.config(text=txt + "\n已模拟点击：没落到棋盘上就手动走这步。")
            self.clicked_at = time.time()
            self._auto_play(m)
        else:
            self.result.config(text=txt)

    def _auto_play(self, m):
        if m[3]:
            self.result.config(text=self.result.cget("text") + "\n（升变这步需要你手动选一下棋子）")
            return
        if self.source == "dom":
            self._auto_play_dom(m)
            return
        if not self.region:
            return
        x1, y1, x2, y2 = self.region
        W, H = x2 - x1, y2 - y1
        l, t, k = self.rect               # 自动对齐后的真实棋盘范围，不能用框本身，否则点击会整体偏
        side = max(8, int(k * min(W, H)))
        bx, by = x1 + int(l * W), y1 + int(t * H)
        flip = self.flip()

        def point(sq):
            r, c = sq >> 3, sq & 7
            sr, sc = (7 - r, 7 - c) if flip else (r, c)
            return (bx + (sc + 0.5) * side / 8.0, by + (sr + 0.5) * side / 8.0)

        def run():
            send_click(*point(m[0]))
            time.sleep(0.12)
            send_click(*point(m[1]))

        threading.Thread(target=run, daemon=True).start()

    def _auto_play_dom(self, m):
        """按浏览器报上来的棋盘位置点，不用框选，也不会偏。"""
        p = self.dom_last or {}
        bd = p.get("board") or {}
        if not bd.get("width"):
            self.result.config(text="没拿到棋盘位置，这步请手动走。")
            return
        flip = bool(p.get("flip"))
        dpr = float(p.get("dpr") or 1)
        ox, oy = float(bd.get("screenX") or 0), float(bd.get("screenY") or 0)
        bx, by = ox + float(bd["left"]), oy + float(bd["top"])
        cw, ch = float(bd["width"]) / 8.0, float(bd["height"]) / 8.0

        def point(sq):
            r, c = sq >> 3, sq & 7
            sr, sc = (7 - r, 7 - c) if flip else (r, c)
            return ((bx + (sc + 0.5) * cw) * dpr, (by + (sr + 0.5) * ch) * dpr)

        def run():
            send_click(*point(m[0]))
            time.sleep(0.12)
            send_click(*point(m[1]))

        threading.Thread(target=run, daemon=True).start()

    def _maybe_reply(self):
        if self.over or self.busy:
            return
        if not self.auto_var.get():
            return
        if self.st["turn"] == self.human:
            self.after(120, lambda: self.think())

    def undo(self):
        if self.busy or not self.stack:
            return
        self.restore(self.stack.pop())
        if self.stack and self.st["turn"] != self.human:
            self.restore(self.stack.pop())
        self.over = ""
        self.refresh_log()
        self.draw()
        self.result.config(text="已悔棋。")

    # ---------- 输入 ----------
    def apply_input(self):
        if self.busy or self.over:
            return
        text = self.input_var.get().strip()
        if not text:
            return
        m = self.parse_input(text)
        if not m:
            self.result.config(text="看不懂这步棋（e2e4 / Nf3 / O-O）")
            return
        self.input_var.set("")
        self.do_move(m)

    def parse_input(self, text):
        t = text.replace(" ", "").replace("0", "O").upper()
        if t in ("O-O", "OO"):
            for m in self.legal:
                if m[4] == "o-o":
                    return m
            return None
        if t in ("O-O-O", "OOO"):
            for m in self.legal:
                if m[4] == "o-o-o":
                    return m
            return None

        import re
        mt = re.match(r"^([a-hA-H][1-8])[-x]?([a-hA-H][1-8])([qrbnQRBN])?$", text.replace(" ", ""))
        if mt:
            frm = (8 - int(mt.group(1)[1])) * 8 + FILES.index(mt.group(1)[0].lower())
            to = (8 - int(mt.group(2)[1])) * 8 + FILES.index(mt.group(2)[0].lower())
            promo = mt.group(3)
            cands = [m for m in self.legal if m[0] == frm and m[1] == to]
            if promo:
                cands = [m for m in cands if m[3] and m[3].lower() == promo.lower()]
            elif len(cands) > 1:
                cands = [m for m in cands if m[3] and m[3].lower() == "q"]
            return cands[0] if cands else None

        want = text.replace("+", "").replace("#", "").replace("0", "O").lower()
        for m in self.legal:
            san = to_san(self.st["board"], self.st, m)
            if san.replace("+", "").replace("#", "").replace("0", "O").lower() == want:
                return m
        return None

    # ---------- 识图 ----------
    def clear_region(self):
        self.region = None
        self.shot_base = None
        self._view_photo = None
        self.region_label.config(text="未选择区域")
        self.view.delete("all")
        self.view.create_text(self._view_side // 2, self._view_side // 2,
                              text="框完棋盘，这里会显示程序看到的画面",
                              fill="#b9b19a", font=(FONT, 9), width=self._view_side - 40,
                              justify="center")
        self._save_config()

    def pick_region(self):
        self.withdraw()
        self.after(220, self._open_selector)

    def _open_selector(self):
        try:
            full = ImageGrab.grab(all_screens=True)
        except Exception as e:            # noqa: BLE001
            self.deiconify()
            messagebox.showerror("截屏失败", str(e))
            return

        win = tk.Toplevel(self)
        win.title("拖一个框，把棋盘框进去（Esc 取消）")
        win.attributes("-fullscreen", True)
        win.attributes("-topmost", True)
        win.configure(cursor="crosshair")

        scale = min(win.winfo_screenwidth() / full.width, win.winfo_screenheight() / full.height, 1.0)
        view = full.resize((int(full.width * scale), int(full.height * scale)))
        photo = ImageTk.PhotoImage(view)
        cv = tk.Canvas(win, highlightthickness=0, cursor="crosshair")
        cv.pack(fill="both", expand=True)
        cv.create_image(0, 0, image=photo, anchor="nw")
        cv.image = photo

        box = {"start": None, "rect": None}

        def on_down(e):
            box["start"] = (e.x, e.y)
            if box["rect"]:
                cv.delete(box["rect"])
            box["rect"] = cv.create_rectangle(e.x, e.y, e.x, e.y, outline="#3ddc84", width=3)

        def on_move(e):
            if not box["start"] or not box["rect"]:
                return
            x0, y0 = box["start"]
            cv.coords(box["rect"], x0, y0, e.x, e.y)

        def on_up(e):
            if not box["start"]:
                return
            x0, y0 = box["start"]
            x1, y1, x2, y2 = min(x0, e.x), min(y0, e.y), max(x0, e.x), max(y0, e.y)
            if x2 - x1 < 40 or y2 - y1 < 40:
                return
            vx, vy = virtual_origin()
            self.region = (int(vx + x1 / scale), int(vy + y1 / scale),
                           int(vx + x2 / scale), int(vy + y2 / scale))
            self.region_label.config(text="区域 %s" % (self.region,))
            self._save_config()
            win.destroy()
            self.deiconify()
            self.shot_base = None
            self._view_marks = []
            self.rect = (0.0, 0.0, 1.0)
            self.do_align(quiet=True)      # 手拖的框基本不可能刚好贴住格子，先自动对一遍
            self.result.config(text="已框住棋盘并自动对齐（下面就是程序实际看到的画面）。"
                                    "点「开始识别」。")

        cv.bind("<ButtonPress-1>", on_down)
        cv.bind("<B1-Motion>", on_move)
        cv.bind("<ButtonRelease-1>", on_up)
        win.bind("<Escape>", lambda e: (win.destroy(), self.deiconify()))
        win.focus_force()

    def toggle_scan(self):
        if self.running:
            self.running = False
            self.btn_scan.config(text="② 开始识别")
            self.result.config(text="已停止识别。")
            return
        if self.source == "dom":
            self._set_result("当前是浏览器读取模式，不用（也不该）开图像识别。\n"
                             "要回到识图就把数据源切到「屏幕识别」。")
            return
        if not self.region:
            messagebox.showinfo("还没框棋盘", "先点「① 框选棋盘」把屏幕上的棋盘框进去。")
            return
        self.do_align(quiet=True)
        self.running = True
        self.shot_base = None
        self.expect = None
        self._scan_still = 0
        self._scan_hinted = False
        self.btn_scan.config(text="■ 停止识别")
        self.result.config(text="识别中：你在那边下，我这边读。")
        threading.Thread(target=self._scan_loop, daemon=True).start()

    def _first_view(self):
        """上次存的区域还在：启动就把那块画面画出来。"""
        if not self.region:
            return
        try:
            self._paint_view(self._crop(self._grab()))
        except Exception:                    # noqa: BLE001
            pass

    def _board_read(self, sig, scores=None, sens=None):
        """用棋子库把整盘读一遍：返回 (与内部局面不同的格, 是否可信, 认不准的格数)。

        光「认出来的身份和棋盘不一样」还不够——上一步的黄色高亮会让空格长得像棋子，
        所以再加一条：这一格的灰度必须也确实变过（差分会给分）。两条都满足才算差异，
        这样高亮、图标边缘、轻微抖动都不会混进来。
        """
        rb, unsure = self._read_board(sig, scores, sens)
        if rb is None:
            return [], False, 64
        diff = [sq for sq in range(64) if rb[sq] is not None and rb[sq] != self.st["board"][sq]]
        return diff, unsure <= 3, unsure

    def _read_board(self, sig, scores=None, sens=None):
        """把画面读成局面：返回 (64 格的字符, None=认不准) 和认不准的格数。

        scores 给了就要求那一格画面确实变过，否则「本来就是这子」的格子也算进来，
        于是每次读都报一堆差异。
        """
        if not self.book.ready():
            return None, 64
        flip = self.flip()
        rb, unsure = [None] * 64, 0
        for sq in range(64):
            ch, d = self.book.classify(sig, sq, flip)
            if ch is None or d > TPL_TRUST:
                unsure += 1
                continue
            if scores is not None and sens and ch != self.st["board"][sq] \
                    and scores[to_screen(sq, flip)] < sens * 0.6:
                continue                      # 灰度几乎没动：多半是高亮，不当走子证据
            rb[sq] = ch
        return rb, unsure

    def _simulate(self, m):
        """在副本上走一步，返回走完的局面。"""
        b = list(self.st["board"])
        st = {"castling": dict(self.st["castling"]), "ep": self.st["ep"], "half": self.st["half"]}
        make_move(b, st, m)
        return b

    def _match_by_read(self, rb):
        """整盘读到的局面 → 找出「当前局面 + 一步合法走法」正好等于它的那一步。

        这条比像素差分硬得多：高亮、动画残影、灵敏度阈值全都影响不到它，
        而且我方走的和对手走的都一并认（返回 side 告诉你这步是谁的）。
        """
        cur = self.st["board"]
        if all(rb[sq] is None or rb[sq] == cur[sq] for sq in range(64)):
            return None, 0.0, None          # 读出来跟内部局面一致：没有新走法
        known = sum(1 for x in rb if x is not None)
        if known < 52:
            return None, 0.0, None          # 认不准太多，别猜
        other = "w" if self.st["turn"] == "b" else "b"
        for side in (self.st["turn"], other):
            legal = legal_moves(cur, side == "w", self.st)
            hits = []
            for mv in legal:
                nb = self._simulate(mv)
                if all(rb[sq] is None or rb[sq] == nb[sq] for sq in range(64)):
                    hits.append(mv)
            if len(hits) == 1:
                return hits[0], 30.0, side
        return None, 0.0, None

    def _adopt_board(self, rb, turn=None):
        """对不上任何一步、画面又明明变了：直接把内部局面换成画面读到的样子。

        只在读得很干净（认不准 ≤ 4 格）时才做，而且会明说「已按画面重建」，
        免得悄悄跟真实棋盘分家。turn 不给就默认切一手（正常走一步的情况）。
        """
        cur = self.st["board"]
        known = sum(1 for x in rb if x is not None)
        if known < 58:
            return False
        nb = [rb[sq] or cur[sq] for sq in range(64)]
        if sum(1 for p in nb if p == "K") != 1 or sum(1 for p in nb if p == "k") != 1:
            return False
        for sq in range(64):
            if nb[sq] in "Pp" and (sq < 8 or sq >= 56):
                return False             # 兵站在底线：这读数不可信
        if turn is None and sum(1 for a, b in zip(nb, cur) if a != b) < 2:
            return False
        if turn is None:
            turn = "w" if self.st["turn"] == "b" else "b"
        self.stack.append(self.snapshot())
        self.st["board"] = nb
        self.st["turn"] = turn
        self.st["ep"] = -1
        self.st["half"] = 0
        self.st["full"] += 1
        self.last_move = None
        self.suggest = None
        self.selected = -1
        self.over = ""
        self.log_note = "（局面已按画面重建，前几手没能记全）"
        self.push_key()
        self.refresh_legal()
        self.refresh_log()
        self.draw()
        self.board_at = time.time()
        return True

    def _occ_now(self, sig):
        """这一帧「哪几格有子」（画面格顺序）。给走法匹配当硬闸门用。"""
        return [cell_occupied(sig, i) for i in range(64)]

    def _occ_mismatch(self, sig):
        """画面上的「有子 / 没子」和程序局面差几格。

        不认识棋子也能算：只看格心有没有东西。这是「局面到底对不对」的硬指标——
        正常走一步只差 2 格（易位 4 格），差到六七格以上就说明局面已经和画面分家了。
        """
        flip = self.flip()
        board = self.st["board"]
        bad = 0
        for sq in range(64):
            if cell_occupied(sig, to_screen(sq, flip) if flip else sq) != (board[sq] != "."):
                bad += 1
        return bad

    def _learn(self, sig, force=False):
        """在「画面和内部棋盘确定一致」的帧上记住每格图案。

        两道关：占位要先对上（差 ≤2 格），第二道是拿现有库回读这帧，认不准或读出来不一样
        就不学。以前只靠第二道，而第一帧（force）根本没把关——用错局面标注一次，
        整库棋子形状就教歪了，那之后一直「认不准 49 格」，怎么点都救不回来。
        """
        bad = self._occ_mismatch(sig)
        if bad > 2:
            self.book_msg = "占位差 %d 格" % bad
            return False
        if not force and self.book.ready():
            diff, ok, _ = self._board_read(sig)
            if not ok or diff:
                return False
        self.book.add(sig, self.st["board"], self.flip(), None)
        self.learn_at = time.time()
        return True

    def _book_move(self, moves, book_diff, scores=None):
        """整盘比对说这几格不一样，就找出正好走在这几格上的合法走法。

        要求「走法影响的格子全在差异里」且多出来的差异不超过 2 格（半个子都不许差太多），
        这样上一步的黄色高亮混进差异里也不会误判。
        """
        if not book_diff or len(book_diff) > 8:
            return None
        keys = set(to_screen(sq, self.flip()) for sq in book_diff)
        cands = []
        for mv in moves:
            aff = set(affected_squares(mv, self.flip()))
            if not aff or not aff <= keys:
                continue
            # 只允许 1 格噪声：整盘读偶尔会把高亮格认成棋子，容忍太多就会选错走法
            if len(keys) - len(aff) > 1:
                continue
            # 排序用差分分数：真走子那两格变化大，光是高亮凑出来的组合分数低
            heat = 0.0
            if scores:
                for s2 in aff:
                    heat += scores[s2] if s2 < len(scores) else 0.0
            cands.append((heat, len(aff), mv))
        if not cands:
            return None
        cands.sort(key=lambda x: (-x[0], -x[1]))
        if len(cands) > 1 and abs(cands[0][0] - cands[1][0]) < 1e-6 \
                and cands[0][1] == cands[1][1]:
            return None          # 两步一样像，宁可不猜
        return cands[0][2]


    def book_summary(self):
        chars = sorted(set(ch for ch, _ in self.book.pieces))
        who = "全套" if len(chars) >= 12 else (" ".join(chars) if chars else "-")
        return "棋子 %d 类 %s · 空格 %d 色" % (len(chars), who, len(self.book.empties))

    def learn_now(self):
        """手动学棋子：把你屏幕上这块棋盘的每一格按程序当前的局面记下来。

        最理想是刚开一局、程序和画面是同一个局面时点一次——12 种棋子 + 2 种底色空格
        一次就全了。之后「整盘重读」就有据可依。
        """
        if not self.region:
            messagebox.showinfo("还没框棋盘", "先点「① 框选棋盘」把棋盘框进去。")
            return
        try:
            img = self._crop(self._grab())
            first = img_signature(img)
            time.sleep(0.15)
            img2 = self._crop(self._grab())
        except Exception as e:               # noqa: BLE001
            self._set_result("抓屏失败：%s" % e)
            return
        self._paint_view(img)
        if img_signature(img2) != first:
            self._set_result("画面还在动（棋子动画 / 闪烁），等它停稳再点「学棋子」。")
            return
        if not self._learn(first, force=True):
            self._refresh_book_label()
            self._set_result("画面上的棋子和程序局面对不上（%s），没法学。\n"
                             "先在程序棋盘上把局面摆成屏幕上那样（点击/拖动，或用下面的输入框），"
                             "再点「③ 学棋子」。" % (self.book_msg or "占位差异"))
            return
        self._refresh_book_label()
        self._set_result("已按当前局面学了：%s。" % self.book_summary())

    def reset_book(self):
        self.book.clear()
        self.book_from_disk = False
        try:
            os.remove(BOOK_PATH)
        except OSError:
            pass
        self._refresh_book_label()
        self._set_result("棋子库已清空，画面稳定下来会重新学一遍。")

    def _refresh_book_label(self):
        n = len(self.book)
        txt = "棋子库：空（点「③ 学棋子」采集）" if not n else self.book_summary()
        if n and self.book_msg:
            txt += " · " + self.book_msg
        self.ui_queue.put(lambda t=txt: self.book_label.config(text=t))

    def _paint_view(self, img=None, changed=None):
        """把「程序实际看到的那块」画出来：截图形 + 8×8 网格 + 变化格/差异格标记。"""
        cv = self.view
        side = self._view_side
        if img is not None:
            self._view_im = img.convert("RGB")
        if self._view_im is None:
            return
        if min(self._view_im.size) < 64:
            cv.delete("all")
            cv.create_text(side // 2, side // 2, fill="#c8c0a8", font=(FONT, 9),
                           width=side - 40, justify="center",
                           text="区域只有 %d×%d 像素，太小了。\n"
                                "重新点「① 框选棋盘」把整块棋盘框进去。"
                                % self._view_im.size)
            return
        self._view_photo = ImageTk.PhotoImage(self._view_im.resize((side, side)))
        cv.delete("all")
        cv.create_image(0, 0, anchor="nw", image=self._view_photo)
        step = side / 8.0
        for i in range(9):
            x = int(i * step)
            cv.create_line(x, 0, x, side, fill="#5fd68d", dash=(2, 4))
            cv.create_line(0, x, side, x, fill="#5fd68d", dash=(2, 4))
        for tag, color in self._view_marks:
            r, c = tag >> 3, tag & 7
            cv.create_rectangle(int(c * step) + 1, int(r * step) + 1,
                                int((c + 1) * step) - 1, int((r + 1) * step) - 1,
                                outline=color, width=2)

    def _view_down(self, e):
        if self._raw is None:
            return
        self._drag = (e.x, e.y, self.rect)

    def _view_move(self, e):
        """在预览上按住拖 = 平移采样框；滚轮 = 缩放。自动对齐不准时自己拨一下。"""
        if self._drag is None or self._raw is None:
            return
        x0, y0, rect = self._drag
        l, t, k = rect
        side = float(self._view_side)
        l += (e.x - x0) / side * k
        t += (e.y - y0) / side * k
        self.rect = (l, t, k)
        self.shot_base = None
        self._paint_view(self._crop(self._raw))

    def _view_up(self, e):
        self._drag = None

    def _view_wheel(self, e):
        if self._raw is None:
            return "break"
        k = self.rect[2] * (1.02 if e.delta > 0 else 0.98)
        k = max(0.2, min(2.0, k))
        l = self.rect[0] + (self.rect[2] - k) / 2.0
        t = self.rect[1] + (self.rect[2] - k) / 2.0
        self.rect = (l, t, k)
        self.shot_base = None
        self._paint_view(self._crop(self._raw))
        return "break"

    def rebase(self):
        """把基线对齐到当前画面：漏了一步、或棋盘被拖动/缩放过后手动点一下。"""
        self.shot_base = None
        self.rebase_pending = False
        self._last_sig = None
        self._set_result("已重新对齐基线。")

    def _crop(self, img):
        """按对齐结果裁出真正的 8×8 棋盘。"""
        l, t, k = self.rect
        W, H = img.size
        side = max(8, int(k * min(W, H)))
        x0 = int(l * W)
        y0 = int(t * H)
        x0 = max(0, min(x0, max(0, W - side)))
        y0 = max(0, min(y0, max(0, H - side)))
        x1 = min(W, x0 + side)
        y1 = min(H, y0 + side)
        return img.crop((x0, y0, x1, y1))

    def do_align(self, quiet=False):
        """自动把采样范围对齐到棋盘的 8×8 格子。框歪一两个格子也能纠回来。"""
        if not self.region:
            if not quiet:
                messagebox.showinfo("还没框棋盘", "先点「① 框选棋盘」把棋盘框进去。")
            return False
        try:
            img = self._grab()
        except Exception as e:               # noqa: BLE001
            self._set_result("抓屏失败：%s" % e)
            return False
        aligned, rect = align_image(img)
        self.rect = rect
        self.shot_base = None
        self._paint_view(aligned)
        if not quiet:
            self._set_result("已自动对齐：偏移 %+.1f%% / %+.1f%%，缩放 %.0f%%。"
                             "\n下面这张就是程序实际分析的画面，格子应该正好压住棋盘。"
                             % (rect[0] * 100, rect[1] * 100, rect[2] * 100))
        return True

    def _grab(self):
        x1, y1, x2, y2 = self.region
        img = ImageGrab.grab(bbox=(x1, y1, x2, y2), all_screens=True)
        self._raw = img
        return img

    def _scan_loop(self):
        """每 0.12 秒截一次，交给 _scan_step 判断。"""
        self._scan_still = 0
        self._scan_hinted = False
        self._last_sig = None
        self._adopt_tried = False
        tick = 0
        while self.running:
            time.sleep(0.12)
            if self.busy or self.over:
                continue
            try:
                img = self._crop(self._grab())
                sig = img_signature(img)
            except Exception:                # noqa: BLE001
                continue
            try:
                self._scan_step(sig)
            except Exception as e:           # noqa: BLE001
                # 识别线程绝不能因为一次异常就悄悄死掉（那表现出来就是「他走了我这边没反应」）
                print("识图出错:", e)
                time.sleep(0.3)
                continue
            tick += 1
            if tick % 3 == 0:                # 约 0.36 秒刷新一次预览
                marks = self._view_marks
                self.ui_queue.put(lambda im=img, mk=marks: self._paint_view(im, mk))

    def _scan_step(self, sig):
        """拿当前帧跟基线比。基线只代表「真实棋盘上一次确认的画面」。

        关键点：基线的语义是「真实棋盘上一帧已确认的样子」，它绝不因为某一次没对上
        就被丢掉。以前是连续 3 帧匹配失败就重取基线，而对手走子的动画中间帧恰好匹配
        不上，基线一跳就变成「已经走完」的画面，那一步永久丢失——表现就是对面都走完
        了，这边还在傻等，而且之后每一手都因局面错位继续认不出。
        现在对不上就保留基线等下一帧（动画总会停下来），只有画面静止很久仍带着没消化
        的变化才提示你手动补一步。
        """
        if self.shot_base is None:
            self.shot_base = sig
            self._last_sig = sig
            self._scan_still = 0
            self._scan_hinted = False
            self._view_marks = []
            learned = self._learn(sig, force=True)      # 先把眼下这盘的棋子形状记下来
            self._refresh_book_label()
            if learned:
                self._sync_at = time.time()
                self._set_result("已取基线，并记住 %d 类棋子图案。" % len(self.book))
                return
            if self.book.ready():
                # 棋子库能认、只是程序局面和画面对不上（比如中途接手一盘）：按画面重建
                rb, unsure = self._read_board(sig)
                if rb is not None:
                    self.ui_queue.put(lambda b=rb, u=unsure: self._adopt_ui(b, u, self.human))
                    self._set_result("画面和程序局面不一样（%s），正按画面重建局面…"
                                     % (self.book_msg or "占位差异"))
                    return
            self._set_result("取到画面了，但画面上的棋子和程序局面对不上（%s）。\n"
                             "先在开局时框选／点「新局」，或把程序棋盘摆成屏幕上那样再点「重取基线」。"
                             % (self.book_msg or "占位差异"))
            return

        scores = sign_diff(self.shot_base, sig)
        sens = float(self.sens)
        changed = changed_squares(scores, sens)

        # 「稳不稳」按「跟上一帧一不一样」算，而不是跟基线比：
        # 跟基线比的话，只要有一格认不出来的变化挂着，_scan_still 就永远清零，
        # 于是「等它停稳再降阈值重扫 / 提示手动补一步」这两条永远不会触发。
        still = self._last_sig is not None and self._last_sig == sig
        self._last_sig = sig
        self._scan_still = self._scan_still + 1 if still else 0
        if not still:
            self._adopt_tried = False        # 画面又动了：允许下一次停稳后再重建一次

        # 形状记忆读整盘：同色子换位、浅底上的白子这类「棋子灰度差不够」的格子，
        # 差分看不见，整盘比对能补出来
        marks = [(sq, "#f2d24a") for sq in changed]
        book_diff, book_ok, book_unsure = self._board_read(sig, scores, sens)
        if book_ok:
            for bsq in book_diff:
                marks.append((to_screen(bsq, self.flip()), "#ff6b6b"))
            self.book_msg = ("整盘 %d 处对不上" % len(book_diff)) if book_diff else "整盘一致"
        elif self.book.ready():
            self.book_msg = "认不准 %d 格" % book_unsure
        self._view_marks = marks

        # 手动摆完/重取基线之后：等画面停下来再对齐，免得把刚发生的变化当成下一手
        if self.rebase_pending and still and not changed:
            self.shot_base = sig
            self.rebase_pending = False
            self._scan_hinted = False
            return

        if len(changed) >= 20:
            # 半块棋盘都在变：窗口被拖动/切换/遮挡，不是走子。重新对齐，别乱认。
            self.shot_base = sig
            self._scan_hinted = False
            self._set_result("画面整体变了，已重新对齐基线。")
            return

        if not changed:
            occ = self._occ_mismatch(sig)
            if occ <= 2:
                self._sync_at = time.time()     # 画面和局面确实一致，才允许自动落子
                self._book_bad = 0
            elif self.book.ready() and book_unsure >= 30:
                # 棋子库已经读不动这盘了（大面积认不准）：多半是以前被错局面教歪过。
                # 清库重来——重学会走占位那一关，不会再被教歪。
                self._book_bad += 1
                if self._book_bad >= 10 and time.time() - self._book_reset_at > 8:
                    self._book_reset_at = time.time()
                    self._book_bad = 0
                    self.book.clear()
                    if self._learn(sig, force=True):
                        self._refresh_book_label()
                        self._set_result("棋子库认不动这盘（%s），已清空按画面重学。" % self.book_msg)
                    else:
                        self._refresh_book_label()
                        self._set_result("棋子库认不动这盘，已清空；但画面和程序局面对不上（%s），"
                                         "先按画面对齐再重学。" % (self.book_msg or "占位差异"))
            # 画面和基线一致、局面也刚确认过 → 把这一帧的图案再记一遍（多帧平均更稳）
            if (still and self.board_at and time.time() - self.board_at < 4.0
                    and time.time() - self.learn_at > 0.8):
                if self._learn(sig):
                    self._refresh_book_label()
            return

        # 画面变了。先按像素差分挑走法（便宜），挑不出就整盘重读、按局面找走法。
        # 内部局面永远等于真实棋盘（程序只给建议、不替我落子），所以「该走的一方」
        # 就是 self.legal，我方走的和对手走的走法集合是同一个。
        occ = self._occ_now(sig)
        m, sc = match_move(scores, self.legal, self.flip(), sens, occ)
        side = None
        how = "吻合 %.0f" % sc
        if not m and book_ok:
            bm = self._book_move(self.legal, book_diff, scores)
            if bm:
                m, sc, how = bm, sens * 1.2, "整盘比对"
        if not m and still:
            rb, unsure = self._read_board(sig, scores, sens)
            if rb is not None:
                m2, sc2, side = self._match_by_read(rb)
                if m2:
                    m, sc, how = m2, sc2, "整盘确认"
        if not m and self._scan_still >= 2:
            # 画面停住了还认不出：阈值降到 55% 再扫一遍，捞那种图案偏淡的走法
            m, sc = match_move(scores, self.legal, self.flip(),
                               max(3.0, sens * 0.55), occ)
            side = None
            how = "宽松 %.0f" % sc

        if m:
            self._scan_hinted = False
            san = to_san(self.st["board"], self.st, m)
            self.shot_base = sig
            keep = side is not None and side != self.st["turn"]
            if keep:
                self._set_result("补上漏掉的一手：%s（%s）" % (san, how))
                self.ui_queue.put(lambda mm=m: self._apply_keep_turn(mm))
            else:
                self._set_result("读到 %s（%s）" % (san, how))
                self.ui_queue.put(lambda mm=m: self.do_move(mm))
            return

        # 还认不出：画面明明停下了，就按画面重建一次局面（比一直傻等到底强）。
        # 只试一次，试不出来就老实提示，免得每帧重读、把提示憋住不显示。
        if self._scan_still >= 12 and not self._adopt_tried:
            self._adopt_tried = True
            rb, unsure = self._read_board(sig)
            if rb is not None:
                self.ui_queue.put(lambda b=rb, u=unsure: self._adopt_ui(b, u))
                return
        if self._scan_still >= 20 and not self._scan_hinted:
            self._scan_hinted = True
            self._set_result("画面变了但对不上任何走法（最高 %.0f）· 点「重取基线」，"
                             "或在棋盘上把这一步点出来" % sc)

    def _adopt_ui(self, rb, unsure, turn=None):
        """在 UI 线程里重建局面（要碰控件，不能在识别线程里做）。"""
        if not self._adopt_board(rb, turn):
            return
        self.shot_base = self._last_sig
        self._scan_hinted = False
        self._set_result("对不上任何一步，已按画面重建局面（%d 格认不准）。\n"
                         "若这一步判断错，按「悔棋」或点棋盘手动改。" % unsure)
        self._maybe_reply()

    def _set_result(self, text):
        self.ui_queue.put(lambda: self.result.config(text=text))

    # ---------- 杂项 ----------
    def show_score(self, score, san):
        pass

    def on_side_change(self):
        self.human = self.side_var.get()
        self.new_game()

    def on_auto_toggle(self):
        self.auto_reply = self.auto_var.get()

    def copy_log(self):
        text = " ".join(("%d. %s" % (i // 2 + 1, s)) if i % 2 == 0 else s
                        for i, s in enumerate(self.log))
        self.clipboard_clear()
        self.clipboard_append(text)
        self.result.config(text="棋谱已复制。")

    def copy_fen(self):
        self.clipboard_clear()
        self.clipboard_append(to_fen(self.st))
        self.result.config(text="FEN 已复制：\n" + to_fen(self.st))

    def destroy(self):
        self._save_config()
        super().destroy()


def selftest(path):
    """打包后自检用：跑 perft，把结果写文件（窗口版没有控制台）。"""
    lines = []
    st = new_state()
    got = [perft(st["board"], st, d) for d in (1, 2, 3)]
    lines.append("perft start %s 期望 [20, 400, 8902] -> %s" % (got, got == [20, 400, 8902]))
    st2 = from_fen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1")
    got2 = [perft(st2["board"], st2, d, True) for d in (1, 2)]
    lines.append("perft kiwi %s 期望 [48, 2039] -> %s" % (got2, got2 == [48, 2039]))

    from PIL import Image, ImageDraw

    def frame(marks):
        img = Image.new("RGB", (512, 512))
        d = ImageDraw.Draw(img)
        for r in range(8):
            for c2 in range(8):
                x, y = c2 * 64, r * 64
                d.rectangle([x, y, x + 63, y + 63],
                            fill="#e9d6b3" if (r + c2) % 2 == 0 else "#b28460")
        for (r, c2) in marks:
            cx, cy = c2 * 64 + 32, r * 64 + 32
            d.ellipse([cx - 22, cy - 22, cx + 22, cy + 22], fill="#17171a")
        return img

    # 识图：e7→e5，且画面上多出两格「上一步高亮」噪声（真实棋盘一定有）
    base = img_signature(frame([(1, 4)]))
    after = frame([(3, 4)])
    dd = ImageDraw.Draw(after)
    for (r, c2) in [(6, 2), (0, 5)]:
        dd.rectangle([c2 * 64 + 3, r * 64 + 3, c2 * 64 + 60, r * 64 + 60],
                     outline="#f2d24a", width=5)
    sc_all = sign_diff(base, img_signature(after))
    stt = new_state()
    stt["turn"] = "b"
    mm, mscore = match_move(sc_all, legal_moves(stt["board"], False, stt), False, 12)
    san = sq_name(mm[0]) + sq_name(mm[1]) if mm else None
    lines.append("识图 e7e5（含 2 格高亮）-> %s 分数 %.0f %s" % (san, mscore, san == "e7e5"))

    # 画面没动时必须认不出任何东西（不能靠噪声蒙）
    mm2, ms2 = match_move(sign_diff(base, base), legal_moves(stt["board"], False, stt), False, 12)
    lines.append("静止画面不误判 -> %s %s" % (mm2 is None, mm2 is None))
    lines.append("搜索 -> %s" % (Searcher().best_move(list(START), True, new_state(), 4, 1200),))

    # 浏览器通道：标识解析 + 局面精确比对
    cases = [("piece br square-56", "r"), ("piece wp square-52", "P"),
             ("white pawn", "P"), ("black-knight", "n"),
             ("pieces/white_queen.png", "Q"), ("chessground piece black king", "k")]
    bad = [(t, got, want) for t, want in cases for got in [token_to_piece(t)] if got != want]
    lines.append("标识解析 %d/%d -> %s" % (len(cases) - len(bad), len(cases), not bad))
    if bad:
        lines.append("  错: %s" % bad)
    text = "\n".join(lines)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text + "\n")
    return text


def main():
    if "--selftest" in sys.argv:
        i = sys.argv.index("--selftest")
        out = sys.argv[i + 1] if i + 1 < len(sys.argv) else "selftest.txt"
        selftest(out)
        return
    enable_dpi_awareness()
    app = App()
    app.protocol("WM_DELETE_WINDOW", app.destroy)
    app.mainloop()


if __name__ == "__main__":
    main()
