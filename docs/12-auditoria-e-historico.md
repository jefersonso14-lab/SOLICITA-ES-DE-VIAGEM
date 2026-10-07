# 12 — Auditoria e Histórico

# 12 — Auditoria e Histórico

Alterações em perfis, cadastros, solicitações, serviços, custos, anexos e importações são gravadas pelo banco com usuário, data/hora, entidade, identificador, ação e snapshots anteriores/novos quando aplicável. A captura ocorre em triggers; o cliente web não pode inserir, alterar ou apagar eventos.

O painel Histórico e auditoria permite filtrar por busca, OS, entidade, ação e período. Gestores e administradores consultam eventos do sistema; solicitantes consultam apenas eventos das próprias OS. O Dossiê apresenta a mesma trilha da OS junto das validações do documento.

Snapshots omitem CPF, CNPJ, RG, data de nascimento, texto OCR, caminho privado do Storage e campos de credenciais. A tabela audit_logs é somente leitura pela API e os eventos não são apagados pelo solicitante.
