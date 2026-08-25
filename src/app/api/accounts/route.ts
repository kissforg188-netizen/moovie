import { NextResponse } from "next/server";
import { mergeAccounts } from "@/lib/accounts";
import { updateDb, readDb } from "@/lib/db";
import type { AccountKey, AccountReadyStatus } from "@/lib/types";

export async function GET() {
  const db = await readDb();
  return NextResponse.json({ accounts: mergeAccounts(db.accounts) });
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as {
    key?: AccountKey;
    status?: AccountReadyStatus;
    notes?: string;
  };

  if (!body.key || !body.status) {
    return NextResponse.json(
      { error: "ต้องระบุ key และ status" },
      { status: 400 },
    );
  }

  const allowed: AccountReadyStatus[] = [
    "not_ready",
    "ready",
    "logged_in_today",
  ];
  if (!allowed.includes(body.status)) {
    return NextResponse.json({ error: "status ไม่ถูกต้อง" }, { status: 400 });
  }

  const db = await updateDb((current) => {
    const accounts = mergeAccounts(current.accounts);
    const idx = accounts.findIndex((a) => a.key === body.key);
    if (idx === -1) return current;
    accounts[idx] = {
      ...accounts[idx],
      status: body.status!,
      notes: body.notes?.trim() || accounts[idx].notes,
      updatedAt: new Date().toISOString(),
    };
    current.accounts = accounts;
    return current;
  });

  return NextResponse.json({ accounts: mergeAccounts(db.accounts) });
}
