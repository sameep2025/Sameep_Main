require("dotenv").config();
const axios = require("axios");
const { createObjectCsvWriter } = require("csv-writer");

const GOOGLE_KEY =
  process.env.GOOGLE_PLACES_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY;

if (!GOOGLE_KEY) {
  console.error("Missing GOOGLE_MAPS_API_KEY");
  process.exit(1);
}

const area = process.argv[2];

if (!area) {
  console.log("Usage: node tools/vendorLeadExtractor.js <AreaName>");
  process.exit(1);
}

const results = [];
const seenPlaceIds = new Set();

async function searchQuery(query) {
  console.log("Searching:", query);

  let nextPageToken = null;

  do {
    const res = await axios.get(
      "https://maps.googleapis.com/maps/api/place/textsearch/json",
      {
        params: {
          query,
          pagetoken: nextPageToken || undefined,
          key: GOOGLE_KEY,
        },
      }
    );

    const places = res.data.results || [];

    for (const place of places) {
      if (seenPlaceIds.has(place.place_id)) continue;

      seenPlaceIds.add(place.place_id);

      await fetchDetails(place.place_id);
    }

    nextPageToken = res.data.next_page_token;

    if (nextPageToken) {
      console.log("Loading next page...");
      await new Promise((r) => setTimeout(r, 2000));
    }
  } while (nextPageToken);
}

async function fetchDetails(placeId) {
  try {
    const res = await axios.get(
      "https://maps.googleapis.com/maps/api/place/details/json",
      {
        params: {
          place_id: placeId,
          fields:
            "name,formatted_phone_number,website,formatted_address,rating,user_ratings_total,geometry",
          key: GOOGLE_KEY,
        },
      }
    );

    const p = res.data.result;

    if (!p) return;

    results.push({
      name: p.name || "",
      phone: p.formatted_phone_number || "",
      address: p.formatted_address || "",
      rating: p.rating || "",
      reviews: p.user_ratings_total || "",
      website: p.website || "",
      lat: p.geometry?.location?.lat || "",
      lng: p.geometry?.location?.lng || "",
    });

    console.log("Added:", p.name);
  } catch (err) {
    console.log("Details failed:", err.message);
  }
}

async function run() {
  const queries = [
   // `salon near ${area}`,
    //`barber shop near ${area}`,
    //`hair salon near ${area}`,
    `unisex salon near ${area}`,
   // `Makeup Artists in ${area}`,
   // `women beauty parlour in ${area}`,

  ];

  for (const query of queries) {
    await searchQuery(query);
  }

  const fileName = `salons_${area.toLowerCase().replace(/\s/g, "_")}.csv`;

  const csvWriter = createObjectCsvWriter({
    path: fileName,
    header: [
      { id: "name", title: "Salon Name" },
      { id: "phone", title: "Phone" },
      { id: "address", title: "Address" },
      { id: "rating", title: "Rating" },
      { id: "reviews", title: "Reviews" },
      { id: "website", title: "Website" },
      { id: "lat", title: "Latitude" },
      { id: "lng", title: "Longitude" },
    ],
  });

  await csvWriter.writeRecords(results);

  console.log("=================================");
  console.log("CSV created:", fileName);
  console.log("Total salons:", results.length);
  console.log("=================================");
}

run();