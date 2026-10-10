// =============================================================================
// util.js — formatação (pt-BR), estatística básica e paletas
// Reproduz, em JavaScript, as funções auxiliares do app R (mesmos resultados).
// =============================================================================
(function (MV) {
  'use strict';

  var ok = function (x) { return typeof x === 'number' && isFinite(x); };

  // ---- formatação (equivale a fmt_num / fmt_pct / fmt_pp do app R) -------------
  function fmtNum(x, d) {
    if (!ok(x)) return '—';
    d = d || 0;
    return x.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function fmtPct(x, d) { return ok(x) ? fmtNum(x, d === undefined ? 1 : d) + '%' : '—'; }
  function fmtPP(x, d) {
    if (!ok(x)) return '—';
    d = d === undefined ? 1 : d;
    return (x > 0 ? '+' : (x < 0 ? '−' : '')) + fmtNum(Math.abs(x), d) + ' p.p.';
  }
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ---- estatística ------------------------------------------------------------------
  // quantis "tipo 7" (padrão do R)
  function quantis(v, probs) {
    var s = v.slice().sort(function (a, b) { return a - b; }), n = s.length;
    return probs.map(function (p) {
      var h = (n - 1) * p, lo = Math.floor(h), hi = Math.ceil(h);
      return s[lo] + (h - lo) * (s[hi] - s[lo]);
    });
  }
  function unicos(v) {
    var out = [];
    v.forEach(function (x) { if (!out.length || Math.abs(out[out.length - 1] - x) > 0) { if (out.indexOf(x) < 0) out.push(x); } });
    return out;
  }
  // findInterval(x, br, rightmost.closed = TRUE, all.inside = TRUE) → 1..(nbr-1)
  function intervalo(x, br) {
    var k = br.length - 1, i = 0;
    while (i < br.length && br[i] <= x) i++;          // nº de quebras ≤ x
    if (x === br[br.length - 1]) i = k;               // rightmost.closed
    return Math.min(Math.max(i, 1), k);
  }
  // pretty() do R (algoritmo R_pretty, parâmetros padrão)
  function pretty(lo, hi, n) {
    var h = 1.5, h5 = 0.5 + 1.5 * h, minN = Math.floor(n / 3), eps = 1e-10;
    var dx = hi - lo, cell = Math.max(Math.abs(lo), Math.abs(hi));
    var U = 1 + ((h5 >= 1.5 * h + 0.5) ? 1 / (1 + h) : 1.5 / (1 + h5));
    U *= Math.max(1, n) * 2.220446e-16;
    var pequeno = dx < cell * U * 3;
    if (pequeno) { if (cell > 10) cell = 9 + cell / 10; cell *= 0.7 * (minN > 1 ? 1 / minN : 1); }
    else { cell = dx; if (n > 1) cell /= n; }
    if (cell < 20 * Number.MIN_VALUE) cell = 20 * Number.MIN_VALUE;
    var base = Math.pow(10, Math.floor(Math.log10(cell))), unidade = base, ns;
    if ((ns = 2 * base) - cell < h * (cell - unidade)) {
      unidade = ns;
      if ((ns = 5 * base) - cell < h5 * (cell - unidade)) {
        unidade = ns;
        if ((ns = 10 * base) - cell < h * (cell - unidade)) unidade = ns;
      }
    }
    var a = Math.floor(lo / unidade + 1e-7), b = Math.ceil(hi / unidade - 1e-7);
    while (a * unidade > lo + eps * unidade) a--;
    while (b * unidade < hi - eps * unidade) b++;
    var k = Math.floor(0.5 + b - a);
    if (k < minN) { k = minN - k; if (a >= 0) { b += k / 2; a -= k / 2 + k % 2; } else { a -= k / 2; b += k / 2 + k % 2; } }
    var out = [];
    for (var i = a; i <= b + 1e-9; i++) out.push(Math.round(i * unidade * 1e10) / 1e10);
    return out;
  }
  function media(v) { var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s / v.length; }
  function dp(v) {
    var m = media(v), s = 0;
    for (var i = 0; i < v.length; i++) s += (v[i] - m) * (v[i] - m);
    return Math.sqrt(s / (v.length - 1));
  }
  // correlação de Pearson ponderada (equivale a cov.wt(..., cor = TRUE))
  function corPond(a, b, w) {
    var sw = 0, ma = 0, mb = 0, i;
    for (i = 0; i < a.length; i++) { sw += w[i]; ma += w[i] * a[i]; mb += w[i] * b[i]; }
    ma /= sw; mb /= sw;
    var sab = 0, saa = 0, sbb = 0;
    for (i = 0; i < a.length; i++) {
      var da = a[i] - ma, db = b[i] - mb;
      sab += w[i] * da * db; saa += w[i] * da * da; sbb += w[i] * db * db;
    }
    return sab / Math.sqrt(saa * sbb);
  }
  function postos(v) {                                  // ranks médios (empates)
    var idx = v.map(function (x, i) { return i; }).sort(function (i, j) { return v[i] - v[j]; });
    var r = new Array(v.length), i = 0;
    while (i < idx.length) {
      var j = i;
      while (j + 1 < idx.length && v[idx[j + 1]] === v[idx[i]]) j++;
      var m = (i + j) / 2 + 1;
      for (var k = i; k <= j; k++) r[idx[k]] = m;
      i = j + 1;
    }
    return r;
  }
  function spearman(a, b) {
    var ra = postos(a), rb = postos(b), w = a.map(function () { return 1; });
    return corPond(ra, rb, w);
  }

  // ---- cores ------------------------------------------------------------------------
  function hexRgb(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function rgbHex(c) { return '#' + c.map(function (x) { var s = Math.round(x).toString(16).toUpperCase(); return s.length < 2 ? '0' + s : s; }).join(''); }
  // colorRampPalette(cores)(k) do R: interpolação linear em RGB, com a mesma aritmética
  // (canais em 0–1, approxfun e arredondamento de rgb()) para dar exatamente as mesmas cores
  function rampa(cores, k) {
    var c = cores.map(function (h) { return hexRgb(h).map(function (x) { return x / 255; }); });
    var nc = c.length, out = [];
    for (var j = 0; j < k; j++) {
      var t = k === 1 ? 0 : (j === k - 1 ? 1 : j * (1 / (k - 1)));      // seq(0, 1, length.out = k)
      var px = [];
      for (var q = 0; q < nc; q++) px.push(q === nc - 1 ? 1 : q * (1 / (nc - 1)));
      var i = 0;
      while (i < nc - 2 && t > px[i + 1]) i++;
      out.push(rgbHex([0, 1, 2].map(function (ch) {
        var y0 = c[i][ch], y1 = c[i + 1][ch];
        var v = (t === px[i + 1]) ? y1 : y0 + (y1 - y0) * ((t - px[i]) / (px[i + 1] - px[i]));
        var x = Math.min(Math.max(v, 0), 1) * 255;          // colorRamp devolve 0–255
        return Math.trunc(x);                               // rgb(..., maxColorValue = 255) trunca
      })));
    }
    return out;
  }

  // ---- CSV (para download) -------------------------------------------------------------
  function csv(linhas, colunas) {
    var q = function (x) {
      if (x === null || x === undefined || (typeof x === 'number' && !isFinite(x))) return '';
      var s = String(x);
      return /[",;\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var out = [colunas.join(',')];
    linhas.forEach(function (l) { out.push(colunas.map(function (c) { return q(l[c]); }).join(',')); });
    return '﻿' + out.join('\n');
  }

  MV.util = { ok: ok, fmtNum: fmtNum, fmtPct: fmtPct, fmtPP: fmtPP, esc: esc, quantis: quantis, unicos: unicos,
              intervalo: intervalo, pretty: pretty, media: media, dp: dp, corPond: corPond, spearman: spearman,
              rampa: rampa, csv: csv };
})(window.MV = window.MV || {});
