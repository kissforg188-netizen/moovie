import { NextResponse } from "next/server";
import { getAdapterStatuses } from "@/lib/adapters";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ adapters: getAdapterStatuses() });
}
