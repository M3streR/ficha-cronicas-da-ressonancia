# Combates — composição e ativo/inativo

## Comportamento atual

- Escudo: somente Caçadores (consulta do Elenco) e Combates, sob a barreira local de senha existente.
- Participantes e Confrontos continuam como abas. Somente seus botões de adicionar/criar foram removidos.
- Combates é o local de criar e montar Confrontos: nome/descrição existentes, seleção do Elenco, adversários com nome e PV/DEF opcionais.
- Não há catálogo de ameaças, tipos novos ou cópias de personagens. As fichas são resolvidas pelo ID original.
- Durante a criação, os formulários de seleção/adversários alteram apenas a composição temporária. Salvar Confronto grava tudo em uma transação.
- Não permite composição totalmente vazia; não exige classes ou tipos específicos por lado.
- Depois de salvo, Iniciar Confronto grava active=true e abre a execução operacional na aba externa.
- Encerrar Confronto grava active=false, volta à aba e preserva a composição inteira.
- Preparados e encerrados ficam disponíveis em Combates. Ambos são inativos; não há distinção persistida entre eles.
- Um ativo por Crônica. Outro início é recusado enquanto houver ativo; não há encerramento automático.
- O Rolador Rápido, seus históricos e destinos continuam funcionando. Stores de notas, registros, investigação e resultados não foram excluídas nem limpas ao retirar os módulos da interface.

## Persistência

DATABASE_VERSION permanece 6; RECORD_SCHEMA_VERSION da Crônica permanece 1.
Nenhuma store, índice ou migration nova.

chronicleConfrontations mantém id, chronicleId, name, description, createdAt, updatedAt e recebe somente active:boolean.
Sem startedAt, endedAt, status, rodada, turno ou sessão. updatedAt continua sendo apenas a data genérica de modificação já existente.

Registros legados sem active são lidos como inativos, sem regravação na leitura. Continuam visíveis em Combates e podem ser iniciados explicitamente depois de ter composição. Os dados e os IDs antigos permanecem intactos; nenhum confronto antigo é ativado automaticamente.

createConfrontation recebe opcionalmente a composição para compatibilidade com chamadas internas antigas. A criação pela interface sempre envia a composição completa. A transação abrange Crônica, Confronto, Elenco (validação), vínculos e adversários. Falhas abortam todas as escritas. Os vínculos continuam contendo somente confrontationId e characterId.

setConfrontationActive verifica a versão do registro e, ao iniciar, composição não vazia e ausência de outro ativo. As verificações e escrita ocorrem na mesma transação. Repetir uma mudança já aplicada não cria outro evento/registro. Exclusões continuam distintas de encerramento e conservam as cascatas anteriores.

## Código alterado

index.html, script.js (integrações pontuais), js/confrontations.js, js/master-shield.js, js/master-access.js (texto de redefinição), js/chronicles-storage.js e css/chronicles-workspace.css. Não há novo módulo de aplicação. O arquivo antigo master-records.js foi mantido, mas não é carregado pela interface atual.

A mesma confrontationView é hospedada dentro do Escudo durante a preparação e retorna ao contêiner operacional após iniciar. Os mesmos formulários/validadores de seleção e adversários são reaproveitados. Há proteção de rascunhos ao sair, bloqueio durante escrita, cancelamento de respostas atrasadas e descarte após confirmação. A senha continua sendo barreira local, não autorização de servidor.

## Validação

`node tests/combates-flow.test.cjs` (Playwright disponível via NODE_PATH; Chrome local, ou CHROME_PATH).
Não instala dependências. Sobe HTTP temporário para o index.html real e usa perfil de navegador descartável; não abre ou limpa dados do perfil real.

Execução em 03/09/2026: 87 verificações diretas + 75 do Elenco, 162 no total. O runner mostra 88 checkpoints contando a conclusão da suíte do Elenco. Console do entrypoint real sem exceções.

Cobertura: upgrades v1/v2/v3/v4/v5 → v6 com preservação de Crônicas/capas/dependências; legado sem campo; composição, Caçadores e adversários; abort/rollback; referência fora do Elenco; retenção e limpeza independente de históricos; início concorrente; falha no início e no encerramento; único campo active; repetição idempotente; conflitos; execução e edição manual existente; encerramento sem exclusão; reload; iniciar novamente pelo mesmo ID; cancelar preparação; bloqueio preservando rascunho; edição de Participantes sem botão de criação; apenas dois módulos; desktop/tablet/390/320 sem overflow; Rolador e Elenco.

Capturas em tests/artifacts/combates-*.png, inspecionadas visualmente. Mobile foi em Chromium com viewports reduzidos, não em aparelhos físicos, Safari ou Firefox. Os testes antigos de módulos retirados são históricos, não comprovação do fluxo atual.

## Limites

- Atualize todas as abas antigas do site após instalar esta versão; um código antigo ainda aberto pode desconhecer active.
- Não existe sincronização ao vivo entre abas. Ao abrir/recarregar, os dados são consultados; as escritas validam conflitos no banco.
- Sem backup geral novo: limpar dados do navegador ou mudar a origem HTTP continua tendo os mesmos riscos anteriores.
- Preparação ainda não salva existe somente em memória. Bloquear preserva; fechar/recarregar apesar do aviso a descarta.
- Nenhuma automação de combate, sessão, iniciativa, turno, histórico automático, online ou Tabletop foi criada.
