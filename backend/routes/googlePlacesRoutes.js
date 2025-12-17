const express = require("express");
const axios = require("axios");

const router = express.Router();

function getPlacesApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new Error("Missing GOOGLE_PLACES_API_KEY in environment");
  }
  return key;
}

// Search businesses by free-text query (name + city, etc.)
router.get("/search", async (req, res) => {
  try {
    const query = String(req.query.query || "").trim();
    if (!query) {
      return res.status(400).json({ message: "Missing query" });
    }

    const key = getPlacesApiKey();

    // Using Places API Text Search endpoint
    const url = "https://maps.googleapis.com/maps/api/place/textsearch/json";
    const params = {
      query,
      key,
    };

    const response = await axios.get(url, { params });
    const data = response.data || {};
    const results = Array.isArray(data.results) ? data.results : [];

    const simplified = results.map((r) => ({
      placeId: r.place_id,
      name: r.name,
      address: r.formatted_address,
      location: r.geometry?.location || null,
      types: r.types || [],
      rating: r.rating || null,
      userRatingsTotal: r.user_ratings_total || null,
    }));

    return res.json({
      status: data.status || null,
      error_message: data.error_message || null,
      results: simplified,
    });
  } catch (err) {
    console.error("[Places] /search error", err.response?.data || err.message || err);
    const status = err.response?.status || 500;
    return res.status(status).json({
      message: "Failed to search places",
      details: err.response?.data || null,
    });
  }
});

// Get detailed info for a single place by placeId
router.get("/details", async (req, res) => {
  try {
    const placeId = String(req.query.placeId || "").trim();
    if (!placeId) {
      return res.status(400).json({ message: "Missing placeId" });
    }

    const key = getPlacesApiKey();

    const url = "https://maps.googleapis.com/maps/api/place/details/json";
    const params = {
      place_id: placeId,
      key,
      // Explicitly request the fields we care about to keep response small
      fields: [
        "place_id",
        "name",
        "formatted_address",
        "geometry/location",
        "formatted_phone_number",
        "international_phone_number",
        "website",
        "opening_hours/weekday_text",
        "opening_hours/periods",
        "types",
        "url",
        "photos",
      ].join(","),
    };

    const response = await axios.get(url, { params });
    const result = response.data?.result || null;
    if (!result) {
      return res.status(404).json({ message: "Place not found" });
    }

    const data = {
      placeId: result.place_id,
      name: result.name || "",
      address: result.formatted_address || "",
      location: result.geometry?.location || null,
      phone: result.international_phone_number || result.formatted_phone_number || "",
      internationalPhoneNumber: result.international_phone_number || "",
      formattedPhoneNumber: result.formatted_phone_number || "",
      website: result.website || "",
      openingHoursText: result.opening_hours?.weekday_text || [],
      openingHoursPeriods: result.opening_hours?.periods || [],
      types: result.types || [],
      mapsUrl:
        result.url ||
        (result.place_id
          ? `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(result.place_id)}`
          : ""),
      photos: Array.isArray(result.photos)
        ? result.photos.map((p) => ({
            photoReference: p.photo_reference,
            width: p.width,
            height: p.height,
          }))
        : [],
    };

    return res.json({ place: data });
  } catch (err) {
    console.error("[Places] /details error", err.response?.data || err.message || err);
    return res.status(500).json({ message: "Failed to fetch place details" });
  }
});

module.exports = router;
