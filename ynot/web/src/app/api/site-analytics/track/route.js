import { NextResponse } from "next/server";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://newsameep-backend.go-kar.net";

export async function POST(request) {
  try {
    const body = await request.json();

    const res = await fetch(`${BACKEND_BASE_URL}/api/site-analytics/track`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body || {}),
      cache: "no-store",
    });

    const data = await res.json().catch(() => ({}));
    return NextResponse.json(data, { status: res.status });
  } catch (error) {
    return NextResponse.json(
      {
        message: "Site analytics track proxy failed",
      },
      { status: 500 }
    );
  }
}
