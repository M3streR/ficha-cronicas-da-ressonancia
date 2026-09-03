# Crônicas v6 — painel privado e histórico de rolagens

> Documento da etapa anterior. A interface atual possui somente Caçadores e Combates;
> as stores privadas e de rolagens descritas abaixo continuam preservadas.
> Para o fluxo e a validação atuais, consulte [COMBATES-FLOW.md](COMBATES-FLOW.md).

## Entrega

- Ações globais: Editar Crônica, Escudo do Mestre e Convidar Participantes (Em breve, indisponível).
- Gerenciar Elenco dentro da aba Elenco; uma ação de criação por aba em Participantes e Confrontos.
- Painel do Mestre com telas próprias de Agentes, Combates, Resultados, Registros e Anotações.
- Agentes lê o Elenco; Combates abre o módulo existente e oferece retorno ao painel, com novo desbloqueio.
- Investigação removida da interface; store e dados existentes preservados, inativos, sem migration. Registros mantém título, conteúdo e data manual.
- Notas antigas permanecem em chronicleMasterNotes, sem conversão. Salvamento manual, conflitos e rascunhos preservados.
- Ficha restaurada à composição anterior a Dados: três blocos convivem no desktop, com as três guias originais nas larguras menores. O CSS original permanece intacto.
- Histórico inicialmente recolhido dentro do Rolador Rápido, após o resultado, com destino, paginação e retry no próprio Rolador. Expressões continuam somando todos os dados mais o modificador.
- O histórico explicita source/category/resolution/schemaVersion. A regra futura de zero dados exigirá um produtor e validador próprios; não é executada agora, nem reinterpreta 2d20.

## Persistência

DATABASE_VERSION = 6; RECORD_SCHEMA_VERSION da Crônica = 1. As oito stores anteriores são preservadas.

| Nova store | Chave / índices | Conteúdo |
| --- | --- | --- |
| rollRecords | id | id, schemaVersion, characterId, characterName, createdAt, source, category, resolution, result |
| characterRollLinks | [characterId, rollId]; owner, chronology [characterId, createdAt, rollId], rollId | characterId, rollId, createdAt |
| chronicleRollLinks | [chronicleId, rollId]; owner, chronology [chronicleId, createdAt, rollId], rollId | chronicleId, rollId, createdAt |
| chronicleMasterAccess | chronicleId | chronicleId, schemeVersion, algorithm, iterations, salt, verifier, updatedAt |
| chronicleInvestigationEntries | id; chronicleId, chronology | id, chronicleId, title, content, revealed, createdAt, updatedAt |
| chronicleJournalEntries | id; chronicleId, chronology | id, chronicleId, title, content, date, createdAt, updatedAt |

result armazena expression, quantity, faces, modifier, rolls, diceTotal e total. Nenhum personagem é duplicado ou migrado para IndexedDB.

Cada evento é gravado uma única vez. Os vínculos têm somente identidade e data para indexação. Limpeza/retencão são independentes: 500 referências por ficha e 2.000 por Crônica. Um evento sem referências é removido na mesma transação. Paginação em lotes de 50, desempate por ID. Resultados recentes: três eventos. Os filtros por personagem consultam também eventos fora da primeira página.

Destino: nenhum vínculo → ficha; um vínculo → Crônica explícita, com opção Somente ficha; vários → escolha obrigatória. A escolha dura somente aquela abertura da ficha e não usa activeChronicleId. O vínculo é revalidado ao gravar. Se deixou de existir, salva somente na ficha com aviso. Não há associação retroativa de históricos.

O histórico da ficha apresenta o destino pelos vínculos de rolagem ainda existentes (consulta opcional somente leitura). Não infere destinos pelo Elenco atual, não grava nomes no evento e não reconstrói destinos já apagados. A correção não muda schema, retenção ou operações de escrita. Identificadores técnicos pre-alpha permanecem compatíveis; a apresentação de versão usa Alpha.

Notas, acesso, pistas, diário e rolagens não alteram updatedAt público. deleteChronicle inclui todas as dependências privadas e vínculos de resultados na transação de exclusão, preservando eventos ainda referenciados por fichas/outras Crônicas.

Excluir personagem não depende de IndexedDB e não remove o histórico. Exportar a ficha não inclui resultados. Importação como novo/duplicação usam outra identidade; importar sobre ficha aberta mantém a identidade e seu histórico (aviso na confirmação).

## Acesso local

PBKDF2-SHA-256 / 600.000 iterações / salt aleatório de 128 bits / verificador de 256 bits. Senha nunca persistida. Na definição, 8–256 caracteres e confirmação. Web Crypto exige HTTPS ou localhost compatível.

Desbloqueio somente em memória. Bloqueia ao sair do Escudo, trocar de Crônica, recarregar, usar Bloquear Escudo ou após 30 minutos de inatividade. Rascunhos são ocultados e preservados em memória no bloqueio, não salvos automaticamente. Sair com alterações exige confirmação; reload utiliza beforeunload quando necessário.

Redefinir senha local remove somente a configuração, mediante confirmação explícita. Não apaga dados privados. Qualquer pessoa com acesso ao navegador pode fazer essa redefinição: isto é uma barreira de interface contra acesso casual, NÃO autenticação real, autorização de servidor ou criptografia do conteúdo. Uma futura camada online deve autorizar os dados no servidor; não confiar neste desbloqueio nem em resultados gerados pelo cliente.

## Arquivos

Criados: js/master-access.js, js/master-records.js, js/roll-history.js, js/roll-history-view.js, css/chronicles-workspace.css, tests/chronicles-v6.test.cjs e este documento. Capturas de verificação: tests/artifacts/v6-*.png.

Alterados: index.html, script.js (integrações pontuais), js/chronicles-storage.js, js/master-shield.js, js/confrontations.js, testes existentes de Elenco/Participantes/Confrontos/Escudo e READMEs. style.css original não precisou ser reescrito; os ajustes do pacote estão no CSS específico carregado depois dele.

## Testes

Resultado após a correção em 03/09/2026: 102 verificações diretas do pacote e 316 nas suítes reaproveitadas (Elenco 75, Participantes 74, Confrontos 97, Escudo 70), totalizando 418 verificações. O runner informa 106 checkpoints, pois também contabiliza as quatro conclusões de suíte. Sem exceções no Console do entrypoint real; falhas injetadas nos harnesses foram esperadas e verificadas.

Execute `node tests/chronicles-v6.test.cjs` com Playwright resolvível pelo Node (NODE_PATH ou dependência do ambiente). CHROME_PATH permite indicar outro executável Chromium; o padrão do teste é Chrome no Windows. Não instala dependências e não usa o perfil real do usuário.

O runner sobe servidor HTTP temporário para o index.html real e usa perfil descartável. Cobre upgrades v1/v2/v3/v4/v5 → v6 com fixtures de todas as stores anteriores e comparação de capas; rolagens, destino, retry, retenção, paginação, conflitos, rollback, cascata, senha, bloqueio, reset, notas, preservação da store inativa de pistas, diário, navegação e layouts desktop/tablet/390/320. A correção verifica ausência de Dados e Investigação na interface, blocos convivendo no desktop, guias originais no mobile, histórico recolhido/acessível por teclado, atualização sem rerrolar, mais de 50 resultados, troca de personagem, Alpha apenas na apresentação e comparação de registros antes/depois da navegação. As quatro suítes existentes também são executadas em namespaces isolados. Logs de falhas propositalmente injetadas são esperados nos harnesses, não na aplicação em uso normal.

Capturas desta correção: tests/artifacts/correction-ficha-*.png, correction-rolador-*.png e correction-historico-*.png. Capturas antigas v6-dados-*.png são evidência histórica, não a interface atual. Nenhum perfil real de usuário foi aberto ou limpo nos ensaios.

As capturas foram inspecionadas. Os ensaios são em Chromium desktop com viewports móveis, não em aparelhos físicos, Safari ou Firefox. Não é um teste de leitor de tela real nem de performance em celulares. A camada de histórico não implementa testes de atributos/perícias, online, turnos, sessões ou integrações Tabletop.

## Recuperação e limites

- Não há transação compartilhada entre localStorage e IndexedDB; referências históricas a personagens excluídos são intencionais.
- Falha ao gravar histórico mantém os dados da rolagem em memória, oferece retry sem relançar e avisa antes de reload. Fechar mesmo assim perde o que não foi salvo.
- O armazenamento continua vinculado à origem do navegador. Trocar protocolo/host/porta não migra os dados. Limpar dados do navegador pode removê-los.
- Upgrade é aditivo e transacional. Não faça downgrade do código para uma versão que só abre o banco v5 depois do upgrade v6; use correção adiante ou backup apropriado.
- Não há exportação geral do banco/backup dos históricos neste pacote; exportação de personagem não equivale a backup de Crônicas.
