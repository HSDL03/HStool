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
import threading
import time
import tkinter as tk
from tkinter import messagebox, ttk

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
        for m in moves:
            u = make_move(b, st, m)
            k = find_king(b, white)
            if k >= 0 and attacked(b, k, not white):
                unmake_move(b, st, m, u)
                continue
            legal_count += 1
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


def img_signature(img):
    """框内棋盘 → 8×8 格 × 4×4 块灰度（1024 字节）。

    比以前整格取 3×3 均值细一档：棋子常常只占格心一块，整格均值会被四周空格稀释，
    差异掉到灵敏度线以下就漏检。按块存，只要有任何一块明显变了就能抓到。
    """
    g = img.convert("L").resize((N * 8, N * 8), Image.BILINEAR)
    px = g.load()
    sig = bytearray(64 * BLK * BLK)
    span = BLK_PX - 2 * INSET
    for sr in range(8):
        for sc in range(8):
            o = (sr * 8 + sc) * (BLK * BLK)
            for by in range(BLK):
                for bx in range(BLK):
                    y0 = sr * N + by * BLK_PX + INSET
                    x0 = sc * N + bx * BLK_PX + INSET
                    tot = 0
                    for y in range(y0, y0 + span):
                        for x in range(x0, x0 + span):
                            tot += px[x, y]
                    sig[o + by * BLK + bx] = tot // (span * span)
    return sig


def sign_diff(a, b):
    """每格差异（0..255）：块差里最大的 6 块取均值。

    取「最大的几块」而不是全块平均：棋子挪走后格心会整片变白/变黑，这一块的差异
    接近 200，四周格角几乎不变——平均下来不到 30，正好卡在阈值附近；取峰值就稳了。
    """
    out = [0.0] * 64
    for sq in range(64):
        o = sq * (BLK * BLK)
        ds = sorted((abs(a[o + k] - b[o + k]) for k in range(BLK * BLK)), reverse=True)
        out[sq] = sum(ds[:6]) / 6.0
    return out


def changed_squares(scores, sens):
    return [sq for sq in range(64) if scores[sq] >= sens]


def diff_squares(a, b, sens):
    """兼容旧调用：直接给变化格列表。"""
    return changed_squares(sign_diff(a, b), sens)


def affected_squares(m, flip):
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

    def screen(sq):
        r, c = sq >> 3, sq & 7
        return (7 - r) * 8 + (7 - c) if flip else r * 8 + c
    return [screen(x) for x in dict.fromkeys(sqs)]


def match_move(scores, moves, flip, sens=9):
    """按分数挑最像的合法走法，返回 (走法, 分数) 或 (None, 分数)。

    以前要求「变化的格子集合恰好等于走法影响的格子」，但真实棋盘上永远多出几格：
    上一步的黄色高亮、鼠标悬停、走子动画的残影、吃子后的淡出。严格相等基本撞不上，
    一撞不上就被当噪声丢掉，那一步就永久漏了。

    这里改成打分：from / to 两格都必须明显变化（取两者的较小值，防止一边没动也通过），
    易位、吃过路兵的第三四格只当加分项，多出来的格子一律不管。
    最后要求最高分明显高于次高分，噪声里蒙不中。
    """
    if not moves:
        return None, 0.0
    thresh = max(6.0, float(sens) * 1.1)
    best, best_s, second = None, 0.0, 0.0
    for m in moves:
        vals = [scores[k] for k in affected_squares(m, flip)]
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
TPL_MAX = 12          # 同一身份最多累积几帧样本
TPL_TRUST = 26.0      # 每块平均偏差超过这个数就认为「认不准」，不参与判断


def to_screen(sq, flip):
    """棋盘格 → 屏幕上看到的位置（翻转时 180° 旋转）。"""
    r, c = sq >> 3, sq & 7
    return (7 - r) * 8 + (7 - c) if flip else r * 8 + c


# 格内 4×4 块的权重：中间 2×2 是棋子本体，四周容易吃进高亮边框和格线，压到 0.3
BLK_W = [1.0 if (r in (1, 2) and c in (1, 2)) else 0.3
         for r in range(4) for c in range(4)]
BLK_W_SUM = sum(BLK_W)


def cell_stats(sig, sq):
    """一格的 (16 块灰度, 加权平均灰度, 加权形状强度)。"""
    o = sq * 16
    v = sig[o:o + 16]
    m = 0.0
    for i in range(16):
        m += v[i] * BLK_W[i]
    m /= BLK_W_SUM
    var = 0.0
    for i in range(16):
        var += BLK_W[i] * (v[i] - m) ** 2
    var /= BLK_W_SUM
    return v, m, var ** 0.5


CENTER = (5, 6, 9, 10)      # 4×4 块里正中间那 2×2，棋子本体落在这里


def center_flat(v):
    """格心那块有多平：高亮边框只影响四周，格心平整就还是空格。"""
    vals = [v[i] for i in CENTER]
    m = sum(vals) / 4.0
    return (sum((x - m) ** 2 for x in vals) / 4.0) ** 0.5


def shape_of(v, m, sd):
    """去掉整体明暗后的形状：只留「哪块亮哪块暗」。"""
    if sd < 2.0:
        return [0.0] * 16
    return [(x - m) / sd for x in v]


class PieceBook:
    """记住每格图案长什么样，之后就能直接认出「这格现在是什么」。

    特征分两段，因为棋盘皮肤千差万别：
    · 形状：格内 16 个块减去本格均值再除以标准差 → 与底色、整体明暗无关，
      换皮肤也还是同一块图案。
    · 明暗：格子的平均灰度单独留一维，用来分白子 / 黑子。
    空格另存一套原型（平均灰度 + 形状强度），因为纯色格归一化后全是噪声。

    身份来自程序自己的棋盘，只用「画面和棋盘确定一致」的帧学。
    """

    def __init__(self):
        self.pieces = {}        # (char, parity) -> [形状和(16), 亮度和, 样本数]
        self.empties = {}       # parity -> [亮度和, 形状强度和, 样本数]

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
            ch = board[sq]
            par = self.parity(sq)
            v, m, sd = cell_stats(sig, to_screen(sq, flip))
            if ch == ".":
                e = self.empties.get(par)
                if e is None:
                    self.empties[par] = [float(m), float(sd), 1]
                elif e[2] < TPL_MAX:
                    e[0] += m
                    e[1] += sd
                    e[2] += 1
                continue
            z = shape_of(v, m, sd)
            e = self.pieces.get((ch, par))
            if e is None:
                self.pieces[(ch, par)] = [[x for x in z], float(m), 1]
            elif e[2] < TPL_MAX:
                for i in range(16):
                    e[0][i] += z[i]
                e[1] += m
                e[2] += 1

    def classify(self, sig, sq):
        """返回 (身份, 偏差)。偏差是「平均每块差多少灰度」，越小越可信。"""
        par = self.parity(sq)
        v, m, sd = cell_stats(sig, sq)

        # 先看是不是空格：纯色格形状强度低，灰度也贴近学到的底色
        e = self.empties.get(par)
        if e:
            m0, sd0 = e[0] / e[2], e[1] / e[2]
            dm = abs(m - m0)
            # 亮度接近 + 图案强度和空格原型接近 → 空格。
            # 只用亮度不够：浅底上的白子在整格均值上跟空格几乎一样。
            if dm < 18 and sd < max(6.0, sd0 + 8.0):
                return ".", dm

        z = shape_of(v, m, sd)
        best, bestd = None, 1e18
        for (ch, p), (zs, ms, n) in self.pieces.items():
            if p != par:
                continue
            d = 0.0
            for i in range(16):
                t = zs[i] / n - z[i]
                d += BLK_W[i] * t * t
            d /= BLK_W_SUM
            # 明暗差折算成同一量纲：灰度差 40 记作 1
            lt = (ms / n - m) / 40.0
            d += lt * lt
            if d < bestd:
                bestd, best = d, ch
        if best is None:
            return None, 1e18
        # 形状距离开方后 × 30，凑成「大致等于多少灰度差」，好跟阈值比
        return best, (bestd ** 0.5) * 30.0


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


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("国象应招器")
        self.geometry("1120x760")
        self.minsize(1000, 700)
        self.configure(bg="#fbf7ec")

        self.st = new_state()
        self.human = "w"            # 我方（程序替我算的一方）
        self.orient = "w"
        self.legal = []
        self.selected = -1
        self.last_move = None
        self.log = []
        self.stack = []
        self.keys = []
        self.auto_reply = True
        self.auto_play = False
        self.depth = 4
        self.busy = False
        self.over = ""
        self.expect = None            # 我方刚走那手在真实棋盘上的变化格
        self.expect_at = 0.0
        self.our_move_at = 0.0
        self.book = PieceBook()        # 棋子形状记忆库
        self.book_msg = ""
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
        self.sens = 9
        self.search_engine = Searcher()
        self.ui_queue = queue.Queue()      # 工作线程只往这里塞回调，UI 一律在主线程改

        self._build_ui()
        self._load_config()
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
        self.after(60, self._pump_ui)

    # ---------- 界面 ----------
    def _build_ui(self):
        left = tk.Frame(self, bg="#fbf7ec")
        left.pack(side="left", fill="both", expand=False, padx=12, pady=12)
        self.canvas = tk.Canvas(left, width=512, height=512, bg="#e9d6b3",
                                highlightthickness=2, highlightbackground="#7a6a52")
        self.canvas.pack()
        self.canvas.bind("<Button-1>", self.on_board_click)

        self.status = tk.StringVar(value="白先")
        tk.Label(left, textvariable=self.status, bg="#fbf7ec", fg="#3b3b33",
                 font=("Microsoft YaHei UI", 10, "bold")).pack(pady=(8, 0))

        right = tk.Frame(self, bg="#fbf7ec")
        right.pack(side="left", fill="both", expand=True, padx=(0, 12), pady=12)

        def group(title):
            f = tk.LabelFrame(right, text=title, bg="#fbf7ec", fg="#454434",
                              font=("Microsoft YaHei UI", 9, "bold"), bd=1, relief="solid")
            f.pack(fill="x", pady=(0, 8))
            return f

        g1 = group("对局")
        row = tk.Frame(g1, bg="#fbf7ec")
        row.pack(fill="x", padx=8, pady=6)
        tk.Label(row, text="我执", bg="#fbf7ec").pack(side="left")
        self.side_var = tk.StringVar(value="w")
        for txt, val in (("白", "w"), ("黑", "b")):
            tk.Radiobutton(row, text=txt, value=val, variable=self.side_var,
                           command=self.on_side_change, bg="#fbf7ec",
                           activebackground="#fbf7ec").pack(side="left", padx=4)
        tk.Checkbutton(row, text="自动应招", variable=tk.BooleanVar(value=True),
                       command=lambda: None, bg="#fbf7ec").pack(side="left", padx=(16, 0))
        self.auto_var = tk.BooleanVar(value=True)
        row.winfo_children()[-1].configure(variable=self.auto_var, command=self.on_auto_toggle)

        row2 = tk.Frame(g1, bg="#fbf7ec")
        row2.pack(fill="x", padx=8, pady=(0, 6))
        tk.Label(row2, text="深度", bg="#fbf7ec").pack(side="left")
        self.depth_var = tk.IntVar(value=4)
        tk.Scale(row2, from_=2, to=7, orient="horizontal", variable=self.depth_var,
                 showvalue=True, length=150, bg="#fbf7ec", highlightthickness=0
                 ).pack(side="left", padx=6)
        tk.Button(row2, text="算我这一步", command=self.think).pack(side="left", padx=4)
        tk.Button(row2, text="悔棋", command=self.undo).pack(side="left")
        tk.Button(row2, text="新局", command=self.new_game).pack(side="left", padx=4)

        g2 = group("识图（框选棋盘）")
        row3 = tk.Frame(g2, bg="#fbf7ec")
        row3.pack(fill="x", padx=8, pady=6)
        tk.Button(row3, text="① 框选棋盘", command=self.pick_region).pack(side="left")
        self.btn_scan = tk.Button(row3, text="② 开始识别", command=self.toggle_scan)
        self.btn_scan.pack(side="left", padx=6)
        tk.Button(row3, text="清区域", command=self.clear_region).pack(side="left")

        row3b = tk.Frame(g2, bg="#fbf7ec")
        row3b.pack(fill="x", padx=8, pady=(0, 4))
        tk.Button(row3b, text="⌖ 自动对齐", command=self.do_align).pack(side="left")
        tk.Button(row3b, text="③ 学棋子", command=self.learn_now).pack(side="left", padx=6)
        tk.Button(row3b, text="重取基线", command=self.rebase).pack(side="left")

        # 识别区域：程序实际截到的那一块，带 8×8 网格和识别标记
        self.view = tk.Canvas(g2, width=248, height=248, bg="#12130f",
                              highlightthickness=1, highlightbackground="#4a4a3c")
        self.view.pack(padx=8, pady=(0, 4))
        self.view.create_text(124, 124, text="框完棋盘这里会显示程序看到的画面",
                              fill="#7d7660", font=("Microsoft YaHei UI", 9))
        self.view.bind("<ButtonPress-1>", self._view_down)
        self.view.bind("<B1-Motion>", self._view_move)
        self.view.bind("<ButtonRelease-1>", self._view_up)
        self.view.bind("<MouseWheel>", self._view_wheel)
        rowb = tk.Frame(g2, bg="#fbf7ec")
        rowb.pack(fill="x", padx=8, pady=(0, 6))
        self.book_label = tk.Label(rowb, text="棋子库：空（点「③ 学棋子」采集）",
                                   bg="#fbf7ec", fg="#8a8266", font=("Consolas", 9),
                                   anchor="w", justify="left", wraplength=250)
        self.book_label.pack(side="left", fill="x", expand=True)
        tk.Button(rowb, text="重置", command=self.reset_book).pack(side="right")

        row4 = tk.Frame(g2, bg="#fbf7ec")
        row4.pack(fill="x", padx=8, pady=(0, 6))
        tk.Checkbutton(row4, text="自动落子（模拟鼠标）", variable=tk.BooleanVar(value=False),
                       bg="#fbf7ec").pack(side="left")
        self.play_var = tk.BooleanVar(value=False)
        row4.winfo_children()[-1].configure(variable=self.play_var)
        tk.Label(row4, text="灵敏度", bg="#fbf7ec").pack(side="left", padx=(14, 4))
        self.sens_var = tk.IntVar(value=9)
        tk.Scale(row4, from_=3, to=50, orient="horizontal", variable=self.sens_var,
                 showvalue=True, length=120, bg="#fbf7ec", highlightthickness=0,
                 command=lambda v: setattr(self, "sens", int(float(v)))
                 ).pack(side="left")
        self.region_label = tk.Label(g2, text="未选择区域", bg="#fbf7ec", fg="#8a8266",
                                     font=("Consolas", 9), anchor="w")
        self.region_label.pack(fill="x", padx=8, pady=(0, 6))

        g3 = group("分析")
        self.result = tk.Label(g3, text="等你落子 / 录对手的棋", bg="#fbf7ec", fg="#3b3b33",
                               font=("Consolas", 11), justify="left", anchor="w", wraplength=420)
        self.result.pack(fill="x", padx=8, pady=6)

        g4 = group("着法记录")
        self.logbox = tk.Listbox(g4, height=8, font=("Consolas", 10), bg="#fffdf6",
                                 activestyle="none")
        self.logbox.pack(fill="both", expand=True, padx=8, pady=(6, 2))
        row5 = tk.Frame(g4, bg="#fbf7ec")
        row5.pack(fill="x", padx=8, pady=(0, 6))
        tk.Button(row5, text="复制棋谱", command=self.copy_log).pack(side="left")
        tk.Button(row5, text="复制 FEN", command=self.copy_fen).pack(side="left", padx=6)
        self.input_var = tk.StringVar()
        ent = tk.Entry(row5, textvariable=self.input_var, width=18, font=("Consolas", 10))
        ent.pack(side="left", padx=(6, 4))
        ent.bind("<Return>", lambda e: self.apply_input())
        tk.Button(row5, text="走这步", command=self.apply_input).pack(side="left")

        self.hint = tk.Label(self, text="把对手的棋在棋盘上点出来（或拖），轮到你就自动算；也可直接输 e2e4 / Nf3 / O-O。"
                                        "识图没反应就点「重取基线」，或把灵敏度往左调（越小越敏感）。",
                             bg="#fbf7ec", fg="#7d7660", font=("Microsoft YaHei UI", 9), anchor="w")
        self.hint.pack(side="bottom", fill="x", padx=14, pady=(0, 10))

    # ---------- 配置 ----------
    def _load_config(self):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            self.region = tuple(cfg["region"]) if cfg.get("region") else None
            self.sens_var.set(int(cfg.get("sens", 9)))
            self.sens = int(cfg.get("sens", 9))
            self.depth_var.set(int(cfg.get("depth", 4)))
            self.play_var.set(bool(cfg.get("auto_play", False)))
            if self.region:
                self.region_label.config(text="区域 %s" % (self.region,))
        except (OSError, ValueError, KeyError):
            pass

    def _save_config(self):
        try:
            os.makedirs(CONFIG_DIR, exist_ok=True)
            with open(CONFIG_PATH, "w", encoding="utf-8") as f:
                json.dump({"region": self.region, "sens": int(self.sens),
                           "depth": self.depth_var.get(), "auto_play": self.play_var.get()}, f)
        except OSError:
            pass

    # ---------- 渲染 ----------
    def flip(self):
        return self.orient == "b"

    def cell_center(self, sq):
        r, c = sq >> 3, sq & 7
        sr, sc = (7 - r, 7 - c) if self.flip() else (r, c)
        return (sc + 0.5) * 64, (sr + 0.5) * 64

    def draw(self):
        cv = self.canvas
        cv.delete("all")
        flip = self.flip()
        king_sq = find_king(self.st["board"], self.st["turn"] == "w")
        check = in_check(self.st["board"], self.st["turn"] == "w")

        for sr in range(8):
            for sc in range(8):
                r = 7 - sr if flip else sr
                c = 7 - sc if flip else sc
                i = r * 8 + c
                x0, y0 = sc * 64, sr * 64
                cv.create_rectangle(x0, y0, x0 + 64, y0 + 64,
                                    fill="#e9d6b3" if (r + c) % 2 == 0 else "#b28460",
                                    width=0)
                if self.last_move and i in (self.last_move[0], self.last_move[1]):
                    cv.create_rectangle(x0 + 3, y0 + 3, x0 + 61, y0 + 61,
                                        outline="#4f8a2a" if i == self.last_move[1] else "#6a6a55",
                                        width=3)
                if i == self.selected:
                    cv.create_rectangle(x0 + 2, y0 + 2, x0 + 62, y0 + 62, outline="#d9a520", width=4)
                if i == king_sq and check:
                    cv.create_rectangle(x0 + 2, y0 + 2, x0 + 62, y0 + 62, outline="#c0392b", width=4)

        # 合法落点
        if self.selected >= 0:
            for m in self.legal:
                if m[0] == self.selected:
                    cx, cy = self.cell_center(m[1])
                    if self.st["board"][m[1]] == "." and m[4] != "ep":
                        cv.create_oval(cx - 7, cy - 7, cx + 7, cy + 7, fill="#5b6b3a", outline="")
                    else:
                        cv.create_oval(cx - 25, cy - 25, cx + 25, cy + 25, outline="#a33030", width=4)

        for i, p in enumerate(self.st["board"]):
            if p == ".":
                continue
            cx, cy = self.cell_center(i)
            g = GLYPH[p.lower()]
            if p.isupper():
                for dx, dy in ((-2, 0), (2, 0), (0, -2), (0, 2), (1, 1), (-1, 1)):
                    cv.create_text(cx + dx, cy + dy, text=g, font=("Segoe UI Symbol", 30),
                                   fill="#4a4238")
                cv.create_text(cx, cy, text=g, font=("Segoe UI Symbol", 30), fill="#ffffff")
            else:
                cv.create_text(cx + 1, cy + 1, text=g, font=("Segoe UI Symbol", 30), fill="#cfc7b8")
                cv.create_text(cx, cy, text=g, font=("Segoe UI Symbol", 30), fill="#17171a")

        for k in range(8):
            f = FILES[k] if not flip else FILES[7 - k]
            cv.create_text(k * 64 + 58, 8 * 64 - 9, text=f, font=("Consolas", 9), fill="#6b5b43")
            rn = str(8 - k) if not flip else str(k + 1)
            cv.create_text(9, k * 64 + 9, text=rn, font=("Consolas", 9), fill="#6b5b43")

        self.update_status()

    def update_status(self):
        if self.over:
            self.status.set(self.over)
            return
        side = "白" if self.st["turn"] == "w" else "黑"
        mine = self.st["turn"] == self.human
        self.status.set("%s方走 · %s" % (side, "该你（程序在算）" if mine else "对手（把他的棋摆上来）"))

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
        self.push_key()
        self.refresh_legal()
        self.refresh_log()
        self.draw()
        self.check_end()
        if score is not None:
            self.show_score(score, san)
        # 手动把对手那步补进来时，真实棋盘早就停在那儿了：让识别重取一次基线，
        # 否则落后的基线会一直跟画面对不上，后面每一手都认不出。
        self.rebase_pending = True
        self.our_move_at = time.time()
        self.board_at = time.time()
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

    def apply_opponent(self, m):
        """把漏识别的一步对手走法补进局面。

        内部局面停在「对手还没走」，turn 也已经是轮我方——所以这里不能走 do_move
        （那会再切一次手），只把棋子走上去、记进棋谱，turn 保持不变。
        """
        self.stack.append(self.snapshot())
        san = to_san(self.st["board"], self.st, m)
        black_moved = m[2].islower()
        make_move(self.st["board"], self.st, m)
        if black_moved:
            self.st["full"] += 1
        self.log.append(san)
        self.last_move = (m[0], m[1])
        self.selected = -1
        self.over = ""
        self.push_key()
        self.refresh_legal()
        self.refresh_log()
        self.draw()
        self.board_at = time.time()
        self.status.set("轮到你 · 对手：%s" % san)

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
        if self.log:
            self.logbox.see("end")

    # ---------- 点击棋盘 ----------
    def on_board_click(self, ev):
        if self.busy or self.over:
            return
        sc, sr = int(ev.x // 64), int(ev.y // 64)
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
        board = list(self.st["board"])
        st = {"castling": dict(self.st["castling"]), "ep": self.st["ep"], "half": self.st["half"]}
        white = self.st["turn"] == "w"

        def run():
            res = self.search_engine.best_move(board, white, st, depth, 2400)
            self.ui_queue.put(lambda: self._after_think(res))

        threading.Thread(target=run, daemon=True).start()

    def _after_think(self, res):
        self.busy = False
        if not res or not res["move"]:
            self.result.config(text="没算出可走的棋。")
            return
        m = res["move"]
        san = to_san(self.st["board"], self.st, m)
        self.do_move(m, res["score"])
        sc = res["score"] / 100.0
        txt = "程序替你走：%s\n评分 %+.2f · 深度 %d · %s 节点 · %d ms" % (
            san, sc, res["depth"], format(res["nodes"], ","), res["ms"])
        if abs(res["score"]) > MATE - 1000:
            txt = "程序替你走：%s（%s）" % (san, "将杀" if res["score"] > 0 else "被将杀")
        self.result.config(text=txt)

        if self.running and self.play_var.get() and not m[3]:
            self.expect = set(affected_squares(m, self.flip()))
            self.expect_at = time.time()

        if self.play_var.get() and self.region:
            self._auto_play(m)

    def _auto_play(self, m):
        if m[3]:
            self.result.config(text=self.result.cget("text") + "\n（升变这步需要你手动选一下棋子）")
            return
        x1, y1, x2, y2 = self.region
        flip = self.flip()

        def point(sq):
            r, c = sq >> 3, sq & 7
            sr, sc = (7 - r, 7 - c) if flip else (r, c)
            return (x1 + (sc + 0.5) * (x2 - x1) / 8, y1 + (sr + 0.5) * (y2 - y1) / 8)

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
        self.view.create_text(124, 124, text="框完棋盘这里会显示程序看到的画面",
                              fill="#7d7660", font=("Microsoft YaHei UI", 9))
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

    def _board_read(self, sig, skip=None, scores=None, sens=None):
        """用棋子库把整盘读一遍：返回 (与内部局面不同的格, 是否可信, 认不准的格数)。

        光「认出来的身份和棋盘不一样」还不够——上一步的黄色高亮会让空格长得像棋子，
        所以再加一条：这一格的灰度必须也确实变过（差分会给分）。两条都满足才算差异，
        这样高亮、图标边缘、轻微抖动都不会混进来。
        """
        if not self.book.ready():
            return [], False, 64
        diff, unsure = [], 0
        flip = self.flip()
        for sq in range(64):
            if skip and sq in skip:
                continue
            ch, d = self.book.classify(sig, sq)
            if ch is None or d > TPL_TRUST:
                unsure += 1
                continue
            if ch != self.st["board"][sq]:
                if scores is not None and sens:
                    if scores[to_screen(sq, flip)] < sens * 0.6:
                        continue          # 灰度几乎没动：多半是高亮，不当走子证据
                diff.append(sq)
        return diff, unsure <= 3, unsure

    def _learn(self, sig, force=False):
        """在「画面和内部棋盘确定一致」的帧上记住每格图案。

        学过之后再学要先自检：用现有库读这帧，如果认不准或者读出来跟棋盘本来就不一样，
        说明这帧的标注不可靠（比如我方那手还没落到真实棋盘），宁可不学。
        """
        skip = self._pending_squares()
        if not force and self.book.ready():
            diff, ok, _ = self._board_read(sig, skip)
            if not ok or diff:
                return False
        self.book.add(sig, self.st["board"], self.flip(), skip)
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

    def _pending_squares(self):
        """我方那手还没落到真实棋盘时，那两格在画面上还是旧样子，学它会把标注弄错。"""
        if not self.expect:
            return None
        flip = self.flip()
        out = set()
        for s in self.expect:
            r, c = s >> 3, s & 7
            out.add(((7 - r) * 8 + (7 - c)) if flip else (r * 8 + c))
        return out

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
        self._learn(first, force=True)
        self._refresh_book_label()
        self._set_result("已按当前局面学了：%s。\n若画面和程序里的局面不一样，"
                         "点「重置棋子库」再把局面摆对后重学。" % self.book_summary())

    def reset_book(self):
        self.book.clear()
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
        if img is not None:
            self._view_im = img.convert("RGB").resize((248, 248))
            self._view_photo = ImageTk.PhotoImage(self._view_im)
        if self._view_photo is None:
            return
        cv.delete("all")
        cv.create_image(0, 0, anchor="nw", image=self._view_photo)
        step = 248 / 8.0
        for i in range(9):
            x = int(i * step)
            cv.create_line(x, 0, x, 248, fill="#5fd68d", dash=(2, 4))
            cv.create_line(0, x, 248, x, fill="#5fd68d", dash=(2, 4))
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
        side = 248.0
        l += (e.x - x0) / side * k
        t += (e.y - y0) / side * k
        self.rect = (l, t, k)
        self.shot_base = None
        self._paint_view(self._crop(self._raw))

    def _view_up(self, e):
        self._drag = None

    def _view_wheel(self, e):
        if self._raw is None:
            return
        k = self.rect[2] * (1.02 if e.delta > 0 else 0.98)
        k = max(0.2, min(2.0, k))
        l = self.rect[0] + (self.rect[2] - k) / 2.0
        t = self.rect[1] + (self.rect[2] - k) / 2.0
        self.rect = (l, t, k)
        self.shot_base = None
        self._paint_view(self._crop(self._raw))

    def rebase(self):
        """把基线对齐到当前画面：漏了一步、或棋盘被拖动/缩放过后手动点一下。"""
        self.shot_base = None
        self.expect = None
        self.expect_at = 0.0
        self.rebase_pending = False
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
            self._scan_still = 0
            self._scan_hinted = False
            self._view_marks = []
            self._learn(sig, force=True)         # 先把眼下这盘的棋子形状记下来
            self._refresh_book_label()
            self._set_result("已取基线，并记住 %d 类棋子图案。" % len(self.book))
            return

        scores = sign_diff(self.shot_base, sig)
        sens = float(self.sens)
        changed = changed_squares(scores, sens)

        # 形状记忆读整盘：同色子换位、浅底上的白子这类「棋子换了但灰度差不够」的格子，
        # 差分看不见，整盘比对能补出来
        marks = [(sq, "#f2d24a") for sq in changed]
        book_diff, book_ok, book_unsure = self._board_read(sig, self._pending_squares(),
                                                           scores, sens)
        if book_ok:
            for bsq in book_diff:
                marks.append((to_screen(bsq, self.flip()), "#ff6b6b"))
            self.book_msg = ("整盘 %d 处对不上" % len(book_diff)) if book_diff else "整盘一致"
        elif self.book.ready():
            self.book_msg = "认不准 %d 格" % book_unsure
        self._view_marks = marks

        # 「稳定」按有没有格子在变来算，而不是按两张图逐字节相等：
        # 鼠标闪、时钟跳这种一两格的抖动会让逐字节比较永远不相等。
        settled = not changed
        self._scan_still = self._scan_still + 1 if settled else 0

        # 画面稳定 + 局面刚确认过 → 把这一帧每格的图案再记一遍（多帧平均更稳）
        if (settled and self.board_at and time.time() - self.board_at < 4.0
                and time.time() - self.learn_at > 0.8):
            if self._learn(sig):
                self._refresh_book_label()

        # 手动补录之后：等画面停下来再对齐，免得把刚发生的变化当成对手的下一手
        if self.rebase_pending and settled and not self.expect:
            self.shot_base = sig
            self.rebase_pending = False
            self._scan_hinted = False
            return

        if len(changed) >= 20:
            # 半块棋盘都在变：窗口被拖动/切换/遮挡，不是走子。重新对齐，别乱认。
            self.shot_base = sig
            self.expect = None
            self._set_result("画面整体变了，已重新对齐基线。")
            return

        if self.expect:
            # 我方那手是不是已经落到真实棋盘上了
            if all(scores[c] >= sens * 0.7 for c in self.expect):
                self.shot_base = sig
                self.expect = None
                self._set_result("我方那手已在真实棋盘上，继续等对手。")
                return
            if self.expect_at and time.time() - self.expect_at > 4.0:
                # 落子后 4 秒真实棋盘还没动：模拟点击多半没生效（窗口没焦点 / 坐标偏）
                self.expect = None
                self._set_result("自动落子好像没落到棋盘上，请手动走我方那手。")

        # ── 轮到我方 ──────────────────────────────────────────────
        # 画面却变了，只可能是两件事：我们刚给的那手被你在真实棋盘走掉了，
        # 或者对手那步漏了（程序算棋的时候它已经走完）。都要认出来，不能傻等。
        if self.st["turn"] == self.human:
            # 先看我方那些走法里有没有能把画面变化全解释掉的（那就是我们给的那手
            # 被你在真实棋盘走掉了），有就只对齐基线，不重复落子。
            my_m, _ = match_move(scores, self.legal, self.flip(), sens)
            if my_m and set(affected_squares(my_m, self.flip())) >= set(changed):
                self.shot_base = sig
                return

            opp_white = (self.human != "w")
            opp_legal = legal_moves(self.st["board"], opp_white, self.st)
            om, osc = match_move(scores, opp_legal, self.flip(), sens)
            if not om and book_ok:
                bm = self._book_move(opp_legal, book_diff, scores)
                if bm:
                    om, osc = bm, sens * 1.2
            if not om and self._scan_still >= 6:
                # 每 0.7 秒把整块棋盘重扫一遍，阈值降到 55%：
                # 单独捞那种图案偏淡、刚好卡在阈值下的走法
                om, osc = match_move(scores, opp_legal, self.flip(), max(3.0, sens * 0.55))
            if om:
                self.shot_base = sig
                self._scan_hinted = False
                san = to_san(self.st["board"], self.st, om)
                self._set_result("补上漏掉的对手走法：%s（吻合 %.0f）" % (san, osc))
                self.ui_queue.put(lambda mm=om: self.apply_opponent(mm))
            else:
                self.shot_base = sig
                if self._scan_still >= 20 and not self._scan_hinted:
                    self._scan_hinted = True
                    self._set_result("画面变了但对不上任何走法（最高 %.0f）· 手动补一步，"
                                     "或点「重取基线」" % osc)
            return

        # ── 轮到对手：正常识别 ────────────────────────────────────
        m, sc = match_move(scores, self.legal, self.flip(), sens)
        if not m and book_ok:
            bm = self._book_move(self.legal, book_diff, scores)
            if bm:
                m, sc = bm, sens * 1.2
        if not m and changed and self._scan_still >= 6:
            m, sc = match_move(scores, self.legal, self.flip(), max(3.0, sens * 0.55))
        if not m:
            if changed and self._scan_still >= 20 and not self._scan_hinted:
                # 画面静止 2.5 秒还留着对不上的变化：提示一次，让人手动补
                self._scan_hinted = True
                self._set_result("画面变了但没认出（最高 %.0f）· 手动补这一步，或点「重取基线」"
                                 % sc)
            return

        self._scan_hinted = False
        san = to_san(self.st["board"], self.st, m)
        self.shot_base = sig
        self.expect = None
        self._set_result("读到对手：%s（吻合 %.0f）" % (san, sc))
        self.ui_queue.put(lambda mm=m: self.do_move(mm))

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
