# Dish review — 2026-09-10

18 posts naming a plate across 15 restaurants.

- **menu-typo** — 1 · Misspellings of a dish already on the menu
- **new-dish** — 0 · New dish — two or more people named it
- **new-dish-photo** — 11 · New dish — one person, with a photo
- **held** — 2 · Held — one person, no photo
- 4 spellings already matched a menu dish exactly (not shown).
- 0 spellings were decided in an earlier pass (not shown).

## How to review this

Each item carries a `decision:` line pre-filled with the default for its bucket. Change it or leave it, then run:

```
node --env-file=.env.local scripts/apply-dish-review.mjs probe/dish-review-2026-09-10.md
```

That prints what it would do and writes nothing. Add `--apply` to write. Valid decisions are `promote` (add it to the menu as its own row), `alias` (re-point the posts at an existing spelling, add no row), `reject` (record that this is not a dish, so it stops being proposed) and blank (leave it for another day).

`name:` is the spelling that gets written. Edit it freely — for `promote` it becomes the dish's name, and for `alias` it has to match a dish already on that restaurant's menu or the apply refuses the item.


## Misspellings of a dish already on the menu (1)

<!-- item n=1 r=5 bucket=menu-typo folds=tiramis -->
### 1. Tiramisu — Buona Forchetta

```
decision: alias
name: Tiramisu
```

Menu already lists **Tiramisu** (`5-42`).

> **“Tiramisù”** · Sam Whitaker · 2026-08-08 · 89.0% · $8 · [photo](https://images.unsplash.com/photo-1559847844-5315695dadae?w=1080&q=80&fm=jpg&fit=crop)  
> Came for the pizza, stayed for this. Soaked all the way through, not soggy. Split it and still wanted my own.


## New dish — one person, with a photo (11)

<!-- item n=2 r=3824 bucket=new-dish-photo folds=steak -->
### 2. Steak — Aztec Food Hub

```
decision: 
name: Steak
```

1 post, 1 person.

> **“Steak”** · Kreem · 2026-09-10 · 80.0% · [photo](https://70xwh4kizzssi7so.public.blob.vercel-storage.com/posts/0360fd2f-27df-48f9-96fd-47ee0b7f144b/37941013-e149-41be-ae32-e5a225371bde.jpg)  
> Holy busssssin

<!-- item n=3 r=13 bucket=new-dish-photo folds=cortado and a morning bun -->
### 3. Cortado and a morning bun — Breakfast Republic

```
decision: 
name: Cortado and a morning bun
```

1 post, 1 person.

> **“Cortado and a morning bun”** · Ben Ortiz · 2026-08-09 · 84.0% · $9 · [photo](https://images.unsplash.com/photo-1567620905732-2d1ec7ab7445?w=1080&q=80&fm=jpg&fit=crop)  
> Sat in the garden for an hour and nobody rushed me. The bun is laminated properly — shatters when you pull it.

<!-- item n=4 r=5 bucket=new-dish-photo folds=burrata -->
### 4. Burrata — Buona Forchetta

```
decision: 
name: Burrata
```

1 post, 1 person.

> **“Burrata”** · calvin lensink  · 2026-08-24 · 88.0% · $16.00 · [photo](https://images.unsplash.com/photo-1592417817098-8fd3d9eb14a5?w=1080&q=80&fm=jpg&fit=crop)  
> Heirloom tomato underneath, grilled bread on the side, ate it in the alley out back while the oven roared.

<!-- item n=5 r=20 bucket=new-dish-photo folds=pulled pork sandwich -->
### 5. Pulled pork sandwich — Cali BBQ

```
decision: 
name: Pulled pork sandwich
```

1 post, 1 person.

> **“Pulled pork sandwich”** · calvin lensink  · 2026-08-22 · 84.0% · $12.00 · [photo](https://images.unsplash.com/photo-1528735602780-2552fd46c7af?w=1080&q=80&fm=jpg&fit=crop)  
> Pulled, not shredded to mush, and the slaw goes on top where it belongs. Twelve dollars and I did not need dinner.

<!-- item n=6 r=2 bucket=new-dish-photo folds=hot honey pepperoni pizza -->
### 6. Hot honey pepperoni pizza — Landini's Pizzeria

```
decision: 
name: Hot honey pepperoni pizza
```

1 post, 1 person.

> **“Hot honey pepperoni pizza”** · Maya Ellis · 2026-08-09 · 92.0% · $18 · [photo](https://images.unsplash.com/photo-1513104890138-7c749659a591?w=1080&q=80&fm=jpg&fit=crop)  
> Crispy crust, spicy honey, and definitely worth ordering again. Got there right at open and walked straight in.

<!-- item n=7 r=12 bucket=new-dish-photo folds=grilled mahi plate -->
### 7. Grilled mahi plate — Mitch's Seafood

```
decision: 
name: Grilled mahi plate
```

1 post, 1 person.

> **“Grilled mahi plate”** · calvin lensink  · 2026-08-23 · 86.0% · $17.00 · [photo](https://images.unsplash.com/photo-1580476262798-bddd9f4b7369?w=1080&q=80&fm=jpg&fit=crop)  
> Dockside, paper plate, boats unloading twenty feet away. Mahi grilled hard on one side and left alone otherwise.

<!-- item n=8 r=10150 bucket=new-dish-photo folds=pumpkin pie froyo -->
### 8. Pumpkin Pie froyo — SDSU Faculty Staff Club

```
decision: 
name: Pumpkin Pie froyo
```

1 post, 1 person.

> **“Pumpkin Pie froyo”** · Jackwhit · 2026-09-09 · 65.0% · photo (private)  
> Good but too rich. Gets old after a while.

<!-- item n=9 r=7 bucket=new-dish-photo folds=chirashi bowl -->
### 9. Chirashi bowl — Sushi Ota

```
decision: 
name: Chirashi bowl
```

1 post, 1 person.

> **“Chirashi bowl”** · Priya Nair · 2026-08-08 · 94.0% · $32 · [photo](https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=1080&q=80&fm=jpg&fit=crop)  
> Ordered the chirashi instead of omakase and regret nothing. Everything tasted like it was cut that morning.

<!-- item n=10 r=7 bucket=new-dish-photo folds=toro nigiri -->
### 10. Toro nigiri — Sushi Ota

```
decision: 
name: Toro nigiri
```

1 post, 1 person.

> **“Toro nigiri”** · calvin lensink  · 2026-08-25 · 94.0% · $9.00 · [photo](https://images.unsplash.com/photo-1617196034796-73dfa7b1fd56?w=1080&q=80&fm=jpg&fit=crop)  
> Sat at the bar on a Tuesday. Toro first, then whatever he handed over. No menu, no decisions, no complaints.

<!-- item n=11 r=16 bucket=new-dish-photo folds=marlin taco -->
### 11. Marlin taco — Tacos El Gordo

```
decision: 
name: Marlin taco
```

1 post, 1 person.

> **“Marlin taco”** · Diego Alvarez · 2026-08-09 · 96.0% · $4.50 · [photo](https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=1080&q=80&fm=jpg&fit=crop)  
> Still the best $4.50 in the city. Smoked marlin, no line at 11am on a Tuesday.

<!-- item n=12 r=16 bucket=new-dish-photo folds=carne asada taco -->
### 12. Carne asada taco — Tacos El Gordo

```
decision: 
name: Carne asada taco
```

1 post, 1 person.

> **“Carne asada taco”** · calvin lensink  · 2026-08-19 · 89.0% · $3.50 · [photo](https://images.unsplash.com/photo-1615870216519-2f9fa575fa5c?w=1080&q=80&fm=jpg&fit=crop)  
> Ticket line, then the meat line, then out to the parking lot. Three fifty a taco and worth the whole ceremony.


## Held — one person, no photo (2)

<!-- item n=13 r=609 bucket=held folds=tasting menu -->
### 13. Tasting menu — Addison

```
decision: 
name: Tasting menu
```

1 post, 1 person.

> **“Tasting menu”** · Marco Ferrante · 2026-08-17 · 98.0% · $345.00  
> Three stars and the thing I keep thinking about is one bite of abalone. Four hours and not a second of dead air in it.

<!-- item n=14 r=11477 bucket=held folds=goody yummy cookie -->
### 14. Goody yummy cookie — That Girl Can Bake

```
decision: 
name: Goody yummy cookie
```

1 post, 1 person.

> **“Goody yummy cookie”** · Kreem · 2026-09-09 · 69.0%  
> Mmmmmm cookie

