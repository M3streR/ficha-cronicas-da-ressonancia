# Armazenamento de personagens em IndexedDB

Arquivos da implementação: `index.html`, `script.js`, `js/character-storage.js`, `js/chronicles-collaboration.js`, `js/coyote-eyes.js`, `js/gold-generation.js`, `js/enchantments.js`, `.github/workflows/ci.yml` e este documento.

Testes criados/adaptados: `character-storage.test.cjs`, `chronicles-v6.test.cjs`, `class-reference.test.cjs`, `combates-flow.test.cjs`, `conflict-resolution-ui.test.cjs`, `confrontos-v1.js`, `coyote-eyes-ui.test.cjs`, `critical-states.test.cjs`, `elenco-v1.js`, `enchantments-ui.test.cjs`, `escudo-v1.js`, `gold-generation-ui.test.cjs`, `guardian-paths.test.cjs`, `multi-tab-edit-authority.test.cjs`, `participantes-v1.js`, `skills-progression.test.cjs` e `storage-live.cjs`, todos em `tests/`. O último permanece opt-in e não foi executado contra produção.

## Estrutura e confirmação

O banco `cronicasRessonanciaCharacters`, versão 1, tem duas stores:

- `records`: fichas completas, índice do Gerenciador, metadados Online e fichas legadas. Os nomes das chaves existentes são preservados.
- `migration`: diário da transferência, com fases `copied` e `verified` e os valores originais usados na comparação.

`CharacterStorage.initialize()` termina antes da inicialização da interface. As leituras existentes usam um cache em memória hidratado do banco; ele contém somente gravações confirmadas. As escritas são assíncronas, serializadas e confirmadas em `transaction.oncomplete`. Criação, importação e duplicação gravam ficha e índice na mesma transação; a edição marca a pendência Online junto com a ficha. Atualizações do índice preservam alterações concorrentes de outros personagens.

Web Locks e a autoridade de edição continuam protegendo o personagem. A autorização é conferida novamente antes das escritas. BroadcastChannel transmite somente chaves alteradas para invalidar o cache das outras abas. Supabase continua sendo a autoridade de publicações, com CAS por igualdade exata de `updated_at`; nenhum banco remoto é alterado.

## Migração automática

1. Ler as chaves antigas de personagens, índice, sincronização e fichas V1/V3.
2. Copiar suas strings literalmente, sem executar a normalização de importação.
3. Gravar a cópia e o diário `copied` na mesma transação.
4. Reler e comparar os valores byte a byte, incluindo comparação com a fonte antiga.
5. Somente então marcar o diário como `verified` e abrir o Gerenciador.

Nenhuma chave antiga é removida. Se uma transação abortar, não há cópia parcial. Se houver interrupção entre cópia e verificação, a próxima abertura verifica os registros existentes e retoma. Um registro divergente nunca é sobrescrito. A migração não altera identificadores, vínculos, fotos, notas, habilidades, Encantamentos, Geração de Ouro ou os dois olhos.

Depois da migração, as fichas completas e seus metadados não recebem novas gravações no localStorage. Auth e preferências pequenas permanecem no armazenamento apropriado já usado pelo projeto; o banco de Crônicas não é substituído.

## Abas antigas e recuperação

Uma aba antiga ainda pode escrever no localStorage. O novo aplicativo detecta alterações nessas chaves, interrompe suas próprias escritas e pede revisão. Na próxima abertura também compara a fonte antiga com o diário. Não decide automaticamente qual versão vence.

Procedimento de recuperação:

1. Não limpe os dados do site ou o navegador. Feche as abas antigas.
2. Reabra o site atualizado. No aviso de armazenamento, use **Exportar recuperação**.
3. Guarde o arquivo `cronicas-recuperacao-armazenamento.json`. Ele contém as duas fontes brutas, sem tokens de Auth. É um pacote de recuperação, não uma ficha comum para importação direta.
4. Se a divergência foi causada por uma aba antiga e a decisão for manter o banco novo, escolha **Manter banco IndexedDB** e confirme. Essa ação reconhece a fonte antiga no diário, sem aplicar seus registros ao banco e sem apagá-los. O diário mantém também a referência original anterior ao reconhecimento.
5. Para recuperar uma versão específica do pacote, extraia o JSON da chave de personagem desejada, salve como uma ficha JSON e importe pela interface normal, revisando a escolha de criar/restaurar. Preserve o pacote completo e os vínculos antes dessa operação.
6. Em falha durante edição, mantenha a aba aberta e exporte a ficha com as alterações em memória antes de fechar. Falha de gravação não é exibida como sucesso.

Não publique uma versão anterior que volte a gravar as fichas antigas como forma de rollback. Primeiro exporte as versões atuais; o localStorage preservado é uma cópia da época da migração, não um espelho atualizado.

## Limites

IndexedDB permite volumes muito maiores, mas o espaço disponível depende do navegador e do dispositivo. Modo privado, limpeza manual, remoção de dados pelo navegador ou perda do dispositivo podem eliminar armazenamento local. Exportações continuam necessárias como backups externos.

Transações pedem durabilidade `strict` quando suportada. Nenhuma aplicação de navegador pode garantir que uma edição ainda em memória sobreviva ao encerramento forçado do processo ou queda de energia antes do commit. A interface avisa ao sair com gravação pendente e tenta persistir em suspensão, troca de ficha e transferência de edição.

O cache atual hidrata todas as fichas na abertura, incluindo fotos. A validação usa dezenas de registros; quantidades ou imagens muito maiores ainda podem aumentar consumo de memória e tempo de inicialização. O armazenamento permanece restrito à mesma origem do site e ao perfil do navegador. Não é uma outbox duplicada nem um substituto de backup.

## Verificação sem dados reais

`tests/character-storage.test.cjs` cria perfis isolados do Chromium, bloqueia acesso ao Supabase e usa exclusivamente dados sintéticos. Inclui quota na quarta cópia em localStorage, 30 importações grandes em IndexedDB, migração literal, retomada, falhas transacionais, recuperação, importações concorrentes e bloqueio de observadoras. O CI executa esse teste antes dos demais fluxos de navegador.

Validação local desta implementação:

- 67 testes de módulos aprovados (Online, CAS, conflitos, offline/reconexão, Realtime, rolagens, Encantamentos, Geração de Ouro e Coyote).
- Teste novo de armazenamento: 30 fichas com fotos de aproximadamente 1,46 MiB por JSON; a quarta cópia em localStorage reproduz `QuotaExceededError`, enquanto as 30 importações em IndexedDB permanecem completas após reabertura.
- Falhas de quota em escrita e migração, diário interrompido em `copied`, registro divergente, aba antiga, banco indisponível e escolha explícita de recuperação aprovados.
- Integração de CAS com IndexedDB real e servidor simulado aprovada, incluindo confirmação de metadata e conflito sem sobrescrita.
- Regressões de Crônicas (92 verificações, incluindo Elenco e Participantes), Combates (87 verificações), Rolagens Livres, Perícias, estados críticos, backups de conflito e múltiplas abas aprovadas.
- Encantamentos e Geração de Ouro: 30 combinações responsivas cada. Coyote: 60 combinações, com conjuntos independentes, segredo, Aprimoramentos, cópias e restauração.
- Classes e caminhos legados: painéis, habilidades, favoritos, importação, snapshots e layouts aprovados. Os mocks históricos de Online foram atualizados para representar CAS em vez de `upsert`.
- Auditoria visual: 120 telas sem overflow ou erros; estados dinâmicos: 300 cenários sem overflow, rodapé inacessível ou rolagem aninhada; camadas: dez larguras e nove combinações de zoom aprovadas.
- Sintaxe JavaScript e `git diff --check` aprovados. Não foram executados os testes opt-in que escrevem em Supabase real.

Esses resultados são locais. Não houve push, execução remota de CI, merge ou publicação desta branch. Chromium foi o navegador exercitado; Safari e Firefox continuam dependendo de validação posterior. Queda real de energia não foi reproduzida: os testes cobrem abortos transacionais e interrupção entre fases da migração.
