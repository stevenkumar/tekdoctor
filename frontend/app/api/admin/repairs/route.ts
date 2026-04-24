import { NextResponse } from 'next/server';
import { readRepairData } from '@/utils/jsonDataHandler'; // Adjust path if needed

export async function GET() {
  try {
    const repairs = await readRepairData();
    return NextResponse.json(repairs);
  } catch (error) {
    console.error("API Error GET /api/admin/repairs:", error);
    return NextResponse.json({ message: 'Failed to fetch repair data' }, { status: 500 });
  }
}
