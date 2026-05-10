import { NextResponse } from "next/server";

export async function GET() {
  // In a real application, you would fetch the status from a database or a monitoring service
  const statuses = ["pending", "in-progress", "complete", "error"];
  const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

  return NextResponse.json({ status: randomStatus });
}
