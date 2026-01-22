import { NextResponse } from "next/server";

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("query");
    const placeId = searchParams.get("placeId");

    const API_KEY = process.env.GOOGLE_PLACES_API_KEY;

    if (!API_KEY) {
      return NextResponse.json(
        { error: "API key missing" },
        { status: 500 }
      );
    }

    /* 🔍 SEARCH */
    if (query) {
      const url =
        "https://maps.googleapis.com/maps/api/place/textsearch/json" +
        `?query=${encodeURIComponent(query)}` +
        `&key=${API_KEY}`;

      const res = await fetch(url);
      const json = await res.json();

      return NextResponse.json(
        json.results.map((p) => ({
          placeId: p.place_id,
          name: p.name,
          address: p.formatted_address,
        }))
      );
    }

    /* 🏢 DETAILS */
    if (placeId) {
      const url =
        "https://maps.googleapis.com/maps/api/place/details/json" +
        `?place_id=${placeId}` +
        `&fields=name,formatted_address` +
        `&key=${API_KEY}`;

      const res = await fetch(url);
      const json = await res.json();
      return NextResponse.json(json.result);
    }

    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 }
    );
  } catch (e) {
    return NextResponse.json(
      { error: e.message },
      { status: 500 }
    );
  }
}
