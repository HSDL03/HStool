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

from PIL import ImageGrab, ImageTk

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
N = 24                      # 每格采样分辨率
CELL_BLK = N // 3           # 3×3 小块


def img_signature(img):
    """把框内的棋盘压成 8×8 格、每格 3×3 灰度均值（576 字节）。"""
    g = img.convert("L").resize((N * 8, N * 8))
    px = g.load()
    sig = bytearray(64 * 9)
    for sr in range(8):
        for sc in range(8):
            base = (sr * 8 + sc) * 9
            for by in range(3):
                for bx in range(3):
                    s = 0
                    for y in range(CELL_BLK):
                        py = sr * N + by * CELL_BLK + y
                        for x in range(CELL_BLK):
                            px_x = sc * N + bx * CELL_BLK + x
                            s += px[px_x, py]
                    sig[base + by * 3 + bx] = s // (CELL_BLK * CELL_BLK)
    return sig


def diff_squares(a, b, sens):
    out = []
    for sq in range(64):
        d = sum(abs(a[sq * 9 + k] - b[sq * 9 + k]) for k in range(9)) / 9.0
        if d > sens:
            out.append(sq)
    return out


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


def match_move(changed_screen, moves, flip):
    if len(changed_screen) < 2 or not moves:
        return None
    changed = set(changed_screen)
    strict, loose, loose_score = None, None, -1
    for m in moves:
        keys = affected_squares(m, flip)
        hit = sum(1 for k in keys if k in changed)
        if hit == len(keys) and len(changed_screen) == len(keys):
            strict = m
            break
        if hit == len(keys) and len(changed_screen) - hit <= 2:
            score = hit * 10 - (len(changed_screen) - hit)
            if score > loose_score:
                loose, loose_score = m, score
    return strict or loose


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
        self.expect = None
        self.region = None
        self.shot_base = None
        self.running = False
        self.sens = 14
        self.search_engine = Searcher()
        self.ui_queue = queue.Queue()      # 工作线程只往这里塞回调，UI 一律在主线程改

        self._build_ui()
        self._load_config()
        self.new_game(silent=True)
        self.after(60, self._pump_ui)
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
        row4 = tk.Frame(g2, bg="#fbf7ec")
        row4.pack(fill="x", padx=8, pady=(0, 6))
        tk.Checkbutton(row4, text="自动落子（模拟鼠标）", variable=tk.BooleanVar(value=False),
                       bg="#fbf7ec").pack(side="left")
        self.play_var = tk.BooleanVar(value=False)
        row4.winfo_children()[-1].configure(variable=self.play_var)
        tk.Label(row4, text="灵敏度", bg="#fbf7ec").pack(side="left", padx=(14, 4))
        self.sens_var = tk.IntVar(value=14)
        tk.Scale(row4, from_=6, to=40, orient="horizontal", variable=self.sens_var,
                 showvalue=True, length=120, bg="#fbf7ec", highlightthickness=0
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

        self.hint = tk.Label(self, text="把对手的棋在棋盘上点出来（或拖），轮到你就自动算；也可直接输 e2e4 / Nf3 / O-O。",
                             bg="#fbf7ec", fg="#7d7660", font=("Microsoft YaHei UI", 9), anchor="w")
        self.hint.pack(side="bottom", fill="x", padx=14, pady=(0, 10))

    # ---------- 配置 ----------
    def _load_config(self):
        try:
            with open(CONFIG_PATH, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            self.region = tuple(cfg["region"]) if cfg.get("region") else None
            self.sens_var.set(int(cfg.get("sens", 14)))
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
                json.dump({"region": self.region, "sens": self.sens_var.get(),
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

        if self.running:
            self.expect = set(affected_squares(m, self.flip()))

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
        self.region_label.config(text="未选择区域")
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
            self.result.config(text="已框住棋盘，点「开始识别」。")

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
        self.running = True
        self.shot_base = None
        self.expect = None
        self.btn_scan.config(text="■ 停止识别")
        self.result.config(text="识别中：你在那边下，我这边读。")
        threading.Thread(target=self._scan_loop, daemon=True).start()

    def _grab(self):
        x1, y1, x2, y2 = self.region
        return ImageGrab.grab(bbox=(x1, y1, x2, y2), all_screens=True)

    def _scan_loop(self):
        miss = 0
        while self.running:
            time.sleep(0.26)
            if self.busy or self.over:
                continue
            try:
                sig = img_signature(self._grab())
            except Exception:            # noqa: BLE001
                continue
            if self.shot_base is None:
                self.shot_base = sig
                self._set_result("已取基线，等你那边落子。")
                continue
            changed = diff_squares(self.shot_base, sig, self.sens_var.get())
            if not changed:
                miss = 0
                continue

            if self.expect:
                hit = len([c for c in changed if c in self.expect])
                if hit == len(self.expect) and len(changed) <= len(self.expect) + 1:
                    self.shot_base = sig
                    self.expect = None
                    self._set_result("我方那手已在真实棋盘上，继续等对手。")
                    continue
                if hit:
                    continue

            m = match_move(changed, self.legal, self.flip())
            if not m:
                miss += 1
                if miss >= 3:
                    self.shot_base = sig
                    miss = 0
                continue
            miss = 0
            if self.st["turn"] == self.human:
                self.shot_base = sig
                continue
            san = to_san(self.st["board"], self.st, m)
            self.shot_base = sig
            self._set_result("读到对手：%s（变化 %d 格）" % (san, len(changed)))
            self.ui_queue.put(lambda: self.do_move(m))

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

    ch = diff_squares(img_signature(frame([(1, 4)])), img_signature(frame([(3, 4)])), 14)
    stt = new_state()
    stt["turn"] = "b"
    mm = match_move(ch, legal_moves(stt["board"], False, stt), False)
    san = sq_name(mm[0]) + sq_name(mm[1]) if mm else None
    lines.append("识图 e7e5 -> %s %s" % (san, san == "e7e5"))
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
