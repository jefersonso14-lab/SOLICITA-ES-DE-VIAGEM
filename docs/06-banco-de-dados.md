# 06 — Banco de Dados

Principais entidades: profiles, collaborators, clients, contracts, travel_requests, travel_request_collaborators, tickets, accommodations, vehicles, meals, laundry, uber_expenses, costs, attachments e audit_logs.

Solicitações são relacionadas ao usuário por requester_id.

Na solicitação de viagem, clientes e contratos aceitam busca em cadastros existentes ou digitação de novos nomes. Os novos itens são salvos no catálogo junto com a solicitação. A migration `20261112174000_allow_requesters_to_add_clients_and_contracts.sql` restringe a inclusão a perfis autenticados e ativos, sem liberar edição ou exclusão, e impede duplicidade entre nomes ativos.