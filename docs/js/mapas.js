// =============================================================================
// mapas.js — os três mapas Leaflet (A, B e C)
// -----------------------------------------------------------------------------
// * A geometria é lida uma única vez; os polígonos são criados uma vez por mapa
//   (B e C reaproveitam as coordenadas de A) e depois só mudam de cor.
// * Desenho em <canvas>: rápido mesmo com ~1.600 polígonos por mapa.
// * Os três mapas andam juntos (mesma extensão, zoom e projeção).
// * Unidades fora do município escolhido saem do mapa; nada é recalculado aqui.
// =============================================================================
(function (MV) {
  'use strict';
  var LIMITES_RJ = [[-23.4, -44.9], [-20.75, -40.9]];
  var ESTILO_BORDA = { color: '#ffffff', weight: 0.6, opacity: 0.9 };
  var ESTILO_DESTAQUE = { color: '#222222', weight: 2.5, opacity: 1 };
  var LETRAS = ['A', 'B', 'C'];

  var M = {};            // letra → { map, camadas[], grupo, circulos, rotBairros, legenda, legStatus, linha[] }
  var sincronizando = false;
  var estado = { visivel: null, porUI: null, tooltip: null, destacarFrente: true, mun: null };

  function fundo(map) {
    var cfg = MV.config || {};
    if (cfg.CARTO_CHAVE) {
      L.tileLayer('https://basemaps.cartocdn.com/rastertiles/' + (cfg.CARTO_ESTILO || 'light_nolabels') +
                  '/{z}/{x}/{y}.png?key=' + encodeURIComponent(cfg.CARTO_CHAVE),
        { maxZoom: 20, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>' }).addTo(map);
    } else {
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',
        { maxZoom: 19, opacity: 0.45, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    }
  }

  function controleHTML(posicao, classe) {
    var C = L.Control.extend({
      options: { position: posicao },
      onAdd: function () { var d = L.DomUtil.create('div', classe); L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d); return d; }
    });
    return new C();
  }
  function botaoLegenda(map) {
    var C = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var b = L.DomUtil.create('button', 'btn-legenda');
        b.type = 'button'; b.title = 'Mostrar/ocultar legenda'; b.textContent = 'Legenda';
        L.DomEvent.disableClickPropagation(b);
        L.DomEvent.on(b, 'click', function () { map.getContainer().classList.toggle('sem-legenda'); });
        return b;
      }
    });
    map.addControl(new C());
    if (window.innerWidth < 768) map.getContainer().classList.add('sem-legenda');
  }

  function sincronizar(origem) {
    origem.on('move', function () {
      if (sincronizando) return;
      sincronizando = true;
      try {
        LETRAS.forEach(function (l) {
          var m = M[l] && M[l].map;
          if (m && m !== origem) m.setView(origem.getCenter(), origem.getZoom(), { animate: false });
        });
      } finally { sincronizando = false; }
    });
  }

  // coordenadas → LatLng (Polygon, MultiPolygon e, por segurança, GeometryCollection de polígonos)
  function latlngs(g) {
    if (!g) return [];
    if (g.type === 'Polygon') return L.GeoJSON.coordsToLatLngs(g.coordinates, 1);
    if (g.type === 'MultiPolygon') return L.GeoJSON.coordsToLatLngs(g.coordinates, 2);
    if (g.type === 'GeometryCollection') {
      var partes = [];
      (g.geometries || []).forEach(function (x) {
        var p = latlngs(x);
        if (!p.length) return;
        if (x.type === 'Polygon') partes.push(p); else if (x.type === 'MultiPolygon') partes = partes.concat(p);
      });
      return partes;
    }
    return [];
  }

  // ------------------------------------------------------------------ criação ---
  function iniciar(D) {
    var geoA = null;
    LETRAS.forEach(function (l) {
      var map = L.map('map' + l, { preferCanvas: true, zoomSnap: 0.25, zoomDelta: 0.5, minZoom: 6, maxZoom: 18 });
      map.fitBounds(LIMITES_RJ);
      fundo(map);
      ['limites', 'circulos', 'rotulos'].forEach(function (p, k) {
        var pane = map.createPane(p);
        pane.style.zIndex = 420 + k * 10;
        pane.style.pointerEvents = 'none';           // só os polígonos respondem ao mouse
      });
      var rend = L.canvas({ padding: 0.3, tolerance: 0 });
      var reg = { map: map, camadas: new Array(D.uni.length), rend: rend,
                  circulos: L.layerGroup().addTo(map),
                  rendCirc: L.canvas({ pane: 'circulos', padding: 0.3 }),
                  rotBairros: L.layerGroup().addTo(map), rotMun: L.layerGroup(),
                  legenda: controleHTML('bottomright', 'legenda-mapa'), legStatus: controleHTML('bottomleft', 'legenda-mapa') };
      reg.grupo = L.featureGroup().addTo(map);

      D.geo.features.forEach(function (f, i) {
        var ll = geoA ? geoA[i].getLatLngs() : latlngs(f.geometry);
        var p = L.polygon(ll, { renderer: rend, fillColor: '#eeeeee', fillOpacity: 0.7, color: '#ffffff', weight: 0.6, opacity: 0.9 });
        p._ui = i;
        p.bindTooltip(function (lyr) { return estado.tooltip ? estado.tooltip(estado.porUI && estado.porUI[lyr._ui], l) : ''; },
                      { sticky: true, direction: 'auto', className: 'tt-unidade' });
        p.on('mouseover', function () { this.setStyle(ESTILO_DESTAQUE); if (estado.destacarFrente) this.bringToFront(); });
        p.on('mouseout', function () { this.setStyle(ESTILO_BORDA); });
        reg.camadas[i] = p;
        reg.grupo.addLayer(p);
      });
      if (!geoA) geoA = reg.camadas;

      map.addControl(reg.legenda); map.addControl(reg.legStatus);
      botaoLegenda(map);
      map.on('zoomend moveend', function () { rotulos(l); });
      M[l] = reg;
      sincronizar(map);
    });
    // a sincronização começa já com os três na mesma vista
    LETRAS.forEach(function (l) { M[l].map.fitBounds(LIMITES_RJ); });
  }

  // limites e nomes dos municípios (carregados depois, sem travar a abertura)
  function adicionarMunicipios(geo) {
    LETRAS.forEach(function (l) {
      var reg = M[l];
      L.geoJSON(geo, { pane: 'limites', interactive: false,
        style: { color: '#555', weight: 0.9, opacity: 0.8, fill: false },
        renderer: L.canvas({ pane: 'limites' }) }).addTo(reg.map);
      geo.features.forEach(function (f) {
        var p = f.properties;
        if (p.cx === null || p.cy === null) return;
        reg.rotMun.addLayer(L.marker([p.cy, p.cx], { pane: 'rotulos', interactive: false, keyboard: false,
          icon: L.divIcon({ className: 'rotulo-mun', html: '<span>' + MV.util.esc(p.nome) + '</span>', iconSize: [0, 0] }) }));
      });
      rotulos(l);
    });
  }

  // rótulos: municípios entre os zooms 9 e 12; bairros a partir do 12 (só os que estão na tela)
  function rotulos(l) {
    var reg = M[l]; if (!reg) return;
    var map = reg.map, z = map.getZoom();
    var mostrarMun = z >= 9 && z <= 12;
    if (mostrarMun && !map.hasLayer(reg.rotMun)) map.addLayer(reg.rotMun);
    if (!mostrarMun && map.hasLayer(reg.rotMun)) map.removeLayer(reg.rotMun);
    reg.rotBairros.clearLayers();
    if (z < 12 || !estado.visivel) return;
    var b = map.getBounds().pad(0.1), D = MV.app && MV.app.D;
    if (!D) return;
    for (var i = 0; i < D.uni.length; i++) {
      var u = D.uni[i];
      if (u.tipo !== 'BAIRRO' || !estado.visivel[i] || u.cx === null) continue;
      if (!b.contains([u.cy, u.cx])) continue;
      reg.rotBairros.addLayer(L.marker([u.cy, u.cx], { pane: 'rotulos', interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'rotulo-bairro', html: '<span>' + MV.util.esc(u.nome) + '</span>', iconSize: [0, 0] }) }));
    }
  }

  // ---------------------------------------------------------------- atualização ---
  // p = { visivel: Uint8Array(nUni), porUI: [linha|null], tooltip: fn(linha, letra),
  //       A|B|C: { cor: [], opac: [] } (por índice de unidade), circ: { A|B|C: { r: [], cor: []|string } },
  //       legendas: { A|B|C: { br: html, bl: html } }, enquadrar: bool, destacarFrente: bool }
  function atualizar(p) {
    estado.visivel = p.visivel; estado.porUI = p.porUI; estado.tooltip = p.tooltip;
    estado.destacarFrente = p.destacarFrente !== false;
    var D = MV.app.D;
    LETRAS.forEach(function (l) {
      var reg = M[l], e = p[l]; if (!reg || !e) return;
      for (var i = 0; i < reg.camadas.length; i++) {
        var c = reg.camadas[i], dentro = !!p.visivel[i];
        if (!dentro) { if (reg.grupo.hasLayer(c)) reg.grupo.removeLayer(c); continue; }
        if (!reg.grupo.hasLayer(c)) reg.grupo.addLayer(c);
        c.setStyle({ fillColor: e.cor[i], fillOpacity: e.opac[i] });
      }
      // círculos proporcionais (modo número absoluto)
      reg.circulos.clearLayers();
      var ci = p.circ && p.circ[l];
      if (ci) {
        for (var j = 0; j < D.uni.length; j++) {
          var r = ci.r[j];
          if (!p.visivel[j] || !(r > 0) || D.uni[j].cx === null) continue;
          reg.circulos.addLayer(L.circleMarker([D.uni[j].cy, D.uni[j].cx], {
            renderer: reg.rendCirc, pane: 'circulos', interactive: false, radius: r,
            color: '#fff', weight: 0.8, fillColor: typeof ci.cor === 'string' ? ci.cor : ci.cor[j], fillOpacity: 0.75 }));
        }
      }
      var lg = (p.legendas && p.legendas[l]) || {};
      var cBR = reg.legenda.getContainer(), cBL = reg.legStatus.getContainer();
      cBR.innerHTML = lg.br || ''; cBR.style.display = lg.br ? '' : 'none';
      cBL.innerHTML = lg.bl || ''; cBL.style.display = lg.bl ? '' : 'none';
    });
    if (p.enquadrar) enquadrar();
    LETRAS.forEach(rotulos);
  }

  function enquadrar() {
    var reg = M.A; if (!reg) return;
    var b = null;
    reg.camadas.forEach(function (c, i) {
      if (!estado.visivel[i]) return;
      b = b ? b.extend(c.getBounds()) : L.latLngBounds(c.getBounds().getSouthWest(), c.getBounds().getNorthEast());
    });
    if (b && b.isValid()) reg.map.fitBounds(b, { padding: [8, 8] });   // B e C acompanham (sincronização)
  }

  function invalidar() {
    LETRAS.forEach(function (l) { if (M[l]) M[l].map.invalidateSize(false); });
  }

  MV.mapas = { iniciar: iniciar, adicionarMunicipios: adicionarMunicipios, atualizar: atualizar, invalidar: invalidar,
               enquadrar: enquadrar, _M: M };
})(window.MV = window.MV || {});
