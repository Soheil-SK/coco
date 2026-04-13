import { OFFICIAL_FUELS } from "@/lib/fuels/catalog";
import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(OFFICIAL_FUELS);
}
