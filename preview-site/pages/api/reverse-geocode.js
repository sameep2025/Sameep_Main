export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const lat = Number(req.query.lat ?? req.query.latitude);
  const lng = Number(req.query.lng ?? req.query.lon ?? req.query.longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'Invalid lat/lng' });
  }

  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat.toFixed(6))}&lon=${encodeURIComponent(lng.toFixed(6))}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        // Per Nominatim usage policy: include a valid identifying User-Agent with contact
        'User-Agent': process.env.NEXT_PUBLIC_APP_UA || 'preview-site/1.0 (contact: admin@example.com)'
      },
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Upstream error ${upstream.status}` });
    }

    const data = await upstream.json();
    const city = data?.address?.city || data?.address?.town || data?.address?.village || '';
    const area = data?.address?.suburb || data?.address?.neighbourhood || '';

    // Allow some caching to be nice to the service (adjust as needed)
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=3600');
    res.setHeader('Access-Control-Allow-Origin', '* ');

    return res.status(200).json({
      ok: true,
      lat,
      lng,
      display_name: data?.display_name || '',
      address: data?.address || {},
      city,
      area,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Reverse geocoding failed' });
  }
}
