// =============================================================================
// config.js — mapa de fundo
// -----------------------------------------------------------------------------
// CARTO_CHAVE vazia  → fundo OpenStreetMap (não exige chave), um pouco esmaecido.
// CARTO_CHAVE preenchida → fundo CARTO (Positron sem rótulos), igual ao app Shiny.
//
// ATENÇÃO: este arquivo é PÚBLICO quando o repositório está no GitHub. Uma chave
// colocada aqui fica visível para qualquer pessoa (como em qualquer mapa web).
// Se usar a chave da CARTO, restrinja-a no painel da CARTO ao domínio
// <seu-usuario>.github.io para que não possa ser usada em outros sites.
// =============================================================================
window.MV = window.MV || {};
window.MV.config = {
  CARTO_CHAVE: '',                 // ex.: 'abc123...' (deixe vazio para usar OpenStreetMap)
  CARTO_ESTILO: 'light_nolabels'   // alternativas: 'light_all', 'voyager_nolabels', 'voyager'
};
