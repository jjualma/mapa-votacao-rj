# =============================================================================
# testar_local.R — abre o site estático no navegador, a partir do seu computador
# -----------------------------------------------------------------------------
# No RStudio, com este repositório como diretório de trabalho:
#   source("R/testar_local.R")
# Abre http://127.0.0.1:8000 . Para parar: botão vermelho "Stop" do Console (ou Esc).
# (Abrir docs/index.html com dois cliques NÃO funciona: o navegador bloqueia a
#  leitura dos arquivos de dados por file://. Por isso o servidor local.)
# =============================================================================
if (!requireNamespace("httpuv", quietly = TRUE) || utils::packageVersion("httpuv") < "1.6.9")
  install.packages("httpuv")
stopifnot(file.exists("docs/index.html"))
message("Abrindo http://127.0.0.1:8000  —  para parar, clique em Stop no Console.")
httpuv::runStaticServer("docs", host = "127.0.0.1", port = 8000, browse = TRUE)
