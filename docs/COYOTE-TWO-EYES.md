# Dois olhos de Coyote — implementação local

Desenvolvimento em `codex/coyote-two-eyes`, baseado no commit local `e546b15`
da Geração de Ouro sem controles de rodada. Publicação conjunta autorizada
em 10/10/2026, sem mudanças de banco.

## Vinculação confirmada

`approvedBindings` em `js/coyote-eyes.js` usa o `localId` original e o UUID Auth
confirmados pelo usuário no Console da ficha importada com três Manifestações.
Nome, Classe, Assinatura, JSON importado e um marcador copiado não concedem
elegibilidade. A publicação Online antiga com duas Manifestações não foi vinculada.

O teste de navegador usa uma identidade fictícia, substituindo a vinculação
apenas na resposta do servidor HTTP do próprio teste. Não há botão ou chave de
teste na aplicação. Também verifica que o módulo real recusa uma identidade diferente.

Na identidade original confirmada, o registro exato de Solidão será
identificado pela correspondência integral dos campos fornecidos e receberá
um identificador estável. A identificação não usa apenas seu nome. Se esse
registro tiver sido alterado antes da vinculação, ou estiver duplicado, a
preparação falha preservando os dados e requer confirmação do registro atual.
Depois disso, renomear ou editar Solidão não remove sua restrição.

## Dados e alternância

`manifestations` conserva o conjunto Direito. O bloco opcional `coyoteEyes`
contém versão 1, `unlocked`, `activeEye`, `firstRevealSeen`,
`blockedRightRecordId` e `confidentManifestations`. Somente o conjunto visível
é capturado. Os registros iniciais do Esquerdo são preparados uma única vez
na identidade autorizada, sem revelar interface antes do desbloqueio.
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

Cópias e importações novas conservam ambos os conjuntos, mas exibem o Direito
e não podem alternar porque possuem outra identidade Local. O estado gravado
do Esquerdo continua preservado, sem se tornar autorização. Restaurar na
identidade original recupera a funcionalidade mediante a conta proprietária.

Os conjuntos ocultos não são confidenciais para participantes autorizados a
ler o snapshot. Esse comportamento foi aprovado. O código secreto não é um
mecanismo de segurança contra adulteração deliberada do cliente.

## Revisão local

Execute `node --test tests/coyote-eyes.test.cjs` e
`node tests/coyote-eyes-ui.test.cjs`, com Playwright/Chromium disponíveis.
O segundo comando cria fichas de teste, exercita a sequência e fecha seu
servidor ao terminar. Capturas Alpha/douradas ficam em
`tests/artifacts/coyote-eyes/`, sem entrar nos commits.

Para testar manualmente, abra a ficha original confirmada na conta proprietária
e use a sequência fora de campos editáveis e diálogos. Importar em uma ficha
nova gera outra identidade e não concede elegibilidade.
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

A vinculação final também é coberta por testes positivos e negativos de
identidade/proprietário. As suítes de navegador usam dados fictícios de
autorização no servidor local de teste, sem modificar personagens reais.
