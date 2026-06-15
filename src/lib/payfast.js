/**
 * buildPayFastURL(user, profile, plan)
 *
 * Builds the payment redirect URL. The PHP page at fundiai.co.za handles
 * the PayFast form submission server-side, so no signature logic is needed here.
 *
 * TrialBanner / PlanSelectModal call this synchronously then pass the result
 * to window.db.openExternal(), which opens it in the system browser.
 *
 * @param {object} user     Supabase auth user  ({ id, email })
 * @param {object} profile  Supabase profiles row ({ business_name, ... })
 * @param {'monthly'|'annual'|'lifetime'} plan  Selected subscription plan
 * @returns {string}        Full HTTPS URL to open in the system browser
 */
export function buildPayFastURL(user, profile, plan = 'lifetime') {
  const params = new URLSearchParams({
    plan,
    user_id: user?.id    || '',
    email:   user?.email || '',
    name:    profile?.business_name || '',
  })

  return `https://fundiai.co.za/fundibill-buy.php?${params.toString()}`
}
