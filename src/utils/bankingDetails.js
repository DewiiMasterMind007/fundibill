// Data layer for the multiple-banking-accounts feature. Mirrors the shape of
// src/utils/payments.js — plain functions taking a supabase client as the
// first argument, no client-side caching.

export async function getBankingDetails(supabase, userId) {
  const { data, error } = await supabase
    .from('banking_details')
    .select('*')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function addBankingDetail(supabase, userId, { account_name, bank_name, account_number, branch_code, account_type }) {
  const { count, error: countErr } = await supabase
    .from('banking_details')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (countErr) throw new Error(countErr.message)

  const { data, error } = await supabase
    .from('banking_details')
    .insert({
      user_id: userId,
      account_name,
      bank_name,
      account_number,
      branch_code:  branch_code  || null,
      account_type: account_type || null,
      is_default:   !count, // first record for this user becomes the default
    })
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateBankingDetail(supabase, id, userId, updates) {
  const { data, error } = await supabase
    .from('banking_details')
    .update(updates)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function deleteBankingDetail(supabase, id, userId) {
  const { data: existing, error: fetchErr } = await supabase
    .from('banking_details')
    .select('is_default')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (fetchErr) throw new Error(fetchErr.message)

  const { error: delErr } = await supabase
    .from('banking_details')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (delErr) throw new Error(delErr.message)

  if (existing?.is_default) {
    const { data: next } = await supabase
      .from('banking_details')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (next?.id) {
      const { error: promoteErr } = await supabase
        .from('banking_details')
        .update({ is_default: true })
        .eq('id', next.id)
        .eq('user_id', userId)
      if (promoteErr) throw new Error(promoteErr.message)
    }
  }
  return true
}

export async function setDefaultBankingDetail(supabase, id, userId) {
  const { error: clearErr } = await supabase
    .from('banking_details')
    .update({ is_default: false })
    .eq('user_id', userId)
  if (clearErr) throw new Error(clearErr.message)

  const { error: setErr } = await supabase
    .from('banking_details')
    .update({ is_default: true })
    .eq('id', id)
    .eq('user_id', userId)
  if (setErr) throw new Error(setErr.message)
  return true
}

export function createBankingSnapshot(bankingDetail) {
  if (!bankingDetail) return null
  return {
    account_name:   bankingDetail.account_name   ?? null,
    bank_name:      bankingDetail.bank_name      ?? null,
    account_number: bankingDetail.account_number ?? null,
    branch_code:    bankingDetail.branch_code    ?? null,
    account_type:   bankingDetail.account_type   ?? null,
  }
}
