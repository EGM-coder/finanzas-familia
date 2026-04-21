import { NextResponse } from "next/server";

const VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "NEXT_PUBLIC_SITE_URL",
] as const;

export async function GET() {
  const result = Object.fromEntries(
    VARS.map((key) => {
      const value = process.env[key];
      return [
        key,
        {
          defined: value !== undefined,
          length: value?.length ?? 0,
          preview: value ? value.slice(0, 10) : null,
        },
      ];
    })
  );

  return NextResponse.json(result);
}
