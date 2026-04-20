"use server";

import { createClient } from "@/lib/supabase/server";

export async function signInWithMagicLink(
  _prevState: { error?: string; success?: boolean } | null,
  formData: FormData
) {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Introduce tu email." };
  }

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  if (error) {
    return { error: "No se pudo enviar el enlace. Inténtalo de nuevo." };
  }

  return { success: true };
}
