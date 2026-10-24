# Open questions for Daan

## What was done overnight (2026-10-23/24), each committed and pushed

| Commit | What |
|---|---|
| e210e50 | Animations on the history clock: pause freezes them; great moments slow history; follow a realm; ‹ › jump between great moments |
| 209f473 | Diplomacy 2: wars end within ~10 years by peace (terms from a war score), then a 20-40 year truce; events dated to the month |
| 163b88c | Diplomacy 3: allies answer calls to arms (or refuse), the threatened seek allies, coalitions against an overgrown realm |
| c7a77e4 | Diplomacy 4: tribute is vassalage; small realms become vassals, absorbed decades later or breaking free |
| 59d9289 | Diplomacy 5: a Diplomacy map mode, treaty lines in the tooltip, "Wars and treaties" on a realm's page |
| d3a07e8 | Economy: income, upkeep, treasury and bankruptcy in talents / crowns; a Wealth statistics tab |
| 39b9588 | Technology: 22 / 20 named discoveries by age that spread through contacts and strengthen realms |

All of these change every history except the first. Checked on seeds 7, 42 and 3 of both packs (no
errors; every map mode, realm and region page and statistics tab opened in headless Edge). Not
checked in a real browser with playback running: the built-in browser refused localhost and file://
while you were away, and headless Edge does not run animation frames, so the slow-down was tested by
simulating the playback loop.

24. **The chronicle got denser:** about 4,500-5,000 entries a historical history (was about 3,500),
    from peaces, alliances, calls to arms, vassals, discoveries, bankruptcies and changes of type.
    Trim (e.g. lower some to importance 1, or drop "call refused" and "lord defends")?
    **(went with: as is)**
25. **Realm counts at the end:** historical 10-13, fantasy 10-24 depending on the seed (fantasy has
    fewer vassals). Fine, or should fantasy consolidate more? **(went with: as is)**


Questions that came up while working through the night of 2026-10-23. I went ahead with the
choice marked **(went with)** for each, so nothing is blocked; tell me where you want it different.

## Playback and animations

1. **"Slow sometimes" budget.** History slows for a great moment while a bank of held time lasts
   (2 s earned per century, at most 8 s saved up). A whole history at 50 yr/s then takes about
   2.5 min (historical) or 1.7 min (fantasy) instead of 1.5 / 1 min. "Slow for all major" takes
   about 3.4 / 1.7 min. More or less? **(went with: 2 s per century)**
2. **What counts as a great moment** for the slow-down: a large conquest (8+ regions), a sea
   invasion or sea battle, a breakaway, a capital moving, a realm's land lost, a city burning;
   for the ‹ › buttons, any chronicle entry of importance 4+. Wonders and new ages don't slow
   history. **(went with: that list)**
3. **Pausing during a jump.** Pausing freezes everything; jumping to a moment while paused
   (scrubbing, ‹ ›, a link) still plays that moment out. Should a jump while paused also stay
   frozen until you press play? **(went with: a jump plays its moment)**

## Diplomacy: wars

4. **War length.** Wars now end within about 10 years (half last 6-7, a tenth a single season).
   The odds of peace each 5-year step: 30% + up to 60% the more one-sided the war score + 35% once
   it is 4 years old; at 8 years it ends. Shorter? **(went with: that)**
5. **Peace terms.** One-sided wars (score 0.4+ of 1 in fantasy, about the same in historical) end
   with a province ceded or tribute; the rest end in a draw. Most wars end in a draw now. More
   decisive peaces? **(went with: that)**
6. **Truces** last 20-40 years; a war declared during one breaks it and is remembered as a
   grievance. **(went with: that)**
7. **Event dates.** Events are dated to the month within their 5-year step (ev.date), spread evenly
   in the order they happened; the chronicle still shows the year of the step. Show the dates
   ("spring 1203") in the chronicle? **(went with: not yet; dates used for war lengths)**

## Diplomacy: alliances and coalitions

8. **Coalitions don't stop the giants yet.** A realm 4x the median and 2x the next draws a coalition
   of up to 5 uneasy neighbours (at most once a century per giant); they ally, go to war together and
   get extra war turns. In historical worlds one empire of 2,000-3,000 regions still forms in most
   seeds (seed 7: the largest went 2,936 -> 1,363 with an early version, then back up). Should
   coalitions be much stronger (e.g. the giant's provinces rebel when it loses a coalition war, or
   the consolidation pressure stops feeding the largest realm)? **(went with: as is; tune with you)**
9. **Calls to arms are defensive only:** allies join when their ally is attacked, not when it attacks.
   A truce with the attacker makes an ally less keen (not unwilling). Refusing is remembered and
   breaks the alliance half the time. Alliances last 40-80 years (coalition pacts 30) and lapse
   early when the two come to dislike each other. **(went with: that)**
10. **Allies and truce partners are no longer "rivals"** to the packs' events, so they are not
    picked for wars, raids or tribute demands while the treaty holds. **(went with: that)**

## Diplomacy: vassals

11. **Small realms become vassals first.** Historical "absorb-minor" and fantasy "fealty-sworn" now make
    the small neighbour a vassal instead of ending it at once. After 30+ years a vassal a third of its
    lord's size or less is folded in (25% a step while the world has more realms than its target,
    else 6%). A vassal nearly as strong as its lord (after 20 years), or whose lord fights two wars,
    may break free (20% a step), half the time with a war. **(went with: that)**
12. **What a vassal owes:** -0.1 wealth to the lord (+0.03 a vassal, at most +0.15), its levies in
    every war its lord fights (silently, no chronicle entry), and its lord defends it (80%). Tribute
    from a peace or a demand is the same thing as vassalage now. **(went with: that)**
13. **Fantasy has few vassals and ends with 19-21 realms** in two of four seeds (historical 10). Its
    fealty event fires less often than historical absorb-minor. Push fantasy consolidation harder?
    **(went with: as is)**

## Diplomacy: on the map and in the encyclopedia

14. **Diplomacy map mode:** colours every realm by how it stands with the realm under the cursor (else
    the selected land's realm, else the followed one): at war red, allied green, its lord purple, its
    vassals teal, truce amber, trade or marriage pale green, the rest a neutral parchment. With no realm
    in focus it shows every realm at war and every vassal. The colours are new, not from a sample. Want
    a sample round for them first? **(went with: these colours)**
15. **"Wars and treaties" on a realm's page** (newest first, at most 40, with links to the entries that
    began and ended each) instead of a page per war. A real war page (sides, battles, score, terms)
    would need a new kind of encyclopedia entry; worth it? **(went with: the list, no war pages yet)**

## Economy (no plan was agreed; I went ahead with this)

16. **Money in real units:** each realm has a yearly income and a treasury in the pack's currency
    (historical: talents, about 26 kg of silver; fantasy: crowns). A late great empire makes 40-100
    thousand talents a year, a small kingdom 2-5 thousand. Other currencies (per culture, per age)?
    **(went with: one currency per pack)**
17. **Where income comes from:** people (0.0015 a head a year x (0.4 + tech)), mines and luxuries
    (metal and exotic resources of its land), ports, trade treaties (each adds 5% of what its people
    make, at most four), vassals' tribute (15% of their income), loot from sacks.
    **Where it goes:** soldiers 0.05 and ships 0.8 a year, half again at war. Surplus fills a treasury
    holding at most three years' income. **(went with: that)**
18. **Bankruptcy:** debt beyond twice the income means unpaid soldiers: a third of the army leaves,
    stability falls, debts are written down, one chronicle entry per realm per 50 years (about 25
    in a historical history, 5 in fantasy, mostly huge steppe armies). **(went with: that)**
19. **What money does to history so far:** the treasury moves the old 0-1 wealth score by up to
    0.15 either way, and bankruptcy shrinks armies. Nothing yet buys things (wonders, mercenaries,
    fleets, bribes). Next steps I'd propose: spending (armies and fleets bought from the treasury,
    wonders that cost), trade routes drawn on the map, and economic events (booms, debasement, crashes)
    reading the real numbers. **(went with: not done yet)**

## Technology (no plan was agreed; I went ahead with this)

20. **Named technologies:** 22 historical (bronze, writing, wheel, war chariot, sail, irrigation; iron,
    alphabet, coinage, oared warship; cement and the arch, paved roads, siege engines, astronomy;
    heavy plough, stirrup, compass, banking; gunpowder, printing, ocean-going ship, joint-stock
    company) and 20 fantasy (bronze-and-bone smithing ... reckoning engines), each opening at an age.
    Different lists, more or fewer? **(went with: those lists)**
21. **How they spread:** found alone rarely (about 1.5% a step for a curious, learned realm), learned
    from contacts often (12% a step per neighbour, trade partner, ally, marriage partner, lord or
    vassal that knows it, at most 60%). Only the first discovery is a chronicle entry. Historical
    seed 7: iron first in 1455 BC, the heavy plough 385 AD, gunpowder 1010 AD.
    **(went with: that)**
22. **What they do:** multiply battle strength (army or navy), the people the land can feed, or what
    people make; and nudge the old 0-1 tech number up a little. They don't yet change the map,
    the sprites (e.g. cannon, galleons) or unlock events. Should technologies show (new unit sprites
    per age, ships changing shape)? Can knowledge be lost when a realm falls? **(went with: not yet)**
23. **The old flavour events** (historical "invention", "printing-press", "gunpowder-adopted"; fantasy
    schools) still fire on their own and are not tied to the named technologies. Tie them together?
    **(went with: left as they are)**
