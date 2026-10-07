# Plataforma de Solicitação de Viagens

Plataforma web para centralização de solicitações de viagem, colaboradores, serviços, custos, comprovantes, relatórios e histórico.

## Status
Fluxo de anexos, OCR, validação e Dossiê da OS implementado.

## Identidade
- Vermelho e preto como identidade institucional.
- Layout minimalista e responsivo.
- Acessibilidade para usuários com daltonismo.
- Estados identificados por cor, ícone e texto.

## Stack
- React
- Vite
- Supabase/PostgreSQL
- XLSX
- PDF.js
- Tesseract.js

## Fluxo
Nova OS → Dados → Colaboradores → Serviços → Custos → Anexos → Revisão → Envio → Dossiê da OS

## Anexos, OCR e Dossiê
Anexos PDF, XLSX, XLS, CSV, JPG, JPEG e PNG são guardados no bucket privado existente `travel-attachments` (limite de 15 MB). Solicitantes podem enviar documentos nas próprias OS; gestores podem enviar e conferir arquivos das OS que administram. A leitura é feita no navegador: PDF.js e SheetJS leem documentos textuais e planilhas; Tesseract.js tenta OCR em imagens e PDFs digitalizados.

Campos extraídos são sugestões editáveis. Só a ação **Confirmar e lançar custo**, disponível a gestores, grava o custo e seu vínculo em `attachments.cost_id` em uma transação no Supabase. Arquivos não confirmados não entram no consolidado financeiro. A trilha de revisão registra responsável, horário, dados confirmados e custo associado.

O Dossiê da OS agrega solicitação, colaboradores, passagens, hospedagem, veículos, refeições, lavanderia, Uber, custos, anexos, validações e resumo por categoria. A consolidação e os relatórios continuam usando a tabela de custos existente.

O módulo **Histórico e auditoria** registra alterações no banco e permite filtrar eventos por OS, entidade, ação e período. Solicitantes veem apenas suas OS; gestores e administradores veem o histórico global. Os snapshots sanitizados ficam no schema privado `private`; a API expõe apenas os nomes dos campos alterados.

### Implantação Supabase
1. Aplique as migrações deste repositório em ordem cronológica, em um projeto que já contenha o esquema base da plataforma.
2. Confirme que o bucket `travel-attachments` aparece como **privado** e limitado a 15 MB.
3. Configure apenas `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente web. Nunca use chave `service_role` ou chave secreta no navegador.
4. As dependências estão fixadas no `pnpm-lock.yaml`; instale com `pnpm install --ignore-scripts`, execute os testes com `pnpm test` e inicie com `pnpm dev`.
5. Para validar RLS, privilégios, redação dos snapshots e a confirmação financeira ponta a ponta, execute `tests/supabase-audit.integration.sql` no SQL Editor depois das migrações. O script cria dados sintéticos dentro de uma transação e os reverte ao final.

## Documentação
Consulte a pasta `docs/`.

## Qualidade contínua
O GitHub Actions instala com lockfile congelado e executa `pnpm test` e `pnpm run build` em pushes para `main` e pull requests. A interface inclui link para pular a navegação, estados anunciados por leitor de tela e diálogo com nome acessível.
