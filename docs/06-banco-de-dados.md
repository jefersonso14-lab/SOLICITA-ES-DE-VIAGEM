# 06 — Banco de Dados

Principais entidades: profiles, collaborators, clients, contracts, travel_requests, travel_request_collaborators, tickets, accommodations, vehicles, meals, laundry, uber_expenses, costs, attachments e audit_logs.

Solicitações são relacionadas ao usuário por requester_id.

Na solicitação de viagem, clientes e contratos aceitam busca em cadastros existentes ou digitação de novos nomes. Os novos itens são salvos no catálogo junto com a solicitação. A migration `20261112174000_allow_requesters_to_add_clients_and_contracts.sql` restringe a inclusão a perfis autenticados e ativos, sem liberar edição ou exclusão, e impede duplicidade entre nomes ativos.

## Edição e remoção de solicitações

O solicitante pode editar suas próprias solicitações ativas; administradores podem editar solicitações ativas e removê-las. A permissão é validada por RLS e pela função `update_travel_request` no banco. As edições da solicitação e da equipe da OS geram eventos em `audit_logs`.

A remoção é lógica: `deleted_at` registra quando a solicitação saiu das listas ativas. Exclusão física e `TRUNCATE` são revogados para os usuários autenticados. Custos, anexos, vínculos e histórico permanecem associados ao registro; relatórios e listas de custos usam apenas solicitações ativas. A migration `20261113122856_edit_remove_requests_with_audit.sql` aplica as regras e atualiza a view de consolidação.
