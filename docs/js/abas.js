// =============================================================================
// abas.js — Dispersão A × B, Tabela analítica e Metodologia
// Cada aba só é (re)calculada quando está aberta.
// =============================================================================
(function (MV) {
  'use strict';
  var U = MV.util, C = MV.calc, TB = MV.tabelas;
  var $ = function (id) { return document.getElementById(id); };
  var NIVEIS = [['local', 'Local de votação'], ['unidade', 'Bairro / unidade'], ['zona', 'Zona eleitoral'], ['municipio', 'Município']];
  var cacheEstatico = {};
  var ligado = false;

  function ligar() {
    if (ligado) return; ligado = true;
    $('nivel_disp').addEventListener('change', function () { dispersao(); });
    $('min_aptos').addEventListener('input', function () { clearTimeout(this._t); this._t = setTimeout(dispersao, 250); });
    $('baixar_tabela').addEventListener('click', baixarCSV);
    document.querySelectorAll('.subaba').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = b.getAttribute('data-sub');
        document.querySelectorAll('.subaba').forEach(function (x) { x.classList.toggle('ativa', x === b); });
        document.querySelectorAll('.painel-sub').forEach(function (p) { p.hidden = p.id !== 'sub-' + s; });
        metodologia();
      });
    });
  }
  function minAptos() { var v = parseFloat($('min_aptos').value); return isFinite(v) && v >= 0 ? v : 0; }

  // =============================================================== DISPERSÃO ===
  function dispersao() {
    var app = MV.app, R = app.resultado(); if (!R) return;
    var nivel = $('nivel_disp').value, ma = minAptos();
    var T = nivel === 'unidade' ? R.T : app.tabelaNivel(nivel);
    var comDados = T.linhas.filter(function (r) { return U.ok(r.PCT_A) && U.ok(r.PCT_B); });
    var pts = comDados.filter(function (r) { return U.ok(r.APTOS) && r.APTOS >= ma; });
    grafico($('dispersao'), pts, R.dA, R.dB);
    $('nota_disp').textContent = pts.length + ' de ' + comDados.length + ' unidades com dados nos dois indicadores aparecem (mínimo de ' +
      U.fmtNum(ma) + ' aptos). Tamanho do ponto ∝ eleitores aptos. Cada ponto é um território, não um eleitor.';

    // a associação muda com a escala?
    var linhas = NIVEIS.map(function (nv) {
      var t = nv[0] === 'unidade' ? R.T : (nv[0] === nivel ? T : app.tabelaNivel(nv[0]));
      var c = C.correlacoes(t.linhas, ma); c.Nivel = nv[1]; c.id = nv[0]; return c;
    });
    $('tab_escalas').innerHTML = '<div class="tab-wrap"><table class="dados"><thead><tr><th>Nível</th><th>N</th><th>Pearson ponderado</th><th>Spearman</th><th>Dentro dos municípios</th></tr></thead><tbody>' +
      linhas.map(function (c) {
        return '<tr><td>' + c.Nivel + '</td><td class="num">' + U.fmtNum(c.N) + '</td><td class="num">' + U.fmtNum(c.PEARSON_POND, 2) +
          '</td><td class="num">' + U.fmtNum(c.SPEARMAN, 2) + '</td><td class="num">' + U.fmtNum(c.DENTRO_MUN, 2) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    var v = []; linhas.forEach(function (c) { [c.PEARSON_POND, c.SPEARMAN, c.DENTRO_MUN].forEach(function (x) { if (U.ok(x)) v.push(x); }); });
    var msgs = [];
    if (v.some(function (x) { return x > 0.1; }) && v.some(function (x) { return x < -0.1; }))
      msgs.push('O <b>sinal</b> da associação muda conforme a medida ou a escala: o padrão não é robusto.');
    var u = linhas[1];
    if (U.ok(u.PEARSON_POND) && U.ok(u.DENTRO_MUN) && Math.abs(u.PEARSON_POND) - Math.abs(u.DENTRO_MUN) > 0.2)
      msgs.push('A associação entre bairros enfraquece muito dentro dos municípios: boa parte dela é diferença <b>entre municípios</b>.');
    var alerta = msgs.length > 0;
    if (!msgs.length) msgs.push('Associação com o mesmo sentido nas escalas e medidas — ainda assim, é uma relação entre territórios.');
    $('alerta_escalas').innerHTML = '<div class="alerta ' + (alerta ? 'alerta-aviso' : 'alerta-neutro') + '">' + msgs.join('<br>') + '</div>';
  }

  // gráfico de dispersão em SVG (sem bibliotecas)
  function grafico(el, pts, dA, dB) {
    el.innerHTML = '';
    if (pts.length < 3) { el.innerHTML = '<div class="alerta alerta-neutro">Poucas unidades com dados nos dois indicadores para este recorte.</div>'; return; }
    var W = el.clientWidth || 800, H = el.clientHeight || 600;
    var m = { e: 58, d: 16, t: 12, b: 52 };
    var xs = pts.map(function (r) { return r.PCT_A; }), ys = pts.map(function (r) { return r.PCT_B; });
    var dom = function (v) {
      var lo = Math.min.apply(null, v), hi = Math.max.apply(null, v), p = (hi - lo) * 0.04 || 1;
      var t = U.pretty(Math.max(0, lo - p), hi + p, 6);
      return t;
    };
    var tx = dom(xs), ty = dom(ys);
    var x0 = tx[0], x1 = tx[tx.length - 1], y0 = ty[0], y1 = ty[ty.length - 1];
    var X = function (v) { return m.e + (v - x0) / (x1 - x0) * (W - m.e - m.d); };
    var Y = function (v) { return H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b); };
    var amax = Math.max.apply(null, pts.map(function (r) { return r.APTOS; }));
    var dx = (x1 - x0) < 5 ? 1 : 0, dy = (y1 - y0) < 5 ? 1 : 0;
    var s = ['<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Gráfico de dispersão A × B">'];
    s.push('<g class="grade">');
    tx.forEach(function (t) { s.push('<line x1="' + X(t) + '" x2="' + X(t) + '" y1="' + m.t + '" y2="' + (H - m.b) + '"/>'); });
    ty.forEach(function (t) { s.push('<line y1="' + Y(t) + '" y2="' + Y(t) + '" x1="' + m.e + '" x2="' + (W - m.d) + '"/>'); });
    s.push('</g><g class="eixo">');
    tx.forEach(function (t) { s.push('<text x="' + X(t) + '" y="' + (H - m.b + 16) + '" text-anchor="middle">' + U.fmtNum(t, dx) + '%</text>'); });
    ty.forEach(function (t) { s.push('<text x="' + (m.e - 6) + '" y="' + (Y(t) + 4) + '" text-anchor="end">' + U.fmtNum(t, dy) + '%</text>'); });
    s.push('</g>');
    s.push('<text class="titulo-eixo" x="' + (m.e + (W - m.e - m.d) / 2) + '" y="' + (H - 10) + '" text-anchor="middle">A — ' + U.esc(dA.curto) + ' (' + U.esc(dA.medida) + ')</text>');
    s.push('<text class="titulo-eixo" transform="translate(14,' + (m.t + (H - m.t - m.b) / 2) + ') rotate(-90)" text-anchor="middle">B — ' + U.esc(dB.curto) + ' (' + U.esc(dB.medida) + ')</text>');
    // pontos maiores primeiro, para os pequenos ficarem por cima
    var ordem = pts.map(function (r, i) { return i; }).sort(function (i, j) { return pts[j].APTOS - pts[i].APTOS; });
    ordem.forEach(function (i) {
      var r = pts[i], rad = (4 + 26 * Math.sqrt(r.APTOS / amax)) / 2;
      s.push('<circle data-i="' + i + '" cx="' + X(r.PCT_A).toFixed(1) + '" cy="' + Y(r.PCT_B).toFixed(1) + '" r="' + rad.toFixed(1) + '"/>');
    });
    s.push('</svg>');
    el.innerHTML = s.join('');
    var dica = document.createElement('div'); dica.className = 'dica'; dica.hidden = true; el.appendChild(dica);
    var svg = el.querySelector('svg');
    svg.addEventListener('mousemove', function (ev) {
      var c = ev.target.closest('circle');
      if (!c) { dica.hidden = true; return; }
      var r = pts[+c.getAttribute('data-i')];
      dica.innerHTML = '<b>' + U.esc(r.NOME) + '</b><br>' + U.esc(r.NM_MUN) + '<br>A: ' + U.fmtPct(r.PCT_A, 2) + ' · B: ' + U.fmtPct(r.PCT_B, 2) +
        '<br>Aptos: ' + U.fmtNum(r.APTOS);
      var b = el.getBoundingClientRect();
      var x = ev.clientX - b.left + 12, y = ev.clientY - b.top + 12;
      if (x > b.width - 230) x -= 250;
      dica.style.left = x + 'px'; dica.style.top = y + 'px'; dica.hidden = false;
    });
    svg.addEventListener('mouseleave', function () { dica.hidden = true; });
  }

  // =============================================================== TABELA ===
  var COLS = [
    ['ANO', 'ANO'], ['UF', 'UF'], ['COD_MUNICIPIO', 'COD_MUNICIPIO'], ['COD_MUNICIPIO_TSE', 'COD_MUNICIPIO_TSE'], ['MUNICIPIO', 'MUNICIPIO'],
    ['ID_UNIDADE', 'ID_UNIDADE'], ['TIPO_UNIDADE', 'TIPO_UNIDADE'], ['BAIRRO', 'BAIRRO'], ['ZONA', 'ZONA'], ['N_LOCAIS', 'N_LOCAIS', 0],
    ['APTOS', 'APTOS', 0], ['COMPARECIMENTO', 'COMPARECIMENTO', 0], ['VOTOS_VALIDOS', 'VOTOS_VALIDOS', 0],
    ['ABSTENCOES', 'ABSTENCOES', 0], ['PCT_ABSTENCAO', 'PCT_ABSTENCAO', 2], ['BRANCOS', 'BRANCOS', 0], ['PCT_BRANCOS', 'PCT_BRANCOS', 2],
    ['NULOS', 'NULOS', 0], ['PCT_NULOS', 'PCT_NULOS', 2], ['VOTOS_A', 'VOTOS_A', 0], ['DENOMINADOR_A', 'DENOMINADOR_A', 0], ['PCT_A', 'PCT_A', 2],
    ['VOTOS_B', 'VOTOS_B', 0], ['DENOMINADOR_B', 'DENOMINADOR_B', 0], ['PCT_B', 'PCT_B', 2],
    ['DIFERENCA_PP', 'DIFERENCA_PP', 2], ['DIFERENCA_ABS', 'DIFERENCA_ABS', 0], ['STATUS_A', 'STATUS_A'], ['STATUS_B', 'STATUS_B']
  ];
  var r4 = function (x) { return U.ok(x) ? Math.round(x * 1e4) / 1e4 : null; };
  var nn = function (x) { return U.ok(x) ? x : null; };
  function tabelaEntrega(T) {
    var S = MV.app.estado;
    return T.linhas.map(function (t) {
      return { ANO: S.ano, UF: 'RJ', COD_MUNICIPIO: t.CD_MUN_IBGE, COD_MUNICIPIO_TSE: t.CD_MUN_TSE, MUNICIPIO: t.NM_MUN,
        ID_UNIDADE: t.KEY, TIPO_UNIDADE: t.TIPO_UNIDADE, BAIRRO: t.NOME, ZONA: t.ZONAS, N_LOCAIS: t.N_LOCAIS,
        APTOS: nn(t.APTOS), COMPARECIMENTO: nn(t.COMPARECIMENTO), VOTOS_VALIDOS: nn(t.VOTOS_VALIDOS),
        ABSTENCOES: nn(t.ABSTENCOES), PCT_ABSTENCAO: r4(t.PCT_ABST), BRANCOS: nn(t.BRANCOS), PCT_BRANCOS: r4(t.PCT_BRANCOS),
        NULOS: nn(t.NULOS), PCT_NULOS: r4(t.PCT_NULOS), VOTOS_A: nn(t.NUM_A), DENOMINADOR_A: nn(t.DEN_A), PCT_A: r4(t.PCT_A),
        VOTOS_B: nn(t.NUM_B), DENOMINADOR_B: nn(t.DEN_B), PCT_B: r4(t.PCT_B), DIFERENCA_PP: r4(t.DIFERENCA_PP),
        DIFERENCA_ABS: nn(t.DIFERENCA_ABS), STATUS_A: t.STATUS_A, STATUS_B: t.STATUS_B };
    });
  }
  function descricaoAB() {
    var R = MV.app.resultado();
    return { A: R.dA.rotulo + ' — ' + R.dA.medida, B: R.dB.rotulo + ' — ' + R.dB.medida };
  }
  function tabela() {
    var R = MV.app.resultado(); if (!R) return;
    var d = descricaoAB();
    $('legenda_tabela').innerHTML = '<b>A</b> = ' + U.esc(d.A) + ' &nbsp;|&nbsp; <b>B</b> = ' + U.esc(d.B);
    TB.tabela('tabela', COLS.map(function (c) { return { id: c[0], titulo: c[1], num: c.length > 2, d: c[2] }; }), tabelaEntrega(R.T), { porPagina: 15 });
  }
  function baixarCSV() {
    var R = MV.app.resultado(); if (!R) return;
    var S = MV.app.estado, d = descricaoAB();
    var corpo = U.csv(tabelaEntrega(R.T), COLS.map(function (c) { return c[0]; })).replace(/^﻿/, '');
    var txt = '﻿# A = ' + d.A + '\n# B = ' + d.B + '\n' + corpo;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
    a.download = 'tabela_analitica_' + S.ano + '_cargo' + S.cargo + '_' + S.mun + '.csv';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // =========================================================== METODOLOGIA ===
  function estatico(nome) {
    if (!cacheEstatico[nome]) cacheEstatico[nome] = MV.dados.json(nome).then(TB.deColunas);
    return cacheEstatico[nome];
  }
  function metodologia() {
    var R = MV.app.resultado(), S = MV.app.estado;
    var sub = (document.querySelector('.subaba.ativa') || {}).getAttribute ? document.querySelector('.subaba.ativa').getAttribute('data-sub') : 'texto';
    if (sub === 'texto') {
      if (!cacheEstatico.texto) {
        cacheEstatico.texto = MV.dados.texto('metodologia.html').then(function (h) { $('metodologia_texto').innerHTML = h; })
          .catch(function () { $('metodologia_texto').textContent = 'Texto da metodologia indisponível.'; });
      }
    } else if (sub === 'qualidade') {
      estatico('validacao.json').then(function (x) {
        TB.tabela('validacao', [{ id: 'Indicador' }, { id: 'Resultado' }, { id: 'Detalhe' }], x, { porPagina: 50, busca: false, compacta: true });
      });
      if (R) {
        var cont = {};
        R.T.linhas.forEach(function (r) {
          ['A', 'B'].forEach(function (L) {
            var s = r['STATUS_' + L]; cont[s] = cont[s] || { STATUS: s, DESCRICAO: C.STATUS_ROTULOS[s], A: 0, B: 0 }; cont[s][L]++;
          });
        });
        var ordem = ['OK', 'SEM_LOCAL', 'SEM_DEN', 'FORA_CIRC', 'SEM_MUN_TSE', 'SEM_SELECAO'];
        var linhas = ordem.filter(function (s) { return cont[s]; }).map(function (s) { return cont[s]; });
        TB.tabela('ctrl_status', [{ id: 'STATUS' }, { id: 'DESCRICAO', titulo: 'DESCRIÇÃO' }, { id: 'A', num: true }, { id: 'B', num: true }],
                  linhas, { busca: false, compacta: true });
      }
      estatico('sem_correspondencia.json').then(function (x) { TB.tabela('sem_corresp', TB.colunasDe(x), x, { porPagina: 15 }); });
      estatico('auditoria.json').then(function (x) { TB.tabela('auditoria', TB.colunasDe(x), x, { porPagina: 15 }); });
    } else if (sub === 'corresp') {
      estatico('correspondencia.json').then(function (x) {
        var f = x.filter(function (r) { return r.ANO == S.ano && r.TURNO == S.turno && (S.mun === 'TODOS' || r.CD_MUN_TSE === S.mun); });
        TB.tabela('corresp', TB.colunasDe(x), f, { porPagina: 20 });
      });
    }
  }

  function atualizar(aba) {
    ligar();
    try {
      if (aba === 'dispersao') dispersao();
      else if (aba === 'tabela') tabela();
      else if (aba === 'metodologia') metodologia();
    } catch (e) { console.error('[aba ' + aba + ']', e); }
  }

  MV.abas = { atualizar: atualizar, tabelaEntrega: tabelaEntrega };
})(window.MV = window.MV || {});
