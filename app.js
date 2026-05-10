      // Skip landing immediately — must run before anything else
      if(new URLSearchParams(window.location.search).has('app')){
        const lp=document.getElementById('landing');
        if(lp){lp.style.display='none';lp.style.visibility='hidden';}
      }

      const TITLES={discover:'Discover',profiles:'Our profiles',restaurants:'Dining',experiences:'Experiences',hotels:'Accommodation',cabs:'Transport',planner:'Date planner','whats-hot':"What's Hot",bookings:'My dates',journal:'Date Journal',wishlist:'Wishlist'};
      const SUBS={discover:'AI ideas matched to both your tastes',profiles:'Manage Jamie & Sophie\'s preferences',restaurants:'Tables reserved, dietary sorted',experiences:'Beyond dinner — make memories',hotels:'Romantic getaways & staycations',cabs:'Tube, bus or cab — we\'ll tell you what makes sense',planner:'Calendar, reminders & .ics export','whats-hot':'Trending this week · Matched to your tastes',bookings:'Every date, all in one place',journal:'Your private scrapbook of memories',wishlist:'Ideas you want to try someday'};

      let bookings=[
        {id:1,type:'restaurant',name:'Brat, Shoreditch',date:'2026-05-02',meta:'8:00 PM · 2 covers · Michelin-starred Basque grill',amount:'£160'},
        {id:2,type:'experience',name:'Ronnie Scott\'s jazz night',date:'2026-06-14',meta:'8:30 PM · 2 tickets · Live jazz',amount:'£140'},
        {id:3,type:'hotel',name:'The Ned, City of London',date:'2026-07-04',meta:'1 night · Deluxe room',amount:'£380'},
      ];
      let reminders=[
        {id:1,title:'Brat dinner reservation',date:'2026-05-02',time:'19:45',cat:'Dinner reservation',color:'#C9A84C'},
        {id:2,title:'Ronnie Scott\'s — doors open',date:'2026-06-14',time:'20:00',cat:'Experience / activity',color:'#6B4C7A'},
        {id:3,title:'The Ned check-in',date:'2026-07-04',time:'15:00',cat:'Hotel check-in',color:'#C9A84C'},
        {id:4,title:'Pre-dinner cab',date:'2026-05-02',time:'19:20',cat:'Cab pickup',color:'#3A6A8A'},
      ];
      let calMonth=new Date(2026,3,1);
      let selectedDay=null;
      let activeFilter='all';
      let _handles={jamie:'@jamie887',sophie:'@sophie2024'};
      let _connectedHandles=[];

      const catColors={'Dinner reservation':'#C4687A','Experience / activity':'#6B4C7A','Hotel check-in':'#C4687A','Hotel check-out':'#8B3A4A','Cab pickup':'#3A6A8A','Personal':'#5A7A5A'};

      function go(id,el){
        document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
        const _pg=document.getElementById('page-'+id);
        _pg.classList.add('active');
        // re-trigger entry animation on every switch
        _pg.classList.remove('page-anim');
        void _pg.offsetWidth;
        _pg.classList.add('page-anim');
        document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
        if(el&&el.classList.contains('nav-item'))el.classList.add('active');
        if(id==='discover'){
          setSmartGreeting();
          // Auto-load suggestions if area is empty
          const _sa=document.getElementById('suggestions-area');
          if(_sa&&!_sa.innerHTML.trim())generateSuggestions(true);
        } else {
          document.getElementById('page-title').textContent=TITLES[id]||id;
          document.getElementById('page-sub').textContent=SUBS[id]||'';
        }
        const mt=document.getElementById('mobile-page-title');if(mt)mt.textContent=id==='discover'?'Discover':(TITLES[id]||id);
        if(id==='planner')renderCal();
        if(id==='bookings'||id==='discover'){renderBookings();updateStats();renderHubWishlist();_clearWishBadge();}
        if(id==='planner')renderReminders();
        if(id==='journal')renderJournal();
        if(id==='wishlist')renderWishlist();
        if(id==='whats-hot')renderWhatsHot();
        // scroll content back to top on page change
        window.scrollTo({top:0,behavior:'smooth'});
      }

      function mobileGo(id,el){
        go(id,null);
        document.querySelectorAll('.mnb-item').forEach(n=>n.classList.remove('active'));
        if(el)el.classList.add('active');
      }

      let _lastPageBeforeProfiles='discover';
      function toggleProfiles(){
        const currentPage=document.querySelector('.page.active');
        const isOnProfiles=currentPage&&currentPage.id==='page-profiles';
        if(isOnProfiles){
          go(_lastPageBeforeProfiles,null);
          // Re-activate the correct bottom nav item
          const mnbMap={discover:'mnb-discover',restaurants:'mnb-restaurants',experiences:'mnb-experiences','whats-hot':'mnb-planner',bookings:'mnb-more'};
          const mnbId=mnbMap[_lastPageBeforeProfiles];
          document.querySelectorAll('.mnb-item').forEach(n=>n.classList.remove('active'));
          if(mnbId){const el=document.getElementById(mnbId);if(el)el.classList.add('active');}
        } else {
          _lastPageBeforeProfiles=currentPage?currentPage.id.replace('page-',''):'discover';
          go('profiles',null);
        }
      }

      function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);}
      function toggleTag(el){el.classList.toggle('on');}
      function switchTab(el,panelId){
        const tabs=el.parentElement.querySelectorAll('.tab');
        tabs.forEach(t=>t.classList.remove('active'));el.classList.add('active');
        ['rest-find','rest-featured'].forEach(id=>{const p=document.getElementById(id);if(p)p.style.display='none';});
        const tgt=document.getElementById(panelId);if(tgt)tgt.style.display='block';
      }

      function savePref(){toast('✦ Preferences saved for Jamie & Sophie');}

      // ── @handle system ──
      const _DEMO_HANDLES={
        '@alex4291':{name:'Alex',initials:'AX',bg:'#E6F0FB',col:'#1E3A6E',food:'Vegetarian',cuisines:['Japanese','French'],style:['Intimate','Cosy'],ll:'quality_time'},
        '@priya_k':{name:'Priya',initials:'PK',bg:'#FBF0E6',col:'#6E3A1E',food:'Vegan',cuisines:['Indian','Mediterranean'],style:['Outdoor','Romantic'],ll:'physical_touch'},
        '@tom.w99':{name:'Tom',initials:'TW',bg:'#E6FBF0',col:'#1E6E3A',food:'Everything',cuisines:['Modern British','Italian'],style:['Adventure','Live music'],ll:'acts_of_service'},
      };

      function _syncHandleDisplays(){
        ['jamie','sophie'].forEach(p=>{
          const h=_handles[p];
          ['display','card'].forEach(s=>{
            const el=document.getElementById(`handle-${p}-${s}`);
            if(el)el.textContent=h;
          });
        });
      }

      function editHandle(person){
        const current=_handles[person];
        const val=prompt(`Edit ${person.charAt(0).toUpperCase()+person.slice(1)}'s handle:`,current);
        if(!val)return;
        let cleaned=val.trim();
        if(!cleaned.startsWith('@'))cleaned='@'+cleaned;
        cleaned=cleaned.replace(/[^a-zA-Z0-9@_.]/g,'');
        if(cleaned.length<2){toast('Handle too short');return;}
        _handles[person]=cleaned;
        try{localStorage.setItem('t4t_handles',JSON.stringify(_handles));}catch(e){}
        _syncHandleDisplays();
        toast(`✦ Handle updated to ${cleaned}`);
      }

      function copyHandle(person){
        const h=_handles[person];
        if(navigator.clipboard){navigator.clipboard.writeText(h).then(()=>toast(`✦ ${h} copied`)).catch(()=>toast(h));}
        else{toast(h);}
      }

      function connectByHandle(){
        const inp=document.getElementById('connect-handle-input');
        if(!inp)return;
        let val=inp.value.trim();
        if(!val){toast('Enter a @handle first');return;}
        if(!val.startsWith('@'))val='@'+val;
        if(val===_handles.jamie||val===_handles.sophie){toast('That\'s already one of your handles');return;}
        if(_connectedHandles.includes(val)){toast(`${val} already connected`);return;}
        const demo=_DEMO_HANDLES[val.toLowerCase()];
        if(demo){
          _connectedHandles.push(val);
          inp.value='';
          _renderConnectedProfiles();
          toast(`✦ Connected with ${val} — preferences merged`);
        } else {
          // Simulate unknown handle
          toast(`No profile found for ${val}`);
        }
      }

      function _renderConnectedProfiles(){
        const el=document.getElementById('connected-profiles-list');
        if(!el)return;
        if(!_connectedHandles.length){el.innerHTML='';return;}
        el.innerHTML=`<div style="margin-bottom:12px">
          <div style="font-size:11px;color:var(--ink-muted);margin-bottom:8px;font-weight:500;text-transform:uppercase;letter-spacing:0.5px">Connected</div>
          ${_connectedHandles.map(h=>{
            const d=_DEMO_HANDLES[h.toLowerCase()]||{name:h,initials:h.slice(1,3).toUpperCase(),bg:'#F0F0F0',col:'#444',cuisines:[],style:[],ll:''};
            return `<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:rgba(201,168,76,0.05);border:0.5px solid rgba(201,168,76,0.18);border-radius:10px;margin-bottom:6px">
              <div style="display:flex;align-items:center;gap:8px">
                <div style="width:30px;height:30px;border-radius:50%;background:${d.bg};color:${d.col};font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${d.initials}</div>
                <div>
                  <div style="font-size:12px;font-weight:600;color:var(--ink)">${d.name} <span style="font-family:monospace;font-size:10px;color:var(--primary)">${h}</span></div>
                  <div style="font-size:10px;color:var(--ink-muted);margin-top:1px">${[...d.cuisines,...d.style].slice(0,3).join(' · ')}</div>
                </div>
              </div>
              <button onclick="disconnectHandle('${h}')" style="background:none;border:none;cursor:pointer;color:var(--ink-muted);font-size:14px;padding:2px 6px" title="Disconnect">×</button>
            </div>`;
          }).join('')}
        </div>`;
      }

      function disconnectHandle(h){
        _connectedHandles=_connectedHandles.filter(x=>x!==h);
        _renderConnectedProfiles();
        toast(`${h} disconnected`);
      }

      // Load saved handles
      (function _loadHandles(){
        try{
          const h=localStorage.getItem('t4t_handles');
          if(h){_handles=Object.assign(_handles,JSON.parse(h));_syncHandleDisplays();}
        }catch(e){}
      })();

      const IDEAS={
        budget:[
          {name:'Maltby Street Market brunch',loc:'Bermondsey · Street food',emoji:'🌮',img:'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=320&fit=crop&q=80',price:'avg. £13pp',why:'Both love casual food scenes — London\'s best street food market',score:78,type:'foodie',vibes:['Walkable']},
          {name:'Tate Modern + Thames walk',loc:'South Bank · Art & outdoors',emoji:'🖼️',img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=320&fit=crop&q=80',price:'Free–avg. £8pp',why:'Jamie loves cultural, Sophie loves outdoors — free world-class art',score:86,type:'cultural',vibes:['Walkable','Unique / memorable']},
          {name:'TeamSport Go-Karting',loc:'Stratford · Indoor karting',emoji:'🏎️',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=320&fit=crop&q=80',price:'avg. £23pp',why:'Thrilling and competitive — guaranteed laughs and bragging rights',score:82,type:'fun',vibes:['Unique / memorable']},
          {name:'BFI Southbank cinema + wine',loc:'South Bank · Film & culture',emoji:'🎬',img:'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Jamie loves cultural — independent cinema right on the river',score:80,type:'cultural',vibes:['Walkable']},
          {name:'Escape Hunt London',loc:'Holborn · Escape room',emoji:'🔐',img:'https://images.unsplash.com/photo-1590012314607-cda9d9b699ae?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Solve puzzles together — teamwork makes the dream work',score:79,type:'fun',vibes:['Unique / memorable']},
          {name:'Rooftop Film Club screening',loc:'Peckham / Shoreditch · Outdoor cinema',emoji:'🎥',img:'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=320&fit=crop&q=80',price:'avg. £16pp',why:'Watching films under the stars with blankets and wine',score:83,type:'fun',vibes:['Outdoor seats','Unique / memorable']},
          {name:'Whistle Punks Axe Throwing',loc:'Shoreditch · Axe throwing',emoji:'🪓',img:'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=600&h=320&fit=crop&q=80',price:'avg. £19pp',why:'Unexpectedly brilliant fun — loud, silly, weirdly satisfying',score:77,type:'fun',vibes:['Unique / memorable']},
          {name:'Battersea Park boating + picnic',loc:'Battersea · Outdoor',emoji:'🚣',img:'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?w=600&h=320&fit=crop&q=80',price:'avg. £14pp',why:'Sophie loves the outdoors — relaxed, romantic, London classic',score:77,type:'outdoor',vibes:['Walkable','Outdoor seats']},
          {name:'The Comedy Store',loc:'Soho · Live comedy',emoji:'🎭',img:'https://images.unsplash.com/photo-1527224857830-43a7acc85260?w=600&h=320&fit=crop&q=80',price:'avg. £16pp',why:'London\'s legendary comedy club — guaranteed laughter',score:74,type:'fun',vibes:['Live music']},
          {name:'Leake Street Arches street art walk',loc:'Waterloo · Street art',emoji:'🎨',img:'https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?w=600&h=320&fit=crop&q=80',price:'Free',why:'Jamie loves cultural — Banksy\'s famous graffiti tunnel',score:70,type:'cultural',vibes:['Walkable']},
          {name:'Brindisa tapas + Borough Market',loc:'Borough · Spanish',emoji:'🥘',img:'https://images.unsplash.com/photo-1515443961218-a51367888e4b?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Both love bold food — best tapas beside London\'s greatest market',score:79,type:'foodie',vibes:['Walkable']},
        ],
        mid:[
          {name:'Hakkasan Mayfair dinner',loc:'Mayfair · Chinese',emoji:'✦',img:'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',why:'Michelin-starred Cantonese — moody, beautiful and endlessly romantic',score:93,type:'foodie',vibes:['Candlelit','Unique / memorable']},
          {name:'Dishoom dinner',loc:'Covent Garden · Indian',emoji:'✦',img:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=320&fit=crop&q=80',price:'avg. £33pp',why:'Sophie loves Indian, Jamie loves bold flavours — always unmissable',score:92,type:'foodie',vibes:['Candlelit']},
          {name:'Secret Cinema evening',loc:'London · Immersive',emoji:'🎬',img:'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Unique & memorable — live actors, costumes, and a film',score:94,type:'romantic',vibes:['Unique / memorable']},
          {name:'O2 Arena concert night',loc:'Greenwich · Live music',emoji:'🎤',img:'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&h=320&fit=crop&q=80',price:'avg. £50pp',why:'Nothing beats live music together — electric atmosphere',score:88,type:'fun',vibes:['Live music','Unique / memorable']},
          {name:'The Crystal Maze LIVE Experience',loc:'Farringdon · Immersive game',emoji:'💎',img:'https://images.unsplash.com/photo-1563986768494-4dee2763ff3f?w=600&h=320&fit=crop&q=80',price:'avg. £48pp',why:'The iconic TV experience — team challenges across four zones',score:87,type:'fun',vibes:['Unique / memorable']},
          {name:'Kew Gardens + riverside pub',loc:'Richmond · Outdoor',emoji:'🌿',img:'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'Sophie loves outdoors — UNESCO world heritage gardens',score:81,type:'outdoor',vibes:['Walkable','Outdoor seats']},
          {name:'Kiln restaurant Soho',loc:'Soho · Thai',emoji:'🔥',img:'https://images.unsplash.com/photo-1555126634-323283e090fa?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'London\'s most exciting Thai — cooked over wood fire, intense flavours',score:89,type:'foodie',vibes:['Candlelit']},
          {name:'Ottolenghi dinner',loc:'Islington · Mediterranean',emoji:'🥗',img:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Sophie loves Med — Ottolenghi\'s bold flavours never disappoint',score:88,type:'foodie',vibes:['Candlelit']},
          {name:'Shakespeare\'s Globe Theatre',loc:'South Bank · Theatre',emoji:'🎭',img:'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600&h=320&fit=crop&q=80',price:'avg. £38pp',why:'Iconic open-air theatre on the Thames — utterly memorable',score:87,type:'cultural',vibes:['Unique / memorable','Walkable']},
          {name:'All Star Lanes bowling + cocktails',loc:'Holborn · Boutique bowling',emoji:'🎳',img:'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Retro-cool boutique bowling with killer cocktails — great fun',score:81,type:'fun',vibes:['Live music']},
          {name:'Turning Earth pottery class',loc:'Hoxton · Pottery studio',emoji:'🏺',img:'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Make something together — wonderfully silly and surprisingly therapeutic',score:84,type:'fun',vibes:['Unique / memorable']},
          {name:'Padella pasta dinner',loc:'Borough · Italian',emoji:'🍝',img:'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'London\'s best hand-rolled pasta — simple, romantic, delicious',score:86,type:'foodie',vibes:['Candlelit']},
          {name:'Barbican Cinema + cocktails',loc:'Barbican · Arts cinema',emoji:'🎬',img:'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Indie film in a stunning brutalist arts centre',score:80,type:'cultural',vibes:['Walkable','Unique / memorable']},
          {name:'Alexandra Palace sunset terrace',loc:'North London · Views',emoji:'🌇',img:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=320&fit=crop&q=80',price:'avg. £23pp',why:'Best panoramic views over London — magic at golden hour',score:83,type:'outdoor',vibes:['Outdoor seats','Unique / memorable']},
        ],
        treat:[
          {name:'Sketch, Mayfair',loc:'Mayfair · Modern European',emoji:'🎨',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',why:'The egg-pod bathrooms, the pink dining room — truly unforgettable',score:85,type:'romantic',vibes:['Candlelit','Unique / memorable']},
          {name:'Novikov restaurant',loc:'Mayfair · Italian & Asian',emoji:'🥂',img:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=320&fit=crop&q=80',price:'avg. £100pp',why:'Mayfair\'s most glamorous see-and-be-seen dining room',score:88,type:'romantic',vibes:['Candlelit','Unique / memorable']},
          {name:'Bob Bob Ricard dinner',loc:'Soho · Anglo-Russian',emoji:'🍾',img:'https://images.unsplash.com/photo-1550966871-3ed3cbe818bb?w=600&h=320&fit=crop&q=80',price:'avg. £85pp',why:'Press for champagne buttons at every table — impossibly fun',score:91,type:'romantic',vibes:['Candlelit','Unique / memorable']},
          {name:'Ronnie Scott\'s jazz night',loc:'Soho · Live music',emoji:'🎷',img:'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&h=320&fit=crop&q=80',price:'avg. £70pp',why:'London\'s most legendary jazz club — intimate and electric',score:83,type:'cultural',vibes:['Live music','Candlelit']},
          {name:'National Theatre + dinner at Brasserie Blanc',loc:'South Bank · Theatre & dining',emoji:'🎭',img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&h=320&fit=crop&q=80',price:'avg. £80pp',why:'World-class production + riverside dinner — a full, perfect evening',score:88,type:'cultural',vibes:['Unique / memorable','Walkable']},
          {name:'Aqua Shard cocktails + dinner',loc:'London Bridge · Rooftop views',emoji:'🌆',img:'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=320&fit=crop&q=80',price:'avg. £95pp',why:'31st-floor views of London — the most romantic skyline in the city',score:87,type:'romantic',vibes:['Candlelit','Unique / memorable']},
          {name:'Electric Cinema, Notting Hill',loc:'Notting Hill · Luxury cinema',emoji:'🎬',img:'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=320&fit=crop&q=80',price:'avg. £75pp',why:'Leather armchairs, footstools, and wine — cinema reimagined',score:85,type:'fun',vibes:['Unique / memorable','Candlelit']},
          {name:'Brat restaurant',loc:'Shoreditch · Modern British',emoji:'🔥',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £80pp',why:'Tomos Parry\'s Michelin-starred Basque grill — outstanding every time',score:90,type:'foodie',vibes:['Candlelit','Unique / memorable']},
          {name:'Almeida Theatre + Ottolenghi dinner',loc:'Islington · Theatre & dining',emoji:'🎭',img:'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600&h=320&fit=crop&q=80',price:'avg. £85pp',why:'Intimate studio theatre then supper at Ottolenghi — a perfect Islington evening',score:84,type:'cultural',vibes:['Unique / memorable','Walkable']},
        ],
        luxury:[
          {name:'The Savoy afternoon tea + dinner',loc:'Strand · Classic London',emoji:'✦',img:'https://images.unsplash.com/photo-1563865436874-9aef32095fad?w=600&h=320&fit=crop&q=80',price:'avg. £140pp',why:'The most iconic hotel in London — impeccable and intimate',score:91,type:'romantic',vibes:['Candlelit','Unique / memorable']},
          {name:'Core by Clare Smyth',loc:'Notting Hill · ★★★ Michelin',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £190pp',why:'Three stars, one of the world\'s best restaurants — truly exceptional',score:88,type:'foodie',vibes:['Candlelit','Tasting menu']},
          {name:'Bateaux London dinner cruise',loc:'Thames · Luxury',emoji:'✦',img:'https://images.unsplash.com/photo-1533929736458-ca588d08c8be?w=600&h=320&fit=crop&q=80',price:'avg. £160pp',why:'Fine dining gliding past the lit-up London skyline — romantic perfection',score:93,type:'romantic',vibes:['Candlelit','Unique / memorable']},
          {name:'Royal Opera House + The Ivy dinner',loc:'Covent Garden · Opera & fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&h=320&fit=crop&q=80',price:'avg. £190pp',why:'London\'s most iconic cultural evening — world-class opera then supper at The Ivy',score:94,type:'cultural',vibes:['Unique / memorable','Candlelit','Tasting menu']},
          {name:'Helicopter city tour at sunset',loc:'London · Private experience',emoji:'✦',img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=320&fit=crop&q=80',price:'avg. £225pp',why:'See all of London from above at golden hour — nothing more memorable',score:96,type:'romantic',vibes:['Unique / memorable']},
          {name:'Annabel\'s members club evening',loc:'Mayfair · Private members club',emoji:'✦',img:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=320&fit=crop&q=80',price:'avg. £175pp',why:'London\'s most storied members club — jaw-dropping interiors, flawless service',score:92,type:'romantic',vibes:['Unique / memorable','Candlelit']},
          {name:'Alain Ducasse at The Dorchester',loc:'Park Lane · French fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1550966871-3ed3cbe818bb?w=600&h=320&fit=crop&q=80',price:'avg. £210pp',why:'Three Michelin stars — the absolute pinnacle of London dining',score:92,type:'foodie',vibes:['Candlelit','Tasting menu']},
          {name:'Glyndebourne opera at sunset',loc:'East Sussex · Outdoor opera',emoji:'✦',img:'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=600&h=320&fit=crop&q=80',price:'avg. £240pp',why:'Champagne picnic in the grounds then world-class opera — utterly magical',score:95,type:'cultural',vibes:['Unique / memorable','Outdoor seats','Candlelit']},
          {name:'Kensington Palace private tour + dinner',loc:'Kensington · Historic',emoji:'✦',img:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=320&fit=crop&q=80',price:'avg. £250pp',why:'After-hours royal palace — the most exclusive date in all of London',score:97,type:'romantic',vibes:['Unique / memorable','Candlelit']},
        ]
      };

      // ── Smart greeting ──
      const _WMO={0:'Clear skies',1:'Mostly clear',2:'Partly cloudy',3:'Overcast',45:'Foggy',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',75:'Heavy snow',80:'Showers',81:'Showers',82:'Heavy showers',95:'Thunderstorm',96:'Thunderstorm',99:'Thunderstorm'};
      const _WMO_FEEL={0:'Perfect evening for a date ✦',1:'Nice and clear out there ✦',2:'Good vibes tonight',3:'Cosy night in or out?',45:'Atmospheric night for it',48:'Atmospheric night for it',51:'Light drizzle — great excuse for candlelit dining',53:'Drizzly — perfect night to stay warm inside',55:'Drizzly — perfect night to stay warm inside',61:'Rainy night — made for good food and wine',63:'Rainy night — made for good food and wine',65:'Pouring — sounds like a restaurant night',71:'Snowy tonight — bundle up for something magical',73:'Snowy tonight — bundle up for something magical',75:'Heavy snow — cosy indoor date vibes',80:'Showery evening — great for indoor dining',81:'Showery evening — great for indoor dining',82:'Stormy out — perfect stay-in date',95:'Stormy out — perfect stay-in date',96:'Stormy out — perfect stay-in date',99:'Stormy out — perfect stay-in date'};
      let _weatherFetched=false;
      let _weatherCode=-1;
      let _weatherTemp=0;
      let _monthlyBudget=0;
      // ── New feature state ──
      let _moodEnergy='moderate'; // 'tired'|'moderate'|'energetic'
      let _surpriseMode=false;
      let _doubleDateMode=false;
      let _paidLast=null; // 'jamie'|'sophie'|null
      let _jeStarVal=0;
      let _wishFilter='all';
      let _wishBadgeCount=0;
      let _wishlist=[
        {id:1,name:'Roof terrace dinner at Sushisamba',emoji:'🍣',price:'££££',type:'foodie',why:'Always wanted to see the view from up there',addedDate:'2025-12-10',done:false},
        {id:2,name:'Sunrise hike at Box Hill',emoji:'🌄',price:'Free',type:'outdoor',why:'We keep saying we\'ll do an early morning adventure',addedDate:'2025-12-22',done:false},
        {id:3,name:'Turning Earth pottery, Hoxton',emoji:'🏺',price:'££',type:'activity',why:'Saw it on a video and it looked so fun and silly',addedDate:'2026-01-05',done:true},
        {id:4,name:'Secret Cinema experience',emoji:'🎬',price:'£££',type:'cultural',why:'The immersive element sounds magical — live actors, costumes, the lot',addedDate:'2026-01-18',done:true},
        {id:5,name:'Couples spa day',emoji:'🧖',price:'£££',type:'romantic',why:'We need a proper reset together',addedDate:'2026-02-03',done:false},
        {id:6,name:'Backgammon night at Mãos',emoji:'🎲',price:'££££',type:'foodie',why:'Tiny restaurant, impossible to get a table — challenge accepted',addedDate:'2026-02-20',done:false},
        {id:7,name:'Picnic in Regent\'s Park',emoji:'🧺',price:'Free',type:'outdoor',why:'A slow Sunday morning with pastries and no plans',addedDate:'2026-03-01',done:false}
      ];
      let _journal=[
        {id:1,name:'Dishoom, King\'s Cross',note:'We waited 40 minutes but it was absolutely worth it. The black dal was incredible and we ended up staying for two hours just talking. One of those nights that felt effortless.',date:'2025-11-14',vibe:'foodie',rating:5},
        {id:2,name:'Kew Gardens Winter Walk',note:'Went on a whim because the weather looked okay. It wasn\'t — it rained the whole time — but we bought matching terrible ponchos from the gift shop and laughed the entire way round.',date:'2025-12-07',vibe:'outdoor',rating:4},
        {id:3,name:'Turning Earth, Hoxton',note:'We were both awful. My bowl looked like a sad taco. We have photographic evidence. 10/10 would humiliate ourselves again.',date:'2026-01-11',vibe:'fun',rating:5},
        {id:4,name:'Tate Modern & Borough Market',note:'Started with the Tate, got into a playful argument about modern art, then ate our feelings at Borough Market. Perfect Saturday.',date:'2026-01-25',vibe:'cultural',rating:4},
        {id:5,name:'Valentine\'s dinner at Brat',note:'Splurged on the tasting menu. Every single course was a moment. Dressed up properly for the first time in ages and it felt special. Definitely coming back.',date:'2026-02-14',vibe:'romantic',rating:5},
        {id:6,name:'Sunday brunch at Caravan, King\'s Cross',note:'Low-key, lazy, perfect. We got there right when it opened, grabbed the window seat, and spent two hours on coffee and eggs. Exactly what we needed.',date:'2026-03-02',vibe:'foodie',rating:4}
      ];
      let _quizAnswers={energy:'mixed',adventure:'mid',tod:'evening',crowd:'quiet',priority:'experience'};
      let _recurringFreq='';
      let _checklistState={}; // {key: bool}
      function setMonthlyBudget(v){
        _monthlyBudget=parseFloat(v)||0;
        const note=document.getElementById('budget-set-note');
        if(note) note.style.display=_monthlyBudget>0?'':'none';
        updateStats();
      }

      function setSmartGreeting(){
        const now=new Date();
        const h=now.getHours();
        const day=now.getDay(); // 0=Sun,6=Sat
        const name='Jamie';

        // Time-based greeting
        let greet;
        if(h>=5&&h<12) greet=`Good morning, ${name}`;
        else if(h>=12&&h<17) greet=`Good afternoon, ${name}`;
        else if(h>=17&&h<21) greet=`Good evening, ${name}`;
        else greet=`Hey ${name}`;

        // Day-based sub
        let sub;
        const isWeekend=day===5||day===6||day===0;
        const upcoming=bookings.filter(b=>b.date>=now.toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date))[0];
        if(upcoming){
          const diff=Math.round((new Date(upcoming.date+' 12:00')-now)/(1000*60*60*24));
          if(diff===0) sub=`${upcoming.name} is today — enjoy every moment ♥`;
          else if(diff===1) sub=`${upcoming.name} is tomorrow — exciting!`;
          else if(diff<=7) sub=`${upcoming.name} is coming up in ${diff} days ✦`;
          else sub=isWeekend?'Perfect weekend for a date — what are you planning?':'Got something special in mind?';
        } else {
          if(day===5) sub='Happy Friday — perfect night to plan something special ✦';
          else if(day===6) sub='Saturday night — let\'s find you something wonderful';
          else if(day===0) sub='Sunday evening — a little planning goes a long way';
          else if(h<12) sub='What are you planning for later?';
          else if(h<17) sub='Got something special in mind for tonight?';
          else sub='Planning something wonderful together?';
        }

        document.getElementById('page-title').textContent=greet;
        document.getElementById('page-sub').textContent=sub;

        // Enhance sub with weather if not already fetched
        if(!_weatherFetched&&navigator.geolocation){
          navigator.geolocation.getCurrentPosition(pos=>{
            _weatherFetched=true;
            const{latitude:lat,longitude:lon}=pos.coords;
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=auto`)
              .then(r=>r.json())
              .then(d=>{
                const code=d.current?.weathercode??-1;
                const temp=Math.round(d.current?.temperature_2m??0);
                _weatherCode=code;_weatherTemp=temp;
                const feel=_WMO_FEEL[code];
                const desc=_WMO[code]||'';
                // Only update sub if still on discover page
                const titleEl=document.getElementById('page-title');
                if(titleEl&&titleEl.textContent===greet&&feel){
                  document.getElementById('page-sub').textContent=`${feel} · ${temp}°C`;
                }
              }).catch(()=>{});
          },()=>{_weatherFetched=true;},{timeout:4000});
        }
      }

      const BUDGET_KEYS=['budget','mid','treat','luxury'];
      const BUDGET_LABELS=['Under £50','£50–£150','£150–£300','£300+'];
      function updateBudgetLabel(v){
        const el=document.getElementById('budget-label');
        if(el)el.textContent=BUDGET_LABELS[v];
        const el2=document.getElementById('budget-label-classic');
        if(el2)el2.textContent=BUDGET_LABELS[v];
      }
      function updateBudgetLabelClassic(v){
        const el=document.getElementById('budget-label-classic');
        if(el)el.textContent=BUDGET_LABELS[v];
      }

      let _occasion='first_date';
      const _OCCASION_HEADLINES={
        first_date:"Let's make a great first impression",
        partner:"Let's plan something special for Sophie",
        special:"What's the occasion? Let's make it unforgettable",
        just_because:"Just the two of you — no reason needed ♥",
        anniversary:"Let's make this anniversary unforgettable",
        birthday:"Let's make their birthday unforgettable",
        valentines:"The perfect Valentine's evening",
        proposal:"The most important evening of all ✦",
        celebration:"Let's celebrate in style",
        milestone:"Let's mark this milestone in style"
      };
      let _specialOccasion='';

      function selectOccasion(el,val){
        el.closest('[id^=date-occasion]').querySelectorAll('.occasion-chip').forEach(c=>c.classList.remove('active'));
        el.classList.add('active');
        _occasion=val;
        const hl=document.getElementById('discover-headline');
        if(hl&&_OCCASION_HEADLINES[val])hl.innerHTML=_OCCASION_HEADLINES[val];
        // Update context panel — auto-dismiss after 4s for personalisation panels
        const ctx=document.getElementById('occasion-context');
        if(!ctx)return;
        clearTimeout(ctx._dismissTimer);
        ctx.style.transition='';
        ctx.style.opacity='1';
        if(val==='first_date'){
          ctx.innerHTML=`<div style="padding:11px 13px;background:linear-gradient(135deg,#FDF8F9,#F0EAF7);border:0.5px solid var(--rose-mid);border-radius:var(--r-md)">
            <div style="font-size:11px;font-weight:600;color:var(--ink-soft);margin-bottom:7px">✦ Matching both your tastes</div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px">
              <span class="badge badge-rose">Indian cuisine</span>
              <span class="badge badge-rose">Mediterranean</span>
              <span class="badge badge-plum">Outdoor dates</span>
              <span class="badge badge-plum">Cultural venues</span>
              <span class="badge badge-rose">Intimate settings</span>
            </div>
            <div style="font-size:11px;color:var(--ink-muted)">Impressive ideas that work for a first impression — exciting but not overwhelming</div>
          </div>`;
          ctx._dismissTimer=setTimeout(()=>{ctx.style.transition='opacity 0.6s ease';ctx.style.opacity='0';setTimeout(()=>{ctx.innerHTML='';ctx.style.transition='';ctx.style.opacity='1';},650);},4000);
        } else if(val==='partner'){
          ctx.innerHTML=`<div style="padding:11px 13px;background:#EDE6F2;border:0.5px solid var(--plum-mid);border-radius:var(--r-md)">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div style="width:28px;height:28px;border-radius:50%;background:#EDE6F2;color:#3C3489;font-size:11px;font-weight:600;display:flex;align-items:center;justify-content:center;border:1.5px solid var(--plum-mid);flex-shrink:0">SP</div>
              <div style="font-size:12px;font-weight:600;color:var(--plum)">Sophie's preferences</div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px">
              <span class="badge badge-plum">✓ Vegetarian</span>
              <span class="badge badge-plum">Mediterranean</span>
              <span class="badge badge-plum">Indian</span>
              <span class="badge badge-plum">Thai</span>
              <span class="badge badge-rose">Romantic</span>
              <span class="badge badge-rose">Outdoor</span>
            </div>
            <div style="font-size:11px;color:var(--ink-muted)">Ideas prioritise Sophie's vegetarian diet and love of outdoor & romantic settings</div>
          </div>`;
          ctx._dismissTimer=setTimeout(()=>{ctx.style.transition='opacity 0.6s ease';ctx.style.opacity='0';setTimeout(()=>{ctx.innerHTML='';ctx.style.transition='';ctx.style.opacity='1';},650);},4000);
        } else if(val==='just_because'){
          ctx.innerHTML=`<div style="padding:11px 13px;background:var(--rose-light);border:0.5px solid var(--rose-mid);border-radius:var(--r-md)">
            <div style="font-size:12px;font-weight:600;color:var(--rose-dark);margin-bottom:4px">♥ No reason needed</div>
            <div style="font-size:11px;color:var(--ink-muted)">We'll find something that feels special without the pressure of a big occasion — just a great night out together</div>
          </div>`;
        } else if(val==='special'){
          _specialOccasion='';
          ctx.innerHTML=`<div style="padding:11px 13px;background:var(--bg2);border:0.5px solid var(--bdr);border-radius:var(--r-md)">
            <div style="font-size:11px;font-weight:600;color:var(--ink-soft);margin-bottom:9px;letter-spacing:0.3px">What's the occasion?</div>
            <div style="display:flex;flex-wrap:wrap;gap:7px" id="special-occasion-chips">
              <div class="occasion-chip" onclick="selectSpecialOccasion(this,'anniversary')"><span>✦</span><span>Anniversary</span></div>
              <div class="occasion-chip" onclick="selectSpecialOccasion(this,'birthday')"><span>✦</span><span>Birthday</span></div>
              <div class="occasion-chip" onclick="selectSpecialOccasion(this,'valentines')"><span>♥</span><span>Valentine's</span></div>
              <div class="occasion-chip" onclick="selectSpecialOccasion(this,'proposal')"><span>✦</span><span>Proposal</span></div>
              <div class="occasion-chip" onclick="selectSpecialOccasion(this,'celebration')"><span>✦</span><span>Celebration</span></div>
              <div class="occasion-chip" onclick="selectSpecialOccasion(this,'milestone')"><span>✦</span><span>Milestone</span></div>
            </div>
          </div>`;
        } else {
          ctx.innerHTML='';
        }
      }

      function selectSpecialOccasion(el,val){
        document.querySelectorAll('#special-occasion-chips .occasion-chip').forEach(c=>c.classList.remove('active'));
        el.classList.add('active');
        _specialOccasion=val;
        _occasion=val;
        const hl=document.getElementById('discover-headline');
        if(hl&&_OCCASION_HEADLINES[val])hl.innerHTML=_OCCASION_HEADLINES[val];
      }

      function selectOccasionClassic(el,val){selectOccasion(el,val);}

      function openSpecialOccasionPicker(chipEl){
        // Highlight the special occasion chip
        chipEl.closest('[id^=date-occasion]').querySelectorAll('.occasion-chip').forEach(c=>c.classList.remove('active'));
        chipEl.classList.add('active');
        const ov=document.getElementById('special-occasion-overlay');
        if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
      }
      function closeSpecialOccasionPicker(){
        const ov=document.getElementById('special-occasion-overlay');
        if(ov){ov.style.display='none';document.body.style.overflow='';}
      }
      function pickSpecialOccasion(val,emoji,label){
        _occasion=val;
        // Update the chip label to show what was picked
        const chipLabel=document.getElementById('special-chip-label');
        if(chipLabel)chipLabel.textContent=label;
        const trigger=document.getElementById('special-occasion-trigger');
        if(trigger){
          const iconSpan=trigger.querySelector('.occasion-icon');
          if(iconSpan)iconSpan.innerHTML=emoji;
        }
        closeSpecialOccasionPicker();
        toast('✦ '+label+' selected — we\'ll tailor your suggestions');
      }

      let _vibeType='romantic';
      let _vibeTag='Candlelit';
      function selectVibe(el,type,tag){
        document.querySelectorAll('.vibe-card').forEach(c=>c.classList.remove('active'));
        el.classList.add('active');
        _vibeType=type;
        _vibeTag=tag;
      }

      let _discoverGuided=true;
      let _discoverFilterOpen=false;
      const _votes={};
      const _VEG_UNFRIENDLY=new Set(['Core by Clare Smyth','Alain Ducasse at The Dorchester']);

      // ── Love language state ──
      let _jamieLoveLang='quality_time';
      let _sophieLoveLang='physical_touch';
      const _LL_LABELS={quality_time:'Quality Time',words_of_affirmation:'Words of Affirmation',acts_of_service:'Acts of Service',receiving_gifts:'Receiving Gifts',physical_touch:'Physical Touch'};
      const _LL_ICONS={
        quality_time:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        words_of_affirmation:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>',
        acts_of_service:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>',
        receiving_gifts:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>',
        physical_touch:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 13"/></svg>'
      };
      // maps love language → vibes/types that align with it
      const _LL_IDEA_MAP={
        quality_time:{vibes:['Candlelit','Intimate'],types:['foodie'],hint:'Uninterrupted, present time together'},
        words_of_affirmation:{vibes:['Unique / memorable'],types:['cultural'],hint:'Experiences worth talking about for years'},
        acts_of_service:{vibes:['Walkable'],types:['all'],hint:'The effort and planning is the gesture'},
        receiving_gifts:{vibes:['Unique / memorable'],types:['all'],hint:'Something tangible to remember the night'},
        physical_touch:{vibes:['Walkable','Outdoor seats','Candlelit'],types:['outdoor','foodie'],hint:'Close, tactile and present'}
      };
      function setLoveLang(person,val){
        if(person==='jamie') _jamieLoveLang=val;
        else _sophieLoveLang=val;
        document.querySelectorAll(`.ll-chip[data-person="${person}"]`).forEach(c=>{
          c.classList.toggle('on',c.dataset.val===val);
        });
      }

      // ── Cosmic profile state ──
      let _jamieSign='',_sophieSign='',_jamieLPNum=0,_sophieLPNum=0,_jamieZodiac='',_sophieZodiac='';
      const _SIGN_EMOJI={Aries:'♈',Taurus:'♉',Gemini:'♊',Cancer:'♋',Leo:'♌',Virgo:'♍',Libra:'♎',Scorpio:'♏',Sagittarius:'♐',Capricorn:'♑',Aquarius:'♒',Pisces:'♓'};
      const _ZODIAC_EMOJI={Rat:'🐀',Ox:'🐂',Tiger:'🐅',Rabbit:'🐇',Dragon:'🐉',Snake:'🐍',Horse:'🐎',Goat:'🐐',Monkey:'🐒',Rooster:'🐓',Dog:'🐕',Pig:'🐖'};
      const _SIGN_ELEMENT={Aries:'fire',Leo:'fire',Sagittarius:'fire',Taurus:'earth',Virgo:'earth',Capricorn:'earth',Gemini:'air',Libra:'air',Aquarius:'air',Cancer:'water',Scorpio:'water',Pisces:'water'};
      const _LP_TITLE={1:'The Leader',2:'The Peacemaker',3:'The Creative',4:'The Builder',5:'The Explorer',6:'The Nurturer',7:'The Seeker',8:'The Achiever',9:'The Humanitarian',11:'The Visionary',22:'The Master Builder',33:'The Master Teacher'};
      // Chinese zodiac compatibility trines (same trine = harmonious)
      const _CZ_TRINE=[['Rat','Dragon','Monkey'],['Ox','Snake','Rooster'],['Tiger','Horse','Dog'],['Rabbit','Goat','Pig']];

      function _starSign(day,month){
        if((month==1&&day>=20)||(month==2&&day<19))return'Aquarius';
        if((month==2&&day>=19)||(month==3&&day<21))return'Pisces';
        if((month==3&&day>=21)||(month==4&&day<20))return'Aries';
        if((month==4&&day>=20)||(month==5&&day<21))return'Taurus';
        if((month==5&&day>=21)||(month==6&&day<21))return'Gemini';
        if((month==6&&day>=21)||(month==7&&day<23))return'Cancer';
        if((month==7&&day>=23)||(month==8&&day<23))return'Leo';
        if((month==8&&day>=23)||(month==9&&day<23))return'Virgo';
        if((month==9&&day>=23)||(month==10&&day<23))return'Libra';
        if((month==10&&day>=23)||(month==11&&day<22))return'Scorpio';
        if((month==11&&day>=22)||(month==12&&day<22))return'Sagittarius';
        return'Capricorn';
      }
      function _reduceNum(n){
        if(n===11||n===22||n===33)return n;
        while(n>9){n=String(n).split('').reduce((a,b)=>a+parseInt(b),0);if(n===11||n===22||n===33)return n;}
        return n;
      }
      function _lifePath(day,month,year){
        return _reduceNum(_reduceNum(day)+_reduceNum(month)+_reduceNum(String(year).split('').reduce((a,b)=>a+parseInt(b),0)));
      }
      function _chineseZodiac(year){
        const a=['Rat','Ox','Tiger','Rabbit','Dragon','Snake','Horse','Goat','Monkey','Rooster','Dog','Pig'];
        return a[((year-1900)%12+12)%12];
      }
      function updateCosmic(person,dateStr){
        const cosmicDiv=document.getElementById(person+'-cosmic');
        if(!dateStr){
          if(cosmicDiv)cosmicDiv.innerHTML='';
          if(person==='jamie'){_jamieSign='';_jamieLPNum=0;_jamieZodiac='';}
          else{_sophieSign='';_sophieLPNum=0;_sophieZodiac='';}
          updateCosmicCompatibility();return;
        }
        const[year,month,day]=dateStr.split('-').map(Number);
        const sign=_starSign(day,month);
        const lp=_lifePath(day,month,year);
        const zodiac=_chineseZodiac(year);
        if(person==='jamie'){_jamieSign=sign;_jamieLPNum=lp;_jamieZodiac=zodiac;}
        else{_sophieSign=sign;_sophieLPNum=lp;_sophieZodiac=zodiac;}
        if(cosmicDiv){
          cosmicDiv.innerHTML=`
            <span class="badge badge-rose" title="${sign}">${_SIGN_EMOJI[sign]||'✦'} ${sign}</span>
            <span class="badge badge-plum" title="${_LP_TITLE[lp]||''}">🔢 Life Path ${lp}${_LP_TITLE[lp]?' · '+_LP_TITLE[lp]:''}</span>
            <span class="badge badge-muted" title="Chinese Zodiac">${_ZODIAC_EMOJI[zodiac]||'🐾'} ${zodiac}</span>`;
        }
        updateCosmicCompatibility();
      }
      function updateCosmicCompatibility(){
        const el=document.getElementById('cosmic-compat');if(!el)return;
        if(!_jamieSign&&!_sophieSign){el.style.display='none';return;}
        el.style.display='';
        let rows=[];
        // Star sign compatibility
        if(_jamieSign&&_sophieSign){
          const jEl=_SIGN_ELEMENT[_jamieSign],sEl=_SIGN_ELEMENT[_sophieSign];
          let signNote='',signIcon='';
          if(jEl===sEl){signNote=`Same element (${jEl}) — natural understanding`;signIcon='✦';}
          else if((jEl==='fire'&&sEl==='air')||(jEl==='air'&&sEl==='fire')){signNote='Fire & air — you ignite each other';signIcon='🔥';}
          else if((jEl==='earth'&&sEl==='water')||(jEl==='water'&&sEl==='earth')){signNote='Earth & water — deeply nourishing bond';signIcon='💧';}
          else if((jEl==='fire'&&sEl==='water')||(jEl==='water'&&sEl==='fire')){signNote='Fire & water — passionate tension, always interesting';signIcon='⚡';}
          else{signNote='Different elements — you balance each other';signIcon='◎';}
          rows.push(`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:0.5px solid var(--bdr)">
            <span style="font-size:13px">${signIcon}</span>
            <div style="flex:1"><span style="font-size:12px;font-weight:600;color:var(--ink)">${_SIGN_EMOJI[_jamieSign]} ${_jamieSign}</span><span style="color:var(--ink-muted);font-size:12px"> & </span><span style="font-size:12px;font-weight:600;color:var(--ink)">${_SIGN_EMOJI[_sophieSign]} ${_sophieSign}</span></div>
            <span style="font-size:11px;color:var(--ink-muted)">${signNote}</span>
          </div>`);
        } else {
          const who=_jamieSign?'Jamie':'Sophie';
          const sign=_jamieSign||_sophieSign;
          rows.push(`<div style="font-size:11px;color:var(--ink-muted);padding:4px 0;border-bottom:0.5px solid var(--bdr)">${_SIGN_EMOJI[sign]||'✦'} ${who}: ${sign} — add the other's birthdate to see star sign compatibility</div>`);
        }
        // Life path compatibility
        if(_jamieLPNum&&_sophieLPNum){
          const compatible=[[1,2],[2,6],[3,6],[4,8],[5,7],[1,5],[2,4],[3,9],[6,9],[7,11],[8,22]];
          const pair=[Math.min(_jamieLPNum,_sophieLPNum),Math.max(_jamieLPNum,_sophieLPNum)];
          const isMatch=compatible.some(p=>p[0]===pair[0]&&p[1]===pair[1]);
          const sameNum=_jamieLPNum===_sophieLPNum;
          const lpNote=sameNum?'Matching life paths — you understand each other instinctively':isMatch?'Complementary life paths — each makes the other stronger':'Different paths — you bring out new sides of each other';
          rows.push(`<div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:0.5px solid var(--bdr)">
            <span style="font-size:13px">🔢</span>
            <div style="flex:1"><span style="font-size:12px;font-weight:600;color:var(--ink)">LP ${_jamieLPNum}</span><span style="font-size:11px;color:var(--ink-muted)"> ${_LP_TITLE[_jamieLPNum]||''}</span><span style="color:var(--ink-muted);font-size:12px"> & </span><span style="font-size:12px;font-weight:600;color:var(--ink)">LP ${_sophieLPNum}</span><span style="font-size:11px;color:var(--ink-muted)"> ${_LP_TITLE[_sophieLPNum]||''}</span></div>
            <span style="font-size:11px;color:var(--ink-muted)">${lpNote}</span>
          </div>`);
        }
        // Chinese zodiac compatibility
        if(_jamieZodiac&&_sophieZodiac){
          const jTrine=_CZ_TRINE.findIndex(t=>t.includes(_jamieZodiac));
          const sTrine=_CZ_TRINE.findIndex(t=>t.includes(_sophieZodiac));
          const czNote=jTrine>=0&&jTrine===sTrine?'Same zodiac trine — natural harmony and deep understanding':_jamieZodiac===_sophieZodiac?'Same Chinese zodiac year — mirror souls':'Different zodiacs — complementary energies';
          rows.push(`<div style="display:flex;align-items:center;gap:8px;padding:5px 0">
            <span style="font-size:13px">${_ZODIAC_EMOJI[_jamieZodiac]||'🐾'}</span>
            <div style="flex:1"><span style="font-size:12px;font-weight:600;color:var(--ink)">${_jamieZodiac}</span><span style="color:var(--ink-muted);font-size:12px"> & </span><span style="font-size:12px;font-weight:600;color:var(--ink)">${_sophieZodiac}</span><span style="font-size:11px;color:var(--ink-muted)"> ${_ZODIAC_EMOJI[_sophieZodiac]||''}</span></div>
            <span style="font-size:11px;color:var(--ink-muted)">${czNote}</span>
          </div>`);
        }
        el.innerHTML=`<div style="font-size:11px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--ink-muted);margin-bottom:8px">✦ Cosmic compatibility</div>${rows.join('')}`;
      }

      // ── Social proof: deterministic "booked" count per idea ──
      const _AVATAR_COLORS=['#FBEAF0','#EDE6F2','#E8F4FD','#E8F5E9','#FFF3E0','#FCE4EC','#F3E5F5','#E3F2FD'];
      function _bookedCount(name,score,type){
        const hash=name.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
        const base={foodie:22,romantic:19,cultural:16,outdoor:13,fun:11}[type]||14;
        return base+(hash%38)+Math.round(score*0.22);
      }

      // ── What's Hot data ──
      const WHATS_HOT_DATA=[
        // CONCERTS
        {id:'wh1',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎸',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&q=80',
        name:'Khruangbin – Rondeaux Tour',venue:'Roundhouse, Camden',date:'Sat 3 May',
        price:'From £45',match:94,booked:312,tags:['Soulful','Intimate atmosphere','Live music']},
        {id:'wh2',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎻',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&q=80',
        name:'LSO: Ravel & Debussy',venue:'Barbican Centre',date:'Fri 9 May',
        price:'From £28',match:89,booked:204,tags:['Classical','Cultural','Elegant']},
        {id:'wh3',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎹',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=600&q=80',
        name:'Hania Rani – Piano Portraits',venue:"King's Place, King's Cross",date:'Thu 1 May',
        price:'From £35',match:91,booked:178,tags:['Piano','Atmospheric','Intimate']},
        {id:'wh4',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎷',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&q=80',
        name:"Ronnie Scott's Late Night Jazz",venue:'Frith Street, Soho',date:'Every Fri & Sat',
        price:'From £30',match:88,booked:267,tags:['Jazz','Late night','Iconic venue']},
        {id:'wh40',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎤',trending:'Ending soon',trendCls:'ending',
        img:'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80',
        name:'Jorja Smith – Falling or Flying',venue:'O2 Academy Brixton',date:'Fri 16 May',
        price:'From £55',match:90,booked:428,tags:['R&B','Soulful','High energy']},
        {id:'wh41',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎵',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&q=80',
        name:'Nils Frahm – All Encores',venue:'Royal Albert Hall',date:'Sat 24 May',
        price:'From £40',match:93,booked:356,tags:['Electronic','Ambient','Immersive']},
        // DINING
        {id:'wh5',cat:'dining',gradient:'wh-gradient-dining',emoji:'🥗',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
        name:'Ottolenghi ROVI – Spring Menu',venue:'Wells Street, Fitzrovia',date:'Open now',
        price:'£70–85pp',match:96,booked:341,tags:['Mediterranean','Vegetarian','Seasonal']},
        {id:'wh6',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍜',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&q=80',
        name:'Kiln – Northern Thai Fire',venue:'Brewer Street, Soho',date:'Open now',
        price:'£45pp',match:93,booked:227,tags:['Thai','Vibrant','Counter dining']},
        {id:'wh7',cat:'dining',gradient:'wh-gradient-dining',emoji:'🥢',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1579027989536-b7b1f875659b?w=600&q=80',
        name:'Bossa – Brazilian Izakaya',venue:'Hoxton Square, Shoreditch',date:'Open now',
        price:'£55pp',match:92,booked:196,tags:['Japanese-Brazilian','Cocktails','Intimate']},
        {id:'wh8',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍛',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&q=80',
        name:'Gymkhana – Tasting Menu',venue:'Albemarle Street, Mayfair',date:'Open now',
        price:'£115pp',match:90,booked:289,tags:['Indian fine dining','Refined','Cultural']},
        {id:'wh9',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍱',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1553621042-f6e147245754?w=600&q=80',
        name:'Matsunoki – Omakase Counter',venue:'Marylebone High Street',date:'Open now',
        price:'£95pp',match:95,booked:142,tags:['Japanese','Omakase','Intimate']},
        {id:'wh42',cat:'dining',gradient:'wh-gradient-dining',emoji:'🦪',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=600&q=80',
        name:'The Oystermen – Seafood Bar',venue:'Covent Garden',date:'Open now',
        price:'£60pp',match:88,booked:183,tags:['Seafood','Champagne','Intimate']},
        {id:'wh43',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍝',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=600&q=80',
        name:'Padella – Fresh Pasta Counter',venue:'Borough Market, SE1',date:'Open now',
        price:'£25pp',match:91,booked:412,tags:['Italian','Handmade pasta','Queue-worthy']},
        {id:'wh44',cat:'dining',gradient:'wh-gradient-dining',emoji:'🥩',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1558030006-450675393462?w=600&q=80',
        name:'Brat – Open Fire Cooking',venue:'Shoreditch High Street',date:'Open now',
        price:'£85pp',match:94,booked:276,tags:['Michelin','Fire-cooked','Intimate']},
        {id:'wh45',cat:'dining',gradient:'wh-gradient-dining',emoji:'🫕',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=600&q=80',
        name:'Bob Bob Ricard – Press for Champagne',venue:'Soho',date:'Open now',
        price:'£90pp',match:93,booked:305,tags:['Glamorous','Champagne button','Iconic']},
        // EXPERIENCES
        {id:'wh10',cat:'experience',gradient:'wh-gradient-experience',emoji:'🎬',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&q=80',
        name:'Secret Cinema: La Dolce Vita',venue:'Tobacco Dock, Wapping',date:'Every Fri & Sat',
        price:'£49pp',match:95,booked:389,tags:['Italian','Cinematic','Romantic']},
        {id:'wh11',cat:'experience',gradient:'wh-gradient-experience',emoji:'🌿',trending:'Ending soon',trendCls:'ending',
        img:'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=600&q=80',
        name:'Kew Gardens – Orchid Festival',venue:'Royal Botanic Gardens, Kew',date:'Until 4 May',
        price:'£22pp',match:90,booked:267,tags:['Outdoor','Romantic','Garden']},
        {id:'wh12',cat:'experience',gradient:'wh-gradient-experience',emoji:'🫙',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=600&q=80',
        name:'Pottery Date at Turning Earth',venue:'London Fields, Hackney',date:'Saturdays',
        price:'£65pp',match:88,booked:156,tags:['Creative','Intimate','Hands-on']},
        {id:'wh13',cat:'experience',gradient:'wh-gradient-experience',emoji:'🎨',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=80',
        name:'Life Drawing with Wine',venue:'Bermondsey Street, SE1',date:'Wed & Fri evenings',
        price:'£40pp',match:86,booked:118,tags:['Creative','Relaxed','Cultural']},
        {id:'wh46',cat:'experience',gradient:'wh-gradient-experience',emoji:'🎭',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&q=80',
        name:'Punchdrunk: The Burnt City',venue:'Woolwich Works, SE18',date:'Thu–Sat evenings',
        price:'£58pp',match:96,booked:347,tags:['Immersive','Theatre','Atmospheric']},
        {id:'wh47',cat:'experience',gradient:'wh-gradient-experience',emoji:'🔮',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&q=80',
        name:'Frameless – Immersive Art',venue:'Marble Arch',date:'Open daily',
        price:'£32pp',match:89,booked:224,tags:['Art','Immersive','Photography']},
        // ACTIVITIES
        {id:'wh14',cat:'activity',gradient:'wh-gradient-activity',emoji:'🍸',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&q=80',
        name:'Cocktail Masterclass – Negroni Ed.',venue:'Cahoots, Kingly Court, Soho',date:'Thursdays',
        price:'£55pp',match:93,booked:219,tags:['Fun','Intimate','Drinks']},
        {id:'wh15',cat:'activity',gradient:'wh-gradient-activity',emoji:'🍜',trending:'Hot',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&q=80',
        name:'Japanese Ramen Workshop',venue:'Notting Hill Kitchen',date:'Saturdays',
        price:'£70pp',match:97,booked:188,tags:['Japanese','Cooking','Intimate']},
        {id:'wh16',cat:'activity',gradient:'wh-gradient-activity',emoji:'🧘',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80',
        name:'Sunrise Yoga at Sky Garden',venue:'20 Fenchurch Street, City',date:'Sun 4 May, 7am',
        price:'£28pp',match:84,booked:143,tags:['Outdoor','Wellness','Active']},
        {id:'wh48',cat:'activity',gradient:'wh-gradient-activity',emoji:'🏎️',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
        name:'F1 Arcade – Racing Simulators',venue:'One New Change, City',date:'Open daily',
        price:'£35pp',match:85,booked:198,tags:['Competitive','Fun','High-tech']},
        {id:'wh49',cat:'activity',gradient:'wh-gradient-activity',emoji:'🎳',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1545232979-8bf68ee9b1af?w=600&q=80',
        name:'All Star Lanes – Boutique Bowling',venue:'Holborn',date:'Open daily',
        price:'£38pp',match:82,booked:167,tags:['Retro','Cocktails','Playful']},
        // ROOFTOPS
        {id:'wh50',cat:'rooftop',gradient:'wh-gradient-rooftop',emoji:'🌇',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&q=80',
        name:'Sushisamba – 38th Floor',venue:'Heron Tower, Liverpool Street',date:'Open now',
        price:'£95pp',match:92,booked:284,tags:['Japanese-Brazilian','Skyline views','Prestige']},
        {id:'wh51',cat:'rooftop',gradient:'wh-gradient-rooftop',emoji:'🥂',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&q=80',
        name:'Aqua Shard – Sunset Cocktails',venue:'31st Floor, The Shard',date:'Open now',
        price:'£75pp',match:90,booked:336,tags:['Panoramic','Cocktails','Romantic']},
        {id:'wh52',cat:'rooftop',gradient:'wh-gradient-rooftop',emoji:'🍹',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1560624052-449f5ddf0c31?w=600&q=80',
        name:'Roof East – Open Air Cinema',venue:'Stratford Multi-Storey',date:'Fri & Sat',
        price:'£22pp',match:86,booked:195,tags:['Outdoor cinema','Casual','Summer vibes']},
        {id:'wh53',cat:'rooftop',gradient:'wh-gradient-rooftop',emoji:'🌃',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1470219556762-1fd5b25f1bcc?w=600&q=80',
        name:'Madison – St Paul\'s Terrace',venue:'One New Change, City',date:'Open now',
        price:'£55pp',match:88,booked:251,tags:['St Paul\'s view','Elegant','After-work']},
        // THEATRE
        {id:'wh54',cat:'theatre',gradient:'wh-gradient-theatre',emoji:'🎭',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600&q=80',
        name:'Cabaret at the Kit Kat Club',venue:'Playhouse Theatre, West End',date:'Mon–Sat',
        price:'From £35',match:95,booked:478,tags:['Immersive','Iconic','Intimate']},
        {id:'wh55',cat:'theatre',gradient:'wh-gradient-theatre',emoji:'🩰',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80',
        name:'Romeo & Juliet – Royal Ballet',venue:'Royal Opera House, Covent Garden',date:'Until 10 May',
        price:'From £28',match:91,booked:312,tags:['Ballet','World-class','Romantic']},
        {id:'wh56',cat:'theatre',gradient:'wh-gradient-theatre',emoji:'✨',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?w=600&q=80',
        name:'Stranger Things: The First Shadow',venue:'Phoenix Theatre, West End',date:'Mon–Sat',
        price:'From £25',match:87,booked:389,tags:['Sci-fi','Immersive','Production']},
        {id:'wh57',cat:'theatre',gradient:'wh-gradient-theatre',emoji:'🎪',trending:'Ending soon',trendCls:'ending',
        img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&q=80',
        name:'The Book of Mormon',venue:'Gielgud Theatre, West End',date:'Mon–Sat',
        price:'From £30',match:84,booked:356,tags:['Musical','Comedy','Award-winning']},
        // WELLNESS
        {id:'wh58',cat:'wellness',gradient:'wh-gradient-wellness',emoji:'🧖',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&q=80',
        name:'AIRE Ancient Baths – Couples',venue:'Porchester Road, Bayswater',date:'Open daily',
        price:'£95pp',match:94,booked:276,tags:['Candlelit','Thermal','Romantic']},
        {id:'wh59',cat:'wellness',gradient:'wh-gradient-wellness',emoji:'🧊',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1540555700478-4be289fbec6d?w=600&q=80',
        name:'Monk London – Ice Bath & Sauna',venue:'Fulham',date:'Open daily',
        price:'£45pp',match:82,booked:189,tags:['Cold plunge','Contrast therapy','Trending']},
        {id:'wh60',cat:'wellness',gradient:'wh-gradient-wellness',emoji:'💆',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=600&q=80',
        name:'Cowshed Spa – Couples Retreat',venue:'Shoreditch House',date:'Open daily',
        price:'£120pp',match:91,booked:134,tags:['Spa','Members club','Luxury']},
        // LATE NIGHT
        {id:'wh61',cat:'latenight',gradient:'wh-gradient-latenight',emoji:'🌙',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600&q=80',
        name:'Experimental Cocktail Club',venue:'Chinatown, Soho',date:'Wed–Sun, 6pm–2am',
        price:'£50pp',match:91,booked:267,tags:['Speakeasy','Inventive cocktails','Moody']},
        {id:'wh62',cat:'latenight',gradient:'wh-gradient-latenight',emoji:'🎵',trending:'Rising',trendCls:'rising',
        img:'https://images.unsplash.com/photo-1571204829887-3b8d69e4094d?w=600&q=80',
        name:'Nightjar – Jazz & Cocktails',venue:'Shoreditch',date:'Tue–Sat, 6pm–1am',
        price:'£55pp',match:93,booked:198,tags:['Prohibition','Live jazz','Hidden bar']},
        {id:'wh63',cat:'latenight',gradient:'wh-gradient-latenight',emoji:'🍷',trending:'New this week',trendCls:'new',
        img:'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=600&q=80',
        name:'Swift – Upstairs & Downstairs',venue:'Soho',date:'Mon–Sat, 3pm–1am',
        price:'£40pp',match:88,booked:224,tags:['Whisky','Art deco','Intimate']},
        {id:'wh64',cat:'latenight',gradient:'wh-gradient-latenight',emoji:'🎶',trending:'🔥 Trending',trendCls:'hot',
        img:'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80',
        name:'The Blues Kitchen – Live Music',venue:'Camden, Shoreditch, Brixton',date:'Every night',
        price:'Free–£15',match:86,booked:312,tags:['Blues','Southern food','Dancing']},
      ];

      let _whCat='all';

      function whFilter(cat,el){
        _whCat=cat;
        document.querySelectorAll('.wh-chip').forEach(c=>c.classList.remove('on'));
        if(el)el.classList.add('on');
        renderWhatsHot();
      }

      function renderWhatsHot(){
        const feed=document.getElementById('wh-feed');
        if(!feed)return;
        const items=_whCat==='all'?WHATS_HOT_DATA:WHATS_HOT_DATA.filter(i=>i.cat===_whCat);
        const catLabels={concert:'Concert',dining:'Dining',experience:'Experience',activity:'Activity',rooftop:'Rooftop',theatre:'Theatre',wellness:'Wellness',latenight:'Late Night'};
        const pinSVG=`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
        const peopleSVG=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
        feed.innerHTML=items.map(item=>`
          <div class="wh-card">
            <div class="wh-card-top ${item.gradient}">
              <img class="wh-card-img" src="${item.img}" alt="${item.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
              <div class="wh-card-top-inner">${item.emoji}</div>
              <div class="wh-trending-pill ${item.trendCls}">${item.trending}</div>
              <div class="wh-match-pill">
                <div class="wh-match-pct">${item.match}%</div>
                <div class="wh-match-label">match</div>
              </div>
            </div>
            <div class="wh-card-body">
              <div class="wh-cat-tag">${catLabels[item.cat]||item.cat}</div>
              <div class="wh-name">${item.name}</div>
              <div class="wh-venue">${pinSVG} ${item.venue} · <span style="color:rgba(201,168,76,0.6)">${item.date}</span></div>
              <div class="wh-tags">${item.tags.map(t=>`<span class="wh-tag">${t}</span>`).join('')}</div>
              <div class="wh-footer">
                <div>
                  <div class="wh-booked">${peopleSVG} <span class="wh-booked-count">${item.booked}</span>&nbsp;couples booked this week</div>
                  <div class="wh-price">${item.price}<span class="wh-price-note">av. per person</span></div>
                </div>
                <button class="wh-save-btn" onclick="saveToWishlist('${item.name.replace(/'/g,"\\'")}','✦','${item.price.replace(/'/g,"\\'")}','${item.cat}','Trending in London — ${item.match}% match');this.innerHTML='✓ Saved';this.style.background='rgba(74,222,128,0.15)';this.style.borderColor='rgba(74,222,128,0.4)';this.style.color='#4ADE80'">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                  Save
                </button>
              </div>
            </div>
          </div>`).join('');
      }

      let _currentSuggestions=[];  // stores last 4 ideas shown — needed for Sophie share link

      function toggleDiscoverView(){
        // legacy — no-op since we replaced the view toggle with a filter bar
      }

      function toggleDiscoverFilter(){
        _discoverFilterOpen=!_discoverFilterOpen;
        const panel=document.getElementById('discover-filter-panel');
        const chevron=document.getElementById('discover-filter-chevron');
        if(panel){panel.style.display=_discoverFilterOpen?'block':'none';}
        if(chevron){chevron.style.transform=_discoverFilterOpen?'rotate(90deg)':'rotate(0deg)';}
      }

      function _updateFilterSummary(){
        const vibeLabels={romantic:'Romantic',fun:'Fun & Flirty',outdoor:'Chill & Cozy',all:'Unique'};
        const budgetLabels=['Under £50','£50–£150','£150–£300','£300+'];
        const sliderEl=document.getElementById('budget-slider');
        const budgetVal=sliderEl?parseInt(sliderEl.value):1;
        const vLabel=vibeLabels[_vibeType]||'Any vibe';
        const bLabel=budgetLabels[budgetVal]||'£50–£150';
        const el=document.getElementById('discover-filter-summary');
        if(el)el.textContent=`${vLabel} · ${bLabel}`;
      }

      function curateAndCollapse(){
        // Collapse the filter panel
        _discoverFilterOpen=false;
        const panel=document.getElementById('discover-filter-panel');
        const chevron=document.getElementById('discover-filter-chevron');
        if(panel){panel.style.display='none';}
        if(chevron){chevron.style.transform='rotate(0deg)';}
        // Update summary text
        _updateFilterSummary();
        // Show mood check-in then generate
        showMoodCheckIn();
      }

      function generateSuggestions(_instant){
        const sliderEl=document.getElementById('budget-slider');
        const sliderVal=sliderEl?parseInt(sliderEl.value):1;
        const budget=BUDGET_KEYS[sliderVal]||'mid';
        const locEl=document.getElementById('loc-select');
        const loc=locEl?locEl.value:'London, UK';
        let vibe=_vibeType||'all';
        let activeTags=_vibeTag?[_vibeTag]:[];
        const occasionLabel={first_date:'First date',partner:'My partner',special:'Special occasion',just_because:'Just because',anniversary:'Anniversary',birthday:'Birthday',valentines:"Valentine's",proposal:'Proposal',celebration:'Celebration',milestone:'Milestone'}[_occasion]||'';
        const area=document.getElementById('suggestions-area');
        const loadMsg=_occasion==='proposal'?'Finding the perfect proposal evening ✦...'
          :_occasion==='anniversary'?'Finding the perfect anniversary for Jamie & Sophie...'
          :_occasion==='birthday'?'Finding the perfect birthday evening...'
          :_occasion==='valentines'?"Finding the perfect Valentine's evening..."
          :_occasion==='first_date'?'Finding the perfect first date ideas for Jamie...'
          :_occasion==='just_because'?'Finding a great night out — just because ♥...'
          :['celebration','milestone','special'].includes(_occasion)?'Finding something truly special for Jamie & Sophie...'
          :'Matching ideas to Jamie & Sophie\'s tastes...';
        if(!_instant) area.innerHTML=`<div class="card"><div class="loading-overlay"><div class="spinner"></div><div class="loading-text">${loadMsg}</div></div></div>`;
        setTimeout(()=>{
          let allIdeas=[...(IDEAS[budget]||IDEAS.mid)];

          // ── Feature 3: Dietary — push veg-unfriendly to the back ──
          const vegFiltered=allIdeas.filter(i=>_VEG_UNFRIENDLY.has(i.name));
          allIdeas.sort((a,b)=>{
            const aOk=!_VEG_UNFRIENDLY.has(a.name),bOk=!_VEG_UNFRIENDLY.has(b.name);
            return aOk===bOk?0:(aOk?-1:1);
          });

          let ideas=[...allIdeas];
          if(vibe!=='all') ideas=ideas.filter(i=>i.type===vibe).concat(ideas.filter(i=>i.type!==vibe)).slice(0,4);
          if(activeTags.length) ideas.sort((a,b)=>{
            const sa=activeTags.filter(t=>a.vibes.includes(t)).length;
            const sb=activeTags.filter(t=>b.vibes.includes(t)).length;
            return sb-sa;
          });
          ideas=ideas.slice(0,4);

          // ── Love language scoring boost ──
          const sLL=_LL_IDEA_MAP[_sophieLoveLang]||{vibes:[],types:[]};
          const jLL=_LL_IDEA_MAP[_jamieLoveLang]||{vibes:[],types:[]};
          function llMatchScore(idea,llMap){
            const vibeHit=llMap.vibes.some(v=>idea.vibes.includes(v))?1:0;
            const typeHit=(llMap.types.includes('all')||llMap.types.includes(idea.type))?1:0;
            return vibeHit+typeHit;
          }
          ideas.sort((a,b)=>{
            const sa=llMatchScore(a,sLL)+llMatchScore(a,jLL);
            const sb=llMatchScore(b,sLL)+llMatchScore(b,jLL);
            return sb-sa;
          });

          // ── Feature 5: Weather-aware sort ──
          const _RAINY_CODES=[51,53,55,61,63,65,71,73,75,80,81,82,95,96,99];
          const _isRainy=_RAINY_CODES.includes(_weatherCode);
          const _isClearWarm=[0,1,2].includes(_weatherCode)&&_weatherTemp>=15;
          let _weatherBanner='';
          if(_isRainy){
            ideas.sort((a,b)=>{
              const aOut=a.type==='outdoor'||a.vibes.includes('Outdoor seats');
              const bOut=b.type==='outdoor'||b.vibes.includes('Outdoor seats');
              return aOut===bOut?0:(aOut?1:-1);
            });
            _weatherBanner=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:#EFF6FF;border:0.5px solid #93C5FD;border-radius:var(--r-md);margin-bottom:12px;font-size:11px;color:#1e3a5f"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/></svg><div><span style="font-weight:600;color:#1D4ED8">It's raining (${_weatherTemp}°C)</span> — outdoor options moved to the bottom. Indoor dining & experiences first.</div></div>`;
          } else if(_isClearWarm){
            ideas.sort((a,b)=>{
              const aOut=a.type==='outdoor'||a.vibes.includes('Outdoor seats');
              const bOut=b.type==='outdoor'||b.vibes.includes('Outdoor seats');
              return aOut===bOut?0:(aOut?-1:1);
            });
            _weatherBanner=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:#FFFBEB;border:0.5px solid #FCD34D;border-radius:var(--r-md);margin-bottom:12px;font-size:11px;color:#78350F"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg><div><span style="font-weight:600;color:#B45309">Clear evening (${_weatherTemp}°C)</span> — rooftop, garden & outdoor options moved to the top.</div></div>`;
          }

          // ── Mood-aware sort ──
          let _moodBanner='';
          if(_moodEnergy==='tired'){
            ideas.sort((a,b)=>{
              const aCozy=['romantic','foodie'].includes(a.type)||a.vibes.includes('Intimate')||a.vibes.includes('Candlelit');
              const bCozy=['romantic','foodie'].includes(b.type)||b.vibes.includes('Intimate')||b.vibes.includes('Candlelit');
              return aCozy===bCozy?0:(aCozy?-1:1);
            });
            _moodBanner=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:linear-gradient(135deg,#FDF8FF,#F5F0FA);border:0.5px solid var(--plum-mid);border-radius:var(--r-md);margin-bottom:12px;font-size:11px;color:var(--plum)"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><div><span style="font-weight:600">Low energy tonight</span> — cosy, intimate & effortless options moved to the top.</div></div>`;
          } else if(_moodEnergy==='energetic'){
            ideas.sort((a,b)=>{
              const aActive=['outdoor','fun','cultural'].includes(a.type);
              const bActive=['outdoor','fun','cultural'].includes(b.type);
              return aActive===bActive?0:(aActive?-1:1);
            });
            _moodBanner=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border:0.5px solid #FCD34D;border-radius:var(--r-md);margin-bottom:12px;font-size:11px;color:#78350F"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><div><span style="font-weight:600">You've got energy tonight</span> — active, cultural & immersive experiences at the top.</div></div>`;
          }

          // ── Double-date banner ──
          let _ddBanner='';
          if(_doubleDateMode){
            const n1=document.getElementById('dd-name1')?.value||'Alex';
            const n2=document.getElementById('dd-name2')?.value||'Jordan';
            _ddBanner=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:#EFF6FF;border:0.5px solid #93C5FD;border-radius:var(--r-md);margin-bottom:12px;font-size:11px;color:#1e3a5f"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg><div><span style="font-weight:600">Double-date mode</span> — planning for Jamie, Sophie, ${n1} & ${n2}. Pick an idea all four will love.</div></div>`;
          }

          const topScore=Math.max(...ideas.map(i=>i.score));

          // ── Popularity boost: popular + preference-matched ideas float to top ──
          const POP_THRESHOLD=45;
          ideas.forEach(i=>{i._pop=_bookedCount(i.name,i.score,i.type);});
          ideas.sort((a,b)=>{
            const aHot=a._pop>=POP_THRESHOLD&&a.score>=65;
            const bHot=b._pop>=POP_THRESHOLD&&b.score>=65;
            return aHot===bHot?0:(aHot?-1:1);
          });

          const occasionSuffix='';
          const occasionLine=occasionLabel?`<div style="font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;color:var(--primary);margin-top:4px;border-bottom:1px solid rgba(201,168,76,0.3);display:inline-block;padding-bottom:2px">${occasionLabel}</div>`:'';

          // ── Feature 1: both-loved summary ──
          const bothLoved=Object.entries(_votes).filter(([,v])=>v.j===true&&v.s===true).map(([k])=>k);

          // ── Love language context line ──
          const sLLLabel=_LL_LABELS[_sophieLoveLang]||'';
          const jLLLabel=_LL_LABELS[_jamieLoveLang]||'';
          const sLLIcon=_LL_ICONS[_sophieLoveLang]||'';
          const jLLIcon=_LL_ICONS[_jamieLoveLang]||'';

          const locShort=loc.split(',')[0].trim();
          let html=`<div class="section-head" style="flex-wrap:wrap"><div><div class="section-title" style="font-family:var(--font-serif);font-size:17px;letter-spacing:-0.2px">Here's what you're doing in ${locShort}</div>${occasionLine}</div><div class="section-link" onclick="generateSuggestions()">Refresh ↺</div></div>`;
          html+=`<div id="ll-personalisation-banner" style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:linear-gradient(135deg,#FDF0F3,#F0EAF7);border:0.5px solid var(--rose-mid);border-radius:var(--r-md);margin-bottom:12px;font-size:11px;color:var(--ink-soft);transition:opacity 0.6s ease">
            <span style="font-size:15px">♥</span>
            <div><span style="font-weight:600;color:var(--ink)">Personalised for your love languages</span> · <span style="color:var(--rose-dark)">${jLLIcon} Jamie: ${jLLLabel}</span> &nbsp;·&nbsp; <span style="color:var(--plum)">${sLLIcon} Sophie: ${sLLLabel}</span>
            <div style="margin-top:2px;color:var(--ink-muted)">Ideas ranked to match how you each feel most loved — <a href="#" onclick="event.preventDefault();go('profiles',document.querySelector('[onclick*=profiles]'))" style="color:var(--rose-dark);text-decoration:none">update in profiles ↗</a></div></div>
          </div>`;
          if(_jamieSign||_sophieSign){
            const jCosmic=_jamieSign?`${_SIGN_EMOJI[_jamieSign]||'✦'} ${_jamieSign}${_jamieLPNum?' · LP'+_jamieLPNum:''}${_jamieZodiac?' · '+_jamieZodiac:''}`:null;
            const sCosmic=_sophieSign?`${_SIGN_EMOJI[_sophieSign]||'✦'} ${_sophieSign}${_sophieLPNum?' · LP'+_sophieLPNum:''}${_sophieZodiac?' · '+_sophieZodiac:''}`:null;
            const cosmicParts=[jCosmic?`<span style="color:var(--rose-dark)">Jamie: ${jCosmic}</span>`:'',sCosmic?`<span style="color:var(--plum)">Sophie: ${sCosmic}</span>`:''].filter(Boolean).join(' &nbsp;·&nbsp; ');
            html+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:var(--bg2);border:0.5px solid var(--bdr);border-radius:var(--r-md);margin-bottom:12px;font-size:11px;color:var(--ink-soft)">
              <span style="font-size:15px">✦</span>
              <div><span style="font-weight:600;color:var(--ink)">Cosmic profile</span> · ${cosmicParts}
              ${(!_jamieSign||!_sophieSign)?'<div style="margin-top:2px;color:var(--ink-muted)">Add both birthdates to see full cosmic compatibility</div>':''}</div>
            </div>`;
          }

          // ── Feature 4: Occasion-aware smart nudges ──
          const today=new Date();
          const todayStr=today.toISOString().slice(0,10);
          // Check for upcoming hotel check-ins (next 7 days) without a cab booked same day
          const upcomingCheckins=reminders.filter(r=>{
            if(r.cat!=='Hotel check-in') return false;
            const diff=Math.round((new Date(r.date+' 12:00')-today)/(1000*60*60*24));
            return diff>=0&&diff<=7;
          });
          upcomingCheckins.forEach(checkin=>{
            const hasCab=bookings.some(b=>b.type==='cab'&&b.date===checkin.date);
            if(!hasCab){
              const daysAway=Math.round((new Date(checkin.date+' 12:00')-today)/(1000*60*60*24));
              const whenStr=daysAway===0?'today':daysAway===1?'tomorrow':`in ${daysAway} days`;
              html+=`<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:linear-gradient(135deg,#EFF6FF,#EEF2FF);border:0.5px solid #93C5FD;border-radius:var(--r-md);margin-bottom:12px;font-size:12px;color:#1e3a5f">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="M9 14h6"/><path d="M9 18h6"/></svg>
                <div style="flex:1"><span style="font-weight:600">${checkin.title}</span> is ${whenStr} — no cab booked yet.
                <span style="color:#1D4ED8;cursor:pointer;font-weight:500" onclick="go('cabs',document.querySelector('[onclick*=cabs]'))"> Book transport ↗</span></div>
              </div>`;
            }
          });
          // Check for anniversary reminders within 14 days
          const anniversaryRems=reminders.filter(r=>{
            const titleLower=r.title.toLowerCase();
            if(!titleLower.includes('anniversary')&&r.cat!=='Personal') return false;
            if(!titleLower.includes('anniversary')) return false;
            const diff=Math.round((new Date(r.date+' 12:00')-today)/(1000*60*60*24));
            return diff>=0&&diff<=14;
          });
          anniversaryRems.forEach(ann=>{
            const annBooking=bookings.find(b=>b.date===ann.date||(b.name||'').toLowerCase().includes('anniversary'));
            if(!annBooking){
              const diff=Math.round((new Date(ann.date+' 12:00')-today)/(1000*60*60*24));
              const daysStr=diff===0?'is today':diff===1?'is tomorrow':`is in ${diff} day${diff!==1?'s':''}`;
              html+=`<div style="display:flex;align-items:center;gap:10px;padding:11px 14px;background:linear-gradient(135deg,#FDF8F0,#FEF0F3);border:1.5px solid var(--rose-mid);border-radius:var(--r-md);margin-bottom:12px;font-size:12px;color:var(--rose-dark)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/></svg>
                <div style="flex:1"><span style="font-weight:600">Your anniversary ${daysStr}</span> — nothing booked yet.
                <span style="font-weight:500;cursor:pointer" onclick="_occasion='anniversary';generateSuggestions()"> Plan something special ↗</span></div>
              </div>`;
            }
          });

          // ── Feature 6: Budget nudge ──
          if(_monthlyBudget>0){
            const nowStr=new Date().toISOString().slice(0,7);
            const monthSpend=bookings.reduce((acc,b)=>{
              if((b.date||'').slice(0,7)!==nowStr) return acc;
              const n=parseFloat((b.amount||'').replace(/[£,]/g,''));
              return acc+(isNaN(n)?0:n);
            },0);
            const remaining=_monthlyBudget-monthSpend;
            const avgIdeaPrice=ideas.reduce((acc,i)=>{const n=parseFloat((i.price||'').replace(/[£, a-z]/gi,''));return acc+(isNaN(n)?0:n);},0)/Math.max(ideas.length,1);
            if(remaining<=0){
              html+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:#FEF2F2;border:0.5px solid #FCA5A5;border-radius:var(--r-md);margin-bottom:12px;font-size:11px;color:#991B1B"><span style="font-size:15px">⚠️</span><div><span style="font-weight:600">You've hit your £${_monthlyBudget} date budget this month.</span> Consider a free or low-cost option, or adjust your budget in <span style="cursor:pointer;text-decoration:underline" onclick="go('profiles',document.querySelector('[onclick*=profiles]'))">Profiles</span>.</div></div>`;
            } else if(avgIdeaPrice>remaining){
              html+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:#FFFBEB;border:0.5px solid #FCD34D;border-radius:var(--r-md);margin-bottom:12px;font-size:11px;color:#78350F"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg><div><span style="font-weight:600">£${Math.round(remaining)} left in your monthly budget.</span> These ideas may run over — worth checking before you book.</div></div>`;
            }
          }

          // Mood + double-date + weather banners
          if(_moodBanner) html+=_moodBanner;
          if(_ddBanner) html+=_ddBanner;
          if(_weatherBanner) html+=_weatherBanner;

          // Dietary notice
          if(vegFiltered.length){
            html+=`<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:#F0FDF4;border:0.5px solid #86EFAC;border-radius:var(--r-md);margin-bottom:12px;font-size:12px;color:#166534">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 2l10 10.5L22 2"/><path d="M12 12.5V22"/></svg><span>Sophie is vegetarian — her-friendly options shown first. <strong>${vegFiltered.length} venue${vegFiltered.length>1?'s':''}</strong> with limited veg options are at the bottom.</span>
            </div>`;
          }

          // Both loved banner
          if(bothLoved.length){
            html+=`<div style="padding:10px 14px;background:linear-gradient(135deg,#FEF0F3,#FDF4FF);border:1.5px solid var(--rose);border-radius:var(--r-md);margin-bottom:12px;display:flex;align-items:center;gap:10px">
              <span style="font-size:20px">♥</span>
              <div><div style="font-size:13px;font-weight:600;color:var(--rose-dark)">You both love ${bothLoved.length} idea${bothLoved.length>1?'s':''}!</div>
              <div style="font-size:11px;color:var(--ink-muted);margin-top:2px">${bothLoved.join(' · ')}</div></div>
            </div>`;
          }

          // ── Build swipe card stack ──
          html+=`<div class="swipe-section">`;
          html+=`<div class="swipe-stack" id="swipe-stack">`;

          ideas.forEach((idea,idx)=>{
            const isTop=idea.score===topScore&&idx===ideas.findIndex(i=>i.score===topScore);
            const vegOk=!_VEG_UNFRIENDLY.has(idea.name);
            const safeKey=idea.name.replace(/['"<>&]/g,'_');
            const v=_votes[idea.name]||{j:null,s:null};
            const bothLove=v.j===true&&v.s===true;

            // Badge
            const isPopular=idea._pop>=POP_THRESHOLD&&idea.score>=65;
            const badge=bothLove?'♥ You both love this':isPopular?'✦ Popular pick':isTop?'✦ Best match':'';

            // Love language badge
            const sLLMatch=llMatchScore(idea,sLL)>0;
            const jLLMatch=llMatchScore(idea,jLL)>0;
            let llBadge='';
            if(sLLMatch&&jLLMatch) llBadge=`<span class="badge badge-plum">${jLLIcon}${sLLIcon} Both love languages</span>`;
            else if(sLLMatch) llBadge=`<span class="badge badge-plum">${sLLIcon} For Sophie</span>`;
            else if(jLLMatch) llBadge=`<span class="badge badge-rose">${jLLIcon} For Jamie</span>`;

            const cardClass=idx===0?'card-active':idx===1?'card-behind-1':idx===2?'card-behind-2':'card-behind-2';

            html+=`<div class="swipe-card ${cardClass}" data-swipe-idx="${idx}" data-idea="${safeKey}">
              <div class="swipe-card-img-wrap">
                <img class="swipe-card-img" src="${idea.img}" alt="${idea.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div style="display:none;position:absolute;inset:0;align-items:center;justify-content:center;font-size:60px;background:var(--bg2)">${idea.emoji}</div>
                ${badge?`<div class="swipe-card-top-badge" ${isPopular&&!bothLove?'style="background:rgba(234,88,12,0.92)"':''}>${badge}</div>`:''}
              </div>
              <div class="swipe-card-body">
                <div class="swipe-card-name-row">
                  <div class="swipe-card-name">${idea.name}</div>
                  <div class="swipe-card-budget">${idea.price}</div>
                </div>
                <div class="swipe-card-loc"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;opacity:0.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${idea.loc}</div>
                <div class="swipe-card-tags">
                  ${idea.vibes.map(v=>`<span class="badge badge-rose">${v}</span>`).join('')}
                  ${vegOk?'<span class="badge" style="background:#F0FDF4;color:#166534;border:0.5px solid #86EFAC">✓ Veg-friendly</span>':'<span class="badge badge-amber">⚠ Limited veg</span>'}
                  ${llBadge}
                </div>
                <div class="swipe-card-why">✦ ${idea.why}</div>
                <div class="swipe-card-match">
                  <div class="swipe-card-match-bar-bg"><div class="swipe-card-match-bar" style="width:${idea.score}%"></div></div>
                  ${idea.score}% match
                </div>
                ${isPopular?`<div style="margin-top:7px;display:flex;align-items:center;gap:5px;font-size:11px;color:#F97316;font-weight:600"><span>✦</span>${idea._pop} couples booked this month</div>`:''}
              </div>
              <div class="swipe-actions">
                <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
                  <div class="swipe-btn swipe-btn-x" title="Not for this occasion" onclick="swipeCard(${idx},'skip')">✕</div>
                  <span style="font-size:9px;font-weight:500;letter-spacing:0.5px;color:rgba(255,255,255,0.3);text-transform:uppercase">Not today</span>
                </div>
                <div class="swipe-btn swipe-btn-book" title="Book now" style="width:auto;min-width:130px;padding:0 22px;border-radius:32px;flex-direction:column;gap:2px;height:58px" onclick="swipeCard(${idx},'book','${idea.name.replace(/'/g,"\\'")}','${idea.price}','','${idea.type}')">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                  <span style="font-size:9.5px;font-weight:700;letter-spacing:0.8px;text-transform:uppercase;opacity:0.92">Book now</span>
                </div>
                <div style="display:flex;flex-direction:column;align-items:center;gap:5px">
                  <div class="swipe-btn swipe-btn-heart" title="Save to wishlist" onclick="swipeCard(${idx},'save','${idea.name.replace(/'/g,"\\'")}','${idea.emoji}','${idea.price}','${idea.type}','${idea.why.replace(/'/g,"\\'")}')">♥</div>
                  <span style="font-size:9px;font-weight:500;letter-spacing:0.5px;color:rgba(255,255,255,0.3);text-transform:uppercase">Save</span>
                </div>
                <div style="display:flex;flex-direction:column;align-items:center;gap:5px;position:absolute;right:14px;bottom:14px">
                  <div class="swipe-btn" title="Share this idea" style="width:34px;height:34px;border-color:rgba(255,255,255,0.1);color:rgba(255,255,255,0.35);font-size:14px" onclick="event.stopPropagation();shareIdea('${idea.name.replace(/'/g,"\\'")}','${idea.loc.replace(/'/g,"\\'")}','${idea.price}')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg></div>
                </div>
              </div>
            </div>`;
          });

          // Done state (shown when all cards dismissed)
          html+=`<div class="swipe-card swipe-done" id="swipe-done-state" style="display:none;position:absolute;inset:0;z-index:5;border:0.5px solid var(--bdr)">
            <div class="swipe-done-icon">✦</div>
            <div class="swipe-done-title">That's all for now</div>
            <div class="swipe-done-sub">Saved ideas are in your wishlist. Want to see different options?</div>
            <button class="btn btn-rose" style="margin-top:8px" onclick="generateSuggestions()">Refresh ideas ↺</button>
          </div>`;

          html+=`</div>`; // end swipe-stack

          // Progress dots
          html+=`<div class="swipe-dots" id="swipe-dots">${ideas.map((_,i)=>`<div class="swipe-dot${i===0?' active':''}" data-dot="${i}"></div>`).join('')}</div>`;
          html+=`<div class="swipe-counter" id="swipe-counter">1 of ${ideas.length}</div>`;
          html+=`</div>`; // end swipe-section

          _currentSuggestions=ideas;
          area.innerHTML=html;

          // Initialise swipe state
          window._swipeIdx=0;
          window._swipeTotal=ideas.length;

          // Auto-dismiss love language banner after 4s (same as personalisation panels)
          const llBanner=document.getElementById('ll-personalisation-banner');
          if(llBanner){setTimeout(()=>{llBanner.style.opacity='0';setTimeout(()=>{if(llBanner.parentNode)llBanner.style.display='none';},650);},4000);}
        },_instant?0:900);
      }

      function swipeCard(idx,action,name,priceOrEmoji,price,type,why){
        if(action==='book') quickBook(name,type||'experience',priceOrEmoji);
        if(action==='save') saveToWishlist(name,priceOrEmoji,price,type,why);

        // Animate active card out
        const stack=document.getElementById('swipe-stack');
        if(!stack) return;
        const activeCard=stack.querySelector('.card-active');
        if(!activeCard) return;

        const exitClass=action==='skip'?'card-exit-left':'card-exit-right';
        activeCard.classList.remove('card-active');
        activeCard.classList.add(exitClass);

        // Promote behind cards (only real cards, not the done-state)
        const behind1=stack.querySelector('.swipe-card.card-behind-1');
        const behind2=stack.querySelector('.swipe-card.card-behind-2:not(#swipe-done-state)');
        if(behind1){behind1.classList.remove('card-behind-1');behind1.classList.add('card-active');}
        if(behind2){behind2.classList.remove('card-behind-2');behind2.classList.add('card-behind-1');}

        window._swipeIdx=(window._swipeIdx||0)+1;
        const remaining=window._swipeTotal-window._swipeIdx;

        // Update dots
        const dots=document.querySelectorAll('#swipe-dots .swipe-dot');
        dots.forEach((d,i)=>{d.classList.toggle('active',i===window._swipeIdx);});

        // Update counter
        const counter=document.getElementById('swipe-counter');
        if(counter){
          if(remaining>0) counter.textContent=`${window._swipeIdx+1} of ${window._swipeTotal}`;
          else counter.textContent='';
        }

        // Show done state when all cards dismissed
        if(remaining<=0){
          setTimeout(()=>{
            const done=document.getElementById('swipe-done-state');
            if(done){done.style.display='flex';done.style.position='absolute';done.style.inset='0';}
          },380);
        }
      }

      // ── Feature 1: Partner vote handler ──
      function castIdeaVote(ideaName,person,val,safeKey){
        if(!_votes[ideaName]) _votes[ideaName]={j:null,s:null};
        // Toggle off if tapping same button again
        _votes[ideaName][person]=_votes[ideaName][person]===val?null:val;
        // Update DOM directly — no full re-render needed
        const box=document.querySelector(`.vote-box[data-idea="${safeKey}"]`);
        if(!box) return;
        const v=_votes[ideaName];
        const btns=box.querySelectorAll('.vote-btn');
        if(btns[0]) btns[0].classList.toggle('active',v.j===true);
        if(btns[1]) btns[1].classList.toggle('active',v.j===false);
        const bothLove=v.j===true&&v.s===true;
        const center=box.querySelector('.vote-center');
        if(center){center.textContent=bothLove?'♥':'◦';center.style.color=bothLove?'var(--rose)':'var(--rose-mid)';}
        const banner=box.querySelector('.both-love-row');
        if(banner){banner.style.display=bothLove?'':'none';if(bothLove)banner.textContent='♥ You both love this — perfect!';}
        const card=box.closest('.idea-card');
        if(card){
          card.classList.toggle('both-love-card',bothLove);
          // Update top label
          let lbl=card.querySelector('.idea-top-label');
          if(bothLove){
            if(!lbl){lbl=document.createElement('div');lbl.className='idea-top-label';card.insertBefore(lbl,card.firstChild);}
            lbl.style.background='var(--rose)';lbl.textContent='♥ You both love this';
          } else if(lbl&&lbl.textContent==='♥ You both love this'){lbl.remove();}
          // Update book button label
          const bookBtn=card.querySelector('.btn-rose.btn-sm');
          if(bookBtn) bookBtn.textContent=bothLove?'♥ Book it together':'Book this ✦';
        }
        // Update the both-loved summary banner if it already exists
        const summaryArea=document.getElementById('suggestions-area');
        const summaryBanner=summaryArea?.querySelector('[data-both-banner]');
        const bothLovedAll=Object.entries(_votes).filter(([,val])=>val.j===true&&val.s===true).map(([k])=>k);
        if(summaryBanner){
          if(bothLovedAll.length){summaryBanner.querySelector('.bl-count').textContent=`You both love ${bothLovedAll.length} idea${bothLovedAll.length>1?'s':''}!`;summaryBanner.querySelector('.bl-names').textContent=bothLovedAll.join(' · ');summaryBanner.style.display='';}
          else{summaryBanner.style.display='none';}
        }
        if(bothLove) toast(`♥ You both love ${ideaName}! Tap "Book it together" to lock it in.`);
      }

      /* ── SVG outline icons for prestige booking flow ── */
      const _SVG={
        restaurant:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
        hotel:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2Z"/><path d="M9 14h6"/><path d="M9 18h6"/><path d="M9 10h.01"/></svg>',
        airbnb:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/></svg>',
        cab:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg>',
        concert:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
        theatre:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10s3-3 9-3 9 3 9 3"/><path d="M2 10s3 3 9 3 9-3 9-3"/><path d="M2 10v4c0 4.4 4 8 9 8s9-3.6 9-8v-4"/><circle cx="8" cy="13" r="1"/><circle cx="16" cy="13" r="1"/><path d="M10 17c.7.5 1.3.8 2 .8s1.3-.3 2-.8"/></svg>',
        wellness:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22c5.5-3 9-7.5 9-12a9 9 0 1 0-18 0c0 4.5 3.5 9 9 12Z"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>',
        rooftop:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>',
        latenight:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
        dining:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/></svg>',
        activity:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
        experience:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
        cinema:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="2.2"/><path d="M7 2v20"/><path d="M17 2v20"/><path d="M2 12h20"/><path d="M2 7h5"/><path d="M2 17h5"/><path d="M17 7h5"/><path d="M17 17h5"/></svg>',
        garden:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22V8"/><path d="M5 12s2.5-5 7-5 7 5 7 5"/><path d="M7 5c0 2.8 2.2 5 5 5s5-2.2 5-5c0-2.8-2.2-5-5-5S7 2.2 7 5Z"/></svg>',
        gallery:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>',
        wine:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8"/><path d="M12 11v11"/><path d="M20 3H4l.8 5.2A6.2 6.2 0 0 0 11 14h2a6.2 6.2 0 0 0 6.2-5.8L20 3Z"/></svg>',
        boat:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.5 0 2.5 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M19.4 15H4.6L2 20h20l-2.6-5Z"/><path d="M12 3v8.5"/><path d="m8 7 4-4 4 4"/></svg>',
        pottery:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8"/><path d="M7 10h10"/><path d="M16 10c0 6-4 12-4 12s-4-6-4-12"/><path d="M7 10c0-4.4 2.2-8 5-8s5 3.6 5 8"/></svg>',
        cooking:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11v3a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-3"/><path d="M12 19H4a2 2 0 0 1-2-2v-2h20v2a2 2 0 0 1-2 2h-2.5"/><path d="M8 11V7c0-1.1.9-2 2-2h4c1.1 0 2 .9 2 2v4"/></svg>',
        picnic:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8c.7-1 1-2.2 1-3.5A5.5 5.5 0 0 0 12.5 0 5.5 5.5 0 0 0 7 4.5c0 1.3.3 2.5 1 3.5"/><path d="M4 14h16"/><path d="M6 14l-2 8h16l-2-8"/><path d="M12 14V8"/></svg>',
        ticket:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>',
        bell:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
        moon:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>',
        pin:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
        clipboard:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/></svg>',
        card:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>',
        breakfast:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17 11h1a3 3 0 0 1 0 6h-1"/><path d="M3 11h14v6a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><path d="M6 6c.7-1 1-2 1-3"/><path d="M10 6c.7-1 1-2 1-3"/><path d="M14 6c.7-1 1-2 1-3"/></svg>',
        concierge:'<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a4 4 0 0 0-4 4v2h8V6a4 4 0 0 0-4-4Z"/><path d="M20 8H4"/><path d="M3 12h18v2a8 8 0 0 1-8 8h-2a8 8 0 0 1-8-8v-2Z"/></svg>',
      };
      /* Helper: get an SVG icon string at a given size (default 20). Falls back to ✦ */
      function _svgIcon(key,size){
        const s=size||20;
        const svg=_SVG[key];
        if(!svg)return'✦';
        return svg.replace(/width="\d+"/,'width="'+s+'"').replace(/height="\d+"/,'height="'+s+'"');
      }
      /* Icon sized for the large loading spinner (52px context) */
      function _svgIconLg(key){return _svgIcon(key,36);}

      const _BOOKING_ICONS={restaurant:_SVG.restaurant,hotel:_SVG.hotel,airbnb:_SVG.airbnb,cab:_SVG.cab,concert:_SVG.concert,theatre:_SVG.theatre,wellness:_SVG.wellness,rooftop:_SVG.rooftop,latenight:_SVG.latenight,dining:_SVG.dining,activity:_SVG.activity,experience:_SVG.experience};
      function quickBook(name,type,amount){
        const today=new Date();
        const date=new Date(today.getFullYear(),today.getMonth()+1,15).toISOString().slice(0,10);
        bookings.push({id:Date.now(),type,name,date,meta:'Just booked',amount,icon:_BOOKING_ICONS[type]||_SVG.experience});
        updateStats();renderBookings();toast('✦ Added to your dates — '+name);
      }

      // ── Restaurant availability check flow ──
      // Fallback data — used when Google Places API key is missing or fails
      const _REST_DB=[
        {name:'Dishoom',area:'Covent Garden',cuisine:'Indian',img:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=320&fit=crop&q=80',price:'avg. £33pp',rating:'4.8',reviews:'2,340',veg:true,vibes:['Intimate','Buzzy']},
        {name:'Sketch',area:'Mayfair',cuisine:'Modern European',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',rating:'4.7',reviews:'1,890',veg:true,vibes:['Unique','Elegant']},
        {name:'Ottolenghi',area:'Islington',cuisine:'Mediterranean',img:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',rating:'4.6',reviews:'1,420',veg:true,vibes:['Casual','Fresh']},
        {name:'Padella',area:'Borough',cuisine:'Italian',img:'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',rating:'4.7',reviews:'3,100',veg:true,vibes:['Romantic','Intimate']},
        {name:'Kiln',area:'Soho',cuisine:'Thai',img:'https://images.unsplash.com/photo-1555126634-323283e090fa?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',rating:'4.8',reviews:'1,670',veg:false,vibes:['Vibrant','Counter dining']},
        {name:'Brat',area:'Shoreditch',cuisine:'Modern British',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £80pp',rating:'4.9',reviews:'980',veg:false,vibes:['Intimate','Fire-cooked']},
        {name:'Gymkhana',area:'Mayfair',cuisine:'Indian',img:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=320&fit=crop&q=80',price:'avg. £75pp',rating:'4.8',reviews:'1,240',veg:true,vibes:['Refined','Cultural']},
        {name:'The Ivy',area:'Covent Garden',cuisine:'British',img:'https://images.unsplash.com/photo-1550966871-3ed3cbe818bb?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',rating:'4.5',reviews:'4,200',veg:true,vibes:['Classic','Elegant']},
        {name:'Hakkasan',area:'Mayfair',cuisine:'Chinese',img:'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',rating:'4.7',reviews:'2,100',veg:true,vibes:['Moody','Romantic']},
        {name:'Bob Bob Ricard',area:'Soho',cuisine:'Anglo-Russian',img:'https://images.unsplash.com/photo-1550966871-3ed3cbe818bb?w=600&h=320&fit=crop&q=80',price:'avg. £85pp',rating:'4.6',reviews:'1,560',veg:true,vibes:['Glamorous','Fun']},
      ];

      // Google Places price level → readable label
      const _GOOG_PRICE=['Free','Under £15pp','avg. £25pp','avg. £50pp','avg. £80pp'];

      // Convert a Google Places result into the format our cards expect
      function _googleToCard(place){
        const photos=place.photos||[];
        const imgUrl=photos.length?photos[0].getUrl({maxWidth:400,maxHeight:300}):'';
        const types=(place.types||[]);
        const cuisine=types.includes('indian_restaurant')?'Indian'
          :types.includes('italian_restaurant')?'Italian'
          :types.includes('chinese_restaurant')?'Chinese'
          :types.includes('japanese_restaurant')?'Japanese'
          :types.includes('thai_restaurant')?'Thai'
          :types.includes('french_restaurant')?'French'
          :types.includes('mexican_restaurant')?'Mexican'
          :'Restaurant';
        const area=(place.vicinity||place.formatted_address||'').split(',').slice(-2,-1)[0]?.trim()||'London';
        return{
          name:place.name,
          area:area,
          cuisine:cuisine,
          img:imgUrl,
          price:_GOOG_PRICE[place.price_level]||'avg. £30pp',
          rating:place.rating?place.rating.toFixed(1):'—',
          reviews:place.user_ratings_total?place.user_ratings_total.toLocaleString():'—',
          veg:false,
          vibes:[],
          _source:'google'
        };
      }

      // Try Google Places API, fall back to hardcoded DB
      function _searchPlaces(query,loc,callback){
        // Check if Google Maps API is loaded and has a real key
        if(typeof google==='undefined'||!google.maps||!google.maps.places){
          callback(null);return;
        }
        try{
          const mapEl=document.getElementById('gmap');
          const service=new google.maps.places.PlacesService(mapEl);
          service.textSearch({
            query:query+' restaurant '+loc,
            type:'restaurant'
          },(results,status)=>{
            if(status===google.maps.places.PlacesServiceStatus.OK&&results&&results.length){
              callback(results.slice(0,5).map(_googleToCard));
            } else {
              callback(null);
            }
          });
        }catch(e){
          callback(null);
        }
      }

      function checkRestAvailability(){
        const q=(document.getElementById('rest-q').value||'').trim();
        const loc=(document.getElementById('rest-loc').value||'London').trim();
        const date=document.getElementById('rest-date').value||new Date().toISOString().slice(0,10);
        const time=document.getElementById('rest-time').value;
        const covers=document.getElementById('rest-covers').value;
        if(!q){toast('Please enter a restaurant name or cuisine');return;}
        const area=document.getElementById('rest-results');
        const qLow=q.toLowerCase();

        // Show loading
        area.innerHTML=`<div class="card" style="margin-top:1rem"><div class="loading-overlay"><div class="spinner"></div><div class="loading-text">Searching restaurants for "${q}"…</div></div></div>`;

        // Try Google Places first, fall back to hardcoded DB
        _searchPlaces(q,loc,(googleResults)=>{
          let matches;
          let isGoogle=false;

          if(googleResults&&googleResults.length){
            matches=googleResults.slice(0,3);
            isGoogle=true;
          } else {
            // Fallback to hardcoded data
            matches=_REST_DB.filter(r=>
              r.name.toLowerCase().includes(qLow)||
              r.cuisine.toLowerCase().includes(qLow)||
              r.area.toLowerCase().includes(qLow)
            );
            if(!matches.length){
              // Generate a synthetic card using the exact name the user typed
              // so the demo booking flow works with any restaurant name
              const _synthImgs=[
                'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',
                'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=320&fit=crop&q=80',
                'https://images.unsplash.com/photo-1550966871-3ed3cbe818bb?w=600&h=320&fit=crop&q=80',
                'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=320&fit=crop&q=80',
                'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=600&h=320&fit=crop&q=80',
              ];
              const _synthHash=q.split('').reduce((a,c)=>a+c.charCodeAt(0),0);
              const _synthPrice='avg. £'+(25+(_synthHash%50))+'pp';
              const _synthRating=(4.2+(_synthHash%8)*0.1).toFixed(1);
              const _synthReviews=(400+(_synthHash%2600)).toLocaleString();
              const _synthArea=loc.split(',')[0].trim()||'London';
              matches=[{
                name:q,area:_synthArea,cuisine:'Restaurant',
                img:_synthImgs[_synthHash%_synthImgs.length],
                price:_synthPrice,rating:_synthRating,reviews:_synthReviews,
                veg:true,vibes:['Intimate','Dining']
              }];
            }
            matches=matches.slice(0,3);
          }

          const dateObj=new Date(date+'T12:00:00');
          const dateStr=dateObj.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'});
          const ref='T4T-'+Math.random().toString(36).slice(2,6).toUpperCase();
          const sourceLabel=isGoogle
            ?'<div style="display:flex;align-items:center;gap:6px;margin-bottom:12px"><span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--subtle)">Live results for "'+q+'"</span><span class="badge badge-green" style="font-size:9px">Google Places</span></div>'
            :'<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--subtle);margin-bottom:12px">'+(matches.some(r=>r.name.toLowerCase().includes(qLow))?'Results for "'+q+'"':'We couldn\'t find "'+q+'" — here are some suggestions')+'</div>';

          area.innerHTML=`
            <div style="margin-top:1rem">
              ${sourceLabel}
              ${matches.map((r,i)=>{
                const avail=Math.random()>0.2;
                const altTime=avail?time:(parseInt(time)>=20?'19:30':'20:30');
                const hasImg=r.img&&r.img.length>0;
                const imgHtml=hasImg
                  ?`<img src="${r.img}" alt="${r.name}" style="width:100%;height:100%;object-fit:cover;display:block;min-height:180px" onerror="this.parentElement.innerHTML='<div style=\\'height:180px;display:flex;align-items:center;justify-content:center;background:var(--bg2);color:var(--primary)\\'>${_svgIcon('restaurant',32).replace(/'/g,"\\'")}</div>'">`
                  :'<div style="height:180px;display:flex;align-items:center;justify-content:center;background:var(--bg2);color:var(--primary)">'+_svgIcon('restaurant',32)+'</div>';

                return `<div class="card" style="margin-bottom:12px;overflow:hidden">
                  <div style="display:flex;gap:0">
                    <div style="width:110px;flex-shrink:0;overflow:hidden;position:relative">
                      ${imgHtml}
                    </div>
                    <div style="flex:1;padding:14px 16px">
                      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
                        <div style="font-size:15px;font-weight:700;color:var(--ink)">${r.name}</div>
                        <div style="display:flex;align-items:center;gap:3px;font-size:11px;color:#FCD34D;font-weight:600">★ ${r.rating}</div>
                      </div>
                      <div style="font-size:11px;color:var(--ink-muted);margin-bottom:6px">${r.area} · ${r.cuisine}${r.reviews&&r.reviews!=='—'?' · '+r.reviews+' reviews':''}</div>
                      <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
                        ${(r.vibes||[]).map(v=>'<span class="badge badge-rose" style="font-size:10px">'+v+'</span>').join('')}
                        ${r.veg?'<span class="badge" style="background:rgba(74,222,128,0.1);color:#4ADE80;border:0.5px solid rgba(74,222,128,0.25);font-size:10px">✓ Veg-friendly</span>':''}
                        ${r._source==='google'?'<span class="badge badge-muted" style="font-size:9px">Live data</span>':''}
                      </div>
                      <div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px">${r.price}</div>
                      <div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--bdr)">
                        ${avail?`
                          <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
                            <div style="width:8px;height:8px;border-radius:50%;background:#4ADE80"></div>
                            <span style="font-size:12px;font-weight:600;color:#4ADE80">Available</span>
                            <span style="font-size:11px;color:var(--ink-muted)">${dateStr} · ${time} · ${covers} covers</span>
                          </div>
                          <button class="btn btn-rose btn-sm" style="width:100%;justify-content:center;padding:10px;font-size:13px;border-radius:10px" onclick="confirmRestBooking('${r.name.replace(/'/g,"\\'")}','${r.area.replace(/'/g,"\\'")}','${date}','${time}','${covers}','${r.price.replace(/'/g,"\\'")}','${ref}')">Reserve this table ✦</button>
                        `:`
                          <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                            <div style="width:8px;height:8px;border-radius:50%;background:#F59E0B"></div>
                            <span style="font-size:12px;font-weight:600;color:#F59E0B">Busy at ${time}</span>
                            <span style="font-size:11px;color:var(--ink-muted)">${dateStr}</span>
                          </div>
                          <div style="font-size:11px;color:var(--ink-muted);margin-bottom:8px">Nearest available: <strong style="color:var(--ink)">${altTime}</strong></div>
                          <button class="btn btn-rose btn-sm" style="width:100%;justify-content:center;padding:10px;font-size:13px;border-radius:10px" onclick="confirmRestBooking('${r.name.replace(/'/g,"\\'")}','${r.area.replace(/'/g,"\\'")}','${date}','${altTime}','${covers}','${r.price.replace(/'/g,"\\'")}','${ref}')">Reserve at ${altTime} ✦</button>
                        `}
                      </div>
                    </div>
                  </div>
                </div>`;
              }).join('')}
              <button class="btn" style="width:100%;justify-content:center;padding:10px;font-size:12px;margin-top:4px" onclick="document.getElementById('rest-results').innerHTML='';document.getElementById('rest-q').focus()">← Search again</button>
            </div>`;
        });
      }

      function confirmRestBooking(name,area,date,time,covers,price,ref){
        const results=document.getElementById('rest-results');
        // Show confirming state
        results.innerHTML=`<div class="card" style="margin-top:1rem"><div class="loading-overlay"><div class="spinner"></div><div class="loading-text">Securing your table at ${name}…</div></div></div>`;
        setTimeout(()=>{
          const dateObj=new Date(date+'T12:00:00');
          const dateStr=dateObj.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
          bookings.push({id:Date.now(),type:'restaurant',name:name+', '+area,date,meta:time+' · '+covers+' covers',amount:price,icon:_SVG.restaurant});
          updateStats();renderBookings();_saveState();
          results.innerHTML=`
            <div class="card" style="margin-top:1rem">
              <div class="card-body" style="text-align:center;padding:24px 20px">
                <div class="bf-confirm-success-ring">✓</div>
                <div style="font-size:19px;font-weight:700;color:var(--ink);margin-bottom:4px">Table reserved!</div>
                <div style="font-size:13px;color:var(--ink-muted);margin-bottom:16px">Confirmation sent to your email</div>
                <div class="bf-ref-badge" style="margin-bottom:16px">${ref}</div>
                <div style="background:var(--bg2);border:0.5px solid var(--bdr);border-radius:14px;padding:14px;text-align:left;margin-bottom:16px">
                  <div style="font-size:14px;font-weight:700;color:var(--ink);margin-bottom:8px;display:flex;align-items:center;gap:6px"><span style="color:var(--primary)">${_svgIcon('restaurant',16)}</span> ${name}</div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--ink-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Date</div><div style="font-size:12px;font-weight:600;color:var(--ink)">${dateStr}</div></div>
                    <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--ink-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Time</div><div style="font-size:12px;font-weight:600;color:var(--ink)">${time}</div></div>
                    <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--ink-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Covers</div><div style="font-size:12px;font-weight:600;color:var(--ink)">${covers} guests</div></div>
                    <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--ink-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:2px">Est. total</div><div style="font-size:12px;font-weight:600;color:var(--rose-dark)">${price}</div></div>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:10px">
                    <span class="bf-otable-badge" style="background:rgba(201,168,76,0.12);color:#D4B86A;border:0.5px solid rgba(201,168,76,0.3);display:inline-flex;align-items:center;gap:4px">${_svgIcon('card',12)} Deposit taken</span>
                  <span class="bf-otable-badge" style="background:rgba(74,222,128,0.1);color:#4ADE80;border:0.5px solid rgba(74,222,128,0.3);display:inline-flex;align-items:center;gap:4px">${_svgIcon('restaurant',12)} Pay rest at venue</span>
                    <span class="bf-otable-badge" style="background:rgba(250,200,60,0.1);color:#FBC94A;border:0.5px solid rgba(250,200,60,0.3)">✓ Free cancellation</span>
                  </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
                  <button class="btn btn-rose btn-sm" onclick="go('cabs',document.querySelector('[onclick*=cabs]'))">Book transport →</button>
                  <button class="btn btn-sm" onclick="go('planner',document.querySelector('[onclick*=planner]'))">✦ Add to planner</button>
                  <button class="btn btn-sm" onclick="document.getElementById('rest-results').innerHTML='';document.getElementById('rest-q').value=''">Search again</button>
                </div>
              </div>
            </div>`;
          toast('✦ Table reserved at '+name);
        },1800);
      }

      function bookRest(){checkRestAvailability();}
      function bookHotel(){
        const d=document.getElementById('hotel-dest').value||'Hotel';
        const ci=document.getElementById('hotel-in').value||new Date().toISOString().slice(0,10);
        bookings.push({id:Date.now(),type:'hotel',name:d,date:ci,meta:'1 night',amount:'£180',icon:_SVG.hotel});
        updateStats();toast('✦ Room reserved at '+d);
      }
      function switchStayTab(tab){
        document.getElementById('stay-hotel').style.display=tab==='hotel'?'':'none';
        document.getElementById('stay-airbnb').style.display=tab==='airbnb'?'':'none';
        document.getElementById('tab-hotel').style.color=tab==='hotel'?'#E11D48':'#9CA3AF';
        document.getElementById('tab-hotel').style.borderBottomColor=tab==='hotel'?'#E11D48':'transparent';
        document.getElementById('tab-airbnb').style.color=tab==='airbnb'?'#E11D48':'#9CA3AF';
        document.getElementById('tab-airbnb').style.borderBottomColor=tab==='airbnb'?'#E11D48':'transparent';
      }
      function bookAirbnb(){
        const dest=document.getElementById('bnb-dest').value||'London';
        const ci=document.getElementById('bnb-in').value||new Date().toISOString().slice(0,10);
        const co=document.getElementById('bnb-out').value||new Date(Date.now()+86400000).toISOString().slice(0,10);
        const type=document.getElementById('bnb-type').value;
        const note=document.getElementById('bnb-note').value;
        // Build Airbnb search URL
        const q=encodeURIComponent(dest);
        const url=`https://www.airbnb.co.uk/s/${q}/homes?checkin=${ci}&checkout=${co}&adults=2`;
        window.open(url,'_blank');
        bookings.push({id:Date.now(),type:'airbnb',name:dest+(note?' — '+note:''),date:ci,meta:type,amount:'',icon:_SVG.airbnb});
        updateStats();renderBookings();toast('✦ Airbnb search opened for '+dest);
      }
      function bookCab(){
        const f=document.getElementById('cab-from').value||'Home';
        const t=document.getElementById('cab-to').value||'Venue';
        const d=document.getElementById('cab-date').value||new Date().toISOString().slice(0,10);
        bookings.push({id:Date.now(),type:'cab',name:f+' → '+t,date:d,meta:'2 passengers',amount:'£45',icon:_SVG.cab});
        updateStats();toast('✦ Cab booked');
      }

      // ── Transport planner ──
      const _AREAS={
        'shoreditch':{z:1,lat:51.523,lng:-0.077},'covent garden':{z:1,lat:51.512,lng:-0.122},
        'soho':{z:1,lat:51.513,lng:-0.134},'mayfair':{z:1,lat:51.511,lng:-0.147},
        'chelsea':{z:1,lat:51.487,lng:-0.171},'notting hill':{z:2,lat:51.510,lng:-0.201},
        'brixton':{z:2,lat:51.462,lng:-0.114},'hackney':{z:2,lat:51.546,lng:-0.056},
        'islington':{z:1,lat:51.536,lng:-0.103},'south bank':{z:1,lat:51.506,lng:-0.110},
        'borough':{z:1,lat:51.501,lng:-0.093},'bermondsey':{z:2,lat:51.498,lng:-0.064},
        'canary wharf':{z:2,lat:51.505,lng:-0.023},'greenwich':{z:2,lat:51.483,lng:-0.010},
        'richmond':{z:4,lat:51.461,lng:-0.301},'hampstead':{z:2,lat:51.555,lng:-0.178},
        'kensington':{z:1,lat:51.500,lng:-0.191},'westminster':{z:1,lat:51.499,lng:-0.124},
        'battersea':{z:1,lat:51.479,lng:-0.149},'waterloo':{z:1,lat:51.503,lng:-0.113},
        'london bridge':{z:1,lat:51.505,lng:-0.087},'paddington':{z:1,lat:51.515,lng:-0.177},
        'victoria':{z:1,lat:51.496,lng:-0.143},'kings cross':{z:1,lat:51.531,lng:-0.123},
        'stratford':{z:3,lat:51.541,lng:0.002},'wimbledon':{z:3,lat:51.421,lng:-0.206},
        'ealing':{z:3,lat:51.513,lng:-0.307},'croydon':{z:5,lat:51.374,lng:-0.100},
        'dalston':{z:2,lat:51.546,lng:-0.075},'peckham':{z:2,lat:51.474,lng:-0.070},
        'walthamstow':{z:3,lat:51.582,lng:-0.020},'highgate':{z:3,lat:51.571,lng:-0.148},
        'elephant and castle':{z:1,lat:51.494,lng:-0.100},'bethnal green':{z:2,lat:51.528,lng:-0.059},
        'camden':{z:2,lat:51.539,lng:-0.143},'angel':{z:1,lat:51.532,lng:-0.106},
        'clerkenwell':{z:1,lat:51.523,lng:-0.107},'barbican':{z:1,lat:51.520,lng:-0.096},
        'bank':{z:1,lat:51.513,lng:-0.089},'liverpool street':{z:1,lat:51.518,lng:-0.082},
        'tower bridge':{z:1,lat:51.506,lng:-0.076},'vauxhall':{z:1,lat:51.485,lng:-0.124},
        'clapham':{z:2,lat:51.462,lng:-0.138},'fulham':{z:2,lat:51.476,lng:-0.194},
        'hammersmith':{z:2,lat:51.492,lng:-0.224},'putney':{z:3,lat:51.461,lng:-0.216},
        'tooting':{z:3,lat:51.427,lng:-0.168},'balham':{z:3,lat:51.443,lng:-0.152},
        'dulwich':{z:2,lat:51.451,lng:-0.082},'forest hill':{z:3,lat:51.443,lng:-0.056},
        'lewisham':{z:2,lat:51.462,lng:-0.012},'new cross':{z:2,lat:51.476,lng:-0.040},
        'crystal palace':{z:3,lat:51.418,lng:-0.074},'finsbury park':{z:2,lat:51.564,lng:-0.106},
        'archway':{z:2,lat:51.565,lng:-0.135},'muswell hill':{z:3,lat:51.590,lng:-0.143},
        'wood green':{z:3,lat:51.597,lng:-0.109},'tottenham':{z:3,lat:51.593,lng:-0.068},
        'bow':{z:2,lat:51.527,lng:-0.025},'mile end':{z:2,lat:51.525,lng:-0.034},
        'poplar':{z:2,lat:51.510,lng:-0.017},'whitechapel':{z:2,lat:51.519,lng:-0.059},
        'stoke newington':{z:2,lat:51.562,lng:-0.075},'homerton':{z:2,lat:51.546,lng:-0.042},
        'woolwich':{z:4,lat:51.491,lng:0.069},'plumstead':{z:4,lat:51.487,lng:0.095},
        'abbey wood':{z:4,lat:51.491,lng:0.120},'charlton':{z:3,lat:51.482,lng:0.031},
        'eltham':{z:4,lat:51.451,lng:0.052},'bexleyheath':{z:5,lat:51.461,lng:0.138},
        'sidcup':{z:5,lat:51.426,lng:0.103},'erith':{z:5,lat:51.482,lng:0.178},
        'thamesmead':{z:4,lat:51.503,lng:0.122},'kidbrooke':{z:3,lat:51.464,lng:0.026},
        'blackheath':{z:3,lat:51.465,lng:0.009},'catford':{z:3,lat:51.444,lng:-0.020},
        'hither green':{z:3,lat:51.452,lng:-0.001},'grove park':{z:4,lat:51.432,lng:-0.008},
        'bromley':{z:5,lat:51.406,lng:0.015},'beckenham':{z:4,lat:51.409,lng:-0.022},
        'orpington':{z:6,lat:51.375,lng:0.100},'dartford':{z:6,lat:51.447,lng:0.216},
        'surbiton':{z:5,lat:51.394,lng:-0.305},'kingston':{z:6,lat:51.412,lng:-0.300},
        'twickenham':{z:5,lat:51.450,lng:-0.334},'weybridge':{z:6,lat:51.371,lng:-0.356},
        'staines':{z:6,lat:51.433,lng:-0.513},'heathrow':{z:6,lat:51.477,lng:-0.461},
        'hayes':{z:4,lat:51.506,lng:-0.421},'uxbridge':{z:6,lat:51.546,lng:-0.479},
        'harrow':{z:5,lat:51.579,lng:-0.335},'edgware':{z:5,lat:51.613,lng:-0.275},
        'barnet':{z:5,lat:51.650,lng:-0.193},'enfield':{z:5,lat:51.652,lng:-0.080},
        'waltham cross':{z:6,lat:51.686,lng:-0.033},'chingford':{z:4,lat:51.628,lng:-0.011},
        'ilford':{z:4,lat:51.558,lng:0.075},'romford':{z:6,lat:51.575,lng:0.183},
        'dagenham':{z:5,lat:51.549,lng:0.148},'east ham':{z:3,lat:51.540,lng:0.053},
        'upton park':{z:3,lat:51.535,lng:0.035},'plaistow':{z:3,lat:51.531,lng:0.021},
        'canning town':{z:3,lat:51.514,lng:0.009},'custom house':{z:3,lat:51.510,lng:0.029},
        'north greenwich':{z:2,lat:51.500,lng:0.004},'greenwich peninsula':{z:2,lat:51.500,lng:0.004},
      };

      function _matchArea(text){
        const t=text.toLowerCase();let best=null,bestLen=0;
        for(const[name,data] of Object.entries(_AREAS)){
          if(t.includes(name)&&name.length>bestLen){best={...data,name};bestLen=name.length;}
        }
        return best;
      }

      function _geoKm(lat1,lng1,lat2,lng2){
        const R=6371,dL=(lat2-lat1)*Math.PI/180,dN=(lng2-lng1)*Math.PI/180;
        const a=Math.sin(dL/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dN/2)**2;
        return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
      }

      function _tubeFare(z1,z2){
        const t=[[2.80,2.80,3.40,4.10,4.90,5.60],[2.80,2.80,3.40,4.10,4.90,5.60],[3.40,3.40,3.40,4.10,4.90,5.60],[4.10,4.10,4.10,4.10,4.90,5.60],[4.90,4.90,4.90,4.90,4.90,5.60],[5.60,5.60,5.60,5.60,5.60,5.60]];
        return t[Math.min(z1,6)-1][Math.min(z2,6)-1];
      }

      let _transportOpts=[];

      function clearTransportResults(){const r=document.getElementById('transport-results');if(r)r.innerHTML='';}

      function findTransportOptions(){
        const fromVal=document.getElementById('cab-from').value.trim();
        const toVal=document.getElementById('cab-to').value.trim();
        if(!fromVal||!toVal){toast('Please enter both a starting point and destination');return;}
        const area=document.getElementById('transport-results');
        area.innerHTML='<div class="card"><div class="loading-overlay"><div class="spinner"></div><div class="loading-text">Comparing your options...</div></div></div>';
        setTimeout(()=>{
          const fA=_matchArea(fromVal),tA=_matchArea(toVal);
          const unknownFrom=!fA,unknownTo=!tA;
          const anyUnknown=unknownFrom||unknownTo;
          // Only fall back to London center if we have at least one recognised area
          // If NEITHER is known, we cannot calculate anything meaningful
          if(!fA&&!tA){
            area.innerHTML='<div class="card"><div class="card-body"><div style="padding:14px;background:#FEF3F2;border:0.5px solid #FCA5A5;border-radius:var(--r-md)"><div style="font-size:13px;font-weight:600;color:#B91C1C;margin-bottom:4px">Areas not recognised</div><div style="font-size:13px;color:#7F1D1D;line-height:1.5">We couldn\'t find either location in our database. Try being more specific (e.g. "Woolwich Arsenal", "Covent Garden, London") or use a known London neighbourhood.</div></div></div></div>';
            return;
          }
          const fLat=fA?fA.lat:tA.lat,fLng=fA?fA.lng:tA.lng;
          const tLat=tA?tA.lat:fA.lat,tLng=tA?tA.lng:fA.lng;
          const fZ=fA?fA.z:(tA?tA.z:1),tZ=tA?tA.z:(fA?fA.z:1);
          const km=_geoKm(fLat,fLng,tLat,tLng);
          const kmRoad=km*1.35;
          const opts=[];

          // Walking — only suggest if BOTH areas were recognised (otherwise distance is unreliable)
          if(km<2.8&&!anyUnknown){
            opts.push({mode:'Walking',icon:_SVG.activity,time:Math.round(km*13),cost:0,costStr:'Free',
              desc:'A romantic stroll together — no waiting, no cost, and you arrive relaxed',
              badge:km<1.5?'Most romantic':'',type:'walk'});
          }

          // Bus
          const busTime=Math.round(kmRoad*5)+8;
          opts.push({mode:'Bus (TfL)',icon:_SVG.cab,time:busTime,cost:3.50,costStr:'£3.50',
            desc:'£1.75 each · Pay with contactless · No planning needed',
            badge:'',type:'bus'});

          // Tube / Train
          const tubePP=_tubeFare(fZ,tZ);
          const tubeTotal=tubePP*2;
          const tubeTime=Math.round(km*2.8)+12;
          const isOuter=(fZ>2||tZ>2);
          opts.push({mode:isOuter?'Train / Overground':'Tube',icon:_SVG.cab,time:tubeTime,
            cost:tubeTotal,costStr:'£'+tubeTotal.toFixed(2),
            desc:'£'+tubePP.toFixed(2)+' each · Pay with contactless · Zone '+fZ+'→'+tZ+(isOuter?' · Check National Rail for fast trains':''),
            badge:'',type:'tube'});

          // Standard cab
          const cabTime=Math.round(kmRoad*3.5)+7;
          const cabCost=Math.max(12,Math.round(kmRoad*2.2+5));
          opts.push({mode:'Cab — Standard',icon:_SVG.cab,time:cabTime,cost:cabCost,costStr:'£'+cabCost,
            desc:'Door to door · No connections · Pre-book for peace of mind',
            badge:'',type:'cab_standard'});

          // Executive cab (longer journeys)
          if(km>3){
            const execCost=Math.round(cabCost*1.85);
            opts.push({mode:'Cab — Executive',icon:_SVG.cab,time:cabTime,cost:execCost,costStr:'£'+execCost,
              desc:'Premium saloon · Extra legroom · Start the date the moment you get in',
              badge:'',type:'cab_exec'});
          }

          // Assign badges
          const byCost=[...opts].sort((a,b)=>a.cost-b.cost);
          const byTime=[...opts].sort((a,b)=>a.time-b.time);
          const cheapest=byCost[0],fastest=byTime[0];
          opts.forEach(o=>{
            if(o===cheapest&&o===fastest){o.badge='Best overall';}
            else if(o===cheapest){o.badge='Best value';}
            else if(o===fastest&&o.cost>0){o.badge='Fastest';}
          });

          // Recommendation copy
          let rec;
          const walkOpt=opts.find(o=>o.type==='walk');
          const tubeOpt=opts.find(o=>o.type==='tube');
          const cabOpt=opts.find(o=>o.type==='cab_standard');
          if(walkOpt&&km<1.5){
            rec={icon:_SVG.activity,text:'Only '+Math.round(km*10)/10+'km — a short stroll together is honestly the nicest way to arrive. Save the cab for later in the evening.'};
          } else if(km<5&&tubeOpt){
            rec={icon:_SVG.cab,text:'The '+(isOuter?'train':'Tube')+' is the smartest move here — '+tubeTime+' minutes, '+tubeOpt.costStr+' for two, and no parking stress. Perfect way to arrive fresh.'};
          } else if(km<10){
            rec={icon:_SVG.cab,text:'A cab is worth it for this distance — '+cabTime+' minutes door to door for £'+cabCost+'. You could Tube it for '+tubeOpt.costStr+' if budget matters, but the cab keeps the evening smooth.'};
          } else {
            rec={icon:_SVG.cab,text:'For a '+Math.round(km)+'km journey, a pre-booked cab makes the most sense — reliable, direct, and you arrive together. Check train options if there\'s a fast direct service.'};
          }

          _transportOpts=opts;

          let html='<div class="card" style="margin-bottom:1rem"><div class="card-head"><div><div class="card-title">'+fromVal+' → '+toVal+'</div><div class="card-sub">~'+Math.round(km*10)/10+'km · '+(fA?fA.name:'⚠ unrecognised')+' to '+(tA?tA.name:'⚠ unrecognised')+'</div></div></div><div class="card-body">';
          if(anyUnknown){
            const unknown=(unknownFrom?'"'+fromVal+'"':'')+(unknownFrom&&unknownTo?' and ':'')+( unknownTo?'"'+toVal+'"':'');
            html+='<div style="padding:11px 14px;background:#FEF9EC;border:0.5px solid #F59E0B;border-radius:var(--r-md);margin-bottom:1rem;font-size:12px;color:#92400E;line-height:1.5">⚠ We didn\'t recognise '+unknown+' in our area database, so distance and time estimates may be off. Use the TfL or Google Maps links below for accurate journey times.</div>';
          }
          html+='<div style="padding:12px 14px;background:linear-gradient(135deg,var(--rose-light),var(--plum-light));border-radius:var(--r-md);border-left:3px solid var(--rose);margin-bottom:1rem"><div style="font-size:11px;font-weight:600;color:var(--rose-dark);letter-spacing:1px;text-transform:uppercase;margin-bottom:4px;display:flex;align-items:center;gap:6px"><span style="color:var(--rose-dark)">'+rec.icon+'</span> Our recommendation</div><div style="font-size:13px;color:var(--ink-soft);line-height:1.55">'+rec.text+'</div></div>';
          html+='<div style="display:flex;flex-direction:column;gap:10px">';

          // Generate next departures for bus/tube based on current time
          function _nextDepartures(type){
            const now=new Date();
            const deps=[];
            // First departure 1-6 min from now, then every 3-8 min
            let offset=1+Math.floor(Math.random()*5);
            for(let i=0;i<3;i++){
              const dep=new Date(now.getTime()+offset*60000);
              const h=dep.getHours();const m=dep.getMinutes();
              deps.push({time:String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'),mins:offset});
              offset+=type==='bus'?(4+Math.floor(Math.random()*6)):(3+Math.floor(Math.random()*5));
            }
            return deps;
          }

          opts.forEach((o,i)=>{
            const highlight=o.badge==='Best overall'||o.badge==='Best value';
            const isFree=o.cost===0;
            // Build next departures HTML for bus/tube
            let depsHtml='';
            if(o.type==='bus'||o.type==='tube'){
              const deps=_nextDepartures(o.type);
              const label=o.type==='bus'?'Next buses':'Next trains';
              depsHtml='<div style="display:flex;align-items:center;gap:6px;margin-top:6px;flex-wrap:wrap">'
                +'<span style="font-size:10px;color:var(--ink-muted);font-weight:500">'+label+':</span>'
                +deps.map((d,j)=>{
                  const isNext=j===0;
                  return '<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:8px;font-size:11px;font-weight:'+(isNext?'700':'500')+';'
                    +(isNext?'background:rgba(74,222,128,0.12);color:#4ADE80;border:0.5px solid rgba(74,222,128,0.3)':'background:rgba(255,255,255,0.06);color:var(--ink-muted);border:0.5px solid rgba(255,255,255,0.08)')
                    +'">'+(isNext?'<span style="width:5px;height:5px;border-radius:50%;background:#4ADE80;flex-shrink:0;animation:dotPulse 1.2s ease-in-out infinite"></span>':'')
                    +d.time+(isNext?' · '+d.mins+' min':'')+'</span>';
                }).join('')
                +'</div>';
            }
            html+='<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;border:'+(highlight?'1.5px solid var(--rose)':'0.5px solid var(--bdr)')+';border-radius:var(--r-md);background:'+(highlight?'var(--rose-light)':'var(--bg2)')+';">';
            html+='<div style="width:36px;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--primary)">'+o.icon+'</div>';
            html+='<div style="flex:1;min-width:0">';
            html+='<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:3px"><span style="font-size:13px;font-weight:600;color:var(--ink)">'+o.mode+'</span>'+(o.badge?'<span class="badge badge-rose" style="font-size:10px">'+o.badge+'</span>':'')+'</div>';
            html+='<div style="display:flex;gap:14px;align-items:baseline;margin-bottom:4px"><span style="font-size:12px;color:var(--ink-soft)">⏱ ~'+o.time+' min</span><span style="font-size:14px;font-weight:600;color:'+(highlight?'var(--rose-dark)':'var(--ink)')+'">'+o.costStr+'</span></div>';
            html+='<div style="font-size:11px;color:var(--ink-muted);line-height:1.45">'+o.desc+'</div>';
            html+=depsHtml;
            html+='</div>';
            if(o.type==='walk'){
              html+='<button class="btn btn-sm" onclick="openMaps(\''+encodeURIComponent(fromVal)+'\',\''+encodeURIComponent(toVal)+'\')">Map →</button>';
            } else if(o.type==='bus'||o.type==='tube'){
              html+='<button class="btn btn-sm'+(highlight?' btn-rose':'')+'" onclick="openTfL(\''+encodeURIComponent(fromVal)+'\',\''+encodeURIComponent(toVal)+'\')">Plan →</button>';
            } else {
              html+='<button class="btn btn-sm'+(highlight?' btn-rose':'')+'" onclick="bookTransportCab('+i+')">Book ✦</button>';
            }
            html+='</div>';
          });

          html+='</div></div></div>';

          const returnCabCost=Math.max(12,Math.round(kmRoad*2.2+5));
          html+='<div class="card"><div class="card-head"><div class="card-title">Return journey</div><div class="card-sub">How are you getting home?</div></div><div class="card-body"><div style="display:flex;gap:8px;flex-wrap:wrap">';
          html+='<button class="btn btn-sm btn-rose" onclick="swapAndFind()">Plan return trip ↩</button>';
          html+='<button class="btn btn-sm" onclick="bookReturnCab(\''+toVal.replace(/'/g,'')+'\',\''+fromVal.replace(/'/g,'')+'\','+returnCabCost+')">+ Book return cab (£'+returnCabCost+')</button>';
          html+='<button class="btn btn-sm" onclick="go(\'planner\',document.querySelector(\'[onclick*=planner]\'))">+ Add to planner</button>';
          html+='</div></div></div>';

          area.innerHTML=html;
        },700);
      }

      function bookTransportCab(i){
        const o=_transportOpts[i];if(!o)return;
        const f=document.getElementById('cab-from').value;
        const t=document.getElementById('cab-to').value;
        const d=document.getElementById('cab-date').value||new Date().toISOString().slice(0,10);
        const time=document.getElementById('cab-time').value;
        const baseCost=o.cost||14;
        // Generate Uber vs Bolt pricing
        const uberStd=baseCost;
        const uberComfort=Math.round(baseCost*1.45);
        const boltStd=Math.max(baseCost-2,Math.round(baseCost*0.88));
        const boltXL=Math.round(baseCost*1.35);
        const etaMins=Math.round(3+Math.random()*5);
        const area=document.getElementById('transport-results');
        // Step 1: Loading
        area.innerHTML=`<div class="card"><div class="loading-overlay"><div class="spinner"></div><div class="loading-text">Finding rides near you…</div></div></div>`;
        setTimeout(()=>{
          // Step 2: Comparing
          area.innerHTML=`<div class="card"><div class="loading-overlay">
            <div style="display:flex;gap:16px;align-items:center;margin-bottom:8px">
              <div style="font-size:18px;font-weight:800;color:#fff;letter-spacing:-0.3px">Uber</div>
              <span style="font-size:13px;color:var(--ink-muted)">vs</span>
              <div style="font-size:18px;font-weight:800;color:#34D186;letter-spacing:-0.3px">Bolt</div>
            </div>
            <div class="bf-pulse-dots"><div class="bf-pulse-dot"></div><div class="bf-pulse-dot"></div><div class="bf-pulse-dot"></div></div>
            <div class="loading-text" style="margin-top:8px">Comparing prices for ${f} → ${t}…</div>
          </div></div>`;
          setTimeout(()=>{
            // Step 3: Results with price comparison
            const driver=_bfDrivers[Math.floor(Math.random()*_bfDrivers.length)];
            area.innerHTML=`
              <div class="card" style="margin-bottom:1rem">
                <div class="card-head">
                  <div>
                    <div class="card-title">Choose your ride</div>
                    <div class="card-sub">${f} → ${t} · ~${o.time} min · ${etaMins} min pickup</div>
                  </div>
                </div>
                <div class="card-body">
                  <!-- Uber options -->
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                    <span style="font-size:16px;font-weight:800;color:#fff;letter-spacing:-0.3px">Uber</span>
                    <span style="font-size:10px;color:var(--ink-muted)">· ${etaMins} min away</span>
                  </div>
                  <div class="bf-transport-opt" onclick="confirmTransportRide('Uber','UberX','${f}','${t}','${d}','${time}',${uberStd},${o.time})" style="margin-bottom:6px">
                    <span style="color:var(--primary)">${_svgIcon('cab',22)}</span>
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:600;color:var(--ink)">UberX</div>
                      <div style="font-size:11px;color:var(--ink-muted)">Standard · 4 seats · ${o.time} min</div>
                    </div>
                    <div style="text-align:right">
                      <div style="font-size:15px;font-weight:700;color:var(--ink)">£${uberStd}</div>
                    </div>
                  </div>
                  <div class="bf-transport-opt" onclick="confirmTransportRide('Uber','Uber Comfort','${f}','${t}','${d}','${time}',${uberComfort},${o.time})" style="margin-bottom:16px">
                    <span style="color:var(--primary)">${_svgIcon('cab',22)}</span>
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:600;color:var(--ink)">Uber Comfort</div>
                      <div style="font-size:11px;color:var(--ink-muted)">Premium · Extra legroom · ${o.time} min</div>
                    </div>
                    <div style="text-align:right">
                      <div style="font-size:15px;font-weight:700;color:var(--ink)">£${uberComfort}</div>
                    </div>
                  </div>
                  <!-- Bolt options -->
                  <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                    <span style="font-size:16px;font-weight:800;color:#34D186;letter-spacing:-0.3px">Bolt</span>
                    <span style="font-size:10px;color:var(--ink-muted)">· ${etaMins+1} min away</span>
                    ${boltStd<uberStd?'<span class="badge" style="background:rgba(74,222,128,0.12);color:#4ADE80;border:0.5px solid rgba(74,222,128,0.3);font-size:9px">Cheapest</span>':''}
                  </div>
                  <div class="bf-transport-opt${boltStd<uberStd?' highlight':''}" onclick="confirmTransportRide('Bolt','Bolt Standard','${f}','${t}','${d}','${time}',${boltStd},${o.time})" style="margin-bottom:6px">
                    <span style="color:var(--primary)">${_svgIcon('cab',22)}</span>
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:600;color:var(--ink)">Bolt Standard</div>
                      <div style="font-size:11px;color:var(--ink-muted)">Standard · 4 seats · ${o.time} min</div>
                    </div>
                    <div style="text-align:right">
                      <div style="font-size:15px;font-weight:700;color:${boltStd<uberStd?'#4ADE80':'var(--ink)'}">£${boltStd}</div>
                      ${boltStd<uberStd?'<div style="font-size:10px;color:#4ADE80;font-weight:500">Save £'+(uberStd-boltStd)+'</div>':''}
                    </div>
                  </div>
                  <div class="bf-transport-opt" onclick="confirmTransportRide('Bolt','Bolt XL','${f}','${t}','${d}','${time}',${boltXL},${o.time})">
                    <span style="color:var(--primary)">${_svgIcon('cab',22)}</span>
                    <div style="flex:1">
                      <div style="font-size:13px;font-weight:600;color:var(--ink)">Bolt XL</div>
                      <div style="font-size:11px;color:var(--ink-muted)">Spacious · 6 seats · ${o.time} min</div>
                    </div>
                    <div style="text-align:right">
                      <div style="font-size:15px;font-weight:700;color:var(--ink)">£${boltXL}</div>
                    </div>
                  </div>
                  <button class="btn" style="width:100%;justify-content:center;padding:10px;font-size:12px;margin-top:12px" onclick="findTransportOptions()">← Back to all options</button>
                </div>
              </div>`;
          },1200);
        },1000);
      }

      function confirmTransportRide(provider,tier,from,to,date,time,cost,mins){
        const area=document.getElementById('transport-results');
        const driver=_bfDrivers[Math.floor(Math.random()*_bfDrivers.length)];
        // Loading: booking
        area.innerHTML=`<div class="card"><div class="loading-overlay"><div class="spinner"></div><div class="loading-text">Booking your ${provider} ${tier}…</div></div></div>`;
        setTimeout(()=>{
          // Connecting to driver
          area.innerHTML=`<div class="card"><div class="loading-overlay">
            <div style="display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.25);margin:0 auto 8px;color:var(--primary);animation:confirmPop 0.4s cubic-bezier(0.34,1.56,0.64,1)">${_svgIcon('cab',32)}</div>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left;width:100%;max-width:300px">
              <div class="bf-gen-line" style="animation-delay:0s"><div class="bf-gen-dot"></div><div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9)">Driver found</div></div>
              <div class="bf-gen-line" style="animation-delay:0.3s"><div class="bf-gen-dot" style="animation-delay:0.3s"></div><div style="font-size:13px;color:rgba(255,255,255,0.6)">${driver.name} · ${driver.car}</div></div>
              <div class="bf-gen-line" style="animation-delay:0.6s"><div class="bf-gen-dot" style="animation-delay:0.6s"></div><div style="font-size:13px;color:rgba(255,255,255,0.6)">Confirming pickup…</div></div>
            </div>
            <div class="bf-pulse-dots" style="margin-top:16px"><div class="bf-pulse-dot"></div><div class="bf-pulse-dot"></div><div class="bf-pulse-dot"></div></div>
          </div></div>`;
          setTimeout(()=>{
            // Confirmed
            bookings.push({id:Date.now(),type:'cab',name:from+' → '+to,date,meta:provider+' '+tier+(time?' · '+time:'')+' · '+driver.name+' · '+driver.car,amount:'£'+cost,icon:_SVG.cab});
            updateStats();renderBookings();_saveState();
            const provColor=provider==='Bolt'?'#34D186':'#fff';
            area.innerHTML=`
              <div class="card" style="margin-bottom:1rem">
                <div class="card-body" style="padding:20px">
                  <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
                    <div class="bf-confirm-success-ring" style="width:48px;height:48px;font-size:20px;margin:0;flex-shrink:0">✓</div>
                    <div>
                      <div style="font-size:18px;font-weight:700;color:var(--ink)">Ride booked!</div>
                      <div style="font-size:12px;color:var(--ink-muted);margin-top:2px"><span style="font-weight:700;color:${provColor}">${provider}</span> ${tier}</div>
                    </div>
                  </div>
                  <!-- Driver card -->
                  <div style="border-radius:14px;overflow:hidden;border:0.5px solid rgba(255,255,255,0.09);margin-bottom:14px">
                    <div class="bf-map">
                      <svg width="100%" height="100%" style="position:absolute;inset:0;opacity:0.18" preserveAspectRatio="none">
                        <line x1="0" y1="40%" x2="100%" y2="40%" stroke="#8B6914" stroke-width="0.8"/>
                        <line x1="0" y1="70%" x2="100%" y2="70%" stroke="#8B6914" stroke-width="0.8"/>
                        <line x1="25%" y1="0" x2="25%" y2="100%" stroke="#8B6914" stroke-width="0.8"/>
                        <line x1="60%" y1="0" x2="60%" y2="100%" stroke="#8B6914" stroke-width="0.8"/>
                        <path d="M 28% 80% Q 50% 50% 62% 22%" stroke="#C9A84C" stroke-width="2" fill="none" stroke-dasharray="5,3" opacity="0.8"/>
                      </svg>
                      <div style="position:absolute;bottom:22px;left:26%;transform:translateX(-50%)"><div style="width:10px;height:10px;border-radius:50%;background:#4ADE80;box-shadow:0 0 0 4px rgba(74,222,128,0.2)"></div></div>
                      <div style="position:absolute;top:14px;left:60%;transform:translateX(-50%)"><div style="width:10px;height:10px;border-radius:50%;background:var(--primary);box-shadow:0 0 0 4px rgba(201,168,76,0.2)"></div></div>
                      <div style="position:absolute;bottom:30px;left:32%"><div class="bf-map-car" style="color:var(--primary)">${_svgIcon('cab',18)}</div></div>
                      <div style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);border-radius:20px;padding:5px 11px;display:flex;align-items:center;gap:6px">
                        <div style="width:6px;height:6px;border-radius:50%;background:#4ADE80;animation:dotPulse 1s ease-in-out infinite"></div>
                        <span style="font-size:12px;font-weight:700;color:#fff">${driver.eta} min away</span>
                      </div>
                      <div style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);border-radius:20px;padding:5px 11px"><span style="font-size:12px;font-weight:700;color:#fff">£${cost}</span></div>
                    </div>
                    <div style="background:var(--card);padding:14px 16px;display:flex;align-items:center;gap:12px;border-top:0.5px solid rgba(255,255,255,0.06)">
                      <div class="bf-driver-avatar" style="background:${driver.color};width:44px;height:44px;font-size:14px;flex-shrink:0">${driver.initials}</div>
                      <div style="flex:1">
                        <div style="font-size:14px;font-weight:700;color:#fff">${driver.name}</div>
                        <div style="display:flex;align-items:center;gap:5px;margin-top:2px">
                          <span style="font-size:12px;color:#FCD34D;font-weight:600">★ ${driver.rating}</span>
                          <span style="font-size:11px;color:var(--subtle)">· ${driver.trips} trips</span>
                        </div>
                      </div>
                      <div style="text-align:right;flex-shrink:0">
                        <div style="font-family:monospace;font-size:12px;font-weight:700;letter-spacing:2px;color:#fff;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.14);border-radius:7px;padding:4px 8px">${driver.reg}</div>
                        <div style="font-size:10px;color:var(--subtle);margin-top:3px">${driver.car}</div>
                      </div>
                    </div>
                    <div style="background:rgba(255,255,255,0.03);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;border-top:0.5px solid rgba(255,255,255,0.05)">
                      <div style="display:flex;align-items:center;gap:8px">
                        <div style="width:8px;height:8px;border-radius:50%;background:#4ADE80"></div>
                        <span style="font-size:12px;color:var(--ink)">${from}</span>
                      </div>
                      <span style="font-size:11px;color:var(--ink-muted)">~${mins} min</span>
                      <div style="display:flex;align-items:center;gap:8px">
                        <span style="font-size:12px;color:var(--ink)">${to}</span>
                        <div style="width:8px;height:8px;border-radius:50%;background:var(--primary)"></div>
                      </div>
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">
                    <span class="bf-otable-badge" style="background:rgba(74,222,128,0.1);color:#4ADE80;border:0.5px solid rgba(74,222,128,0.3);display:inline-flex;align-items:center;gap:4px">${_svgIcon('card',12)} Pay in app</span>
                    <span class="bf-otable-badge" style="background:rgba(250,200,60,0.1);color:#FBC94A;border:0.5px solid rgba(250,200,60,0.3)">✓ Free cancellation (5 min)</span>
                  </div>
                  <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="btn btn-sm" onclick="go('planner',document.querySelector('[onclick*=planner]'))">✦ Add to planner</button>
                    <button class="btn btn-sm" onclick="findTransportOptions()">← Back</button>
                  </div>
                </div>
              </div>`;
            toast('✦ '+provider+' '+tier+' booked · '+driver.name+' is on the way');
          },2000);
        },1400);
      }

      function bookReturnCab(from,to,cost){
        const d=document.getElementById('cab-date').value||new Date().toISOString().slice(0,10);
        bookings.push({id:Date.now(),type:'cab',name:from+' → '+to,date:d,meta:'Cab — Standard · Return · 2 passengers',amount:'£'+cost,icon:_SVG.cab});
        updateStats();renderBookings();toast('✦ Return cab booked');
      }

      function openTfL(from,to){
        window.open('https://tfl.gov.uk/plan-a-journey/?from='+from+'&to='+to,'_blank');
      }

      function openMaps(from,to){
        window.open('https://www.google.com/maps/dir/'+from+'/'+to,'_blank');
      }

      function swapAndFind(){
        const f=document.getElementById('cab-from').value;
        const t=document.getElementById('cab-to').value;
        document.getElementById('cab-from').value=t;
        document.getElementById('cab-to').value=f;
        findTransportOptions();
      }

      function renderBookings(){
        const el=document.getElementById('bookings-list');if(!el)return;
        const list=activeFilter==='all'?bookings:bookings.filter(b=>b.type===activeFilter);
        if(!list.length){el.innerHTML='<div style="font-size:13px;color:var(--ink-muted)">No dates yet — start discovering!</div>';return;}
        const today=new Date().toISOString().slice(0,10);
        el.innerHTML=list.map(b=>{
          const isPast=b.date<today;
          const hasRating=b.rating!=null;
          // ── Feature 2: Star rating row ──
          let ratingHtml='';
          if(isPast&&!hasRating){
            ratingHtml=`<div style="margin-top:6px;display:flex;align-items:center;gap:6px">
              <span style="font-size:11px;color:var(--ink-muted)">Rate this date:</span>
              <span class="star-row" id="stars-${b.id}">
                ${[1,2,3,4,5].map(n=>`<span class="star" onmouseenter="hoverStars(${b.id},${n})" onmouseleave="clearStarHover(${b.id})" onclick="rateBooking(${b.id},${n})">★</span>`).join('')}
              </span>
            </div>`;
          } else if(hasRating){
            const stars=[1,2,3,4,5].map(n=>`<span class="star${n<=b.rating?' lit':''}">★</span>`).join('');
            ratingHtml=`<div style="margin-top:5px;display:flex;align-items:center;gap:5px"><span class="star-row">${stars}</span><span style="font-size:11px;color:var(--ink-muted)">${b.rating}/5</span></div>`;
          }
          return `<div class="booking-row">
            <div class="booking-icon" style="color:var(--primary)">${b.icon||_BOOKING_ICONS[b.type]||_SVG.experience||'✦'}</div>
            <div style="flex:1">
              <div class="booking-name">${b.name}</div>
              <div class="booking-meta">${b.meta} · ${fmtDate(b.date)}</div>
              <span class="badge ${isPast?'badge-muted':'badge-green'}" style="margin-top:5px">${isPast?'completed':'confirmed'}</span>
              ${ratingHtml}
            </div>
            <div class="booking-right">
              <div class="booking-price">${b.amount}</div>
              <div class="booking-date">${fmtDate(b.date)}</div>
              <button class="btn btn-sm" style="margin-top:5px;font-size:10px" onclick="cancelBooking(${b.id})">Remove</button>
            </div>
          </div>`;
        }).join('');
      }

      function hoverStars(id,n){
        const row=document.getElementById('stars-'+id);if(!row)return;
        row.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('lit',i<n));
      }
      function clearStarHover(id){
        const b=bookings.find(x=>x.id===id);if(!b)return;
        const row=document.getElementById('stars-'+id);if(!row)return;
        row.querySelectorAll('.star').forEach((s,i)=>s.classList.toggle('lit',b.rating!=null&&i<b.rating));
      }
      // ── Feature 2: Rate a past booking ──
      function rateBooking(id,stars){
        const b=bookings.find(x=>x.id===id);if(!b)return;
        b.rating=stars;
        renderBookings();updateStats();
        const labels=['','Disappointing','Could be better','Good night out','Really lovely','Perfect evening ♥'];
        toast(`${[...Array(stars)].map(()=>'★').join('')} ${labels[stars]}`);
      }

      function cancelBooking(id){bookings=bookings.filter(b=>b.id!==id);renderBookings();updateStats();toast('Booking removed');}
      function setFilter(f,el){
        activeFilter=f;
        document.querySelectorAll('#filter-btns .btn').forEach(b=>b.classList.remove('btn-rose'));
        el.classList.add('btn-rose');
        renderBookings();
      }

      function updateStats(){
        const s=document.getElementById('s-dates');if(s)s.textContent=bookings.length;
        const r=document.getElementById('s-rems');if(r)r.textContent=reminders.length;
        const total=bookings.reduce((acc,b)=>{const n=parseFloat((b.amount||'').replace(/[£,]/g,''));return acc+(isNaN(n)?0:n);},0);
        const sp=document.getElementById('s-spent');if(sp)sp.textContent=Math.round(total).toLocaleString();
        // ── Feature 6: Budget progress bar ──
        const barWrap=document.getElementById('s-budget-bar-wrap');
        const bar=document.getElementById('s-budget-bar');
        const barLabel=document.getElementById('s-budget-label');
        const budgetNote=document.getElementById('s-budget-note');
        if(_monthlyBudget>0&&barWrap&&bar&&barLabel){
          const now=new Date();
          const thisMonth=now.toISOString().slice(0,7); // "YYYY-MM"
          const monthSpend=bookings.reduce((acc,b)=>{
            if((b.date||'').slice(0,7)!==thisMonth) return acc;
            const n=parseFloat((b.amount||'').replace(/[£,]/g,''));
            return acc+(isNaN(n)?0:n);
          },0);
          const pct=Math.min(100,Math.round((monthSpend/_monthlyBudget)*100));
          const over=monthSpend>_monthlyBudget;
          const remaining=Math.max(0,_monthlyBudget-monthSpend);
          bar.style.width=pct+'%';
          bar.style.background=over?'var(--rose)':pct>75?'#F59E0B':'var(--color-background-success,#5DCAA5)';
          barLabel.textContent=over?`£${Math.round(monthSpend-_monthlyBudget)} over budget this month`:`£${Math.round(remaining)} left of £${_monthlyBudget} this month`;
          barLabel.style.color=over?'var(--rose-dark)':pct>75?'#92400E':'var(--ink-muted)';
          barWrap.style.display='';
          if(budgetNote) budgetNote.textContent=over?'⚠ Over budget':'This month';
        } else {
          if(barWrap) barWrap.style.display='none';
          if(budgetNote) budgetNote.textContent='Together';
        }
        // ── Feature 2: Average rating stat ──
        const rated=bookings.filter(b=>b.rating!=null);
        const avgEl=document.getElementById('s-avg-rating');
        const avgNoteEl=document.getElementById('s-avg-note');
        if(avgEl){
          if(rated.length){
            const avg=rated.reduce((a,b)=>a+b.rating,0)/rated.length;
            const stars=[1,2,3,4,5].map(n=>`<span style="color:${n<=Math.round(avg)?'#F59E0B':'#E5E7EB'}">★</span>`).join('');
            avgEl.innerHTML=stars;
            if(avgNoteEl) avgNoteEl.textContent=avg.toFixed(1)+' avg · '+rated.length+' rated';
          } else {
            avgEl.innerHTML='<span style="font-size:14px;color:var(--ink-muted)">—</span>';
            if(avgNoteEl) avgNoteEl.textContent='Rate past dates';
          }
        }
      }

      function renderReminders(){
        const el=document.getElementById('rem-list');if(!el)return;
        const sorted=[...reminders].sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
        el.innerHTML=sorted.length?sorted.map(r=>`
          <div class="reminder-item">
            <div class="rem-dot" style="background:${catColors[r.cat]||'#C4687A'}"></div>
            <div style="flex:1">
              <div class="rem-title">${r.title}</div>
              <div class="rem-meta">${fmtDate(r.date)} · ${r.time} · ${r.cat}</div>
            </div>
            <button class="btn btn-sm" style="font-size:10px" onclick="deleteRem(${r.id})">✕</button>
          </div>`).join(''):'<div style="font-size:13px;color:var(--ink-muted)">No reminders yet</div>';
      }

      function addReminder(){
        const title=document.getElementById('rem-title').value;
        const date=document.getElementById('rem-date').value;
        const time=document.getElementById('rem-time').value||'19:00';
        const cat=document.getElementById('rem-cat').value;
        if(!title||!date){toast('Please add a title and date');return;}
        reminders.push({id:Date.now(),title,date,time,cat,color:catColors[cat]||'#C4687A'});
        document.getElementById('rem-title').value='';
        renderReminders();renderCal();updateStats();
        toast('✦ Reminder added — '+title);
      }
      function deleteRem(id){reminders=reminders.filter(r=>r.id!==id);renderReminders();renderCal();updateStats();}

      function renderCal(){
        const grid=document.getElementById('cal-grid');if(!grid)return;
        const y=calMonth.getFullYear(),m=calMonth.getMonth();
        document.getElementById('cal-label').textContent=calMonth.toLocaleString('en-GB',{month:'long',year:'numeric'});
        const first=new Date(y,m,1);let dow=first.getDay();if(dow===0)dow=7;
        const dim=new Date(y,m+1,0).getDate();
        const today=new Date();let html='';
        for(let i=1;i<dow;i++){const pd=new Date(y,m,1-dow+i);html+=`<div class="cal-day other"><div class="cal-day-n">${pd.getDate()}</div></div>`;}
        for(let d=1;d<=dim;d++){
          const ds=`${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
          const rems=reminders.filter(r=>r.date===ds);
          const isToday=today.getFullYear()===y&&today.getMonth()===m&&today.getDate()===d;
          const isSel=selectedDay===ds;
          html+=`<div class="cal-day${isToday?' today':''}${isSel?' selected':''}${rems.length?' has-ev':''}" onclick="selectDay('${ds}')">
            <div class="cal-day-n">${d}</div>
            ${rems.slice(0,1).map(r=>`<div class="cal-ev">${r.title}</div>`).join('')}
          </div>`;
        }
        grid.innerHTML=html;
      }
      function changeMonth(dir){calMonth=new Date(calMonth.getFullYear(),calMonth.getMonth()+dir,1);renderCal();}
      function selectDay(ds){
        selectedDay=ds;renderCal();
        document.getElementById('day-title').textContent=fmtDate(ds);
        const rems=reminders.filter(r=>r.date===ds);
        const el=document.getElementById('day-events');
        el.innerHTML=rems.length?rems.map(r=>`
          <div style="display:flex;gap:8px;padding:7px 0;border-bottom:0.5px solid var(--bdr)">
            <div style="width:8px;height:8px;border-radius:50%;background:${catColors[r.cat]||'#C4687A'};margin-top:4px;flex-shrink:0"></div>
            <div style="flex:1"><div style="font-size:13px;font-weight:500;color:var(--ink)">${r.title}</div><div style="font-size:11px;color:var(--ink-muted);margin-top:2px">${r.time} · ${r.cat}</div></div>
            <button class="btn btn-sm" style="font-size:10px" onclick="deleteRem(${r.id})">✕</button>
          </div>`).join(''):`<div style="font-size:13px;color:var(--ink-muted)">Nothing on this day — <span style="color:var(--rose);cursor:pointer" onclick="document.getElementById('rem-date').value='${ds}'">add something?</span></div>`;
      }

      function exportICS(){
        const ics='BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Table for Two//EN\r\n'+
          reminders.map(r=>{
            const[y,mo,d]=r.date.split('-');const[h,mi]=(r.time||'19:00').split(':');
            const dt=`${y}${mo}${d}T${h}${mi}00`;
            return `BEGIN:VEVENT\r\nUID:${r.id}@tablefortwo\r\nDTSTAMP:${dt}\r\nDTSTART:${dt}\r\nSUMMARY:${r.title}\r\nDESCRIPTION:${r.cat}\r\nBEGIN:VALARM\r\nTRIGGER:-PT1H\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder: ${r.title}\r\nEND:VALARM\r\nEND:VEVENT`;
          }).join('\r\n')+'\r\nEND:VCALENDAR';
        const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([ics],{type:'text/calendar'}));a.download='tablefortwo.ics';a.click();
        toast('Calendar exported');
      }

      function fmtDate(ds){if(!ds)return '';try{return new Date(ds+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}catch{return ds;}}

      // Landing page
      const _surveyReactions={
        'one-decides':{
          headline:'Sound familiar? One person shouldn\'t carry all of this.',
          body:'Table for Two means you both get a say — and neither of you has to do the planning. It\'s fair, effortless, and actually fun.'
        },
        'back-and-forth':{
          headline:'That\'s exactly what we fix.',
          body:'No more "I don\'t mind, you choose." Table for Two looks at what you both love and surfaces ideas you\'ll actually agree on — instantly.'
        },
        'scrolling':{
          headline:'The endless scroll ends here.',
          body:'Instead of sifting through hundreds of options, we surface a handful matched to both your tastes. Opinionated, personalised, done.'
        },
        'system':{
          headline:'Great — we\'ll make your system even better.',
          body:'Table for Two layers in the bits most couples still hate: arguing over options, remembering to book, chasing the cab. We handle all of that.'
        }
      };

      function selectOption(el){
        document.querySelectorAll('.lp-option').forEach(o=>o.classList.remove('selected'));
        el.classList.add('selected');
        const key=el.dataset.key;
        const r=_surveyReactions[key];
        if(r){
          document.getElementById('lp-reaction-headline').textContent=r.headline;
          document.getElementById('lp-reaction-body').textContent=r.body;
          const box=document.getElementById('lp-survey-reaction');
          box.classList.add('show');
        }
        setTimeout(()=>document.getElementById('lp-waitlist').scrollIntoView({behavior:'smooth'}),800);
      }

      function castVote(vote, el){
        document.querySelectorAll('.lp-vote').forEach(v=>v.classList.remove('selected'));
        el.classList.add('selected');

        const messages = {
          yes:   'That\'s great to hear! Drop your email below and you\'ll be first to know when we launch. ✦',
          maybe: 'Fair enough — jump on the waitlist and we\'ll keep you posted as we add more features.',
          no:    'We appreciate the honesty. If you\'d like to tell us what\'s missing, mention it in the form below.'
        };
        const result = document.getElementById('lp-vote-result');
        result.textContent = messages[vote];
        result.style.display = 'block';

        // Send vote to Formspree
        const data = new FormData();
        data.append('vote', vote);
        data.append('_subject', 'Table for Two — Would you use it? vote: ' + vote);
        fetch('https://formspree.io/f/xreodnbr', {
          method:'POST', body:data, headers:{'Accept':'application/json'}
        }).catch(()=>{});

        setTimeout(()=>document.getElementById('lp-waitlist').scrollIntoView({behavior:'smooth'}),600);
      }

      async function submitWaitlist(){
        const name    = document.getElementById('lp-name').value.trim();
        const email   = document.getElementById('lp-email').value.trim();
        const partner = document.getElementById('lp-partner').value.trim();
        const city    = document.getElementById('lp-city').value.trim();
        const survey  = document.querySelector('.lp-option.selected .lp-option-text')?.textContent.trim() || 'Not answered';

        // Honeypot check — bots fill hidden fields, real users don't
        const honeypot = document.getElementById('lp-website');
        if(honeypot && honeypot.value){return;} // silently reject

        if(!name){alert('Please enter your name');return;}
        if(!email||!email.includes('@')){alert('Please enter a valid email address');return;}

        const btn = document.querySelector('.lp-submit');
        btn.textContent = 'Sending...';
        btn.disabled = true;

        // Build FormData — Formspree reads field names as column headers in the dashboard
        const data = new FormData();
        data.append('name', name);
        data.append('email', email);
        data.append('partner', partner || '—');
        data.append('city', city || '—');
        data.append('survey_answer', survey);

        fetch('https://formspree.io/f/xreodnbr', {
          method: 'POST',
          body: data,
          headers: { 'Accept': 'application/json' }
        })
        .then(function(response){
          if(response.ok){
            document.getElementById('lp-form-wrap').style.display = 'none';
            const _suc=document.getElementById('lp-success');
            _suc.style.display='flex';
            _suc.style.flexDirection='column';
            _suc.style.alignItems='center';
            _suc.style.justifyContent='center';
            _suc.style.minHeight='70vh';
            // Hide everything else on the landing page so the success
            // message is front and center — not buried at the bottom
            const hero=document.querySelector('.lp-hero');
            if(hero)hero.style.display='none';
            // Hide all sections except the waitlist section (which contains the success)
            document.querySelectorAll('.lp-body > .lp-section, .lp-body > .lp-divider, .lp-body > .lp-survey, .lp-body > .lp-woulduse, .lp-body > .lp-features, .lp-body > img').forEach(el=>{
              if(!el.id||el.id!=='lp-waitlist')el.style.display='none';
            });
            // Also hide the footer
            const footer=document.querySelector('.lp-footer');
            if(footer)footer.style.display='none';
            // Scroll to top so the success message is centered
            window.scrollTo({top:0,behavior:'smooth'});
          } else {
            return response.json().then(function(data){
              const msg = data.errors ? data.errors.map(e=>e.message).join(', ') : 'Something went wrong. Please try again.';
              alert(msg);
              btn.textContent = 'Reserve my spot ♥';
              btn.disabled = false;
            });
          }
        })
        .catch(function(){
          alert('Could not connect. Please check your internet connection and try again.');
          btn.textContent = 'Reserve my spot ♥';
          btn.disabled = false;
        });
      }

      // ── Landing page analytics ──
      const _lpStart = Date.now();
      let _lpDemoClicked = false;
      let _lpSessionSent = false;

      function _lpFmt(s){
        if(s < 60) return s + 's';
        return Math.floor(s/60) + 'm ' + (s%60) + 's';
      }

      function _lpSendSession(trigger){
        if(_lpSessionSent) return;
        _lpSessionSent = true;
        const secs = Math.round((Date.now() - _lpStart) / 1000);
        const survey = document.querySelector('.lp-option.selected .lp-option-text')?.textContent.trim() || 'No answer';
        const vote   = document.querySelector('.lp-vote.selected .lp-vote-label')?.textContent.trim() || 'No vote';
        const d = new FormData();
        d.append('_subject', '[Analytics] Session: ' + _lpFmt(secs) + ' · demo clicked: ' + (_lpDemoClicked ? 'Yes' : 'No'));
        d.append('event',          'landing_session');
        d.append('time_on_page',   _lpFmt(secs));
        d.append('time_seconds',   secs);
        d.append('demo_clicked',   _lpDemoClicked ? 'Yes' : 'No');
        d.append('exit_via',       trigger);
        d.append('survey_answer',  survey);
        d.append('would_use_vote', vote);
        navigator.sendBeacon('https://formspree.io/f/xreodnbr', d);
      }

      // Fire when tab is closed, switched away from, or phone screen locks
      document.addEventListener('visibilitychange', function(){
        if(document.visibilityState === 'hidden'){
          const lp = document.getElementById('landing');
          if(lp && lp.style.display !== 'none' && lp.style.opacity !== '0'){
            _lpSendSession('left_page');
          }
        }
      });

      function enterApp(){
        _lpDemoClicked = true;
        _lpSendSession('clicked_demo');
        const lp = document.getElementById('landing');
        if(!lp)return;
        lp.style.opacity = '0';
        lp.style.transition = 'opacity 0.35s';
        setTimeout(()=>{
          lp.style.display='none';
          lp.style.visibility='hidden';
          lp.style.pointerEvents='none';
          lp.style.zIndex='-1';
        }, 350);
      }

      function surpriseUs(){
        _vibeType='romantic';_vibeTag='Candlelit';_occasion='partner';
        document.querySelectorAll('#date-occasion .occasion-chip').forEach((c,i)=>c.classList.toggle('active',i===1));
        document.querySelectorAll('.vibe-card').forEach((c,i)=>c.classList.toggle('active',i===0));
        const sl=document.getElementById('budget-slider');if(sl){sl.value=2;updateBudgetLabel(2);}
        const hl=document.getElementById('discover-headline');if(hl)hl.innerHTML="Leave it with me — I'll surprise you";
        generateSuggestions();
      }

      function shareDate(){
        const url=window.location.origin+window.location.pathname+'?app';
        if(navigator.share){navigator.share({title:'Our date plan — Table for Two',url}).catch(()=>{});}
        else if(navigator.clipboard){navigator.clipboard.writeText(url).then(()=>toast('✦ Link copied — send it to Sophie!'));}
        else{toast('✦ Share: '+url);}
      }

      function shareIdea(name,loc,price){
        const text=`What do you think about this for our next date?\n\n${name}\n${loc} · ${price}\n\nFound on Table for Two ♥`;
        if(navigator.share){
          navigator.share({title:name+' — Table for Two',text}).catch(()=>{});
        } else if(navigator.clipboard){
          navigator.clipboard.writeText(text).then(()=>toast('✦ Copied — send it to your partner!')).catch(()=>toast(text));
        } else {
          toast('✦ '+name+' — share this with your partner!');
        }
      }

      // ── Sophie share link flow ──
      function _enc(obj){
        try{return btoa(encodeURIComponent(JSON.stringify(obj)));}catch{return '';}
      }
      function _dec(str){
        try{return JSON.parse(decodeURIComponent(atob(str)));}catch{return null;}
      }

      function shareSophieLink(){
        if(!_currentSuggestions.length){
          toast('Generate date ideas first, then share with Sophie');return;
        }
        const payload={ideas:_currentSuggestions.map(i=>({
          n:i.name,loc:i.loc,price:i.price,img:i.img,emoji:i.emoji,
          jv:(_votes[i.name]?.j??null)
        }))};
        const encoded=_enc(payload);
        if(!encoded){toast('Could not generate link');return;}
        const url=window.location.origin+window.location.pathname+'?sophie='+encoded;
        if(navigator.share){
          navigator.share({title:"Jamie's asking — what shall we do? ♥",text:"Pick your favourites on Table for Two",url}).catch(()=>{});
        } else if(navigator.clipboard){
          navigator.clipboard.writeText(url).then(()=>toast('✦ Sophie\'s link copied! Send it to her via WhatsApp or text'));
        } else {
          toast('Copy this link: '+url);
        }
      }

      // ── Sophie vote overlay ──
      let _svIdeas=[];
      let _svVotes=[];

      function initSophieView(encoded){
        const data=_dec(encoded);
        if(!data||!data.ideas||!data.ideas.length){
          document.getElementById('sv-headline').textContent='This link has expired or is invalid.';return;
        }
        _svIdeas=data.ideas;
        _svVotes=data.ideas.map(()=>null);
        const overlay=document.getElementById('sophie-overlay');
        overlay.style.display='flex';
        // Hide the main app
        document.querySelector('.app').style.display='none';
        const lp=document.getElementById('landing');if(lp)lp.style.display='none';
        // Render cards
        const container=document.getElementById('sv-cards');
        container.innerHTML=data.ideas.map((idea,idx)=>{
          const jLabel=idea.jv===true
            ?'<div style="font-size:11px;color:#C4687A;font-weight:500;margin-top:6px">Jamie said ♥ Yes to this</div>'
            :idea.jv===false
            ?'<div style="font-size:11px;color:#9CA3AF;margin-top:6px">Jamie said ✗ Pass on this</div>'
            :'';
          return `<div style="border:1.5px solid #F3E8EB;border-radius:14px;overflow:hidden;margin-bottom:14px;background:#fff" id="sv-card-${idx}">
            <div style="height:130px;background:#f0f0f0;overflow:hidden;position:relative">
              <img src="${idea.img}" alt="${idea.n}" style="width:100%;height:100%;object-fit:cover" onerror="this.parentElement.innerHTML='<div style=\\'height:130px;display:flex;align-items:center;justify-content:center;font-size:40px;background:#FDF8F9\\'>${idea.emoji}</div>'">
            </div>
            <div style="padding:12px 14px">
              <div style="font-size:15px;font-weight:600;color:#1a1a1a">${idea.n}</div>
              <div style="font-size:12px;color:#777;margin-top:2px">${idea.loc}</div>
              <div style="font-size:13px;color:#C4687A;font-weight:500;margin-top:3px">${idea.price}</div>
              ${jLabel}
              <div style="display:flex;gap:8px;margin-top:12px">
                <button id="sv-yes-${idx}" onclick="svVote(${idx},true)" style="flex:1;padding:11px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:14px;font-weight:600;background:#fff;cursor:pointer;transition:all .15s;font-family:inherit;color:#374151">♥ I'm in</button>
                <button id="sv-no-${idx}" onclick="svVote(${idx},false)" style="flex:1;padding:11px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:14px;font-weight:600;background:#fff;cursor:pointer;transition:all .15s;font-family:inherit;color:#374151">✗ Pass</button>
              </div>
            </div>
          </div>`;
        }).join('');
      }

      function svVote(idx,val){
        _svVotes[idx]=_svVotes[idx]===val?null:val;
        const yBtn=document.getElementById('sv-yes-'+idx);
        const nBtn=document.getElementById('sv-no-'+idx);
        const card=document.getElementById('sv-card-'+idx);
        if(_svVotes[idx]===true){
          yBtn.style.cssText='flex:1;padding:11px;border:1.5px solid #C4687A;border-radius:10px;font-size:14px;font-weight:700;background:#FEF0F3;cursor:pointer;font-family:inherit;color:#8B3A4A';
          nBtn.style.cssText='flex:1;padding:11px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:14px;font-weight:600;background:#fff;cursor:pointer;font-family:inherit;color:#9CA3AF';
          card.style.borderColor='#C4687A';
        } else if(_svVotes[idx]===false){
          nBtn.style.cssText='flex:1;padding:11px;border:1.5px solid #9CA3AF;border-radius:10px;font-size:14px;font-weight:700;background:#F3F4F6;cursor:pointer;font-family:inherit;color:#6B7280';
          yBtn.style.cssText='flex:1;padding:11px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:14px;font-weight:600;background:#fff;cursor:pointer;font-family:inherit;color:#9CA3AF';
          card.style.borderColor='#E5E7EB';
        } else {
          yBtn.style.cssText='flex:1;padding:11px;border:1.5px solid #E5E7EB;border-radius:10px;font-size:14px;font-weight:600;background:#fff;cursor:pointer;font-family:inherit;color:#374151';
          nBtn.style.cssText=yBtn.style.cssText;
          card.style.borderColor='#F3E8EB';
        }
      }

      function submitSophieVote(){
        const answered=_svVotes.filter(v=>v!==null).length;
        if(answered===0){toast('Tap yes or no on at least one idea first');return;}
        const results={votes:_svIdeas.map((idea,i)=>({n:idea.n,sv:_svVotes[i]}))};
        const encoded=_enc(results);
        const url=window.location.origin+window.location.pathname+'?app&svotes='+encoded;
        document.getElementById('sv-submit-btn').style.display='none';
        const resultDiv=document.getElementById('sv-result');
        const yesCount=_svVotes.filter(v=>v===true).length;
        const matchMsg=yesCount===0?'You passed on everything — maybe suggest something else!'
          :yesCount===1?'You liked 1 idea — Jamie will be pleased!'
          :'You liked '+yesCount+' ideas — Jamie will be thrilled! ♥';
        resultDiv.style.display='block';
        resultDiv.innerHTML=`
          <div style="text-align:center;padding:20px 0 12px">
            <div style="font-size:36px;margin-bottom:10px">♥</div>
            <div style="font-size:18px;font-weight:700;color:#1a1a1a;margin-bottom:6px;font-family:var(--font-serif,serif)">Done!</div>
            <div style="font-size:14px;color:#555;line-height:1.6;margin-bottom:20px">${matchMsg}</div>
          </div>
          <div style="padding:14px;background:#FDF8F9;border:0.5px solid #F5E6EA;border-radius:12px;margin-bottom:12px">
            <div style="font-size:11px;letter-spacing:1px;text-transform:uppercase;color:#C4687A;margin-bottom:8px;font-weight:600">Send this link to Jamie</div>
            <div id="sv-url-box" style="font-size:11px;color:#555;word-break:break-all;background:#fff;padding:10px;border-radius:8px;border:0.5px solid #eee;line-height:1.5">${url}</div>
          </div>
          <button onclick="svCopyLink('${url.replace(/'/g,"\\'")}',this)" style="width:100%;padding:13px;background:linear-gradient(135deg,#8B3A4A,#C4687A);color:#fff;font-size:14px;font-weight:600;border:none;border-radius:10px;cursor:pointer;font-family:inherit;margin-bottom:8px">Copy link for Jamie ✦</button>
          <button onclick="svShareLink('${url.replace(/'/g,"\\'")}',this)" style="width:100%;padding:13px;background:#fff;color:#C4687A;font-size:14px;font-weight:600;border:1.5px solid #C4687A;border-radius:10px;cursor:pointer;font-family:inherit">Share via WhatsApp / Message ↗</button>`;
      }

      function svCopyLink(url,btn){
        navigator.clipboard?.writeText(url).then(()=>{btn.textContent='✓ Copied!';setTimeout(()=>btn.textContent='Copy link for Jamie ✦',2500);}).catch(()=>{});
      }
      function svShareLink(url,btn){
        const text="Sophie's votes are in! Open this to see what I picked ♥\n"+url;
        if(navigator.share){navigator.share({title:"Sophie's votes — Table for Two",url}).catch(()=>{});}
        else{window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank');}
      }

      // ── On load: handle ?sophie= and ?svotes= URL params ──
      function initFromUrl(){
        const params=new URLSearchParams(window.location.search);
        // Sophie's voting view
        if(params.has('sophie')){
          initSophieView(params.get('sophie'));
          return;
        }
        // Jamie importing Sophie's results
        if(params.has('svotes')){
          const data=_dec(params.get('svotes'));
          if(data&&data.votes){
            data.votes.forEach(({n,sv})=>{
              if(sv!==null){
                if(!_votes[n])_votes[n]={j:null,s:null};
                _votes[n].s=sv;
              }
            });
            // Show discover page and regenerate with Sophie's votes applied
            setTimeout(()=>{
              go('discover',document.querySelector('[onclick*=discover]'));
              const yesNames=data.votes.filter(v=>v.sv===true).map(v=>v.n);
              const msg=yesNames.length
                ?`Sophie's votes are in! She liked: ${yesNames.join(', ')} ♥`
                :'Sophie\'s votes are in — check the discover page';
              toast(msg);
              // Regenerate suggestions so vote state is shown
              setTimeout(()=>generateSuggestions(true),300);
            },400);
          }
        }
      }

      updateStats();renderBookings();
      setSmartGreeting();
      // Init occasion context panel for default selection
      selectOccasion(document.querySelector('#date-occasion .occasion-chip.active'),'first_date');
      initFromUrl();
      setTimeout(generateSuggestions,400);
      const _dw=document.getElementById('date-when');
      if(_dw)_dw.value=new Date().toISOString().slice(0,10);

      // ════════════════════════════════════════════════
      // ── MOOD CHECK-IN ──
      // ════════════════════════════════════════════════
      function showMoodCheckIn(){
        const ov=document.getElementById('mood-overlay');
        if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
      }
      function closeMoodOverlay(){
        const ov=document.getElementById('mood-overlay');
        if(ov){ov.style.display='none';document.body.style.overflow='';}
      }
      function selectMood(v){
        _moodEnergy=v;
        document.querySelectorAll('.mood-btn').forEach(b=>b.classList.remove('selected'));
        const btn=document.getElementById('mood-'+v);
        if(btn)btn.classList.add('selected');
      }
      function confirmMoodAndGenerate(){
        closeMoodOverlay();
        generateSuggestions();
      }

      // ════════════════════════════════════════════════
      // ── DATE ROULETTE ──
      // ════════════════════════════════════════════════
      function spinRoulette(){
        const sliderEl=document.getElementById('budget-slider');
        const sliderVal=sliderEl?parseInt(sliderEl.value):1;
        const budget=BUDGET_KEYS[sliderVal]||'mid';
        const pool=IDEAS[budget]||IDEAS.mid;
        const area=document.getElementById('suggestions-area');
        area.innerHTML=`<div class="card"><div class="loading-overlay" style="gap:14px">
          <div class="roulette-die" style="font-size:56px"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="8" cy="8" r="1.2" fill="#C9A84C"/><circle cx="16" cy="8" r="1.2" fill="#C9A84C"/><circle cx="12" cy="12" r="1.2" fill="#C9A84C"/><circle cx="8" cy="16" r="1.2" fill="#C9A84C"/><circle cx="16" cy="16" r="1.2" fill="#C9A84C"/></svg></div>
          <div class="loading-text">Spinning the wheel…</div>
        </div></div>`;
        setTimeout(()=>{
          const picked=pool[Math.floor(Math.random()*pool.length)];
          const vegOk=!_VEG_UNFRIENDLY.has(picked.name);
          area.innerHTML=`<div class="roulette-reveal">
            <div style="text-align:center;margin-bottom:16px">
              <div style="font-size:13px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:var(--ink-muted);margin-bottom:8px">The wheel says…</div>
              <div style="font-size:32px;font-weight:700;color:var(--rose-dark);font-family:var(--font-serif,serif);line-height:1.2">${picked.name}</div>
              <div style="font-size:13px;color:var(--ink-muted);margin-top:6px">${picked.loc}</div>
            </div>
            <div class="card">
              <div class="idea-emoji" style="height:200px">
                <img src="${picked.img}" alt="${picked.name}" onerror="this.parentElement.innerHTML='${picked.emoji}'" style="width:100%;height:100%;object-fit:cover">
              </div>
              <div class="idea-body">
                <div style="font-size:12px;color:var(--ink-muted);font-style:italic;margin-bottom:8px">✦ ${picked.why}</div>
                <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px">
                  ${picked.vibes.map(v=>`<span class="badge badge-rose">${v}</span>`).join('')}
                  ${vegOk?'<span class="badge" style="background:#F0FDF4;color:#166534;border:0.5px solid #86EFAC">✓ Sophie-friendly</span>':''}
                </div>
                <div class="idea-price">${picked.price}</div>
                <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">
                  <button class="btn btn-rose btn-sm" onclick="quickBook('${picked.name}','experience','${picked.price}');this.textContent='✓ Booked!'">Book this ✦</button>
                  <button class="btn btn-sm" onclick="spinRoulette()">✦ Spin again</button>
                  <button class="btn btn-sm" onclick="saveToWishlist('${picked.name.replace(/'/g,"\\'")}','${picked.emoji}','${picked.price}','${picked.type}','${picked.why.replace(/'/g,"\\'")}')">✦ Save to wishlist</button>
                  <button class="btn btn-sm" onclick="generateSuggestions()">See all suggestions</button>
                </div>
              </div>
            </div>
          </div>`;
        },1600);
      }

      // ════════════════════════════════════════════════
      // ── SURPRISE MODE ──
      // ════════════════════════════════════════════════
      const _DRESS_CODES={romantic:'Smart casual — something elegant',foodie:'Smart casual — dress to impress',outdoor:'Comfortable & casual',cultural:'Smart casual',fun:'Casual — anything goes'};
      const _AREA_EMOJIS={romantic:'✦',foodie:'✦',outdoor:'✦',cultural:'✦',fun:'✦'};

      function toggleSurpriseMode(){
        _surpriseMode=!_surpriseMode;
        const btn=document.getElementById('surprise-toggle');
        if(btn)btn.classList.toggle('active',_surpriseMode);
        toast(_surpriseMode?'✦ Surprise mode on — plan a date and reveal only the basics to Sophie':'Surprise mode off');
      }
      function toggleDoubleDateMode(){
        _doubleDateMode=!_doubleDateMode;
        const btn=document.getElementById('dd-toggle');
        if(btn)btn.classList.toggle('active',_doubleDateMode);
        const row=document.getElementById('dd-names-row');
        if(row)row.style.display=_doubleDateMode?'':'none';
        toast(_doubleDateMode?'✦ Double-date mode — adding suggestions for four':'Double-date mode off');
      }
      function openSurprisePreview(name,type,emoji){
        const timeEl=document.getElementById('date-time');
        const timeStr=(timeEl&&timeEl.value&&timeEl.value!=='')?timeEl.value.split(' — ')[0]:'Evening';
        const locEl=document.getElementById('loc-select');
        const locStr=locEl?locEl.value:'London, UK';
        const dresscode=_DRESS_CODES[type]||'Smart casual';
        const areaEmoji=_AREA_EMOJIS[type]||'✦';
        const details=document.getElementById('sov-details');
        if(details){
          details.innerHTML=`
            <div style="display:flex;flex-direction:column;gap:10px">
              <div style="display:flex;align-items:center;gap:12px;padding:11px 13px;background:var(--bg2);border-radius:var(--r-md)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                <div><div style="font-size:11px;color:var(--ink-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Area</div><div style="font-size:13px;font-weight:500;color:var(--ink)">${locStr.split(',')[0]}</div></div>
              </div>
              <div style="display:flex;align-items:center;gap:12px;padding:11px 13px;background:var(--bg2);border-radius:var(--r-md)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <div><div style="font-size:11px;color:var(--ink-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Time</div><div style="font-size:13px;font-weight:500;color:var(--ink)">${timeStr}</div></div>
              </div>
              <div style="display:flex;align-items:center;gap:12px;padding:11px 13px;background:var(--bg2);border-radius:var(--r-md)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2 12 5 8 2 3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z"/></svg>
                <div><div style="font-size:11px;color:var(--ink-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Dress code</div><div style="font-size:13px;font-weight:500;color:var(--ink)">${dresscode}</div></div>
              </div>
              <div style="display:flex;align-items:center;gap:12px;padding:11px 13px;background:linear-gradient(135deg,var(--plum-light),var(--rose-light));border:0.5px solid var(--plum-mid);border-radius:var(--r-md)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>
                <div><div style="font-size:11px;color:var(--plum);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Everything else…</div><div style="font-size:13px;font-weight:500;color:var(--plum)">Is a surprise ✦</div></div>
              </div>
            </div>`;
        }
        const ov=document.getElementById('sov-overlay');
        if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
      }
      function closeSurpriseOverlay(){
        const ov=document.getElementById('sov-overlay');
        if(ov){ov.style.display='none';document.body.style.overflow='';}
      }
      function shareSurpriseCard(){
        closeSurpriseOverlay();
        shareSophieLink();
        toast('✦ Surprise shared with Sophie — she\'ll only see the mystery card!');
      }

      // ════════════════════════════════════════════════
      // ── WISHLIST ──
      // ════════════════════════════════════════════════
      function _updateWishBadge(){
        const b=document.getElementById('hub-wish-badge');
        if(!b)return;
        if(_wishBadgeCount>0){
          b.textContent='+'+_wishBadgeCount;
          b.style.display='flex';
          b.style.animation='none';b.offsetHeight;b.style.animation='confirmPop 0.35s cubic-bezier(0.34,1.56,0.64,1)';
        }else{b.style.display='none';}
      }
      function _clearWishBadge(){_wishBadgeCount=0;_updateWishBadge();}
      function saveToWishlist(name,emoji,price,type,why){
        if(_wishlist.find(w=>w.name===name)){toast('✦ Already on your wishlist!');return;}
        _wishlist.push({id:Date.now(),name,emoji,price,type,why,addedDate:new Date().toISOString().slice(0,10),done:false});
        _wishBadgeCount++;_updateWishBadge();
        toast('✦ Saved to your wishlist — find it under Wishlist');
      }
      function openAddWish(){
        const ov=document.getElementById('wish-overlay');
        if(ov){
          document.getElementById('wi-name').value='';
          document.getElementById('wi-price').value='';
          document.getElementById('wi-why').value='';
          ov.style.display='flex';document.body.style.overflow='hidden';
        }
      }
      function closeWishOverlay(){
        const ov=document.getElementById('wish-overlay');
        if(ov){ov.style.display='none';document.body.style.overflow='';}
      }
      function saveWishItem(){
        const name=document.getElementById('wi-name').value.trim();
        if(!name){toast('Please enter an idea name');return;}
        const price=document.getElementById('wi-price').value.trim()||'';
        const type=document.getElementById('wi-type').value;
        const why=document.getElementById('wi-why').value.trim();
        if(_wishlist.find(w=>w.name===name)){toast('Already on your wishlist!');closeWishOverlay();return;}
        _wishlist.push({id:Date.now(),name,emoji:'✦',price,type,why,addedDate:new Date().toISOString().slice(0,10),done:false});
        _wishBadgeCount++;_updateWishBadge();
        closeWishOverlay();
        renderWishlist();
        toast('✦ Saved to your wishlist!');
      }
      function toggleWishDone(id){
        const w=_wishlist.find(w=>w.id===id);
        if(w){w.done=!w.done;renderWishlist();}
      }
      function removeWish(id){
        _wishlist=_wishlist.filter(w=>w.id!==id);
        renderWishlist();
      }
      function setWishFilter(f,btn){
        _wishFilter=f;
        document.querySelectorAll('#page-wishlist .btn').forEach(b=>b.classList.remove('btn-rose'));
        if(btn)btn.classList.add('btn-rose');
        renderWishlist();
      }
      function renderHubWishlist(){
        const el=document.getElementById('hub-wishlist');
        if(!el)return;
        const todo=_wishlist.filter(w=>!w.done);
        if(!todo.length){
          el.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-muted)"><div style="margin-bottom:8px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div style="font-size:12px">No saved ideas yet — swipe right on Discover or tap save on What\'s Hot</div></div>';
          return;
        }
        el.innerHTML=todo.slice(0,5).map(w=>`<div class="wish-card" style="margin-bottom:6px">
          <div class="wish-check${w.done?' checked':''}" onclick="toggleWishDone(${w.id});renderHubWishlist()">${w.done?'✓':''}</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:2px">${w.name}</div>
            ${w.price?'<div style="font-size:11px;color:var(--ink-muted)">'+w.price+'</div>':''}
            ${w.why?'<div style="font-size:11px;color:var(--ink-muted);margin-top:3px;font-style:italic">✦ '+w.why+'</div>':''}
          </div>
          <button class="btn btn-sm btn-rose" style="flex-shrink:0;font-size:10px;padding:5px 10px" onclick="quickBook('${w.name.replace(/'/g,"\\'")}','experience','${(w.price||'').replace(/'/g,"\\'")}')">Book ✦</button>
        </div>`).join('')
        +(todo.length>5?'<div style="text-align:center;margin-top:8px"><span style="font-size:12px;color:var(--rose);cursor:pointer" onclick="go(\'wishlist\',document.querySelector(\'[onclick*=wishlist]\'))">+'+(todo.length-5)+' more →</span></div>':'');
      }
      function renderWishlist(){
        const el=document.getElementById('wishlist-items');
        if(!el)return;
        let items=_wishlist;
        if(_wishFilter==='todo')items=items.filter(w=>!w.done);
        else if(_wishFilter==='done')items=items.filter(w=>w.done);
        if(!items.length){
          const empty=_wishFilter==='done'?'No completed dates yet — tick an item when you\'ve been!'
            :_wishFilter==='todo'?'All caught up! Nothing left to do yet.'
            :'Your wishlist is empty — save ideas from Discover or add your own.';
          el.innerHTML=`<div style="text-align:center;padding:36px 20px;color:var(--ink-muted)">
            <div style="margin-bottom:10px"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div>
            <div style="font-size:13px;font-weight:500;color:var(--ink-soft);margin-bottom:5px">${empty}</div>
            ${_wishlist.length===0?`<button class="btn btn-sm btn-rose" style="margin-top:10px" onclick="go('discover',document.querySelector('[onclick*=discover]'))">Browse ideas ✦</button>`:''}
          </div>`;
          return;
        }
        el.innerHTML=items.map(w=>`<div class="wish-card${w.done?' done-item':''}">
          <div class="wish-check${w.done?' checked':''}" onclick="toggleWishDone(${w.id})">${w.done?'✓':''}</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:2px${w.done?';text-decoration:line-through;color:var(--ink-muted)':''}">${w.name}</div>
            ${w.price?`<div style="font-size:11px;color:var(--ink-muted)">${w.price}</div>`:''}
            ${w.why?`<div style="font-size:11px;color:var(--ink-muted);margin-top:4px;font-style:italic">✦ ${w.why}</div>`:''}
            <div style="font-size:10px;color:var(--ink-muted);margin-top:6px">Added ${w.addedDate}</div>
          </div>
          <button class="btn btn-sm" style="font-size:10px;padding:4px 8px;flex-shrink:0" onclick="removeWish(${w.id})">✕</button>
        </div>`).join('');
      }

      // ════════════════════════════════════════════════
      // ── RECURRING DATE SCHEDULER ──
      // ════════════════════════════════════════════════
      function saveRecurring(freq){
        _recurringFreq=freq;
        const statusEl=document.getElementById('recurring-status');
        if(!statusEl)return;
        if(!freq){statusEl.style.display='none';return;}
        const freqLabel={weekly:'every week',biweekly:'every 2 weeks',monthly:'once a month'}[freq]||freq;
        const now=new Date();
        let nextDate=new Date(now);
        if(freq==='weekly')nextDate.setDate(now.getDate()+7);
        else if(freq==='biweekly')nextDate.setDate(now.getDate()+14);
        else nextDate.setMonth(now.getMonth()+1);
        const opts={weekday:'long',month:'long',day:'numeric'};
        statusEl.innerHTML=`♥ Date night scheduled <strong>${freqLabel}</strong> — next one on <strong>${nextDate.toLocaleDateString('en-GB',opts)}</strong>.<br>We'll remind you 2 days before.`;
        statusEl.style.display='';
        toast(`✦ Date night set — ${freqLabel}`);
      }

      // ════════════════════════════════════════════════
      // ── DATE JOURNAL ──
      // ════════════════════════════════════════════════
      function openNewJournalEntry(){
        const ov=document.getElementById('journal-overlay');
        if(!ov)return;
        document.getElementById('je-name').value='';
        document.getElementById('je-note').value='';
        document.getElementById('je-date').value=new Date().toISOString().slice(0,10);
        _jeStarVal=0;
        document.querySelectorAll('#je-stars .star').forEach(s=>s.classList.remove('lit'));
        ov.style.display='flex';document.body.style.overflow='hidden';
      }
      function closeJournalOverlay(){
        const ov=document.getElementById('journal-overlay');
        if(ov){ov.style.display='none';document.body.style.overflow='';}
      }
      function setJeStar(v){
        _jeStarVal=v;
        document.querySelectorAll('#je-stars .star').forEach(s=>{s.classList.toggle('lit',parseInt(s.dataset.v)<=v);});
      }
      function saveJournalEntry(){
        const name=document.getElementById('je-name').value.trim();
        if(!name){toast('Please enter a date name');return;}
        const note=document.getElementById('je-note').value.trim();
        const date=document.getElementById('je-date').value||new Date().toISOString().slice(0,10);
        const vibe=document.getElementById('je-vibe').value;
        _journal.unshift({id:Date.now(),name,note,date,vibe,rating:_jeStarVal});
        closeJournalOverlay();
        renderJournal();
        toast('✦ Memory saved to your journal');
      }
      const _VIBE_EMOJIS={romantic:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2c-2 4-4 6-4 10a4 4 0 0 0 8 0c0-4-2-6-4-10Z"/></svg>',fun:'✦',foodie:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v5a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2"/><line x1="7" y1="9" x2="7" y2="22"/><path d="M21 2v8a3 3 0 0 1-3 3h0"/><line x1="21" y1="13" x2="21" y2="22"/></svg>',outdoor:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/></svg>',cultural:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 10s3-3 10-3 10 3 10 3"/><path d="M2 14s3 3 10 3 10-3 10-3"/><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/></svg>'};
      function renderJournal(){
        const el=document.getElementById('journal-entries');
        if(!el)return;
        // Update milestone stats
        const loggedEl=document.getElementById('jm-logged');
        if(loggedEl)loggedEl.textContent=_journal.length;
        const ratings=_journal.filter(j=>j.rating>0).map(j=>j.rating);
        const avgEl=document.getElementById('jm-rating');
        if(avgEl)avgEl.textContent=ratings.length?('★ '+(ratings.reduce((a,b)=>a+b,0)/ratings.length).toFixed(1)):'—';
        const vibeCount={};
        _journal.forEach(j=>{vibeCount[j.vibe]=(vibeCount[j.vibe]||0)+1;});
        const favVibe=Object.entries(vibeCount).sort((a,b)=>b[1]-a[1])[0];
        const favEl=document.getElementById('jm-fav');
        if(favEl)favEl.innerHTML=favVibe?`${_VIBE_EMOJIS[favVibe[0]]||'✦'} ${favVibe[0].charAt(0).toUpperCase()+favVibe[0].slice(1)}`:'—';
        if(!_journal.length){
          el.innerHTML=`<div style="text-align:center;padding:48px 20px;color:var(--ink-muted)">
            <div style="margin-bottom:12px"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/><path d="M9 10h6"/><path d="M9 14h4"/></svg></div>
            <div style="font-size:14px;font-weight:500;color:var(--ink-soft);margin-bottom:6px">No memories yet</div>
            <div style="font-size:12px;margin-bottom:20px">After each date, add a note and rating — they'll appear here</div>
            <button class="btn btn-rose btn-sm" onclick="openNewJournalEntry()">Add your first memory ✦</button>
          </div>`;
          return;
        }
        el.innerHTML=_journal.map(j=>{
          const stars=j.rating?Array.from({length:5},(_,i)=>`<span class="journal-star">${i<j.rating?'★':'☆'}</span>`).join(''):'';
          return `<div class="journal-entry">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:6px">
              <div>
                <div style="font-size:14px;font-weight:500;color:var(--ink)">${_VIBE_EMOJIS[j.vibe]||'✦'} ${j.name}</div>
                <div style="font-size:11px;color:var(--ink-muted);margin-top:2px">${j.date}${j.vibe?' · '+j.vibe.charAt(0).toUpperCase()+j.vibe.slice(1):''}</div>
              </div>
              <div>
                ${stars?`<div class="journal-stars" style="font-size:13px">${stars}</div>`:''}
              </div>
            </div>
            ${j.note?`<div style="font-size:12px;color:var(--ink-soft);font-style:italic;line-height:1.6;padding:8px 10px;background:var(--bg2);border-radius:var(--r-md)">"${j.note}"</div>`:''}
          </div>`;
        }).join('');
      }

      // ════════════════════════════════════════════════
      // ── WHO PAID LAST ──
      // ════════════════════════════════════════════════
      function cyclePaidLast(){
        if(_paidLast===null)_paidLast='jamie';
        else if(_paidLast==='jamie')_paidLast='sophie';
        else _paidLast=null;
        updatePaidLastUI();
      }
      function updatePaidLastUI(){
        const valEl=document.getElementById('s-paid-val');
        const noteEl=document.getElementById('s-paid-note');
        if(_paidLast===null){
          if(valEl)valEl.textContent='—';
          if(noteEl)noteEl.textContent='Tap to set';
        } else if(_paidLast==='jamie'){
          if(valEl)valEl.innerHTML='<span style="font-size:12px">JM</span>';
          if(noteEl)noteEl.textContent='Jamie paid · Sophie\'s turn';
          toast('✦ Jamie paid last — Sophie\'s turn next');
        } else {
          if(valEl)valEl.innerHTML='<span style="font-size:12px">SP</span>';
          if(noteEl)noteEl.textContent='Sophie paid · Jamie\'s turn';
          toast('✦ Sophie paid last — Jamie\'s turn next');
        }
      }

      // ════════════════════════════════════════════════
      // ── MILESTONE STATS (My Dates) ──
      // ════════════════════════════════════════════════
      function updateMilestoneStats(){
        // Next date countdown
        const now=new Date();
        const upcoming=bookings.filter(b=>b.date>=now.toISOString().slice(0,10)).sort((a,b)=>a.date.localeCompare(b.date))[0];
        const nextEl=document.getElementById('s-next-days');
        if(nextEl){
          if(upcoming){const diff=Math.round((new Date(upcoming.date+' 12:00')-now)/(1000*60*60*24));nextEl.textContent=diff===0?'Today':diff;}
          else nextEl.textContent='—';
        }
        // Date streak (months with at least one booking)
        const monthsWithDate=new Set(bookings.map(b=>(b.date||'').slice(0,7)));
        const streakEl=document.getElementById('s-streak');
        if(streakEl)streakEl.textContent=monthsWithDate.size||'—';
        // Post-date prompts
        renderPostDatePrompts();
      }

      // ════════════════════════════════════════════════
      // ── POST-DATE PROMPTS ──
      // ════════════════════════════════════════════════
      function renderPostDatePrompts(){
        const el=document.getElementById('post-date-prompts');
        if(!el)return;
        const yesterday=new Date();yesterday.setDate(yesterday.getDate()-1);
        const yStr=yesterday.toISOString().slice(0,10);
        const twoDaysAgo=new Date();twoDaysAgo.setDate(twoDaysAgo.getDate()-2);
        const tdaStr=twoDaysAgo.toISOString().slice(0,10);
        const recentPastDates=bookings.filter(b=>b.date>=tdaStr&&b.date<=yStr&&b.type!=='cab');
        if(!recentPastDates.length){el.innerHTML='';return;}
        el.innerHTML=recentPastDates.map(b=>{
          const alreadyLogged=_journal.find(j=>j.name.toLowerCase().includes(b.name.toLowerCase().split(',')[0]));
          if(alreadyLogged)return '';
          return `<div style="display:flex;align-items:center;gap:12px;padding:13px 15px;background:linear-gradient(135deg,var(--rose-light),var(--plum-light));border:1.5px solid var(--rose-mid);border-radius:var(--r-lg);margin-bottom:10px">
            <div style="font-size:24px;flex-shrink:0">${b.icon||'📖'}</div>
            <div style="flex:1">
              <div style="font-size:13px;font-weight:600;color:var(--rose-dark)">How was ${b.name.split(',')[0]}?</div>
              <div style="font-size:11px;color:var(--ink-muted);margin-top:2px">Add a memory while it's fresh — it'll mean the world to look back on</div>
            </div>
            <button class="btn btn-sm btn-rose" style="flex-shrink:0;font-size:11px" onclick="prefillJournalEntry('${b.name.replace(/'/g,"\\'")}')">Add memory ✦</button>
          </div>`;
        }).join('');
      }
      function prefillJournalEntry(name){
        openNewJournalEntry();
        setTimeout(()=>{const n=document.getElementById('je-name');if(n)n.value=name;},50);
      }

      // ════════════════════════════════════════════════
      // ── PRE-DATE CHECKLIST ──
      // ════════════════════════════════════════════════
      const _CHECKLIST_ITEMS=[
        {key:'table',label:'Reservation confirmed',emoji:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2v5a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V2"/><line x1="7" y1="9" x2="7" y2="22"/><path d="M21 2v8a3 3 0 0 1-3 3h0"/><line x1="21" y1="13" x2="21" y2="22"/></svg>'},
        {key:'cab',label:'Transport booked',emoji:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2-4H8L6 10l-2.5 1.1C2.7 11.3 2 12.1 2 13v3c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>'},
        {key:'reminder',label:'Reminder set for both of you',emoji:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>'},
        {key:'outfit',label:'Outfit sorted',emoji:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2 12 5 8 2 3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23Z"/></svg>'},
        {key:'gift',label:'Small gesture / flowers?',emoji:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v10H4V12"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>'},
        {key:'charge',label:'Phone charged',emoji:'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="18" rx="2"/><line x1="10" y1="2" x2="14" y2="2"/><path d="M10 14l2-3 2 3"/></svg>'},
      ];
      function showPreDateChecklist(bookingName){
        const titleEl=document.getElementById('cl-title');
        const subEl=document.getElementById('cl-sub');
        if(titleEl)titleEl.textContent=`Before ${bookingName}`;
        if(subEl)subEl.textContent='Tick each off as you go';
        _checklistState={};
        const itemsEl=document.getElementById('cl-items');
        if(itemsEl){
          itemsEl.innerHTML=_CHECKLIST_ITEMS.map(item=>`
            <div class="check-item" onclick="toggleChecklist('${item.key}')">
              <div class="check-circle" id="cc-${item.key}"></div>
              <span style="font-size:15px">${item.emoji}</span>
              <span style="font-size:13px;color:var(--ink)">${item.label}</span>
            </div>`).join('');
        }
        updateChecklistProgress();
        const ov=document.getElementById('checklist-overlay');
        if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
      }
      function toggleChecklist(key){
        _checklistState[key]=!_checklistState[key];
        const circle=document.getElementById('cc-'+key);
        if(circle){circle.classList.toggle('done',!!_checklistState[key]);circle.textContent=_checklistState[key]?'✓':'';}
        updateChecklistProgress();
      }
      function updateChecklistProgress(){
        const done=Object.values(_checklistState).filter(Boolean).length;
        const total=_CHECKLIST_ITEMS.length;
        const el=document.getElementById('cl-progress');
        if(el)el.textContent=`${done} of ${total} done`;
      }
      function closeChecklistOverlay(){
        const ov=document.getElementById('checklist-overlay');
        if(ov){ov.style.display='none';document.body.style.overflow='';}
      }

      // ════════════════════════════════════════════════
      // ── COUPLE PREFERENCES QUIZ ──
      // ════════════════════════════════════════════════
      function setQuiz(q,v,el){
        _quizAnswers[q]=v;
        el.closest('.quiz-options').querySelectorAll('.quiz-opt').forEach(o=>o.classList.remove('active'));
        el.classList.add('active');
        updateQuizResult();
      }
      function updateQuizResult(){
        const r=document.getElementById('quiz-result');
        if(!r)return;
        const profiles={
          energy:{homebody:'You both love cosy nights in',mixed:'You\'re flexible — happy in or out',outgoing:'You thrive out and about'},
          adventure:{low:'Stick to trusted favourites',mid:'Open to trying new things occasionally',high:'Always after the next new thing'},
          tod:{day:'Daytime daters — brunch dates and afternoon adventures',evening:'Classic early evenners',night:'You both come alive after dark'},
          crowd:{quiet:'Intimate settings — the quieter the better',any:'No preference',lively:'Buzz and atmosphere are important'},
          priority:{food:'Incredible food is non-negotiable',experience:'It\'s all about the experience',conversation:'Uninterrupted quality time',spontaneity:'You love being surprised'}
        };
        const lines=[profiles.energy[_quizAnswers.energy],profiles.adventure[_quizAnswers.adventure],profiles.tod[_quizAnswers.tod],profiles.crowd[_quizAnswers.crowd],profiles.priority[_quizAnswers.priority]].filter(Boolean);
        r.innerHTML=`<div style="font-size:12px;font-weight:600;color:var(--rose-dark);margin-bottom:8px">✦ Your couple profile</div>${lines.map(l=>`<div style="font-size:12px;color:var(--ink-soft);padding:3px 0;border-bottom:0.5px solid rgba(196,104,122,0.15)">· ${l}</div>`).join('')}`;
        r.style.display='';
      }
      // Initialise quiz result on page load
      updateQuizResult();

      // ════════════════════════════════════════════════
      // ── PERCEIVED EXECUTION BOOKING FLOW ──
      // ════════════════════════════════════════════════

      // ── Local persistence ──
      function _saveState(){
        try{localStorage.setItem('t4t_bk',JSON.stringify(bookings));localStorage.setItem('t4t_rm',JSON.stringify(reminders));}catch(e){}
      }
      (function _loadState(){
        try{
          const b=localStorage.getItem('t4t_bk');const r=localStorage.getItem('t4t_rm');
          if(b){bookings=JSON.parse(b);}if(r){reminders=JSON.parse(r);}
          renderBookings();renderReminders();renderCal();updateStats();
        }catch(e){}
      })();

      // ── iOS-style push notification banner ──
      function _showFakePush(title,body,delay){
        setTimeout(()=>{
          const el=document.createElement('div');
          el.style.cssText='position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:9999;max-width:340px;width:calc(100% - 32px);background:#0E0D0B;border:0.5px solid rgba(201,168,76,0.2);border-radius:16px;padding:10px 12px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 32px rgba(0,0,0,0.6),0 0 0 0.5px rgba(201,168,76,0.1);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);animation:slideDownNotif 0.4s cubic-bezier(.22,.68,0,1.2);cursor:pointer';
          el.innerHTML=`<div style="width:36px;height:36px;border-radius:9px;background:linear-gradient(135deg,#8B6914,#C9A84C);display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;color:#fff">♥</div><div style="flex:1;min-width:0"><div style="font-size:12px;font-weight:700;color:#fff;margin-bottom:1px">${title}</div><div style="font-size:11px;color:rgba(154,139,106,0.8);line-height:1.4">${body}</div></div><div style="font-size:10px;color:rgba(201,168,76,0.5);flex-shrink:0;white-space:nowrap">now</div>`;
          el.onclick=()=>el.remove();
          document.body.appendChild(el);
          setTimeout(()=>{el.style.opacity='0';el.style.transform='translateX(-50%) translateY(-12px)';el.style.transition='all 0.4s ease';setTimeout(()=>el.remove(),400);},4500);
        },delay||0);
      }

      let _bfData={};
      const _bfVenueData={
        'Dishoom, London':               {iconKey:'restaurant',area:'Covent Garden',  time:'7:30 PM',date:'Sat 19 Apr',tip:'Covent Garden is busy on weekends — a cab is much easier than parking',cabEst:'£12–15',cabMins:18,recommended:true,  hotel:'The Hoxton, Covent Garden',    hotelDesc:'A 5-min walk from Dishoom — industrial-chic rooms in the heart of it all',hotelPrice:'from £165'},
        'Sketch, Mayfair':               {iconKey:'restaurant',area:'Mayfair',        time:'8:00 PM',date:'Sat 19 Apr',tip:'Bond St. tube is a 5-min walk — Elizabeth line, quick and easy',        cabEst:'£16–20',cabMins:22,recommended:false, hotel:'The Connaught',                 hotelDesc:'A 3-min stroll — one of London\'s most iconic luxury hotels',             hotelPrice:'from £420'},
        'Ottolenghi, Islington':         {iconKey:'restaurant',area:'Islington',      time:'7:00 PM',date:'Sat 19 Apr',tip:'Angel tube is right there — Northern line from the City is a breeze',   cabEst:'£11–13',cabMins:15,recommended:true,  hotel:'The Zetter Townhouse',          hotelDesc:'Islington\'s most romantic boutique hotel — just around the corner',      hotelPrice:'from £220'},
        'Secret Cinema: Baz Luhrmann Night':{iconKey:'cinema',area:'Secret venue',time:'7:45 PM',date:'Sat 19 Apr',tip:'Location revealed 48 hrs before — a cab gives you the flexibility you\'ll want',cabEst:'£14–18',cabMins:20,recommended:true,hotel:'Ace Hotel, Shoreditch',         hotelDesc:'Cool and central — great base whatever the secret location turns out to be',hotelPrice:'from £160'},
        'Kew Gardens evening stroll':    {iconKey:'garden',area:'Richmond',       time:'6:30 PM',date:'Sat 19 Apr',tip:'District line to Richmond is easy — about 35 min from central London',  cabEst:'£22–28',cabMins:40,recommended:false, hotel:'The Petersham',                 hotelDesc:'Richmond\'s grandest hotel — overlooking the Thames, 5 min from Kew',     hotelPrice:'from £280'},
        'Saatchi Gallery + cocktails':   {iconKey:'gallery',area:'Chelsea',        time:'6:00 PM',date:'Sat 19 Apr',tip:'Chelsea is awkward by tube — a cab via Sloane Square is nicest',        cabEst:'£13–16',cabMins:17,recommended:true,  hotel:'The Levin Hotel',               hotelDesc:'Chelsea boutique hotel — steps from King\'s Road and Sloane Square',      hotelPrice:'from £195'}
      };
      const _bfDrivers=[
        {name:'Marcus T.',car:'Toyota Prius',   reg:'LX24 RKT',rating:'4.9',trips:'1,847',eta:4,initials:'MT',color:'#3B6EA0'},
        {name:'Priya S.',  car:'VW Passat',      reg:'MA23 UJP',rating:'4.8',trips:'2,203',eta:5,initials:'PS',color:'#7C5295'},
        {name:'James O.', car:'Mercedes E-Class',reg:'KL72 VBW',rating:'5.0',trips:'956', eta:3,initials:'JO',color:'#2D8A5E'},
        {name:'Aisha R.', car:'BMW 5 Series',   reg:'PN21 QXM',rating:'4.9',trips:'1,432',eta:6,initials:'AR',color:'#A04040'},
      ];
      function _bfInfo(name,type){
        if(_bfVenueData[name])return _bfVenueData[name];
        /* Smart icon key: try to match the name to a relevant icon */
        let ik=type||'experience';
        const nl=name.toLowerCase();
        if(nl.includes('cinema')||nl.includes('film')||nl.includes('bfi')||nl.includes('screen'))ik='cinema';
        else if(nl.includes('garden')||nl.includes('park')||nl.includes('primrose')||nl.includes('outdoor'))ik='garden';
        else if(nl.includes('gallery')||nl.includes('museum')||nl.includes('art')||nl.includes('saatchi')||nl.includes('tate'))ik='gallery';
        else if(nl.includes('wine')||nl.includes('cocktail')||nl.includes('bar')||nl.includes('rooftop'))ik='wine';
        else if(nl.includes('cook')||nl.includes('kitchen')||nl.includes('baking'))ik='cooking';
        else if(nl.includes('potter')||nl.includes('ceramic')||nl.includes('craft'))ik='pottery';
        else if(nl.includes('cruise')||nl.includes('thames')||nl.includes('boat')||nl.includes('river'))ik='boat';
        else if(nl.includes('picnic')||nl.includes('hill'))ik='picnic';
        else if(nl.includes('theatre')||nl.includes('west end')||nl.includes('show'))ik='theatre';
        else if(nl.includes('concert')||nl.includes('o2')||nl.includes('music')||nl.includes('gig'))ik='concert';
        else if(nl.includes('spa')||nl.includes('wellness')||nl.includes('massage'))ik='wellness';
        else if(nl.includes('restaurant')||nl.includes('dishoom')||nl.includes('dinner')||nl.includes('dining'))ik='restaurant';
        return{iconKey:ik,area:'London',time:'7:30 PM',date:'Sat 19 Apr',tip:'A cab is usually the easiest option for a date night',cabEst:'£14–18',cabMins:20,recommended:true,hotel:'A central London hotel',hotelDesc:'Make a night of it — we\'ll find you something close by',hotelPrice:'from £150'};
      }
      function _bfRef(){return 'T4T-'+Math.random().toString(36).slice(2,6).toUpperCase();}
      function _bfMinus(timeStr,mins){
        try{
          const isPM=timeStr.includes('PM');
          const t=timeStr.replace(' PM','').replace(' AM','').trim();
          const[hStr,mStr]=t.split(':');
          let h=parseInt(hStr);const m=parseInt(mStr||'0');
          if(isPM&&h<12)h+=12;
          let total=h*60+m-mins;if(total<0)total+=1440;
          const oh=Math.floor(total/60);const om=total%60;
          const suffix=oh>=12?'PM':'AM';
          const dh=oh>12?oh-12:(oh===0?12:oh);
          return dh+':'+String(om).padStart(2,'0')+' '+suffix;
        }catch(e){return '';}
      }

      // ── Type-aware booking language ──
      const _BF_LANG={
        restaurant:{step1:'Find a table',confirmed:'Table reserved!',slotsLabel:'Available times · Party of 2',searching:'Checking tables for',securing:'Locking in your table at',party:'2 guests',partyLabel:'Party',depositLabel:'Pay rest at venue',iconKey:'restaurant',remCat:'Dinner reservation'},
        concert:{step1:'Get tickets',confirmed:'Tickets confirmed!',slotsLabel:'Available dates · 2 tickets',searching:'Checking ticket availability for',securing:'Reserving your tickets for',party:'2 tickets',partyLabel:'Tickets',depositLabel:'Collect at door',iconKey:'concert',remCat:'Experience / activity'},
        theatre:{step1:'Book seats',confirmed:'Seats reserved!',slotsLabel:'Available performances · 2 seats',searching:'Checking seat availability for',securing:'Reserving your seats at',party:'2 seats',partyLabel:'Seats',depositLabel:'Collect at box office',iconKey:'theatre',remCat:'Experience / activity'},
        wellness:{step1:'Book a session',confirmed:'Session booked!',slotsLabel:'Available slots · 2 guests',searching:'Checking availability for',securing:'Reserving your session at',party:'2 guests',partyLabel:'Guests',depositLabel:'Pay rest on arrival',iconKey:'wellness',remCat:'Experience / activity'},
        rooftop:{step1:'Reserve a spot',confirmed:'Spot reserved!',slotsLabel:'Available times · Party of 2',searching:'Checking availability for',securing:'Reserving your spot at',party:'2 guests',partyLabel:'Party',depositLabel:'Pay rest at venue',iconKey:'rooftop',remCat:'Dinner reservation'},
        latenight:{step1:'Reserve a table',confirmed:'Reservation confirmed!',slotsLabel:'Available times · Party of 2',searching:'Checking availability for',securing:'Reserving your spot at',party:'2 guests',partyLabel:'Party',depositLabel:'Pay at venue',iconKey:'latenight',remCat:'Experience / activity'},
        activity:{step1:'Book a slot',confirmed:'Slot confirmed!',slotsLabel:'Available times · 2 people',searching:'Checking availability for',securing:'Reserving your slot at',party:'2 people',partyLabel:'People',depositLabel:'Pay rest on arrival',iconKey:'activity',remCat:'Experience / activity'},
        experience:{step1:'Reserve a spot',confirmed:'Booking confirmed!',slotsLabel:'Available times · 2 people',searching:'Checking availability for',securing:'Reserving your spot at',party:'2 people',partyLabel:'People',depositLabel:'Pay rest on arrival',iconKey:'experience',remCat:'Experience / activity'},
        dining:{step1:'Find a table',confirmed:'Table reserved!',slotsLabel:'Available times · Party of 2',searching:'Checking tables for',securing:'Locking in your table at',party:'2 guests',partyLabel:'Party',depositLabel:'Pay rest at venue',iconKey:'dining',remCat:'Dinner reservation'},
      };
      function _bfLang(type){
        if(_BF_LANG[type])return _BF_LANG[type];
        // Map Discover idea types to booking language
        if(type==='foodie')return _BF_LANG.restaurant;
        if(type==='romantic'||type==='cultural'||type==='fun'||type==='outdoor')return _BF_LANG.experience;
        return _BF_LANG.experience;
      }

      function showBookingFlow(name,type,amount){
        const v=_bfInfo(name,type);
        _bfData={name,type,amount,step:1,subState:'checking',
          selectedDate:v.date,selectedTime:v.time,
          transportBooked:false,hotelBooked:false,calAdded:false,
          bookingRef:_bfRef(),driver:_bfDrivers[Math.floor(Math.random()*_bfDrivers.length)]};
        _renderBfStep();
        const ov=document.getElementById('bf-overlay');
        if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
        // Auto-advance through the generating states
        setTimeout(()=>{_bfData.subState='securing';_renderBfStep();},2200);
        setTimeout(()=>{_bfData.subState='confirmed';_renderBfStep();},4400);
      }
      function closeBf(){
        const ov=document.getElementById('bf-overlay');
        if(ov){ov.style.display='none';document.body.style.overflow='';}
      }
      // ════════════════════════════════════════════════
      // ── PAYMENT SIMULATION ──
      // ════════════════════════════════════════════════
      let _payCallback=null;
      let _payAmount='';

      function _playSuccessSound(){
        try{
          const ctx=new (window.AudioContext||window.webkitAudioContext)();
          // Two-note chime: C5 then E5
          [523.25,659.25].forEach((freq,i)=>{
            const osc=ctx.createOscillator();
            const gain=ctx.createGain();
            osc.type='sine';
            osc.frequency.value=freq;
            gain.gain.setValueAtTime(0,ctx.currentTime+i*0.15);
            gain.gain.linearRampToValueAtTime(0.18,ctx.currentTime+i*0.15+0.02);
            gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+i*0.15+0.5);
            osc.connect(gain);gain.connect(ctx.destination);
            osc.start(ctx.currentTime+i*0.15);
            osc.stop(ctx.currentTime+i*0.15+0.5);
          });
          setTimeout(()=>ctx.close(),1000);
        }catch(e){}
      }

      function showPayment(amount,callback){
        _payAmount=amount;
        _payCallback=callback;
        document.getElementById('pay-amount-label').textContent=amount;
        document.getElementById('pay-choose').style.display='';
        document.getElementById('pay-processing').style.display='none';
        document.getElementById('pay-success').style.display='none';
        const ov=document.getElementById('payment-overlay');
        if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
      }

      function closePayment(){
        const ov=document.getElementById('payment-overlay');
        if(ov){ov.style.display='none';document.body.style.overflow='';}
      }

      function simulatePayment(method){
        const labels={apple:'Apple Pay',google:'Google Pay',card:'Card payment'};
        const icons={apple:'',google:'G',card:'✦'};
        // Show processing
        document.getElementById('pay-choose').style.display='none';
        document.getElementById('pay-processing').style.display='';
        const procIcon=document.getElementById('pay-proc-icon');
        procIcon.textContent=method==='apple'?'':'G';
        if(method==='apple')procIcon.innerHTML='<svg width="36" height="44" viewBox="0 0 17 20" fill="#fff"><path d="M13.1 10.4c0-2 1.6-3 1.7-3.1-0.9-1.4-2.4-1.5-2.9-1.6-1.2-0.1-2.4 0.7-3 0.7s-1.6-0.7-2.6-0.7c-1.3 0-2.6 0.8-3.3 2-1.4 2.4-0.4 6 1 8 0.7 1 1.5 2.1 2.5 2.1 1 0 1.4-0.7 2.6-0.7s1.6 0.7 2.6 0.6c1.1 0 1.8-1 2.5-2 0.8-1.1 1.1-2.2 1.1-2.3-0.1 0-2.2-0.8-2.2-3zM11 4.3c0.6-0.7 0.9-1.7 0.8-2.7-0.8 0-1.8 0.5-2.3 1.2-0.5 0.6-1 1.7-0.8 2.6 0.9 0.1 1.7-0.4 2.3-1.1z"/></svg>';
        if(method==='card')procIcon.innerHTML=_SVG.card.replace(/width="\d+"/,'width="36"').replace(/height="\d+"/,'height="36"');
        document.getElementById('pay-proc-title').textContent=method==='apple'?'Authorising with Face ID...':method==='google'?'Connecting to Google Pay...':'Processing card payment...';
        document.getElementById('pay-proc-sub').textContent=method==='apple'?'Double-click side button':method==='google'?'Verifying your account':'Contacting your bank';

        // After 1.5s show "verifying"
        setTimeout(()=>{
          document.getElementById('pay-proc-title').textContent='Verifying payment...';
          document.getElementById('pay-proc-sub').textContent='Almost there';
        },1500);

        // After 2.8s show success
        setTimeout(()=>{
          document.getElementById('pay-processing').style.display='none';
          document.getElementById('pay-success').style.display='';
          document.getElementById('pay-success-sub').textContent='Paid via '+labels[method];
          document.getElementById('pay-success-amount').textContent=_payAmount;
          _playSuccessSound();
          // Haptic feedback on mobile
          if(navigator.vibrate)navigator.vibrate([15,50,15]);
        },2800);
      }

      function closePaymentAndContinue(){
        closePayment();
        if(_payCallback){_payCallback();_payCallback=null;}
      }

      function closeBfAndNotify(){
        if(!_bfData.name){closeBf();return;}
        const v=_bfInfo(_bfData.name,_bfData.type);
        closeBf();
        // Payment already taken as deposit in step 1 — just show confirmations
        _showFakePush('Table for Two ♥','Your booking at '+_bfData.name+' on '+v.date+' at '+v.time+' is confirmed ✦',600);
        if(_bfData.transportBooked&&_bfData.driver){
          _showFakePush('Your ride',''+_bfData.driver.name+' will collect you — '+_bfData.driver.car+' · '+_bfData.driver.reg,4000);
        }
        setTimeout(()=>_showFakePush('Table for Two','We\'ll remind you when it\'s time to leave ♥ Have an amazing evening',8000),0);
      }
      function _bfDots(cur){
        return[1,2,3,4].map(i=>`<div class="bf-dot${i===cur?' active':i<cur?' done':''}"></div>`).join('');
      }
      function _bfLoading(iconKeyOrSvg,lines){
        /* Accept either an SVG icon key string (e.g. 'restaurant') or raw SVG markup */
        const iconHtml=_SVG[iconKeyOrSvg]
          ?_SVG[iconKeyOrSvg].replace(/width="\d+"/,'width="36"').replace(/height="\d+"/,'height="36"')
          :(iconKeyOrSvg||'✦');
        const rows=lines.map((l,i)=>`
          <div class="bf-gen-line" style="animation-delay:${i*0.28}s">
            <div class="bf-gen-dot" style="animation-delay:${i*0.3}s"></div>
            <div style="font-size:13px;font-weight:${i===0?'600':'400'};color:rgba(255,255,255,${i===0?'0.9':'0.6'})">${l}</div>
          </div>`).join('');
        return`
          <div style="padding:24px 0 8px;text-align:center">
            <div style="display:flex;align-items:center;justify-content:center;width:64px;height:64px;border-radius:50%;background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.25);margin:0 auto 20px;color:var(--primary);animation:confirmPop 0.4s cubic-bezier(0.34,1.56,0.64,1)">${iconHtml}</div>
            <div style="display:flex;flex-direction:column;gap:8px;text-align:left">${rows}</div>
            <div class="bf-pulse-dots" style="margin-top:20px">
              <div class="bf-pulse-dot"></div>
              <div class="bf-pulse-dot"></div>
              <div class="bf-pulse-dot"></div>
            </div>
          </div>`;
      }

      function _renderBfStep(){
        const el=document.getElementById('bf-content');if(!el)return;
        const{name,type,amount,step,subState,transportBooked,hotelBooked,driver,bookingRef}=_bfData;
        const v=_bfInfo(name,type);
        const lang=_bfLang(type);

        // ── Step 1: Venue booking ──
        if(step===1){
          if(!subState||subState==='idle'){
            const _bfDates=[
              {label:'Sat 19 Apr',val:'Sat 19 Apr'},
              {label:'Sun 20 Apr',val:'Sun 20 Apr'},
              {label:'Mon 21 Apr',val:'Mon 21 Apr'},
              {label:'Tue 22 Apr',val:'Tue 22 Apr'},
            ];
            if(!_bfData.selectedDate)_bfData.selectedDate=_bfDates[0].val;
            if(!_bfData.selectedTime)_bfData.selectedTime='7:30 PM';
            const _bfSlots=[
              {t:'7:00 PM',label:'7:00',state:'unavail'},
              {t:'7:30 PM',label:'7:30',state:'best'},
              {t:'8:00 PM',label:'8:00',state:''},
              {t:'8:30 PM',label:'8:30',state:''},
              {t:'9:00 PM',label:'9:00',state:'unavail'},
              {t:'9:30 PM',label:'9:30',state:''},
              {t:'10:00 PM',label:'10:00',state:''},
              {t:'10:30 PM',label:'10:30',state:'unavail'},
            ];
            const _bfDatePills=_bfDates.map(d=>`<div class="bf-date-pill${d.val===_bfData.selectedDate?' active':''}" data-date="${d.val}" onclick="document.querySelectorAll('.bf-date-pill').forEach(p=>p.classList.remove('active'));this.classList.add('active');_bfData.selectedDate=this.dataset.date">${d.label}</div>`).join('');
            const _bfTimeSlots=_bfSlots.map(s=>{
              const isSelected=!s.state.includes('unavail')&&s.t===_bfData.selectedTime;
              const cls='bf-slot'+(s.state?' '+s.state:'')+(isSelected?' selected':'');
              const labelColor=s.state==='unavail'?'rgba(255,255,255,0.28)':isSelected?'#fff':s.state==='best'?'#D4B86A':'rgba(255,255,255,0.85)';
              const sub=s.state==='unavail'?'<div style="font-size:9px;color:rgba(255,255,255,0.22);margin-top:3px">Full</div>':s.state==='best'?'<div style="font-size:9px;font-weight:600;color:#D4B86A;letter-spacing:0.04em;margin-top:3px">BEST</div>':'<div style="font-size:9px;color:rgba(74,222,128,0.75);margin-top:3px">Free</div>';
              const click=s.state==='unavail'?'':`onclick="document.querySelectorAll('.bf-slot').forEach(x=>x.classList.remove('selected'));this.classList.add('selected');_bfData.selectedTime=this.dataset.time"`;
              return`<div class="${cls}" data-time="${s.t}" ${click}><div style="font-size:13px;font-weight:700;color:${labelColor}">${s.label}</div>${sub}</div>`;
            }).join('');
            el.innerHTML=`
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 1 of 4</div>
                <button class="btn btn-sm" onclick="closeBf()" style="font-size:11px;padding:4px 10px">✕</button>
              </div>
              <div class="bf-step-dots">${_bfDots(1)}</div>
              <div style="font-size:19px;font-weight:700;color:var(--color-text-primary);margin-bottom:2px">${lang.step1}</div>
              <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:16px;display:flex;align-items:center;gap:6px"><span style="color:var(--primary)">${_svgIcon(v.iconKey,16)}</span> ${name} · ${v.area}</div>
              <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-text-tertiary);margin-bottom:8px">Select a date</div>
              <div style="display:flex;gap:8px;overflow-x:auto;padding-bottom:8px;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin-bottom:16px">${_bfDatePills}</div>
              <div style="font-size:10px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--color-text-tertiary);margin-bottom:8px">${lang.slotsLabel}</div>
              <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px">${_bfTimeSlots}</div>
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
                <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--color-text-tertiary)"><span style="width:8px;height:8px;border-radius:2px;background:rgba(201,168,76,0.45);display:inline-block"></span>Best</div>
                <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--color-text-tertiary)"><span style="width:8px;height:8px;border-radius:2px;background:rgba(74,222,128,0.35);display:inline-block"></span>Available</div>
                <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--color-text-tertiary)"><span style="width:8px;height:8px;border-radius:2px;background:rgba(255,255,255,0.07);display:inline-block"></span>Full</div>
              </div>
              <button id="bf-confirm-btn" class="btn btn-rose" style="width:100%;justify-content:center;padding:13px;border-radius:12px;font-size:14px;font-weight:600" onclick="bfConfirm()">Check availability →</button>
              <div style="text-align:center;margin-top:11px"><span style="font-size:12px;color:var(--color-text-tertiary);cursor:pointer;text-decoration:underline" onclick="closeBf()">Cancel</span></div>`;

          }else if(subState==='checking'){
            el.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 1 of 4</div></div><div class="bf-step-dots">${_bfDots(1)}</div>`
              +_bfLoading(v.iconKey,[
                'Looking for availability at '+name+'…',
                lang.searching+' '+(_bfData.selectedDate||v.date)+' · '+(_bfData.selectedTime||v.time),
                'Confirming '+lang.party+'…',
              ]);

          }else if(subState==='securing'){
            el.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 1 of 4</div></div><div class="bf-step-dots">${_bfDots(1)}</div>`
              +_bfLoading('clipboard',[
                'Generating your booking…',
                lang.securing+' '+name,
                'Sending confirmation to your email…',
              ]);

          }else if(subState==='confirmed'){
            const selDate=_bfData.selectedDate||v.date;
            const selTime=_bfData.selectedTime||v.time;
            el.innerHTML=`
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 1 of 4</div>
                <button class="btn btn-sm" onclick="closeBf()" style="font-size:11px;padding:4px 10px">✕</button>
              </div>
              <div class="bf-step-dots">${_bfDots(1)}</div>
              <div style="text-align:center;padding:10px 0 16px">
                <div class="bf-confirm-success-ring">✓</div>
                <div style="font-size:19px;font-weight:700;color:var(--color-text-primary);margin-bottom:4px">${lang.confirmed}</div>
                <div style="font-size:13px;color:var(--color-text-secondary);margin-bottom:14px">Confirmation sent to your email</div>
                <div class="bf-ref-badge">${bookingRef}</div>
              </div>
              <div class="bf-venue-card" style="margin-bottom:14px">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
                  <div style="width:44px;height:44px;border-radius:12px;background:rgba(201,168,76,0.12);border:1px solid rgba(201,168,76,0.2);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--primary)">${_svgIcon(v.iconKey,22)}</div>
                  <div><div style="font-size:14px;font-weight:700;color:var(--color-text-primary)">${name}</div><div style="font-size:12px;color:var(--color-text-secondary)">${v.area}</div></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
                  <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--color-text-tertiary);letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">Date</div><div style="font-size:13px;font-weight:600;color:var(--color-text-primary)">${selDate}</div></div>
                  <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--color-text-tertiary);letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">Time</div><div style="font-size:13px;font-weight:600;color:var(--color-text-primary)">${selTime}</div></div>
                  <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--color-text-tertiary);letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">${lang.partyLabel}</div><div style="font-size:13px;font-weight:600;color:var(--color-text-primary)">${lang.party}</div></div>
                  <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--color-text-tertiary);letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">Est. total</div><div style="font-size:13px;font-weight:600;color:var(--rose-dark)">${amount}</div></div>
                </div>
                <div style="display:flex;gap:7px;flex-wrap:wrap">
                  <span class="bf-otable-badge" style="background:rgba(201,168,76,0.12);color:#D4B86A;border:0.5px solid rgba(201,168,76,0.3);display:inline-flex;align-items:center;gap:4px">${_svgIcon('card',12)} Deposit taken</span>
                  <span class="bf-otable-badge" style="background:rgba(74,222,128,0.1);color:#4ADE80;border:0.5px solid rgba(74,222,128,0.3);display:inline-flex;align-items:center;gap:4px">${_svgIcon(v.iconKey,12)} ${lang.depositLabel}</span>
                  <span class="bf-otable-badge" style="background:rgba(250,200,60,0.1);color:#FBC94A;border:0.5px solid rgba(250,200,60,0.3)">✓ Free cancellation</span>
                </div>
              </div>
              <button class="btn btn-rose" style="width:100%;justify-content:center;padding:13px;border-radius:12px;font-size:14px;font-weight:600" onclick="bfPayDeposit()">Pay deposit & continue →</button>`;
          }

        // ── Step 2: Ride booking ──
        }else if(step===2){
          if(!subState||subState==='idle'){
            el.innerHTML=`
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 2 of 4</div>
                <button class="btn btn-sm" onclick="closeBf()" style="font-size:11px;padding:4px 10px">✕</button>
              </div>
              <div class="bf-step-dots">${_bfDots(2)}</div>
              <div style="font-size:19px;font-weight:700;color:var(--ink);margin-bottom:4px">Sort your ride?</div>
              <div style="font-size:13px;color:var(--ink-soft);margin-bottom:16px">Getting to <strong>${v.area}</strong> — here's what we'd suggest</div>
              <div style="background:var(--rose-light);border:1px solid var(--rose-mid);border-radius:12px;padding:13px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">
                <span style="color:var(--rose-dark)">${_svgIcon('cab',20)}</span>
                <div><div style="font-size:12px;font-weight:600;color:var(--rose-dark);margin-bottom:3px">${v.recommended?'✦ Our recommendation':'Suggested option'}</div><div style="font-size:12px;color:var(--ink-soft);line-height:1.5">${v.tip}</div></div>
              </div>
              <div class="bf-transport-opt${v.recommended?' highlight':''}" onclick="bfBookTransport()">
                <span style="color:var(--primary)">${_svgIcon('cab',22)}</span>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:600;color:var(--ink)">Book a cab to ${v.area}</div>
                  <div style="font-size:12px;color:var(--ink-soft)">~${v.cabMins} min · est. ${v.cabEst} · 2 passengers</div>
                </div>
                <button class="btn${v.recommended?' btn-rose':''} btn-sm" style="pointer-events:none">Book ✦</button>
              </div>
              <button class="btn" style="width:100%;justify-content:center;padding:12px;border-radius:12px;font-size:13px;margin-top:2px" onclick="bfSkipTransport()">I'll sort transport myself →</button>`;

          }else if(subState==='finding'){
            el.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 2 of 4</div></div><div class="bf-step-dots">${_bfDots(2)}</div>`
              +_bfLoading('cab',[
                'Looking for your ride…',
                'Checking drivers near you',
                'Matching with the best option…',
              ]);

          }else if(subState==='connecting'){
            el.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 2 of 4</div></div><div class="bf-step-dots">${_bfDots(2)}</div>`
              +_bfLoading('pin',[
                'Your driver has been confirmed',
                driver.name+' · '+driver.car+' · '+driver.reg,
                'Sending pickup details…',
              ]);

          }else if(subState==='assigned'){
            const arrT=new Date();arrT.setMinutes(arrT.getMinutes()+driver.eta);
            const arrStr=arrT.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
            el.innerHTML=`
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 2 of 4</div>
                <button class="btn btn-sm" onclick="closeBf()" style="font-size:11px;padding:4px 10px">✕</button>
              </div>
              <div class="bf-step-dots">${_bfDots(2)}</div>

              <!-- Ride confirmed header -->
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
                <div class="bf-confirm-success-ring" style="width:44px;height:44px;font-size:18px;margin:0;flex-shrink:0">✓</div>
                <div>
                  <div style="font-size:18px;font-weight:700;color:var(--color-text-primary);line-height:1.2">Ride confirmed!</div>
                  <div style="font-size:12px;color:var(--subtle);margin-top:2px">Your driver is on the way</div>
                </div>
              </div>

              <!-- Uber-style card -->
              <div style="border-radius:16px;overflow:hidden;margin-bottom:14px;border:0.5px solid rgba(255,255,255,0.09)">

                <!-- Stylised map -->
                <div class="bf-map">
                  <!-- Grid lines -->
                  <svg width="100%" height="100%" style="position:absolute;inset:0;opacity:0.18" preserveAspectRatio="none">
                    <line x1="0" y1="40%" x2="100%" y2="40%" stroke="#8B6914" stroke-width="0.8"/>
                    <line x1="0" y1="70%" x2="100%" y2="70%" stroke="#8B6914" stroke-width="0.8"/>
                    <line x1="25%" y1="0" x2="25%" y2="100%" stroke="#8B6914" stroke-width="0.8"/>
                    <line x1="60%" y1="0" x2="60%" y2="100%" stroke="#8B6914" stroke-width="0.8"/>
                    <line x1="85%" y1="0" x2="85%" y2="100%" stroke="#8B6914" stroke-width="0.5"/>
                    <!-- Route line -->
                    <path d="M 28% 80% Q 50% 50% 62% 22%" stroke="#C9A84C" stroke-width="2" fill="none" stroke-dasharray="5,3" opacity="0.8"/>
                  </svg>
                  <!-- Pickup marker -->
                  <div style="position:absolute;bottom:22px;left:26%;transform:translateX(-50%)">
                    <div style="width:12px;height:12px;border-radius:50%;background:#4ADE80;box-shadow:0 0 0 5px rgba(74,222,128,0.2)"></div>
                  </div>
                  <!-- Drop-off marker -->
                  <div style="position:absolute;top:14px;left:60%;transform:translateX(-50%)">
                    <div style="width:12px;height:12px;border-radius:50%;background:var(--primary);box-shadow:0 0 0 5px rgba(201,168,76,0.2)"></div>
                  </div>
                  <!-- Animated car -->
                  <div style="position:absolute;bottom:30px;left:32%">
                    <div class="bf-map-car" style="color:var(--primary)">${_svgIcon('cab',18)}</div>
                  </div>
                  <!-- ETA pill -->
                  <div style="position:absolute;top:10px;left:10px;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);border-radius:20px;padding:5px 11px;display:flex;align-items:center;gap:6px">
                    <div style="width:6px;height:6px;border-radius:50%;background:#4ADE80;animation:dotPulse 1s ease-in-out infinite"></div>
                    <span style="font-size:12px;font-weight:700;color:#fff">${driver.eta} min away</span>
                  </div>
                  <!-- Fare pill -->
                  <div style="position:absolute;bottom:10px;right:10px;background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);border-radius:20px;padding:5px 11px">
                    <span style="font-size:12px;font-weight:700;color:#fff">${v.cabEst}</span>
                  </div>
                </div>

                <!-- Driver row -->
                <div style="background:var(--card);padding:14px 16px;display:flex;align-items:center;gap:12px;border-top:0.5px solid rgba(255,255,255,0.06)">
                  <div class="bf-driver-avatar" style="background:${driver.color};width:46px;height:46px;font-size:15px;flex-shrink:0">${driver.initials}</div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:15px;font-weight:700;color:#fff">${driver.name}</div>
                    <div style="display:flex;align-items:center;gap:5px;margin-top:2px">
                      <span style="font-size:12px;color:#FCD34D;font-weight:600">★ ${driver.rating}</span>
                      <span style="font-size:11px;color:var(--subtle)">· ${driver.trips} trips</span>
                    </div>
                  </div>
                  <div style="text-align:right;flex-shrink:0">
                    <div style="font-family:monospace;font-size:13px;font-weight:700;letter-spacing:2px;color:#fff;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.14);border-radius:7px;padding:5px 9px">${driver.reg}</div>
                    <div style="font-size:10px;color:var(--subtle);margin-top:4px">${driver.car}</div>
                  </div>
                </div>

                <!-- Route -->
                <div style="background:rgba(255,255,255,0.03);padding:12px 16px;display:flex;flex-direction:column;gap:0;border-top:0.5px solid rgba(255,255,255,0.05)">
                  <div style="display:flex;align-items:center;gap:10px;padding:8px 0">
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:16px">
                      <div style="width:10px;height:10px;border-radius:50%;background:#4ADE80;box-shadow:0 0 0 3px rgba(74,222,128,0.18)"></div>
                    </div>
                    <div style="flex:1;font-size:12px;font-weight:500;color:#fff">Pickup · Home</div>
                    <div style="font-size:12px;font-weight:600;color:#4ADE80">${arrStr}</div>
                  </div>
                  <div style="display:flex;gap:0;align-items:stretch">
                    <div style="width:16px;display:flex;justify-content:center">
                      <div style="width:1.5px;background:rgba(255,255,255,0.1);flex:1"></div>
                    </div>
                    <div style="flex:1;padding:0 0 0 10px"></div>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;padding:8px 0">
                    <div style="display:flex;flex-direction:column;align-items:center;gap:2px;flex-shrink:0;width:16px">
                      <div style="width:10px;height:10px;border-radius:50%;background:var(--primary);box-shadow:0 0 0 3px rgba(201,168,76,0.18)"></div>
                    </div>
                    <div style="flex:1;font-size:12px;font-weight:500;color:#fff">Drop-off · ${v.area}</div>
                    <div style="font-size:11px;color:var(--subtle)">~${v.cabMins} min</div>
                  </div>
                </div>
              </div>

              <button class="btn btn-rose" style="width:100%;justify-content:center;padding:13px;border-radius:12px;font-size:14px;font-weight:600" onclick="_bfData.step=3;_bfData.subState='idle';_renderBfStep()">Make a night of it? →</button>`;
          }

        // ── Step 3: Hotel booking ──
        }else if(step===3){
          if(!subState||subState==='idle'){
            el.innerHTML=`
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 3 of 4</div>
                <button class="btn btn-sm" onclick="closeBf()" style="font-size:11px;padding:4px 10px">✕</button>
              </div>
              <div class="bf-step-dots">${_bfDots(3)}</div>
              <div style="font-size:19px;font-weight:700;color:var(--ink);margin-bottom:4px">Make a night of it?</div>
              <div style="font-size:13px;color:var(--ink-soft);margin-bottom:16px">Based on where you're going, here's what we'd suggest nearby</div>
              <div style="background:var(--plum-light);border:1px solid var(--plum-mid);border-radius:12px;padding:13px 14px;margin-bottom:14px;display:flex;align-items:flex-start;gap:10px">
                <span style="font-size:20px">✦</span>
                <div><div style="font-size:12px;font-weight:600;color:var(--plum);margin-bottom:3px">✦ Our pick near ${v.area}</div><div style="font-size:12px;color:var(--ink-soft);line-height:1.5">${v.hotelDesc}</div></div>
              </div>
              <div class="bf-transport-opt highlight" onclick="bfBookHotel()" style="border-color:var(--plum-mid);background:var(--plum-light)">
                <span style="color:var(--plum)">${_svgIcon('hotel',22)}</span>
                <div style="flex:1">
                  <div style="font-size:13px;font-weight:600;color:var(--ink)">${v.hotel}</div>
                  <div style="font-size:12px;color:var(--ink-soft)">${v.hotelPrice} · 1 night · Breakfast included</div>
                </div>
                <button class="btn btn-sm" style="pointer-events:none;background:var(--plum);color:#fff;border-color:var(--plum)">Book ✦</button>
              </div>
              <button class="btn" style="width:100%;justify-content:center;padding:12px;border-radius:12px;font-size:13px;margin-top:2px" onclick="bfSkipAccom()">Just the evening for us →</button>`;

          }else if(subState==='checking'){
            el.innerHTML=`<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 3 of 4</div></div><div class="bf-step-dots">${_bfDots(3)}</div>`
              +_bfLoading('hotel',['Checking availability…','Reserving your room at '+v.hotel]);

          }else if(subState==='confirmed'){
            const hRef='HOT-'+Math.random().toString(36).slice(2,6).toUpperCase();
            el.innerHTML=`
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
                <div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">Step 3 of 4</div>
                <button class="btn btn-sm" onclick="closeBf()" style="font-size:11px;padding:4px 10px">✕</button>
              </div>
              <div class="bf-step-dots">${_bfDots(3)}</div>
              <div style="text-align:center;padding:8px 0 14px">
                <div style="width:52px;height:52px;border-radius:50%;background:var(--plum-light);border:1px solid var(--plum-mid);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;color:var(--plum)">${_svgIcon('hotel',26)}</div>
                <div style="font-size:18px;font-weight:700;color:var(--ink);margin-bottom:3px">Room reserved!</div>
                <div style="font-size:13px;color:var(--ink-soft)">Confirmation on its way to your email</div>
              </div>
              <div style="background:var(--plum-light);border:1px solid var(--plum-mid);border-radius:14px;padding:16px;margin-bottom:14px">
                <div style="font-size:14px;font-weight:700;color:var(--plum);margin-bottom:11px">${v.hotel}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:11px">
                  <div style="background:rgba(255,255,255,0.55);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--plum);opacity:0.8;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">Check-in</div><div style="font-size:12px;font-weight:600;color:var(--plum)">${v.date} · 3:00 PM</div></div>
                  <div style="background:rgba(255,255,255,0.55);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--plum);opacity:0.8;letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">Check-out</div><div style="font-size:12px;font-weight:600;color:var(--plum)">Sun 20 Apr · 11 AM</div></div>
                </div>
                <div style="display:flex;gap:7px;flex-wrap:wrap">
                  <span class="bf-otable-badge" style="background:rgba(255,255,255,0.55);color:var(--plum);border:0.5px solid var(--plum-mid);display:inline-flex;align-items:center;gap:4px">${_svgIcon('breakfast',12)} Breakfast included</span>
                  <span class="bf-otable-badge" style="background:rgba(255,255,255,0.55);color:var(--plum);border:0.5px solid var(--plum-mid)">✓ Free cancellation</span>
                  <span class="bf-otable-badge" style="background:rgba(255,255,255,0.55);color:var(--plum);border:0.5px solid var(--plum-mid)">Ref: ${hRef}</span>
                </div>
              </div>
              <button class="btn btn-rose" style="width:100%;justify-content:center;padding:13px;border-radius:12px;font-size:14px;font-weight:600;background:var(--plum);border-color:var(--plum)" onclick="_bfData.step=4;_bfData.subState='idle';_renderBfStep()">Almost there →</button>`;
          }

        // ── Step 4: Timeline + Notifications ──
        }else{
          // Build timeline
          const tl=[];
          if(hotelBooked) tl.push({time:'3:00 PM',iconKey:'hotel',label:'Check in',sub:v.hotel,dot:'#7C5295',bg:'var(--plum-light)'});
          if(transportBooked){
            const leaveTime=_bfMinus(v.time,v.cabMins+12);
            const cabTime=_bfMinus(v.time,v.cabMins);
            tl.push({time:leaveTime,iconKey:'bell',label:'We\'ll remind you to leave',sub:'Push notification sent to your phone',dot:'#22C55E',bg:'#F0FDF4'});
            tl.push({time:cabTime,iconKey:'cab',label:driver.name+' · your cab',sub:driver.car+' · '+driver.reg+' from Home',dot:'#3B6EA0',bg:'#EFF6FF'});
          }
          tl.push({time:v.time,iconKey:v.iconKey,label:name,sub:v.area+' · Table for 2 · '+amount,dot:'var(--rose)',bg:'var(--rose-light)'});
          if(hotelBooked) tl.push({time:'Late evening',iconKey:'moon',label:'Into the night at '+v.hotel,sub:'Your romantic evening continues…',dot:'#7C5295',bg:'var(--plum-light)'});

          const tlHtml=tl.map((item,i)=>`
            <div style="display:flex;gap:12px">
              <div style="display:flex;flex-direction:column;align-items:center;flex-shrink:0">
                <div style="width:32px;height:32px;border-radius:50%;background:${item.bg};border:2px solid ${item.dot};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:${item.dot}">${_svgIcon(item.iconKey,14)}</div>
                ${i<tl.length-1?`<div style="width:1.5px;flex:1;background:var(--bdr2);min-height:16px;margin:2px 0"></div>`:''}
              </div>
              <div style="flex:1;padding-top:4px;${i<tl.length-1?'padding-bottom:12px':''}">
                <div style="font-size:11px;font-weight:600;color:var(--ink-muted);margin-bottom:1px">${item.time}</div>
                <div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:1px">${item.label}</div>
                <div style="font-size:11px;color:var(--ink-muted)">${item.sub}</div>
              </div>
            </div>`).join('');

          // Build notification previews
          const notifs=[
            {title:'Table for Two ♥',body:'Your table at '+name+' is confirmed for '+v.date+' at '+v.time+' 🎉',t:'Earlier'},
            ...(transportBooked?[{title:'Your ride · Table for Two',body:driver.name+' is on the way — '+driver.car+' · '+driver.reg,t:'On the night'}]:[]),
            {title:'Table for Two',body:'Time to head out now — have an amazing evening together ♥',t:'On the night'},
          ];

          el.innerHTML=`
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div style="font-size:10px;font-weight:700;letter-spacing:0.07em;color:var(--rose-dark);text-transform:uppercase">All set!</div>
              <button class="btn btn-sm" onclick="closeBf()" style="font-size:11px;padding:4px 10px">✕</button>
            </div>
            <div class="bf-step-dots">${_bfDots(4)}</div>
            <div class="bf-concierge-banner">
              <div style="color:rgba(255,255,255,0.9)">${_svgIcon('concierge',28)}</div>
              <div>
                <div style="font-size:14px;font-weight:700">Everything is planned for you</div>
                <div style="font-size:12px;opacity:0.85;margin-top:2px">We'll coordinate it all and remind you when to leave ♥</div>
              </div>
            </div>
            <div style="background:var(--bg2);border:0.5px solid var(--bdr);border-radius:14px;padding:14px 14px 6px;margin-bottom:14px">
              <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink-muted);margin-bottom:12px">Your date timeline</div>
              ${tlHtml}
            </div>
            <div style="background:#1C1C1E;border-radius:14px;padding:14px;margin-bottom:14px">
              <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(255,255,255,0.4);margin-bottom:10px">Upcoming notifications</div>
              ${notifs.map(n=>`
                <div class="bf-notif-row">
                  <div class="bf-notif-appicon">♥</div>
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">
                      <span style="font-size:11px;font-weight:700;color:#fff">${n.title}</span>
                      <span style="font-size:10px;color:rgba(255,255,255,0.35);flex-shrink:0;margin-left:8px">${n.t}</span>
                    </div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.65);line-height:1.4">${n.body}</div>
                  </div>
                </div>`).join('')}
            </div>
            <button id="bf-cal-btn" class="btn" style="width:100%;justify-content:center;padding:12px;border-radius:12px;font-size:13px;font-weight:600;margin-bottom:8px;border-color:var(--rose-mid);color:var(--rose-dark)" onclick="bfAddToCalendar(this)">✦ Add to planner</button>
            <button class="btn btn-rose" style="width:100%;justify-content:center;padding:13px;border-radius:12px;font-size:14px;font-weight:600;margin-bottom:10px" onclick="closeBfAndNotify()">Done — let's do this ✦</button>
            <div style="text-align:center"><span style="font-size:12px;color:var(--ink-muted);cursor:pointer;text-decoration:underline" onclick="closeBf()">Add a memory after the date →</span></div>`;
        }
      }

      function bfPayDeposit(){
        // Calculate deposit (roughly 20% of the amount, minimum £5)
        const raw=parseFloat((_bfData.amount||'').replace(/[^0-9.]/g,''))||30;
        const deposit='£'+Math.max(5,Math.round(raw*0.2));
        closeBf();
        showPayment(deposit+' deposit',function(){
          // Re-open booking flow at step 2
          const ov=document.getElementById('bf-overlay');
          if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
          _bfData.step=2;_bfData.subState='idle';_renderBfStep();
          toast('✦ '+deposit+' deposit paid — table secured');
        });
      }
      function bfPayHotelDeposit(){
        const v=_bfInfo(_bfData.name,_bfData.type);
        const raw=parseFloat((v.hotelPrice||'').replace(/[^0-9.]/g,''))||150;
        const deposit='£'+Math.max(20,Math.round(raw*0.25));
        closeBf();
        showPayment(deposit+' hotel deposit',function(){
          const ov=document.getElementById('bf-overlay');
          if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
          _bfData.step=4;_bfData.subState='idle';_renderBfStep();
          toast('✦ '+deposit+' hotel deposit paid');
        });
      }
      function bfConfirm(){
        _bfData.subState='checking';_renderBfStep();
        setTimeout(()=>{_bfData.subState='securing';_renderBfStep();},2000);
        setTimeout(()=>{_bfData.subState='confirmed';_renderBfStep();},4000);
      }
      function bfBookTransport(){
        const v=_bfInfo(_bfData.name,_bfData.type);
        _bfData.subState='finding';_renderBfStep();
        setTimeout(()=>{_bfData.subState='connecting';_renderBfStep();},2000);
        setTimeout(()=>{
          const d=new Date();d.setDate(d.getDate()+((6-d.getDay()+7)%7||7));
          bookings.push({id:Date.now(),type:'cab',name:'Home → '+v.area,date:d.toISOString().slice(0,10),meta:'Cab · Standard · 2 passengers · '+_bfData.driver.car,amount:v.cabEst.split('–')[0],icon:_SVG.cab});
          updateStats();renderBookings();_saveState();toast('✦ Cab confirmed · '+_bfData.driver.name);
          _bfData.transportBooked=true;_bfData.subState='assigned';_renderBfStep();
        },4000);
      }
      function bfSkipTransport(){_bfData.step=3;_bfData.subState='idle';_renderBfStep();}
      function bfBookHotel(){
        const v=_bfInfo(_bfData.name,_bfData.type);
        _bfData.subState='checking';_renderBfStep();
        setTimeout(()=>{
          const d=new Date();d.setDate(d.getDate()+((6-d.getDay()+7)%7||7));
          bookings.push({id:Date.now(),type:'hotel',name:v.hotel,date:d.toISOString().slice(0,10),meta:'1 night · 2 guests · Breakfast included',amount:v.hotelPrice.replace('from ',''),icon:_SVG.hotel});
          updateStats();renderBookings();_saveState();toast('✦ '+v.hotel+' reserved');
          _bfData.hotelBooked=true;_bfData.subState='confirmed';_renderBfStep();
        },2400);
      }
      function bfSkipAccom(){_bfData.step=4;_bfData.subState='idle';_renderBfStep();}
      function bfAddToCalendar(btn){
        if(_bfData.calAdded)return;
        const v=_bfInfo(_bfData.name,_bfData.type);
        const d=new Date();d.setDate(d.getDate()+((6-d.getDay()+7)%7||7));
        const dateStr=d.toISOString().slice(0,10);
        let timeStr='19:30';
        try{const t=v.time.replace(' PM','').replace(' AM','');const[h,m]=t.split(':');let hr=parseInt(h);if(v.time.includes('PM')&&hr<12)hr+=12;timeStr=String(hr).padStart(2,'0')+':'+(m||'00');}catch(e){}
        const cat=_bfLang(_bfData.type).remCat;
        reminders.push({id:Date.now(),title:_bfData.name,date:dateStr,time:timeStr,cat,color:catColors[cat]||'#C4687A'});
        if(_bfData.transportBooked){
          reminders.push({id:Date.now()+1,title:'Cab to '+v.area+' · '+_bfData.driver.name,date:dateStr,time:String(parseInt(timeStr.split(':')[0])-1).padStart(2,'0')+':'+timeStr.split(':')[1],cat:'Cab pickup',color:'#3A6A8A'});
        }
        if(_bfData.hotelBooked){
          reminders.push({id:Date.now()+2,title:v.hotel+' check-in',date:dateStr,time:'15:00',cat:'Hotel check-in',color:'#C4687A'});
        }
        renderReminders();renderCal();updateStats();_saveState();
        _bfData.calAdded=true;
        if(btn){btn.innerHTML='✓ Added to planner';btn.disabled=true;btn.style.background='#16a34a';btn.style.color='#fff';btn.style.borderColor='#16a34a';}
        toast('✦ Added to your date planner — check the Planner tab');
      }

      // Wire quickBook to show booking flow after a short delay
      const _origQuickBook=quickBook;
      quickBook=function(name,type,amount){
        _origQuickBook(name,type,amount);
        if(type!=='cab'){setTimeout(()=>showBookingFlow(name,type,amount),400);}
      };

      // Wire updateStats to also call milestone stats
      const _origUpdateStats=updateStats;
      updateStats=function(){
        _origUpdateStats();
        updatePaidLastUI();
        updateMilestoneStats();
      };

      // ════════════════════════════════════════════════
      // ── ONBOARDING WALKTHROUGH ──
      // ════════════════════════════════════════════════
      const _OB_STEPS=[
        {
          target:()=>document.querySelector('.couple-pill'),
          title:'Your couple profile',
          body:'Tap here to set your preferences — cuisines, vibes, dietary needs and budget. The AI uses both your tastes to personalise every suggestion.',
          pos:'below'
        },
        {
          target:()=>document.getElementById('discover-filter-collapsed'),
          title:'Set the vibe',
          body:'Tap this bar to open the filter panel. Pick who the date is for, the vibe, your budget and when — then hit Curate to generate ideas.',
          pos:'below'
        },
        {
          target:()=>document.querySelector('.swipe-btn-x'),
          title:'Not for you? Skip it',
          body:'Tap the X to pass on this idea. It gets swiped away and the next suggestion slides in — no pressure, keep browsing.',
          pos:'above'
        },
        {
          target:()=>document.querySelector('.swipe-btn-heart'),
          title:'Save for later',
          body:'Tap the heart to save this idea to your Wishlist. You can come back to it anytime — great for dates you want to try but aren\'t ready to book yet.',
          pos:'above'
        },
        {
          target:()=>document.querySelector('.swipe-btn-book'),
          title:'Book it now',
          body:'Ready to go? Tap Book Now and we\'ll walk you through reserving the table, sorting transport and even finding a hotel — all in one flow.',
          pos:'above'
        }
      ];
      let _obStep=0;
      let _obOverlay=null;
      let _obTooltip=null;

      function _obShouldShow(){
        try{return !localStorage.getItem('t4t_ob_done');}catch(e){return true;}
      }
      function _obMarkDone(){
        try{localStorage.setItem('t4t_ob_done','1');}catch(e){}
      }

      function startOnboarding(){
        // Wait for swipe cards to render
        const check=setInterval(()=>{
          if(document.querySelector('.swipe-btn-book')){
            clearInterval(check);
            _obStep=0;
            _obOverlay=document.createElement('div');
            _obOverlay.className='ob-overlay';
            _obOverlay.onclick=()=>{};
            document.body.appendChild(_obOverlay);
            _obTooltip=document.createElement('div');
            _obTooltip.className='ob-tooltip';
            document.body.appendChild(_obTooltip);
            _obShow();
          }
        },300);
      }

      function _obShow(){
        if(_obStep>=_OB_STEPS.length){_obEnd();return;}
        const step=_OB_STEPS[_obStep];
        const el=step.target();
        if(!el){_obStep++;_obShow();return;}
        // Remove previous highlight
        document.querySelectorAll('.ob-highlight').forEach(e=>e.classList.remove('ob-highlight'));
        // Add highlight to target
        el.classList.add('ob-highlight');
        // Scroll into view
        el.scrollIntoView({behavior:'smooth',block:'center'});
        // Build dots
        const dots=_OB_STEPS.map((_,i)=>`<div class="ob-dot${i===_obStep?' active':''}"></div>`).join('');
        // Build tooltip content
        _obTooltip.innerHTML=`
          <div class="ob-tooltip-step">Step ${_obStep+1} of ${_OB_STEPS.length}</div>
          <div class="ob-tooltip-title">${step.title}</div>
          <div class="ob-tooltip-body">${step.body}</div>
          <div class="ob-tooltip-btns">
            <button class="ob-next" onclick="_obNext()">${_obStep===_OB_STEPS.length-1?'Got it, let\'s go!':'Next'}</button>
            <button class="ob-skip" onclick="_obEnd()">Skip tour</button>
            <div class="ob-dots">${dots}</div>
          </div>`;
        // Position tooltip with arrow
        setTimeout(()=>{
          const rect=el.getBoundingClientRect();
          const ttH=_obTooltip.offsetHeight;
          const ttW=_obTooltip.offsetWidth;
          let top,left,arrowClass;
          left=Math.max(20,Math.min(window.innerWidth-ttW-20,rect.left+(rect.width/2)-(ttW/2)));
          if(step.pos==='above'){
            top=rect.top-ttH-14;
            arrowClass='arrow-down';
            if(top<10){top=rect.bottom+14;arrowClass='arrow-up';}
          } else {
            top=rect.bottom+14;
            arrowClass='arrow-up';
            if(top+ttH>window.innerHeight-10){top=rect.top-ttH-14;arrowClass='arrow-down';}
          }
          _obTooltip.style.top=Math.max(10,top)+'px';
          _obTooltip.style.left=left+'px';
          // Set arrow class and position arrow horizontally to point at target center
          _obTooltip.classList.remove('arrow-up','arrow-down');
          _obTooltip.classList.add(arrowClass);
          const targetCenterX=rect.left+(rect.width/2);
          const tooltipLeft=parseFloat(_obTooltip.style.left);
          const arrowLeft=Math.max(20,Math.min(ttW-20,targetCenterX-tooltipLeft));
          _obTooltip.style.setProperty('--arrow-left',arrowLeft+'px');
          const arrow=_obTooltip.querySelector('::before')||null;
          // Use CSS custom property for arrow position
          _obTooltip.style.cssText+=';';
          const beforeRule=document.querySelector('.ob-tooltip.'+arrowClass+'::before');
          // Re-trigger animation
          _obTooltip.style.animation='none';
          void _obTooltip.offsetWidth;
          _obTooltip.style.animation='obPopIn 0.3s cubic-bezier(0.34,1.56,0.64,1)';
        },100);
      }

      function _obNext(){
        _obStep++;
        _obShow();
      }

      function _obEnd(){
        _obMarkDone();
        document.querySelectorAll('.ob-highlight').forEach(e=>e.classList.remove('ob-highlight'));
        if(_obOverlay){_obOverlay.remove();_obOverlay=null;}
        if(_obTooltip){_obTooltip.remove();_obTooltip=null;}
      }

      // Trigger onboarding after entering app from waitlist
      const _origEnterApp=enterApp;
      enterApp=function(){
        _origEnterApp();
        // Wait for landing to fade, then start onboarding on discover page
        setTimeout(()=>{
          go('discover',null);
          setTimeout(startOnboarding,800);
        },500);
      };

