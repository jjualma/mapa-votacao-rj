// =============================================================================
// app.js — estado da página, filtros e montagem dos três mapas
// -----------------------------------------------------------------------------
// Fluxo: filtros → montarTabela() (calc.js, ~milissegundos) → cores/legendas →
// mapas.atualizar(). Nada é enviado a servidor: tudo roda no navegador.
// O estado fica no endereço da página (#...), então um link reproduz a seleção.
// =============================================================================
(function (MV) {
  'use strict';
  var U = MV.util, C = MV.calc;
  var $ = function (id) { return document.getElementById(id); };
  var TIPOS = [['partido', 'Partido'], ['candidatura', 'Candidatura'], ['abstencao', 'Abstenção'], ['brancos', 'Brancos'], ['nulos', 'Nulos']];
  var TIPOS_UNI = { BAIRRO: 'bairro', AREA_FORA_BAIRROS: 'área fora dos bairros oficiais', MUNICIPIO: 'município sem bairros na malha IBGE',
                    local: 'local de votação', zona: 'zona eleitoral', municipio: 'município' };
  var NIVEIS = ['baixo', 'médio', 'alto'];

  var D = null;
  var S = {                                  // estado da página
    ano: null, turno: null, cargo: null, mun: 'TODOS', exibicao: 'pct', metodo: 'quantis', legenda: false,
    A: { tipo: 'partido', partido: null, sq: null, busca: '' },
    B: { tipo: 'partido', partido: null, sq: null, busca: '' },
    aba: 'mapas'
  };
  var R = null;                              // último resultado (tabela + descrições)
  var munDesenhado = null;

  // ------------------------------------------------------------- utilidades ---
  function opcoes(sel, lista, valor) {         // lista: [[valor, rótulo], ...]
    sel.innerHTML = lista.map(function (o) {
      return '<option value="' + U.esc(o[0]) + '"' + (String(o[0]) === String(valor) ? ' selected' : '') + '>' + U.esc(o[1]) + '</option>';
    }).join('');
    if (valor !== undefined && valor !== null) sel.value = String(valor);
  }
  function carregando(txt) {
    var c = $('carregando');
    if (txt === false) { c.hidden = true; return; }
    $('carregando-txt').textContent = txt || 'Carregando dados…'; c.hidden = false;
  }
  function erro(msg) { var e = $('erro'); e.hidden = false; e.innerHTML = msg; carregando(false); }
  function info() { return MV.dados.infoChave(D, S.ano, S.turno, S.cargo); }
  function proporcional() { var k = info(); return !!(k && k.proporcional); }
  function usaLegenda() { return proporcional() && S.legenda; }
  function nomeMun(cod) { return D.mun[cod] ? D.mun[cod].nome : cod; }

  // ---------------------------------------------------------- endereço (#) ---
  function lerHash() {
    var h = {}; (location.hash || '').replace(/^#/, '').split('&').forEach(function (p) {
      if (!p) return; var kv = p.split('='); h[decodeURIComponent(kv[0])] = decodeURIComponent(kv.slice(1).join('=') || '');
    });
    return h;
  }
  function gravarHash() {
    var p = { ano: S.ano, turno: S.turno, cargo: S.cargo, mun: S.mun, exib: S.exibicao, int: S.metodo, leg: S.legenda ? 1 : 0,
              ta: S.A.tipo, pa: S.A.partido || '', ca: S.A.sq || '', tb: S.B.tipo, pb: S.B.partido || '', cb: S.B.sq || '', aba: S.aba };
    var h = '#' + Object.keys(p).map(function (k) { return k + '=' + encodeURIComponent(p[k]); }).join('&');
    if (h !== location.hash) { try { history.replaceState(null, '', h); } catch (e) { /* file:// */ } }
  }

  // ------------------------------------------------------------ filtros gerais ---
  function preencherAno() {
    var anos = U.unicos(D.meta.chaves.map(function (k) { return k.ano; })).sort(function (a, b) { return b - a; });
    if (anos.indexOf(+S.ano) < 0) S.ano = anos[0];
    opcoes($('ano'), anos.map(function (a) { return [a, a]; }), S.ano);
  }
  function preencherTurno() {
    var t = U.unicos(D.meta.chaves.filter(function (k) { return k.ano == S.ano; }).map(function (k) { return k.turno; })).sort();
    if (t.indexOf(+S.turno) < 0) S.turno = t[0];
    opcoes($('turno'), t.map(function (x) { return [x, x + 'º']; }), S.turno);
  }
  function preencherCargo() {
    var k = D.meta.chaves.filter(function (x) { return x.ano == S.ano && x.turno == S.turno; });
    var cods = k.map(function (x) { return x.cargo; });
    if (cods.indexOf(+S.cargo) < 0) S.cargo = cods.indexOf(3) >= 0 ? 3 : cods[0];
    opcoes($('cargo'), k.map(function (x) { return [x.cargo, x.ds]; }), S.cargo);
    $('caixa-legenda').hidden = !proporcional();
  }
  function preencherMun() {
    var l = [['TODOS', 'Todos os municípios do RJ']].concat(D.municipiosOrdenados.map(function (m) { return [m.cod, m.nome]; }));
    if (S.mun !== 'TODOS' && !D.mun[S.mun]) S.mun = 'TODOS';
    opcoes($('mun'), l, S.mun);
  }

  // ------------------------------------------------- seletores de A e de B ---
  function candRecorte() {
    var c0 = C.candidatosDe(D, S.ano, S.turno, S.cargo);
    if (S.mun !== 'TODOS') c0 = c0.filter(function (c) { return c.ue === S.mun || c.ue === 'RJ' || c.ue === 'BR'; });
    return c0;
  }
  function partidosRecorte() {
    var s = {}; candRecorte().forEach(function (c) { s[c.partido] = (s[c.partido] || 0) + c.votos; });
    return Object.keys(s).sort(function (a, b) { return s[b] - s[a] || a.localeCompare(b); });
  }
  function montarControles(L) {
    var el = document.querySelector('.controles[data-lado="' + L + '"]');
    el.innerHTML =
      '<div class="linha"><label>Indicador ' + L + '<select id="tipo' + L + '">' +
        TIPOS.map(function (t) { return '<option value="' + t[0] + '">' + t[1] + '</option>'; }).join('') + '</select></label>' +
      '<label id="cx-partido' + L + '">Partido ' + L + '<select id="partido' + L + '"></select></label></div>' +
      '<div class="linha" id="cx-cand' + L + '"><label>Buscar<input type="search" id="busca' + L + '" placeholder="nome ou número"></label>' +
      '<label>Candidatura ' + L + '<select id="cand' + L + '"></select></label></div>' +
      '<span class="badge" id="modo' + L + '"></span>';
    $('tipo' + L).addEventListener('change', function () { S[L].tipo = this.value; listaCand(L); visibilidade(L); agendar(); });
    $('partido' + L).addEventListener('change', function () { S[L].partido = this.value; listaCand(L); agendar(); });
    $('cand' + L).addEventListener('change', function () { S[L].sq = this.value; agendar(); });
    $('busca' + L).addEventListener('input', function () { S[L].busca = this.value; listaCand(L); agendar(); });
  }
  function visibilidade(L) {
    var tp = S[L].tipo;
    $('tipo' + L).value = tp;
    $('cx-partido' + L).style.display = (tp === 'partido' || tp === 'candidatura') ? '' : 'none';
    $('cx-cand' + L).style.display = tp === 'candidatura' ? '' : 'none';
  }
  function listaPartido(L, ordem) {
    var p = partidosRecorte(), atual = S[L].partido;
    if (atual === null || (atual !== '' && p.indexOf(atual) < 0)) atual = p.length >= ordem ? p[ordem - 1] : '';
    S[L].partido = atual;
    opcoes($('partido' + L), [['', '— escolha —']].concat(p.map(function (x) { return [x, x]; })), atual);
  }
  function listaCand(L) {
    var c0 = candRecorte(), p = S[L].partido;
    if (p) c0 = c0.filter(function (c) { return c.partido === p; });
    c0 = c0.slice().sort(function (a, b) { return b.votos - a.votos; });
    var t = (S[L].busca || '').trim().toLowerCase();
    if (t) {
      var sem = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); };
      t = sem(t);
      c0 = c0.filter(function (c) { return sem((c.nome + ' ' + c.nr + ' ' + c.partido).toLowerCase()).indexOf(t) >= 0; });
    }
    var atual = S[L].sq;
    var tem = c0.some(function (c) { return c.sq === atual; });
    if (!tem) atual = c0.length ? c0[0].sq : '';
    S[L].sq = atual;
    opcoes($('cand' + L), [['', c0.length ? '— escolha —' : '(nenhuma candidatura)']].concat(
      c0.map(function (c) { return [c.sq, c.nome + ' — ' + c.partido + ' ' + c.nr]; })), atual);
  }
  function listasLados() {
    listaPartido('A', 1); listaPartido('B', 2);
    listaCand('A'); listaCand('B');
    visibilidade('A'); visibilidade('B');
  }

  // ---------------------------------------------------------------- legendas ---
  function itensLegenda(cores, rotulos) {
    return cores.map(function (c, i) { return '<div class="item"><span class="quad" style="background:' + c + '"></span><span>' + U.esc(rotulos[i]) + '</span></div>'; }).join('');
  }
  function legendaStatus(st) {
    var ordem = ['SEM_LOCAL', 'SEM_DEN', 'FORA_CIRC', 'SEM_MUN_TSE'], tem = {};
    st.forEach(function (s) { tem[s] = 1; });
    var s = ordem.filter(function (x) { return tem[x]; });
    return { cores: s.map(function (x) { return C.COR_STATUS[x]; }), rotulos: s.map(function (x) { return C.STATUS_ROTULOS[x]; }) };
  }
  function legendaBivariada(dA, dB, qa, qb) {
    var linhas = [3, 2, 1].map(function (b) {
      return '<tr>' + [1, 2, 3].map(function (a) { return '<td style="background:' + C.PALETA_BIV[(b - 1) * 3 + a - 1] + '"></td>'; }).join('') + '</tr>';
    }).join('');
    var fx = function (q) { return q ? q.slice(1, -1).map(function (x) { return U.fmtNum(x, 1); }).join(' | ') : ''; };
    return '<div class="leg-biv"><div class="tit">Relação territorial</div><div style="display:flex;align-items:center;gap:6px">' +
      '<div class="eixo-b">B ↑ ' + U.esc(dB.curto) + '</div><table>' + linhas + '</table></div>' +
      '<div class="eixo-a">A → ' + U.esc(dA.curto) + '</div>' +
      '<div class="leg-nota">Tercis do recorte. Cortes de A: ' + fx(qa) + '%; de B: ' + fx(qb) + '%.<br>Associação entre territórios, não entre eleitores.</div></div>';
  }
  function legendaCirculos(titulo, vmax, cor, nota) {
    var ref = [vmax, vmax / 4, vmax / 16];
    return '<div class="tit">' + titulo + '</div>' + ref.map(function (v) {
      var d = 2 * C.raio(v, vmax);
      return '<div class="item" style="align-items:center"><span class="bola" style="width:' + d.toFixed(0) + 'px;height:' + d.toFixed(0) + 'px;background:' + cor + '"></span>' + U.fmtNum(v) + '</div>';
    }).join('') + nota;
  }

  // ----------------------------------------------------------------- tooltip ---
  function tooltip(t, letra) {
    if (!t || !R) return '';
    var dA = R.dA, dB = R.dB;
    var cab = '<b>' + U.esc(t.NOME) + '</b> <span style="color:#666">(' + (TIPOS_UNI[t.TIPO_UNIDADE] || '') + ')</span><br>' +
      'Município: ' + U.esc(t.NM_MUN) + '<br>Zona(s) eleitoral(is): ' + (t.ZONAS ? U.esc(t.ZONAS) : '—') +
      ' · ' + U.fmtNum(t.N_LOCAIS) + ' local(is) de votação';
    var base = 'Aptos: ' + U.fmtNum(t.APTOS) + ' · Comparecimento: ' + U.fmtNum(t.COMPARECIMENTO) + ' · Votos válidos: ' + U.fmtNum(t.VOTOS_VALIDOS) +
      '<br>Abstenção: <b>' + U.fmtPct(t.PCT_ABST, 1) + '</b> · Brancos: <b>' + U.fmtPct(t.PCT_BRANCOS, 1) + '</b> · Nulos: <b>' +
      U.fmtPct(t.PCT_NULOS, 1) + '</b> <span style="color:#777">(brancos e nulos: % dos votos do cargo)</span>';
    var lado = function (L, d, n, den, p, cor) {
      return '<span style="color:' + cor + '">■</span> ' + L + ' — ' + U.esc(d.curto) + ': ' + U.fmtNum(n) + ' ' +
        (d.nome_num || '') + ' de ' + U.fmtNum(den) + ' · <b>' + U.fmtPct(p, 2) + '</b>';
    };
    var la = lado('A', dA, t.NUM_A, t.DEN_A, t.PCT_A, C.COR_A), lb = lado('B', dB, t.NUM_B, t.DEN_B, t.PCT_B, C.COR_B);
    var comp;
    if (R.mesma) {
      comp = U.ok(t.DIFERENCA_PP) ? '<b>A − B = ' + U.fmtPP(t.DIFERENCA_PP, 2) + '</b> (' + (t.DIFERENCA_ABS >= 0 ? '+' : '−') +
        U.fmtNum(Math.abs(t.DIFERENCA_ABS)) + ' em número absoluto)' : 'A − B: não calculável';
    } else {
      var k = t._biv;
      comp = k ? '<b>A ' + NIVEIS[(k - 1) % 3] + ' · B ' + NIVEIS[Math.floor((k - 1) / 3)] + '</b> (tercis do recorte)' : 'Classe bivariada: não calculável';
    }
    var st = (t.STATUS_A === 'OK' && t.STATUS_B === 'OK') ? '' :
      '<br><span class="status-txt">A: ' + C.STATUS_ROTULOS[t.STATUS_A] + '<br>B: ' + C.STATUS_ROTULOS[t.STATUS_B] + '</span>';
    if (letra === 'C') return '<div style="font-size:14px;margin-bottom:4px">' + comp + '</div>' + cab + '<br>' + base + '<br>' + la + '<br>' + lb + st;
    return cab + '<br>' + base + '<br>' + la + '<br>' + lb + '<br>' + comp + st;
  }

  // -------------------------------------------------------------- cálculo ---
  function tabelaNivel(nivel) {
    var E = D.pronto && D.pronto[MV.dados.tag(S.ano, S.turno, S.cargo)];
    return C.montarTabela(D, E, { ano: S.ano, turno: S.turno, cargo: S.cargo, mun: S.mun, selA: S.A, selB: S.B,
                                  legenda: S.legenda, nivel: nivel });
  }

  function recalcular() {
    var T = tabelaNivel('unidade');
    var prop = proporcional();
    var dA = C.descreverSelecao(D, S.A, S.legenda, prop), dB = C.descreverSelecao(D, S.B, S.legenda, prop);
    R = { T: T, dA: dA, dB: dB, mesma: T.mesma };
    var lin = T.linhas, nU = D.uni.length, abs = S.exibicao === 'abs', mm = T.mesma;
    var visivel = new Uint8Array(nU), porUI = new Array(nU);
    lin.forEach(function (r) { visivel[r.UI] = 1; porUI[r.UI] = r; });

    var vazioCor = function () { return { cor: new Array(nU), opac: new Array(nU) }; };
    var est = { A: vazioCor(), B: vazioCor(), C: vazioCor() }, circ = null, leg = { A: {}, B: {}, C: {} };
    var stC = function (r) { return r.STATUS_A !== 'OK' ? r.STATUS_A : r.STATUS_B; };
    var neutro = function (s) { return { cor: s === 'OK' ? '#f3f3f3' : C.COR_STATUS[s], opac: s === 'OK' ? 0.7 : 0.6 }; };
    var por = function (e, i, x) { e.cor[i] = x.cor || '#cccccc'; e.opac[i] = x.opac; };
    var okA = lin.filter(function (r) { return r.STATUS_A === 'OK'; }), okB = lin.filter(function (r) { return r.STATUS_B === 'OK'; });
    var biv = null;
    if (!mm) {
      biv = C.classesBivariadas(lin.map(function (r) { return r.PCT_A; }), lin.map(function (r) { return r.PCT_B; }));
      lin.forEach(function (r, i) { r._biv = biv.classe[i]; });
    }
    var stA = lin.map(function (r) { return r.STATUS_A; }), stB = lin.map(function (r) { return r.STATUS_B; }), stCs = lin.map(stC);

    if (!abs) {
      var eA, eB;
      if (mm) { eA = eB = C.escalaSequencial(okA.map(function (r) { return r.PCT_A; }).concat(okB.map(function (r) { return r.PCT_B; })), S.metodo); }
      else { eA = C.escalaSequencial(okA.map(function (r) { return r.PCT_A; }), S.metodo); eB = C.escalaSequencial(okB.map(function (r) { return r.PCT_B; }), S.metodo); }
      lin.forEach(function (r) { por(est.A, r.UI, C.corUnidade(r.PCT_A, r.STATUS_A, eA)); por(est.B, r.UI, C.corUnidade(r.PCT_B, r.STATUS_B, eB)); });
      [['A', eA, stA], ['B', eB, stB]].forEach(function (x) {
        var ls = legendaStatus(x[2]);
        var tit = mm ? '% — escala comum a A e B' : '% — escala própria';
        leg[x[0]].br = x[1] ? '<div class="tit">' + tit + '</div>' + itensLegenda(x[1].cores, x[1].rotulos) + itensLegenda(ls.cores, ls.rotulos)
                            : (ls.cores.length ? itensLegenda(ls.cores, ls.rotulos) : '');
      });
    } else {
      lin.forEach(function (r) { por(est.A, r.UI, neutro(r.STATUS_A)); por(est.B, r.UI, neutro(r.STATUS_B)); });
      var mx = function (rows, f) { return rows.reduce(function (m, r) { var v = f(r); return U.ok(v) && v > m ? v : m; }, 0); };
      var vmA = mx(okA, function (r) { return r.NUM_A; }), vmB = mx(okB, function (r) { return r.NUM_B; });
      if (mm) vmA = vmB = Math.max(vmA, vmB);
      circ = { A: { r: new Array(nU), cor: C.COR_A }, B: { r: new Array(nU), cor: C.COR_B } };
      lin.forEach(function (r) {
        circ.A.r[r.UI] = C.raio(r.STATUS_A === 'OK' ? r.NUM_A : NaN, vmA);
        circ.B.r[r.UI] = C.raio(r.STATUS_B === 'OK' ? r.NUM_B : NaN, vmB);
      });
      var nota = mm ? '<div class="leg-nota">Mesma escala em A e B</div>' : '<div class="leg-nota">Escala própria</div>';
      leg.A.br = legendaCirculos('Número absoluto', vmA, C.COR_A, nota);
      leg.B.br = legendaCirculos('Número absoluto', vmB, C.COR_B, nota);
      [['A', stA], ['B', stB]].forEach(function (x) { var ls = legendaStatus(x[1]); leg[x[0]].bl = ls.cores.length ? itensLegenda(ls.cores, ls.rotulos) : ''; });
    }
    var lsC = legendaStatus(stCs);
    if (mm && !abs) {
      var eC = C.escalaDivergente(lin.map(function (r) { return r.DIFERENCA_PP; }));
      lin.forEach(function (r) { por(est.C, r.UI, C.corUnidade(r.DIFERENCA_PP, stC(r), eC)); });
      leg.C.br = '<div class="tit">A − B (p.p.)</div>' + itensLegenda(eC.cores.slice().reverse(), eC.rotulos.slice().reverse()) + itensLegenda(lsC.cores, lsC.rotulos);
    } else if (mm && abs) {
      lin.forEach(function (r) { por(est.C, r.UI, neutro(stC(r))); });
      var vm = lin.reduce(function (m, r) { var v = Math.abs(r.DIFERENCA_ABS); return U.ok(v) && v > m ? v : m; }, 0);
      circ.C = { r: new Array(nU), cor: new Array(nU) };
      lin.forEach(function (r) { circ.C.r[r.UI] = C.raio(Math.abs(r.DIFERENCA_ABS), vm); circ.C.cor[r.UI] = r.DIFERENCA_ABS >= 0 ? C.COR_A : C.COR_B; });
      leg.C.br = legendaCirculos('Diferença absoluta A − B', vm, '#999',
        '<div><span style="color:' + C.COR_A + '">●</span> A maior · <span style="color:' + C.COR_B + '">●</span> B maior</div>');
      leg.C.bl = lsC.cores.length ? itensLegenda(lsC.cores, lsC.rotulos) : '';
    } else {
      lin.forEach(function (r) {
        var s = stC(r);
        var cor = (s === 'OK' && r._biv) ? C.PALETA_BIV[r._biv - 1] : (C.COR_STATUS[s] || '#cccccc');
        por(est.C, r.UI, { cor: cor, opac: s === 'OK' ? 0.85 : 0.6 });
      });
      leg.C.br = legendaBivariada(dA, dB, biv.qa, biv.qb);
      leg.C.bl = lsC.cores.length ? itensLegenda(lsC.cores, lsC.rotulos) : '';
    }

    var enquadrar = munDesenhado !== S.mun;
    munDesenhado = S.mun;
    MV.mapas.atualizar({ visivel: visivel, porUI: porUI, tooltip: tooltip, A: est.A, B: est.B, C: est.C, circ: circ,
                         legendas: leg, enquadrar: enquadrar, destacarFrente: !abs });
    textos();
    if (MV.abas) MV.abas.atualizar(S.aba);
    gravarHash();
  }

  // ------------------------------------------------------------------ textos ---
  function textos() {
    var T = R.T, dA = R.dA, dB = R.dB;
    ['A', 'B'].forEach(function (L) {
      var d = L === 'A' ? dA : dB;
      $('titulo' + L).innerHTML = 'Distribuição territorial — <b>' + U.esc(d.rotulo) + '</b><div class="sub">' + U.esc(d.medida) + '</div>';
      var b = $('modo' + L);
      if (!d.tipo) { b.className = 'badge claro'; b.textContent = 'Complete a seleção'; }
      else { b.className = 'badge'; b.textContent = 'Representa: ' + d.tipo; }
      var res = $('resumo' + L);
      if (!d.tipo) { res.innerHTML = ''; return; }
      var n = 0, dd = 0;
      T.linhas.forEach(function (r) { if (r['STATUS_' + L] === 'OK') { n += r['NUM_' + L]; dd += r['DEN_' + L]; } });
      var tt = T.totais[L];
      var onde = S.mun === 'TODOS' ? 'todo o estado' : nomeMun(S.mun);
      var rot = { 'votos': 'Total de votos', 'abstenções': 'Total de abstenções', 'votos brancos': 'Total de votos brancos',
                  'votos nulos': 'Total de votos nulos' }[d.nome_num || 'votos'];
      res.innerHTML = '<div><b>' + rot + ' (' + U.esc(onde) + '):</b> ' + U.fmtNum(tt.num) + ' de ' + U.fmtNum(tt.den) + ' · ' +
        U.fmtPct(tt.den ? 100 * tt.num / tt.den : NaN, 2) +
        (tt.fora > 0 ? ' — <span class="fora">' + U.fmtNum(tt.fora) + ' em locais fora do mapa</span>' : '') + '</div>' +
        '<div>No recorte: ' + U.fmtNum(n) + ' ' + (d.nome_num || '') + ' de ' + U.fmtNum(dd) + ' · ' + U.fmtPct(dd ? 100 * n / dd : NaN, 2) + '</div>';
    });
    if (R.mesma) {
      $('tituloC').innerHTML = 'Diferença percentual — <b>' + U.esc(dA.curto) + '</b> − <b>' + U.esc(dB.curto) + '</b><div class="sub">pontos percentuais</div>';
      $('explicaC').innerHTML = '<b>%A − %B</b> em cada unidade, mesma base de cálculo.<br><span style="color:' + C.COR_A + '">■ positivo: A maior</span> · ' +
        '<span style="color:' + C.COR_B + '">■ negativo: B maior</span> · <b>0 = empate percentual</b>' +
        (S.exibicao === 'abs' ? '<br>Círculos: diferença em número absoluto.' : '');
      var f = T.linhas.filter(function (r) { return U.ok(r.DIFERENCA_PP); });
      $('resumoC').textContent = 'A à frente em ' + f.filter(function (r) { return r.DIFERENCA_PP > 0; }).length +
        ' · B à frente em ' + f.filter(function (r) { return r.DIFERENCA_PP < 0; }).length +
        ' · empate exato em ' + f.filter(function (r) { return r.DIFERENCA_PP === 0; }).length + ' unidades';
    } else {
      $('tituloC').innerHTML = 'Relação territorial — <b>' + U.esc(dA.curto) + '</b> × <b>' + U.esc(dB.curto) + '</b><div class="sub">mapa bivariado (tercis)</div>';
      $('explicaC').innerHTML = 'A e B têm <b>denominadores diferentes</b> (ex.: votos válidos × eleitores aptos), então a subtração não teria significado. ' +
        'O mapa cruza os <b>tercis</b> de A e de B. Associação entre <b>territórios</b>, não entre eleitores — ver aba <i>Dispersão</i>.';
      var cr = C.correlacoes(T.linhas, 0);
      $('resumoC').textContent = 'Correlação ponderada (unidades do recorte, n = ' + cr.N + '): ' + U.fmtNum(cr.PEARSON_POND, 2) + ' · ver aba Dispersão';
    }
    $('aviso').innerHTML = '<b>Valores observados</b> — boletins de urna do TSE (bweb, gerados em ' + U.esc(D.meta.data_bweb || '—') +
      '): cada seção é somada no local de votação onde a urna funcionou e cada local no bairro onde está. <b>Não há rateio.</b> ' +
      (usaLegenda() ? 'Votos de legenda <b>incluídos</b> no denominador e nos partidos.' :
        (proporcional() ? 'Denominador dos votos: <b>nominais válidos</b> (legenda não incluída).' : ''));
  }

  // --------------------------------------------------------------- agenda ---
  var pendente = false;
  function agendar() {
    if (pendente) return;
    pendente = true;
    document.body.classList.add('calculando');
    (window.requestAnimationFrame || setTimeout)(function () {
      setTimeout(function () {
        pendente = false;
        try { recalcular(); } catch (e) { console.error(e); erro('Erro ao calcular: ' + U.esc(e.message)); }
        document.body.classList.remove('calculando');
      }, 0);
    });
  }
  function trocarEleicao() {
    preencherCargo();
    var t = MV.dados.tag(S.ano, S.turno, S.cargo);
    var jaTem = D.pronto && D.pronto[t];
    if (!jaTem) carregando('Carregando votos de ' + (info() ? info().ds : '') + '…');
    return MV.dados.carregarEleicao(D, S.ano, S.turno, S.cargo).then(function () {
      carregando(false);
      listasLados();
      agendar();
    }).catch(function (e) { erro('Não foi possível ler os dados deste cargo: ' + U.esc(e.message)); });
  }

  // ------------------------------------------------------------------- abas ---
  function trocarAba(a) {
    S.aba = a;
    document.querySelectorAll('.aba').forEach(function (b) { b.classList.toggle('ativa', b.getAttribute('data-aba') === a); });
    document.querySelectorAll('.painel-aba').forEach(function (p) { p.hidden = p.id !== 'aba-' + a; });
    if (a === 'mapas') MV.mapas.invalidar();
    if (R && MV.abas) MV.abas.atualizar(a);
    gravarHash();
  }

  // ------------------------------------------------------------------ início ---
  function ligarEventos() {
    $('ano').addEventListener('change', function () { S.ano = +this.value; preencherTurno(); trocarEleicao(); });
    $('turno').addEventListener('change', function () { S.turno = +this.value; trocarEleicao(); });
    $('cargo').addEventListener('change', function () { S.cargo = +this.value; trocarEleicao(); });
    $('mun').addEventListener('change', function () { S.mun = this.value; listasLados(); agendar(); });
    document.querySelectorAll('input[name=exibicao]').forEach(function (r) { r.addEventListener('change', function () { S.exibicao = this.value; agendar(); }); });
    document.querySelectorAll('input[name=metodo]').forEach(function (r) { r.addEventListener('change', function () { S.metodo = this.value; agendar(); }); });
    $('legenda').addEventListener('change', function () { S.legenda = this.checked; agendar(); });
    document.querySelectorAll('.aba').forEach(function (b) { b.addEventListener('click', function () { trocarAba(b.getAttribute('data-aba')); }); });
  }
  function aplicarHash() {
    var h = lerHash();
    if (h.ano) S.ano = +h.ano; if (h.turno) S.turno = +h.turno; if (h.cargo) S.cargo = +h.cargo;
    if (h.mun) S.mun = h.mun;
    if (h.exib === 'abs' || h.exib === 'pct') S.exibicao = h.exib;
    if (h.int === 'iguais' || h.int === 'quantis') S.metodo = h.int;
    S.legenda = h.leg === '1';
    var tipos = TIPOS.map(function (t) { return t[0]; });
    if (tipos.indexOf(h.ta) >= 0) S.A.tipo = h.ta; if (tipos.indexOf(h.tb) >= 0) S.B.tipo = h.tb;
    if ('pa' in h) S.A.partido = h.pa; if ('pb' in h) S.B.partido = h.pb;
    if (h.ca) S.A.sq = h.ca; if (h.cb) S.B.sq = h.cb;
    if (['mapas', 'dispersao', 'tabela', 'metodologia'].indexOf(h.aba) >= 0) S.aba = h.aba;
    document.querySelector('input[name=exibicao][value=' + S.exibicao + ']').checked = true;
    document.querySelector('input[name=metodo][value=' + S.metodo + ']').checked = true;
    $('legenda').checked = S.legenda;
  }

  function iniciar() {
    if (!window.L) { erro('A biblioteca de mapas (Leaflet) não carregou.'); return; }
    if (location.protocol === 'file:') {
      erro('Abra a página por um servidor (ex.: <code>httpuv::runStaticServer("docs")</code> no R) ou pelo GitHub Pages — ' +
           'o navegador não permite ler os arquivos de dados direto do disco (file://).');
      return;
    }
    carregando('Carregando mapa e dados…');
    MV.dados.carregarBase().then(function (base) {
      D = base; MV.app.D = D;
      aplicarHash();
      $('gerado_em').textContent = 'Dados gerados em ' + (D.meta.gerado_em || '—') + '.';
      montarControles('A'); montarControles('B');
      preencherAno(); preencherTurno(); preencherMun();
      ligarEventos();
      MV.mapas.iniciar(D);
      if (S.aba !== 'mapas') trocarAba(S.aba);
      return trocarEleicao();
    }).then(function () {
      // contornos e nomes dos municípios: depois que a página já está utilizável
      MV.dados.json('municipios.json').then(MV.mapas.adicionarMunicipios).catch(function (e) { console.warn('municípios:', e); });
    }).catch(function (e) {
      console.error(e);
      erro('Não foi possível carregar os dados (' + U.esc(e.message) + ').');
    });
  }

  MV.app = { iniciar: iniciar, estado: S, resultado: function () { return R; }, tabelaNivel: tabelaNivel,
             trocarAba: trocarAba, agendar: agendar, nomeMun: nomeMun, recalcular: recalcular };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(window.MV = window.MV || {});
