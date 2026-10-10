# =============================================================================
# exportar_estatico.R — gera os dados da versão estática (pasta docs/dados/)
# -----------------------------------------------------------------------------
# Lê as bases já processadas do projeto Shiny (pasta app/dados/ do projeto
# mapa_votacao_rj) e grava arquivos JSON/GeoJSON compactos que o navegador lê
# diretamente. Nenhum cálculo novo é feito aqui: os números são os mesmos do app.
#
# USO (no RStudio, com este repositório aberto como diretório de trabalho):
#   ORIGEM <- "C:/Projetos/.../mapa_votacao_rj/projeto/app/dados"   # ajuste
#   source("R/exportar_estatico.R")
# Requer: jsonlite, sf, data.table, markdown
# =============================================================================
suppressPackageStartupMessages({
  library(jsonlite); library(sf); library(data.table)
})
sf::sf_use_s2(FALSE)

if (!exists("ORIGEM")) ORIGEM <- "../projeto/app/dados"
DESTINO <- "docs/dados"
METODOLOGIA_MD <- file.path(dirname(ORIGEM), "metodologia.md")
stopifnot(dir.exists(ORIGEM))
dir.create(DESTINO, recursive = TRUE, showWarnings = FALSE)
unlink(list.files(DESTINO, full.names = TRUE))

r <- function(n) readRDS(file.path(ORIGEM, paste0(n, ".rds")))
grava <- function(x, nome, digits = NA) {
  f <- file.path(DESTINO, nome)
  writeLines(toJSON(x, dataframe = "columns", auto_unbox = TRUE, na = "null", digits = digits), f, useBytes = TRUE)
  message(sprintf("  %-34s %8.1f KB", nome, file.size(f) / 1024))
}
utf8 <- function(x) { x <- enc2utf8(as.character(x)); x }

meta    <- r("metadados")
chaves  <- as.data.table(meta$chaves)
cand    <- as.data.table(r("candidatos"))
loc     <- as.data.table(r("locais_app"))
ind     <- as.data.table(r("indic_local_app"))
vl      <- as.data.table(r("votos_local_app"))
ll      <- as.data.table(r("legenda_local_app"))
uni     <- r("unidades_app")
mun_geo <- r("municipios_app")
mun     <- as.data.table(r("municipios_lista"))

message("Exportando para ", normalizePath(DESTINO))

# ---- 1. Unidades espaciais (GeoJSON, 5 casas decimais ≈ 1 m) -------------------------
uni$i <- seq_len(nrow(uni)) - 1L                       # índice 0-based usado pelo JavaScript
g <- uni[, c("i", "ID_UNIDADE", "NM_UNIDADE", "TIPO_UNIDADE", "CD_MUN_TSE", "CD_MUN_IBGE", "NM_MUN", "LON_C", "LAT_C")]
names(g)[1:9] <- c("i", "id", "nome", "tipo", "mun", "ibge", "nm_mun", "cx", "cy")
g$nome <- utf8(g$nome); g$nm_mun <- utf8(g$nm_mun)
g$cx <- round(g$cx, 5); g$cy <- round(g$cy, 5)
f <- file.path(DESTINO, "unidades.json")      # .json: o GitHub Pages comprime (gzip)
st_write(st_transform(g, 4326), f, driver = "GeoJSON", quiet = TRUE,
         layer_options = c("COORDINATE_PRECISION=5", "RFC7946=YES", "WRITE_NAME=NO"))
message(sprintf("  %-34s %8.1f KB", "unidades.json", file.size(f) / 1024))

# limites municipais: só contorno no mapa, então podem ser mais simplificados (30 m)
m <- mun_geo[, c("CD_MUN_TSE", "NM_MUN", "LON_C", "LAT_C")] |>
  st_transform(31983) |> st_simplify(preserveTopology = TRUE, dTolerance = 30)
names(m)[1:4] <- c("mun", "nome", "cx", "cy"); m$nome <- utf8(m$nome)
f <- file.path(DESTINO, "municipios.json")
st_write(st_transform(m, 4326), f, driver = "GeoJSON", quiet = TRUE,
         layer_options = c("COORDINATE_PRECISION=5", "RFC7946=YES", "WRITE_NAME=NO"))
message(sprintf("  %-34s %8.1f KB", "municipios.json", file.size(f) / 1024))

# ---- 2. Locais de votação (colunas; índice = IDX − 1) -----------------------------------
setorder(loc, IDX)
stopifnot(identical(loc$IDX, seq_len(nrow(loc))))
grava(list(
  ano = loc$ANO, mun = loc$CD_MUN_TSE, zona = loc$NR_ZONA, local = loc$NR_LOCAL_VOTACAO,
  nome = utf8(loc$NM_LOCAL_VOTACAO), metodo = loc$METODO,
  unidade = ifelse(is.na(loc$ID_UNIDADE), -1L, match(loc$ID_UNIDADE, uni$ID_UNIDADE) - 1L)
), "locais.json")

# ---- 3. Candidaturas ------------------------------------------------------------------
setorder(cand, ANO, TURNO, CD_CARGO, -VOTOS_NOMINAIS_VALIDOS)
grava(list(
  ano = cand$ANO, turno = cand$TURNO, cargo = cand$CD_CARGO, sq = cand$SQ_CANDIDATO,
  nr = cand$NR_CANDIDATO, nome = utf8(cand$NM_URNA_CANDIDATO), partido = utf8(cand$SG_PARTIDO),
  nr_partido = cand$NR_PARTIDO, ue = cand$SG_UE, votos = cand$VOTOS_NOMINAIS_VALIDOS
), "candidatos.json")

# ---- 4. Por eleição (ano × turno × cargo): indicadores, votos, legenda ------------------
# Votos: organizados por candidatura; os locais vêm em diferenças (delta) para encolher o arquivo.
compacta <- function(d, chave) {
  d <- d[order(get(chave), IDX)]
  d[, D := c(IDX[1] - 1L, diff(IDX)), by = chave]       # 1º = índice 0-based; depois, diferenças
  cont <- d[, .N, by = chave]
  list(k = cont[[chave]], n = cont$N, l = d$D, v = as.integer(d$VOTOS))
}
for (i in seq_len(nrow(chaves))) {
  k <- chaves[i]; tag <- sprintf("%d_%d_%d", k$ANO, k$TURNO, k$CD_CARGO)
  x <- ind[ANO == k$ANO & TURNO == k$TURNO & CD_CARGO == k$CD_CARGO][order(IDX)]
  grava(list(i = x$IDX - 1L, aptos = x$APTOS, comp = x$COMPARECIMENTO, abst = x$ABSTENCOES,
             nom = x$NOMINAIS_VALIDOS, leg = x$LEGENDA, br = x$BRANCOS, nu = x$NULOS,
             sub = x$SUBJUDICE, tot = x$TOTAL_VOTOS, nsec = x$N_SECOES), sprintf("indic_%s.json", tag))
  grava(compacta(vl[ANO == k$ANO & TURNO == k$TURNO & CD_CARGO == k$CD_CARGO], "SQ_CANDIDATO"),
        sprintf("votos_%s.json", tag))
  lg <- ll[ANO == k$ANO & TURNO == k$TURNO & CD_CARGO == k$CD_CARGO]
  if (nrow(lg)) grava(compacta(lg, "NR_PARTIDO"), sprintf("legenda_%s.json", tag))
}

# ---- 5. Metadados, municípios e tabelas de controle ---------------------------------------
inv <- as.data.table(meta$inventario)
grava(list(
  gerado_em = format(Sys.time(), "%Y-%m-%d %H:%M"),
  data_bweb = inv$dt_geracao[grepl("^bweb", inv$tipo)][1],
  chaves = lapply(seq_len(nrow(chaves)), function(i) list(
    ano = chaves$ANO[i], turno = chaves$TURNO[i], cargo = chaves$CD_CARGO[i], ds = utf8(chaves$DS_CARGO[i]),
    proporcional = chaves$PROPORCIONAL[i], escopo = chaves$ESCOPO[i],
    tem_legenda = file.exists(file.path(DESTINO, sprintf("legenda_%d_%d_%d.json", chaves$ANO[i], chaves$TURNO[i], chaves$CD_CARGO[i]))))),
  municipios = list(tse = mun$CD_MUN_TSE, ibge = mun$CD_MUN_IBGE, nome = utf8(mun$NM_MUN))
), "meta.json")

tab <- function(x) { x <- as.data.frame(x); for (c in names(x)) if (is.character(x[[c]])) x[[c]] <- utf8(x[[c]]); x }
grava(tab(r("validacao")), "validacao.json")
grava(tab(r("votos_sem_correspondencia")), "sem_correspondencia.json")
grava(tab(r("auditoria_correspondencias")), "auditoria.json")
grava(tab(r("correspondencia_zona_unidade")), "correspondencia.json", digits = 6)

# ---- 6. Metodologia (Markdown → HTML) ------------------------------------------------------
if (file.exists(METODOLOGIA_MD)) {
  html <- markdown::markdownToHTML(METODOLOGIA_MD, fragment.only = TRUE)
  writeLines(enc2utf8(html), file.path(DESTINO, "metodologia.html"), useBytes = TRUE)
  message("  metodologia.html")
}
message("Concluído. Total: ", round(sum(file.size(list.files(DESTINO, full.names = TRUE))) / 1024^2, 1), " MB")
