import { type NextRequest, NextResponse } from "next/server";

// Middleware temporalmente neutralizado para diagnóstico
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|api/debug-env|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
