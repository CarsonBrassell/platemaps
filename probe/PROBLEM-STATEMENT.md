# PlateMaps — restaurant coverage problem (for a second opinion)

## What we're building
A San Diego restaurant discovery site. Launching ~Sept 18, 2026. Each restaurant
on the site shows: name, address, coordinates, a star rating, a review count, and
a photo. A restaurant is only published if it has **all** of those. Missing any
one of them and it stays invisible.

## How many restaurants there actually are
From County of San Diego health permits (17,503 total permits):

| | count |
|---|---|
| Permits typed "Restaurant Food Facility" | 9,290 |
| minus sub-units inside one venue (zoo kitchens, hotel banquet lines) | −560 |
| **standalone restaurants** | **8,730** |
| minus national chains, closed, duplicates, churches/hospitals/schools | −1,408 |
| **independents worth listing** | **7,322** |

## Where we are
- **4,611** restaurants currently published.
- **1,585** rows are already imported, not excluded, and still unpublished.
  Of those, **1,574 have no rating** and 1,562 have no photo. Zero are missing
  coordinates. Rating is the single blocker.
- **~3,000** real independents have never been imported at all — we know they
  exist from the permit list, we just have no record for them.

So the gap to full coverage is about **4,585 restaurants needing a rating and a
photo**.

## The actual problem
Names, addresses and coordinates are free (public permit data + geocoding).
**Ratings and photos are not.** And almost no data source lets us legally store
and display them.

What we checked:

- **Google Places API** — has ratings, review counts, and photos. Terms permit
  what we're doing. Costs money: Text Search Pro $32/1k calls, Place Details
  $20/1k, Place Photo $7/1k. Free tier is 5,000 / 1,000 / 1,000 per calendar
  month; September's is already spent, resets Oct 1.
- **Serper / SerpApi / Outscraper** — cheap ($50 for 50,000 credits) but they are
  Google scrapers. Google filed a DMCA suit against SerpApi in Dec 2025, still in
  litigation. They also return no photos.
- **Yelp** — forbids caching results past 24 hours and forbids blending their
  ratings with other sources. We blend. Non-starter.
- **Foursquare** — terms explicitly ban using their data to build your own
  location database. That is exactly what we're doing.
- **OpenStreetMap / Overture** — free and unrestricted, but carry no ratings and
  no photos at all.
- **Apple Maps** — ratings not exposed via API.
- **TripAdvisor Content API** — plausible; storage/caching terms not verified.

## The cost, if we just pay Google
4,585 restaurants × (search + details + photo):

- **$234** if we run it all today.
- **~$97** if the bulk waits for the Oct 1 free-tier reset.
- **~$70** if split across October and November.

Realistically we'd land near **6,800 published**, not 7,322 — some won't be
findable on Google and some turn out to be closed.

## Blockers on our side
- Billing is not enabled on the Google Cloud project.
- No spend has been approved yet.

## The questions we want a second opinion on
1. Is there a data source with ratings and photos for US restaurants whose terms
   permit indefinite storage and public display, that we've missed?
2. Is $234 (or $97 staged) actually the right call, or is there a materially
   cheaper legitimate path?
3. Should we drop the photo requirement, or the rating requirement, and publish
   restaurants with just name + address + coordinates? The site's UI already
   handles a missing photo gracefully. Dropping the photo gate alone only gains
   11 restaurants — rating is the real gate. Dropping the *rating* gate would
   publish ~1,574 immediately, for free. Is a rating-less listing worse than no
   listing at all?
