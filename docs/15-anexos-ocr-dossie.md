# 15 — Anexos, OCR, validação e Dossiê da OS

## Armazenamento e acesso

O bucket `travel-attachments` existente é privado, aceita PDF, XLSX, XLS, CSV, JPEG e PNG e limita arquivos a 15 MB. O Storage usa as políticas RLS existentes, com prefixo de usuário e acesso aos gestores ativos. Solicitantes podem enviar para as próprias OS; gestores podem conferir arquivos. Nenhum link público é criado. A aplicação usa somente a chave publishable/anon com sessão do usuário.

## Leitura e campos sugeridos

PDF.js extrai texto de PDF e SheetJS lê planilhas no navegador. Quando o PDF não possui texto, a primeira página é rasterizada para OCR; imagens passam por OCR Tesseract em português. O processamento é limitado às primeiras dez páginas do PDF. O navegador identifica sugestões de valor, data, fornecedor, número, CPF/CNPJ e categoria. OS vem do vínculo selecionado; o colaborador pode ser escolhido na revisão. A qualidade da extração depende do documento e deve ser conferida.

## Validação e custos

O estado `extracted` indica dados extraídos aguardando conferência. Valor, data, fornecedor, número, CPF/CNPJ, categoria, colaborador e OS são mostrados para correção. Extração ou correção não cria custo. O gestor precisa confirmar um valor positivo. A função `confirm_attachment_cost` confirma os dados, insere o custo e registra o custo em `attachments.cost_id` em uma única transação. Uma repetição da confirmação devolve o custo já vinculado. A tabela `attachment_extraction_reviews` mantém responsável, data, ação, dados e custo vinculado.

## Dossiê e relatórios

O Dossiê da OS reúne dados do pedido e cliente/contrato, colaboradores, passagens, hospedagem, veículos, refeições, lavanderia, Uber, custos, anexos, histórico de validação e total por categoria. O custo originado em comprovante preserva o anexo pela relação existente `attachments.cost_id`. Custos confirmados permanecem na composição usada por consolidação e relatórios.

## Implantação e verificação

Aplicar a migração SQL deste diretório em ambiente Supabase antes da publicação da aplicação. Verificar os papéis `admin`/`manager` e RLS existente em `attachments`, `travel_requests` e `costs`, além de executar upload, download, extração, revisão e confirmação com contas distintas. A migração não altera ou remove arquivos existentes.
