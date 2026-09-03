# Crônicas da Ressonância — Ficha Digital v1.0 Alpha

Primeira versão pública de testes da ficha digital de **Crônicas da Ressonância**.

## Recursos atuais

- Crônicas: Escudo local por senha com Caçadores e Combates. Prepare e salve a composição no Escudo, inicie na aba Confrontos e encerre sem excluir os dados (banco v6).
- Ficha: composição original, com histórico recolhível e destino explícito por Crônica dentro do Rolador Rápido, sem aba Dados.
- Fluxo atual e testes: [Combates](tests/COMBATES-FLOW.md). Infraestrutura e limites de segurança: [Crônicas v6](tests/CHRONICLES-V6.md).

- Funciona no computador e no celular.
- Salvamento automático no navegador.
- Exportação e importação da ficha em JSON.
- Foto do personagem.
- Controle de PV, PN, PS, Defesa e PV temporários.
- Ajustes rápidos de recursos.
- Distribuição inicial de atributos: todos começam em 1 e possuem 1 ponto adicional no nível 1.
- Cálculo automático de PV, PN e PS máximos para:
  - Vanguarda
  - Atirador
  - Arcano
  - Guardião
- Subir de nível altera apenas os valores máximos; os valores atuais são preservados.
- Habilidade inicial automática ao selecionar a classe:
  - Vanguarda: Postura de Combate
  - Atirador: Mira Precisa
  - Arcano: Canalização Arcana
  - Guardião: Pulso Restaurador
- Equipamentos, habilidades de classe e Manifestações editáveis.

## Entrada principal e organização

O site é aberto pelo **`index.html` na raiz**, servido por HTTP/HTTPS.
As páginas dentro de `tests/` são checkpoints isolados, não versões alternativas do site.

```text
projeto/
  index.html
  README.md
  script.js
  style.css
  js/
    chronicles-storage.js
    confrontations.js
    master-shield.js
    world-map/
      world-map.js
      world-map-scene.js
      world-map-controls.js
      world-map-data.js
      world-map-regions.js
      world-map-atlas.js
  css/
    world-map.css
  assets/
    world-map/nexara.png
    world-map/nexara-regions.json
  vendor/
    three-0.185.1/  (módulos, licença e documentação)
  tests/
    README.md
    elenco-v1.html / elenco-v1.js
    participantes-v1.html / participantes-v1.js
    confrontos-v1.html / confrontos-v1.js
    escudo-v1.html / escudo-v1.js
    world-map-v1.html / world-map-v1.js
    world-map-v2.html / world-map-v2.js
    world-map-scene-checkpoint.html / world-map-scene-checkpoint.js
```

Não é necessário build nem instalação de dependências. No VS Code, abra **esta
pasta como raiz do projeto** e escolha **Open with Live Server** no `index.html`
da raiz. Não abra a pasta `tests/` como raiz do servidor. Preserve a estrutura
das subpastas ao copiar/publicar; os caminhos são relativos e também permitem
servir o projeto em um subdiretório.

Esta organização não altera chaves de armazenamento, banco, schema ou dados.
Mantenha o mesmo endereço/porta do servidor usado normalmente (veja o aviso de
origem abaixo).

## Publicação no GitHub Pages

Publique `index.html`, `style.css`, `script.js`, `README.md` e as pastas `js/`,
`css/`, `assets/` e `vendor/`, preservando os caminhos acima. `tests/` é opcional
na publicação; para executá-lo localmente, mantenha-o junto da raiz completa.

Depois, em **Settings → Pages**, selecione a branch `main` e a pasta `/(root)`.

## Versão portátil

A documentação anterior mencionava `ficha-cronicas-v0.3-pre-alpha-portatil.html`,
mas esse arquivo **não está presente nesta pasta**. A entrada desta versão é
somente o `index.html` da raiz, via HTTP/HTTPS. Nenhuma versão portátil foi
criada, movida ou removida nesta organização.

## Armazenamento de personagens em preparação

A versão 0.4 inclui a camada interna inicial do futuro gerenciador de múltiplos personagens. Ela usa um índice versionado e uma chave separada para cada ficha:

- `cronicasRessonanciaCharacterManagerV4`
- `cronicasRessonanciaCharacterV4:<id>`

O índice guarda somente nome, nível, data de atualização e uma miniatura JPEG reduzida da foto. A imagem original permanece apenas dentro da ficha individual.

Ao encontrar uma ficha na chave `cronicasRessonanciaFichaV3PreAlpha`, a aplicação valida e copia o personagem para a estrutura V4. O registro individual é gravado e verificado antes da conclusão do índice. A chave V3 original permanece intacta como cópia de recuperação.

Depois da migração, o salvamento automático passa a gravar o registro V4 individual que estiver aberto, enquanto a chave V3 permanece preservada como cópia de recuperação. A lógica interna conclui salvamentos pendentes antes de abrir ou fechar outro registro. A criação de novos personagens ainda não está disponível.

Ao abrir a aplicação, o gerenciador apresenta os registros V4 em uma galeria de retratos. Cada cartão mostra somente miniatura, nome e nível e abre sua ficha individual. A ação “Voltar aos personagens” conclui o salvamento, atualiza o resumo e retorna à galeria. “Criar novo personagem” gera e verifica uma ficha V4 vazia antes de abri-la. A importação pelo menu valida arquivos 0.3, mostra uma prévia e adiciona o conteúdo como outro registro, sem substituir personagens existentes.

O botão de opções de cada cartão permite exportar seu JSON 0.3 sem abrir a ficha ou iniciar uma exclusão individual protegida por confirmação. A exclusão pode preparar um backup antes da remoção ou exigir uma confirmação adicional quando realizada sem backup. Dentro da ficha, “Excluir personagem” utiliza o mesmo fluxo e retorna ao menu após a conclusão.

## Aviso

Esta é uma versão **Alpha**. Recursos, regras, textos e aparência ainda podem mudar após os testes com jogadores.

## Mapa do Mundo — terreno topográfico 3D

**Removido da aplicação principal.** A aba, o painel e o carregamento foram retirados de `index.html`/`script.js`. Os módulos, artes e checkpoints abaixo são históricos e permanecem apenas como arquivos de segurança, sem carregar no site. Testes antigos que procuram o painel na aplicação principal não se aplicam mais.

A versão atual usa relevo físico dirigido pelas referências de maquete: sete
continentes, oceano contínuo e materiais próprios, sem nomes/ornamentos na superfície.
O PNG oficial e a geografia canônica permanecem intactos para referência e fallback.

Documentação atual, assets necessários, geração e testes: [Terreno topográfico](tests/TOPOGRAPHY.md).
Além dos arquivos da V2, publique a receita, o manifesto e os três buffers
`assets/world-map/nexara-terrain-*.bin`. Não é necessário build para abrir o site.

### Histórico técnico da fundação V1/V2

As descrições abaixo de textura oficial aplicada, lâminas de altura constante e
orçamento do atlas 2.5D documentam a fundação anterior. Foram substituídas no modo
3D pelo terreno descrito acima; continuam válidas as orientações de HTTP/origem,
navegação e preservação dos dados.

Sirva a pasta completa por HTTP/HTTPS (por exemplo, `python -m http.server 8000`
para uso local). ES Modules e a textura não devem ser abertos diretamente por
`file://`.

### Se a ficha abre, mas o Mapa não inicia

Confira o endereço do navegador. Abrir `index.html` com duplo clique usa `file://`:
os scripts clássicos da ficha podem funcionar, mas o navegador bloqueia a
importação de módulos do mapa por segurança de origem. Não é falha do Three.js,
da imagem ou da câmera. Não desative a segurança do navegador para contornar isso.

Na pasta do projeto, com Python disponível, execute:

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

Mantenha o servidor aberto e acesse `http://127.0.0.1:8000/index.html` no navegador.
Para encerrar o servidor, use Ctrl+C no terminal. Um servidor local já utilizado
no projeto também serve; mantenha seu endereço e porta habituais.

**Atenção aos dados:** armazenamento do navegador é separado por origem.
`file://`, `http://localhost:8000` e `http://127.0.0.1:8000` não devem ser tratados
como o mesmo armazenamento. Dados existentes não são apagados, porém não são
transferidos automaticamente. Esta correção não migra fichas, Crônicas ou capas.
Evite trocar de endereço/porta durante o uso normal e não limpe os dados antigos.

Se houver falha mesmo em HTTP, o Console agora preserva a exceção original com o
prefixo `[Mapa do Mundo] Falha na inicialização:`. A mensagem visual não substitui
esse diagnóstico. Para regressão, abra o `index.html` real, além dos harnesses:
Personagens → Crônicas → Mapa → Explorar → Voltar → sair e entrar novamente.

Inclua também na publicação:

- `js/world-map/` (os seis módulos) e `css/world-map.css`;
- `assets/world-map/nexara.png` e `nexara-regions.json`;
- `vendor/three-0.185.1/` (os dois módulos e a licença).

Three.js **0.185.1**, fixado e distribuído localmente, carrega apenas ao entrar no
mapa. Sem dependência de CDN, framework, build, novas stores ou persistência do mapa.
A arte oficial foi copiada sem edição: PNG **1536 × 1024**, horizontal **3:2**,
3.431.270 bytes; SHA-256 `0f75364cc64290184ef3a20b424744488b0816fcecd4df97315e14533596fc3a`.
Plano de 6 × 4 unidades, tampo de 6,44 × 4,44 (pequena margem em todos os lados).
O mapa não recebe névoa nem tone mapping; a iluminação atua na mesa e no chão.

Fluxo: `INACTIVE → LOADING → ENTRY_READY → ENTERING → TABLE_VIEW →
TRANSITION_TO_MAP → MAP_EXPLORE → TRANSITION_TO_TABLE → TABLE_VIEW`.
Falhas usam `FALLBACK_2D` ou `ERROR` (arte indisponível, com nova tentativa).
`ENTRY_READY` concentra o disparo da entrada automática; uma futura entrada por
clique pode trocar esse disparo sem reescrever a cena.

Entrada de aproximadamente 1 s; exploração em 1,25 s; retorno em 1,1 s.
A perspectiva chega perpendicular ao mapa antes de uma ponte contínua de projeção
para a ortográfica. A ponte considera também os continentes elevados, não apenas
os quatro cantos no plano-base. O retorno usa a mesma correspondência inversa.
Com movimento reduzido, os três deslocamentos são imediatos.

Na exploração: arrastar para pan, roda/pinch para zoom (1–3× do enquadramento),
sem rotação. Teclado no mapa: setas, `+`, `-`, `Home`, `Escape`; os botões HTML
oferecem Explorar, Voltar, Ampliar, Reduzir e Enquadrar. Gestos ficam na área do mapa.
Clique/toque ou os sete botões Continentes chamam a mesma seleção. `CONTINENT_SELECTED`
é um estado formal; Voltar ao mapa/Enquadrar/Escape desfazem a seleção, sem voltar
à mesa. Foco automático deriva dos limites geométricos e cede a pan/zoom manual.
Nada é persistido. O fallback SVG usa a mesma imagem, contornos e transformações.

Renderização sob demanda, DPR máximo 1,5 e uma sombra de 1024². Cena invisível
é pausada; saída descarta geometrias, materiais, texturas, sombras, contexto e
observadores. Retorno pelo cache de navegação recria o ambiente. Não há loop
ocioso, partículas, pós-processamento, reflexos ou animação ambiental.

### Fonte geográfica única

`nexara-regions.json` referencia a arte de 1536 × 1024, com coordenadas normalizadas
de origem superior esquerda. São sete IDs, 30 partes/ilhas e 755 vértices de contorno.
Os buracos permanecem no plano oceânico. A vetorização inicial foi manual a partir
da arte, sem classificação por cor; não substitui uma revisão geográfica autoral.
Cada região contém observações `review` sobre aproximações conservadoras.

A mesma fonte alimenta topos, laterais, o recorte geométrico da base, contornos de
destaque, hit test, bounding boxes e SVG. Os topos usam a textura oficial compartilhada
e UVs correspondentes. Elevação de .024 em um mapa de 6 × 4 unidades; laterais finas,
sem relevo. A base é triangulada excluindo as áreas dos continentes: não existe um
PNG completo sob as costas elevadas. A imagem original permanece intacta.

Revisar manualmente a transição Eldria/Kaerys, o nordeste de Núrikan, a aproximação
Valkor/Sonkor e a associação das ilhas a leste/sudeste de Elaris. Trechos ambíguos e
ilhas menores não identificáveis permanecem na arte plana, sem fronteiras inventadas.
Os contornos foram simplificados; não são um levantamento costeiro pixel a pixel.
Partes sobrepostas são rejeitadas para proteger a triangulação. Falha do JSON mantém
a arte plana utilizável e informa que os continentes estão indisponíveis nesta visita.

Testes e limitações estão em `tests/README.md`. A nitidez de grandes ampliações
fica limitada ao arquivo oficial de 1536 × 1024; esta prova não acrescenta detalhe
à arte. Calibração artística final e testes em aparelhos físicos continuam úteis.
