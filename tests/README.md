# Crônicas — testes locais

Os pacotes principais de aceitação são `chronicles-v6.test.cjs`, `combates-flow.test.cjs` e `free-rolls.test.cjs`. Eles cobrem o armazenamento Local, a Ficha, o Rolador Rápido, Crônicas, Elenco, Participantes, Escudo, Confrontos e a Ala 05 no `index.html` real servido por HTTP.

Os testes de módulos Online ficam em `online-chronicles.test.cjs` e `online-rolls.test.cjs`. O workflow de CI executa a sintaxe, os módulos e os fluxos HTTP sem usar credenciais do Supabase.

Os demais arquivos desta pasta registram checkpoints históricos dos sistemas preservados. Execute os testes em uma origem separada dos dados utilizados normalmente no navegador.

## Compactação, Storage e estabilização

`node --test tests/online-chronicles.test.cjs tests/online-rolls.test.cjs tests/stabilization.test.cjs` cobre concorrência com microssegundos, destinos/resultados de rolagem, subscriptions atrasadas, reserva de upload e falhas de cleanup.

`node tests/visual-audit.cjs` captura 12 telas em 1920×1080, 1366×768, 1024×768, 768×1024, 430×932, 390×844, 360×800 e 320×720. Precisa de Playwright/Chromium e acesso ao CDN do cliente Supabase. Os JSONs ficam em `tests/artifacts/compact-audit`; as imagens completas ficam localmente e uma seleção acompanha o PR.

Os testes `storage-live.cjs` e `cover-ui.cjs` são **opt-in**, usam o Supabase configurado e criam/excluem fixtures. Exigem `.test-secrets.json` ignorado pelo Git com três contas descartáveis no formato `[{"email":"...","password":"...","id":"uuid"}, ...]`. Não use contas reais. `AUDIT_ONLINE=1 node tests/storage-live.cjs` também valida publicação/sincronização, Combate, Realtime e captura nove telas Online nas oito resoluções. `node tests/cover-ui.cjs` verifica o formulário mobile, preview, formato inválido, falha de rede, retry, substituição e remoção. As contas temporárias da execução registrada foram removidas após a auditoria.
