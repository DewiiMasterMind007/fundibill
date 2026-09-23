// Data layer for the multiple-contacts-per-client feature. Mirrors the
// shape of src/utils/bankingDetails.js — plain functions taking a supabase
// client as the first argument, no client-side caching.

export async function getClientContacts(supabase, clientId) {
  const { data, error } = await supabase
    .from('client_contacts')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function addClientContact(supabase, userId, clientId, { name, email, phone, role }) {
  const { data, error } = await supabase
    .from('client_contacts')
    .insert({
      user_id:   userId,
      client_id: clientId,
      name:      name  || null,
      email,
      phone:     phone || null,
      role:      role  || null,
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateClientContact(supabase, id, userId, updates) {
  const { data, error } = await supabase
    .from('client_contacts')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteClientContact(supabase, id, userId) {
  const { error } = await supabase
    .from('client_contacts')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  return true
}
