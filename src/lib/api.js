import { supabase } from "./supabase";

export async function signIn(email, password) {
  if (!supabase) throw new Error("Supabase não configurado.");
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signOut() {
  if (!supabase) return;
  return supabase.auth.signOut();
}

export async function getCurrentUser() {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user;
}

export async function listCollaborators() {
  if (!supabase) return { data: [], error: null };
  return supabase.from("collaborators")
    .select("id,nome,cpf,data_nascimento,setor,uf,ativo")
    .eq("ativo", true)
    .order("nome");
}

export async function createTravelRequest(payload) {
  if (!supabase) throw new Error("Supabase não configurado.");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error("Usuário não autenticado.");

  return supabase.from("travel_requests").insert({
    ...payload,
    requester_id: userData.user.id
  }).select().single();
}
