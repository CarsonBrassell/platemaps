const KEY = process.env.SERPER_API_KEY || "";
console.log("key present:", KEY.length > 0, "len", KEY.length);
for (const body of [
  { q: "Handel's Homemade Ice Cream", ll: "@32.771,-117.071,16z", gl: "us", hl: "en", page: 1 },
  { q: "ice cream", ll: "@32.771,-117.071,16z", gl: "us", hl: "en", page: 1 },
]) {
  const res = await fetch("https://google.serper.dev/maps", { method: "POST", headers: { "X-API-KEY": KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  console.log("status", res.status, body.q);
  const txt = await res.text();
  if (!res.ok) { console.log(txt.slice(0, 300)); continue; }
  const j = JSON.parse(txt);
  for (const p of j.places ?? []) if (/handel|cream/i.test(p.title)) console.log(JSON.stringify({ title: p.title, address: p.address, cid: p.cid, placeId: p.placeId, lat: p.latitude, lng: p.longitude, rating: p.rating, ratingCount: p.ratingCount, type: p.type, types: p.types, website: p.website }));
}
