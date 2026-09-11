# Compactação, estabilização e capas Online — 10/09/2026

Trabalho retomado na branch `compactacao-capas-online`, preservando as alterações existentes. Base: `main` em `f6098fc1a57b89a6e80888026cc7148a27db0bca`. Sem rewrite de `script.js` e sem novos sistemas de RPG.

## Arquivos e acabamento

- `css/compact.css`: camada de densidade com espaçamento, controles, cards, formulários, estados, modais e adaptação responsiva. Preserva cores, tipografia e identidade angular existentes.
- `index.html`: carrega os novos recursos e atualiza versões de cache.
- `js/chronicle-covers.js`: validação, reserva, upload, download privado e recuperação de limpeza.
- `js/chronicles-online.js`: persistência das capas, formulários e ciclo de subscriptions.
- `js/chronicles-collaboration.js`, `js/chronicles-online-combat.js`, `js/chronicles-free-rolls.js`: proteção contra respostas antigas, timers e atualizações perdidas.
- `script.js`: integração pontual, feedback de falha, teardown, troca de conta e atualização de capa/identidade no detalhe.
- Duas migrations e `supabase/functions/cleanup-chronicle-covers/index.ts`.
- `.gitignore`, `.github/workflows/ci.yml`, `tests/README.md`, quatro novos testes e evidências em `tests/artifacts`.

Gerenciador, Ficha, Crônicas, Auth, Elenco, Participantes, Confrontos, Combate, Quick Dice e Rolagens Livres receberam ajustes. Headers e cards ficaram menores; formulários de Crônica usam duas colunas no desktop e uma no mobile; capas têm altura controlada; modais respeitam a viewport e rolam internamente. Controles móveis mantêm área de toque de 44 px. Estados de foco, erro, sucesso e movimento reduzido foram harmonizados.

## Supabase aplicado

Projeto: `gejpqmrystvzezscmmkg`.

| Migration local | Versão aplicada pelo MCP |
| --- | --- |
| `20260910191553_chronicle_storage_covers.sql` | `20260910192219` |
| `20260910193141_qualify_cover_storage_paths.sql` | `20260910193210` |

O MCP atribuiu timestamps de aplicação diferentes dos arquivos gerados pela CLI. Ambas já estão aplicadas; reconciliar esse histórico antes de executar um futuro `db push`, sem reaplicar cegamente.

Bucket privado `chronicle-covers`: WebP/JPEG/PNG, máximo 460800 bytes (450 KiB). Processamento no cliente limita a imagem a 960×540; originais têm limite de 12 MiB e 60 megapixels. Capas Local continuam no armazenamento Local, com sua seleção de formatos preservada.

Metadados `cover_path`, `cover_width`, `cover_height` em `chronicles`, com constraints de caminho e dimensões. Caminhos imutáveis usam owner/Crônica/UUID. Upload requer reserva válida e ownership. Leitura segue a visibilidade da Crônica por RLS; estranhos não recebem a imagem. Não há UPDATE ou DELETE direto de objetos pelo cliente.

A fila `chronicle_cover_cleanup` e o trigger privado verificam a associação e enfileiram capas substituídas/removidas ou pertencentes a Crônicas excluídas. Reservas abandonadas vencem em uma hora. A Edge Function `cleanup-chronicle-covers` está ACTIVE, versão 1, verifica JWT e remove objetos pela API de Storage usando credencial apenas no servidor. Aceita somente trabalhos do usuário autenticado; não confia em caminhos fornecidos pelo cliente. Falhas mantêm a fila para retry.

Upload, preview, persistência, índice, detalhe, substituição, remoção, exclusão, loading e erro foram verificados. Se a criação da Crônica funcionar e o upload falhar, a Crônica permanece sem capa e o usuário recebe aviso, evitando duplicação numa nova tentativa.

## Bugs corrigidos

- Texto literal `\n` aparecendo no topo do HTML.
- Grid da capa e botão de abrir Crônica excedendo a largura no mobile.
- Decodificação atrasada recolocando uma capa já removida.
- Respostas de consultas/subscriptions antigas atualizando uma tela ou conta nova.
- Canais de Combate sobrevivendo à saída do detalhe.
- Navegação cancelando sincronização pendente de personagem; agora o descarte é vinculado à troca de usuário.
- Realtime recebido durante carregamento de Rolagens Livres sem atualização posterior.
- Detalhe aberto sem refletir identidade/capa atualizada por outro cliente.
- Confirmação de exclusão Online descrevendo incorretamente uma exclusão apenas neste navegador.
- Referência SQL ambígua a `name` nas policies de Storage; qualificada como `storage.objects.name` e validada com contas distintas.
- Falhas de download/upload/cleanup ocultando feedback ou comprometendo a continuidade do formulário.

## Testes executados

| Verificação | Resultado |
| --- | --- |
| Sintaxe dos JavaScripts e `git diff --check` | Passou |
| `node --test tests/online-chronicles.test.cjs tests/online-rolls.test.cjs tests/stabilization.test.cjs` | 8/8 |
| `node tests/chronicles-v6.test.cjs` | 92 verificações |
| `node tests/combates-flow.test.cjs` | 87 verificações |
| `node tests/free-rolls.test.cjs` | Passou |
| `node tests/visual-audit.cjs` | 96 capturas, sem overflow ou exceções |
| `AUDIT_ONLINE=1 node tests/storage-live.cjs` | 30 verificações; 72 capturas Online |
| `node tests/cover-ui.cjs` | 7 verificações no formulário real |

As suítes históricas se sobrepõem; os números não representam casos únicos somados. O teste Online inclui publicação, sincronização, engine de rolagem existente, Confronto, Combate, Escudo por owner/Auth, participante, estranho, substituição, conflito com microssegundos, remoção e cleanup. O teste do formulário cobre falha de rede, retry e preservação da capa persistida.

## Responsividade e auditoria visual

| Viewport | Local/Auth/Ficha/modais | Online |
| --- | --- | --- |
| 1920×1080 | Sem overflow | Sem overflow |
| 1366×768 | Sem overflow | Sem overflow |
| 1024×768 | Sem overflow | Sem overflow |
| 768×1024 | Sem overflow | Sem overflow |
| 430×932 | Sem overflow | Sem overflow |
| 390×844 | Sem overflow | Sem overflow |
| 360×800 | Sem overflow | Sem overflow |
| 320×720 | Sem overflow | Sem overflow |

Capturas reais em Chromium, com inspeção visual de Gerenciador, formulário, índice/detalhe, modais, dados rápidos, Elenco, Participantes, Combate e Rolagens Livres. São 56 capturas de referência anterior, 96 finais Local/Auth e 72 Online. JSONs e uma seleção de imagens acompanham o commit; o conjunto completo permanece local em `tests/artifacts/compact-audit`.

## Advisors e integridade

Security advisors: quatro avisos preexistentes, sem novos avisos das capas. Três wrappers públicos SECURITY DEFINER (`accept_chronicle_invite`, `create_chronicle_invite`, `revoke_chronicle_invite`) e proteção de senha vazada desabilitada. Wrappers inspecionados; não foram alterados fora do escopo.

Referências: [funções SECURITY DEFINER](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) e [proteção de senhas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Performance advisors: seis INFO de índices não utilizados, sem WARN/ERROR: `chronicle_invites_created_by_idx`, `chronicle_invites_used_by_idx`, `online_characters_name_idx`, `chronicle_cast_members_added_by_idx`, `online_roll_records_character_created_idx`, `online_roll_records_author_created_idx`. Não removidos por falta de evidência de inutilidade em produção. [Referência](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index).

Validação final do banco: RLS habilitada em todas as tabelas públicas, zero contas de auditoria, zero objetos temporários e zero trabalhos pendentes de cleanup. Preservadas uma Crônica e três personagens Online reais. Arquivo de credenciais temporárias removido.

## Limitações restantes

- Responsividade validada em Chromium com viewports emulados; sem testes em aparelhos físicos, Safari ou Firefox.
- Cleanup é retomado em login/mutações; não há cron independente. Reservas abandonadas podem permanecer até uma próxima atividade autenticada depois do vencimento.
- Os quatro avisos de segurança preexistentes permanecem descritos acima.
- Backend Supabase já aplicado de forma aditiva. Frontend fica na branch/PR, sem merge ou deploy da `main` nesta tarefa.
