import { NextResponse } from "next/server";

export async function GET() {
  // TODO: Add authentication and authorization checks
  try {
    // In a real application, you would fetch the status from a database or a monitoring service
    const statuses = ["pending", "in-progress", "complete", "error"];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return NextResponse.json({ status: randomStatus });
  } catch (error) {
    console.error("Error fetching status:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
