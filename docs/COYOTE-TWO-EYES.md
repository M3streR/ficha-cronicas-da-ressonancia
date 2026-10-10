# Dois olhos de Coyote — implementação local

Desenvolvimento em `codex/coyote-two-eyes`, baseado no commit local `e546b15`
da Geração de Ouro sem controles de rodada. Publicação conjunta autorizada
em 10/10/2026, sem mudanças de banco.

## Acesso portátil

Após a correção aprovada em 10/10/2026, o recurso acompanha `coyoteEyes` no JSON.
Exportar, importar em outro navegador e duplicar preservam o acesso, sem vínculo
a uma conta específica ou ao `localId` do navegador. A autoridade normal de
edição e as permissões Online continuam obrigatórias para qualquer alteração.

JSONs anteriores sem `coyoteEyes` são reconhecidos pela correspondência integral
das três Manifestações originais, preparando o recurso uma única vez sem alterar
os registros. Apenas nome, Classe ou Assinatura não concedem o recurso a uma
ficha comum. Não há substituições de código ou Auth no servidor de testes.

Na preparação inicial, o registro exato de Solidão será
identificado pela correspondência integral dos campos fornecidos e receberá
um identificador estável. A identificação não usa apenas seu nome. Se esse
registro estiver duplicado, a
preparação falha preservando os dados e requer confirmação do registro atual.
Depois disso, renomear ou editar Solidão não remove sua restrição.

## Dados e alternância

`manifestations` conserva o conjunto Direito. O bloco opcional `coyoteEyes`
contém versão 1, `unlocked`, `activeEye`, `firstRevealSeen`,
`blockedRightRecordId` e `confidentManifestations`. Somente o conjunto visível
é capturado. Os registros iniciais do Esquerdo são preparados uma única vez
na ficha compatível, sem revelar interface antes do desbloqueio.
Excluir todos os registros não os recria. Não há limite novo de três.

Sequência: ArrowLeft, ArrowRight, KeyC, KeyO, KeyY, fora de campos editáveis
e diálogos, sem modificadores/repetição, com expiração de tentativa.
A primeira utilização revela o Esquerdo; as seguintes alternam os conjuntos.
Nenhum PN é debitado pela troca. O uso normal e o Aprimoramento continuam
exigindo autorização, confirmação e PN suficiente.

Solidão não apresenta configuração ou uso de Aprimoramento, inclusive após
renomeação. Os demais registros mantêm configurações manuais independentes.
Nenhuma regra é deduzida das descrições para definir aprimoramentos.

A troca usa a autoridade existente e um salvamento Local protegido. Em falha,
os conjuntos e o olho anterior são restaurados. Uma confirmação vinculada a
um card removido não pode descontar PN. A sequência é ignorada em modais.

## Persistência e cópias

Os dois conjuntos integram exportação/importação, backups, snapshot, digest,
CAS e reconciliação existentes. Notes e foto original permanecem Locais.
O identificador dos registros é preservado na captura e importação.

Cópias e importações conservam ambos os conjuntos, o olho ativo, o desbloqueio
e a restrição de Solidão. A mesma sequência permite alternar nas cópias, inclusive
em outro navegador e sem login no modo Local. Uma aba observadora continua sem
permissão de escrita; Online continua usando a fila, CAS e RLS existentes.

Os conjuntos ocultos não são confidenciais para participantes autorizados a
ler o snapshot. Esse comportamento foi aprovado. O código secreto não é um
mecanismo de segurança contra adulteração deliberada do cliente.

## Revisão local

Execute `node --test tests/coyote-eyes.test.cjs` e
`node tests/coyote-eyes-ui.test.cjs`, com Playwright/Chromium disponíveis.
O segundo comando cria fichas de teste, exercita a sequência e fecha seu
servidor ao terminar. Capturas Alpha/douradas ficam em
`tests/artifacts/coyote-eyes/`, sem entrar nos commits.

Para testar manualmente, abra o Coyote, uma duplicata ou uma importação do seu
JSON e use a sequência fora de campos editáveis e diálogos na aba editora.
O arquivo JSON original não foi alterado e não integra a publicação. A fixture
é um personagem sintético, contendo apenas as definições de Manifestações
necessárias aos testes, sem dados da ficha pessoal, foto ou equipamentos.

Não há migration, alteração de schemaVersion, RPC, RLS, Storage ou novo
processo de Realtime. A infraestrutura existente continua responsável por
conflitos, offline, recuperação e autoridade entre abas.

## Validação executada

67 testes de módulos/modelos aprovados, incluindo persistência Online por
CAS, conflito com backup dos dois conjuntos e reconciliação por Realtime
simulado. Nenhuma escrita foi executada no Supabase real.

As 14 suítes de navegador do fluxo de CI passaram localmente: Coyote,
Geração de Ouro, Encantamentos, Crônicas v6, Combates, Rolagens Livres, UX,
Perícias, estados críticos, conflitos, autoridade entre abas, auditoria
visual, conteúdo dinâmico e camadas. O teste do Coyote cobre 60 combinações
de largura/zoom nas aparências Alpha e dourada. A auditoria geral registrou
120 telas sem overflow; os 300 estados dinâmicos não apresentaram overflow,
rolagem aninhada ou rodapé inacessível. Não houve exceções inesperadas nas
páginas de teste.

O teste de navegador também exporta e importa em um contexto independente,
sem login, confirmando alternância e restauração dos dois conjuntos. Um
personagem comum chamado Coyote continua sem acesso. Nenhum dado real é alterado.
