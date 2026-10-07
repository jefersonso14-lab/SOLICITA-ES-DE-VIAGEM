# 12 — Auditoria e Histórico

Alterações em perfis, cadastros, solicitações, serviços, custos, anexos e importações são gravadas pelo banco com usuário, data/hora, entidade, identificador, ação e snapshots anteriores/novos quando aplicável. A captura ocorre em triggers; o cliente web não pode inserir, alterar ou apagar eventos.

O painel Histórico e auditoria permite filtrar por busca, OS, entidade, ação e período. Gestores e administradores consultam eventos do sistema; solicitantes consultam apenas eventos das próprias OS. O Dossiê apresenta a mesma trilha da OS junto das validações do documento.

Snapshots omitem CPF, CNPJ, RG, data de nascimento, texto OCR, caminho privado do Storage e campos de credenciais. Os snapshots anteriores e novos ficam em `private.audit_snapshots`, fora do schema exposto pela API e com política de negação total. A tabela pública `audit_logs` contém apenas metadados e nomes dos campos alterados; clientes autenticados não recebem os valores anteriores ou atuais. A tabela é somente leitura pela API e os eventos não são apagados pelo solicitante.

O teste de integração `tests/supabase-audit.integration.sql` verifica RLS, privilégios, captura/redação dos snapshots e a regra financeira: solicitantes não confirmam custos, gestores confirmam uma vez e a OS mantém o vínculo com anexo e validação. Os dados sintéticos são revertidos pela transação. Execute-o em um projeto Supabase após aplicar as migrações.
