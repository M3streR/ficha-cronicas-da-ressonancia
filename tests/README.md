# Crônicas — testes locais

Os pacotes principais de aceitação são `chronicles-v6.test.cjs`, `combates-flow.test.cjs` e `free-rolls.test.cjs`. Eles cobrem o armazenamento Local, a Ficha, o Rolador Rápido, Crônicas, Elenco, Participantes, Escudo, Confrontos e a Ala 05 no `index.html` real servido por HTTP.

Os testes de módulos Online ficam em `online-chronicles.test.cjs` e `online-rolls.test.cjs`. O workflow de CI executa a sintaxe, os módulos e os fluxos HTTP sem usar credenciais do Supabase.

Os demais arquivos desta pasta registram checkpoints históricos dos sistemas preservados. Execute os testes em uma origem separada dos dados utilizados normalmente no navegador.
