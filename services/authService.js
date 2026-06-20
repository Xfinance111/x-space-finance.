import { supabase, supabaseAdmin } from '../config/supabase.js'

// Sign Up
export async function signUpWithSupabase(email, password, fullName = '') {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName }
    }
  })
  
  if (error) throw new Error(error.message)
  return { user: data.user, message: 'Sign up successful! Check email for verification.' }
}

// Login
export async function loginWithSupabase(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })
  
  if (error) throw new Error(error.message)
  
  // Get user role
  const { data: roleData } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', data.user.id)
    .single()
  
  return {
    user: data.user,
    session: data.session,
    role: roleData?.role || 'user'
  }
}

// Get Current User
export async function getCurrentUser(accessToken) {
  if (!accessToken) return null
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error) return null
  return data.user
}

// Logout
export async function logoutWithSupabase() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
  return { success: true }
}

// Check if user is admin
export async function isAdmin(userId) {
  const { data } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single()
  
  return data?.role === 'admin'
}