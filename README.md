# Capas Brasil — deploy em ~5 minutos

Endpoint que gera a capa dinamica (poster -> blur/escurecimento -> logo BRASIL)
para um item da sua lista do MDBList, trocando automaticamente todo dia.

## 1) Deploy

```
npm i -g vercel
cd covers-brasil
vercel login
vercel
```

Aceite as opcoes padrao. Isso cria o projeto (deploy de preview).

## 2) Configurar as chaves (nunca no codigo)

```
vercel env add TMDB_APIKEY
vercel env add MDBLIST_APIKEY
```

Cole a chave quando pedir, escolha "Production, Preview, Development".

IMPORTANTE: gere uma chave nova do MDBList antes disso — a que voce colou
no chat deve ser trocada (Settings > API Key no mdblist.com).

## 3) Deploy de producao

```
vercel --prod
```

Vai te dar uma URL tipo `https://covers-brasil-xxxx.vercel.app`.

## 4) A URL que voce cola no bingecat / Fusion

```
https://covers-brasil-xxxx.vercel.app/api/cover?username=webstuff-tuta-com&list=brazil-movies
```

Troque `username` e `list` para qualquer outra lista publica do MDBList que
voce quiser usar em outros catalogos/pastas — o mesmo endpoint serve todas,
so muda a query string.

## Como funciona a atualizacao

Nao tem estado salvo nem cron: a cada request, o item exibido e escolhido
por `dia do ano % total de itens da lista` — ou seja, muda uma vez por dia,
sozinho, sem voce precisar rodar nada. O cache de 6h (`Cache-Control`) evita
gerar a imagem toda hora que alguem abrir o app.
