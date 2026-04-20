"use client";

import { useActionState } from "react";
import { signInWithMagicLink } from "./actions";

export default function LoginPage() {
  const [state, action, isPending] = useActionState(signInWithMagicLink, null);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">
          Finanzas Familia
        </h1>
        <p className="text-sm text-gray-500 mb-8">
          Introduce tu email para entrar
        </p>

        {state?.success ? (
          <div className="rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
            Revisa tu correo — te hemos enviado un enlace para entrar.
          </div>
        ) : (
          <form action={action} className="flex flex-col gap-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="tu@email.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent"
              />
            </div>

            {state?.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isPending ? "Enviando…" : "Enviar enlace de acceso"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
