# brick-rebuild

Site pessoal e simples: busque um conjunto de LEGO® (número, nome ou ID de elemento), veja o inventário,
separe o que dá para **imprimir em 3D** do que é melhor **comprar**, baixe os STL e a lista de compras.
Projeto independente, sem vínculo com a LEGO nem com o BrickaLike.

## Requisitos
Node.js 22.13 ou mais novo (usa `node:sqlite`, sem banco externo).

## Instalação
```bash
npm install
npm run import:rebrickable   # baixa os CSVs do Rebrickable e monta data/brick.db
npm run import:ldraw         # baixa a biblioteca de peças LDraw (formas 3D)
npm start                    # http://127.0.0.1:3000
```
Se o download automático falhar (rede/URL mudou), baixe os arquivos à mão:
- Rebrickable: https://rebrickable.com/downloads/ → `npm run import:rebrickable -- --from <pasta>` (aceita `.csv` e `.csv.gz`)
- LDraw: https://www.ldraw.org/parts/latest-parts.html (complete.zip) → `npm run import:ldraw -- --zip complete.zip`

Variáveis: `PORT` (3000), `HOST` (127.0.0.1; só use 0.0.0.0 se souber o que está fazendo), `DATA_DIR` (./data).

## O que faz
- Busca por número (`10294`), nome/tema (sem acento) e ID de elemento (mostra peça, cor e conjuntos).
- Inventário do conjunto (versão mais recente, sem sobressalentes) com cada peça classificada em
  **Imprimir**, **Imprimir com ressalvas** ou **Comprar**, sempre com o motivo.
- STL por peça e `.zip` do conjunto. Por padrão, as peças de cada cor são agrupadas em **placas de impressão**
  (`placas/<Cor>/placa-01.stl`, na quantidade certa, para o tamanho de mesa escolhido: 180/220/256/350 mm).
  Alternativa: um arquivo por peça (`pecas/<Cor>/PECA-xQTD.stl`). `conteudo-dos-arquivos.csv` diz o que há em cada placa.
- CSV de compras, CSV completo e CSV no formato Rebrickable (`Part,Color,Quantity`).

## Como a classificação funciona
1. Regras por categoria/nome: transparente, decorada, borracha/tecido, minifigura, eletrônica, fina, vidro,
   placa-base → comprar. Engrenagens, eixos/pinos, dobradiças/clipes → ressalvas. Blocos, placas, tiles,
   inclinados, vigas Technic etc. → imprimir. O que não está em nenhuma lista → comprar.
2. Refinamento pela forma real (STL gerado do LDraw): sem arquivo de forma → comprar; maior lado > 240 mm
   → comprar; menor lado < 1 mm → comprar.
3. Peças transparentes/decoradas com forma disponível aparecem como "dá para tentar imprimir".

## Qualidade da malha (aviso do fatiador)
Os pinos do LDraw são cilindros sem fundo, o que deixava a malha com arestas abertas (ex.: 224 no tijolo 2x4)
e o fatiador avisava de erro. O conversor agora fecha esses furos planos; nas peças reais testadas (3001, 3003,
3023, 3069b) a contagem caiu para 0 arestas abertas e 0 não-manifold. Isso foi medido por um verificador próprio,
**não** em um fatiador de verdade: se ainda aparecer aviso, anote a mensagem exata (e a peça).
O empacotamento em placas não usa rotação e não aplica suportes nem ajuste de tolerância.

## Limites (leia)
- **Não verificado com os downloads reais.** Este código foi desenvolvido sem acesso ao Rebrickable e ao
  servidor do LDraw. Os importadores mapeiam colunas pelo nome do cabeçalho (nomes escritos de memória) e
  param com mensagem clara se algo não bater; a URL do zip do LDraw também é uma suposição. Os testes usam
  dados sintéticos; o conversor foi conferido com peças LDraw reais (3001, 3003, 3023, 3069b).
- Sem ajuste de tolerância: imprima um tijolo e uma placa de teste antes de imprimir tudo.
- O inventário do Rebrickable não inclui peças de minifigura (o site mostra "listadas X de Y").
- Assume que o número da peça no Rebrickable = nome do arquivo no LDraw; quando não existe, cai em "Comprar".
- Sem exportação para lista de desejos do BrickLink (XML): os CSVs do Rebrickable não trazem o mapeamento
  de cores/peças do BrickLink, então um XML correto não é possível só com esses dados.
- Sem preços, fornecedores, identificação por foto ou visualização 3D.

## Testes
```bash
npm test
LDRAW_TEST_DIR=/caminho/para/ldraw npm test   # opcional: valida com peças LDraw reais (pasta com parts/ e p/)
```

## Créditos e licenças
- Dados de conjuntos e peças: [Rebrickable](https://rebrickable.com) — confira os termos de uso dos dados.
- Formas: [LDraw Parts Library](https://www.ldraw.org), **CC BY 4.0** — os STL derivam dela; mantenha a atribuição
  (o `.zip` já inclui um `LEIA-ME.txt` com isso).
- LEGO® é marca do Grupo LEGO, que não patrocina este projeto.
- A licença do **seu** código fica a seu critério: adicione um arquivo `LICENSE`.
