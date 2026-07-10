#!/usr/bin/env node
// ════════════════════════════════════════════════════════
// Table for Two — Venue Seed Script
// Generates SQL to populate venues, activities, providers,
// and booking_links from the curated London dataset.
//
// Usage:  node seed-venues.js > supabase-seed-v4.sql
//         Then paste into Supabase SQL Editor.
// ════════════════════════════════════════════════════════

const IDEAS = {
  budget: [
    {name:'Maltby Street Market brunch',loc:'Bermondsey · Street food',emoji:'🌮',img:'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=320&fit=crop&q=80',price:'avg. £13pp',why:'London\'s best street food market — casual, delicious, walkable',score:78,type:'outdoor',vibes:['Walkable']},
    {name:'Tate Modern + Thames walk',loc:'South Bank · Art & outdoors',emoji:'🖼️',img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=320&fit=crop&q=80',price:'Free–avg. £8pp',why:'Free world-class art on the South Bank',score:86,type:'outdoor',vibes:['Walkable','Unique / memorable']},
    {name:'TeamSport Go-Karting',loc:'Stratford · Indoor karting',emoji:'🏎️',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=320&fit=crop&q=80',price:'avg. £23pp',why:'Thrilling and competitive — guaranteed laughs',score:82,type:'all',vibes:['Unique / memorable']},
    {name:'BFI Southbank cinema + wine',loc:'South Bank · Film & culture',emoji:'🎬',img:'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Independent cinema right on the river',score:80,type:'outdoor',vibes:['Walkable']},
    {name:'Escape Hunt London',loc:'Holborn · Escape room',emoji:'🔐',img:'https://images.unsplash.com/photo-1608501078713-8e445a709b39?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Solve puzzles together — teamwork makes the dream work',score:79,type:'all',vibes:['Unique / memorable']},
    {name:'Rooftop Film Club screening',loc:'Peckham / Shoreditch · Outdoor cinema',emoji:'🎥',img:'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=320&fit=crop&q=80',price:'avg. £16pp',why:'Films under the stars with blankets and wine',score:83,type:'outdoor',vibes:['Outdoor seats','Unique / memorable']},
    {name:'Whistle Punks Axe Throwing',loc:'Shoreditch · Axe throwing',emoji:'🪓',img:'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=600&h=320&fit=crop&q=80',price:'avg. £19pp',why:'Unexpectedly brilliant fun — loud, silly, satisfying',score:77,type:'all',vibes:['Unique / memorable']},
    {name:'Battersea Park boating + picnic',loc:'Battersea · Outdoor',emoji:'🚣',img:'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&h=320&fit=crop&q=80',price:'avg. £14pp',why:'Relaxed, romantic London classic on the lake',score:77,type:'outdoor',vibes:['Walkable','Outdoor seats']},
    {name:'The Comedy Store',loc:'Soho · Live comedy',emoji:'🎭',img:'https://images.unsplash.com/photo-1527224857830-43a7acc85260?w=600&h=320&fit=crop&q=80',price:'avg. £16pp',why:'London\'s legendary comedy club — guaranteed laughter',score:74,type:'fun',vibes:['Live music']},
    {name:'Leake Street Arches street art walk',loc:'Waterloo · Street art',emoji:'🎨',img:'https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?w=600&h=320&fit=crop&q=80',price:'Free',why:'Banksy\'s famous graffiti tunnel',score:70,type:'outdoor',vibes:['Walkable']},
    {name:'Brindisa tapas + Borough Market',loc:'Borough · Spanish',emoji:'🥘',img:'https://images.unsplash.com/photo-1515443961218-a51367888e4b?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Best tapas beside London\'s greatest market',score:79,type:'fun',vibes:['Walkable','Live music']},
    {name:'Jenki matcha bar',loc:'Soho · Matcha café',emoji:'🍵',img:'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=600&h=320&fit=crop&q=80',price:'avg. £12pp',why:'London\'s best matcha lattes and mochi',score:80,type:'outdoor',vibes:['Walkable']},
    {name:'BXR Boxing gym session',loc:'Marylebone · Boxing',emoji:'🥊',img:'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Hit pads together, burn energy, then brunch',score:81,type:'all',vibes:['Unique / memorable']},
    {name:'Hotpod Yoga date',loc:'Various London · Hot yoga',emoji:'🧘',img:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=320&fit=crop&q=80',price:'avg. £16pp',why:'37-degree pod, dim lights, deep stretches — intimate and relaxing',score:79,type:'outdoor',vibes:['Walkable']},
    {name:'Toca Social',loc:'The O2 · Interactive football & bar',emoji:'⚽',img:'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Football meets arcade — smash targets, eat street food, drink cocktails',score:84,type:'fun',vibes:['Unique / memorable','Live music']},
  ],
  mid: [
    {name:'Hakkasan Mayfair dinner',loc:'Mayfair · Chinese',emoji:'✦',img:'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',why:'Michelin-starred Cantonese — moody, beautiful and romantic',score:93,type:'romantic',vibes:['Candlelit','Unique / memorable']},
    {name:'Dishoom dinner',loc:'Covent Garden · Indian',emoji:'✦',img:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=320&fit=crop&q=80',price:'avg. £33pp',why:'Bold flavours, always unmissable',score:92,type:'romantic',vibes:['Candlelit']},
    {name:'Secret Cinema evening',loc:'London · Immersive',emoji:'🎬',img:'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Live actors, costumes, and a film — unique and memorable',score:94,type:'all',vibes:['Unique / memorable']},
    {name:'O2 Arena concert night',loc:'Greenwich · Live music',emoji:'🎤',img:'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&h=320&fit=crop&q=80',price:'avg. £50pp',why:'Nothing beats live music together — electric atmosphere',score:88,type:'fun',vibes:['Live music','Unique / memorable']},
    {name:'The Crystal Maze LIVE Experience',loc:'Farringdon · Immersive game',emoji:'💎',img:'https://images.unsplash.com/photo-1511882150382-421056c89033?w=600&h=320&fit=crop&q=80',price:'avg. £48pp',why:'The iconic TV experience — team challenges across four zones',score:87,type:'all',vibes:['Unique / memorable']},
    {name:'Kew Gardens + riverside pub',loc:'Richmond · Outdoor',emoji:'🌿',img:'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'UNESCO world heritage gardens with riverside pub',score:81,type:'outdoor',vibes:['Walkable','Outdoor seats']},
    {name:'Kiln restaurant Soho',loc:'Soho · Thai',emoji:'🔥',img:'https://images.unsplash.com/photo-1555126634-323283e090fa?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'London\'s most exciting Thai — cooked over wood fire',score:89,type:'romantic',vibes:['Candlelit']},
    {name:'Ottolenghi dinner',loc:'Islington · Mediterranean',emoji:'🥗',img:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Ottolenghi\'s bold Mediterranean flavours',score:88,type:'outdoor',vibes:['Walkable']},
    {name:'Shakespeare\'s Globe Theatre',loc:'South Bank · Theatre',emoji:'🎭',img:'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600&h=320&fit=crop&q=80',price:'avg. £38pp',why:'Iconic open-air theatre on the Thames',score:87,type:'all',vibes:['Unique / memorable','Walkable']},
    {name:'All Star Lanes bowling + cocktails',loc:'Holborn · Boutique bowling',emoji:'🎳',img:'https://images.unsplash.com/photo-1545232979-8bf68ee9b1af?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Retro-cool boutique bowling with killer cocktails',score:81,type:'fun',vibes:['Live music']},
    {name:'Turning Earth pottery class',loc:'Hoxton · Pottery studio',emoji:'🏺',img:'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Make something together — silly and therapeutic',score:84,type:'all',vibes:['Unique / memorable']},
    {name:'Padella pasta dinner',loc:'Borough · Italian',emoji:'🍝',img:'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'London\'s best hand-rolled pasta — simple, romantic, delicious',score:86,type:'outdoor',vibes:['Walkable','Candlelit']},
    {name:'Barbican Cinema + cocktails',loc:'Barbican · Arts cinema',emoji:'🎬',img:'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Indie film in a stunning brutalist arts centre',score:80,type:'outdoor',vibes:['Walkable']},
    {name:'Alexandra Palace sunset terrace',loc:'North London · Views',emoji:'🌇',img:'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=600&h=320&fit=crop&q=80',price:'avg. £23pp',why:'Best panoramic views over London at golden hour',score:83,type:'outdoor',vibes:['Outdoor seats','Walkable']},
    {name:'Ironmonger Row Baths',loc:'Clerkenwell · Turkish baths',emoji:'🧖',img:'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Steam room, sauna and plunge pool — the ultimate wind-down',score:85,type:'outdoor',vibes:['Walkable']},
    {name:'Frame fitness class for two',loc:'Shoreditch · Fitness',emoji:'💪',img:'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Work out together — endorphins and an excuse for brunch',score:78,type:'all',vibes:['Unique / memorable']},
    {name:'Kobox boxing date',loc:'King\'s Road · Boxing',emoji:'🥊',img:'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'Neon-lit boxing studio — competitive, sweaty, brilliantly fun',score:83,type:'all',vibes:['Unique / memorable']},
    {name:'Reformer Pilates for two',loc:'Notting Hill · Pilates',emoji:'🤸',img:'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Side-by-side reformer beds — a controlled burn',score:82,type:'outdoor',vibes:['Walkable']},
    {name:'Yoga + brunch at Triyoga',loc:'Camden · Yoga & brunch',emoji:'🧘',img:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Flow class then plant-based brunch — the perfect slow morning',score:84,type:'outdoor',vibes:['Walkable']},
    {name:'Swingers crazy golf + cocktails',loc:'City / West End · Crazy golf',emoji:'⛳',img:'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'Crazy golf, street food and killer cocktails',score:86,type:'fun',vibes:['Unique / memorable','Live music']},
    {name:'Padel court session for two',loc:'Various London · Padel tennis',emoji:'🎾',img:'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=600&h=320&fit=crop&q=80',price:'avg. £22pp',why:'Easy to pick up, competitive and addictive',score:81,type:'all',vibes:['Unique / memorable']},
    {name:'Tsujiri matcha + mochi',loc:'Wardour Street, Soho · Matcha café',emoji:'🍵',img:'https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'Kyoto\'s famous matcha house — lattes, soft serve and mochi',score:84,type:'outdoor',vibes:['Walkable','Candlelit']},
  ],
  treat: [
    {name:'Sketch, Mayfair',loc:'Mayfair · Modern European',emoji:'🎨',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',why:'The egg-pod bathrooms, the pink dining room — unforgettable',score:85,type:'romantic',vibes:['Candlelit','Unique / memorable']},
    {name:'Novikov restaurant',loc:'Mayfair · Italian & Asian',emoji:'🥂',img:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=320&fit=crop&q=80',price:'avg. £100pp',why:'Mayfair\'s most glamorous dining room',score:88,type:'romantic',vibes:['Candlelit','Unique / memorable']},
    {name:'Bob Bob Ricard dinner',loc:'Soho · Anglo-Russian',emoji:'🍾',img:'https://images.unsplash.com/photo-1550966871-3ed3cbe818bb?w=600&h=320&fit=crop&q=80',price:'avg. £85pp',why:'Press for champagne buttons at every table',score:91,type:'romantic',vibes:['Candlelit','Unique / memorable']},
    {name:'Ronnie Scott\'s jazz night',loc:'Soho · Live music',emoji:'🎷',img:'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&h=320&fit=crop&q=80',price:'avg. £70pp',why:'London\'s most legendary jazz club — intimate and electric',score:83,type:'cultural',vibes:['Live music','Candlelit']},
    {name:'National Theatre + dinner at Brasserie Blanc',loc:'South Bank · Theatre & dining',emoji:'🎭',img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&h=320&fit=crop&q=80',price:'avg. £80pp',why:'World-class production + riverside dinner',score:88,type:'cultural',vibes:['Unique / memorable','Walkable']},
    {name:'Aqua Shard cocktails + dinner',loc:'London Bridge · Rooftop views',emoji:'🌆',img:'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=320&fit=crop&q=80',price:'avg. £95pp',why:'31st-floor views — the most romantic skyline in the city',score:87,type:'romantic',vibes:['Candlelit','Unique / memorable']},
    {name:'Electric Cinema, Notting Hill',loc:'Notting Hill · Luxury cinema',emoji:'🎬',img:'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=320&fit=crop&q=80',price:'avg. £75pp',why:'Leather armchairs, footstools, and wine — cinema reimagined',score:85,type:'fun',vibes:['Unique / memorable','Candlelit']},
    {name:'Brat restaurant',loc:'Shoreditch · Modern British',emoji:'🔥',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £80pp',why:'Michelin-starred Basque grill — outstanding every time',score:90,type:'foodie',vibes:['Candlelit','Unique / memorable']},
    {name:'Almeida Theatre + Ottolenghi dinner',loc:'Islington · Theatre & dining',emoji:'🎭',img:'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600&h=320&fit=crop&q=80',price:'avg. £85pp',why:'Intimate studio theatre then supper at Ottolenghi',score:84,type:'cultural',vibes:['Unique / memorable','Walkable']},
    {name:'AIRE Ancient Baths couples',loc:'Bayswater · Thermal spa',emoji:'🧖',img:'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&h=320&fit=crop&q=80',price:'avg. £95pp',why:'Candlelit thermal baths and massage — deeply romantic',score:92,type:'romantic',vibes:['Candlelit']},
    {name:'Monk London ice bath & sauna',loc:'Fulham · Wellness',emoji:'🧊',img:'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Cold plunge together — weirdly bonding and energising',score:84,type:'all',vibes:['Unique / memorable']},
    {name:'Cubo matcha ceremony for two',loc:'Shoreditch · Matcha experience',emoji:'🍵',img:'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Private matcha ceremony with a Japanese tea master',score:88,type:'romantic',vibes:['Candlelit','Unique / memorable']},
  ],
  luxury: [
    {name:'The Savoy afternoon tea + dinner',loc:'Strand · Classic London',emoji:'✦',img:'https://images.unsplash.com/photo-1563865436874-9aef32095fad?w=600&h=320&fit=crop&q=80',price:'avg. £140pp',why:'The most iconic hotel in London — impeccable and intimate',score:91,type:'romantic',vibes:['Candlelit','Unique / memorable']},
    {name:'Core by Clare Smyth',loc:'Notting Hill · ★★★ Michelin',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £190pp',why:'Three Michelin stars — truly exceptional',score:88,type:'foodie',vibes:['Candlelit','Tasting menu']},
    {name:'Bateaux London dinner cruise',loc:'Thames · Luxury',emoji:'✦',img:'https://images.unsplash.com/photo-1544551763-77932721c8f0?w=600&h=320&fit=crop&q=80',price:'avg. £160pp',why:'Fine dining gliding past the lit-up London skyline',score:93,type:'romantic',vibes:['Candlelit','Unique / memorable']},
    {name:'Royal Opera House + The Ivy dinner',loc:'Covent Garden · Opera & fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&h=320&fit=crop&q=80',price:'avg. £190pp',why:'World-class opera then supper at The Ivy',score:94,type:'cultural',vibes:['Unique / memorable','Candlelit','Tasting menu']},
    {name:'Helicopter city tour at sunset',loc:'London · Private experience',emoji:'✦',img:'https://images.unsplash.com/photo-1534397860164-120c97f4db0b?w=600&h=320&fit=crop&q=80',price:'avg. £225pp',why:'See all of London from above at golden hour',score:96,type:'romantic',vibes:['Unique / memorable']},
    {name:'Annabel\'s members club evening',loc:'Mayfair · Private members club',emoji:'✦',img:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=320&fit=crop&q=80',price:'avg. £175pp',why:'London\'s most storied members club — jaw-dropping interiors',score:92,type:'romantic',vibes:['Unique / memorable','Candlelit']},
    {name:'Alain Ducasse at The Dorchester',loc:'Park Lane · French fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1550966871-3ed3cbe818bb?w=600&h=320&fit=crop&q=80',price:'avg. £210pp',why:'Three Michelin stars — the pinnacle of London dining',score:92,type:'foodie',vibes:['Candlelit','Tasting menu']},
    {name:'Glyndebourne opera at sunset',loc:'East Sussex · Outdoor opera',emoji:'✦',img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&h=320&fit=crop&q=80',price:'avg. £240pp',why:'Champagne picnic then world-class opera — utterly magical',score:95,type:'cultural',vibes:['Unique / memorable','Outdoor seats','Candlelit']},
    {name:'Kensington Palace private tour + dinner',loc:'Kensington · Historic',emoji:'✦',img:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=320&fit=crop&q=80',price:'avg. £250pp',why:'After-hours royal palace — the most exclusive date in London',score:97,type:'romantic',vibes:['Unique / memorable','Candlelit']},
    {name:'Cowshed Spa at Soho House',loc:'Shoreditch · Luxury spa',emoji:'💆',img:'https://images.unsplash.com/photo-1540555700478-4be289fbec6d?w=600&h=320&fit=crop&q=80',price:'avg. £180pp',why:'Full couples spa day — massage, facial, pool and rooftop',score:93,type:'romantic',vibes:['Candlelit']},
    {name:'Bamford Wellness Spa retreat',loc:'The Berkshires · Country retreat',emoji:'🌿',img:'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=600&h=320&fit=crop&q=80',price:'avg. £280pp',why:'Escape the city — yoga, nature walks and hydrotherapy',score:94,type:'outdoor',vibes:['Walkable']},
  ]
};

// Booking URLs registry
const BOOKING = {
  'Hakkasan Mayfair dinner':{url:'https://www.opentable.co.uk/r/hakkasan-mayfair-london',provider:'opentable'},
  'Dishoom dinner':{url:'https://www.dishoom.com/booking/',provider:'dishoom'},
  'Sketch, Mayfair':{url:'https://sketch.london/make-a-reservation/',provider:'sketch'},
  'Novikov restaurant':{url:'https://www.novikovrestaurant.co.uk/reservations',provider:'novikov'},
  'Bob Bob Ricard dinner':{url:'https://www.bobbobricard.com/reservations/',provider:'bobbobricard'},
  'Kiln restaurant Soho':{url:'https://kilnsoho.com',provider:'kiln'},
  'Ottolenghi dinner':{url:'https://ottolenghi.co.uk/restaurants',provider:'ottolenghi'},
  'Padella pasta dinner':{url:'https://www.padella.co',provider:'padella'},
  'Brat restaurant':{url:'https://bratrestaurant.com/reservations',provider:'brat'},
  'Core by Clare Smyth':{url:'https://corebyclaresmyth.com',provider:'core'},
  'Alain Ducasse at The Dorchester':{url:'https://www.alainducasse-dorchester.com/reservations',provider:'alain-ducasse'},
  'Brindisa tapas + Borough Market':{url:'https://www.brindisakitchens.com/book',provider:'brindisa'},
  'The Savoy afternoon tea + dinner':{url:'https://www.thesavoylondon.com/dining/',provider:'savoy'},
  'Aqua Shard cocktails + dinner':{url:'https://aquashard.co.uk/reservations',provider:'aqua-shard'},
  'Secret Cinema evening':{url:'https://www.secretcinema.org',provider:'secret-cinema'},
  'The Crystal Maze LIVE Experience':{url:'https://the-crystal-maze.com/london/',provider:'crystal-maze'},
  'O2 Arena concert night':{url:'https://www.theo2.co.uk/events',provider:'the-o2'},
  'Shakespeare\'s Globe Theatre':{url:'https://www.shakespearesglobe.com/whats-on/',provider:'globe-theatre'},
  'National Theatre + dinner at Brasserie Blanc':{url:'https://www.nationaltheatre.org.uk/whats-on/',provider:'national-theatre'},
  'Ronnie Scott\'s jazz night':{url:'https://www.ronniescotts.co.uk/performances',provider:'ronnie-scotts'},
  'Electric Cinema, Notting Hill':{url:'https://www.electriccinema.co.uk',provider:'electric-cinema'},
  'Royal Opera House + The Ivy dinner':{url:'https://www.roh.org.uk/tickets-and-events',provider:'royal-opera-house'},
  'All Star Lanes bowling + cocktails':{url:'https://www.allstarlanes.co.uk/book',provider:'all-star-lanes'},
  'Turning Earth pottery class':{url:'https://www.turningearth.org/book',provider:'turning-earth'},
  'Escape Hunt London':{url:'https://escapehunt.com/uk/london/',provider:'escape-hunt'},
  'TeamSport Go-Karting':{url:'https://www.team-sport.co.uk/go-karting-london/',provider:'teamsport'},
  'Swingers crazy golf + cocktails':{url:'https://swingersldn.com',provider:'swingers'},
  'Toca Social':{url:'https://tocasocial.com/book',provider:'toca-social'},
  'Whistle Punks Axe Throwing':{url:'https://whistlepunks.com/london/',provider:'whistle-punks'},
  'BFI Southbank cinema + wine':{url:'https://whatson.bfi.org.uk',provider:'bfi'},
  'Rooftop Film Club screening':{url:'https://www.rooftopfilmclub.com/london',provider:'rooftop-film-club'},
  'AIRE Ancient Baths couples':{url:'https://beaire.com/en/aire-ancient-baths-london',provider:'aire'},
  'Monk London ice bath & sauna':{url:'https://www.monklondon.com',provider:'monk-london'},
  'Ironmonger Row Baths':{url:'https://www.better.org.uk/leisure-centre/london/islington/ironmonger-row-baths',provider:'better'},
  'Cowshed Spa at Soho House':{url:'https://www.cowshed.com/pages/book-a-treatment',provider:'cowshed'},
  'Hotpod Yoga date':{url:'https://hotpodyoga.com/timetable/',provider:'hotpod-yoga'},
  'Kew Gardens + riverside pub':{url:'https://www.kew.org/visit/tickets',provider:'kew-gardens'},
  'Bateaux London dinner cruise':{url:'https://www.bateauxlondon.com',provider:'bateaux'},
  'Helicopter city tour at sunset':{url:'https://www.thelondonnhelicopter.com',provider:'london-helicopter'},
  'The Comedy Store':{url:'https://www.thecomedystore.co.uk',provider:'comedy-store'},
};

// ── Classification helpers ──

function slugify(s) {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function classifyVenue(v, tier) {
  const nm = v.name.toLowerCase(), lc = v.loc.toLowerCase();

  // Category
  let cat = 'dining';
  if (/yoga|spa|bath|pilates|wellness|sauna|massage|flotation|ice bath/.test(nm)) cat = 'wellness';
  else if (/boxing|gym|fitness|karting|padel|climbing|bxr|kobox|frame|reformer/.test(nm)) cat = 'active';
  else if (/bowling|axe|escape|crazy golf|swingers|toca|go-kart|comedy|concert|jazz|ronnie|o2 arena/.test(nm)) cat = 'nightlife';
  else if (/theatre|opera|globe|cinema|gallery|museum|tate|bfi|secret cinema|crystal maze|pottery|turning earth/.test(nm)) cat = 'culture';
  else if (/park|garden|hike|walk|boating|rooftop film|market|thames|leake|alexandra|sunset|picnic/.test(nm)) cat = 'outdoors';
  else if (v.type === 'outdoor' && !/dinner|restaurant|brunch/.test(nm)) cat = 'outdoors';
  else if (v.type === 'cultural') cat = 'culture';
  else if (v.type === 'fun') cat = 'nightlife';

  // Venue type
  let vtype = 'other';
  if (cat === 'dining') vtype = 'restaurant';
  else if (/cinema|film/.test(nm)) vtype = 'cinema';
  else if (/theatre|opera|globe/.test(nm)) vtype = 'theatre';
  else if (/gallery|museum|tate/.test(nm)) vtype = 'gallery';
  else if (/park|garden/.test(nm)) vtype = 'park';
  else if (/spa|bath|sauna/.test(nm)) vtype = 'spa';
  else if (/gym|boxing|fitness|pilates|yoga/.test(nm)) vtype = 'gym';
  else if (/bar|club/.test(nm)) vtype = 'bar';

  // Setting
  let sett = 'indoor';
  if (/park|garden|hike|walk|rooftop|street art|thames|boating|market|outdoor|sunset|picnic/.test(nm)) sett = 'outdoor';
  else if (v.type === 'outdoor' || v.vibes.includes('Outdoor seats')) sett = 'both';
  else if (v.vibes.includes('Walkable')) sett = 'both';

  // Time fit
  let tf = 'evening';
  if (/brunch|market|park|garden|gallery|museum|tate|walk|sunrise|morning|hike|picnic/.test(nm)) tf = 'daytime';
  else if (cat === 'active' || cat === 'wellness') tf = 'any';

  // Duration
  let dur = 90;
  if (cat === 'active') dur = 60;
  if (cat === 'culture') dur = 120;
  if (/afternoon tea|tasting|cruise|opera|theatre|secret cinema/.test(nm)) dur = 150;
  if (/walk|market|park|street art/.test(nm)) dur = 90;
  if (/spa|bath|couples|retreat/.test(nm)) dur = 120;

  // Area
  const locParts = v.loc.split('·');
  const area = locParts[0].trim();
  let zone = 'central';
  if (/shoreditch|hoxton|bermondsey|peckham|islington|camden|notting hill|chelsea|king.s road|battersea|fulham|various/i.test(area)) zone = 'local';
  else if (/richmond|kew|greenwich|stratford|o2|north london|berkshire|east sussex|the o2/i.test(area)) zone = 'anywhere';

  // Cuisine (for restaurants)
  const cuisine = locParts.length > 1 ? locParts[1].trim() : null;

  // Price level
  const priceMatch = v.price.match(/£(\d+)/);
  const priceNum = priceMatch ? parseInt(priceMatch[1]) : 30;
  const priceLevel = tier === 'budget' ? 1 : tier === 'mid' ? 2 : tier === 'treat' ? 3 : 4;

  // Veg-unfriendly
  const vegUnfriendly = ['Core by Clare Smyth', 'Alain Ducasse at The Dorchester'].includes(v.name);

  return {
    slug: slugify(v.name),
    venue_type: vtype,
    category: cat,
    area,
    area_zone: zone,
    cuisine: cat === 'dining' ? cuisine : null,
    setting: sett,
    time_fit: tf,
    duration_mins: dur,
    price_level: priceLevel,
    budget_tier: tier,
    veg_friendly: !vegUnfriendly,
    curation_score: v.score,
  };
}

function esc(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function arrLit(arr) {
  if (!arr || !arr.length) return "'{}'";
  return "ARRAY[" + arr.map(v => esc(v)).join(',') + "]";
}

// ── Generate SQL ──

const lines = [];
lines.push('-- ════════════════════════════════════════════════════════');
lines.push('-- Table for Two — Seed Data: London Beta Dataset');
lines.push('-- Generated by seed-venues.js');
lines.push('-- Run AFTER supabase-migration-v4-venues.sql');
lines.push('-- ════════════════════════════════════════════════════════');
lines.push('');

// Providers
lines.push('-- ── Providers ──');
const providers = [
  ['opentable', 'OpenTable', 'booking', 'https://www.opentable.co.uk', 'affiliate'],
  ['resy', 'Resy', 'booking', 'https://resy.com', 'manual'],
  ['designmynight', 'DesignMyNight', 'booking', 'https://www.designmynight.com', 'manual'],
  ['google-places', 'Google Places', 'search', 'https://maps.googleapis.com', 'live_api'],
  ['venue-direct', 'Venue Direct', 'booking', null, 'manual'],
];
// Collect unique provider slugs from BOOKING
const bookingProviders = new Set();
Object.values(BOOKING).forEach(b => bookingProviders.add(b.provider));
bookingProviders.forEach(slug => {
  if (!providers.some(p => p[0] === slug)) {
    const name = slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
    providers.push([slug, name, 'booking', null, 'manual']);
  }
});

providers.forEach(([slug, name, ptype, baseUrl, apiStatus]) => {
  lines.push(`INSERT INTO providers (slug, name, provider_type, base_url, api_status) VALUES (${esc(slug)}, ${esc(name)}, ${esc(ptype)}, ${esc(baseUrl)}, ${esc(apiStatus)}) ON CONFLICT (slug) DO NOTHING;`);
});
lines.push('');

// Venues
lines.push('-- ── Venues ──');
let venueCount = 0;
for (const [tier, items] of Object.entries(IDEAS)) {
  lines.push(`-- ${tier} tier`);
  for (const v of items) {
    const c = classifyVenue(v, tier);
    venueCount++;
    lines.push(`INSERT INTO venues (slug, name, venue_type, category, area, area_zone, short_description, cuisine, emoji, image_url, price_label, price_level, budget_tier, setting, time_fit, duration_mins, vibes, veg_friendly, curation_score, source, is_active) VALUES (${esc(c.slug)}, ${esc(v.name)}, ${esc(c.venue_type)}, ${esc(c.category)}, ${esc(c.area)}, ${esc(c.area_zone)}, ${esc(v.why)}, ${esc(c.cuisine)}, ${esc(v.emoji)}, ${esc(v.img)}, ${esc(v.price)}, ${c.price_level}, ${esc(c.budget_tier)}, ${esc(c.setting)}, ${esc(c.time_fit)}, ${c.duration_mins}, ${arrLit(v.vibes)}, ${c.veg_friendly}, ${c.curation_score}, 'curated', true) ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name, short_description=EXCLUDED.short_description, image_url=EXCLUDED.image_url, price_label=EXCLUDED.price_label, curation_score=EXCLUDED.curation_score, last_verified_at=now();`);
  }
  lines.push('');
}

// Booking links
lines.push('-- ── Booking Links ──');
for (const [venueName, info] of Object.entries(BOOKING)) {
  const slug = slugify(venueName);
  const isRestaurant = ['opentable','dishoom','sketch','novikov','bobbobricard','kiln','ottolenghi','padella','brat','core','alain-ducasse','brindisa','savoy','aqua-shard'].includes(info.provider);
  const bookingType = isRestaurant ? 'bookable_now' : (v => {
    const nm = venueName.toLowerCase();
    if (/free|walk|park|street art|leake/.test(nm)) return 'details_only';
    return 'partner_handoff';
  })();

  lines.push(`INSERT INTO booking_links (venue_id, provider_id, booking_url, booking_type, is_verified, is_primary) VALUES ((SELECT id FROM venues WHERE slug = ${esc(slug)}), (SELECT id FROM providers WHERE slug = ${esc(info.provider)}), ${esc(info.url)}, ${esc(bookingType)}, true, true) ON CONFLICT DO NOTHING;`);
}
lines.push('');

lines.push(`-- ── Summary: ${venueCount} venues, ${Object.keys(BOOKING).length} booking links, ${providers.length} providers ──`);

console.log(lines.join('\n'));
