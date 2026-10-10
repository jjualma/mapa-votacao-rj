// =============================================================================
// dados.js — leitura dos arquivos de docs/dados/ e montagem das estruturas
// -----------------------------------------------------------------------------
// Os arquivos base (meta, locais, candidaturas, unidades) são lidos uma vez.
// Os de cada eleição (indicadores, votos e legenda de um ano × turno × cargo)
// só quando o cargo é escolhido, e ficam em cache.
// As funções "preparar*" não fazem rede: são as mesmas usadas nos testes (Node).
// =============================================================================
(function (MV) {
  'use strict';

  function tag(ano, turno, cargo) { return ano + '_' + turno + '_' + cargo; }

  // ---- estruturas base ------------------------------------------------------------
  function prepararBase(meta, locais, cand, unidades) {
    var D = { meta: meta, cache: {} };

    // municípios: código TSE → { ibge, nome }
    var M = meta.municipios, mun = {};
    for (var i = 0; i < M.tse.length; i++) mun[M.tse[i]] = { ibge: M.ibge[i], nome: M.nome[i] };
    D.mun = mun;
    D.municipiosOrdenados = M.tse.map(function (c) { return { cod: c, nome: mun[c].nome }; })
      .sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });

    // unidades espaciais (propriedades; a geometria fica no próprio GeoJSON)
    D.geo = unidades;
    D.uni = unidades.features.map(function (f) { return f.properties; });

    // locais de votação (vetores; posição = IDX − 1)
    var n = locais.ano.length;
    D.locais = {
      n: n, ano: locais.ano, mun: locais.mun, zona: locais.zona, local: locais.local,
      nome: locais.nome, metodo: locais.metodo, unidade: locais.unidade,
      zonaKey: locais.mun.map(function (m, j) { return m + '-' + locais.zona[j]; })
    };

    // candidaturas
    var c = [];
    for (var j = 0; j < cand.ano.length; j++) {
      c.push({ ano: cand.ano[j], turno: cand.turno[j], cargo: cand.cargo[j], sq: String(cand.sq[j]),
               nr: cand.nr[j], nome: cand.nome[j], partido: cand.partido[j], nrPartido: cand.nr_partido[j],
               ue: String(cand.ue[j]), votos: cand.votos[j] });
    }
    D.candidatos = c;
    D.candPorSq = {};
    c.forEach(function (x) { if (!D.candPorSq[x.sq]) D.candPorSq[x.sq] = x; });
    return D;
  }

  // ---- arquivos de uma eleição ------------------------------------------------------
  // formato compacto {k, n, l, v}: para cada chave k[j] há n[j] registros; l traz o índice
  // do local em diferenças (o 1º é o próprio índice 0-based) e v os votos.
  function descompactar(x) {
    var out = {}, p = 0;
    if (!x) return out;
    for (var j = 0; j < x.k.length; j++) {
      var m = x.n[j], idx = new Int32Array(m), v = new Float64Array(m), cur = 0;
      for (var q = 0; q < m; q++, p++) {
        cur = (q === 0) ? x.l[p] : cur + x.l[p];
        idx[q] = cur; v[q] = x.v[p];
      }
      out[String(x.k[j])] = { idx: idx, v: v };
    }
    return out;
  }
  function prepararEleicao(D, indic, votos, legenda) {
    var n = D.locais.n;
    var col = function () { var a = new Float64Array(n); a.fill(NaN); return a; };
    var I = { tem: new Uint8Array(n), APTOS: col(), COMPARECIMENTO: col(), ABSTENCOES: col(),
              NOMINAIS_VALIDOS: col(), LEGENDA: col(), BRANCOS: col(), NULOS: col(),
              SUBJUDICE: col(), TOTAL_VOTOS: col(), N_SECOES: col() };
    var mapa = { aptos: 'APTOS', comp: 'COMPARECIMENTO', abst: 'ABSTENCOES', nom: 'NOMINAIS_VALIDOS',
                 leg: 'LEGENDA', br: 'BRANCOS', nu: 'NULOS', sub: 'SUBJUDICE', tot: 'TOTAL_VOTOS', nsec: 'N_SECOES' };
    for (var r = 0; r < indic.i.length; r++) {
      var i = indic.i[r];
      I.tem[i] = 1;
      for (var k in mapa) { var val = indic[k][r]; I[mapa[k]][i] = (val === null || val === undefined) ? NaN : val; }
    }
    return { indic: I, votos: descompactar(votos), legenda: descompactar(legenda) };
  }

  // ---- rede (navegador) ---------------------------------------------------------------
  var BASE = 'dados/';
  function json(nome) {
    return fetch(BASE + nome, { cache: 'default' }).then(function (r) {
      if (!r.ok) throw new Error('Falha ao ler ' + nome + ' (HTTP ' + r.status + ')');
      return r.json();
    });
  }
  function texto(nome) {
    return fetch(BASE + nome).then(function (r) { if (!r.ok) throw new Error(nome); return r.text(); });
  }
  function carregarBase() {
    return Promise.all([json('meta.json'), json('locais.json'), json('candidatos.json'), json('unidades.json')])
      .then(function (r) { return prepararBase(r[0], r[1], r[2], r[3]); });
  }
  function infoChave(D, ano, turno, cargo) {
    return D.meta.chaves.filter(function (k) { return k.ano == ano && k.turno == turno && k.cargo == cargo; })[0] || null;
  }
  function carregarEleicao(D, ano, turno, cargo) {
    var t = tag(ano, turno, cargo);
    if (D.cache[t]) return D.cache[t];
    var k = infoChave(D, ano, turno, cargo);
    var p = Promise.all([json('indic_' + t + '.json'), json('votos_' + t + '.json'),
                         k && k.tem_legenda ? json('legenda_' + t + '.json') : Promise.resolve(null)])
      .then(function (r) { var e = prepararEleicao(D, r[0], r[1], r[2]); D.cache[t] = Promise.resolve(e); D.pronto = D.pronto || {}; D.pronto[t] = e; return e; });
    p.catch(function () { delete D.cache[t]; });
    D.cache[t] = p;
    return p;
  }

  MV.dados = { tag: tag, prepararBase: prepararBase, prepararEleicao: prepararEleicao, descompactar: descompactar,
               json: json, texto: texto, carregarBase: carregarBase, carregarEleicao: carregarEleicao, infoChave: infoChave };
})(window.MV = window.MV || {});
