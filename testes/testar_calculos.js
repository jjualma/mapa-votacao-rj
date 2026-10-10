// Compara os cálculos do JavaScript (docs/js) com a referência gerada no R.
// Uso: node testes/testar_calculos.js <referencia.json>
'use strict';
const fs = require('fs'), path = require('path');
globalThis.window = globalThis;
const DOCS = path.join(__dirname, '..', 'docs');
['util', 'dados', 'calc'].forEach(f => require(path.join(DOCS, 'js', f + '.js')));
const MV = window.MV;
const ler = f => JSON.parse(fs.readFileSync(path.join(DOCS, 'dados', f), 'utf8'));
const D = MV.dados.prepararBase(ler('meta.json'), ler('locais.json'), ler('candidatos.json'), ler('unidades.json'));
const ref = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
let falhas = 0, verif = 0;
const igual = (a, b) => {
  const na = a === null || a === undefined || (typeof a === 'number' && isNaN(a));
  const nb = b === null || b === undefined || (typeof b === 'number' && isNaN(b));
  if (na || nb) return na && nb;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  return String(a) === String(b);
};
const checa = (ctx, a, b) => { verif++; if (!igual(a, b)) { falhas++; if (!/classe|escala\.cor|div\.cor/.test(ctx) && (globalThis.__m = (globalThis.__m||0)+1) < 60) console.log('  ✗', ctx, '| JS =', a, '| R =', b); } };
const arr = x => x === null || x === undefined || (typeof x === 'object' && !Array.isArray(x) && !Object.keys(x).length) ? [] : (Array.isArray(x) ? x : [x]);

for (const c of ref) {
  const E = MV.dados.prepararEleicao(D, ler(`indic_2026_1_${c.cargo}.json`), ler(`votos_2026_1_${c.cargo}.json`),
    fs.existsSync(path.join(DOCS, 'dados', `legenda_2026_1_${c.cargo}.json`)) ? ler(`legenda_2026_1_${c.cargo}.json`) : null);
  const f0 = falhas;
  for (const nv of Object.keys(c.niveis)) {
    const R = c.niveis[nv];
    const T = MV.calc.montarTabela(D, E, { ano: 2026, turno: 1, cargo: c.cargo, mun: c.mun, selA: c.A, selB: c.B, legenda: c.leg, nivel: nv });
    const keys = arr(R.tabela.KEY);
    checa(`${c.nome}/${nv} nº linhas`, T.linhas.length, keys.length);
    const porKey = {}; T.linhas.forEach(r => porKey[r.KEY] = r);
    for (const col of Object.keys(R.tabela)) {
      const v = arr(R.tabela[col]);
      keys.forEach((k, i) => { const r = porKey[k]; checa(`${c.nome}/${nv} ${k} ${col}`, r ? r[col] : '(ausente)', v[i]); });
    }
    // mesma ordem?
    let ordem = 0; keys.forEach((k, i) => { if (T.linhas[i] && T.linhas[i].KEY !== k) ordem++; });
    if (ordem) console.log(`  (ordem difere em ${ordem} linhas em ${c.nome}/${nv} — só apresentação)`);
    for (const L of ['A', 'B']) for (const q of ['num', 'den', 'fora']) checa(`${c.nome}/${nv} totais ${L}.${q}`, T.totais[L][q], R.totais[L][q]);
    checa(`${c.nome}/${nv} mesma`, T.mesma, R.mesma);
    for (const [nmc, ma] of [['cor', 500], ['cor0', 0]]) {
      const cj = MV.calc.correlacoes(T.linhas, ma);
      for (const q of ['N', 'PEARSON_POND', 'SPEARMAN', 'DENTRO_MUN']) checa(`${c.nome}/${nv} ${nmc}.${q}`, cj[q], R[nmc][q]);
    }
    if (nv === 'unidade') {
      // escalas: a referência usa a ordem do R; recalcula com a mesma ordem
      const lin = keys.map(k => porKey[k]);
      if (R.escala) {
        const v = lin.filter(r => r.STATUS_A === 'OK').map(r => r.PCT_A).concat(lin.filter(r => r.STATUS_B === 'OK').map(r => r.PCT_B));
        const e = MV.calc.escalaSequencial(v, 'quantis');
        arr(R.escala.br).forEach((x, i) => checa(`${c.nome} escala.br[${i}]`, e.breaks[i], x));
        arr(R.escala.cores).forEach((x, i) => checa(`${c.nome} escala.cor[${i}]`, e.cores[i], x));
        arr(R.escala.rot).forEach((x, i) => checa(`${c.nome} escala.rot[${i}]`, e.rotulos[i], x));
        const corA = lin.filter(r => r.STATUS_A === 'OK').map(r => e.classe(r.PCT_A));
        arr(R.escala.corA).forEach((x, i) => checa(`${c.nome} classe A[${i}]`, corA[i], x));
        const ei = MV.calc.escalaSequencial(v, 'iguais');
        arr(R.escala_iguais.br).forEach((x, i) => checa(`${c.nome} iguais.br[${i}]`, ei.breaks[i], x));
        arr(R.escala_iguais.rot).forEach((x, i) => checa(`${c.nome} iguais.rot[${i}]`, ei.rotulos[i], x));
        checa(`${c.nome} iguais.n`, ei.breaks.length, arr(R.escala_iguais.br).length);
        const ed = MV.calc.escalaDivergente(lin.map(r => r.DIFERENCA_PP));
        arr(R.div.br).forEach((x, i) => checa(`${c.nome} div.br[${i}]`, ed.breaks[i], x));
        arr(R.div.rot).forEach((x, i) => checa(`${c.nome} div.rot[${i}]`, ed.rotulos[i], x));
        const cd = lin.filter(r => isFinite(r.DIFERENCA_PP)).map(r => ed.classe(r.DIFERENCA_PP));
        arr(R.div.cor).forEach((x, i) => checa(`${c.nome} div.cor[${i}]`, cd[i], x));
      }
      if (R.biv) {
        const b = MV.calc.classesBivariadas(lin.map(r => r.PCT_A), lin.map(r => r.PCT_B));
        arr(R.biv.classe).forEach((x, i) => checa(`${c.nome} biv[${i}]`, b.classe[i], x));
        arr(R.biv.qa).forEach((x, i) => checa(`${c.nome} qa[${i}]`, b.qa && b.qa[i], x));
        arr(R.biv.qb).forEach((x, i) => checa(`${c.nome} qb[${i}]`, b.qb && b.qb[i], x));
        const e = MV.calc.escalaSequencial(lin.filter(r => r.STATUS_B === 'OK').map(r => r.PCT_B), 'quantis');
        if (R.escalaB) arr(R.escalaB.rot).forEach((x, i) => checa(`${c.nome} escalaB.rot[${i}]`, e && e.rotulos[i], x));
      }
    }
  }
  const info = MV.dados.infoChave(D, 2026, 1, c.cargo);
  for (const L of ['A', 'B']) {
    const d = MV.calc.descreverSelecao(D, c[L], c.leg, info.proporcional);
    for (const q of ['tipo', 'rotulo', 'curto', 'medida']) checa(`${c.nome} desc${L}.${q}`, d[q], c['desc' + L][q]);
  }
  console.log((falhas === f0 ? '✓' : '✗') + ' ' + c.nome + (falhas === f0 ? '' : ` (${falhas - f0} diferenças)`));
}
console.log(`\n${verif} comparações, ${falhas} diferenças`);
process.exit(falhas ? 1 : 0);
