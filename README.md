# Mapa de Votação RJ — versão estática

Distribuição territorial dos votos no estado do Rio de Janeiro, por **bairro**, comparando dois
indicadores (A e B: partido, candidatura, abstenção, brancos ou nulos) em três mapas:
**A**, **B** e **C** (diferença em pontos percentuais ou, quando A e B têm denominadores
diferentes, mapa bivariado por tercis). Inclui as abas *Dispersão A × B*, *Tabela analítica* e
*Metodologia* (texto, controle de qualidade e correspondência zona × bairro).

É a mesma análise do app Shiny do projeto, mas **sem servidor**: os dados já processados ficam em
arquivos JSON e todo o cálculo roda no navegador. Por isso abre rápido e pode ser hospedado de
graça no **GitHub Pages**.

## Estrutura

```
mapa-votacao-rj-estatico/
├── docs/                      ← o site (é esta pasta que o GitHub Pages publica)
│   ├── index.html
│   ├── css/estilo.css
│   ├── js/
│   │   ├── config.js          ← mapa de fundo (chave CARTO opcional)
│   │   ├── util.js            ← formatação, quantis, pretty(), correlações, paletas
│   │   ├── dados.js           ← leitura dos JSON (cada cargo só quando é escolhido)
│   │   ├── calc.js            ← indicadores, tabela, escalas (tradução de analitica.R/mapas.R)
│   │   ├── mapas.js           ← os três mapas Leaflet sincronizados
│   │   ├── app.js             ← filtros, estado, títulos, legendas, tooltips
│   │   ├── abas.js            ← dispersão, tabela analítica, metodologia
│   │   └── tabelas.js         ← tabelas com busca, ordenação e páginas
│   ├── vendor/leaflet/        ← Leaflet 1.9.4 (local, sem depender de CDN)
│   └── dados/                 ← dados exportados do projeto Shiny (JSON / GeoJSON)
├── R/
│   ├── exportar_estatico.R    ← regenera docs/dados a partir do projeto Shiny
│   └── testar_local.R         ← abre o site em http://127.0.0.1:8000
└── testes/
    ├── gerar_referencia.R     ← calcula cenários no R (app Shiny)
    └── testar_calculos.js     ← confere se o JavaScript dá exatamente o mesmo resultado
```

## Fontes

- **Votos:** boletins de urna do TSE (`bweb_1t_RJ_051020261403`, gerados em 05/10/2026 14:03),
  agregados por local de votação; nomes de candidaturas de `votacao_candidato_munzona_2026_RJ`
  e (Presidente) `votacao_secao_2026_BR`; locais de votação de `eleitorado_local_votacao_2026_RJ`.
- **Geografia:** IBGE — malha de bairros do Censo 2022 e Malha Municipal Digital 2025.
- Detalhes, conciliações e limitações: aba **Metodologia** do site e README do projeto Shiny.

## Metodologia (resumo)

- **Sem rateio:** seção → local de votação (onde a urna funcionou) → bairro onde está o local.
  Cada voto é contado uma única vez. A zona eleitoral é só informação descritiva.
- **Percentual** = soma dos numeradores ÷ soma dos denominadores da unidade (nunca média de percentuais).
  Denominadores: partido/candidatura → votos nominais válidos (+ legenda, se marcado, só nos cargos
  proporcionais); abstenção → eleitores aptos; brancos/nulos → total de votos do cargo.
- **Mapa C:** `%A − %B` em pontos percentuais quando A e B têm o mesmo denominador; caso contrário,
  classes bivariadas (tercis do recorte).
- **Ausências não viram zero:** cada unidade recebe um status (sem local de votação, denominador zero,
  fora da circunscrição, sem seleção), com cor e legenda próprias.
- **Unidades:** 1.509 bairros (31 municípios) + 28 áreas fora dos bairros oficiais + 61 municípios
  sem bairros na malha = 1.598 unidades. 3 locais de votação sem correspondência geográfica (36.684
  votos, todos os cargos) ficam fora do mapa, mas entram nos totais (“… em locais fora do mapa”).

## Testar no seu computador

Abrir `docs/index.html` com dois cliques **não funciona** (o navegador bloqueia a leitura dos
arquivos de dados por `file://`). Use um servidor local — no RStudio, abra
`mapa-votacao-rj-estatico.Rproj` e rode:

```r
source("R/testar_local.R")   # abre http://127.0.0.1:8000 ; Stop no Console para parar
```

## Atualizar os dados

Depois de rodar o pipeline do projeto Shiny (que gera `app/dados/*.rds`):

```r
ORIGEM <- "C:/caminho/para/mapa_votacao_rj/projeto/app/dados"   # ajuste
source("R/exportar_estatico.R")                                    # reescreve docs/dados/
```

Pacotes: `jsonlite`, `sf`, `data.table`, `markdown`, `httpuv`. Depois, faça commit e push: o
GitHub Pages republica sozinho em 1–2 minutos.

## Conferência dos cálculos

Os cálculos do JavaScript foram conferidos contra o app R em 9 cenários (candidatura × candidatura,
partido × partido com e sem legenda, candidatura × abstenção, brancos × nulos, Presidente, sem seleção…),
nos 4 níveis (local, bairro, zona, município), incluindo totais, status, escalas, cores e correlações:
**864.209 comparações, 0 diferenças**. Para repetir (requer R e Node.js):

```bash
Rscript testes/gerar_referencia.R ../projeto/app referencia.json
node testes/testar_calculos.js referencia.json
```

## Mapa de fundo

Sem configuração, o fundo é o OpenStreetMap (esmaecido). Para usar o CARTO Positron como no app
Shiny, coloque a chave em `docs/js/config.js` (`CARTO_CHAVE`). **Atenção:** o repositório é público e a
chave ficará visível; no painel da CARTO, restrinja-a ao domínio `SEU-USUARIO.github.io`.

## Leitura correta

Os mapas descrevem a **distribuição territorial dos votos** segundo a unidade espacial e a regra de
agregação adotadas; não indicam que um partido ou candidatura “domina” um território. O voto é
atribuído ao bairro do local de votação, não ao de residência do eleitor. Associações entre
territórios (aba Dispersão) não permitem conclusões sobre eleitores individuais (falácia ecológica).
