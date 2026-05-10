import { NextResponse } from "next/server";

export async function GET() {
  // This is a placeholder endpoint for demonstrating the StatusIndicator component.
  // It is intentionally public for this demonstration and does not require authentication.
  // In a production environment, this endpoint would be protected.
  // verify_jwt: false
  try {
    // In a real application, you would fetch the status from a database or a monitoring service
    const statuses = ["pending", "in-progress", "complete", "error"];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return NextResponse.json({ status: randomStatus });
  } catch (error) {
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
