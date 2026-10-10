// =============================================================================
// tabelas.js — tabela HTML simples com busca, ordenação e paginação
// =============================================================================
(function (MV) {
  'use strict';
  var U = MV.util;

  // colunas: [{ id, titulo, num (bool), d (casas decimais), fmt (fn) }]
  // dados: array de objetos. opcoes: { porPagina, busca, compacta }
  function tabela(el, colunas, dados, opcoes) {
    opcoes = opcoes || {};
    if (typeof el === 'string') el = document.getElementById(el);
    var porPagina = opcoes.porPagina || 15, pagina = 0, termo = '', ordCol = null, ordDir = 1;
    var filtrados = dados;
    el.innerHTML = '';
    var topo = document.createElement('div'); topo.className = 'tab-topo';
    var info = document.createElement('span'); info.style.fontSize = '.8rem'; info.style.color = '#555';
    topo.appendChild(info);
    if (opcoes.busca !== false && dados.length > porPagina) {
      var busca = document.createElement('input');
      busca.type = 'search'; busca.placeholder = 'Buscar…'; busca.setAttribute('aria-label', 'Buscar na tabela');
      busca.addEventListener('input', function () { termo = busca.value.trim().toLowerCase(); pagina = 0; filtrar(); desenhar(); });
      topo.appendChild(busca);
    }
    el.appendChild(topo);
    var wrap = document.createElement('div'); wrap.className = 'tab-wrap'; el.appendChild(wrap);
    var pag = document.createElement('div'); pag.className = 'paginacao'; el.appendChild(pag);

    function valorTexto(c, r) {
      var v = r[c.id];
      if (c.fmt) return c.fmt(v, r);
      if (c.num) return U.fmtNum(v, c.d || 0);
      return v === null || v === undefined || (typeof v === 'number' && isNaN(v)) ? '' : String(v);
    }
    function filtrar() {
      var sem = function (s) { return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s; };
      var t = sem(termo);
      filtrados = !t ? dados.slice() : dados.filter(function (r) {
        return colunas.some(function (c) { return sem(valorTexto(c, r).toLowerCase()).indexOf(t) >= 0; });
      });
      if (ordCol) {
        var c = ordCol;
        filtrados.sort(function (a, b) {
          var x = a[c.id], y = b[c.id];
          var nx = x === null || x === undefined || (typeof x === 'number' && isNaN(x));
          var ny = y === null || y === undefined || (typeof y === 'number' && isNaN(y));
          if (nx || ny) return nx === ny ? 0 : (nx ? 1 : -1);           // ausentes sempre no fim
          if (typeof x === 'number' && typeof y === 'number') return ordDir * (x - y);
          return ordDir * String(x).localeCompare(String(y), 'pt-BR', { numeric: true });
        });
      }
    }
    function desenhar() {
      var n = filtrados.length, np = Math.max(1, Math.ceil(n / porPagina));
      if (pagina >= np) pagina = np - 1;
      var ini = pagina * porPagina, fim = Math.min(n, ini + porPagina);
      var h = ['<table class="dados' + (opcoes.compacta ? ' compacta' : '') + '"><thead><tr>'];
      colunas.forEach(function (c, k) {
        var cls = ordCol === c ? (ordDir > 0 ? 'ord-asc' : 'ord-desc') : '';
        h.push('<th data-k="' + k + '" class="' + cls + '">' + U.esc(c.titulo || c.id) + '</th>');
      });
      h.push('</tr></thead><tbody>');
      for (var i = ini; i < fim; i++) {
        var r = filtrados[i];
        h.push('<tr>');
        colunas.forEach(function (c) { h.push('<td' + (c.num ? ' class="num"' : '') + '>' + U.esc(valorTexto(c, r)) + '</td>'); });
        h.push('</tr>');
      }
      if (!n) h.push('<tr><td colspan="' + colunas.length + '" style="color:#777">Nenhum registro.</td></tr>');
      h.push('</tbody></table>');
      wrap.innerHTML = h.join('');
      info.textContent = n ? (ini + 1) + '–' + fim + ' de ' + U.fmtNum(n) + (n !== dados.length ? ' (de ' + U.fmtNum(dados.length) + ')' : '') : '';
      pag.innerHTML = np > 1 ? '<button data-p="ant"' + (pagina === 0 ? ' disabled' : '') + '>‹ Anterior</button>' +
        '<span>Página ' + (pagina + 1) + ' de ' + np + '</span>' +
        '<button data-p="prox"' + (pagina >= np - 1 ? ' disabled' : '') + '>Próxima ›</button>' : '';
    }
    wrap.addEventListener('click', function (ev) {
      var th = ev.target.closest('th'); if (!th) return;
      var c = colunas[+th.getAttribute('data-k')];
      if (ordCol === c) ordDir = -ordDir; else { ordCol = c; ordDir = c.num ? -1 : 1; }
      filtrar(); desenhar();
    });
    pag.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b || b.disabled) return;
      pagina += b.getAttribute('data-p') === 'prox' ? 1 : -1; desenhar();
    });
    filtrar(); desenhar();
  }

  // tabela "colunar" (formato exportado pelo R: {coluna: [valores]}) → array de objetos
  function deColunas(x) {
    var cols = Object.keys(x), n = 0;
    cols.forEach(function (c) { if (Array.isArray(x[c])) n = Math.max(n, x[c].length); });
    var out = [];
    for (var i = 0; i < n; i++) {
      var r = {};
      cols.forEach(function (c) { r[c] = Array.isArray(x[c]) ? x[c][i] : x[c]; });
      out.push(r);
    }
    return out;
  }
  function colunasDe(linhas, rotulos) {
    if (!linhas.length) return [];
    return Object.keys(linhas[0]).map(function (k) {
      var num = linhas.some(function (r) { return typeof r[k] === 'number'; }) && !/^(ANO|TURNO|NR_|CD_|LAT$|LON$)/.test(k);
      var dec = num && linhas.some(function (r) { return typeof r[k] === 'number' && r[k] % 1 !== 0; });
      return { id: k, titulo: (rotulos && rotulos[k]) || k, num: num, d: dec ? 1 : 0 };
    });
  }

  MV.tabelas = { tabela: tabela, deColunas: deColunas, colunasDe: colunasDe };
})(window.MV = window.MV || {});
