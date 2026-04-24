import { NextResponse } from 'next/server';
import { readRepairData, writeRepairData } from '@/utils/jsonDataHandler'; // Adjust path if needed

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const { id } = params;
  const { status } = await request.json(); // Expecting { status: "NewStatus" }

  if (!status) {
    return NextResponse.json({ message: 'Status is required' }, { status: 400 });
  }

  try {
    const repairs = await readRepairData();
    const repairIndex = repairs.findIndex((r: any) => r.id === id);

    if (repairIndex === -1) {
      return NextResponse.json({ message: 'Repair request not found' }, { status: 404 });
    }

    // Update the specific repair
    repairs[repairIndex] = {
      ...repairs[repairIndex],
      status: status,
      lastUpdatedAt: new Date().toISOString(),
    };

    await writeRepairData(repairs);

    // --- Real-time update mechanism will be added here later ---
    // For now, just return the updated item
    return NextResponse.json(repairs[repairIndex]);

  } catch (error) {
    console.error(`API Error PUT /api/admin/repairs/${id}:`, error);
    return NextResponse.json({ message: 'Failed to update repair status' }, { status: 500 });
  }
}
