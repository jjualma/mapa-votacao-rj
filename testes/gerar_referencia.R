# Gera resultados de referência no R (app Shiny) para comparar com o JavaScript
# Uso: Rscript testes/gerar_referencia.R <pasta app do projeto Shiny> <saida.json>
args <- commandArgs(TRUE)
APP <- args[1]; SAIDA <- normalizePath(args[2], mustWork = FALSE)
suppressPackageStartupMessages({ library(sf); library(jsonlite) })
owd <- setwd(APP)
source("R/analitica.R"); source("R/mapas.R")
D <- carregar_dados_app("dados")
setwd(owd)
cand <- D$candidatos
top <- function(cargo, k) { c0 <- cand[cand$CD_CARGO == cargo, ]; c0 <- c0[order(-c0$VOTOS_NOMINAIS_VALIDOS), ]; c0[k, ] }
toppart <- function(cargo, mun = "TODOS") {
  c0 <- cand[cand$CD_CARGO == cargo, ]
  if (mun != "TODOS") c0 <- c0[c0$SG_UE %in% c(mun, "RJ", "BR"), ]
  s <- sort(tapply(c0$VOTOS_NOMINAIS_VALIDOS, c0$SG_PARTIDO, sum), decreasing = TRUE); names(s)
}
S <- function(tipo, partido = "", sq = "") list(tipo = tipo, partido = partido, sq = as.character(sq))
p7 <- toppart(7, "60011"); p6 <- toppart(6)
cen <- list(
  list(nome = "gov_cand_x_cand", cargo = 3, mun = "TODOS", A = S("candidatura", sq = top(3, 1)$SQ_CANDIDATO), B = S("candidatura", sq = top(3, 2)$SQ_CANDIDATO), leg = FALSE),
  list(nome = "depest_partido_rio", cargo = 7, mun = "60011", A = S("partido", p7[1]), B = S("partido", p7[2]), leg = FALSE),
  list(nome = "depest_partido_rio_leg", cargo = 7, mun = "60011", A = S("partido", p7[1]), B = S("partido", p7[2]), leg = TRUE),
  list(nome = "gov_cand_x_abst", cargo = 3, mun = "TODOS", A = S("candidatura", sq = top(3, 1)$SQ_CANDIDATO), B = S("abstencao"), leg = FALSE),
  list(nome = "sen_brancos_nulos_angra", cargo = 5, mun = "58017", A = S("brancos"), B = S("nulos"), leg = FALSE),
  list(nome = "pres_partido_x_cand", cargo = 1, mun = "TODOS", A = S("partido", toppart(1)[1]), B = S("candidatura", sq = top(1, 2)$SQ_CANDIDATO), leg = FALSE),
  list(nome = "depfed_cand_x_partido_leg", cargo = 6, mun = "TODOS", A = S("candidatura", sq = top(6, 1)$SQ_CANDIDATO), B = S("partido", p6[3]), leg = TRUE),
  list(nome = "sem_selecao", cargo = 3, mun = "58017", A = S("partido", ""), B = S(""), leg = FALSE),
  list(nome = "abst_x_nulos_niteroi", cargo = 6, mun = "58653", A = S("abstencao"), B = S("nulos"), leg = TRUE)
)
cols <- c("KEY","NOME","TIPO_UNIDADE","CD_MUN_TSE","NM_MUN","ZONAS","N_LOCAIS","NUM_A","DEN_A","NUM_B","DEN_B",
          "VOTOS_VALIDOS","APTOS","COMPARECIMENTO","ABSTENCOES","BRANCOS","NULOS","TOTAL_VOTOS",
          "STATUS_A","STATUS_B","PCT_A","PCT_B","DIFERENCA_PP","DIFERENCA_ABS","PCT_ABST","PCT_BRANCOS","PCT_NULOS")
out <- lapply(cen, function(c) {
  prop <- isTRUE(D$meta$chaves$PROPORCIONAL[D$meta$chaves$CD_CARGO == c$cargo][1])
  niveis <- lapply(c("unidade", "local", "zona", "municipio"), function(nv) {
    t <- montar_tabela(D, 2026L, 1L, c$cargo, c$mun, c$A, c$B, c$leg, nv)
    r <- list(tabela = as.list(as.data.frame(t)[, cols]), totais = lapply(attr(t, "totais"), as.list),
              mesma = attr(t, "mesma_familia"), cor = as.list(correlacoes(t, 500)), cor0 = as.list(correlacoes(t, 0)))
    if (nv == "unidade") {
      mm <- attr(t, "mesma_familia")
      if (mm) { e <- escala_sequencial(c(t$PCT_A[t$STATUS_A == "OK"], t$PCT_B[t$STATUS_B == "OK"]), "quantis")
        ei <- escala_sequencial(c(t$PCT_A[t$STATUS_A == "OK"], t$PCT_B[t$STATUS_B == "OK"]), "iguais")
        ed <- escala_divergente(t$DIFERENCA_PP)
        r$escala <- list(br = e$breaks, cores = e$cores, rot = e$rotulos, corA = e$classe(t$PCT_A[t$STATUS_A == "OK"]))
        r$escala_iguais <- list(br = ei$breaks, cores = ei$cores, rot = ei$rotulos)
        r$div <- list(br = ed$breaks, rot = ed$rotulos, cor = ed$classe(t$DIFERENCA_PP[is.finite(t$DIFERENCA_PP)]))
      } else { b <- classes_bivariadas(t$PCT_A, t$PCT_B); r$biv <- list(classe = b$classe, qa = b$qa, qb = b$qb)
        e <- escala_sequencial(t$PCT_B[t$STATUS_B == "OK"], "quantis"); r$escalaB <- list(br = e$breaks, rot = e$rotulos) }
    }
    r
  })
  names(niveis) <- c("unidade", "local", "zona", "municipio")
  dA <- descrever_selecao(c$A, D$candidatos, c$leg, prop); dB <- descrever_selecao(c$B, D$candidatos, c$leg, prop)
  list(nome = c$nome, cargo = c$cargo, mun = c$mun, A = c$A, B = c$B, leg = c$leg, niveis = niveis,
       descA = dA[c("tipo","rotulo","curto","medida")], descB = dB[c("tipo","rotulo","curto","medida")])
})
writeLines(toJSON(out, auto_unbox = TRUE, digits = NA, na = "null"), SAIDA)
message("ok: ", SAIDA)
