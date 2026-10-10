// =============================================================================
// calc.js — indicadores, tabela analítica, escalas e correlações
// -----------------------------------------------------------------------------
// Tradução direta de app/R/analitica.R e app/R/mapas.R do projeto Shiny.
// Regra central: toda unidade (bairro, zona, município) é a SOMA dos seus locais
// de votação — numerador e denominador somados separadamente e só então divididos.
// Valores ausentes ficam NaN (nunca viram zero) e recebem um STATUS.
// =============================================================================
(function (MV) {
  'use strict';
  var U = MV.util;

  var FAMILIA = { partido: 'validos', candidatura: 'validos', abstencao: 'aptos', brancos: 'votos_cargo', nulos: 'votos_cargo' };
  var STATUS_ROTULOS = {
    OK: 'Com dados',
    SEM_LOCAL: 'Sem informação eleitoral (nenhum local de votação na unidade)',
    SEM_MUN_TSE: 'Sem correspondência TSE↔IBGE para o município',
    SEM_DEN: 'Denominador zero (nenhum voto/eleitor na base do indicador)',
    FORA_CIRC: 'Fora da circunscrição da seleção',
    SEM_SELECAO: 'Nenhuma seleção'
  };
  var COR_A = '#c2570c', COR_B = '#5b3a9b';
  var PALETA_SEQ = ['#f7fcf0', '#d6efd0', '#a8ddb5', '#6cc3bf', '#3a9fc6', '#1171b0', '#08458a', '#08306b'];
  var PALETA_DIV = ['#3f1f78', '#6a51a3', '#9e9ac8', '#cbc9e2', '#f2f0f0', '#fdd0a2', '#fd9f5c', '#e6620f', '#a63603'];
  var PALETA_BIV = ['#e8e8e8', '#e4c1a6', '#d98b4c', '#c3b6d6', '#bf9a96', '#b4684c', '#8f79bd', '#8c6b8f', '#7d4a4a'];
  var COR_STATUS = { SEM_LOCAL: '#d4d4d4', SEM_DEN: '#8f8f8f', FORA_CIRC: '#ffffff', SEM_MUN_TSE: '#e8c5c5', SEM_SELECAO: '#efefef' };

  var vazio = function (s) { return s === null || s === undefined || s === ''; };

  // ---- textos ---------------------------------------------------------------------------
  function medida(tipo, legenda, prop) {
    switch (FAMILIA[tipo]) {
      case 'validos': return (legenda && prop) ? '% dos votos válidos (nominais + legenda)' : '% dos votos nominais válidos';
      case 'aptos': return '% dos eleitores aptos';
      case 'votos_cargo': return '% do total de votos do cargo';
    }
    return '';
  }
  // sel = { tipo, partido, sq }
  function descreverSelecao(D, sel, legenda, prop) {
    var tp = sel.tipo;
    if (vazio(tp)) return { tipo: null, rotulo: '— sem seleção —', curto: '—', medida: '' };
    if (tp === 'candidatura') {
      if (vazio(sel.sq)) return { tipo: null, rotulo: '— escolha uma candidatura —', curto: '—', medida: '' };
      var c = D.candPorSq[sel.sq];
      if (!c) return { tipo: null, rotulo: '— escolha uma candidatura —', curto: '—', medida: '' };
      return { tipo: 'Candidatura individual', rotulo: c.nome + ' (' + c.partido + ' ' + c.nr + ')', curto: c.nome,
               medida: medida(tp, legenda, prop), nome_num: 'votos' };
    }
    if (tp === 'partido') {
      if (vazio(sel.partido)) return { tipo: null, rotulo: '— escolha um partido —', curto: '—', medida: '' };
      var leg = legenda && prop;
      return { tipo: 'Partido', rotulo: sel.partido + ' (' + (leg ? 'nominais + legenda' : 'soma dos votos nominais das candidaturas') + ')',
               curto: sel.partido, medida: medida(tp, legenda, prop), nome_num: 'votos' };
    }
    var nm = { abstencao: 'Abstenção', brancos: 'Votos brancos', nulos: 'Votos nulos' }[tp];
    return { tipo: nm, rotulo: nm, curto: nm, medida: medida(tp, legenda, prop),
             nome_num: { abstencao: 'abstenções', brancos: 'votos brancos', nulos: 'votos nulos' }[tp] };
  }

  // candidaturas de uma eleição (ano × turno × cargo)
  function candidatosDe(D, ano, turno, cargo) {
    return D.candidatos.filter(function (c) { return c.ano == ano && c.turno == turno && c.cargo == cargo; });
  }

  // ---- numerador e denominador por local ---------------------------------------------------
  function indicadorLocal(D, E, sel, legenda, prop, cand) {
    var n = D.locais.n;
    var num = new Float64Array(n).fill(NaN), den = new Float64Array(n).fill(NaN);
    if (!E || vazio(sel.tipo)) return { num: num, den: den, circ: [] };
    var I = E.indic, tp = sel.tipo, usaLeg = legenda && prop, i, j;
    if (tp === 'partido' || tp === 'candidatura') {
      if (tp === 'candidatura' && vazio(sel.sq)) return { num: num, den: den, circ: [] };
      if (tp === 'partido' && vazio(sel.partido)) return { num: num, den: den, circ: [] };
      for (i = 0; i < n; i++) if (I.tem[i]) {
        den[i] = I.NOMINAIS_VALIDOS[i] + (usaLeg ? I.LEGENDA[i] : 0);
        num[i] = 0;
      }
      var cs = cand.filter(function (c) { return tp === 'candidatura' ? c.sq === String(sel.sq) : c.partido === sel.partido; });
      var circ = U.unicos(cs.map(function (c) { return c.ue; }));
      cs.forEach(function (c) {
        var x = E.votos[c.sq]; if (!x) return;
        for (j = 0; j < x.idx.length; j++) num[x.idx[j]] += x.v[j];   // (só locais com indicador têm votos)
      });
      if (tp === 'partido' && usaLeg) {
        U.unicos(cs.map(function (c) { return c.nrPartido; })).forEach(function (nr) {
          var x = E.legenda[String(nr)]; if (!x) return;
          for (j = 0; j < x.idx.length; j++) num[x.idx[j]] += x.v[j];
        });
      }
      return { num: num, den: den, circ: circ };
    }
    var col = { abstencao: 'ABSTENCOES', brancos: 'BRANCOS', nulos: 'NULOS' }[tp];
    var dcol = { abstencao: 'APTOS', brancos: 'TOTAL_VOTOS', nulos: 'TOTAL_VOTOS' }[tp];
    for (i = 0; i < n; i++) if (I.tem[i]) { num[i] = I[col][i]; den[i] = I[dcol][i]; }
    return { num: num, den: den, circ: ['RJ'] };
  }

  // ---- tabela analítica --------------------------------------------------------------------
  // o = { ano, turno, cargo, mun ('TODOS' ou código TSE), selA, selB, legenda, nivel }
  // nivel: 'unidade' (bairro/área/município sem bairros), 'local', 'zona' ou 'municipio'
  function montarTabela(D, E, o) {
    var info = MV.dados.infoChave(D, o.ano, o.turno, o.cargo);
    var prop = !!(info && info.proporcional);
    var usaLeg = !!o.legenda && prop;
    var cand = candidatosDe(D, o.ano, o.turno, o.cargo);
    var L = D.locais, n = L.n, nivel = o.nivel || 'unidade', i;
    var todos = o.mun === 'TODOS';
    var filtro = new Uint8Array(n);
    for (i = 0; i < n; i++) filtro[i] = (L.ano[i] == o.ano && (todos || L.mun[i] === o.mun)) ? 1 : 0;

    var a = indicadorLocal(D, E, o.selA, o.legenda, prop, cand);
    var b = indicadorLocal(D, E, o.selB, o.legenda, prop, cand);
    var I = E ? E.indic : null;

    // chave de agrupamento de cada local (null = sem grupo)
    var grupo = new Array(n);
    for (i = 0; i < n; i++) {
      grupo[i] = nivel === 'unidade' ? (L.unidade[i] >= 0 ? D.uni[L.unidade[i]].id : null)
               : nivel === 'local' ? String(i + 1)
               : nivel === 'zona' ? L.zonaKey[i] : L.mun[i];
    }

    // esqueleto
    var linhas = [], pos = {};
    function nova(key, nome, tipo, mun, ibge, nmMun, ui) {
      var r = { KEY: key, NOME: nome, TIPO_UNIDADE: tipo, CD_MUN_TSE: mun, CD_MUN_IBGE: ibge, NM_MUN: nmMun, UI: ui,
                NUM_A: NaN, DEN_A: NaN, NUM_B: NaN, DEN_B: NaN, VOTOS_VALIDOS: NaN, APTOS: NaN, COMPARECIMENTO: NaN,
                ABSTENCOES: NaN, BRANCOS: NaN, NULOS: NaN, TOTAL_VOTOS: NaN, N_LOCAIS: 0, _z: [], _li: -1 };
      pos[key] = linhas.length; linhas.push(r);
    }
    if (nivel === 'unidade') {
      D.uni.forEach(function (u) {
        if (todos || u.mun === o.mun) {
          var m = u.mun ? D.mun[u.mun] : null;
          nova(u.id, u.nome, u.tipo, u.mun || null, u.ibge || null, u.nm_mun || (m ? m.nome : null), u.i);
        }
      });
    } else {
      for (i = 0; i < n; i++) {
        if (!filtro[i] || grupo[i] === null || pos[grupo[i]] !== undefined) continue;
        var m = D.mun[L.mun[i]] || {};
        var nome = nivel === 'local' ? L.nome[i] : nivel === 'zona' ? m.nome + ' — zona ' + L.zona[i] : m.nome;
        nova(grupo[i], nome, nivel, L.mun[i], m.ibge, m.nome, L.unidade[i] >= 0 ? L.unidade[i] : -1);
      }
    }

    // somas (somar_por: ignora locais sem grupo e com denominador ausente)
    var soma = function (r, campo, v) { r[campo] = isNaN(r[campo]) ? v : r[campo] + v; };
    for (i = 0; i < n; i++) {
      if (!filtro[i] || grupo[i] === null) continue;
      var p = pos[grupo[i]]; if (p === undefined) continue;
      var r = linhas[p];
      r.N_LOCAIS++;
      if (r._z.indexOf(L.zona[i]) < 0) r._z.push(L.zona[i]);
      if (nivel === 'local') r._li = i;
      if (!isNaN(a.den[i])) { soma(r, 'NUM_A', a.num[i]); soma(r, 'DEN_A', a.den[i]); }
      if (!isNaN(b.den[i])) { soma(r, 'NUM_B', b.num[i]); soma(r, 'DEN_B', b.den[i]); }
      if (I && I.tem[i]) {
        var vv = I.NOMINAIS_VALIDOS[i] + (usaLeg ? I.LEGENDA[i] : 0);
        if (!isNaN(vv)) soma(r, 'VOTOS_VALIDOS', vv);
        ['APTOS', 'COMPARECIMENTO', 'ABSTENCOES', 'BRANCOS', 'NULOS', 'TOTAL_VOTOS'].forEach(function (c) {
          if (!isNaN(I[c][i])) soma(r, c, I[c][i]);
        });
      }
    }

    // status e percentuais
    var stSel = function (sel, circ) {
      return vazio(sel.tipo) || (!circ.length && (sel.tipo === 'partido' || sel.tipo === 'candidatura'));
    };
    var semA = stSel(o.selA, a.circ), semB = stSel(o.selB, b.circ);
    var restrito = function (circ) { return circ.length && circ.indexOf('RJ') < 0 && circ.indexOf('BR') < 0; };
    var rA = restrito(a.circ), rB = restrito(b.circ);
    var mesma = !vazio(o.selA.tipo) && !vazio(o.selB.tipo) && FAMILIA[o.selA.tipo] === FAMILIA[o.selB.tipo];
    linhas.forEach(function (r) {
      r.ZONAS = r._z.length ? r._z.slice().sort(function (x, y) { return x - y; }).join(', ') : null;
      delete r._z;
      var base = !r.CD_MUN_TSE ? 'SEM_MUN_TSE' : (r.N_LOCAIS === 0 ? 'SEM_LOCAL' : 'OK');
      var st = function (sem, den, restr, circ) {
        if (sem) return 'SEM_SELECAO';
        var s = base;
        if (s === 'OK' && (isNaN(den) || den <= 0)) s = 'SEM_DEN';
        if (restr && s === 'OK' && circ.indexOf(r.CD_MUN_TSE) < 0) s = 'FORA_CIRC';
        return s;
      };
      r.STATUS_A = st(semA, r.DEN_A, rA, a.circ);
      r.STATUS_B = st(semB, r.DEN_B, rB, b.circ);
      r.PCT_A = r.STATUS_A === 'OK' ? 100 * r.NUM_A / r.DEN_A : NaN;
      r.PCT_B = r.STATUS_B === 'OK' ? 100 * r.NUM_B / r.DEN_B : NaN;
      r.DIFERENCA_PP = mesma ? r.PCT_A - r.PCT_B : NaN;
      r.DIFERENCA_ABS = (mesma && r.STATUS_A === 'OK' && r.STATUS_B === 'OK') ? r.NUM_A - r.NUM_B : NaN;
      r.PCT_ABST = r.APTOS > 0 ? 100 * r.ABSTENCOES / r.APTOS : NaN;
      r.PCT_BRANCOS = r.TOTAL_VOTOS > 0 ? 100 * r.BRANCOS / r.TOTAL_VOTOS : NaN;
      r.PCT_NULOS = r.TOTAL_VOTOS > 0 ? 100 * r.NULOS / r.TOTAL_VOTOS : NaN;
    });

    // totais do recorte, incluindo locais sem correspondência geográfica
    function tot(x) {
      var t = { num: 0, den: 0, fora: 0 };
      for (var j = 0; j < n; j++) {
        if (!filtro[j]) continue;
        if (!isNaN(x.num[j])) { t.num += x.num[j]; if (L.unidade[j] < 0) t.fora += x.num[j]; }
        if (!isNaN(x.den[j])) t.den += x.den[j];
      }
      return t;
    }
    linhas.sort(function (x, y) {
      return (x.NM_MUN || '').localeCompare(y.NM_MUN || '', 'pt-BR') || (x.NOME || '').localeCompare(y.NOME || '', 'pt-BR');
    });
    return { linhas: linhas, mesma: mesma, totais: { A: tot(a), B: tot(b) }, prop: prop, usaLeg: usaLeg };
  }

  // ---- escalas e cores -------------------------------------------------------------------
  function escalaSequencial(v, metodo, n) {
    n = n || 7;
    v = v.filter(U.ok);
    if (!v.length) return null;
    var mx = Math.max.apply(null, v), mn = Math.min.apply(null, v);
    if (mx <= 0) mx = 1;
    var br = null;
    if (metodo === 'quantis') {
      var probs = []; for (var i = 0; i <= n; i++) probs.push(i / n);
      br = U.unicos(U.quantis(v, probs));
    }
    if (metodo !== 'quantis' || br.length < 4) br = U.pretty(0, mx, n);
    br[0] = Math.min(br[0], mn); br[br.length - 1] = Math.max(br[br.length - 1], mx);
    var k = br.length - 1, cores = U.rampa(PALETA_SEQ, k);
    var d = (br[br.length - 1] - br[0]) < 5 ? 2 : 1, rot = [];
    for (var j = 0; j < k; j++) rot.push(U.fmtNum(br[j], d) + ' – ' + U.fmtPct(br[j + 1], d));
    return { breaks: br, cores: cores, rotulos: rot, classe: function (x) { return cores[U.intervalo(x, br) - 1]; } };
  }
  function arredondarBonito(x) {
    if (!U.ok(x) || x <= 0) return 1;
    var p = Math.pow(10, Math.floor(Math.log10(x))), f = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < f.length; i++) if (f[i] * p >= x - 1e-9) return f[i] * p;
    return 10 * p;
  }
  function escalaDivergente(dd) {
    var v = dd.filter(U.ok);
    var m = arredondarBonito(v.length ? Math.max.apply(null, v.map(Math.abs)) : 1);
    var e = Math.min(1, m / 20);
    var br = [-m, -3 * m / 4, -m / 2, -m / 4, -e, e, m / 4, m / 2, 3 * m / 4, m];
    var d = m < 5 ? 2 : 1, rot = [];
    for (var j = 0; j < 9; j++) rot.push(U.fmtPP(br[j], d) + ' a ' + U.fmtPP(br[j + 1], d));
    rot[4] = '0 = empate percentual (|A − B| < ' + U.fmtNum(e, d) + ' p.p.)';
    rot[8] += ' · vantagem de A'; rot[0] += ' · vantagem de B';
    return { breaks: br, cores: PALETA_DIV, rotulos: rot, classe: function (x) { return PALETA_DIV[U.intervalo(x, br) - 1]; } };
  }
  function corUnidade(valor, status, esc) {
    var cor = (status === 'OK' && U.ok(valor)) ? (esc ? esc.classe(valor) : '#cccccc') : COR_STATUS[status];
    return { cor: cor || '#cccccc', opac: status === 'OK' ? 0.85 : (status === 'FORA_CIRC' ? 0.25 : 0.6) };
  }
  function raio(v, vmax, rmax) {
    rmax = rmax || 24;
    return (U.ok(v) && v > 0 && vmax > 0) ? 2 + rmax * Math.sqrt(v / vmax) : 0;
  }
  function classesBivariadas(pa, pb) {
    var cl = pa.map(function () { return null; });
    var ok = pa.map(function (x, i) { return U.ok(x) && U.ok(pb[i]); });
    var xa = pa.filter(function (x, i) { return ok[i]; }), xb = pb.filter(function (x, i) { return ok[i]; });
    if (xa.length < 6) return { classe: cl, qa: null, qb: null };
    var pr = [0, 1 / 3, 2 / 3, 1];
    var qa = U.unicos(U.quantis(xa, pr)), qb = U.unicos(U.quantis(xb, pr));
    pa.forEach(function (x, i) {
      if (!ok[i]) return;
      var ta = Math.min(U.intervalo(x, qa), 3), tb = Math.min(U.intervalo(pb[i], qb), 3);
      cl[i] = (tb - 1) * 3 + ta;
    });
    return { classe: cl, qa: qa, qb: qb };
  }

  // ---- correlações (aba Dispersão; descritivas, sem p-valor) ---------------------------------
  function correlacoes(linhas, minAptos) {
    minAptos = minAptos || 0;
    var s = linhas.filter(function (r) { return U.ok(r.PCT_A) && U.ok(r.PCT_B) && U.ok(r.APTOS) && r.APTOS >= minAptos; });
    var x = s.map(function (r) { return r.PCT_A; }), y = s.map(function (r) { return r.PCT_B; });
    var w = s.map(function (r) { return r.APTOS; }), m = s.map(function (r) { return r.CD_MUN_TSE; });
    var nada = { N: x.length, PEARSON_POND: NaN, SPEARMAN: NaN, DENTRO_MUN: NaN };
    if (x.length < 5 || U.dp(x) === 0 || U.dp(y) === 0) return nada;
    var dentro = NaN;
    if (U.unicos(m).length > 1) {
      var sw = {}, sx = {}, sy = {};
      m.forEach(function (k, i) { sw[k] = (sw[k] || 0) + w[i]; sx[k] = (sx[k] || 0) + x[i] * w[i]; sy[k] = (sy[k] || 0) + y[i] * w[i]; });
      var ca = x.map(function (v, i) { return v - sx[m[i]] / sw[m[i]]; });
      var cb = y.map(function (v, i) { return v - sy[m[i]] / sw[m[i]]; });
      if (U.dp(ca) > 0 && U.dp(cb) > 0) dentro = U.corPond(ca, cb, w);
    }
    return { N: x.length, PEARSON_POND: U.corPond(x, y, w), SPEARMAN: U.spearman(x, y), DENTRO_MUN: dentro };
  }

  MV.calc = {
    FAMILIA: FAMILIA, STATUS_ROTULOS: STATUS_ROTULOS, COR_A: COR_A, COR_B: COR_B, PALETA_SEQ: PALETA_SEQ,
    PALETA_DIV: PALETA_DIV, PALETA_BIV: PALETA_BIV, COR_STATUS: COR_STATUS,
    medida: medida, descreverSelecao: descreverSelecao, candidatosDe: candidatosDe, indicadorLocal: indicadorLocal,
    montarTabela: montarTabela, escalaSequencial: escalaSequencial, escalaDivergente: escalaDivergente,
    arredondarBonito: arredondarBonito, corUnidade: corUnidade, raio: raio, classesBivariadas: classesBivariadas,
    correlacoes: correlacoes
  };
})(window.MV = window.MV || {});
