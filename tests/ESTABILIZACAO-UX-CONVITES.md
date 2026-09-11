# Estabilização funcional, UX e convites multiuso

Data da validação: 11/09/2026
Branch: `codex/estabilizacao-convites-multiuso`

## Problemas e correções

### Sidebar

O corte de “Personagens” vinha da combinação de três regras: a compactação reduzia a coluna para 160/140 px, o item mantinha padding lateral e `overflow: hidden`, e a regra de 1024 px sobrescrevia antes da regra horizontal de 900 px. Em 1024 px com zoom de 125% isso produzia uma coluna lateral de 176 px com uma navegação interna de três colunas; cada botão ficava com cerca de 45 px.

A coluna passou a usar `minmax(184px, 12vw)` no desktop e 176 px até 1024 px. Padding, largura mínima e overflow foram alinhados. Em até 900 px a navegação muda estruturalmente para duas colunas horizontais. A fonte de 12,8 px foi preservada. Os dois rótulos, seus indicadores ativos e seus limites foram medidos em nove combinações de resolução e zoom.

### Entrada em Crônicas

O índice aguardava primeiro o IndexedDB Local e depois a consulta Online. Antes da espera, o código apagava o grid e escondia a contagem; ao sair da seção, também destruía o índice inteiro. Isso criava o intervalo em que a tela parecia vazia e podia repetir consultas.

Local e Online agora carregam em paralelo. A listagem Online mantém cache por usuário na sessão, compartilha consultas concorrentes e faz revalidação em segundo plano. Foco ou ponteiro sobre “Crônicas” antecipa a leitura. Ao alternar entre seções, o último resultado permanece no DOM e só é substituído de uma vez quando a atualização chega. Na primeira abertura sem cache há um loading explícito. Mudanças de conta invalidam o DOM e separam o cache; Realtime marca o cache como antigo, faz uma atualização única e só então notifica a interface.

### Convites multiuso

`chronicle_invites` recebeu `multi_use`, `max_uses`, `use_count`, `expires_at` e `last_used_at`, preservando os campos legados. O Mestre escolhe sem limite/5/10/20 jogadores e nunca/24 horas/7 dias, gera um único UUID e copia o mesmo link para o grupo. A lista mostra estado, contador, limite, expiração, copiar e revogar.

A aceitação usa `accept_reusable_chronicle_invite`. A função privada roda em uma transação, bloqueia a linha do convite com `FOR UPDATE`, verifica Auth e disponibilidade, insere a membership protegida pela chave composta e incrementa o contador somente quando houve inserção. Mestre e participante existente retornam a Crônica antes das verificações terminais, sem duplicar membership ou consumir uso. Revogação, expiração e limite bloqueiam apenas novos participantes. O wrapper público é `security invoker`; a função privada usa `security definer`, `search_path` vazio e execução restrita a `authenticated`.

O parâmetro `invite` já preservado em `localStorage` continua pelo login/cadastro e é removido da URL somente após o aceite. A espera artificial de 50 ms foi removida e aberturas concorrentes do diálogo são agrupadas.

## Bugs adicionais corrigidos

- Realtime podia avisar a interface antes de o cache Online conter o estado novo; a atualização agora termina antes do evento de renderização.
- Leituras simultâneas do índice podiam duplicar a consulta Online; agora compartilham a mesma Promise.
- O índice de uma conta podia permanecer visível após troca de Auth; agora ele é invalidado na mudança de conta.
- O estado vazio aparecia durante uma revalidação válida; agora os registros anteriores permanecem visíveis e o erro de background não apaga dados úteis.
- Um link multiuso com entradas registradas podia receber o rótulo legado “Utilizado”; ele permanece “Ativo” até expirar, atingir o limite ou ser revogado.
- O convite podia tentar abrir mais de um diálogo durante eventos próximos de Auth; a operação agora é coalescida.
- O teste de início do Combate verificava “Encerrar” antes de o controle concluir sua transição no runner Linux; agora aguarda explicitamente o estado visível, eliminando a flutuação sem alterar o produto.

## Migrations aplicadas

1. `20260911023210_reusable_chronicle_invites.sql`
2. `20260911070331_harden_reusable_chronicle_invites.sql`
3. `20260911070923_stabilize_invite_expiration.sql`
4. `20260911071146_enforce_invite_status_before_membership.sql`
5. `20260911071432_reload_invite_accept_rpc.sql`
6. `20260911072030_add_reusable_invite_accept_rpc.sql`
7. `20260911072606_preserve_invite_idempotency.sql`

Os nomes e versões locais correspondem ao histórico aplicado no projeto `gejpqmrystvzezscmmkg`. A sequência registra o endurecimento feito durante os testes concorrentes e preserva o histórico real do banco.

As capas Online continuam usando o bucket privado e as policies das migrations já presentes na `main`: `20260910192219_chronicle_storage_covers.sql` e `20260910193210_qualify_cover_storage_paths.sql`.

## Validação

- Módulos: 10 testes aprovados, incluindo microssegundos, cache, subscriptions atrasadas, upload/cleanup e estado do convite.
- Aplicação completa: 92 verificações aprovadas.
- Confrontos/Combate/Elenco: 87 verificações aprovadas.
- Rolagens Livres: fluxo, foco e 390 px aprovados.
- Sidebar: 1920×1080, 1366×768 e 1024 com zoom efetivo de 100%, 110% e 125%; cinco ciclos Personagens/Crônicas; nenhum corte ou overflow.
- Auditoria visual geral: 96 telas, sem overflow e sem erro de Console.
- Online: nove telas em 1920, 1366, 1024, 768, 430, 390, 360 e 320 px, sem overflow; publicação, sincronização, Rolagens, Confrontos, Combate, Escudo, Realtime e teardown aprovados.
- Capas: preview, persistência, formato/tamanho inválidos, falha e retry, substituição, remoção, RLS e cleanup ao excluir aprovados no Supabase real.
- Convite: mesmo link aceito por A/B/C; login no meio; contador 3; idempotência; remoção; revogação bloqueando D; limite; expiração; duas aceitações simultâneas; refresh.
- Resíduos: zero Crônicas de auditoria, zero convites de auditoria e zero contas temporárias restantes.

A ferramenta de controle manual do navegador do ambiente não iniciou por ausência de seus arquivos internos de kernel. A passada de uso real foi feita no navegador Chromium com o site servido por HTTP, contas isoladas, duas páginas simultâneas, refresh e inspeção das capturas. Essa limitação é do ambiente de auditoria, não da aplicação.

## Advisors do Supabase

- Segurança: nenhuma falha de RLS ou função exposta. Permanece um aviso de configuração: proteção contra senhas vazadas desativada.
- Performance: três avisos informativos de índices ainda não observados em uso: `chronicle_invites_created_by_idx`, `chronicle_invites_used_by_idx` e `online_characters_name_idx`. Eles foram preservados porque a baixa amostra do ambiente não justifica removê-los.
- Todas as tabelas públicas permanecem com RLS habilitada.

## Arquivos-fonte alterados

- `.github/workflows/ci.yml`
- `css/compact.css`
- `css/chronicles-sharing.css`
- `index.html`
- `script.js`
- `js/chronicles-online.js`
- `js/chronicles-sharing.js`
- `tests/README.md`
- `tests/stabilization.test.cjs`
- `tests/combates-flow.test.cjs`
- `tests/ux-stabilization.cjs`
- `tests/reusable-invites-live.cjs`
- sete migrations listadas acima
- relatórios e capturas atualizados em `tests/artifacts/`

## Limitações restantes

- A proteção de senhas vazadas precisa ser ativada no painel de Auth do Supabase; ela não é controlada por migration SQL deste repositório.
- O cache de sessão acelera reaberturas na mesma aba. A primeira consulta Online de uma sessão ainda depende da rede, mas agora mostra loading explícito e Local/Online são consultados em paralelo.
