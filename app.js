        // Safety: remove loading screen after 4s no matter what (CSS fallback fires at 7s as backup)
        setTimeout(()=>{const ls=document.getElementById('auth-loading-screen');if(ls){ls.style.opacity='0';setTimeout(()=>{if(ls.parentNode)ls.remove();},400);}},4000);

        // ════════════════════════════════════════════════
        // ── AUTH + USER IDENTITY (Supabase Password Auth) ──
        // ════════════════════════════════════════════════

        // Valid invite codes — still used as optional extra gate
        const _BETA_CODES=['T4T2026','TABLEFORTWO','EARLYACCESS','BETA2026','LONDON26'];

        // Auth state
        let _authUser=null;     // Supabase auth user object
        let _authLoading=true;  // true until we know auth state
        let _authHandled=false; // guard against double-init from listener + session check

        // Check if user has valid beta access (now backed by auth OR legacy code)
        function _hasBetaAccess(){
          if(_authUser)return true;
          try{return localStorage.getItem('t4t_beta_access')==='true';}catch(e){return false;}
        }
        function _grantBetaAccess(){
          try{localStorage.setItem('t4t_beta_access','true');}catch(e){}
        }

        // User profile stored in localStorage
        function _getUserProfile(){
          try{
            const p=localStorage.getItem('t4t_user_profile');
            return p?JSON.parse(p):null;
          }catch(e){return null;}
        }
        function _saveUserProfile(profile){
          try{localStorage.setItem('t4t_user_profile',JSON.stringify(profile));}catch(e){}
        }

        // Get display names (falls back to email prefix or generic label)
        function _userName(){const p=_getUserProfile();if(p?.name&&p.name!=='User')return p.name;if(_authUser?.email)return _authUser.email.split('@')[0];return p?.name||'';}
        function _partnerName(){const p=_getUserProfile();return p?.partner||'';}
        function _userInitials(){const n=_userName();if(!n)return '';const parts=n.trim().split(/\s+/);return parts.length>1?(parts[0][0]+parts[parts.length-1][0]).toUpperCase():n.slice(0,2).toUpperCase();}
        function _partnerInitials(){const n=_partnerName();const parts=n.trim().split(/\s+/);return parts.length>1?(parts[0][0]+parts[parts.length-1][0]).toUpperCase():n.slice(0,2).toUpperCase();}
        function _coupleShort(){const them=_partnerName();const you=_userName();if(!you)return '';if(!them)return you.split(' ')[0];return you.split(' ')[0][0]+' & '+them.split(' ')[0][0];}

        // Show invite code gate
        function _showBetaGate(){
          const overlay=document.getElementById('beta-gate-overlay');
          if(overlay)overlay.style.display='flex';
        }

        // Password sign-in (beta gate overlay)
        async function submitAuthGate(){
          const emailEl=document.getElementById('auth-email');
          const passEl=document.getElementById('auth-password');
          const errorEl=document.getElementById('auth-error');
          const btn=document.getElementById('auth-submit-btn');
          const email=(emailEl?.value||'').trim();
          const password=(passEl?.value||'');
          if(!email||!email.includes('@')){errorEl.textContent='Please enter a valid email address';errorEl.style.display='block';return;}
          if(password.length<6){errorEl.textContent='Password must be at least 6 characters';errorEl.style.display='block';return;}
          errorEl.style.display='none';
          btn.textContent='Signing in...';btn.disabled=true;
          const result=await _authSignIn(email,password);
          if(result.error){
            errorEl.textContent=result.error;errorEl.style.display='block';
            btn.textContent='Sign in';btn.disabled=false;
            return;
          }
          _trackEvent('sign_in_completed',{method:'password'});
        }

        function showForgotPassword(){
          document.getElementById('auth-form').style.display='none';
          document.getElementById('auth-forgot').style.display='block';
        }

        async function submitForgotPassword(){
          const emailEl=document.getElementById('auth-forgot-email');
          const errorEl=document.getElementById('auth-forgot-error');
          const btn=document.getElementById('auth-forgot-btn');
          const email=(emailEl?.value||'').trim();
          if(!email||!email.includes('@')){errorEl.textContent='Please enter a valid email';errorEl.style.display='block';return;}
          errorEl.style.display='none';
          btn.textContent='Sending...';btn.disabled=true;
          const result=await _authResetPassword(email);
          if(result.error){errorEl.textContent=result.error;errorEl.style.display='block';btn.textContent='Send reset link';btn.disabled=false;return;}
          document.getElementById('auth-forgot').style.display='none';
          document.getElementById('auth-reset-sent').style.display='block';
          document.getElementById('auth-reset-sent-email').textContent=email;
        }

        function submitBetaCode(){
          const input=document.getElementById('beta-code-input');
          const error=document.getElementById('beta-code-error');
          if(!input)return;
          const code=input.value.trim().toUpperCase();
          if(_BETA_CODES.includes(code)){
            _grantBetaAccess();
            try{localStorage.setItem('t4t_beta_code',code);}catch(e){}
            _trackEvent('sign_up_completed',{method:'beta_code',code:code});
            error.style.display='none';
            // Hide gate, show name entry
            document.getElementById('beta-gate-overlay').style.display='none';
            _showNameEntry();
          } else {
            error.style.display='block';
            input.style.borderColor='rgba(239,68,68,0.5)';
            input.value='';
            input.focus();
            setTimeout(()=>{input.style.borderColor='';},2000);
          }
        }

        // Show name entry modal (first-run only)
        function _showNameEntry(){
          const profile=_getUserProfile();
          if(profile)return; // already set up
          const overlay=document.getElementById('name-entry-overlay');
          if(overlay)overlay.style.display='flex';
        }

        function _generateHandle(name){
          const base=name.toLowerCase().replace(/[^a-z0-9]/g,'');
          const suffix=Math.floor(Math.random()*900)+100;
          return base+suffix;
        }

        // ── Handle uniqueness check (calls Supabase RPC) ──
        let _handleCheckTimer=null;
        let _handleAvailable=null; // null=unchecked, true=available, false=taken

        async function _checkHandleAvailable(handle){
          if(!handle||handle.length<3){_handleAvailable=null;return null;}
          if(!/^[a-z0-9_]{3,20}$/.test(handle)){_handleAvailable=null;return null;}
          if(!_sb){_handleAvailable=false;return false;}
          try{
            const rpcPromise=_sb.rpc('check_handle_available',{p_handle:'@'+handle});
            const timeoutPromise=new Promise((_,reject)=>setTimeout(()=>reject(new Error('Handle check timed out')),5000));
            const{data,error}=await Promise.race([rpcPromise,timeoutPromise]);
            if(error){
              console.warn('[T4T] RPC failed, falling back to direct query',error);
              try{
                const{data:existing}=await _sb.from('users').select('id').eq('handle','@'+handle).maybeSingle();
                const available=!existing;
                _handleAvailable=available;
                return available;
              }catch(e2){
                _handleAvailable=false;
                return false;
              }
            }
            _handleAvailable=!!data;
            return _handleAvailable;
          }catch(e){
            console.warn('[T4T] Handle check error/timeout:',e.message);
            try{
              const{data:existing}=await _sb.from('users').select('id').eq('handle','@'+handle).maybeSingle();
              const available=!existing;
              _handleAvailable=available;
              return available;
            }catch(e2){
              _handleAvailable=false;
              return false;
            }
          }
        }

        // Debounced live check — call from oninput on handle fields
        function _onHandleInput(el){
          el.value=el.value.replace(/[^a-zA-Z0-9_]/g,'').toLowerCase().slice(0,20);
          const handle=el.value;
          const feedback=el.parentElement.querySelector('.handle-feedback')||_createHandleFeedback(el);
          // Reset state
          _handleAvailable=null;
          // Client-side format validation (instant)
          if(!handle){feedback.textContent='';return;}
          if(handle.length<3){
            feedback.textContent='At least 3 characters';
            feedback.style.color='rgba(255,255,255,0.35)';
            return;
          }
          if(!/^[a-z0-9_]+$/.test(handle)){
            feedback.textContent='Letters, numbers and underscores only';
            feedback.style.color='rgba(239,68,68,0.7)';
            return;
          }
          if(handle.length>20){
            feedback.textContent='Max 20 characters';
            feedback.style.color='rgba(239,68,68,0.7)';
            return;
          }
          feedback.textContent='Checking...';
          feedback.style.color='rgba(255,255,255,0.35)';
          clearTimeout(_handleCheckTimer);
          _handleCheckTimer=setTimeout(async()=>{
            const available=await _checkHandleAvailable(handle);
            // Only update if the input hasn't changed since we started the check
            if(el.value===handle){
              if(available===null){
                // Format issue caught by _checkHandleAvailable
                feedback.textContent='Invalid handle format';
                feedback.style.color='rgba(239,68,68,0.7)';
              }else if(available){
                feedback.textContent='@'+handle+' is available';
                feedback.style.color='rgba(74,222,128,0.7)';
              }else{
                feedback.textContent='@'+handle+' is taken — try another';
                feedback.style.color='rgba(239,68,68,0.7)';
              }
            }
          },400);
        }

        function _createHandleFeedback(el){
          const fb=document.createElement('div');
          fb.className='handle-feedback';
          fb.style.cssText='font-size:11px;margin-top:5px;line-height:1.4;min-height:16px;transition:color 0.15s';
          el.parentElement.appendChild(fb);
          return fb;
        }

        function submitNameEntry(){
          const nameInput=document.getElementById('setup-your-name');
          const partnerInput=document.getElementById('setup-partner-name');
          const handleInput=document.getElementById('setup-handle');
          const yourName=(nameInput?.value||'').trim();
          const partnerName=(partnerInput?.value||'').trim();
          let handle=(handleInput?.value||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
          if(!yourName){toast('Please enter your name');nameInput?.focus();return;}
          // Auto-generate handle if empty
          if(!handle)handle=_generateHandle(yourName);
          handle='@'+handle;
          // Save handle
          _handles.user=handle;
          if(partnerName){_handles.partner='@'+_generateHandle(partnerName);}
          try{localStorage.setItem('t4t_handles',JSON.stringify(_handles));}catch(e){}
          _saveUserProfile({name:yourName,partner:partnerName||'',handle:handle,account_state:partnerName?'paired':'single',createdAt:new Date().toISOString()});
          document.getElementById('name-entry-overlay').style.display='none';
          // Update the UI with real names
          _applyUserNames();
          setSmartGreeting();
          // Show demo banner
          const db=document.getElementById('demo-banner');if(db)db.style.display='block';
          _trackEvent('user_setup',{name:yourName,partner:partnerName||''});
          toast('✦ Welcome, '+yourName+'!');
          // Trigger onboarding flow
          startOnboarding();
        }

        function skipNameEntry(){
          // Save default profile so we don't ask again (single by default)
          const fallbackName=_authUser?.email?.split('@')[0]||'';
          _saveUserProfile({name:fallbackName,partner:'',account_state:'single',createdAt:new Date().toISOString()});
          document.getElementById('name-entry-overlay').style.display='none';
          _applyUserNames();
        }

        // Demo label HTML — inserted into confirmation screens
        const _DEMO_LABEL='<div style="font-size:9px;color:rgba(201,168,76,0.35);font-weight:500;letter-spacing:0.5px;margin-bottom:6px">Beta — booking via partner site</div>';

        // Apply user names throughout the UI (handles single + paired modes)
        function _applyUserNames(){
          const you=_userName();const them=_partnerName();
          const yi=_userInitials();
          const hasParter=!!them&&them!=='Partner';
          const pi=hasParter?_partnerInitials():'';
          const profile=_getUserProfile()||{};
          const handle=profile.handle||_handles.user||'';
          // Profile pills — show name + handle
          document.querySelectorAll('.couple-name').forEach(el=>{
            el.textContent=hasParter?you+' & '+them:(you||'');
          });
          document.querySelectorAll('.profile-handle-display').forEach(el=>{
            el.textContent=handle||'';
          });
          document.querySelectorAll('.avatar-a').forEach(el=>el.textContent=yi);
          // Greeting — update if it still has a stale name
          const titleEl=document.getElementById('page-title');
          if(titleEl&&you){
            const txt=titleEl.textContent;
            const greetingMatch=txt.match(/^(Good morning|Good afternoon|Good evening|Evening|Morning|Afternoon|Hey|Hi),?\s+(.+)/i);
            if(greetingMatch&&greetingMatch[2]!==you.split(' ')[0]){
              titleEl.textContent=greetingMatch[1]+', '+you.split(' ')[0];
            }
          }
          // Profile page names
          document.querySelectorAll('.profile-half').forEach((half,i)=>{
            if(i===1&&!hasParter){half.style.display='none';return;}
            if(i===1)half.style.display='';
            const nameEl=half.querySelector('[style*="font-size:14px"][style*="font-weight:500"]');
            if(nameEl){nameEl.textContent=i===0?you:(them||'Partner');}
            const llDesc=half.querySelector('[style*="How"]');
            if(llDesc&&i===0)llDesc.textContent='How '+you+' feels most loved — shapes what kind of date lands best';
            if(llDesc&&i===1&&hasParter)llDesc.textContent='How '+them+' feels most loved — shapes what kind of date lands best';
          });
          // Profile avatar colors
          document.querySelectorAll('.profile-avatar').forEach((av,i)=>{
            if(i===0)av.textContent=yi;
            if(i===1&&hasParter)av.textContent=pi;
          });
          // Pairing status
          const pairingStatus=document.getElementById('pairing-status');
          if(pairingStatus){
            if(hasParter){
              pairingStatus.innerHTML='<span style="color:var(--primary);font-weight:600">Currently paired with '+them+'</span> · planning together';
            }else{
              pairingStatus.innerHTML='<span style="color:var(--primary);font-weight:600">Planning solo</span> · finding things just for you';
            }
          }
          // Partner handle row — hide if no partner
          const _phr=document.getElementById('partner-handle-row');
          if(_phr)_phr.style.display=hasParter?'flex':'none';
          // What's Hot subtitle
          const whSub=document.querySelector('.wh-section-sub');
          if(whSub){
            whSub.textContent=hasParter?'Curated for '+you+' & '+them+' · happening in London this week':'Curated for you · happening in London this week';
          }
          // Auth status display
          const authStatus=document.getElementById('auth-status-display');
          if(authStatus){
            if(_authUser){
              authStatus.innerHTML='Signed in as <strong style="color:var(--primary)">'+_authUser.email+'</strong>';
            } else {
              authStatus.textContent='Not signed in';
            }
          }
          // Surprise overlay
          const sovTitle=document.querySelector('#sov-overlay [style*="font-size:18px"]');
          if(sovTitle&&hasParter)sovTitle.textContent=you+' has planned something special';
          // Sophie vote overlay headline
          const svHeadline=document.getElementById('sv-headline');
          if(svHeadline&&hasParter)svHeadline.textContent=you+' wants to know…';
        }

        // Reset demo — clears all local data and reloads
        function resetDemo(){
          _trackEvent('demo_reset',{user:_userName()});
          try{
            localStorage.removeItem('t4t_user_profile');
            localStorage.removeItem('t4t_beta_access');
            localStorage.removeItem('t4t_user_id');
            localStorage.removeItem('t4t_bk');
            localStorage.removeItem('t4t_rm');
            localStorage.removeItem('t4t_handles');
            localStorage.removeItem('t4t_beta_code');
          }catch(e){}
          setTimeout(()=>window.location.reload(),300);
        }

        // ── Beta gate check on page load ──
        (function _betaInit(){
          const params=new URLSearchParams(window.location.search);
          // Allow ?code=XYZ in URL to auto-validate
          const urlCode=(params.get('code')||'').toUpperCase();
          if(urlCode&&_BETA_CODES.includes(urlCode)){
            _grantBetaAccess();
            // Clean URL
            const url=new URL(window.location);url.searchParams.delete('code');
            history.replaceState(null,'',url.toString());
          }
          // ?app param is handled after auth resolves — don't skip landing here
        })();

        var _authLinkError=false;

        // Capture inbound UTM/referrer for acquisition tracking
        (function(){
          try{
            const p=new URLSearchParams(window.location.search);
            const src=p.get('utm_source')||'direct';
            const med=p.get('utm_medium')||'';
            const cam=p.get('utm_campaign')||'';
            const ref=document.referrer?new URL(document.referrer).hostname:'';
            const source=src!=='direct'?src:ref.includes('instagram')?'instagram':ref.includes('tiktok')?'tiktok':ref.includes('google')?'google':'direct';
            sessionStorage.setItem('t4t_source',source);
            sessionStorage.setItem('t4t_medium',med);
            sessionStorage.setItem('t4t_campaign',cam);
            sessionStorage.setItem('t4t_referrer',ref);
          }catch(e){}
        })();

        // ════════════════════════════════════════════════
        // ── SUPABASE CLIENT + AUTH ──
        // ════════════════════════════════════════════════

        // Public anon key (safe to expose — RLS protects data)
        const _SUPABASE_URL='https://wjezqqtkxhzydyzxocow.supabase.co';
        const _SUPABASE_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndqZXpxcXRreGh6eWR5enhvY293Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MzQzNTUsImV4cCI6MjA5NTExMDM1NX0.gQTjQTBD9cpgWq_ozYisXA5N6tSXXGbRzvi1zlD-kGQ';

        let _sb=null;
        let _sbUserId=null;
        let _sbReady=false;
        let _syncQueue=[];
        const _SYNC_DEBOUNCE=1500;
        let _syncTimers={};

        // Init Supabase client
        function _sbInit(){
          if(!_SUPABASE_URL||!_SUPABASE_KEY){console.log('[T4T] Supabase not configured');return;}
          try{
            _sb=window.supabase.createClient(_SUPABASE_URL,_SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
            console.log('[T4T] Supabase connected');
          }catch(e){console.warn('[T4T] Supabase init failed',e);_sb=null;setTimeout(()=>toast('Working offline — your data is saved locally'),1500);}
        }
        _sbInit();

        // ── Handle expired/invalid auth link fragments ──
        // Runs AFTER _sbInit so Supabase can parse valid access_token hashes first.
        // Only strips the hash when it contains an error and no valid token.
        (function _handleAuthError(){
          const hash=window.location.hash;
          if(!hash||!hash.includes('error='))return;
          if(hash.includes('access_token='))return;
          try{
            const params=new URLSearchParams(hash.substring(1));
            const err=params.get('error')||'';
            const code=params.get('error_code')||'';
            if(err||code){
              history.replaceState(null,'',window.location.pathname+window.location.search);
              _authLinkError=true;
              console.warn('[T4T] Auth link error:',err,code);
            }
          }catch(e){}
        })();

        // ── Venue overrides (Supabase-backed, written by audit.html) ──
        let _venueOverrides=new Map();
        let _venueOverridesReady=false;
        async function _loadVenueOverrides(){
          if(!_sb){_venueOverridesReady=true;return;}
          try{
            const{data,error}=await _sb.from('venue_overrides').select('slug,url,link_status');
            if(!error&&data&&data.length){
              data.forEach(row=>{_venueOverrides.set(row.slug,row);});
              console.log('[T4T] Loaded '+data.length+' venue overrides');
            }
          }catch(e){console.warn('[T4T] Venue overrides fetch failed (non-fatal)',e);}
          _venueOverridesReady=true;
        }
        _loadVenueOverrides();

        // ── Password Auth ──
        async function _authSignUp(email,password){
          if(!_sb)return{error:'Supabase not configured'};
          try{
            const{data,error}=await _sb.auth.signUp({email,password});
            if(error){console.warn('[T4T] Sign-up error:',error);return{error:error.message};}
            return{success:true,data};
          }catch(e){console.warn('[T4T] Sign-up exception:',e);return{error:'Something went wrong. Please try again.'};}
        }

        async function _authSignIn(email,password){
          if(!_sb)return{error:'Supabase not configured'};
          try{
            const{data,error}=await _sb.auth.signInWithPassword({email,password});
            if(error){console.warn('[T4T] Sign-in error:',error);return{error:error.message};}
            return{success:true,data};
          }catch(e){console.warn('[T4T] Sign-in exception:',e);return{error:'Something went wrong. Please try again.'};}
        }

        async function _authResetPassword(email){
          if(!_sb)return{error:'Supabase not configured'};
          try{
            const{error}=await _sb.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/?reset'});
            if(error){return{error:error.message};}
            return{success:true};
          }catch(e){return{error:'Something went wrong. Please try again.'};}
        }

        async function signOut(){
          if(!_sb)return;
          _trackEvent('sign_out',{user:_userName()});
          await _sb.auth.signOut();
          _authUser=null;_sbUserId=null;_sbReady=false;
          // Clear session data from localStorage (user data persists in Supabase)
          try{
            localStorage.removeItem('t4t_user_profile');
            localStorage.removeItem('t4t_beta_access');
            localStorage.removeItem('t4t_bk');
            localStorage.removeItem('t4t_rm');
            localStorage.removeItem('t4t_handles');
            localStorage.removeItem('t4t_venue_cache');
          }catch(e){}
          location.href='/';
        }

        // Get the current authenticated user's DB row ID + restore full profile
        async function _sbEnsureUser(){
          if(!_sb||!_authUser)return null;
          try{
            const{data}=await _sb.from('users').select('id,name,partner_name,email,handle,account_state,city,onboarding_completed,preferences').eq('auth_id',_authUser.id).maybeSingle();
            if(data){
              _sbUserId=data.id;
              // Restore full profile to localStorage (DB is source of truth)
              const restoredProfile={
                name:data.name||_authUser.email?.split('@')[0]||'User',
                partner:data.partner_name||'',
                handle:data.handle||_handles.user||'',
                email:data.email||_authUser.email||'',
                account_state:data.account_state||'single',
                city:data.city||'London',
                onboarding_completed:!!data.onboarding_completed,
                preferences:data.preferences||{},
                createdAt:_authUser.created_at
              };
              // Restore handle into _handles
              if(data.handle){_handles.user=data.handle;try{localStorage.setItem('t4t_handles',JSON.stringify(_handles));}catch(e){}}
              _saveUserProfile(restoredProfile);
              // Restore in-memory preferences for plan engine
              if(data.onboarding_completed&&data.preferences&&typeof data.preferences==='object'){
                Object.assign(_obPrefs,data.preferences);
                // Apply preference-driven state
                if(_obPrefs.date_mode)_pairingMode=_obPrefs.date_mode==='couple'?'couple':_obPrefs.date_mode;
                if(_obPrefs.energy_level)_moodEnergy=_obPrefs.energy_level==='low'?'tired':_obPrefs.energy_level==='high'?'energetic':'moderate';
                if(_obPrefs.budget){
                  // Activate matching budget pill (pills replaced old slider)
                  _activeBudgetBand=_obPrefs.budget;
                  const pillEl=document.querySelector(`#budget-pills [data-budget="${_obPrefs.budget}"]`);
                  if(pillEl){document.querySelectorAll('#budget-pills .occasion-chip').forEach(c=>c.classList.remove('active'));pillEl.classList.add('active');}
                }
              }
              // Set pairing mode from account_state
              if(data.account_state==='paired'&&data.partner_name)_pairingMode='couple';
              else if(!_obPrefs.date_mode)_pairingMode='solo';
              // Update last_seen + sync handle if not yet in DB (fire and forget)
              const _updateFields={last_seen_at:new Date().toISOString()};
              const _localHandle=_getUserProfile()?.handle||_handles.user||'';
              if(_localHandle&&!data.handle)_updateFields.handle=_localHandle;
              _sb.from('users').update(_updateFields).eq('id',data.id).then(()=>{});
              console.log('[T4T] Profile restored from DB:',data.account_state,data.onboarding_completed?'onboarded':'not onboarded');
              return data.id;
            }
            // User row should have been created by the trigger, but handle edge case
            const profile=_getUserProfile()||{name:_authUser.email?.split('@')[0]||'User',partner:''};
            const{data:newUser,error}=await _sb.from('users').insert({
              auth_id:_authUser.id,
              email:_authUser.email||'',
              name:profile.name,
              handle:profile.handle||_handles.user||'',
              partner_name:profile.partner||'',
              account_state:(profile.partner&&profile.partner!=='Partner')?'paired':'single',
              city:'London'
            }).select('id').single();
            if(error){console.warn('[T4T] User create failed',error);return null;}
            _sbUserId=newUser.id;
            return newUser.id;
          }catch(e){console.warn('[T4T] User ensure failed',e);return null;}
        }

        // Listen for auth state changes
        function _setupAuthListener(){
          if(!_sb)return;
          _sb.auth.onAuthStateChange(async(event,session)=>{
            console.log('[T4T Auth]',event,session?.user?.email);
            if(event==='SIGNED_OUT'){location.href='/';return;}
            if(event==='PASSWORD_RECOVERY'&&session?.user){
              _authUser=session.user;
              _authLoading=false;
              const ls=document.getElementById('auth-loading-screen');if(ls)ls.remove();
              const lp=document.getElementById('landing');if(lp){lp.style.display='none';lp.style.visibility='hidden';}
              const appEl=document.querySelector('.app');if(appEl)appEl.style.display='none';
              _showPasswordReset();
              return;
            }
            if(session?.user){
              if(_authHandled&&_authUser?.id===session.user.id)return;
              _authHandled=true;
              _authUser=session.user;
              _grantBetaAccess();
              if(event==='SIGNED_IN')_trackEvent('sign_up_completed',{method:'password'});
              // Hide landing, show app
              const lp=document.getElementById('landing');
              if(lp){lp.style.display='none';lp.style.visibility='hidden';lp.style.pointerEvents='none';lp.style.zIndex='-1';}
              const appEl=document.querySelector('.app');if(appEl)appEl.style.display='';
              const ag=document.getElementById('beta-gate-overlay');if(ag)ag.style.display='none';
              const ne=document.getElementById('name-entry-overlay');if(ne)ne.style.display='none';
              _authLoading=false;
              // Sync DB — check if profile exists with name + handle
              try{
                const uid=await _sbEnsureUser();
                if(uid){await _sbLoadState();}
              }catch(e){console.warn('[T4T] DB sync failed (non-fatal)',e);}
              const ls=document.getElementById('auth-loading-screen');if(ls)ls.remove();
              // Check profile completeness — route to profile completion or app
              const _prof=_getUserProfile();
              const hasProfile=_prof&&_prof.name&&_prof.name!=='User'&&_prof.handle;
              if(!hasProfile){
                _showProfileCompletion();
                return;
              }
              // Existing user with complete profile — enter app directly
              _applyUserNames();
              setSmartGreeting();
              const db=document.getElementById('demo-banner');if(db)db.style.display='block';
              const _authIntent=(()=>{try{const v=localStorage.getItem('t4t_auth_intent');localStorage.removeItem('t4t_auth_intent');return v;}catch(e){return null;}})();
              if(_authIntent==='login'||_prof?.onboarding_completed){
                setTimeout(()=>generateSuggestions(true),300);
              }else{
                setTimeout(startOnboarding,600);
              }
            } else {
              _authUser=null;_sbUserId=null;_sbReady=false;
              _authLoading=false;
              _showLoginScreen();
            }
          });
        }
        _setupAuthListener();

        function _showLoginScreen(){
          const ls=document.getElementById('auth-loading-screen');if(ls)ls.remove();
          document.documentElement.classList.remove('skip-lp');
          const lp=document.getElementById('landing');
          if(lp){lp.style.display='';lp.style.visibility='';lp.style.pointerEvents='';lp.style.zIndex='';}
          const appEl=document.querySelector('.app');if(appEl)appEl.style.display='none';
          if(_authLinkError){
            _authLinkError=false;
            const hint=document.getElementById('lp-auth-hint');
            if(hint){hint.textContent='That link has expired — please sign in with your password.';hint.style.display='block';hint.style.color='rgba(250,204,21,0.85)';}
          }
        }

        function _showPasswordReset(){
          const ov=document.getElementById('password-reset-overlay');
          if(ov)ov.style.display='flex';
        }
        window.submitPasswordReset=async function(){
          const pw=document.getElementById('pr-password').value.trim();
          const errEl=document.getElementById('pr-error');
          const okEl=document.getElementById('pr-success');
          const btn=document.getElementById('pr-submit');
          errEl.style.display='none';okEl.style.display='none';
          if(pw.length<6){errEl.textContent='Password must be at least 6 characters.';errEl.style.display='block';return;}
          btn.disabled=true;btn.textContent='Updating...';
          try{
            const{error}=await _sb.auth.updateUser({password:pw});
            if(error){errEl.textContent=error.message;errEl.style.display='block';btn.disabled=false;btn.textContent='Update password';return;}
            okEl.textContent='Password updated — signing you in...';okEl.style.display='block';
            setTimeout(()=>{location.reload();},1500);
          }catch(e){errEl.textContent='Something went wrong. Please try again.';errEl.style.display='block';btn.disabled=false;btn.textContent='Update password';}
        };

        // Check initial session on page load
        (async function _checkSession(){
          if(!_sb){_showLoginScreen();return;}
          try{
            const{data:{session}}=await _sb.auth.getSession();
            if(session?.user){
              _authUser=session.user;
              _grantBetaAccess();
              // Hide landing immediately if already signed in
              const lp=document.getElementById('landing');
              if(lp){lp.style.display='none';lp.style.visibility='hidden';lp.style.pointerEvents='none';lp.style.zIndex='-1';}
              const appEl=document.querySelector('.app');if(appEl)appEl.style.display='';
              // For the initial render, just check localStorage to avoid flash
              const _prof=_getUserProfile();
              const hasProfile=_prof&&_prof.name&&_prof.name!=='User'&&_prof.handle;
              if(hasProfile){
                const ls=document.getElementById('auth-loading-screen');if(ls)ls.remove();
                _applyUserNames();
                setSmartGreeting();
                const db=document.getElementById('demo-banner');if(db)db.style.display='block';
              }
              // If no profile, keep loading screen visible — onAuthStateChange will resolve
            }else{
              _showLoginScreen();
            }
          }catch(e){
            console.warn('[T4T] Session check failed',e);
            _showLoginScreen();
          }
          _authLoading=false;
        })();

        // Load all state from Supabase → merge into local vars
        async function _sbLoadState(){
          if(!_sb||!_sbUserId)return;
          try{
            const{data,error}=await _sb.from('user_state').select('state_key,state_data').eq('user_id',_sbUserId);
            if(error){console.warn('[T4T] State load failed',error);return;}
            if(!data||!data.length)return;
            const stateMap={};
            data.forEach(row=>{stateMap[row.state_key]=row.state_data;});
            // Merge into app variables (Supabase wins if it has data, otherwise keep localStorage)
            if(stateMap.bookings&&Array.isArray(stateMap.bookings)&&stateMap.bookings.length){bookings=stateMap.bookings;}
            if(stateMap.reminders&&Array.isArray(stateMap.reminders)&&stateMap.reminders.length){reminders=stateMap.reminders;}
            if(stateMap.wishlist&&Array.isArray(stateMap.wishlist)&&stateMap.wishlist.length){_wishlist=stateMap.wishlist;}
            if(stateMap.journal&&Array.isArray(stateMap.journal)&&stateMap.journal.length){_journal=stateMap.journal;}
            if(stateMap.handles&&typeof stateMap.handles==='object'){
              const hData=stateMap.handles;
              if(hData.jamie&&!hData.user){hData.user=hData.jamie;delete hData.jamie;}
              if(hData.sophie&&!hData.partner){hData.partner=hData.sophie;delete hData.sophie;}
              _handles=Object.assign(_handles,hData);
            }
            // Restore preferences from user_state as fallback (belt-and-suspenders with users.preferences)
            if(stateMap.preferences&&typeof stateMap.preferences==='object'){
              const prof=_getUserProfile()||{};
              // Only apply if profile doesn't already have preferences from _sbEnsureUser
              if(!prof.preferences||!Object.keys(prof.preferences).length){
                prof.preferences=stateMap.preferences;
                prof.onboarding_completed=true;
                _saveUserProfile(prof);
                Object.assign(_obPrefs,stateMap.preferences);
                if(_obPrefs.date_mode)_pairingMode=_obPrefs.date_mode==='couple'?'couple':_obPrefs.date_mode;
                console.log('[T4T] Preferences restored from user_state fallback');
              }
            }
            // Re-render everything with loaded data
            _applyUserNames();
            renderBookings();renderReminders?.();renderCal?.();updateStats();renderWishlist?.();renderJournal?.();renderHubWishlist?.();
            console.log('[T4T] State loaded from Supabase');
            _sbReady=true;
          }catch(e){console.warn('[T4T] State load error',e);}
        }

        // Save a specific state key to Supabase (debounced)
        function _sbSaveState(key,data){
          if(!_sb||!_sbUserId)return;
          clearTimeout(_syncTimers[key]);
          _syncTimers[key]=setTimeout(async()=>{
            try{
              await _sb.rpc('upsert_state',{p_user_id:_sbUserId,p_key:key,p_data:data});
            }catch(e){console.warn('[T4T] Sync failed for',key,e);}
          },_SYNC_DEBOUNCE);
        }

        // Convenience: save all app state
        function _sbSyncAll(){
          _sbSaveState('bookings',bookings);
          _sbSaveState('reminders',reminders);
          _sbSaveState('wishlist',_wishlist);
          _sbSaveState('journal',_journal);
          _sbSaveState('handles',_handles);
        }

        // ── Analytics layer ──
        // PostHog-compatible: swap _analytics.provider to 'posthog' when ready.
        // Event naming: snake_case, past tense for completed actions, present for views.
        // Properties: always include user_id, plan_id where relevant, provider on bookings.
        const _analytics={
          provider:'supabase', // 'supabase' | 'posthog'
          _anonId:null,
          _getAnonId(){
            if(this._anonId)return this._anonId;
            try{this._anonId=localStorage.getItem('t4t_anon_id');if(!this._anonId){this._anonId='anon_'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);localStorage.setItem('t4t_anon_id',this._anonId);}}catch(e){this._anonId='anon_'+Date.now().toString(36);}
            return this._anonId;
          },
          track(event,props){
            const p=Object.assign({},props||{});
            p.$user_id=_sbUserId||null;
            p.$anon_id=this._getAnonId();
            p.$timestamp=new Date().toISOString();
            console.log('[T4T]',event,p);
            const _essentialEvents=new Set(['sign_up_started','sign_up_completed','sign_out','account_deletion_requested','error_state_seen','page_view','signup_source']);
            const needsConsent=!_essentialEvents.has(event);
            if(needsConsent&&!_hasAnalyticsConsent())return;
            if(this.provider==='supabase'&&_sb){
              try{_sb.from('events').insert({user_id:_sbUserId||null,event_type:event,event_data:p}).then(()=>{}).catch(()=>{});}catch(e){}
            }
            // PostHog — uncomment when SDK is loaded
            // if(this.provider==='posthog'&&window.posthog){
            //   window.posthog.capture(event,p);
            // }
          }
        };
        // Backward-compatible wrapper
        function _trackEvent(type,data){_analytics.track(type,data);}

        // ════════════════════════════════════════════════
        // ── COOKIE / ANALYTICS CONSENT ──
        // ════════════════════════════════════════════════
        // Consent states: null (not yet chosen), 'accepted', 'rejected'
        // Essential storage (auth, profile, app state) always works.
        // Non-essential (Vercel Insights, Sentry, product events to DB) requires consent.

        function _getConsent(){
          try{return localStorage.getItem('t4t_cookie_consent');}catch(e){return null;}
        }
        function _setConsent(val){
          try{localStorage.setItem('t4t_cookie_consent',val);}catch(e){}
        }
        function _hasAnalyticsConsent(){return _getConsent()==='accepted';}

        // Load optional analytics scripts only after consent
        function _loadOptionalAnalytics(){
          // Vercel Insights
          if(!document.getElementById('vercel-insights-script')){
            const s=document.createElement('script');
            s.id='vercel-insights-script';
            s.src='/_vercel/insights/script.js';
            s.defer=true;
            document.head.appendChild(s);
          }
          // Sentry (only if DSN is configured)
          if(typeof Sentry!=='undefined'&&!Sentry.isInitialized?.()){
            _initSentry();
          }
          console.log('[T4T] Optional analytics loaded (consent given)');
        }

        // Remove/disable optional analytics
        function _disableOptionalAnalytics(){
          const vs=document.getElementById('vercel-insights-script');
          if(vs)vs.remove();
          console.log('[T4T] Optional analytics disabled');
        }

        // Show consent banner
        function _showConsentBanner(){
          if(document.getElementById('cookie-consent-banner'))return;
          const banner=document.createElement('div');
          banner.id='cookie-consent-banner';
          banner.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:10000;background:#1A1917;border-top:0.5px solid rgba(201,168,76,0.2);padding:16px 20px;display:flex;flex-direction:column;gap:12px;align-items:center;animation:slideUpBanner 0.3s ease';
          banner.innerHTML=`
            <div style="max-width:600px;width:100%;text-align:center">
              <div style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.6;margin-bottom:12px">We use essential storage to make the app work. We also use optional analytics to understand how features are used and fix bugs. <a href="cookies.html" style="color:#C9A84C;text-decoration:underline" target="_blank">Learn more</a></div>
              <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                <button onclick="_acceptConsent()" style="padding:10px 24px;background:#C9A84C;color:#0E0D0B;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Accept analytics</button>
                <button onclick="_rejectConsent()" style="padding:10px 24px;background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.5);border:0.5px solid rgba(255,255,255,0.1);border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;font-family:inherit">Reject</button>
              </div>
            </div>`;
          document.body.appendChild(banner);
        }

        function _hideConsentBanner(){
          const b=document.getElementById('cookie-consent-banner');
          if(b)b.remove();
        }

        function _acceptConsent(){
          _setConsent('accepted');
          _hideConsentBanner();
          _loadOptionalAnalytics();
          toast('Analytics enabled — you can change this in Preferences');
        }

        function _rejectConsent(){
          _setConsent('rejected');
          _hideConsentBanner();
          _disableOptionalAnalytics();
        }

        // Open privacy settings (from Preferences page or anywhere)
        function openPrivacySettings(){
          const current=_getConsent();
          const isAccepted=current==='accepted';
          const ov=document.getElementById('bf-overlay');
          const el=document.getElementById('bf-content');
          if(!ov||!el)return;
          el.innerHTML=`
            <div style="padding:8px 0">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
                <div style="font-size:16px;font-weight:700;color:#fff">Privacy settings</div>
                <button class="btn btn-sm" onclick="closeBf()" style="font-size:11px;padding:4px 10px">Done</button>
              </div>
              <div style="margin-bottom:16px">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:8px">
                  <div>
                    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.8)">Essential storage</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px">Sign-in, preferences, saved plans</div>
                  </div>
                  <div style="font-size:11px;font-weight:600;color:rgba(74,222,128,0.7)">Always on</div>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:14px;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px">
                  <div>
                    <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.8)">Analytics & error tracking</div>
                    <div style="font-size:11px;color:rgba(255,255,255,0.35);margin-top:2px">Vercel Insights, Sentry, usage events</div>
                  </div>
                  <button onclick="this.textContent=this.textContent==='On'?'Off':'On';this.style.background=this.textContent==='On'?'rgba(74,222,128,0.15)':'rgba(255,255,255,0.06)';this.style.color=this.textContent==='On'?'#4ADE80':'rgba(255,255,255,0.4)';this.style.borderColor=this.textContent==='On'?'rgba(74,222,128,0.3)':'rgba(255,255,255,0.1)'" id="consent-toggle-btn" style="padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;border:0.5px solid ${isAccepted?'rgba(74,222,128,0.3)':'rgba(255,255,255,0.1)'};background:${isAccepted?'rgba(74,222,128,0.15)':'rgba(255,255,255,0.06)'};color:${isAccepted?'#4ADE80':'rgba(255,255,255,0.4)'};font-family:inherit">${isAccepted?'On':'Off'}</button>
                </div>
              </div>
              <button class="btn btn-rose" style="width:100%;justify-content:center;padding:12px;border-radius:10px;font-size:13px;font-weight:600" onclick="_savePrivacySettings()">Save preferences</button>
              <div style="display:flex;gap:12px;justify-content:center;margin-top:14px;font-size:11px">
                <a href="privacy.html" target="_blank" style="color:rgba(255,255,255,0.35)">Privacy policy</a>
                <a href="cookies.html" target="_blank" style="color:rgba(255,255,255,0.35)">Cookie notice</a>
                <a href="terms.html" target="_blank" style="color:rgba(255,255,255,0.35)">Terms</a>
              </div>
            </div>`;
          ov.style.display='flex';document.body.style.overflow='hidden';
        }

        function _savePrivacySettings(){
          const btn=document.getElementById('consent-toggle-btn');
          const isOn=btn&&btn.textContent==='On';
          if(isOn){_setConsent('accepted');_loadOptionalAnalytics();}
          else{_setConsent('rejected');_disableOptionalAnalytics();}
          closeBf();
          toast(isOn?'Analytics enabled':'Analytics disabled');
        }

        // Init consent on page load
        (function _initConsent(){
          const consent=_getConsent();
          if(consent==='accepted'){_loadOptionalAnalytics();}
          else if(!consent){
            // Show banner after a short delay (don't interrupt first paint)
            setTimeout(_showConsentBanner,1500);
          }
          // If 'rejected', do nothing — scripts stay unloaded
        })();

        // ════════════════════════════════════════════════
        // ── ACCOUNT DELETION ──
        // ════════════════════════════════════════════════
        function requestAccountDeletion(){
          const ov=document.getElementById('bf-overlay');
          const el=document.getElementById('bf-content');
          if(!ov||!el)return;
          el.innerHTML=`
            <div style="padding:8px 0;text-align:center">
              <div style="font-size:24px;margin-bottom:12px">&#9888;</div>
              <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px">Delete your account?</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.45);line-height:1.6;margin-bottom:20px">This will permanently delete your profile, preferences, saved plans, wishlist, journal entries, and all usage data. This cannot be undone.</div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <button onclick="_confirmDeleteAccount()" style="padding:12px;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.3);border-radius:10px;color:#EF4444;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Yes, delete my account</button>
                <button onclick="closeBf()" style="padding:12px;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:10px;color:rgba(255,255,255,0.5);font-size:13px;cursor:pointer;font-family:inherit">Cancel</button>
              </div>
            </div>`;
          ov.style.display='flex';document.body.style.overflow='hidden';
        }

        async function _confirmDeleteAccount(){
          const el=document.getElementById('bf-content');
          if(el)el.innerHTML='<div style="text-align:center;padding:40px 0"><div class="spinner" style="margin:0 auto 12px"></div><div style="font-size:13px;color:rgba(255,255,255,0.4)">Deleting your data...</div></div>';
          _trackEvent('account_deletion_requested',{user:_userName()});
          // Delete from Supabase
          if(_sb&&_sbUserId){
            try{
              // Delete user_state rows
              await _sb.from('user_state').delete().eq('user_id',_sbUserId);
              // Delete events
              await _sb.from('events').delete().eq('user_id',_sbUserId);
              // Delete user row
              await _sb.from('users').delete().eq('id',_sbUserId);
            }catch(e){console.warn('[T4T] Deletion error (will complete via support):',e);}
          }
          // Clear all local data
          try{
            const keys=['t4t_user_profile','t4t_beta_access','t4t_user_id','t4t_bk','t4t_rm',
              't4t_handles','t4t_beta_code','t4t_anon_id','t4t_venue_cache','t4t_plan_states','t4t_cookie_consent'];
            keys.forEach(k=>localStorage.removeItem(k));
          }catch(e){}
          // Sign out from Supabase auth
          if(_sb){try{await _sb.auth.signOut();}catch(e){}}
          // Show confirmation
          if(el)el.innerHTML=`
            <div style="text-align:center;padding:20px 0">
              <div style="font-size:24px;margin-bottom:12px">&#10003;</div>
              <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px">Account deleted</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.45);line-height:1.6;margin-bottom:20px">Your data has been removed. If anything was missed, email <a href="mailto:privacy@tablefortwo.uk" style="color:#C9A84C">privacy@tablefortwo.uk</a> and we'll ensure full deletion within 30 days.</div>
              <button onclick="window.location.href='index.html'" style="padding:12px 24px;background:#C9A84C;color:#0E0D0B;border:none;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Done</button>
            </div>`;
        }

        // Bootstrap: connect user + load state on page load
        (async function _sbBootstrap(){
          if(!_sb)return;
          const uid=await _sbEnsureUser();
          if(uid){await _sbLoadState();}
        })();

        const TITLES={discover:'Discover',profiles:'Preferences',restaurants:'Dining',experiences:'Experiences',hotels:'Stays',cabs:'Getting there',planner:'Planner','whats-hot':"What's On",bookings:'Your dates',journal:'Journal',wishlist:'Saved'};
        const SUBS={discover:'Chosen for your shared taste',profiles:'What shapes your recommendations',restaurants:'Find and reserve a table',experiences:'Activities, culture and things to do',hotels:'Stays and getaways',cabs:'Compare routes and book transport',planner:'Upcoming dates, reminders and calendar','whats-hot':'Trending in London this week',bookings:'Confirmed, upcoming and past',journal:'Notes and ratings from your dates',wishlist:'Ideas you want to come back to'};

        let bookings=[];
        let reminders=[];
        let calMonth=new Date(2026,3,1);
        let selectedDay=null;
        let activeFilter='all';
        let _handles={user:'',partner:''};
        let _connectedHandles=[];

        const catColors={'Dinner reservation':'#C4687A','Experience / activity':'#6B4C7A','Hotel check-in':'#C4687A','Hotel check-out':'#8B3A4A','Cab pickup':'#3A6A8A','Personal':'#5A7A5A'};

        function openMoreSheet(){
          const ov=document.getElementById('more-sheet-overlay');
          if(ov){ov.style.display='block';document.body.style.overflow='hidden';}
        }
        function closeMoreSheet(){
          const ov=document.getElementById('more-sheet-overlay');
          if(ov){ov.style.display='none';document.body.style.overflow='';}
        }

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
          if(id==='restaurants')_renderEatTab();
          if(id==='experiences')_renderActTab();
          // scroll content back to top on page change
          const _contentEl=document.querySelector('.content');
          if(_contentEl)_contentEl.scrollTo({top:0,behavior:'smooth'});
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

        function toast(msg){const t=document.getElementById('toast');t.innerHTML=msg;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),3000);}
        function toggleTag(el){el.classList.toggle('on');}
        function switchTab(el,panelId){
          const tabs=el.parentElement.querySelectorAll('.tab');
          tabs.forEach(t=>t.classList.remove('active'));el.classList.add('active');
          ['rest-find','rest-featured'].forEach(id=>{const p=document.getElementById(id);if(p)p.style.display='none';});
          const tgt=document.getElementById(panelId);if(tgt)tgt.style.display='block';
        }

        function savePref(){
          _trackEvent('preferences_updated',{user:_userName()});
          startOnboarding();
          toast('Update your preferences');
        }

        // ── @handle system ──
        const _DEMO_HANDLES={
          '@alex4291':{name:'Alex',initials:'AX',bg:'#E6F0FB',col:'#1E3A6E',food:'Vegetarian',cuisines:['Japanese','French'],style:['Intimate','Cosy'],ll:'quality_time'},
          '@priya_k':{name:'Priya',initials:'PK',bg:'#FBF0E6',col:'#6E3A1E',food:'Vegan',cuisines:['Indian','Mediterranean'],style:['Outdoor','Romantic'],ll:'physical_touch'},
          '@tom.w99':{name:'Tom',initials:'TW',bg:'#E6FBF0',col:'#1E6E3A',food:'Everything',cuisines:['Modern British','Italian'],style:['Adventure','Live music'],ll:'acts_of_service'},
        };

        function _syncHandleDisplays(){
          ['user','partner'].forEach(p=>{
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
          if(val===_handles.user||val===_handles.partner){toast('That\'s already one of your handles');return;}
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

        // Load saved handles (migrate legacy jamie/sophie keys)
        (function _loadHandles(){
          try{
            const h=localStorage.getItem('t4t_handles');
            if(h){
              const parsed=JSON.parse(h);
              // Migrate legacy keys
              if(parsed.jamie&&!parsed.user)parsed.user=parsed.jamie;
              if(parsed.sophie&&!parsed.partner)parsed.partner=parsed.sophie;
              delete parsed.jamie;delete parsed.sophie;
              _handles=Object.assign(_handles,parsed);
              localStorage.setItem('t4t_handles',JSON.stringify(_handles));
              _syncHandleDisplays();
            }
          }catch(e){}
        })();

        // ── Budget band definitions (used by pills + filtering) ──
        const _BUDGET_BANDS=[
          {id:'under50',   label:'Under \u00a350',          max:50,   tiers:['budget']},
          {id:'50to150',   label:'\u00a350\u2013\u00a3150', max:150,  tiers:['mid']},
          {id:'150plus',   label:'\u00a3150+',              max:9999, tiers:['luxury']}
        ];

        function _budgetBandForPrice(priceStr){
          const m=priceStr.match(/£(\d+)/);
          const pp=m?parseInt(m[1]):30;
          if(pp<50)return 'under50';
          if(pp<150)return '50to150';
          return '150plus';
        }

        function _priceMatchesBand(priceStr,bandId){
          if(!bandId)return true;
          const band=_BUDGET_BANDS.find(b=>b.id===bandId);
          if(!band)return true;
          const m=priceStr.match(/£(\d+)/);
          const pp=m?parseInt(m[1]):30;
          const prev=_BUDGET_BANDS[_BUDGET_BANDS.indexOf(band)-1];
          const min=prev?prev.max:0;
          return pp>=min&&pp<band.max;
        }

        const IDEAS={
          budget:[
            {name:'Maltby Street Market brunch',loc:'Bermondsey · Street food',emoji:'🌮',img:'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=320&fit=crop&q=80',price:'avg. £13pp',why:'Both love casual food scenes — London\'s best street food market',score:78,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','outdoors','playful'],dietary:['vegetarian'],t:{tod:['day','afternoon'],env:['outdoor'],soc:['group_friendly'],pace:'relaxed',fmt:['dining','walk'],weather:'summer_friendly'}},
            {name:'Tate Modern + Thames walk',loc:'South Bank · Art & outdoors',emoji:'🖼️',img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=320&fit=crop&q=80',price:'Free–avg. £8pp',why:'Free world-class art followed by a Thames-side walk',score:86,type:'outdoor',vibes:['Walkable','Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','outdoors','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['mixed'],soc:['intimate','quiet'],pace:'relaxed',fmt:['cultural','walk'],weather:'weather_flexible'}},
            {name:'BFI Southbank cinema + wine',loc:'South Bank · Film & culture',emoji:'🎬',img:'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Independent cinema right on the river — perfect for culture lovers',score:80,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','drinks'],weather:'weather_flexible'}},
            {name:'Escape Hunt London',loc:'Holborn · Escape room',emoji:'🔐',img:'https://images.unsplash.com/photo-1608501078713-8e445a709b39?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Solve puzzles together — teamwork makes the dream work',score:79,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Rooftop Film Club screening',loc:'Peckham / Shoreditch · Outdoor cinema',emoji:'🎥',img:'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=320&fit=crop&q=80',price:'avg. £16pp',why:'Watching films under the stars with blankets and wine',score:83,type:'outdoor',vibes:['Outdoor seats','Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['romantic','outdoors','relaxed'],dietary:[],t:{tod:['evening','night'],env:['outdoor'],soc:['intimate','group_friendly'],pace:'extended',fmt:['entertainment'],weather:'summer_friendly'}},
            {name:'Bounce ping pong',loc:'Holborn · Ping pong bar',emoji:'🏓',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'Ping pong, cocktails and pizza — playful and social',score:79,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful','nightlife'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Junkyard Golf Club',loc:'Shoreditch · Crazy golf bar',emoji:'⛳',img:'https://wjezqqtkxhzydyzxocow.supabase.co/storage/v1/object/public/images/kelli-mcclintock-DF0HdZv_g2M-unsplash.jpg',price:'avg. £13pp',why:'Crazy mini golf with cocktails — silly, loud, fun',score:80,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife','casual'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Battersea Park boating + picnic',loc:'Battersea · Outdoor',emoji:'🚣',img:'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=600&h=320&fit=crop&q=80',price:'avg. £14pp',why:'Relaxed, romantic London classic on the lake',score:77,type:'outdoor',vibes:['Walkable','Outdoor seats'],venue_status:'active',rel:['partner','solo'],budgetTier:'budget',contexts:['partner','solo'],mood:['romantic','outdoors','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','quiet'],pace:'relaxed',fmt:['activity','walk'],weather:'summer_friendly'}},
            {name:'The Comedy Store',loc:'Soho · Live comedy',emoji:'🎭',img:'https://images.unsplash.com/photo-1527224857830-43a7acc85260?w=600&h=320&fit=crop&q=80',price:'avg. £16pp',why:'London\'s legendary comedy club — guaranteed laughter',score:74,type:'fun',vibes:['Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['nightlife','playful'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['entertainment'],weather:'weather_flexible'}},
            {name:'Leake Street Arches street art walk',loc:'Waterloo · Street art',emoji:'🎨',img:'https://images.unsplash.com/photo-1499781350541-7783f6c6a0c8?w=600&h=320&fit=crop&q=80',price:'Free',why:'Banksy\'s famous graffiti tunnel — free street art walk',score:70,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','outdoors','casual'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor','mixed'],soc:['intimate','group_friendly'],pace:'quick',fmt:['walk','cultural'],weather:'summer_friendly'}},
            {name:'Jenki matcha bar',loc:'Soho · Matcha café',emoji:'🍵',img:'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=600&h=320&fit=crop&q=80',price:'avg. £12pp',why:'London\'s best matcha lattes and mochi — calm, aesthetic and delicious',score:80,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['relaxed','casual'],dietary:['vegetarian','vegan','gluten_free'],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'quick',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Hotpod Yoga date',loc:'Various London · Hot yoga',emoji:'🧘',img:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=320&fit=crop&q=80',price:'avg. £16pp',why:'37-degree pod, dim lights, deep stretches — weirdly intimate and totally relaxing',score:79,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','solo'],budgetTier:'budget',contexts:['partner','solo'],mood:['wellness','relaxed'],dietary:[],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'quick',fmt:['wellness'],weather:'weather_flexible'}},
          ],
          mid:[
            {name:'TeamSport Go-Karting',loc:'Stratford · Indoor karting',emoji:'🏎️',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=320&fit=crop&q=80',price:'avg. £23pp',why:'Thrilling and competitive — guaranteed laughs and bragging rights',score:82,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Brindisa tapas + Borough Market',loc:'Borough · Spanish',emoji:'🥘',img:'https://images.unsplash.com/photo-1515443961218-a51367888e4b?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Both love bold food — best tapas beside London\'s greatest market',score:79,type:'fun',vibes:['Walkable','Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','outdoors','playful'],dietary:['vegetarian','pescatarian'],t:{tod:['day','afternoon'],env:['outdoor','mixed'],soc:['group_friendly'],pace:'relaxed',fmt:['dining','walk'],weather:'summer_friendly'}},
            {name:'Puttshack mini golf',loc:'Bank · Tech-infused mini golf',emoji:'⛳',img:'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=600&h=320&fit=crop&q=80',price:'avg. £22pp',why:'Trackable mini golf with cocktails and street food — proper fun, zero skill required',score:83,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Toca Social',loc:'The O2 · Interactive football & bar',emoji:'⚽',img:'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Football meets arcade — smash targets, eat street food, drink cocktails at The O2',score:84,type:'fun',vibes:['Unique / memorable','Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['friends'],mood:['active','playful','nightlife'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','dining','drinks'],weather:'weather_flexible'}},
            {name:'National Theatre',loc:'South Bank · Theatre',emoji:'🎭',img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'World-class productions on the Thames — three stages, always something remarkable',score:88,type:'cultural',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','cultural'],weather:'weather_flexible'}},
            {name:'Almeida Theatre',loc:'Islington · Theatre',emoji:'🎭',img:'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'Intimate studio theatre — bold new writing in a 325-seat space',score:84,type:'cultural',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','solo'],budgetTier:'budget',contexts:['partner','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','cultural'],weather:'weather_flexible'}},
            {name:'Kew Gardens + riverside pub',loc:'Richmond · Outdoor',emoji:'🌿',img:'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'UNESCO world heritage gardens with a riverside pub',score:81,type:'outdoor',vibes:['Walkable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['outdoors','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly'],pace:'extended',fmt:['walk','drinks'],weather:'summer_friendly'}},
            {name:'Ottolenghi dinner',loc:'Islington · Mediterranean',emoji:'🥗',img:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Ottolenghi\'s bold Mediterranean flavours never disappoint',score:88,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian','vegan','pescatarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Shakespeare\'s Globe Theatre',loc:'South Bank · Theatre',emoji:'🎭',img:'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600&h=320&fit=crop&q=80',price:'avg. £38pp',why:'Iconic open-air theatre on the Thames — utterly memorable',score:87,type:'all',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','outdoors'],dietary:[],t:{tod:['afternoon','evening'],env:['outdoor','mixed'],soc:['intimate','group_friendly'],pace:'extended',fmt:['entertainment','cultural'],weather:'summer_friendly'}},
            {name:'All Star Lanes bowling + cocktails',loc:'Holborn · Boutique bowling',emoji:'🎳',img:'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Retro-cool boutique bowling with killer cocktails — great fun',score:81,type:'fun',vibes:['Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Padella pasta dinner',loc:'Borough · Italian',emoji:'🍝',img:'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'London\'s best hand-rolled pasta — simple, romantic, delicious',score:86,type:'outdoor',vibes:['Walkable','Candlelit'],venue_status:'active',rel:['partner','solo'],budgetTier:'budget',contexts:['partner','solo'],mood:['romantic','casual','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor'],soc:['intimate','quiet'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Barbican Cinema + cocktails',loc:'Barbican · Arts cinema',emoji:'🎬',img:'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Indie film in a stunning brutalist arts centre',score:80,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','drinks'],weather:'weather_flexible'}},
            {name:'Alexandra Palace sunset terrace',loc:'North London · Views',emoji:'🌇',img:'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?w=600&h=320&fit=crop&q=80',price:'avg. £23pp',why:'Best panoramic views over London — magic at golden hour',score:83,type:'outdoor',vibes:['Outdoor seats','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['romantic','outdoors','relaxed'],dietary:[],t:{tod:['afternoon','evening'],env:['outdoor'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['drinks','walk'],weather:'summer_friendly'}},
            {name:'Ironmonger Row Baths',loc:'Clerkenwell · Turkish baths',emoji:'🧖',img:'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Steam room, sauna and plunge pool — the ultimate wind-down together',score:85,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','solo'],budgetTier:'budget',contexts:['partner','solo'],mood:['wellness','relaxed'],dietary:[],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['wellness'],weather:'weather_flexible'}},
            {name:'Frame fitness class for two',loc:'Shoreditch · Fitness',emoji:'💪',img:'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Work out together — endorphins, energy and an excuse for brunch after',score:78,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','wellness'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','high_energy'],pace:'quick',fmt:['activity','wellness'],weather:'weather_flexible'}},
            {name:'Kobox boxing date',loc:'King\'s Road · Boxing',emoji:'🥊',img:'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'Neon-lit boxing studio with music — competitive, sweaty and brilliantly fun',score:83,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Reformer Pilates for two',loc:'Notting Hill · Pilates',emoji:'🤸',img:'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Side-by-side reformer beds — a controlled burn that leaves you both glowing',score:82,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','solo'],budgetTier:'budget',contexts:['partner','solo'],mood:['wellness','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'quick',fmt:['wellness'],weather:'weather_flexible'}},
            {name:'Yoga + brunch at Triyoga',loc:'Camden · Yoga & brunch',emoji:'🧘',img:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Flow class then plant-based brunch next door — the perfect slow morning together',score:84,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['wellness','relaxed','casual'],dietary:['vegetarian','vegan'],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['wellness','dining'],weather:'weather_flexible'}},
            {name:'Swingers crazy golf + cocktails',loc:'City / West End · Crazy golf',emoji:'⛳',img:'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'Two courses of crazy golf, street food vendors and killer cocktails — proper fun',score:86,type:'fun',vibes:['Unique / memorable','Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks','dining'],weather:'weather_flexible'}},
            {name:'Padel court session for two',loc:'Various London · Padel tennis',emoji:'🎾',img:'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=600&h=320&fit=crop&q=80',price:'avg. £22pp',why:'The fastest-growing sport in the world — easy to pick up, competitive and addictive',score:81,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful','outdoors'],dietary:[],t:{tod:['day','afternoon','evening'],env:['outdoor','mixed'],soc:['intimate','high_energy'],pace:'quick',fmt:['activity'],weather:'summer_friendly'}},
            {name:'Tsujiri matcha + mochi',loc:'Wardour Street, Soho · Matcha café',emoji:'🍵',img:'https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'Kyoto\'s famous matcha house — ceremonial lattes, soft serve and handmade mochi',score:84,type:'outdoor',vibes:['Walkable','Candlelit'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['relaxed','casual'],dietary:['vegetarian','vegan'],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'quick',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Escape London',loc:'Central London · Live escape game',emoji:'🔐',img:'https://images.unsplash.com/photo-1608501078713-8e445a709b39?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'Cleverly themed rooms with real puzzles — immersive, playful and properly challenging',score:80,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'clueQuest',loc:'Caledonian Road · Themed escape room',emoji:'🔐',img:'https://images.unsplash.com/photo-1608501078713-8e445a709b39?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'One of London\'s top-rated escape rooms — great teamwork test for a date',score:81,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Mission: Breakout',loc:'Camden · Immersive escape room',emoji:'🔐',img:'https://images.unsplash.com/photo-1608501078713-8e445a709b39?w=600&h=320&fit=crop&q=80',price:'avg. £27pp',why:'Quirky Camden escape room with immersive storylines — brilliantly fun together',score:79,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'K1 Speed Canary Wharf',loc:'Canary Wharf · Indoor karting',emoji:'🏎️',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Electric karts, real competition — adrenaline-fuelled and seriously fast',score:82,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Daytona Motorsport London',loc:'Various London · Outdoor karting',emoji:'🏎️',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'Outdoor track karting — proper speed, proper racing, proper date',score:83,type:'fun',vibes:['Unique / memorable','Outdoor seats'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful','outdoors'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'summer_friendly'}},
            {name:'Shoreditch Balls',loc:'Shoreditch · Crazy golf & bar',emoji:'⛳',img:'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'Quirky crazy golf with cocktails in the heart of Shoreditch — playful and social',score:80,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife','casual'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Crazy Putt Greenwich Peninsula',loc:'Greenwich · Adventure golf',emoji:'⛳',img:'https://images.unsplash.com/photo-1558618047-3c8c76ca7d13?w=600&h=320&fit=crop&q=80',price:'avg. £14pp',why:'Outdoor adventure golf by the Thames — lighthearted, cheap and cheerful',score:75,type:'outdoor',vibes:['Outdoor seats','Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','outdoors','casual'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['group_friendly'],pace:'quick',fmt:['activity'],weather:'summer_friendly'}},
            {name:'Axeperience London',loc:'Central London · Urban axe throwing',emoji:'🪓',img:'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Throw axes at targets — competitive, quirky and oddly satisfying',score:79,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Game of Throwing London',loc:'Central London · Axe throwing bar',emoji:'🪓',img:'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=600&h=320&fit=crop&q=80',price:'avg. £27pp',why:'Axe throwing with drinks — competitive, social and brilliantly different',score:78,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Boom Battle Bar Liverpool Street',loc:'Liverpool Street · Activity bar',emoji:'🪓',img:'https://images.unsplash.com/photo-1590674899484-d5640e854abe?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Axe throwing, shuffleboard and cocktails all under one roof — after-work date gold',score:78,type:'fun',vibes:['Unique / memorable','Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['friends'],mood:['active','playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Lightroom',loc:'King\'s Cross · Digital art experience',emoji:'🖼️',img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Immersive digital art projections — walk through light, colour and sound together',score:84,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'relaxed',fmt:['cultural','entertainment'],weather:'weather_flexible'}},
            {name:'Queens London',loc:'Bayswater · Classic bowling & bar',emoji:'🎳',img:'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&h=320&fit=crop&q=80',price:'avg. £22pp',why:'Retro-style bowling with cocktails and street food — classic date night fun',score:79,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife','casual'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Hollywood Bowl O2',loc:'The O2 · Bowling',emoji:'🎳',img:'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Casual bowling at The O2 — easy, affordable and great pre-event date',score:72,type:'fun',vibes:[],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Hollywood Bowl Finchley',loc:'Finchley · Bowling',emoji:'🎳',img:'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Low-key bowling date in North London — casual, fun and no-pressure',score:71,type:'fun',vibes:[],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Kricket',loc:'Soho · Modern Indian small plates',emoji:'✦',img:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Bold, creative Indian small plates — punchy spicing in a buzzy setting',score:85,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:['vegetarian','halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Hoppers St Christopher\'s Place',loc:'Marylebone · Sri Lankan',emoji:'✦',img:'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'Hoppers, dosas and sambols — Sri Lankan soul food done perfectly',score:86,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','relaxed'],dietary:['vegetarian','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Hoppers Soho',loc:'Soho · Sri Lankan',emoji:'✦',img:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'The original Hoppers — walk-in only, always worth the wait',score:85,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','relaxed'],dietary:['vegetarian','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Lina Stores',loc:'Soho · Fresh Italian pasta',emoji:'✦',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'Beautiful mint-green Italian deli-restaurant — handmade pasta, natural wines',score:87,type:'foodie',vibes:['Walkable','Candlelit'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['romantic','casual','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly','quiet'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Barrafina Drury Lane',loc:'Covent Garden · Spanish tapas counter',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Counter-only tapas bar — watch the chefs work while you eat some of London\'s best Spanish food',score:88,type:'foodie',vibes:['Walkable','Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian','pescatarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly','quiet'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Franco Manca Soho',loc:'Soho · Neapolitan sourdough pizza',emoji:'✦',img:'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Sourdough pizza pioneers since 2008 — fresh, cheap, fast',score:78,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Honest Burgers Soho',loc:'Soho · British burgers',emoji:'✦',img:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'British smashed burgers, rosemary fries, brewery beer',score:79,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','playful'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Bone Daddies Soho',loc:'Soho · Japanese ramen',emoji:'✦',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Rock\'n\'roll ramen — 20-hour pork bone broth, soundtrack, communal seating',score:80,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','playful'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly','quiet'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Pizza Pilgrims Dean Street',loc:'Soho · Neapolitan pizza',emoji:'✦',img:'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Original Pilgrims pizzeria — Neapolitan pies, fussball table, basement charm',score:80,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Mercato Metropolitano',loc:'Elephant & Castle · International food market',emoji:'✦',img:'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'17,000 sq ft food market — pick from 40+ traders, live music weekends',score:81,type:'outdoor',vibes:['Walkable','Live music'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','outdoors','playful'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening','night'],env:['indoor','mixed'],soc:['group_friendly'],pace:'relaxed',fmt:['dining','walk'],weather:'weather_flexible'}},
            {name:'Daunt Books Marylebone',loc:'Marylebone · Edwardian bookshop',emoji:'✦',img:'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&h=320&fit=crop&q=80',price:'Free',why:'World-famous Edwardian bookshop — oak galleries, skylight, no rush',score:82,type:'cultural',vibes:['Walkable','Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'relaxed',fmt:['cultural','walk'],weather:'weather_flexible'}},
            {name:'Foyles Charing Cross Road',loc:'Soho · Flagship bookshop',emoji:'✦',img:'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&h=320&fit=crop&q=80',price:'Free',why:'London\'s flagship bookshop — 200,000 titles, cafe on top floor',score:79,type:'cultural',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'relaxed',fmt:['cultural','walk'],weather:'weather_flexible'}},
            {name:'Libreria Bookshop',loc:'Spitalfields · Curated indie bookshop',emoji:'✦',img:'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=600&h=320&fit=crop&q=80',price:'Free',why:'Yellow-shelved labyrinth where phones are banned and books are arranged by mood',score:83,type:'cultural',vibes:['Walkable','Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'quick',fmt:['cultural'],weather:'weather_flexible'}},
            {name:'Wallace Collection',loc:'Marylebone · Free art museum',emoji:'✦',img:'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=600&h=320&fit=crop&q=80',price:'Free',why:'A hidden Hertford House mansion full of Vermeer, Velazquez, and silk-walled rooms',score:86,type:'cultural',vibes:['Walkable','Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'relaxed',fmt:['cultural'],weather:'weather_flexible'}},
            {name:'National Gallery',loc:'Trafalgar Square · Free art museum',emoji:'✦',img:'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=600&h=320&fit=crop&q=80',price:'Free',why:'2,300 paintings from the 13th to 20th centuries — free, always',score:88,type:'cultural',vibes:['Walkable','Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['cultural'],weather:'weather_flexible'}},
            {name:'Whitechapel Gallery',loc:'Whitechapel · Contemporary art gallery',emoji:'✦',img:'https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=600&h=320&fit=crop&q=80',price:'Free',why:'East End contemporary art landmark — Picasso\'s Guernica was shown here in 1939',score:82,type:'cultural',vibes:['Walkable','Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'relaxed',fmt:['cultural'],weather:'weather_flexible'}},
            {name:'Hampstead Heath walk',loc:'Hampstead · Heath & Parliament Hill',emoji:'✦',img:'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=600&h=320&fit=crop&q=80',price:'Free',why:'320 hectares of meadow, woodland, and the best skyline view in London from Parliament Hill',score:85,type:'outdoor',vibes:['Walkable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['outdoors','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly','quiet'],pace:'extended',fmt:['walk'],weather:'summer_friendly'}},
            {name:'Richmond Park walk',loc:'Richmond · Royal Park',emoji:'✦',img:'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&h=320&fit=crop&q=80',price:'Free',why:'London\'s largest Royal Park — wild deer, ancient trees, and one of the best views back to the city',score:86,type:'outdoor',vibes:['Walkable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['outdoors','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly','quiet'],pace:'extended',fmt:['walk'],weather:'summer_friendly'}},
            {name:'Regent\'s Canal walk',loc:'Camden to Little Venice · Towpath walk',emoji:'✦',img:'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=600&h=320&fit=crop&q=80',price:'Free',why:'3-mile towpath walk through Camden Market, London Zoo, and Little Venice',score:83,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['outdoors','relaxed','casual'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly','quiet'],pace:'extended',fmt:['walk'],weather:'summer_friendly'}},
            {name:'Sky Garden',loc:'City of London · Free observation deck',emoji:'✦',img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=320&fit=crop&q=80',price:'Free',why:'London\'s highest public garden — panoramic views, three storeys, completely free',score:87,type:'outdoor',vibes:['Unique / memorable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['romantic','outdoors','relaxed'],dietary:[],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['cultural','walk'],weather:'weather_flexible'}},
            {name:'Brockwell Lido',loc:'Herne Hill · Art Deco outdoor pool',emoji:'✦',img:'https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=600&h=320&fit=crop&q=80',price:'avg. £8pp',why:'1937 Art Deco lido — unheated 50m pool, sauna, cafe, year-round swimming',score:81,type:'outdoor',vibes:['Unique / memorable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['active','outdoors','wellness'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly'],pace:'quick',fmt:['activity','wellness'],weather:'summer_friendly'}},
            {name:'Spitalfields Market browse',loc:'Spitalfields · Historic covered market',emoji:'✦',img:'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=600&h=320&fit=crop&q=80',price:'avg. £5pp',why:'350-year-old market — vintage, art, independent traders, food court',score:80,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','outdoors','relaxed'],dietary:['vegetarian'],t:{tod:['day','afternoon'],env:['indoor','mixed'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['walk','dining'],weather:'weather_flexible'}},
            {name:'Bloomsbury Bowling Lanes',loc:'Bloomsbury · 1950s bowling alley & karaoke',emoji:'✦',img:'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&h=320&fit=crop&q=80',price:'avg. £8pp',why:'1950s American-style basement lanes — bowling, karaoke, vinyl-clad diner',score:80,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Flight Club Shoreditch',loc:'Shoreditch · Social darts bar',emoji:'✦',img:'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Social darts with sub-millimetre auto-scoring — 12 oches, cocktails, sharing plates',score:83,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Lucky Voice Soho',loc:'Soho · Private karaoke rooms',emoji:'✦',img:'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&h=320&fit=crop&q=80',price:'avg. £13pp',why:'London\'s original private karaoke — 9 themed rooms, 13,000 songs, cocktails delivered to your booth',score:81,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'extended',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Draughts Waterloo',loc:'Waterloo · Board game cafe',emoji:'✦',img:'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=600&h=320&fit=crop&q=80',price:'avg. £8pp',why:'1,000+ board games beneath the Leake Street arches — pick a game, order food, stay for hours',score:82,type:'fun',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['playful','relaxed','casual'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Electric Shuffle London Bridge',loc:'London Bridge · Hi-tech shuffleboard bar',emoji:'✦',img:'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&h=320&fit=crop&q=80',price:'avg. £13pp',why:'Shuffleboard reimagined by the Flight Club team — neon, cocktails, four instant-scoring games',score:82,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Pop Brixton',loc:'Brixton · Shipping container food & culture hub',emoji:'✦',img:'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Shipping container village by Brixton station — independent food, drinks, music, weekend DJ sets',score:81,type:'fun',vibes:['Walkable','Live music'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','nightlife','playful'],dietary:['vegetarian'],t:{tod:['afternoon','evening','night'],env:['outdoor','mixed'],soc:['group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'summer_friendly'}},
            {name:'Brixton Village',loc:'Brixton · Covered Victorian market',emoji:'✦',img:'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=600&h=320&fit=crop&q=80',price:'avg. £12pp',why:'Covered market arcades — Caribbean, African, Latin food, vintage stalls, indie shops',score:82,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','outdoors','relaxed'],dietary:['vegetarian'],t:{tod:['day','afternoon','evening'],env:['indoor','mixed'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','walk'],weather:'weather_flexible'}},
            {name:'Mare Street Market',loc:'Hackney · Food, drink & retail hub',emoji:'✦',img:'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'10,000 sq ft Hackney emporium — deli, cocktails, open kitchen, records, flowers, all under one roof',score:82,type:'fun',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','nightlife','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Hackney Picturehouse',loc:'Hackney · Indie cinema & bar',emoji:'✦',img:'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=320&fit=crop&q=80',price:'avg. £14pp',why:'Hackney\'s beloved indie cinema — bar, cafe, member screenings, Q&As',score:80,type:'cultural',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment'],weather:'weather_flexible'}},
            {name:'Peckhamplex',loc:'Peckham · Independent cinema',emoji:'✦',img:'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=320&fit=crop&q=80',price:'avg. £7pp',why:'South London\'s iconic indie cinema — every ticket £6.99, all day, every showing',score:81,type:'cultural',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','casual','relaxed'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment'],weather:'weather_flexible'}},
            {name:'Bussey Building',loc:'Peckham · Multi-arts venue & rooftop bar',emoji:'✦',img:'https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=600&h=320&fit=crop&q=80',price:'avg. £12pp',why:'Sprawling Peckham arts venue — rooftop drinks in summer, club nights, gallery shows, theatre',score:82,type:'fun',vibes:['Unique / memorable','Outdoor seats'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['nightlife','cultural','playful'],dietary:[],t:{tod:['evening','night'],env:['outdoor','mixed'],soc:['group_friendly','high_energy'],pace:'extended',fmt:['entertainment','drinks'],weather:'summer_friendly'}},
            {name:'Greenwich Market',loc:'Greenwich · Covered Victorian market',emoji:'✦',img:'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=600&h=320&fit=crop&q=80',price:'avg. £10pp',why:'Royal Charter market since 1700 — food stalls, antiques, arts, crafts under a Victorian roof',score:82,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','outdoors','relaxed'],dietary:['vegetarian'],t:{tod:['day','afternoon'],env:['indoor','mixed'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['walk','dining'],weather:'weather_flexible'}},
            {name:'Royal Observatory Greenwich',loc:'Greenwich · Historic observatory & museum',emoji:'✦',img:'https://images.unsplash.com/photo-1532978379173-523e16f371f9?w=600&h=320&fit=crop&q=80',price:'avg. £24pp',why:'Stand on the Prime Meridian Line — home of GMT, Wren-designed observatory atop Greenwich Hill',score:86,type:'cultural',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','mixed'],soc:['intimate','quiet'],pace:'relaxed',fmt:['cultural'],weather:'weather_flexible'}},
            {name:'Greenwich Park walk',loc:'Greenwich · Royal Park hilltop views',emoji:'✦',img:'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&h=320&fit=crop&q=80',price:'Free',why:'Walk up to the Observatory for one of London\'s most iconic skyline views — free, daily',score:84,type:'outdoor',vibes:['Walkable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['outdoors','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly','quiet'],pace:'extended',fmt:['walk'],weather:'summer_friendly'}},
            {name:'Cutty Sark',loc:'Greenwich · Historic tea clipper museum',emoji:'✦',img:'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Step aboard the world\'s last surviving tea clipper, dry-docked at Greenwich Pier',score:83,type:'cultural',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','mixed'],soc:['intimate','quiet'],pace:'relaxed',fmt:['cultural'],weather:'weather_flexible'}},
            {name:'Queen Elizabeth Olympic Park',loc:'Stratford · 2012 Olympic legacy park',emoji:'✦',img:'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=600&h=320&fit=crop&q=80',price:'Free',why:'2012 Olympic legacy park — riverside walks, ArcelorMittal Orbit views, Aquatics Centre, gardens',score:80,type:'outdoor',vibes:['Walkable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['outdoors','relaxed','active'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly'],pace:'extended',fmt:['walk'],weather:'summer_friendly'}},
            {name:'Hackney City Farm',loc:'Hackney · Working city farm & cafe',emoji:'✦',img:'https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=600&h=320&fit=crop&q=80',price:'Free',why:'A genuine working farm five minutes from Broadway Market — pigs, goats, donkeys, donations welcome',score:78,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['outdoors','relaxed','casual'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly','quiet'],pace:'relaxed',fmt:['walk'],weather:'summer_friendly'}},
            {name:'Bancone pasta bar',loc:'Covent Garden · Italian pasta',emoji:'✦',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'Silk handkerchiefs and cacio e pepe — London\'s most creative fresh pasta bar',score:84,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Trullo',loc:'Islington · Italian',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'Neighbourhood Italian done brilliantly — wood-roasted meats and handmade pasta',score:86,type:'foodie',vibes:['Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['romantic','casual'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Manteca',loc:'Shoreditch · Modern Italian',emoji:'✦',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Nose-to-tail Italian with house-made pasta and a brilliant natural wine list',score:87,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Lina Stores King\'s Cross',loc:'King\'s Cross · Italian deli',emoji:'✦',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Pastel-green Italian deli — handmade pasta, Aperol spritzes and real Italian charm',score:83,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Officina 00',loc:'Old Street · Italian pasta',emoji:'✦',img:'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&h=320&fit=crop&q=80',price:'avg. £32pp',why:'East London\'s best pasta — creative seasonal shapes in a buzzy open kitchen',score:85,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Dishoom Shoreditch',loc:'Shoreditch · Indian cafe',emoji:'✦',img:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Bombay cafe vibes — black dal, bacon naan rolls and the best chai in London',score:88,type:'foodie',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian','vegan','halal'],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Darjeeling Express',loc:'Carnaby · Indian home cooking',emoji:'✦',img:'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Asma Khan\'s legendary home cooking — as seen on Chef\'s Table, genuinely moving food',score:89,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','romantic'],dietary:['vegetarian','vegan','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Roti King',loc:'Euston · Malaysian Indian cafe',emoji:'✦',img:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Cult basement spot — flaky roti canai and rich curry for under £15pp',score:82,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Jugemu',loc:'Soho · Japanese izakaya',emoji:'✦',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Tiny Soho izakaya — grilled skewers, cold sake and authentic Tokyo atmosphere',score:84,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Kanada-Ya',loc:'Covent Garden · Japanese ramen',emoji:'✦',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'London\'s most authentic tonkotsu ramen — 18-hour pork bone broth, silky noodles',score:83,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Arabica Borough',loc:'Borough · Middle Eastern restaurant',emoji:'✦',img:'https://images.unsplash.com/photo-1529059997568-3d847b1154f0?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Levantine sharing plates by Borough Market — mezze, flatbreads and brilliant natural wines',score:85,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','relaxed'],dietary:['vegetarian','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Zahter',loc:'Covent Garden · Turkish restaurant',emoji:'✦',img:'https://images.unsplash.com/photo-1529059997568-3d847b1154f0?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Modern Turkish sharing plates — exceptional pides, mezze and grills in a warm setting',score:84,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','romantic'],dietary:['vegetarian','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Zayane',loc:'Notting Hill · Moroccan restaurant',emoji:'✦',img:'https://images.unsplash.com/photo-1529059997568-3d847b1154f0?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'Intimate Moroccan neighbourhood restaurant — slow-cooked tagines and exceptional hospitality',score:86,type:'foodie',vibes:['Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['romantic','casual'],dietary:['vegetarian','halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Billy\'s Smokehouse',loc:'Hammersmith · Halal Texas BBQ',emoji:'🔥',img:'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Authentic Texas-style halal BBQ — slow-smoked brisket with a perfect bark, cult West London spot',score:85,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','playful'],dietary:['halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'KARV Steakhouse',loc:'Hackney · Halal steakhouse',emoji:'🥩',img:'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Live-fire halal steakhouse in Hackney — wagyu rump, ribeye and sharing platters cooked over real flames',score:86,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:['halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Jungle Braai',loc:'Shoreditch · South African BBQ',emoji:'🌿',img:'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'South African braai in a jungle-themed space — fire-cooked meats, vibrant atmosphere, totally unique',score:84,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:[],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Tiger Milk Spitalfields',loc:'Spitalfields · Peruvian restaurant',emoji:'🐯',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Peruvian-Asian fusion with stunning ceviches and pisco sours — vibrant and genuinely delicious',score:85,type:'foodie',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:['pescatarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Laki Kane',loc:'Islington · Tropical cocktail bar',emoji:'🌺',img:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Award-winning tropical cocktail bar — immersive jungle decor, exceptional rum cocktails and street food',score:86,type:'fun',vibes:['Unique / memorable','Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['drinks','dining'],weather:'weather_flexible'}},
            {name:'Coupette',loc:'Bethnal Green · World\'s 50 Best cocktail bar',emoji:'🥂',img:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Ranked in World\'s 50 Best Bars — French-inspired cocktails, Champagne Pina Colada, intimate candlelit space',score:90,type:'romantic',vibes:['Candlelit','Unique / memorable','Live music'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['romantic','relaxed','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'relaxed',fmt:['drinks'],weather:'weather_flexible'}},
            {name:'XP Tavern',loc:'Shoreditch · Gaming bar',emoji:'🎮',img:'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Retro gaming bar with 200+ games, cocktails and pub food — the ultimate nerdy date night',score:82,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','casual','nightlife'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Amelia\'s House',loc:'Marylebone · Cocktail bar',emoji:'🌹',img:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Hidden cocktail bar styled like a Victorian townhouse — intimate, theatrical and genuinely special',score:85,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['romantic','relaxed','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'relaxed',fmt:['drinks'],weather:'weather_flexible'}},
            {name:'Ballerz',loc:'Stratford · Football entertainment',emoji:'⚽',img:'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Interactive football entertainment — skills challenges, footgolf and bar in one venue',score:81,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Tate Exchange workshop',loc:'South Bank · Creative workshop',emoji:'🎨',img:'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Hands-on art workshops inside Tate Modern — creative, social and genuinely fun',score:80,type:'cultural',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','playful','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['activity','cultural'],weather:'weather_flexible'}},
            {name:'Rowans bowling + arcade Finsbury Park',loc:'Finsbury Park · Bowling & arcade',emoji:'🎳',img:'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Retro bowling, arcade games, karaoke pods and a bar — proper fun night out',score:79,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','nightlife','casual'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Bouldering at The Climbing Hangar',loc:'Wembley · Bouldering gym',emoji:'🧗',img:'https://images.unsplash.com/photo-1522163182402-834f871fd851?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'No experience needed — bouldering is the perfect active date, surprisingly addictive',score:81,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['active','playful'],dietary:[],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Sauna & cold plunge at Peckham Lido',loc:'Peckham · Outdoor lido',emoji:'🏊',img:'https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Outdoor heated pool, sauna and cold plunge in South London — cult favourite',score:83,type:'all',vibes:['Unique / memorable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['wellness','active','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor','mixed'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['wellness','activity'],weather:'summer_friendly'}},
            {name:'Silverstone Interactive Museum',loc:'Paddington · F1 simulator experience',emoji:'🏎️',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'F1 simulators, race history and interactive exhibits — perfect for petrolheads',score:78,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','cultural'],weather:'weather_flexible'}},
            {name:'Canal boat hire Little Venice',loc:'Little Venice · Canal boat',emoji:'⛵',img:'https://images.unsplash.com/photo-1534430480872-3498386e7856?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Self-drive electric canal boat through Little Venice — unique, calm and completely magical',score:85,type:'outdoor',vibes:['Unique / memorable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['relaxed','outdoors','romantic'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['activity','walk'],weather:'summer_friendly'}},
            {name:'Archery tag at Boxpark Wembley',loc:'Wembley · Archery tag',emoji:'🏹',img:'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=600&h=320&fit=crop&q=80',price:'avg. £22pp',why:'Combat archery — dodge, shoot and laugh until you cry, no experience needed',score:80,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Depop vintage shopping Brick Lane',loc:'Brick Lane · Vintage shopping',emoji:'👗',img:'https://images.unsplash.com/photo-1555992336-03a23c7b20ee?w=600&h=320&fit=crop&q=80',price:'Free',why:'Best vintage shopping in London — Brick Lane markets, independent shops, street food',score:76,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','outdoors','playful'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor','mixed'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['walk'],weather:'summer_friendly'}},
            {name:'Curling at Queens Ice & Bowl',loc:'Bayswater · Ice rink',emoji:'🥌',img:'https://images.unsplash.com/photo-1519315901367-f34ff9154487?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Ice skating and curling in central London — surprisingly competitive and brilliant fun',score:79,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful','casual'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Open water swimming at Hampstead Ponds',loc:'Hampstead · Open water swimming',emoji:'🏊',img:'https://images.unsplash.com/photo-1486325212027-8081e485255e?w=600&h=320&fit=crop&q=80',price:'avg. £4pp',why:'Wild swimming on the Heath — bracing, beautiful and one of London\'s best secrets',score:82,type:'outdoor',vibes:['Unique / memorable','Outdoor seats'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['active','wellness','outdoors'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor'],soc:['intimate','group_friendly'],pace:'quick',fmt:['activity'],weather:'summer_friendly'}},
            {name:'Immersive Gamebox',loc:'Stratford · Immersive gaming',emoji:'🎮',img:'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'Floor to ceiling interactive gaming rooms — 360 degree immersive play for 2-6 people',score:83,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Kidzania London',loc:'Westfield · Role play experience',emoji:'🎭',img:'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Adults go free on certain nights — genuinely one of the most surreal fun evenings in London',score:78,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['playful','casual'],dietary:[],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Two Floors rooftop bar Soho',loc:'Soho · Rooftop bar',emoji:'🍹',img:'https://images.unsplash.com/photo-1470337458703-46ad1756a187?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Hidden rooftop in the heart of Soho — great cocktails, fairy lights, perfect summer evening',score:81,type:'fun',vibes:['Outdoor seats','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['nightlife','relaxed','casual'],dietary:[],t:{tod:['evening','night'],env:['outdoor','mixed'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['drinks'],weather:'summer_friendly'}},
            {name:'Sea Life London Aquarium',loc:'South Bank · Aquarium',emoji:'🐠',img:'https://images.unsplash.com/photo-1518020382113-a7e8fc38eac9?w=600&h=320&fit=crop&q=80',price:'avg. £28pp',why:'Walk through shark tanks and touch pools — weirdly romantic and genuinely impressive',score:79,type:'cultural',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['relaxed','casual','cultural'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['cultural','activity'],weather:'weather_flexible'}},
            {name:'ZSL London Zoo evening',loc:'Regent\'s Park · Zoo',emoji:'🦁',img:'https://images.unsplash.com/photo-1500595046743-cd271d694d30?w=600&h=320&fit=crop&q=80',price:'avg. £32pp',why:'London Zoo after dark — Tigers, gorillas and giraffes in a magical evening setting',score:82,type:'outdoor',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['relaxed','casual','outdoors'],dietary:[],t:{tod:['afternoon','evening'],env:['outdoor','mixed'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['activity','cultural'],weather:'summer_friendly'}},
            {name:'Battersea Power Station exploration',loc:'Battersea · Architecture & views',emoji:'🏭',img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=320&fit=crop&q=80',price:'Free–avg. £15pp',why:'Iconic power station now open to explore — glass lift up the chimney, river views, great bars',score:80,type:'outdoor',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','outdoors','cultural'],dietary:[],t:{tod:['day','afternoon','evening'],env:['outdoor','mixed'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['walk','drinks'],weather:'weather_flexible'}},
            {name:'Mr Bao',loc:'Peckham · Taiwanese brunch',emoji:'🥟',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Cult Peckham Taiwanese — fluffy bao buns, bottomless brunch option, genuinely excellent',score:83,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','playful'],dietary:['vegetarian'],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Ping Pong',loc:'Various London · Chinese dim sum',emoji:'🥟',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Accessible dim sum across London — steamed buns, dumplings and jasmine tea',score:76,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'BaoziInn',loc:'Chinatown · Chinese street food',emoji:'🥟',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'Northern Chinese street food in the heart of Chinatown — hand-pulled noodles and dumplings',score:80,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','playful'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Busaba',loc:'Various London · Thai restaurant',emoji:'🍜',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Casual Thai across London — fragrant curries, pad thai and communal tables',score:77,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Brasserie Zedel',loc:'Soho · French brasserie',emoji:'🇫🇷',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Grand Parisian brasserie hidden beneath Piccadilly — stunning Art Deco room, seriously affordable',score:85,type:'foodie',vibes:['Unique / memorable','Candlelit'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['romantic','casual','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
          
            {name:'Berenjak',loc:'Soho · Persian kabab house',emoji:'🔥',img:'https://images.unsplash.com/photo-1529059997568-3d847b1154f0?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'Michelin Bib Gourmand Persian — charcoal-grilled kababs and fresh taftoon bread in a buzzy Tehran-style setting',score:88,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','romantic'],dietary:['vegetarian','halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Zelman Meats',loc:'Knightsbridge · Halal steakhouse',emoji:'🥩',img:'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=320&fit=crop&q=80',price:'avg. £56pp',why:'Rotating halal steak menu at Harvey Nichols — Australian Wagyu, USDA Prime, triple-cooked fries',score:87,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Raaz',loc:'Mayfair · Indian fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=320&fit=crop&q=80',price:'avg. £65pp',why:'Halal Indian fine dining from a Benares and Jamavar alumni — refined tasting menus in an elegant Mayfair setting',score:89,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian','halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'The Great Chase',loc:'Fitzrovia · Alcohol-free fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'One of London\'s few alcohol-free fine dining spots — refined seasonal plates, perfect for halal diners and non-drinkers alike',score:86,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','relaxed'],dietary:['vegetarian','halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'TING Restaurant at The Shard',loc:'London Bridge · Halal fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?w=600&h=320&fit=crop&q=80',price:'avg. £75pp',why:'35th-floor halal dining with panoramic London views — refined British-Asian menu and halal afternoon tea',score:91,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Holy Carrot',loc:'Notting Hill · Plant-based restaurant',emoji:'🥕',img:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Fire and fermentation-driven plant-based dining on Portobello Road — one of London\'s most exciting sustainable restaurants',score:88,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'mid',contexts:['partner','friends','solo'],mood:['romantic','casual'],dietary:['vegetarian','vegan','gluten_free'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Tendril',loc:'Mayfair · Mostly vegan kitchen',emoji:'🌿',img:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=320&fit=crop&q=80',price:'avg. £27pp',why:'Michelin-listed mostly-vegan restaurant in Mayfair — creative global flavours, brilliant £27 prix fixe lunch',score:87,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'mid',contexts:['partner','friends','solo'],mood:['romantic','casual'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Gauthier Soho',loc:'Soho · Vegan fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £60pp',why:'Former Michelin-starred French restaurant turned fully plant-based — elegant tasting menus in a Georgian townhouse',score:90,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian','vegan','gluten_free'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Jam Delish',loc:'Angel · Vegan Caribbean',emoji:'🌶️',img:'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'Award-winning vegan Caribbean — jerk jackfruit, ackee, plantain and rum punch in a vibrant Angel setting',score:84,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','playful'],dietary:['vegetarian','vegan','gluten_free'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Niche',loc:'Angel · 100% gluten-free restaurant',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'London\'s first Coeliac UK-accredited restaurant — 100% gluten, nut and sesame free with inventive European dishes',score:88,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','relaxed'],dietary:['gluten_free','vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Pho',loc:'Various London · Vietnamese street food',emoji:'🍜',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Coeliac UK-accredited Vietnamese chain — 98% of the menu is naturally gluten-free with proper cross-contamination protocols',score:82,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['gluten_free','vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Mattarello',loc:'Aldgate · Gluten-free Italian pasta',emoji:'🍝',img:'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&h=320&fit=crop&q=80',price:'avg. £20pp',why:'Handmade gluten-free pasta imported from Italy — dedicated GF kitchen, Coeliac UK accredited',score:84,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','romantic'],dietary:['gluten_free','vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Urban Greens',loc:'Various London · 100% gluten-free salads',emoji:'🥗',img:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=320&fit=crop&q=80',price:'avg. £13pp',why:'Entirely gluten-free salad bowls with meat, fish and veggie options — six locations across London, quick and reliable',score:78,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['gluten_free','vegetarian','vegan','pescatarian'],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Reubens',loc:'Baker Street · Kosher deli & restaurant',emoji:'🥪',img:'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'London\'s longest-running kosher restaurant — legendary salt beef on rye, matzo ball soup, and schnitzels since 1973',score:83,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['kosher'],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Met Su Yan',loc:'Golders Green · Kosher pan-Asian',emoji:'🍣',img:'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Glatt Kosher pan-oriental — sushi, bao buns, pad thai and crispy duck in a modern Golders Green setting',score:82,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','romantic'],dietary:['kosher'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Pizaza',loc:'Golders Green · Kosher artisan pizza',emoji:'🍕',img:'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'Artisanal sourdough pizza baked fresh — kosher certified with creative toppings like truffle mushroom',score:80,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','playful'],dietary:['kosher','vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Tayyabs',loc:'Whitechapel · Punjabi-Pakistani grill',emoji:'🔥',img:'https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=600&h=320&fit=crop&q=80',price:'avg. £22pp',why:'Legendary BYOB Punjabi grill since 1972 — the dry lamb chops alone are worth the queue, and everything is halal',score:90,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:['vegetarian','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Needoo Grill',loc:'Whitechapel · Pakistani BBQ',emoji:'🔥',img:'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'The other Whitechapel legend — Punjabi grills, biryanis and nihari in a no-frills BYOB setting at unbeatable prices',score:86,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual'],dietary:['vegetarian','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Namak Mandi',loc:'Tooting · Pashtun grill house',emoji:'🔥',img:'https://images.unsplash.com/photo-1603360946369-dc9bb6258143?w=600&h=320&fit=crop&q=80',price:'avg. £18pp',why:'Tooting institution for Peshawari chapli kebabs, sajji and karahi — cash-only, halal, and packed every night for good reason',score:87,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','playful'],dietary:['halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Maroush',loc:'Edgware Road · Lebanese restaurant',emoji:'✦',img:'https://images.unsplash.com/photo-1529006557810-274b9b2fc783?w=600&h=320&fit=crop&q=80',price:'avg. £30pp',why:'London\'s original Lebanese since 1981 — charcoal shawarma, fattoush and live music until 2am on Edgware Road',score:85,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','romantic'],dietary:['vegetarian','halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Guanabana',loc:'Camden · Halal Caribbean',emoji:'🌶️',img:'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'100% halal Caribbean on Kentish Town Road — jerk chicken, curry goat and a legendary Caribbean Sunday roast with BYOB',score:84,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','playful'],dietary:['halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'City Jollof',loc:'Old Street · Nigerian street food',emoji:'🍛',img:'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&h=320&fit=crop&q=80',price:'avg. £12pp',why:'All-halal Nigerian jollof rice, suya and plantain — quick, vibrant and punchy West African flavours near Old Street',score:82,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual'],dietary:['halal'],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Jollof Box',loc:'Dalston · Nigerian gourmet boxes',emoji:'🍛',img:'https://images.unsplash.com/photo-1604329760661-e71dc83f8f26?w=600&h=320&fit=crop&q=80',price:'avg. £10pp',why:'Fully halal Nigerian street food — jollof rice boxes named after football legends, with plantain and suya in buzzy Dalston',score:80,type:'fun',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','playful'],dietary:['halal'],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Devran',loc:'Stoke Newington · Turkish ocakbasi',emoji:'🔥',img:'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'Charcoal-grilled Turkish kebabs and pide on Stoke Newington Road — halal meats, generous portions and a 4.5-star local favourite',score:84,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','romantic'],dietary:['vegetarian','halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Beza',loc:'Elephant & Castle · Vegan Ethiopian',emoji:'🇪🇹',img:'https://images.unsplash.com/photo-1511690743698-d9d18f7e20f1?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'100% vegan and gluten-free Ethiopian — sharing platters of misir wot, shuro and gomen on injera at Elephant Park',score:85,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','romantic'],dietary:['vegetarian','vegan','gluten_free'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Merkamo',loc:'Brick Lane · Vegan Ethiopian',emoji:'🇪🇹',img:'https://images.unsplash.com/photo-1511690743698-d9d18f7e20f1?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'Plant-based Ethiopian from a Spitalfields Market veteran — coconut flour dumplings and traditional platters just off Brick Lane',score:83,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual'],dietary:['vegetarian','vegan','gluten_free'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'MukBap',loc:'Shoreditch · Vegan Korean',emoji:'🇰🇷',img:'https://images.unsplash.com/photo-1498654896293-37aacf113fd9?w=600&h=320&fit=crop&q=80',price:'avg. £15pp',why:'London\'s first fully vegan Korean restaurant — tteokbokki, bulgogi bibimbap and kimchi pancakes near Liverpool Street',score:85,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','romantic'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Club Mexicana',loc:'Shoreditch · Vegan Mexican street food',emoji:'🌮',img:'https://images.unsplash.com/photo-1565299585323-38d6b0865b47?w=600&h=320&fit=crop&q=80',price:'avg. £12pp',why:'London\'s original vegan Mexican — Baja to-fish tacos, BBQ jackfruit burritos and loaded nachos on Commercial Street',score:84,type:'fun',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual','playful'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Mildreds',loc:'Soho · Global plant-based',emoji:'🌿',img:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=320&fit=crop&q=80',price:'avg. £25pp',why:'London\'s legendary plant-based restaurant since 1988 — globally inspired vegan dishes and cocktails across three Soho floors',score:88,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'mid',contexts:['partner','friends','solo'],mood:['casual','romantic'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Andu Cafe',loc:'Dalston · Vegan Ethiopian cafe',emoji:'🇪🇹',img:'https://images.unsplash.com/photo-1511690743698-d9d18f7e20f1?w=600&h=320&fit=crop&q=80',price:'avg. £11pp',why:'The UK\'s first Ethiopian vegan cafe — six classic dishes on injera for under £12 on Kingsland Road',score:82,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual'],dietary:['vegetarian','vegan','gluten_free'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'quick',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Tofu Vegan',loc:'Islington · Vegan Chinese',emoji:'🥡',img:'https://images.unsplash.com/photo-1585032226651-759b368d7246?w=600&h=320&fit=crop&q=80',price:'avg. £14pp',why:'Crispy aromatic duck, kung pao chicken and mapo tofu — all plant-based, across three London locations',score:83,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['casual'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Acme Fire Cult',loc:'Dalston · Veg-led live fire',emoji:'🔥',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £35pp',why:'Plant-forward live-fire cooking at 40FT Brewery — aubergine steaks, hearth vegetables and natural wine in an open-air Dalston yard',score:86,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','casual'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['outdoor','indoor'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},],
          treat:[
            {name:'Gymkhana',loc:'Mayfair · Michelin Indian',emoji:'✦',img:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=320&fit=crop&q=80',price:'avg. £100pp',why:'Michelin-starred Indian fine dining — colonial-club interiors and extraordinary tandoor cooking',score:92,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['vegetarian','halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Trishna',loc:'Marylebone · Michelin Indian seafood',emoji:'✦',img:'https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=600&h=320&fit=crop&q=80',price:'avg. £80pp',why:'Michelin-starred coastal Indian — the brown crab is legendary',score:90,type:'foodie',vibes:['Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['vegetarian','pescatarian','halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Brigadiers',loc:'City · Indian sports bar & grill',emoji:'✦',img:'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'BBQ-focused Indian with big screens and beer — loud, fun and unapologetically social',score:84,type:'fun',vibes:['Live music'],venue_status:'active',rel:['friends'],budgetTier:'mid',contexts:['friends'],mood:['casual','nightlife','playful'],dietary:['vegetarian','halal'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Bocca di Lupo',loc:'Soho · Regional Italian',emoji:'✦',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Regional Italian dishes from every corner of Italy — a Soho institution',score:88,type:'foodie',vibes:['Candlelit','Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','casual'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Quality Chop House',loc:'Clerkenwell · Modern British',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £60pp',why:'Grade II-listed chophouse with outstanding seasonal British cooking',score:87,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','relaxed'],dietary:[],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'St. JOHN',loc:'Smithfield · Modern British nose-to-tail',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £60pp',why:'Fergus Henderson\'s nose-to-tail institution — bone marrow, ox heart, warm madeleines',score:89,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','relaxed'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Mountain',loc:'Soho · Spanish & Welsh wood-fired',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £80pp',why:'Brat in Soho — louder, larger, lobster caldereta for the whole table',score:88,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','nightlife'],dietary:['vegetarian'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Sabor',loc:'Mayfair · Michelin Spanish',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £65pp',why:'Michelin-starred Spanish — counter tapas downstairs, Galician suckling pig upstairs',score:91,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'mid',contexts:['partner','friends','solo'],mood:['casual','romantic'],dietary:['vegetarian','pescatarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly','quiet'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Hakkasan Mayfair dinner',loc:'Mayfair · Chinese',emoji:'✦',img:'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',why:'Michelin-starred Cantonese — moody, beautiful and endlessly romantic',score:93,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian','halal'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Dishoom dinner',loc:'Covent Garden · Indian',emoji:'✦',img:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=320&fit=crop&q=80',price:'avg. £33pp',why:'Bold Indian flavours — always unmissable',score:92,type:'romantic',vibes:['Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['casual','romantic'],dietary:['vegetarian','vegan','halal'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Kiln restaurant Soho',loc:'Soho · Thai',emoji:'🔥',img:'https://images.unsplash.com/photo-1555126634-323283e090fa?w=600&h=320&fit=crop&q=80',price:'avg. £40pp',why:'London\'s most exciting Thai — cooked over wood fire, intense flavours',score:89,type:'romantic',vibes:['Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['romantic','casual'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Punchdrunk immersive theatre',loc:'Woolwich · Immersive experience',emoji:'🎭',img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&h=320&fit=crop&q=80',price:'avg. £58pp',why:'Walk through a living world of theatre — completely unique and unforgettable',score:94,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'mid',contexts:['partner','friends','solo'],mood:['cultural','active'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','high_energy'],pace:'extended',fmt:['entertainment','cultural'],weather:'weather_flexible'}},
            {name:'O2 Arena concert night',loc:'Greenwich · Live music',emoji:'🎤',img:'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&h=320&fit=crop&q=80',price:'avg. £50pp',why:'Nothing beats live music together — electric atmosphere',score:88,type:'fun',vibes:['Live music','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['friends'],mood:['nightlife','active','playful'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'extended',fmt:['entertainment'],weather:'weather_flexible'}},
            {name:'The Crystal Maze LIVE Experience',loc:'Farringdon · Immersive game',emoji:'💎',img:'https://images.unsplash.com/photo-1511882150382-421056c89033?w=600&h=320&fit=crop&q=80',price:'avg. £48pp',why:'The iconic TV experience — team challenges across four zones',score:87,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','entertainment'],weather:'weather_flexible'}},
            {name:'Turning Earth pottery class',loc:'Hoxton · Pottery studio',emoji:'🏺',img:'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Make something together — wonderfully silly and surprisingly therapeutic',score:84,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['relaxed','playful'],dietary:[],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'extended',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Ronnie Scott\'s jazz night',loc:'Soho · Live music',emoji:'🎷',img:'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&h=320&fit=crop&q=80',price:'avg. £70pp',why:'London\'s most legendary jazz club — intimate and electric',score:83,type:'cultural',vibes:['Live music','Candlelit'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','nightlife','cultural'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','drinks'],weather:'weather_flexible'}},
            {name:'Electric Cinema, Notting Hill',loc:'Notting Hill · Luxury cinema',emoji:'🎬',img:'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=320&fit=crop&q=80',price:'avg. £75pp',why:'Leather armchairs, footstools, and wine — cinema reimagined',score:85,type:'fun',vibes:['Unique / memorable','Candlelit'],venue_status:'active',rel:['partner','solo'],budgetTier:'mid',contexts:['partner','solo'],mood:['romantic','relaxed','luxury'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','drinks'],weather:'weather_flexible'}},
            {name:'Brat restaurant',loc:'Shoreditch · Modern British',emoji:'🔥',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £80pp',why:'Tomos Parry\'s Michelin-starred Basque grill — outstanding every time',score:90,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:[],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'The Ivy',loc:'Covent Garden · British fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=320&fit=crop&q=80',price:'avg. £75pp',why:'A classic — the theatre crowd\'s favourite post-show supper spot',score:88,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Late opening at the V&A',loc:'Kensington · Private art',emoji:'🖼️',img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Friday late at the V&A — cocktails, live music and galleries after dark',score:85,type:'cultural',vibes:['Unique / memorable','Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'budget',contexts:['partner','friends','solo'],mood:['cultural','nightlife','relaxed'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['cultural','drinks','entertainment'],weather:'weather_flexible'}},
            {name:'Cocktail masterclass at Cahoots',loc:'Soho · Speakeasy bar',emoji:'🍸',img:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=320&fit=crop&q=80',price:'avg. £65pp',why:'Learn to shake cocktails in a 1940s underground speakeasy — fun, intimate and unforgettable',score:88,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['nightlife','playful'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Monk London ice bath & sauna',loc:'Fulham · Wellness',emoji:'🧊',img:'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Cold plunge together — weirdly bonding and incredibly energising',score:84,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'budget',contexts:['partner','friends'],mood:['wellness','active'],dietary:[],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','high_energy'],pace:'quick',fmt:['wellness'],weather:'weather_flexible'}},
            {name:'Cubo matcha ceremony for two',loc:'Shoreditch · Matcha experience',emoji:'🍵',img:'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Private matcha ceremony with a Japanese tea master — whisking, tasting and desserts',score:88,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','relaxed','cultural'],dietary:['vegetarian','vegan'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['cultural','dining'],weather:'weather_flexible'}},
            {name:'F1 Drive London',loc:'Tottenham · Themed karting experience',emoji:'🏎️',img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&h=320&fit=crop&q=80',price:'avg. £65pp',why:'F1-themed karting at Tottenham Hotspur Stadium — immersive, adrenaline-packed and special',score:87,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Taste Film',loc:'Various London · Immersive dining cinema',emoji:'🎬',img:'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&h=320&fit=crop&q=80',price:'avg. £70pp',why:'Multi-course meal synced to a film screening — creative, romantic and utterly unique',score:89,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','cultural','luxury'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','dining'],weather:'weather_flexible'}},
            {name:'Sake no Hana',loc:'Mayfair · Japanese restaurant',emoji:'✦',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £65pp',why:'Sleek Mayfair Japanese — exceptional sashimi and a world-class sake menu',score:86,type:'foodie',vibes:['Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['vegetarian','pescatarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Hawksmoor Guildhall',loc:'City · British steakhouse',emoji:'✦',img:'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&h=320&fit=crop&q=80',price:'avg. £70pp',why:'London\'s best steakhouse — dry-aged British beef, great cocktails, stunning space',score:90,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['halal'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Hutong',loc:'The Shard · Chinese restaurant',emoji:'🐉',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £80pp',why:'Northern Chinese cuisine on the 33rd floor of The Shard — stunning views, exceptional dim sum',score:88,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Monopoly Lifesized',loc:'Tottenham Court Road · Immersive board game',emoji:'🎩',img:'https://images.unsplash.com/photo-1606167668584-78701c57f13d?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Full-size Monopoly board with escape room challenges — chaotic, competitive and brilliant fun',score:83,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['playful','active'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity'],weather:'weather_flexible'}},
            {name:'Mr Fogg\'s Residence',loc:'Mayfair · Victorian cocktail bar',emoji:'🌍',img:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Phileas Fogg\'s Mayfair home — Victorian artefacts, world-inspired cocktails, one of London\'s best bars',score:87,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['drinks'],weather:'weather_flexible'}},
            {name:'Zumbar Barbarossa',loc:'Shoreditch · Cocktail bar & restaurant',emoji:'🍹',img:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=320&fit=crop&q=80',price:'avg. £50pp',why:'Theatrical cocktail bar with exceptional rum and mezcal list — vibrant Shoreditch spot',score:83,type:'fun',vibes:['Unique / memorable','Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['drinks','dining'],weather:'weather_flexible'}},
            {name:'Junkyard minigolf + cocktails Shoreditch',loc:'Shoreditch · Mini golf bar',emoji:'⛳',img:'https://images.unsplash.com/photo-1551698618-1dfe5d97d256?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Multi-level crazy golf through a junkyard — cocktails, street food and proper fun',score:84,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Chessington World of Adventures',loc:'Surrey · Theme park',emoji:'🎢',img:'https://images.unsplash.com/photo-1533294455009-a77b7557d2d1?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Proper theme park day out — rollercoasters, zoo animals, genuinely great fun',score:80,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['day'],env:['outdoor','mixed'],soc:['group_friendly','high_energy'],pace:'extended',fmt:['activity'],weather:'summer_friendly'}},
            {name:'Tough Mudder or Obstacle Course',loc:'Various London · Obstacle racing',emoji:'🏃',img:'https://images.unsplash.com/photo-1476480862126-209bfaa8edc8?w=600&h=320&fit=crop&q=80',price:'avg. £60pp',why:'Mud, obstacles and teamwork — the ultimate bonding experience, unforgettable',score:82,type:'all',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['day'],env:['outdoor'],soc:['group_friendly','high_energy'],pace:'extended',fmt:['activity'],weather:'summer_friendly'}},
            {name:'TopGolf Watford',loc:'Watford · Golf entertainment',emoji:'⛳',img:'https://images.unsplash.com/photo-1535131749006-b7f58c99034b?w=600&h=320&fit=crop&q=80',price:'avg. £50pp',why:'Multi-level driving range with food, drinks and competition — no golf experience needed',score:83,type:'fun',vibes:['Unique / memorable','Outdoor seats'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['active','playful','casual'],dietary:[],t:{tod:['afternoon','evening'],env:['outdoor','mixed'],soc:['group_friendly','high_energy'],pace:'relaxed',fmt:['activity','drinks','dining'],weather:'weather_flexible'}},
            {name:'Poolhouse UK',loc:'Liverpool Street · AI pool bar',emoji:'🎱',img:'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'AI-powered pool tables with instant scoring, cocktails and a slick city setting',score:84,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Platform Experience Shoreditch',loc:'Shoreditch · Gaming bar',emoji:'🎮',img:'https://images.unsplash.com/photo-1535016120720-40c646be5580?w=600&h=320&fit=crop&q=80',price:'avg. £50pp',why:'Private PS5 and Nintendo Switch booths with food and cocktails — gaming date done right',score:83,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['playful','nightlife','casual'],dietary:[],t:{tod:['afternoon','evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Clays Bar',loc:'Moorgate · Virtual clay shooting',emoji:'🎯',img:'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Virtual clay pigeon shooting with cocktails — competitive, social and brilliantly different',score:85,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['playful','active','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'quick',fmt:['activity','drinks'],weather:'weather_flexible'}},
            {name:'Maxwell\'s Bar & Grill',loc:'Covent Garden · American grill',emoji:'🍔',img:'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=600&h=320&fit=crop&q=80',price:'avg. £50pp',why:'Classic American grill in the heart of Covent Garden — burgers, ribs and cocktails',score:82,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','playful'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Flight Club Brunch',loc:'Victoria · Darts & bottomless brunch',emoji:'🎯',img:'https://images.unsplash.com/photo-1504450758481-7338eba7524a?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Social darts with bottomless prosecco and brunch plates — chaotic, competitive and delicious',score:85,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['playful','nightlife','casual'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'extended',fmt:['activity','dining','drinks'],weather:'weather_flexible'}},
            {name:'Ballie Ballerson',loc:'Shoreditch · Ball pit & bottomless brunch',emoji:'🎉',img:'https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?w=600&h=320&fit=crop&q=80',price:'avg. £50pp',why:'Adult ball pit with bottomless cocktails and brunch — ridiculous, joyful and unforgettable',score:84,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['playful','nightlife','casual'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'extended',fmt:['activity','dining','drinks'],weather:'weather_flexible'}},
            {name:'Blame Gloria',loc:'Soho · Party brunch',emoji:'🥂',img:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'London\'s wildest brunch — drag queens, confetti cannons, bottomless cocktails in Soho',score:83,type:'fun',vibes:['Unique / memorable','Live music'],venue_status:'active',rel:['friends'],budgetTier:'mid',contexts:['friends'],mood:['playful','nightlife'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['group_friendly','high_energy'],pace:'extended',fmt:['dining','drinks','entertainment'],weather:'weather_flexible'}},
            {name:'Santo Remedio',loc:'London Bridge · Mexican brunch',emoji:'🌮',img:'https://images.unsplash.com/photo-1529059997568-3d847b1154f0?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'Authentic Mexican brunch with margaritas — tacos al pastor, chilaquiles and horchata',score:84,type:'foodie',vibes:['Walkable','Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','playful'],dietary:['vegetarian'],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Scarlett Green',loc:'Soho · Antipodean brunch',emoji:'🥑',img:'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&h=320&fit=crop&q=80',price:'avg. £45pp',why:'All-day Antipodean brunch in Soho — smashed avo, acai bowls, excellent flat whites',score:82,type:'foodie',vibes:['Walkable'],venue_status:'active',rel:['partner','friends','solo'],budgetTier:'mid',contexts:['partner','friends','solo'],mood:['casual','relaxed'],dietary:['vegetarian','vegan'],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Thorpe Park',loc:'Surrey · Theme park',emoji:'🎢',img:'https://images.unsplash.com/photo-1533294455009-a77b7557d2d1?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'London\'s nearest thrill park — Stealth, Nemesis Inferno, Saw — proper adrenaline day out',score:81,type:'fun',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['active','playful'],dietary:[],t:{tod:['day'],env:['outdoor','mixed'],soc:['group_friendly','high_energy'],pace:'extended',fmt:['activity'],weather:'summer_friendly'}},
            {name:'Gilgamesh',loc:'Covent Garden · Pan-Asian restaurant & bar',emoji:'🐉',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £75pp',why:'Babylonian-inspired pan-Asian dining with live DJ — Japanese, Chinese and Southeast Asian sharing plates',score:86,type:'foodie',vibes:['Candlelit','Unique / memorable','Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury','nightlife'],dietary:['vegetarian'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Speedboat Bar',loc:'Chinatown · Thai-Chinese bar',emoji:'🍜',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £50pp',why:'Lively Thai-Chinese bar from the Samsen team — bold flavours, great cocktails, buzzy Chinatown spot',score:84,type:'foodie',vibes:['Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['casual','nightlife','playful'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly','high_energy'],pace:'relaxed',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Som Saa',loc:'Shoreditch · Thai restaurant',emoji:'🌶️',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Authentic regional Thai in a beautiful Shoreditch warehouse — fiery, fragrant and exceptional',score:87,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','casual'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Kolae',loc:'Borough Market · Thai restaurant',emoji:'🌶️',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Southern Thai wood-fire cooking by Borough Market — smoky, complex and genuinely authentic',score:86,type:'foodie',vibes:['Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','casual'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Camille',loc:'Borough Market · French bistro',emoji:'🇫🇷',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',why:'Time Out\'s best French restaurant in London — classic bistro cooking done perfectly',score:88,type:'foodie',vibes:['Candlelit','Walkable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','casual'],dietary:['vegetarian','pescatarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Galvin La Chapelle',loc:'Spitalfields · French fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £85pp',why:'Michelin-starred French in a stunning Grade II listed chapel — truly special occasion dining',score:89,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['vegetarian','pescatarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'64 Goodge Street',loc:'Fitzrovia · French restaurant',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £75pp',why:'Michelin-starred modern French in Fitzrovia — refined, seasonal and beautifully understated',score:87,type:'foodie',vibes:['Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','relaxed'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
          ],
          luxury:[
            {name:'Lilibet\'s',loc:'Mayfair · Fine dining seafood',emoji:'🦞',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £150pp',why:'Elegant Mayfair seafood restaurant — oysters, lobster and champagne in a stunning Bruton Street setting',score:89,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:[],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Sketch, Mayfair',loc:'Mayfair · Modern European',emoji:'🎨',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',why:'The egg-pod bathrooms, the pink dining room — truly unforgettable',score:85,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Novikov restaurant',loc:'Mayfair · Italian & Asian',emoji:'🥂',img:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=320&fit=crop&q=80',price:'avg. £100pp',why:'Mayfair\'s most glamorous see-and-be-seen dining room',score:88,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury','nightlife'],dietary:['vegetarian','pescatarian'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Bob Bob Ricard dinner',loc:'Soho · Anglo-Russian',emoji:'🍾',img:'https://images.unsplash.com/photo-1550966871-3ed3cbe818bb?w=600&h=320&fit=crop&q=80',price:'avg. £85pp',why:'Press for champagne buttons at every table — impossibly fun',score:91,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury','playful'],dietary:['vegetarian'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Aqua Shard cocktails + dinner',loc:'London Bridge · Rooftop views',emoji:'🌆',img:'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=320&fit=crop&q=80',price:'avg. £95pp',why:'31st-floor views of London — the most romantic skyline in the city',score:87,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian','pescatarian'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'AIRE Ancient Baths couples',loc:'Bayswater · Thermal spa',emoji:'🧖',img:'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&h=320&fit=crop&q=80',price:'avg. £95pp',why:'Candlelit thermal baths, salt flotation and massage — deeply romantic',score:92,type:'romantic',vibes:['Candlelit'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','wellness','luxury'],dietary:[],t:{tod:['day','afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['wellness'],weather:'weather_flexible'}},
            {name:'The Savoy afternoon tea + dinner',loc:'Strand · Classic London',emoji:'✦',img:'https://images.unsplash.com/photo-1563865436874-9aef32095fad?w=600&h=320&fit=crop&q=80',price:'avg. £140pp',why:'The most iconic hotel in London — impeccable and intimate',score:91,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Core by Clare Smyth',loc:'Notting Hill · ★★★ Michelin',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £190pp',why:'Three stars, one of the world\'s best restaurants — truly exceptional',score:88,type:'foodie',vibes:['Candlelit','Tasting menu'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Bateaux London dinner cruise',loc:'Thames · Luxury',emoji:'✦',img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&h=320&fit=crop&q=80',price:'avg. £160pp',why:'Fine dining gliding past the lit-up London skyline — romantic perfection',score:93,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['evening','night'],env:['mixed'],soc:['intimate','quiet'],pace:'extended',fmt:['dining','entertainment'],weather:'summer_friendly'}},
            {name:'Royal Opera House',loc:'Covent Garden · Opera & ballet',emoji:'✦',img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',why:'World-class opera and ballet in one of London\'s most iconic buildings',score:94,type:'cultural',vibes:['Unique / memorable','Candlelit'],venue_status:'active',rel:['partner','solo'],budgetTier:'mid',contexts:['partner','solo'],mood:['cultural','luxury'],dietary:[],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','cultural'],weather:'weather_flexible'}},
            {name:'Helicopter city tour at sunset',loc:'London · Private experience',emoji:'✦',img:'https://images.unsplash.com/photo-1534397860164-120c97f4db0b?w=600&h=320&fit=crop&q=80',price:'avg. £225pp',why:'See all of London from above at golden hour — nothing more memorable',score:96,type:'romantic',vibes:['Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury','active'],dietary:[],t:{tod:['afternoon','evening'],env:['outdoor'],soc:['intimate'],pace:'quick',fmt:['activity'],weather:'summer_friendly'}},
            {name:'Chiltern Firehouse dinner',loc:'Marylebone · Celebrity hotspot',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £150pp',why:'London\'s most glamorous restaurant — the place to see and be seen',score:92,type:'romantic',vibes:['Unique / memorable','Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'luxury',contexts:['partner','friends'],mood:['romantic','luxury','nightlife'],dietary:['vegetarian'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Alain Ducasse at The Dorchester',loc:'Park Lane · French fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=320&fit=crop&q=80',price:'avg. £210pp',why:'Three Michelin stars — the absolute pinnacle of London dining',score:92,type:'foodie',vibes:['Candlelit','Tasting menu'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Glyndebourne opera at sunset',loc:'East Sussex · Outdoor opera',emoji:'✦',img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&h=320&fit=crop&q=80',price:'avg. £240pp',why:'Champagne picnic in the grounds then world-class opera — utterly magical',score:95,type:'cultural',vibes:['Unique / memorable','Outdoor seats','Candlelit'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['cultural','luxury','outdoors','romantic'],dietary:[],t:{tod:['afternoon','evening'],env:['outdoor'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','cultural','dining'],weather:'summer_friendly'}},
            {name:'Kensington Palace private tour',loc:'Kensington · Historic',emoji:'✦',img:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=320&fit=crop&q=80',price:'avg. £120pp',why:'After-hours royal palace — the most exclusive cultural experience in London',score:97,type:'cultural',vibes:['Unique / memorable','Candlelit'],venue_status:'active',rel:['partner','solo'],budgetTier:'mid',contexts:['partner','solo'],mood:['cultural','luxury'],dietary:[],t:{tod:['evening'],env:['indoor','mixed'],soc:['intimate','quiet'],pace:'extended',fmt:['cultural'],weather:'weather_flexible'}},
            {name:'Cowshed Spa at Soho House',loc:'Shoreditch · Luxury spa',emoji:'💆',img:'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=600photo-1540555700478-4be289fbec6d?w=600&h=320&fit=crop&q=80h=320photo-1540555700478-4be289fbec6d?w=600&h=320&fit=crop&q=80fit=cropphoto-1540555700478-4be289fbec6d?w=600&h=320&fit=crop&q=80q=80',price:'avg. £180pp',why:'Full couples spa day — massage, facial, pool and rooftop at Soho House',score:93,type:'romantic',vibes:['Candlelit'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['wellness','luxury','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['wellness'],weather:'weather_flexible'}},
            {name:'Bamford Wellness Spa retreat',loc:'The Berkshires · Country retreat',emoji:'🌿',img:'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=600&h=320&fit=crop&q=80',price:'avg. £280pp',why:'Escape the city completely — yoga, nature walks and hydrotherapy in the countryside',score:94,type:'outdoor',vibes:['Walkable'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['wellness','luxury','outdoors','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['outdoor','mixed'],soc:['intimate','quiet'],pace:'extended',fmt:['wellness','walk'],weather:'summer_friendly'}},
            {name:'Private tasting menu at The Clove Club',loc:'Shoreditch · Modern British',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £165pp',why:'Michelin-starred tasting menu in a former town hall — inventive, seasonal, unforgettable',score:91,type:'foodie',vibes:['Candlelit','Tasting menu'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian','pescatarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Afternoon tea at The Ritz',loc:'Piccadilly · Iconic luxury',emoji:'✦',img:'https://images.unsplash.com/photo-1563865436874-9aef32095fad?w=600&h=320&fit=crop&q=80',price:'avg. £85pp',why:'The most iconic afternoon tea in London — gilded, formal and extraordinary',score:90,type:'romantic',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury','relaxed'],dietary:['vegetarian'],t:{tod:['afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Couples spa ritual at ESPA Life',loc:'Westminster · Luxury spa',emoji:'💆',img:'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&h=320&fit=crop&q=80',price:'avg. £200pp',why:'Full-day couples treatment at the Corinthia — London\'s most indulgent spa',score:93,type:'romantic',vibes:['Candlelit'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['wellness','luxury','relaxed'],dietary:[],t:{tod:['day','afternoon'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['wellness'],weather:'weather_flexible'}},
            {name:'Rooftop champagne at Shangri-La',loc:'The Shard · Sky bar',emoji:'🥂',img:'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&h=320&fit=crop&q=80',price:'avg. £120pp',why:'Champagne on the 52nd floor — the highest hotel bar in Western Europe',score:90,type:'romantic',vibes:['Unique / memorable','Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['romantic','luxury','nightlife'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'relaxed',fmt:['drinks'],weather:'weather_flexible'}},
            {name:'Jazz supper at Ronnie Scott\'s',loc:'Soho · Jazz & dining',emoji:'🎷',img:'https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=600&h=320&fit=crop&q=80',price:'avg. £130pp',why:'Front-row jazz with a three-course meal — London\'s most legendary music club',score:91,type:'cultural',vibes:['Live music','Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['cultural','luxury','nightlife','romantic'],dietary:[],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','dining'],weather:'weather_flexible'}},
            {name:'Chef\'s table at Climpson\'s Arch',loc:'Hackney · Open kitchen',emoji:'🔥',img:'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&h=320&fit=crop&q=80',price:'avg. £95pp',why:'Sit at the pass and watch every dish made — intimate, theatrical and delicious',score:88,type:'foodie',vibes:['Unique / memorable','Candlelit'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','luxury'],dietary:[],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Electric Cinema double bill + dinner',loc:'Notting Hill · Luxury cinema',emoji:'🎬',img:'https://images.unsplash.com/photo-1478720568477-152d9b164e26?w=600&h=320&fit=crop&q=80',price:'avg. £110pp',why:'Leather beds, cashmere blankets and wine — cinema elevated to an art form',score:87,type:'fun',vibes:['Unique / memorable','Candlelit'],venue_status:'active',rel:['partner'],budgetTier:'mid',contexts:['partner'],mood:['romantic','luxury','relaxed'],dietary:[],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['entertainment','dining'],weather:'weather_flexible'}},
            {name:'Luxury wine tasting at 67 Pall Mall',loc:'St James · Wine club',emoji:'🍷',img:'https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=600&h=320&fit=crop&q=80',price:'avg. £140pp',why:'World-class wines in a stunning Victorian townhouse — for serious wine lovers',score:89,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner','friends'],budgetTier:'mid',contexts:['partner','friends'],mood:['cultural','luxury'],dietary:[],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['drinks','cultural'],weather:'weather_flexible'}},
            {name:'The Ledbury',loc:'Notting Hill · Modern European tasting menu',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £225pp',why:'Three-Michelin-star modern dining — Brett Graham\'s farm-to-plate masterpiece',score:96,type:'foodie',vibes:['Candlelit','Tasting menu'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Restaurant Gordon Ramsay',loc:'Chelsea · French fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £260pp',why:'Three-Michelin-star French — Gordon Ramsay\'s flagship, jacket preferred',score:95,type:'foodie',vibes:['Candlelit','Tasting menu'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'PIRANA London',loc:'Mayfair · Nikkei fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £150pp',why:'Japanese-Peruvian fine dining with live DJ — ceviche, robata grill and sake in a stunning Mayfair setting',score:90,type:'foodie',vibes:['Candlelit','Unique / memorable','Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'luxury',contexts:['partner','friends'],mood:['romantic','luxury','nightlife'],dietary:['vegetarian','pescatarian'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining','drinks'],weather:'weather_flexible'}},
            {name:'Imperial Treasure',loc:'St James\'s · Michelin Cantonese',emoji:'✦',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £160pp',why:'Michelin-starred Cantonese fine dining — Peking duck with caviar, dim sum perfection',score:91,type:'foodie',vibes:['Candlelit','Unique / memorable'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Park Chinois',loc:'Mayfair · Shanghai cabaret dining',emoji:'✦',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £180pp',why:'1930s Shanghai supper club — Cantonese cuisine, live jazz, cabaret and champagne in Mayfair',score:92,type:'romantic',vibes:['Candlelit','Unique / memorable','Live music'],venue_status:'active',rel:['partner','friends'],budgetTier:'luxury',contexts:['partner','friends'],mood:['romantic','luxury','nightlife'],dietary:['vegetarian'],t:{tod:['evening','night'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining','drinks','entertainment'],weather:'weather_flexible'}},
            {name:'Royal China Club',loc:'Marylebone · Cantonese restaurant',emoji:'✦',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £120pp',why:'Hong Kong Cantonese classics with luxury ingredients — the best dim sum trolley in London',score:88,type:'foodie',vibes:['Candlelit'],venue_status:'active',rel:['partner','friends'],budgetTier:'luxury',contexts:['partner','friends'],mood:['romantic','luxury'],dietary:['vegetarian','pescatarian'],t:{tod:['afternoon','evening'],env:['indoor','rain_safe'],soc:['intimate','group_friendly'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'AngloThai',loc:'Marylebone · Thai-British fusion',emoji:'✦',img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&h=320&fit=crop&q=80',price:'avg. £150pp',why:'Michelin-starred Thai-British fusion — inventive tasting menus that redefine both cuisines',score:90,type:'foodie',vibes:['Candlelit','Tasting menu'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
            {name:'Helene Darroze at The Connaught',loc:'Mayfair · French fine dining',emoji:'✦',img:'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=600&h=320&fit=crop&q=80',price:'avg. £250pp',why:'Three Michelin stars at The Connaught — among the finest French dining experiences in the world',score:95,type:'foodie',vibes:['Candlelit','Tasting menu'],venue_status:'active',rel:['partner'],budgetTier:'luxury',contexts:['partner'],mood:['romantic','luxury'],dietary:['vegetarian'],t:{tod:['evening'],env:['indoor','rain_safe'],soc:['intimate','quiet'],pace:'extended',fmt:['dining'],weather:'weather_flexible'}},
          ]
        };

        // ═══════════════════════════════════════════════════════
        // Data Layer — DB-backed venues with offline fallback
        // ═══════════════════════════════════════════════════════

        // Local venue cache — loaded from DB, falls back to IDEAS
        let _venueCache=null;
        let _venueCacheExpiry=0;
        const _VENUE_CACHE_TTL=15*60*1000; // 15 minutes

        // Provider adapters — isolated per provider
        const _providerAdapters={
          opentable:{
            name:'OpenTable',
            buildUrl(venue,params){
              // Construct an OpenTable search URL with optional date/party params
              const q=encodeURIComponent(venue.name);
              let url='https://www.opentable.co.uk/s?term='+q;
              if(params?.covers)url+='&covers='+params.covers;
              if(params?.date)url+='&dateTime='+params.date;
              return url;
            },
            parseAvailability(data){return data;} // placeholder for future API integration
          },
          'google-places':{
            name:'Google Places',
            buildSearchUrl(query,loc){
              return'https://www.google.com/maps/search/'+encodeURIComponent(query+' '+loc);
            },
            parseResults(data){return data;}
          },
          'venue-direct':{
            name:'Venue Website',
            buildUrl(venue){return venue.booking_url||null;}
          }
        };

        // Load venues from Supabase → local cache
        async function _loadVenuesFromDB(budgetTier){
          // Check cache
          if(_venueCache&&Date.now()<_venueCacheExpiry){
            return budgetTier?_venueCache.filter(v=>v.budget_tier===budgetTier):_venueCache;
          }
          // Try DB with timeout — never block generation
          if(_sb){
            try{
              const _timeout=new Promise(r=>setTimeout(()=>r({data:null,error:{message:'timeout'}}),3000));
              const{data,error}=await Promise.race([
                _sb.from('venues')
                  .select('*,booking_links(booking_url,booking_type,is_verified,is_primary,providers(slug,name))')
                  .eq('is_active',true)
                  .order('curation_score',{ascending:false}),
                _timeout
              ]);
              if(!error&&data&&data.length){
                _venueCache=data.map(_dbVenueToIdea);
                _venueCacheExpiry=Date.now()+_VENUE_CACHE_TTL;
                localStorage.setItem('t4t_venue_cache',JSON.stringify({ts:Date.now(),data:_venueCache}));
                return budgetTier?_venueCache.filter(v=>v.budget_tier===budgetTier):_venueCache;
              }
              // On timeout/error, set a short negative cache so subsequent tier calls don't retry
              if(!_venueCache){_venueCache=[];_venueCacheExpiry=Date.now()+10000;}
            }catch(e){_captureError(e,{context:'venue_fetch',source:'_loadVenuesFromDB'});}
          }
          // Try localStorage cache
          try{
            const cached=JSON.parse(localStorage.getItem('t4t_venue_cache')||'null');
            if(cached&&cached.data&&cached.data.length&&(Date.now()-cached.ts)<24*60*60*1000){
              _venueCache=cached.data;
              _venueCacheExpiry=Date.now()+_VENUE_CACHE_TTL;
              return budgetTier?_venueCache.filter(v=>v.budget_tier===budgetTier):_venueCache;
            }
          }catch(e){}
          // Final fallback: hardcoded IDEAS
          return null;
        }

        // Transform a DB venue row into the format the plan engine expects
        function _dbVenueToIdea(row){
          // Extract primary booking link
          const links=row.booking_links||[];
          const primary=links.find(l=>l.is_primary)||links[0];
          return{
            name:row.name,
            loc:(row.area||'London')+' · '+(row.cuisine||row.category),
            emoji:row.emoji||'✦',
            img:row.image_url||'',
            price:row.price_label||'',
            why:row.short_description||'',
            score:row.curation_score||50,
            type:row.venue_type==='restaurant'?(row.vibes?.includes('Candlelit')?'romantic':'foodie')
                :row.category==='outdoors'?'outdoor'
                :row.category==='culture'?'cultural'
                :row.category==='nightlife'?'fun'
                :'all',
            vibes:row.vibes||[],
            // DB-backed fields
            budget_tier:row.budget_tier,
            category:row.category,
            _setting:row.setting||'indoor',
            time_fit:row.time_fit||'evening',
            duration_mins:row.duration_mins||90,
            bookable:primary?.booking_type||'partner_handoff',
            _area:row.area_zone||'central',
            _dbId:row.id,
            _bookingUrl:primary?.booking_url||null,
            _bookingProvider:primary?.providers?.name||null,
            _bookingVerified:primary?.is_verified||false,
            _lastVerified:row.last_verified_at,
            _source:row.source||'curated',
            veg_friendly:row.veg_friendly!==false,
          };
        }

        // Get booking info — checks DB-backed data first, then registry
        function _getBookingInfoFromDB(venue){
          // If venue came from DB with booking data
          if(venue._bookingUrl){
            const ls=venue._bookingVerified?'verified':'unverified';
            return{booking_url:venue._bookingUrl,website_url:venue._bookingUrl,provider:venue._bookingProvider||'Venue',verified:venue._bookingVerified,link_status:ls,has_website:true};
          }
          // Fall back to hardcoded registry
          return _getBookingInfo(venue.name);
        }

        // Invalidate venue cache (call after admin edits)
        function _invalidateVenueCache(){
          _venueCache=null;
          _venueCacheExpiry=0;
          localStorage.removeItem('t4t_venue_cache');
        }

        // ═══════════════════════════════════════════════════════
        // Plan Engine — deterministic rules-based recommendations
        // ═══════════════════════════════════════════════════════

        function _classifyVenue(v){
          const nm=v.name.toLowerCase(),lc=v.loc.toLowerCase();
          // Category → maps to onboarding interest tags
          let cat='dining';
          if(/yoga|spa|bath|pilates|wellness|sauna|massage|flotation|ice bath/.test(nm))cat='wellness';
          else if(/boxing|\bgym\b|fitness|karting|\bpadel\b|climbing|bxr|kobox|\bframe\b|reformer|k1 speed|daytona|f1 drive|motorsport/.test(nm))cat='active';
          else if(/bowl|axe|throwing|escape|crazy golf|crazy putt|swingers|toca|go-kart|comedy|concert|jazz|ronnie|o2 arena|boom battle|shoreditch balls|puttshack|mini golf/.test(nm))cat='nightlife';
          else if(/theatre|opera|globe|cinema|gallery|museum|tate|bfi|secret cinema|crystal maze|pottery|turning earth|palace|lightroom|taste film/.test(nm))cat='culture';
          else if(/park|garden|hike|walk|boating|rooftop film|\bmarket\b|thames|leake|alexandra|sunset|picnic/.test(nm))cat='outdoors';
          else if(v.type==='outdoor'&&!/dinner|restaurant|brunch/.test(nm))cat='outdoors';
          else if(v.type==='cultural')cat='culture';
          else if(v.type==='fun')cat='nightlife';
          // Setting
          let sett='indoor';
          if(/park|garden|hike|walk|rooftop|street art|thames|boating|market|outdoor|sunset|picnic/.test(nm))sett='outdoor';
          else if(v.type==='outdoor'||v.vibes.includes('Outdoor seats'))sett='both';
          else if(v.vibes.includes('Walkable'))sett='both';
          // Time fit
          let tf='evening';
          if(/brunch|market|park|garden|gallery|museum|tate|walk|sunrise|morning|hike|picnic/.test(nm))tf='daytime';
          else if(cat==='active'||cat==='wellness')tf='any';
          // Duration (minutes)
          let dur=90;
          if(cat==='active')dur=60;
          if(cat==='culture')dur=120;
          if(/afternoon tea|tasting|cruise|opera|theatre|secret cinema/.test(nm))dur=150;
          if(/walk|market|park|street art/.test(nm))dur=90;
          if(/spa|bath|couples|retreat/.test(nm))dur=120;
          // Bookable status
          let bk='partner_handoff';
          if(cat==='dining')bk='bookable_now';
          if(v.price.toLowerCase().includes('free')||/walk|park|street art|leake/.test(nm))bk='details_only';
          // Area
          let ar='central';
          if(/shoreditch|hoxton|bermondsey|peckham|islington|camden|notting hill|chelsea|king.s road|battersea|fulham|various/.test(lc))ar='local';
          else if(/richmond|kew|greenwich|stratford|o2|north london|berkshire|east sussex/.test(lc))ar='anywhere';
          // Carry through taxonomy tags from venue data
          const relTags=v.rel||['partner','friends','solo'];
          const moodTags=v.mood||[];
          const budgetBand=_budgetBandForPrice(v.price);
          // Sub-tags: t.tod (time_of_day), t.env (environment), t.soc (social), t.pace, t.fmt (format), t.weather
          const subTags=v.t||{};
          // Venue is fully tagged if it has rel, mood, AND sub-tags
          const isTagged=!!(v.rel&&v.mood&&v.mood.length&&v.t&&v.t.tod&&v.t.env);
          return Object.assign({},v,{category:cat,_setting:sett,time_fit:tf,duration_mins:dur,bookable:bk,_area:ar,rel:relTags,mood:moodTags,t:subTags,_budgetBand:budgetBand,_isTagged:isTagged});
        }

        function _scoreVenue(v,prefs){
          let s=50;
          const t=v.t||{};
          if(prefs.interests&&prefs.interests.length){
            if(prefs.interests.includes(v.category))s+=15;
            else s+=2;
          }
          // ── Sub-tag precision: environment ──
          if(prefs.setting&&prefs.setting!=='both'){
            if(t.env&&t.env.length){
              if(t.env.includes(prefs.setting)||t.env.includes('mixed'))s+=12;
              else s-=10;
            }else{
              if(v._setting===prefs.setting||v._setting==='both')s+=10;
              else s-=8;
            }
          }
          // ── Sub-tag precision: time of day ──
          if(prefs.time_preference&&prefs.time_preference!=='any'){
            const todMap={daytime:['day','afternoon'],evening:['evening','afternoon'],late_night:['night','evening']};
            const wanted=todMap[prefs.time_preference]||[];
            if(t.tod&&t.tod.length&&wanted.length){
              if(t.tod.some(x=>wanted.includes(x)))s+=12;
              else s-=12; // hard mismatch — nighttime venue for daytime filter
            }else{
              if(v.time_fit===prefs.time_preference||v.time_fit==='any')s+=10;
              else s-=5;
            }
          }
          // ── Sub-tag precision: social format ──
          const relCtx=prefs._relContext||_activeRelContext||'partner';
          if(t.soc&&t.soc.length){
            const socMap={partner:['intimate','quiet'],friends:['group_friendly','high_energy'],solo:['intimate','quiet']};
            const wanted=socMap[relCtx]||[];
            if(t.soc.some(x=>wanted.includes(x)))s+=8;
            else s-=6;
          }
          // ── Sub-tag precision: pace ──
          if(prefs.energy_level==='low'){
            if(t.pace==='relaxed'||t.pace==='extended')s+=6;
            if(t.pace==='quick'&&t.soc&&t.soc.includes('high_energy'))s-=6;
            if(['dining','wellness'].includes(v.category))s+=10;
            if(v.category==='active')s-=10;
          }else if(prefs.energy_level==='high'){
            if(t.pace==='quick'||t.soc&&t.soc.includes('high_energy'))s+=6;
            if(['active','outdoors','nightlife'].includes(v.category))s+=10;
          }
          // ── Sub-tag: weather safety ──
          if(_weatherCode>=0){
            const rainy=[51,53,55,61,63,65,71,73,75,80,81,82,95,96,99].includes(_weatherCode);
            if(rainy&&t.weather==='summer_friendly')s-=12;
            if(rainy&&t.env&&t.env.includes('rain_safe'))s+=6;
          }
          if(prefs.travel_radius==='central'&&v._area==='central')s+=5;
          else if(prefs.travel_radius==='central'&&v._area==='anywhere')s-=8;
          if(prefs.travel_radius==='local'&&v._area!=='anywhere')s+=5;
          s+=Math.round((v.score||50)/10);
          // Boost verified-live links, penalise unverified/broken/unavailable
          const _bi=_getBookingInfo(v.name);
          if(_isVenueVerifiedLive(v.name))s+=8;
          else if(_bi.link_status==='unavailable')s-=15;
          else if(_bi.link_status==='needs_review')s-=12;
          else if(_bi.link_status==='unverified')s-=8;
          else if(_bi.link_status==='website_only')s-=6;
          else if(v._unverifiedLink)s-=10;
          // ── Refine filters scoring ──
          if(_rfActive&&typeof _rfFilters!=='undefined'){
            const rf=_rfFilters;
            const nm=v.name.toLowerCase();
            const lc=(v.loc||'').toLowerCase();
            // Setting filter (strong) — uses sub-tags when available
            if(rf.setting==='rain_safe'){
              // Rain-safe: boost venues with rain_safe env tag
              if(t.env&&t.env.includes('rain_safe'))s+=15;
              else if(t.env&&t.env.includes('indoor'))s+=10;
              else s-=15;
            }else if(rf.setting&&rf.setting!=='both'){
              if(t.env&&t.env.length){
                if(t.env.includes(rf.setting)||t.env.includes('mixed'))s+=12;
                else s-=15;
              }else{
                if(v._setting===rf.setting||v._setting==='both')s+=12;
                else s-=15;
              }
            }
            // Pace filter — uses sub-tags
            if(rf.pace&&t.pace){
              if(t.pace===rf.pace)s+=10;
              else s-=8;
            }
            // Time filter — uses sub-tags for precision
            if(rf.time){
              const todMap={daytime:['day','afternoon'],evening:['evening','afternoon'],late_night:['night','evening'],weekend:['day','afternoon','evening']};
              const wanted=todMap[rf.time]||[];
              if(t.tod&&t.tod.length&&wanted.length){
                if(t.tod.some(x=>wanted.includes(x)))s+=12;
                else s-=15; // hard mismatch
              }else{
                const tfMap={daytime:'daytime',evening:'evening',late_night:'evening',weekend:'any'};
                const w=tfMap[rf.time]||'any';
                if(w!=='any'){
                  if(v.time_fit===w||v.time_fit==='any')s+=10;
                  else s-=12;
                }
              }
            }
            // Area filter — match London zones
            if(rf.area){
              const areaTerms={
                central:/mayfair|soho|covent garden|south bank|waterloo|holborn|strand|barbican|farringdon|city|westminster|marylebone|fitzrovia|bloomsbury|london bridge|bank|clerkenwell/,
                east:/shoreditch|hoxton|hackney|bethnal|whitechapel|stratford|canary wharf|bermondsey|peckham|mile end|bow|poplar|wapping|docklands|liverpool street/,
                south:/brixton|clapham|battersea|dulwich|greenwich|lewisham|balham|tooting|fulham|putney|vauxhall|elephant|kennington|camberwell|crystal palace|borough/,
                north:/camden|islington|angel|highgate|hampstead|finsbury|stoke newington|dalston|archway|muswell|wood green|tottenham|finchley|caledonian/,
                west:/notting hill|chelsea|kensington|richmond|kew|bayswater|hammersmith|shepherd|ealing|chiswick|paddington|holland park|king.s road/
              };
              const rx=areaTerms[rf.area];
              if(rx){
                if(rx.test(lc))s+=15;
                else s-=10;
              }
            }
            // Date style filter
            if(rf.style&&rf.style.length){
              const styleMap={
                romantic:{cats:['dining','wellness'],vibes:['Candlelit'],types:['romantic','foodie']},
                playful:{cats:['nightlife','active'],vibes:['Unique / memorable'],types:['fun']},
                calm:{cats:['dining','wellness','outdoors'],vibes:['Walkable'],types:['outdoor']},
                cultured:{cats:['culture'],vibes:['Unique / memorable'],types:['cultural']},
                active:{cats:['active','nightlife'],vibes:['Unique / memorable'],types:['fun','all']}
              };
              let styleMatch=0;
              rf.style.forEach(st=>{
                const m=styleMap[st];
                if(m){
                  if(m.cats.includes(v.category))styleMatch+=8;
                  if(m.types.includes(v.type))styleMatch+=5;
                  if(v.vibes&&m.vibes.some(vb=>v.vibes.includes(vb)))styleMatch+=3;
                }
              });
              if(styleMatch>0)s+=Math.min(styleMatch,18);
              else s-=8;
            }
            // Food preference filter
            if(rf.food){
              if(rf.food==='dinner'){
                if(v.category==='dining')s+=10;
              }else if(rf.food==='drinks'){
                if(/cocktail|bar|wine|rooftop/.test(nm))s+=10;
                else if(v.category==='dining')s-=5;
              }else if(rf.food==='activity_first'){
                if(v.category!=='dining')s+=10;
                else s-=5;
              }else if(rf.food==='no_food'){
                if(v.category==='dining')s-=20;
                else s+=8;
              }else if(rf.food==='veg_friendly'){
                const d=v.dietary||[];
                if(d.includes('vegetarian')||d.includes('vegan'))s+=10;
                else{const fmt=v.t&&v.t.fmt?v.t.fmt:[];if(fmt.includes('dining'))s-=15;}
              }
            }
            // Occasion filter — adjust archetypes via prefs.date_mode
            if(rf.occasion==='first_date'){
              // Boost impressive but not overwhelming venues
              if(v.score>=80&&v.score<=92)s+=8;
              if(v.category==='dining'||v.category==='culture')s+=5;
            }else if(rf.occasion==='anniversary'){
              // Boost premium/romantic
              if(v.type==='romantic'||v.type==='foodie')s+=10;
              if(v.vibes&&v.vibes.includes('Candlelit'))s+=5;
            }else if(rf.occasion==='friends'){
              // Boost social/fun
              if(['nightlife','active'].includes(v.category))s+=10;
            }
          }
          return Math.min(99,Math.max(10,s));
        }

        const _PLAN_ARCHETYPES=[
          {id:'romantic_evening',name:'Evening Out',min:2,max:2,
          slots:[{cats:['dining'],role:'Dinner',req:true},{cats:['nightlife','culture'],role:'Entertainment',req:false}],
          forModes:['couple','solo'],forEnergy:['low','moderate']},
          {id:'dinner_activity',name:'Dinner & Activity',min:2,max:2,
          slots:[{cats:['active','nightlife','culture'],role:'Activity',req:true},{cats:['dining'],role:'Dinner',req:true}],
          forModes:['couple','friends','solo'],forEnergy:['moderate','high']},
          {id:'cultural_night',name:'Cultural Night Out',min:2,max:2,
          slots:[{cats:['culture'],role:'Cultural experience',req:true},{cats:['dining'],role:'Dinner',req:true}],
          forModes:['couple','solo','friends'],forEnergy:['low','moderate']},
          {id:'outdoor_day',name:'Day Adventure',min:2,max:3,
          slots:[{cats:['outdoors'],role:'Outdoor activity',req:true},{cats:['dining','outdoors'],role:'Food & drink',req:true},{cats:['active','culture'],role:'Afternoon activity',req:false}],
          forModes:['couple','solo','friends'],forEnergy:['moderate','high']},
          {id:'wellness_dine',name:'Wellness & Dine',min:2,max:2,
          slots:[{cats:['wellness'],role:'Wellness',req:true},{cats:['dining'],role:'Dinner',req:true}],
          forModes:['couple','solo'],forEnergy:['low','moderate']},
          {id:'group_night',name:'Group Night Out',min:2,max:3,
          slots:[{cats:['nightlife','active'],role:'Group activity',req:true},{cats:['dining'],role:'Dinner',req:true},{cats:['nightlife'],role:'Late night',req:false}],
          forModes:['friends'],forEnergy:['moderate','high']},
          {id:'solo_explore',name:'Solo Exploration',min:2,max:2,
          slots:[{cats:['culture','outdoors'],role:'Explore',req:true},{cats:['dining'],role:'Treat yourself',req:false}],
          forModes:['solo'],forEnergy:['low','moderate','high']},
          {id:'full_day',name:'Full Day Out',min:3,max:3,
          slots:[{cats:['outdoors','culture'],role:'Morning',req:true},{cats:['dining'],role:'Lunch',req:true},{cats:['active','nightlife','culture'],role:'Afternoon',req:true}],
          forModes:['couple','friends'],forEnergy:['high']}
        ];

        function _parseCost(ps){const m=ps.match(/£(\d+)/);return m?parseInt(m[1]):30;}

        function _fmtDuration(mins){
          if(mins<60)return mins+' min';
          const h=Math.floor(mins/60),m=mins%60;
          return m>0?h+'h '+m+'m':h+(h===1?' hour':' hours');
        }

        function _planTitle(arch,items){
          const rel=_activeRelContext||'partner';
          const isSolo=rel==='solo';
          const isFriends=rel==='friends';
          switch(arch.id){
            case'romantic_evening':return isSolo?'Evening Out':isFriends?'Night Out':'Romantic Evening';
            case'dinner_activity':{
              const act=items.find(i=>i.category!=='dining');
              return(act?act.name.split(/[,(]/)[0].trim():'Activity')+' + Dinner';}
            case'cultural_night':{
              const cult=items.find(i=>i.category==='culture');
              return(cult?cult.name.split(/[,(]/)[0].trim():'Cultural')+' Night';}
            case'outdoor_day':{
              const areas=[...new Set(items.map(i=>i.loc?.split('·')[0]?.trim()).filter(Boolean))];
              return areas.length===1?areas[0]+' Day Out':'Day Adventure';}
            case'wellness_dine':return'Wellness & Dining';
            case'group_night':return isFriends?'Group Night Out':'Night Out';
            case'solo_explore':return'Solo Exploration';
            case'full_day':return isFriends?'Full Day Out':'Full Day in London';
            default:return arch.name;
          }
        }

        // Generate a personalised "why this fits" line for a plan
        function _whyThisFits(arch,items,prefs,score){
          const cats=items.map(i=>i.category);
          const hasDining=cats.includes('dining');
          const energy=prefs.energy_level||'moderate';
          const rel=prefs._relContext||_activeRelContext||'partner';
          // ── Context-aware copy — tone matches relationship selection ──
          const isPartner=rel==='partner'||rel==='couple';
          const isFriends=rel==='friends';
          const isSolo=rel==='solo';
          if(arch.id==='romantic_evening'){
            if(isSolo)return score>=80?'A well-matched evening out — good food, great vibe':'A relaxed evening with dinner'+(items.length>1?' and a second stop':'');
            if(isFriends)return 'A strong lineup for a memorable night out together';
            return score>=80?'A strong pairing for an intimate evening within your budget':'A relaxed evening with dinner'+(items.length>1?' and a second stop':'');
          }
          if(arch.id==='dinner_activity'){
            if(isFriends)return 'Great meal plus something active — the kind of night everyone remembers';
            if(isSolo)return 'Dinner and an activity — a solid outing shaped to your energy';
            return 'Balances a great meal with something active — fits your '+energy+' energy';
          }
          if(arch.id==='cultural_night'){
            if(isSolo)return hasDining?'Culture and dining — a thoughtful evening for one':'A cultural evening tailored to your tastes';
            if(isFriends)return hasDining?'Culture and food — a solid plan for the group':'A cultural night matched to your group\'s interests';
            return hasDining?'Culture and dining together — matches your shared interests':'A cultural evening tailored to your tastes';
          }
          if(arch.id==='outdoor_day'){
            if(isSolo)return 'An outdoor plan shaped around your '+energy+' energy';
            if(isFriends)return 'A group-friendly outdoor plan with something for everyone';
            return 'An outdoor plan that works for your '+energy+' energy';
          }
          if(arch.id==='wellness_dine'){
            if(isSolo)return 'Wind down — wellness and dining paired for a restorative evening';
            return 'Wind down together — wellness and dining paired for a low-effort evening';
          }
          if(arch.id==='group_night')return 'Group-friendly picks with enough variety for everyone';
          if(arch.id==='solo_explore')return 'A solo outing shaped around your interests';
          if(arch.id==='full_day'){
            if(isFriends)return 'A full day with variety — plenty to keep everyone happy';
            return 'A full day with variety — morning, lunch and afternoon covered';
          }
          // Generic fallback — context-aware
          if(score>=85)return isPartner?'Closely matched to your shared preferences':'Well-matched to your preferences and budget';
          if(score>=70)return 'A solid option based on your interests and energy level';
          return 'A different angle — worth exploring if you want to try something new';
        }

        function _planSummary(items){
          if(items.length===1)return items[0].why;
          const names=items.map(i=>i.name.split(/[,(]/)[0].trim());
          if(names.length===2)return names[0]+', then '+names[1];
          return names.slice(0,-1).join(', ')+', then '+names[names.length-1];
        }

        function _pickForSlot(slot,venues,usedCounts,items,excludeSlugs){
          const candidates=venues.filter(v=>{
            const slug=v._slug||_venueSlug(v.name);
            if(excludeSlugs&&excludeSlugs.has(slug))return false;
            if((usedCounts.get(slug)||0)>=2)return false;
            if(items.some(i=>i.name===v.name))return false;
            return slot.cats.includes(v.category);
          });
          if(!candidates.length)return null;
          const _bufferSet=new Set(_recentVenueBuffer);
          const notRecent=candidates.filter(c=>!_bufferSet.has(c._slug||_venueSlug(c.name)));
          const unusedThisGen=notRecent.filter(c=>!(usedCounts.get(c._slug||_venueSlug(c.name))||0));
          const pool=unusedThisGen.length?unusedThisGen:notRecent.length?notRecent:candidates;
          if(pool.length>1){
            const shuffled=[...pool];
            for(let si=shuffled.length-1;si>0;si--){const sj=Math.floor(Math.random()*(si+1));[shuffled[si],shuffled[sj]]=[shuffled[sj],shuffled[si]];}
            return shuffled[0];
          }
          return pool[0];
        }

        function _resolveItem(pick,slot){
          const _pickBi=_getBookingInfo(pick.name);
          return Object.assign({},pick,{role:slot.role,status:pick.bookable,_resolvedUrl:_pickBi.booking_url||_pickBi.website_url||null,_resolvedProvider:_pickBi.provider,_resolvedLinkStatus:_pickBi.link_status});
        }

        function _assemblePlan(arch,venues,usedCounts,prefs){
          const items=[];
          for(const slot of arch.slots){
            const pick=_pickForSlot(slot,venues,usedCounts,items,null);
            if(!pick&&slot.req)return null;
            if(!pick)continue;
            items.push(_resolveItem(pick,slot));
          }
          if(items.length<2)return null;
          // Budget is enforced per-stop via the venue-pool tier filter upstream.
          // No total-plan cost cap — the pills mean "each stop is within this price range."
          const totalCost=items.reduce((s,i)=>s+_parseCost(i.price),0);
          const avgScore=Math.round(items.reduce((s,i)=>s+i._prefScore,0)/items.length);
          const totalDur=items.reduce((s,i)=>s+i.duration_mins,0);
          return{
            id:arch.id+'_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5),
            archetype:arch.id,
            title:_planTitle(arch,items),
            summary:_planSummary(items),
            fit_reason:_whyThisFits(arch,items,prefs,avgScore),
            estimated_cost:'~\u00a3'+totalCost+'pp',
            estimated_duration:_fmtDuration(totalDur),
            score:avgScore,
            status:'generated',
            items:items.map((it,idx)=>Object.assign({},it,{order:idx+1}))
          };
        }

        // ── Stable venue slug ──
        // Deterministic ID from venue name — survives renames of display text
        function _venueSlug(name){
          return name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        }

        // ── Session memory: track shown venues across refreshes ──
        // Uses stable slugs instead of raw names. Resets when constraints change.
        // _recentVenueBuffer is a flat array of the last N venue slugs shown (across ALL slots).
        // It applies equally to anchors (restaurants) and secondary stops (activities).
        let _shownSlugs=[];       // array of Set<slug> — one per generation
        let _recentVenueBuffer=[]; // flat list of last 15 venue slugs, most recent last
        const _RECENT_BUFFER_SIZE=15;
        let _shownContextKey='';  // serialized constraint fingerprint
        let _genCount=0;          // how many generations under current constraints

        function _constraintKey(prefs){
          return[prefs.budget||'',prefs.energy_level||'',prefs.date_mode||'',
            prefs._relContext||_activeRelContext||'',
            _rfActive?JSON.stringify(_rfFilters):''].join('|');
        }

        function _recordShownSlugs(plans){
          const slugs=new Set();
          plans.forEach(p=>p.items.forEach(i=>{
            const s=_venueSlug(i.name);
            slugs.add(s);
            _recentVenueBuffer.push(s);
          }));
          // Trim buffer to last N
          while(_recentVenueBuffer.length>_RECENT_BUFFER_SIZE)_recentVenueBuffer.shift();
          _shownSlugs.push(slugs);
          if(_shownSlugs.length>5)_shownSlugs.shift();
        }

        // Count how many recent generations included this venue
        function _slugShowCount(slug){
          return _shownSlugs.filter(s=>s.has(slug)).length;
        }

        // All slugs shown at least once in current context
        function _allShownSlugs(){
          const all=new Set();
          _shownSlugs.forEach(s=>s.forEach(sl=>all.add(sl)));
          return all;
        }

        async function _generatePlans(prefs){
          prefs=prefs||{};
          const budgetBand=prefs.budget||_activeBudgetBand||'under50';
          const relContext=prefs._relContext||_activeRelContext||'partner';

          // ── Build taxonomy-driven venue pool ──
          // Pool ALL tiers that could match the selected budget band
          const band=_BUDGET_BANDS.find(b=>b.id===budgetBand);
          const eligibleTiers=band?band.tiers:['budget','mid'];

          // Reset session memory when constraints change
          const ck=_constraintKey(prefs);
          if(ck!==_shownContextKey){
            _shownSlugs=[];
            _recentVenueBuffer=[];
            _shownContextKey=ck;
            _genCount=0;
          }
          _genCount++;

          // Load from all IDEAS tiers — IDEAS array keys no longer correspond to actual budgetTier
          // values (e.g. IDEAS.mid holds venues tagged budgetTier='budget'). The strict filter below
          // is the sole gatekeeper; loading from all arrays ensures no eligible venue is missed.
          const _ALL_IDEA_KEYS=['budget','mid','treat','luxury'];
          let venues=[];
          // Always load hardcoded IDEAS as the base
          for(const tier of _ALL_IDEA_KEYS){
            venues=venues.concat((IDEAS[tier]||[]).map(_classifyVenue));
          }
          // Layer DB venues on top — DB wins if same slug exists
          for(const tier of _ALL_IDEA_KEYS){
            const dbVenues=await _loadVenuesFromDB(tier);
            if(dbVenues&&dbVenues.length){
              const dbBySlug=new Map(dbVenues.map(v=>[_venueSlug(v.name),v]));
              venues=venues.map(v=>{
                const slug=_venueSlug(v.name);
                return dbBySlug.has(slug)?dbBySlug.get(slug):v;
              });
              // Add DB-only venues (not in hardcoded)
              dbVenues.forEach(dv=>{
                const slug=_venueSlug(dv.name);
                if(!venues.some(v=>_venueSlug(v.name)===slug))venues.push(dv);
              });
            }
          }
          // Deduplicate in case DB and IDEAS overlap on the same venue
          const _seenVenueSlugs=new Set();
          venues=venues.filter(v=>{const s=_venueSlug(v.name);if(_seenVenueSlugs.has(s))return false;_seenVenueSlugs.add(s);return true;});
          // Venue status filter — remove closed/hidden venues
          venues=venues.filter(v=>!v.venue_status||v.venue_status==='active');

          // ── TAXONOMY HARD FILTERS (deterministic, not scoring) ──
          // 1. Relationship context: only exclude if tag exists AND doesn't match; missing = pass
          venues=venues.filter(v=>!v.rel||!v.rel.length||v.rel.includes(relContext));

          // 2. Budget band: strict — venue must have an explicit budgetTier and it must be in eligibleTiers.
          // No fallback inference. Every hardcoded venue now has budgetTier (camelCase); DB venues have
          // budget_tier (snake_case). Both are checked. Venues missing both fields are excluded.
          venues=venues.filter(v=>{
            const tier=v.budgetTier||v.budget_tier;
            return !!tier&&eligibleTiers.includes(tier);
          });

          // 3. Exclude untagged venues only if explicitly flagged false (missing _isTagged = pass)
          venues=venues.filter(v=>v._isTagged!==false);

          // 4. Dietary filter — strict: only show venues tagged for the selected dietary need
          if(prefs.dietary&&prefs.dietary.length&&!prefs.dietary.includes('none')){
            const dReqs=prefs.dietary.filter(d=>d!=='none');
            if(dReqs.length){
              venues=venues.filter(v=>{
                const d=v.dietary||[];
                if(!d.length){
                  const fmt=v.t&&v.t.fmt?v.t.fmt:[];
                  return !fmt.includes('dining');
                }
                return dReqs.every(r=>d.includes(r));
              });
            }
          }
          // ── Refine hard filters (exclude clearly wrong venues) ──
          if(_rfActive&&typeof _rfFilters!=='undefined'){
            const rf=_rfFilters;
            if(rf.food==='no_food'){
              venues=venues.filter(v=>v.category!=='dining');
            }
            if(rf.food==='veg_friendly'){
              venues=venues.filter(v=>{const d=v.dietary||[];if(d.includes('vegetarian')||d.includes('vegan'))return true;const fmt=v.t&&v.t.fmt?v.t.fmt:[];return !fmt.includes('dining');});
            }
            // Occasion in Refine overrides rel context
            if(rf.occasion==='friends')prefs.date_mode='friends';
            else if(rf.occasion==='first_date'||rf.occasion==='anniversary'||rf.occasion==='casual')prefs.date_mode='couple';
          }
          // Set date_mode from relationship context if not overridden by Refine
          if(!prefs.date_mode)prefs.date_mode=relContext==='partner'?'couple':relContext;

          // Score & sort — slug-based freshness scoring
          // Two layers: (a) per-generation Set tracking, (b) flat recent buffer.
          // The flat buffer applies a HARD penalty to any venue shown in the last refresh,
          // ensuring anchors (restaurants) rotate — not just secondary activities.
          const _prevSlugs=_allShownSlugs();
          const _recentSet=new Set(_recentVenueBuffer);
          venues.forEach(v=>{
            v._slug=_venueSlug(v.name);
            v._prefScore=_scoreVenue(v,prefs);
            const showCount=_slugShowCount(v._slug);
            const inRecentBuffer=_recentSet.has(v._slug);
            // Hard penalty for venues in the recent buffer (last 15 shown across all slots).
            // -40 is enough to push a 99-score Dishoom below a 70-score alternative.
            if(inRecentBuffer)v._prefScore-=40;
            // Additional escalating penalty per generation count
            if(showCount>0){
              const penalty=14+Math.min(_genCount-1,3)*4;
              v._prefScore-=showCount*penalty;
            }else if(_prevSlugs.size>0){
              v._prefScore+=8; // fresh venue boost
            }
          });
          // ── Score-band shuffle: randomize order within similar scores ──
          // Always jitter so every generation (including the first) feels different.
          // +-8 is wide enough to reorder venues within the same quality band
          // but narrow enough that a 90-score venue still beats a 60-score one.
          venues.forEach(v=>{v._prefScore+=Math.random()*16-8;});
          // Sort first pass by (jittered) score
          venues.sort((a,b)=>b._prefScore-a._prefScore);
          // Then penalize venues that share >60% of fmt tags with a higher-ranked venue
          const _selectedFmts=new Set();
          venues.forEach((v,i)=>{
            if(i===0){(v.t?.fmt||[]).forEach(f=>_selectedFmts.add(f));return;}
            const vFmt=v.t?.fmt||[];
            if(vFmt.length){
              const overlap=vFmt.filter(f=>_selectedFmts.has(f)).length;
              if(overlap/vFmt.length>0.6)v._prefScore-=4; // mild diversity penalty
            }
            vFmt.forEach(f=>_selectedFmts.add(f));
          });
          venues.sort((a,b)=>b._prefScore-a._prefScore);
          // Weather adjustment — deprioritise outdoor venues when raining (legacy fallback)
          if(_weatherCode>=0){
            const rainy=[51,53,55,61,63,65,71,73,75,80,81,82,95,96,99].includes(_weatherCode);
            if(rainy){
              venues.sort((a,b)=>{
                const aOut=a._setting==='outdoor';
                const bOut=b._setting==='outdoor';
                if(aOut===bOut)return 0;
                return aOut?1:-1;
              });
            }
          }
          // Select archetypes matching mode & energy
          const mode=prefs.date_mode||((_getUserProfile()?.account_state==='paired')?'couple':'solo');
          const energy=prefs.energy_level||'moderate';
          const stopCount=prefs.stopCount||_activeStopCount||'open';
          let archetypes=_PLAN_ARCHETYPES.filter(a=>
            a.forModes.includes(mode)&&a.forEnergy.includes(energy)
          );
          if(archetypes.length<3){
            archetypes=_PLAN_ARCHETYPES.filter(a=>a.forModes.includes(mode));
          }
          if(archetypes.length<2){
            archetypes=[..._PLAN_ARCHETYPES];
          }
          // Filter archetypes by stop count preference
          if(stopCount!=='open'){
            const sc=parseInt(stopCount);
            if(sc===1){
              archetypes=archetypes.filter(a=>a.min<=1||a.slots.filter(s=>s.req).length<=1);
            }else if(sc===2){
              archetypes=archetypes.filter(a=>a.min<=2&&a.max>=2);
            }else if(sc===3){
              archetypes=archetypes.filter(a=>a.max>=3);
            }
            if(!archetypes.length)archetypes=_PLAN_ARCHETYPES.filter(a=>a.forModes.includes(mode));
          }
          // Shuffle archetypes every generation for structural variety
          for(let i=archetypes.length-1;i>0;i--){
            const j=Math.floor(Math.random()*(i+1));
            [archetypes[i],archetypes[j]]=[archetypes[j],archetypes[i]];
          }
          // Assemble plans — usedCounts tracks how many plans each venue appears in
          const plans=[];
          const usedCounts=new Map(); // slug → count (0=unused, 1=one plan, 2+=hard-banned)
          // For 1-stop mode, build single-venue plans directly
          if(stopCount===1||stopCount==='1'){
            const dining=venues.filter(v=>v.category==='dining'||v.type==='foodie'||v.category==='wellness'||v.category==='culture'||v.category==='outdoors');
            const shuffled=[...dining];
            for(let i=shuffled.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[shuffled[i],shuffled[j]]=[shuffled[j],shuffled[i]];}
            for(const v of shuffled){
              if(plans.length>=5)break;
              const slug=v._slug||_venueSlug(v.name);
              if((usedCounts.get(slug)||0)>=1)continue;
              const _bi=_getBookingInfo(v.name);
              const item=Object.assign({},v,{role:'Dinner',order:1,status:v.bookable,_resolvedUrl:_bi.booking_url||_bi.website_url||null,_resolvedProvider:_bi.provider,_resolvedLinkStatus:_bi.link_status});
              const totalCost=_parseCost(v.price);
              plans.push({
                id:'single_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,5),
                archetype:'single_stop',
                title:v.name,
                summary:v.why,
                fit_reason:'A single stop — simple and focused',
                estimated_cost:'~£'+totalCost+'pp',
                estimated_duration:_fmtDuration(v.duration_mins||90),
                score:v._prefScore||v.score||50,
                status:'generated',
                items:[item]
              });
              usedCounts.set(slug,1);
            }
          }else{
          for(const arch of archetypes){
            const plan=_assemblePlan(arch,venues,usedCounts,prefs);
            if(plan){
              // For specific stop counts, filter plans by actual item count
              if(stopCount!=='open'){
                const sc=parseInt(stopCount);
                const len=plan.items.length;
                if(Math.abs(len-sc)>1){continue;}
              }
              plans.push(plan);
              plan.items.forEach(i=>{const s=i._slug||_venueSlug(i.name);usedCounts.set(s,(usedCounts.get(s)||0)+1);});
            }
            if(plans.length>=5)break;
          }
          } // end else (non-1-stop)
          plans.sort((a,b)=>b.score-a.score);
          let finalPlans=plans.slice(0,5);

          // ── Plan-level budget guard ──
          // Every venue in a plan must individually pass the budget filter.
          // The pool filter above should already guarantee this, but guard against
          // any path (e.g. _assemblePlan internals) that might include an off-tier venue.
          finalPlans=finalPlans.filter(p=>p.items.every(i=>{
            const tier=i.budgetTier||i.budget_tier;
            return !!tier&&eligibleTiers.includes(tier);
          }));

          // ── Near-duplicate detection (slug-based) ──
          const finalSlugs=new Set();
          finalPlans.forEach(p=>p.items.forEach(i=>finalSlugs.add(i._slug||_venueSlug(i.name))));
          let isNearDupe=false;
          for(const prevSet of _shownSlugs){
            if(!prevSet.size)continue;
            const overlap=[...finalSlugs].filter(s=>prevSet.has(s)).length;
            if(overlap/Math.max(finalSlugs.size,1)>0.7){isNearDupe=true;break;}
          }
          // Count total unique venues available vs used
          const totalPoolSize=venues.length;
          const totalUsedEver=_allShownSlugs().size;
          const poolExhausted=totalUsedEver>=totalPoolSize*0.8;
          if(isNearDupe&&!poolExhausted)finalPlans._nearDupe=true;
          if(poolExhausted)finalPlans._poolExhausted=true;

          // Record this generation in session memory
          _recordShownSlugs(finalPlans);

          return finalPlans;
        }

        // Plan state management
        let _currentPlans=[];
        let _planStates={};
        try{_planStates=JSON.parse(localStorage.getItem('t4t_plan_states')||'{}');}catch(e){}

        function _savePlanStates(){
          localStorage.setItem('t4t_plan_states',JSON.stringify(_planStates));
        }

        function _setPlanStatus(planId,status){
          _planStates[planId]={status:status,updatedAt:Date.now()};
          _savePlanStates();
          const badge=document.querySelector('[data-plan-id="'+planId+'"] .plan-status-badge');
          if(badge){badge.textContent=status;badge.className='plan-status-badge plan-status-'+status;}
          const plan=_currentPlans.find(p=>p.id===planId);
          const evProps={plan_id:planId,plan_title:plan?.title||null,item_count:plan?.items?.length||0};
          if(status==='viewed')_trackEvent('plan_viewed',evProps);
          else if(status==='saved')_trackEvent('plan_saved',evProps);
          else if(status==='active')_trackEvent('plan_activated',evProps);
        }

        function togglePlanDetails(planId){
          _setPlanStatus(planId,'viewed');
          const el=document.querySelector('[data-plan-id="'+planId+'"] .plan-details');
          if(el)el.style.display=el.style.display==='none'?'block':'none';
        }

        function savePlanToWishlist(planId){
          _setPlanStatus(planId,'saved');
          const plan=_currentPlans.find(p=>p.id===planId);
          if(!plan)return;
          let added=0;
          plan.items.forEach(item=>{
            if(!_wishlist.some(w=>w.name===item.name)){
              _wishlist.push({id:Date.now()+Math.random(),name:item.name,emoji:item.emoji,price:item.price,type:item.type||'activity',why:'From plan: '+plan.title,addedDate:new Date().toISOString().slice(0,10),done:false});
              added++;
            }
          });
          if(added){_wishBadgeCount+=added;_updateWishBadge();_trackEvent('wishlist_save',{name:plan.title,count:added});}
          renderWishlist();
          toast('♥ Saved to wishlist — <span onclick="go(\'wishlist\',null)" style="text-decoration:underline;cursor:pointer;color:#C9A84C">View</span>');
        }

        // ── Plan reactions ──
        function reactToPlan(planId,reaction,el){
          _trackEvent('plan_reaction',{plan_id:planId,reaction:reaction});
          // Visual feedback
          if(el){
            el.classList.add('plan-react-on');
            el.closest('.plan-reactions').querySelectorAll('.plan-react').forEach(r=>{if(r!==el)r.classList.remove('plan-react-on');});
          }
          toast(reaction==='love'?'Saved — more like this coming':reaction==='not_my_vibe'?'Got it — we\'ll skip similar ones':reaction==='too_expensive'?'Noted — we\'ll keep it lighter':reaction==='too_far'?'Noted — staying closer next time':'Thanks, that helps');
        }

        function activatePlan(planId){
          Object.keys(_planStates).forEach(id=>{
            if(_planStates[id]&&_planStates[id].status==='active')_planStates[id].status='saved';
          });
          _setPlanStatus(planId,'active');
          _trackEvent('plan_booking_started',{plan_id:planId});
          const detailsEl=document.querySelector('[data-plan-id="'+planId+'"] .plan-details');
          if(detailsEl)detailsEl.style.display='block';
          const plan=_currentPlans.find(p=>p.id===planId);
          if(!plan||!plan.items){toast('✦ Plan activated');return;}
          const total=plan.items.length;
          const urls=[];
          plan.items.forEach(item=>{
            const bi=_getBookingInfo(item.name);
            const url=bi.booking_url||bi.website_url||null;
            if(url)urls.push(url);
          });
          if(!urls.length){toast('No booking links available for this plan');return;}
          // Open first immediately, rest with delays to avoid popup blocker
          _openExternal(urls[0]);
          urls.slice(1).forEach((url,i)=>{
            setTimeout(()=>_openExternal(url),(i+1)*500);
          });
          if(urls.length===total){
            toast('✦ Opening '+total+' stop'+(total!==1?'s':'')+' — book each one');
          }else{
            toast('✦ Opening '+urls.length+' of '+total+' stops — others don\'t have booking links yet');
          }
        }

        // ═══════════════════════════════════════════════════════
        // Booking Handoff — honest outbound booking flow
        // ═══════════════════════════════════════════════════════

        // Verified booking URLs for known venues
        const _VENUE_BOOKING={
          // OpenTable restaurants
          'Hakkasan Mayfair dinner':{url:'https://www.opentable.co.uk/hakkasan-mayfair',website_url:'https://hakkasan.com',provider:'OpenTable',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Dishoom dinner':{url:'https://www.dishoom.com/',website_url:'https://www.dishoom.com/',provider:'Dishoom',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Sketch, Mayfair':{url:'https://sketch.london/make-a-reservation/',website_url:'https://sketch.london',provider:'Sketch',type:'restaurant',link_status:'verified'},
          'Novikov restaurant':{url:'https://www.novikovrestaurant.co.uk/reservations',provider:'Novikov',type:'restaurant',link_status:'verified'},
          'Bob Bob Ricard':{url:'https://www.bobbobricard.com/',provider:'Bob Bob Ricard',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Kiln restaurant Soho':{url:null,website_url:'https://kilnsoho.com',provider:'Kiln',type:'restaurant',link_status:'needs_review'},
          'Ottolenghi dinner':{url:'https://ottolenghi.co.uk/restaurants',provider:'Ottolenghi',type:'restaurant',link_status:'verified'},
          'Padella pasta dinner':{url:'https://web.dojo.app/create_booking/vendor/Gbzsvht-JlwuwLjO6nuUO-FvWWsj1wcZRbuK6qbdHkE_restaurant',website_url:'https://www.padella.co',provider:'Dojo',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Brat restaurant':{url:'https://bratrestaurant.com/reservations',provider:'Brat',type:'restaurant',link_status:'verified'},
          'Core by Clare Smyth':{url:'https://corebyclaresmyth.com/reservations/',website_url:'https://corebyclaresmyth.com',provider:'Core by Clare Smyth',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Alain Ducasse at The Dorchester':{url:'https://www.sevenrooms.com/reservations/alainducasseatthedorchester/',website_url:'https://www.dorchestercollection.com/london/the-dorchester/restaurants-bars/alain-ducasse/',provider:'SevenRooms',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Brindisa tapas + Borough Market':{url:'https://www.brindisakitchens.com/book',provider:'Brindisa',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'The Savoy afternoon tea + dinner':{url:'https://www.thesavoylondon.com/dining/',provider:'The Savoy',type:'restaurant',link_status:'verified'},
          'Aqua Shard cocktails + dinner':{url:'https://aquashard.co.uk/reservations',provider:'Aqua Shard',type:'restaurant',link_status:'verified'},
          // Experiences — partner handoff
          'Punchdrunk immersive theatre':{url:'https://www.punchdrunk.com/the-burnt-city/',provider:'Punchdrunk',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'The Crystal Maze LIVE Experience':{url:'https://the-crystal-maze.com/london/',provider:'Crystal Maze',type:'experience',link_status:'verified'},
          'O2 Arena concert night':{url:'https://www.theo2.co.uk/events',provider:'The O2',type:'experience',link_status:'verified'},
          'Shakespeare\'s Globe Theatre':{url:'https://www.shakespearesglobe.com/whats-on/',provider:'Globe Theatre',type:'experience',link_status:'verified'},
          'National Theatre':{url:'https://www.nationaltheatre.org.uk/whats-on/',provider:'National Theatre',type:'experience',link_status:'verified'},
          'Ronnie Scott\'s jazz night':{url:'https://www.ronniescotts.co.uk/performances',provider:'Ronnie Scott\'s',type:'experience',link_status:'verified'},
          'Electric Cinema, Notting Hill':{url:'https://www.electriccinema.co.uk',provider:'Electric Cinema',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Royal Opera House':{url:'https://www.roh.org.uk/tickets-and-events',provider:'Royal Opera House',type:'experience',link_status:'verified'},
          'The Ivy':{url:'https://www.the-ivy.co.uk/book',provider:'The Ivy',type:'restaurant',link_status:'verified'},
          'All Star Lanes bowling + cocktails':{url:'https://www.allstarlanes.co.uk/book',provider:'All Star Lanes',type:'experience',link_status:'verified'},
          'Turning Earth pottery class':{url:'https://www.turningearth.org/classes',provider:'Turning Earth',type:'experience',link_status:'verified'},
          'Escape Hunt London':{url:'https://escapehunt.com/uk/london/',provider:'Escape Hunt',type:'experience',link_status:'verified'},
          'TeamSport Go-Karting':{url:'https://www.team-sport.co.uk/go-karting-london/',provider:'TeamSport',type:'experience',link_status:'verified'},
          'Swingers crazy golf + cocktails':{url:'https://swingersldn.com',provider:'Swingers',type:'experience',link_status:'verified'},
          'Toca Social':{url:'https://www.toca.social/',provider:'Toca Social',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          'Toca Social – Football Arcade':{url:'https://www.toca.social/',provider:'Toca Social',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          'Bounce ping pong':{url:'https://www.bouncepingpong.com',provider:'Bounce',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          'Junkyard Golf Club':{url:'https://junkyardgolfclub.co.uk',provider:'Junkyard Golf',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          'BFI Southbank cinema + wine':{url:'https://whatson.bfi.org.uk',provider:'BFI',type:'experience',link_status:'verified'},
          'Rooftop Film Club screening':{url:'https://www.rooftopfilmclub.com/london',provider:'Rooftop Film Club',type:'experience',link_status:'verified'},
          // Wellness
          'AIRE Ancient Baths couples':{url:'https://beaire.com/en/aire-ancient-baths-london',provider:'AIRE',type:'experience',link_status:'verified'},
          'Monk London ice bath & sauna':{url:'https://www.monklondon.com',provider:'Monk London',type:'experience',link_status:'verified'},
          'Ironmonger Row Baths':{url:'https://www.better.org.uk/leisure-centre/london/islington/ironmonger-row-baths',provider:'Better',type:'experience',link_status:'verified'},
          'Cowshed Spa at Soho House':{url:'https://www.cowshed.com/pages/book-a-treatment',provider:'Cowshed',type:'experience',link_status:'verified'},
          'Hotpod Yoga date':{url:'https://hotpodyoga.com/timetable/',provider:'Hotpod Yoga',type:'experience',link_status:'verified'},
          // Outdoor / free
          'Kew Gardens + riverside pub':{url:'https://www.kew.org/kew-gardens/visit-kew-gardens/tickets',provider:'Kew Gardens',type:'experience',link_status:'verified'},
          'Bateaux London dinner cruise':{url:'https://www.cityexperiences.com/london/city-cruises/dining-cruises/',provider:'City Experiences',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Helicopter city tour at sunset':{url:'https://www.virginexperiencedays.co.uk/helicopter-flights',provider:'Virgin Experience Days',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Buy experience'},
          // Additional venues
          'The Comedy Store':{url:'https://www.thecomedystore.co.uk',provider:'Comedy Store',type:'experience',link_status:'verified'},
          'Maltby Street Market brunch':{url:'https://www.maltby.st',provider:'Maltby St Market',type:'experience',link_status:'verified'},
          'Jenki matcha bar':{url:'https://www.jenki.co.uk/pages/find-us',provider:'Jenki',type:'experience',link_status:'verified',bookingType:'find_locations',ctaLabel:'Find locations'},
          'Puttshack mini golf':{url:'https://www.puttshack.com/venues/bank/',provider:'Puttshack',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          'Barbican Cinema + cocktails':{url:'https://www.barbican.org.uk/whats-on/cinema',provider:'Barbican',type:'experience',link_status:'verified'},
          'Alexandra Palace sunset terrace':{url:'https://www.alexandrapalace.com',provider:'Alexandra Palace',type:'experience',link_status:'verified'},
          'Frame fitness class for two':{url:'https://www.moveyourframe.com',provider:'Frame',type:'experience',link_status:'verified'},
          'Kobox boxing date':{url:'https://kobox.co.uk/private-sessions/#offer',provider:'Kobox',type:'experience',link_status:'verified'},
          'Reformer Pilates for two':{url:'https://www.heartcore.co.uk',provider:'Heartcore',type:'experience',link_status:'verified'},
          'Yoga + brunch at Triyoga':{url:'https://triyoga.co.uk',provider:'Triyoga',type:'experience',link_status:'verified'},
          'Padel court session for two':{url:'https://www.lta.org.uk/play/ways-to-play/padel/',provider:'Padel',type:'experience',link_status:'verified'},
          'Tsujiri matcha + mochi':{url:'https://www.tsujiri.co.uk',provider:'Tsujiri',type:'experience',link_status:'verified'},
          'Bob Bob Ricard dinner':{url:'https://www.bobbobricard.com/',provider:'Bob Bob Ricard',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Almeida Theatre':{url:'https://almeida.co.uk/whats-on',provider:'Almeida Theatre',type:'experience',link_status:'verified'},
          'Cubo matcha ceremony for two':{url:'https://www.cubolondon.com',provider:'Cubo',type:'experience',link_status:'verified'},
          'Chiltern Firehouse dinner':{url:'https://www.chilternfirehouse.com/',provider:'Chiltern Firehouse',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Glyndebourne opera at sunset':{url:'https://www.glyndebourne.com',provider:'Glyndebourne',type:'experience',link_status:'verified'},
          'Kensington Palace private tour':{url:'https://www.hrp.org.uk/kensington-palace/',provider:'Historic Royal Palaces',type:'experience',link_status:'verified'},
          'Bamford Wellness Spa retreat':{url:'https://www.bamford.com/spas',provider:'Bamford',type:'experience',link_status:'verified',bookingType:'book_treatment',ctaLabel:'Book treatment'},
          'Battersea Park boating + picnic':{url:'https://batterseapark.org/boating/',provider:'Battersea Park',type:'experience',link_status:'verified',bookingType:'walk_in',ctaLabel:'Turn up and book',helperText:'Tickets purchased at the kiosk — no online booking needed'},
          'Tate Modern + Thames walk':{url:'https://www.tate.org.uk/visit/tate-modern',provider:'Tate Modern',type:'experience',link_status:'verified'},
          'Leake Street Arches street art walk':{url:'https://www.leakestreetarches.london',provider:'Leake Street',type:'experience',link_status:'verified'},
          // Static HTML cards — added for booking reliability
          'Saatchi Gallery + cocktails':{url:'https://www.saatchigallery.com/visit',provider:'Saatchi Gallery',type:'experience',link_status:'unverified'},
          'Thames sunset cruise':{url:'https://www.citycruises.com/london-cruises',provider:'City Cruises',type:'experience',link_status:'unverified'},
          'Rooftop wine tasting':{url:null,provider:null,type:'experience',link_status:'unavailable'},
          'West End show + dinner':{url:'https://www.londontheatredirect.com',provider:'London Theatre Direct',type:'experience',link_status:'unverified'},
          'Primrose Hill picnic at sunset':{url:null,provider:null,type:'experience',link_status:'unavailable'},
          'Couples cooking class':{url:'https://www.atelierdeschefs.co.uk',provider:'Atelier des Chefs',type:'experience',link_status:'unverified'},
          // Taxonomy CSV import — escape rooms
          'Escape London':{url:'https://www.escape-london.co.uk',provider:'Escape London',type:'experience',link_status:'verified'},
          'clueQuest':{url:'https://cluequest.co.uk',provider:'clueQuest',type:'experience',link_status:'verified'},
          'Mission: Breakout':{url:'https://www.missionbreakout.london',provider:'Mission: Breakout',type:'experience',link_status:'verified'},
          // Taxonomy CSV import — go karting
          'K1 Speed Canary Wharf':{url:'https://www.k1speed.com/uk/canary-wharf.html',provider:'K1 Speed',type:'experience',link_status:'verified'},
          'Daytona Motorsport London':{url:'https://www.daytona.co.uk/go-karting-in-london/',provider:'Daytona',type:'experience',link_status:'verified'},
          'F1 Drive London':{url:'https://www.tottenhamhotspurstadium.com/f1-drive-london/',provider:'F1 Drive',type:'experience',link_status:'verified'},
          // Taxonomy CSV import — crazy golf
          'Shoreditch Balls':{url:'https://www.shoreditchballs.com/bookings',provider:'Shoreditch Balls',type:'experience',link_status:'verified'},
          'Crazy Putt Greenwich Peninsula':{url:'https://www.greenwichpeninsula.co.uk/whats-here/crazy-putt-adventure-golf',website_url:'https://www.greenwichpeninsula.co.uk',provider:'Greenwich Peninsula',type:'experience',link_status:'verified'},
          // Taxonomy CSV import — axe throwing
          'Axeperience London':{url:'https://axeperience.co.uk/booking/',provider:'Axeperience',type:'experience',link_status:'verified'},
          'Game of Throwing London':{url:'https://www.gameofthrowing.co.uk/game-of-throwing-london',provider:'Game of Throwing',type:'experience',link_status:'verified'},
          'Boom Battle Bar Liverpool Street':{url:'https://boombattlebar.com/uk/london-liverpool-street/battleground/axe-throwing/',provider:'Boom Battle Bar',type:'experience',link_status:'verified'},
          // Taxonomy CSV import — immersive & bowling
          'Lightroom':{url:'https://lightroom.uk',provider:'Lightroom',type:'experience',link_status:'verified'},
          'Taste Film':{url:'https://www.tastefilm.co.uk',provider:'Taste Film',type:'experience',link_status:'verified'},
          'Queens London':{url:'https://queens.london/bowling/main-lanes/',provider:'Queens',type:'experience',link_status:'verified'},
          'Hollywood Bowl O2':{url:'https://www.hollywoodbowl.co.uk/london-o2',provider:'Hollywood Bowl',type:'experience',link_status:'verified'},
          'Hollywood Bowl Finchley':{url:'https://www.hollywoodbowl.co.uk/finchley',provider:'Hollywood Bowl',type:'experience',link_status:'verified'},
          // New luxury tier venues
          'Private tasting menu at The Clove Club':{url:'https://thecloveclub.com',provider:'The Clove Club',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Afternoon tea at The Ritz':{url:'https://www.theritzlondon.com/dine-with-us/afternoon-tea/',provider:'The Ritz',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Couples spa ritual at ESPA Life':{url:null,website_url:'https://www.espalifeatcorinthia.com',provider:'ESPA Life',type:'experience',link_status:'needs_review',bookingType:'book_treatment',ctaLabel:'Book treatment'},
          'Rooftop champagne at Shangri-La':{url:'https://www.shangri-la.com/restaurants-bars/list/?hotel=SLLN&country=United+Kingdom&city=London',website_url:'https://www.shangri-la.com/london/shangrila/',provider:'Shangri-La',type:'experience',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Late opening at the V&A':{url:'https://www.vam.ac.uk/whatson',website_url:'https://www.vam.ac.uk/info/friday-late',provider:'V&A',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Jazz supper at Ronnie Scott\'s':{url:'https://www.ronniescotts.co.uk/performances',provider:'Ronnie Scott\'s',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Chef\'s table at Climpson\'s Arch':{url:null,website_url:'https://climpsonsarch.com',provider:'Climpson\'s Arch',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Electric Cinema double bill + dinner':{url:'https://www.electriccinema.co.uk',provider:'Electric Cinema',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Luxury wine tasting at 67 Pall Mall':{url:null,website_url:'https://www.67pallmall.co.uk',provider:'67 Pall Mall',type:'experience',link_status:'unavailable'},
          'Cocktail masterclass at Cahoots':{url:'https://www.cahoots-london.com/experiences',provider:'Cahoots',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          // Mid-tier dining — batch June 2026
          'Gymkhana':{url:'https://www.gymkhanalondon.com/reservations/',website_url:'https://www.gymkhanalondon.com',provider:'Gymkhana',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Trishna':{url:'https://www.trishnalondon.com/reservations/',website_url:'https://www.trishnalondon.com',provider:'Trishna',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Brigadiers':{url:'https://www.brigadierslondon.com/reservations/',website_url:'https://www.brigadierslondon.com',provider:'Brigadiers',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Kricket':{url:'https://www.kricket.co.uk/book/',website_url:'https://www.kricket.co.uk',provider:'Kricket',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Hoppers St Christopher\'s Place':{url:'https://www.hopperslondon.com',website_url:'https://www.hopperslondon.com',provider:'Hoppers',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Hoppers Soho':{url:null,website_url:'https://www.hopperslondon.com/soho',provider:'Hoppers',type:'restaurant',link_status:'verified',bookingType:'walk_in',ctaLabel:'Walk in only',helperText:'No reservations — walk-in only, expect a short wait'},
          'Lina Stores':{url:'https://www.linastores.co.uk/pages/book',website_url:'https://www.linastores.co.uk',provider:'Lina Stores',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Bocca di Lupo':{url:'https://www.boccadilupo.com/reservations/',website_url:'https://www.boccadilupo.com',provider:'Bocca di Lupo',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Quality Chop House':{url:'https://thequalitychophouse.com/reservations/',website_url:'https://thequalitychophouse.com',provider:'Quality Chop House',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Barrafina Drury Lane':{url:'https://www.barrafina.com/locations/drury-lane/',website_url:'https://www.barrafina.com',provider:'Barrafina',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          // Budget outer-zone venues — batch June 2026
          'Pop Brixton':{url:null,website_url:'https://www.popbrixton.org/',provider:'Pop Brixton',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Brixton Village':{url:null,website_url:'https://www.brixtonmarket.net/',provider:'Brixton Market',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Mare Street Market':{url:'https://marestreetmarket.com/hackney-home/',website_url:'https://marestreetmarket.com',provider:'Mare Street Market',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book table'},
          'Hackney Picturehouse':{url:'https://www.picturehouses.com/cinema/hackney-picturehouse',website_url:'https://www.picturehouses.com',provider:'Picturehouse',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Peckhamplex':{url:'https://www.peckhamplex.london/',website_url:'https://www.peckhamplex.london/',provider:'Peckhamplex',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Bussey Building':{url:'https://www.clfartcafe.org/',website_url:'https://www.clfartcafe.org/',provider:'CLF Art Cafe',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'See events'},
          'Greenwich Market':{url:null,website_url:'https://www.greenwichmarket.london/',provider:'Greenwich Market',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Royal Observatory Greenwich':{url:'https://www.rmg.co.uk/royal-observatory',website_url:'https://www.rmg.co.uk',provider:'Royal Museums Greenwich',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Book tickets'},
          'Greenwich Park walk':{url:null,website_url:'https://www.royalparks.org.uk/parks/greenwich-park',provider:'Royal Parks',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Free entry'},
          'Cutty Sark':{url:'https://www.rmg.co.uk/cutty-sark',website_url:'https://www.rmg.co.uk',provider:'Royal Museums Greenwich',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Book tickets'},
          'Queen Elizabeth Olympic Park':{url:null,website_url:'https://www.queenelizabetholympicpark.co.uk/',provider:'QEOP',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Free entry'},
          'Hackney City Farm':{url:null,website_url:'https://hackneycityfarm.co.uk/',provider:'Hackney City Farm',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Free entry'},
          // Budget activity bars — batch June 2026
          'Bloomsbury Bowling Lanes':{url:'https://bloomsburybowling.com/book-now',website_url:'https://bloomsburybowling.com',provider:'Bloomsbury Bowling',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book lanes'},
          'Flight Club Shoreditch':{url:'https://flightclubdarts.com/location-shoreditch',website_url:'https://flightclubdarts.com',provider:'Flight Club',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book oche'},
          'Lucky Voice Soho':{url:'https://www.luckyvoice.com/bars/soho',website_url:'https://www.luckyvoice.com',provider:'Lucky Voice',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book room'},
          'Draughts Waterloo':{url:'https://draughtslondon.com/book/',website_url:'https://draughtslondon.com',provider:'Draughts',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book table'},
          'Electric Shuffle London Bridge':{url:'https://electricshuffle.com/uk/london/londonbridge',website_url:'https://electricshuffle.com',provider:'Electric Shuffle',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book board'},
          // Budget culture & outdoors — batch June 2026
          'Daunt Books Marylebone':{url:null,website_url:'https://dauntbooks.co.uk/shops/marylebone/',provider:'Daunt Books',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Foyles Charing Cross Road':{url:null,website_url:'https://www.foyles.co.uk/shops/london-charing-cross-road',provider:'Foyles',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Libreria Bookshop':{url:null,website_url:'https://libreria.io',provider:'Libreria',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Wallace Collection':{url:null,website_url:'https://www.wallacecollection.org/visit/',provider:'Wallace Collection',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'National Gallery':{url:null,website_url:'https://www.nationalgallery.org.uk/visiting',provider:'National Gallery',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Whitechapel Gallery':{url:null,website_url:'https://www.whitechapelgallery.org/visit/',provider:'Whitechapel Gallery',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Hampstead Heath walk':{url:null,website_url:'https://www.cityoflondon.gov.uk/things-to-do/green-spaces/hampstead-heath',provider:'City of London',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Free entry'},
          'Richmond Park walk':{url:null,website_url:'https://www.royalparks.org.uk/parks/richmond-park',provider:'Royal Parks',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Free entry'},
          'Regent\'s Canal walk':{url:null,website_url:'https://canalrivertrust.org.uk/enjoy-the-waterways/canal-and-river-network/regents-canal',provider:'Canal & River Trust',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Free entry'},
          'Sky Garden':{url:'https://skygarden.london',website_url:'https://skygarden.london',provider:'Sky Garden',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Book free ticket'},
          'Brockwell Lido':{url:'https://www.fusion-lifestyle.com/centres/brockwell-lido/',website_url:'https://www.fusion-lifestyle.com/centres/brockwell-lido/',provider:'Fusion Lifestyle',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Book swim'},
          'Spitalfields Market browse':{url:null,website_url:'https://www.spitalfields.co.uk',provider:'Spitalfields Market',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          // Budget casual dining — batch June 2026
          'Bancone pasta bar':{url:'https://www.bancone.co.uk/book',website_url:'https://www.bancone.co.uk',provider:'Bancone',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Dishoom Shoreditch':{url:'https://www.dishoom.com/shoreditch/',website_url:'https://www.dishoom.com',provider:'Dishoom',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Darjeeling Express':{url:'https://www.darjeeling-express.com',website_url:'https://www.darjeeling-express.com',provider:'Darjeeling Express',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Roti King':{url:null,website_url:'https://www.rfrotiking.com',provider:'Roti King',type:'restaurant',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Jugemu':{url:null,website_url:null,provider:'Jugemu',type:'restaurant',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Kanada-Ya':{url:'https://www.kanada-ya.com',website_url:'https://www.kanada-ya.com',provider:'Kanada-Ya',type:'restaurant',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Arabica Borough':{url:'https://arabicabarandkitchen.com',website_url:'https://arabicabarandkitchen.com',provider:'Arabica',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Zahter':{url:'https://www.zahter.co.uk',website_url:'https://www.zahter.co.uk',provider:'Zahter',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Zayane':{url:'https://www.zayanerestaurant.com',website_url:'https://www.zayanerestaurant.com',provider:'Zayane',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Sake no Hana':{url:'https://www.sakenohana.com',website_url:'https://www.sakenohana.com',provider:'Sake no Hana',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Hawksmoor Guildhall':{url:'https://thehawksmoor.com/locations/guildhall/',website_url:'https://thehawksmoor.com',provider:'Hawksmoor',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Billy\'s Smokehouse':{url:'https://www.billyssmokehouse.co.uk',provider:'Billy\'s Smokehouse',type:'restaurant',link_status:'verified'},
          'KARV Steakhouse':{url:'https://karvsteakhouse.co.uk',provider:'KARV',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Jungle Braai':{url:'https://junglebraai.co.uk',provider:'Jungle Braai',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Tiger Milk Spitalfields':{url:'https://tigermilkrestaurants.com/en/restaurants/spitafields-2/',provider:'Tiger Milk',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Laki Kane':{url:'https://lakikane.com',provider:'Laki Kane',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          'Coupette':{url:'https://coupette.co.uk',provider:'Coupette',type:'experience',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'XP Tavern':{url:'https://www.xptavern.com',provider:'XP Tavern',type:'experience',link_status:'verified'},
          'Amelia\'s House':{url:'https://ameliashouse.com',provider:'Amelia\'s House',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          'Hutong':{url:'https://hutong.co.uk',provider:'Hutong',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Monopoly Lifesized':{url:'https://monopolylifesized.com',provider:'Monopoly Lifesized',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Mr Fogg\'s Residence':{url:'https://www.mr-foggs.com/mr-foggs-residence/',provider:'Mr Fogg\'s',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          'Zumbar Barbarossa':{url:'https://www.zumbarbarossa.com/london',provider:'Zumbar',type:'experience',link_status:'verified'},
          'Ballerz':{url:'https://ballerz.co.uk',provider:'Ballerz',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book now'},
          'Tate Exchange workshop':{url:'https://www.tate.org.uk/visit/tate-modern/tate-exchange',website_url:'https://www.tate.org.uk',provider:'Tate',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Book workshop'},
          'Rowans bowling + arcade Finsbury Park':{url:'https://www.rowans.co.uk',provider:'Rowans',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book now'},
          'Bouldering at The Climbing Hangar':{url:'https://www.theclimbinghangar.com',provider:'The Climbing Hangar',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book session'},
          'Sauna & cold plunge at Peckham Lido':{url:'https://www.peckhamlido.com',website_url:'https://www.peckhamlido.com',provider:'Peckham Lido',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book swim'},
          'Silverstone Interactive Museum':{url:'https://www.silverstonemuseum.co.uk',provider:'Silverstone',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Canal boat hire Little Venice':{url:null,website_url:'https://www.goboat.co.uk/london',provider:'GoBoat',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book boat'},
          'Archery tag at Boxpark Wembley':{url:null,website_url:null,provider:null,type:'experience',link_status:'needs_review'},
          'Depop vintage shopping Brick Lane':{url:null,website_url:'https://www.visitbricklane.org',provider:'Brick Lane',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Curling at Queens Ice & Bowl':{url:'https://queens.london',provider:'Queens',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book session'},
          'Open water swimming at Hampstead Ponds':{url:null,website_url:'https://www.cityoflondon.gov.uk/things-to-do/green-spaces/hampstead-heath/swimming',provider:'City of London',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Free entry'},
          'Immersive Gamebox':{url:'https://immersivegamebox.com',provider:'Immersive Gamebox',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book session'},
          'Kidzania London':{url:'https://kidzania.co.uk',provider:'Kidzania',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Two Floors rooftop bar Soho':{url:null,website_url:null,provider:null,type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Sea Life London Aquarium':{url:'https://www.visitsealife.com/london/',provider:'Sea Life',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'ZSL London Zoo evening':{url:'https://www.londonzoo.org',provider:'ZSL',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Battersea Power Station exploration':{url:'https://batterseapowerstation.co.uk',provider:'Battersea Power Station',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Visit'},
          'Junkyard minigolf + cocktails Shoreditch':{url:'https://www.junkyardgolfclub.co.uk',provider:'Junkyard Golf',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book now'},
          'Chessington World of Adventures':{url:'https://www.chessington.com',provider:'Chessington',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'Tough Mudder or Obstacle Course':{url:'https://toughmudder.co.uk',provider:'Tough Mudder',type:'experience',link_status:'needs_review',bookingType:'buy_tickets',ctaLabel:'Sign up'},
          'TopGolf Watford':{url:'https://topgolf.com/uk/watford/',provider:'TopGolf',type:'experience',link_status:'needs_review',bookingType:'book_now',ctaLabel:'Book bay'},
          'Poolhouse UK':{url:'https://www.pool.house',provider:'Poolhouse',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book table'},
          'Platform Experience Shoreditch':{url:'https://experienceplatform.co.uk',provider:'Platform',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book booth'},
          'Clays Bar':{url:'https://clays.bar',provider:'Clays',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book session'},
          'Maxwell\'s Bar & Grill':{url:'https://www.maxwells.co.uk/bookings',provider:'Maxwell\'s',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Lilibet\'s':{url:'https://www.lilibetsrestaurant.com',provider:'Lilibet\'s',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Flight Club Brunch':{url:'https://flightclubdarts.com/london/victoria/brunch',provider:'Flight Club',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book brunch'},
          'Ballie Ballerson':{url:'https://ballieballerson.com',provider:'Ballie Ballerson',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book brunch'},
          'Blame Gloria':{url:'https://blamegloria.com',provider:'Blame Gloria',type:'experience',link_status:'verified',bookingType:'book_now',ctaLabel:'Book brunch'},
          'Mr Bao':{url:'https://mrbao.co.uk',provider:'Mr Bao',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Santo Remedio':{url:'https://santoremedio.co.uk',provider:'Santo Remedio',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Scarlett Green':{url:'https://scarlettgreen.co.uk',provider:'Scarlett Green',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Thorpe Park':{url:'https://www.thorpepark.com/tickets-passes',provider:'Thorpe Park',type:'experience',link_status:'verified',bookingType:'buy_tickets',ctaLabel:'Buy tickets'},
          'PIRANA London':{url:'https://www.piranalondon.com/reservations',provider:'PIRANA',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Gilgamesh':{url:'https://www.gilgameshlondon.co.uk/reservations',provider:'Gilgamesh',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Imperial Treasure':{url:'https://www.imperialtreasure.com/uk',provider:'Imperial Treasure',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Ping Pong':{url:'https://www.pingpongdimsum.com',provider:'Ping Pong',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'BaoziInn':{url:'https://www.baoziinn.com',provider:'BaoziInn',type:'restaurant',link_status:'verified',bookingType:'walk_in',ctaLabel:'Walk in'},
          'Park Chinois':{url:'https://www.parkchinois.com',provider:'Park Chinois',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Royal China Club':{url:'https://www.royalchinagroup.co.uk',provider:'Royal China Club',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Speedboat Bar':{url:'https://www.speedboatbar.co.uk',provider:'Speedboat Bar',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Busaba':{url:'https://www.busaba.com',provider:'Busaba',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Som Saa':{url:'https://www.somsaa.com',provider:'Som Saa',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'AngloThai':{url:'https://www.anglothai.co.uk',provider:'AngloThai',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Kolae':{url:'https://www.kolae.co.uk',provider:'Kolae',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Camille':{url:'https://www.camillebistro.co.uk',provider:'Camille',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Galvin La Chapelle':{url:'https://www.galvinrestaurants.com',provider:'Galvin',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          '64 Goodge Street':{url:'https://www.64goodgestreet.com',provider:'64 Goodge Street',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Helene Darroze at The Connaught':{url:'https://www.the-connaught.co.uk/restaurants/helene-darroze',provider:'The Connaught',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Brasserie Zedel':{url:'https://www.brasseriezedel.com',provider:'Brasserie Zedel',type:'restaurant',link_status:'verified',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Trullo':{url:'https://www.trullorestaurant.com',website_url:'https://www.trullorestaurant.com',provider:'Trullo',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Manteca':{url:'https://www.mantecalondon.com',website_url:'https://www.mantecalondon.com',provider:'Manteca',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Lina Stores King\'s Cross':{url:'https://www.linastores.co.uk/pages/book',website_url:'https://www.linastores.co.uk',provider:'Lina Stores',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Officina 00':{url:'https://www.officina00.com',website_url:'https://www.officina00.com',provider:'Officina 00',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Franco Manca Soho':{url:'https://www.francomanca.co.uk/book/',website_url:'https://www.francomanca.co.uk',provider:'Franco Manca',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Honest Burgers Soho':{url:null,website_url:'https://www.honestburgers.co.uk/locations/soho/',provider:'Honest Burgers',type:'restaurant',link_status:'verified',bookingType:'walk_in',ctaLabel:'Walk in',helperText:'Walk-in only — bookings for groups of 6+ only'},
          'Bone Daddies Soho':{url:null,website_url:'https://bonedaddies.com/location/soho/',provider:'Bone Daddies',type:'restaurant',link_status:'verified',bookingType:'walk_in',ctaLabel:'Walk in only',helperText:'Soho branch is walk-in only — counter seating, expect a short wait'},
          'Pizza Pilgrims Dean Street':{url:'https://www.pizzapilgrims.co.uk/pizzerias/soho/',website_url:'https://www.pizzapilgrims.co.uk',provider:'Pizza Pilgrims',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Mercato Metropolitano':{url:'https://mercatometropolitano.com/locations/elephant-and-castle/',website_url:'https://mercatometropolitano.com',provider:'Mercato Metropolitano',type:'experience',link_status:'needs_review',bookingType:'walk_in',ctaLabel:'Visit market',helperText:'Individual traders are walk-up — larger group spaces bookable online'},
          // Upper-tier dining — batch June 2026
          'St. JOHN':{url:'https://stjohnrestaurant.com/pages/reservations',website_url:'https://stjohnrestaurant.com',provider:'St. JOHN',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Mountain':{url:'https://mountainbeakstreet.com',website_url:'https://mountainbeakstreet.com',provider:'Mountain',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Sabor':{url:'https://www.saborrestaurants.co.uk',website_url:'https://www.saborrestaurants.co.uk',provider:'Sabor',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'The Ledbury':{url:'https://www.theledbury.com',website_url:'https://www.theledbury.com',provider:'The Ledbury',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
          'Restaurant Gordon Ramsay':{url:'https://www.gordonramsayrestaurants.com/restaurant-gordon-ramsay/',website_url:'https://www.gordonramsayrestaurants.com',provider:'Gordon Ramsay Restaurants',type:'restaurant',link_status:'needs_review',bookingType:'reserve_table',ctaLabel:'Reserve table'},
        };

        // ── Startup URL validation pass ──
        // Logs warnings for any registry entries with invalid URLs
        (function _validateBookingRegistry(){
          let issues=0;
          // 1. Validate all registry URLs
          for(const[name,entry] of Object.entries(_VENUE_BOOKING)){
            if(entry.url&&!_isValidUrl(entry.url)){
              console.warn('[T4T DATA] Invalid booking URL for "'+name+'":',entry.url);
              issues++;
            }
            if(entry.website_url&&!_isValidUrl(entry.website_url)){
              console.warn('[T4T DATA] Invalid website URL for "'+name+'":',entry.website_url);
              issues++;
            }
            if(!entry.url&&!entry.website_url&&entry.link_status!=='unavailable'){
              console.warn('[T4T DATA] No URLs at all for "'+name+'" (status: '+entry.link_status+')');
              issues++;
            }
          }
          // 2. Check every IDEAS venue has a booking registry entry (exact match)
          const allTiers=['budget','mid','treat','luxury'];
          allTiers.forEach(tier=>{
            (IDEAS[tier]||[]).forEach(v=>{
              if(!_VENUE_BOOKING[v.name]){
                console.warn('[T4T DATA] IDEAS venue "'+v.name+'" ('+tier+') has no exact _VENUE_BOOKING match');
                issues++;
              }
            });
          });
          // 3. Test for name collisions in fuzzy matching
          const _testCollisions=[
            ['Padel court session for two','Padel'],
            ['Padella pasta dinner','Padella'],
            ['Toca Social','Toca Social'],
            ['All Star Lanes bowling + cocktails','All Star Lanes'],
          ];
          _testCollisions.forEach(([name,expected])=>{
            const info=_getBookingInfo(name);
            if(info.provider&&!info.provider.toLowerCase().includes(expected.toLowerCase().slice(0,4))){
              console.warn('[T4T DATA] Possible name collision: "'+name+'" resolved to provider "'+info.provider+'" (expected "'+expected+'")');
              issues++;
            }
          });
          if(issues)console.warn('[T4T DATA] '+issues+' data issue(s) found — check console warnings above');
          else console.log('[T4T DATA] All '+Object.keys(_VENUE_BOOKING).length+' registry entries validated, no collisions detected');
        })();

        // ── Venue link verification overlay ──
        // Founder-controlled overrides: mark specific venues as verified/unverified
        // regardless of what link_status says. For the beta, only verified_live venues
        // appear in live recommendations. Unverified ones get downgraded CTAs.
        //
        // Fields:
        //   verified_live: boolean — has a human confirmed this URL loads correctly?
        //   verified_at:   ISO date string — when was it last checked?
        //   cta_label:     string — custom CTA override (optional)
        //   verification_notes: string — freeform notes for the founder
        //
        // If a venue is NOT in this map, verified_live is computed from the registry:
        //   link_status==='verified' AND url is non-null → verified_live:true
        //   everything else → verified_live:false
        const _VENUE_VERIFICATION={
          // Override examples — add entries here when manually checking links:
          // 'Venue Name':{verified_live:true,verified_at:'2026-05-26',verification_notes:'Checked, loads fine'},
          // 'Broken Venue':{verified_live:false,verified_at:'2026-05-26',verification_notes:'404 on booking page'},
        };

        // Compute whether a venue has a verified live booking link
        function _isVenueVerifiedLive(venueName){
          // 1. Check explicit override first
          const ov=_VENUE_VERIFICATION[venueName];
          if(ov&&typeof ov.verified_live==='boolean')return ov.verified_live;
          // 2. Compute from registry data
          const entry=_VENUE_BOOKING[venueName];
          if(!entry)return false;
          return entry.link_status==='verified'&&!!entry.url;
        }

        // Get the CTA label for a venue — uses override, then defaults
        function _getVenueCta(venueName){
          // 1. Explicit verification override
          const ov=_VENUE_VERIFICATION[venueName];
          if(ov&&ov.cta_label)return ov.cta_label;
          // 2. Registry ctaLabel (booking-type-aware)
          const entry=_VENUE_BOOKING[venueName];
          if(!entry)return 'Save';
          if(entry.ctaLabel)return entry.ctaLabel;
          // 3. Fallback based on link_status
          if(_isVenueVerifiedLive(venueName))return'Book now';
          if(entry.link_status==='unverified'&&entry.url)return'Check availability';
          if(entry.link_status==='needs_review'&&entry.website_url)return'Visit website';
          if(entry.link_status==='unavailable')return'Save';
          return'Check availability';
        }

        // ════════════════════════════════════════════════
        // ── URL VALIDATION & NORMALIZATION ──
        // Single source of truth for all outbound links
        // ════════════════════════════════════════════════

        // Validate a URL — returns true only for well-formed http(s) URLs
        function _openExternal(url){
          if(!url)return;
          var a=document.createElement('a');
          a.href=url;a.target='_blank';a.rel='noopener noreferrer';
          a.style.display='none';
          document.body.appendChild(a);
          a.click();
          setTimeout(function(){a.remove();},100);
        }

        function _isValidUrl(url){
          if(!url||typeof url!=='string')return false;
          const trimmed=url.trim();
          if(!trimmed||trimmed.length<10)return false;
          // Reject obvious placeholders
          if(/^(https?:\/\/)?(example\.com|localhost|127\.0|test\.|placeholder|todo|tbd|fixme)/i.test(trimmed))return false;
          // Reject non-http(s) schemes
          if(!/^https?:\/\//i.test(trimmed))return false;
          try{
            const u=new URL(trimmed);
            // Must have a real hostname with a dot
            if(!u.hostname.includes('.'))return false;
            return true;
          }catch(e){return false;}
        }

        // Normalize a URL — trim, clean, standardize
        function _normalizeUrl(url){
          if(!url||typeof url!=='string')return null;
          let s=url.trim();
          // Remove accidental double wrapping
          if(s.startsWith('"')&&s.endsWith('"'))s=s.slice(1,-1);
          if(s.startsWith("'")&&s.endsWith("'"))s=s.slice(1,-1);
          // Remove trailing slashes from paths (but keep query/fragment)
          try{
            const u=new URL(s);
            // Strip known junk params that don't affect the destination
            ['fbclid','gclid','mc_cid','mc_eid','_ga','_gl','ref','ref_src'].forEach(p=>u.searchParams.delete(p));
            return u.toString();
          }catch(e){return _isValidUrl(s)?s:null;}
        }

        // Resolve the canonical URL for a venue — single entry point
        // Priority: booking_url (if valid) > website_url (if valid) > null
        function _resolveCanonicalUrl(entry){
          if(!entry)return{canonical_url:null,source:'none'};
          const bUrl=_normalizeUrl(entry.url);
          const wUrl=_normalizeUrl(entry.website_url);
          if(bUrl&&_isValidUrl(bUrl)){
            return{canonical_url:bUrl,fallback_url:wUrl,source:'booking'};
          }
          if(wUrl&&_isValidUrl(wUrl)){
            return{canonical_url:wUrl,fallback_url:null,source:'website'};
          }
          return{canonical_url:null,fallback_url:null,source:'none'};
        }

        // Get booking info — separates booking_url from website_url
        // States: verified, unverified, needs_review, website_only, broken, unavailable
        function _getBookingInfo(venueName){
          // Check for Supabase-backed venue override (set via audit.html)
          const _ovSlug=_venueSlug(venueName);
          const _ovRow=_venueOverrides.get(_ovSlug);
          if(_ovRow&&(_ovRow.url||_ovRow.link_status)){
            const entry=_VENUE_BOOKING[venueName]||{};
            const oUrl=_ovRow.url&&_isValidUrl(_normalizeUrl(_ovRow.url))?_normalizeUrl(_ovRow.url):null;
            const oStatus=_ovRow.link_status||entry.link_status||'needs_review';
            if(oUrl){
              return{booking_url:oUrl,website_url:oUrl,provider:entry.provider||'Override',verified:oStatus==='verified',link_status:oStatus,has_website:true};
            }
            if(_ovRow.link_status){
              const wUrl=_isValidUrl(_normalizeUrl(entry.website_url))?_normalizeUrl(entry.website_url):null;
              return{booking_url:null,website_url:wUrl,provider:entry.provider||null,verified:false,link_status:oStatus,has_website:!!wUrl};
            }
          }
          let known=_VENUE_BOOKING[venueName];
          // Fallback match: if exact key not found, match on whole-word boundaries only
          // Uses word tokenization to prevent substring collisions (e.g. "padel" inside "padella")
          if(!known){
            const _common=new Set(['the','and','for','with','date','night','london','dinner','lunch','two','from','this','that','evening','morning','class','session','club','bar','restaurant','tour','private','royal','experience','days','open','fire','cooking','press','champagne','cocktails','brunch','walk','market','wine','mochi','picnic','sunset','book','palace','ancient','star','lanes','film','street','arches','modern','city','court']);
            const vWords=venueName.toLowerCase().replace(/[–—:+&]/g,' ').match(/[a-z]{3,}/g)||[];
            const distinctV=vWords.filter(w=>!_common.has(w));
            if(distinctV.length){
              let bestMatch=null,bestScore=0;
              for(const key of Object.keys(_VENUE_BOOKING)){
                // Tokenize the registry key into whole words
                const kWords=key.toLowerCase().replace(/[–—:+&]/g,' ').match(/[a-z]{3,}/g)||[];
                // Count exact whole-word matches (not substrings)
                const matches=distinctV.filter(w=>kWords.includes(w)).length;
                if(matches>bestScore){bestScore=matches;bestMatch=key;}
              }
              // Require at least one whole-word match
              if(bestMatch&&bestScore>=1)known=_VENUE_BOOKING[bestMatch];
            }
          }
          if(!known)return{booking_url:null,website_url:null,provider:null,verified:false,link_status:'unavailable',has_website:false};
          const ls=known.link_status||'unverified';
          // Validate and normalize URLs
          const bUrl=_isValidUrl(_normalizeUrl(known.url))?_normalizeUrl(known.url):null;
          const wUrl=_isValidUrl(_normalizeUrl(known.website_url))?_normalizeUrl(known.website_url):null;
          // Genuinely broken or unavailable — no usable booking URL
          if(ls==='broken'||ls==='unavailable'){
            if(wUrl)return{booking_url:null,website_url:wUrl,provider:known.provider,verified:false,link_status:ls==='broken'?'website_only':'unavailable',has_website:true};
            return{booking_url:null,website_url:null,provider:null,verified:false,link_status:'unavailable',has_website:false};
          }
          // Needs review — booking deep link uncertain, but website works
          if(ls==='needs_review'||(!bUrl&&wUrl)){
            return{booking_url:null,website_url:wUrl,provider:known.provider,verified:false,link_status:'website_only',has_website:true};
          }
          // No valid URLs at all (even if fields existed, they failed validation)
          if(!bUrl&&!wUrl){
            if(known.url||known.website_url)console.warn('[T4T] Invalid URL detected for:',venueName,known.url,known.website_url);
            return{booking_url:null,website_url:null,provider:known.provider||null,verified:false,link_status:'unavailable',has_website:false};
          }
          // Booking URL exists and is valid
          return{booking_url:bUrl,website_url:wUrl||bUrl,provider:known.provider,verified:ls==='verified',link_status:ls,has_website:true};
        }

        // Current handoff state
        let _pendingBooking=null;

        // Graceful fallback — now offers official site if available
        function showVenueUnavailable(venueName,venuePrice,websiteUrl){
          _trackEvent('booking_unavailable_shown',{name:venueName,has_website:!!websiteUrl});
          const ov=document.getElementById('booking-handoff-overlay');
          const content=document.getElementById('booking-handoff-content');
          if(!ov||!content)return;
          const safeName=venueName.replace(/'/g,"\\'");
          const safeWebsite=(websiteUrl||'').replace(/'/g,"\\'");
          content.innerHTML=`
            <div style="text-align:center;padding:8px 0">
              <div style="font-size:24px;margin-bottom:12px">📌</div>
              <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">${venueName}</div>
              <div style="font-size:13px;color:rgba(255,255,255,0.45);margin-bottom:6px;line-height:1.5">${websiteUrl?'Direct booking isn\'t available, but you can visit their official site.':'Direct booking isn\'t available for this venue yet.'}</div>
              ${!websiteUrl?'<div style="font-size:11px;color:rgba(255,255,255,0.3);margin-bottom:16px">We\'re adding verified booking links during beta.</div>':''}
              <div style="display:flex;flex-direction:column;gap:8px">
                ${websiteUrl?`<button class="booking-handoff-cta" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8)" onclick="_trackEvent('official_site_clicked',{name:'${safeName}'});_openExternal('${safeWebsite}')">Visit official site ↗</button>`:''}
                <button class="booking-handoff-cta" style="background:rgba(255,255,255,0.06);color:rgba(255,255,255,0.7)" onclick="_openExternal('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent('${safeName}, London'))">Find on Google Maps ↗</button>
                <button class="plan-btn plan-btn-activate" style="width:100%" onclick="saveToWishlist('${safeName}','✦','${venuePrice||''}','experience','Saved — awaiting booking link');closeBookingHandoff();toast('✦ Saved to wishlist')">Save to wishlist</button>
                <button class="plan-btn" style="width:100%;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.35)" onclick="closeBookingHandoff()">Close</button>
              </div>
              <div style="text-align:center;margin-top:10px"><span style="font-size:11px;color:rgba(255,255,255,0.35);cursor:pointer" onclick="_trackEvent('support_clicked',{from:'booking_unavailable'});openFeedback();closeBookingHandoff()">Know a booking link? Tell us</span></div>
            </div>`;
          ov.style.display='flex';document.body.style.overflow='hidden';
        }

        // Open booking handoff overlay
        function initiateBooking(venueName,venuePrice,venueStatus,planId){
          let info;
          try{
            const planItem=planId?(_currentPlans.find(p=>p.id===planId)?.items||[]).find(i=>i.name===venueName):null;
            // Use pre-resolved URL from plan assembly if available (avoids name-based lookup collisions)
            if(planItem&&planItem._resolvedUrl){
              info=_getBookingInfo(venueName);
              // Override with assembly-time resolved data
              info.booking_url=info.booking_url||planItem._resolvedUrl;
              info.website_url=info.website_url||planItem._resolvedUrl;
              if(planItem._resolvedProvider)info.provider=planItem._resolvedProvider;
              if(planItem._resolvedLinkStatus)info.link_status=planItem._resolvedLinkStatus;
            }else{
              info=planItem?_getBookingInfoFromDB(planItem):_getBookingInfo(venueName);
            }
          }catch(err){
            _captureError(err,{context:'booking_lookup',source:'initiateBooking',venue:venueName});
            info={booking_url:null,website_url:null,provider:null,verified:false,link_status:'unavailable',has_website:false};
          }
          // Resolve canonical URL — booking_url takes priority, then website_url
          const rawPrimary=info.booking_url||info.website_url||null;
          const primaryUrl=rawPrimary?_normalizeUrl(rawPrimary):null;
          // Determine source screen
          const _bkSrc=planId?'plan_card':document.querySelector('.page.active')?.id?.replace('page-','')||'discover';
          _pendingBooking={_sid:Date.now().toString(36)+Math.random().toString(36).slice(2,5),name:venueName,price:venuePrice,status:venueStatus,planId:planId||null,url:primaryUrl,booking_url:info.booking_url,website_url:info.website_url,provider:info.provider,verified:info.verified,link_status:info.link_status||'unverified',source_screen:_bkSrc,booking_status:'clicked_out',clickedAt:new Date().toISOString()};
          _trackEvent('booking_click',{name:venueName,provider:info.provider,verified:info.verified,link_status:info.link_status,item_type:venueStatus,plan_id:planId||null,source_screen:_bkSrc,outbound_url:primaryUrl,type:'venue'});

          // Route unavailable venues to fallback (with website if available)
          if(info.link_status==='unavailable'){
            showVenueUnavailable(venueName,venuePrice,info.website_url);
            return;
          }
          // Website-only: booking URL broken but official site works
          if(info.link_status==='website_only'){
            _trackEvent('downgraded_to_official_site',{name:venueName,website_url:info.website_url});
            showVenueUnavailable(venueName,venuePrice,info.website_url);
            return;
          }

          const ov=document.getElementById('booking-handoff-overlay');
          const content=document.getElementById('booking-handoff-content');
          if(!ov||!content){toast('Booking unavailable — try again');return;}

          // Different flow for details_only (free/walk-in)
          if(venueStatus==='details_only'){
            content.innerHTML=`
              <div style="text-align:center;padding:8px 0">
                <div style="font-size:24px;margin-bottom:12px">📍</div>
                <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">${venueName}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-bottom:16px">${venuePrice} · Free / walk-in — no booking needed</div>
                <div style="background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;text-align:left;margin-bottom:16px">
                  <div style="font-size:12px;color:rgba(255,255,255,0.5);line-height:1.5">No reservation needed — just turn up and enjoy.</div>
                </div>
                <div style="display:flex;gap:8px;justify-content:center">
                  <button class="plan-btn plan-btn-save" onclick="confirmBookingDone()">✓ Add to your plan</button>
                  <button class="plan-btn" style="background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);color:rgba(255,255,255,0.4)" onclick="closeBookingHandoff()">Close</button>
                </div>
              </div>`;
            ov.style.display='flex';document.body.style.overflow='hidden';
            return;
          }

          // Provider trust badge based on link_status
          const ls=info.link_status||'unverified';
          const providerBadge=ls==='verified'
            ?'<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;background:rgba(74,222,128,0.08);border:0.5px solid rgba(74,222,128,0.15);border-radius:6px;font-size:9px;font-weight:600;color:#4ADE80">Verified link</span>'
            :ls==='unverified'
            ?'<span style="display:inline-flex;align-items:center;gap:3px;padding:2px 7px;background:rgba(251,191,36,0.08);border:0.5px solid rgba(251,191,36,0.15);border-radius:6px;font-size:9px;font-weight:600;color:#FBBF24">Unverified</span>'
            :'';

          // Destination description based on link_status
          const destDesc=ls==='verified'
            ?info.provider+'\'s official booking page'
            :ls==='unverified'
            ?info.provider+'\'s website (not recently verified)'
            :'a search page to find their booking site';

          // CTA label based on link_status
          const ctaLabel=ls==='verified'?'Book on '+info.provider+' ↗'
            :ls==='broken'?'Search for '+venueName+' ↗'
            :'Check availability on '+info.provider+' ↗';

          content.innerHTML=`
            <div style="padding:8px 0">
              <div style="text-align:center;margin-bottom:14px">
                <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:3px">${venueName}</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.35)">${venuePrice}</div>
              </div>
              <div style="background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;padding:14px;margin-bottom:14px">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
                  <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.5)">Booking via ${info.provider}</span>
                  ${providerBadge}
                </div>
                <div style="font-size:11px;color:rgba(255,255,255,0.35);line-height:1.6">This opens ${destDesc} in a new tab. Make your reservation there, then come back to confirm it.</div>
              </div>
              <button class="booking-handoff-cta" onclick="openBookingUrl()">
                ${ctaLabel}
              </button>
              <div style="font-size:11px;color:rgba(255,255,255,0.38);margin-top:8px;text-align:center">You'll book directly with the venue — we never handle payments</div>
            </div>`;

          ov.style.display='flex';document.body.style.overflow='hidden';
        }

        // Open the booking URL and show return confirmation
        // Append UTM source params without breaking the URL
        function _addUtm(url){
          try{
            const u=new URL(url);
            if(!u.searchParams.has('utm_source'))u.searchParams.set('utm_source','tablefortwo');
            if(!u.searchParams.has('utm_medium'))u.searchParams.set('utm_medium','app');
            if(!u.searchParams.has('utm_campaign'))u.searchParams.set('utm_campaign','booking');
            return u.toString();
          }catch(e){return url;}
        }

        function openBookingUrl(){
          if(!_pendingBooking||!_pendingBooking._sid){
            console.warn('[T4T] openBookingUrl called with no active booking session');
            return;
          }
          const rawUrl=_pendingBooking.url;
          const url=_normalizeUrl(rawUrl);
          if(!url||!_isValidUrl(url)){showBookingFallback();return;}
          // Verify the overlay content matches the pending booking (entity guard)
          const overlayTitle=document.querySelector('#booking-handoff-content [style*="font-weight:700"]');
          if(overlayTitle&&overlayTitle.textContent&&!overlayTitle.textContent.includes(_pendingBooking.name.split(/[,(–]/)[0].trim().slice(0,15))){
            console.warn('[T4T] Entity mismatch: overlay shows "'+overlayTitle.textContent+'" but pending is "'+_pendingBooking.name+'"');
            _captureError(new Error('Booking entity mismatch'),{context:'entity_guard',source:'openBookingUrl',venue:_pendingBooking.name});
          }
          const isDirectBooking=_pendingBooking.booking_url&&rawUrl===_pendingBooking.booking_url;
          _pendingBooking.booking_status='site_opened';
          _trackEvent(isDirectBooking?'direct_booking_clicked':'official_site_clicked',{name:_pendingBooking.name,provider:_pendingBooking.provider,link_status:_pendingBooking.link_status,url:url,source_screen:_pendingBooking.source_screen});
          _openExternal(_addUtm(url));
          showBookingReturnState();
        }

        // Fallback when URL is invalid at open time
        function showBookingFallback(){
          const fbContent=document.getElementById('booking-handoff-content');
          if(!fbContent)return;
          const name=_pendingBooking?.name||'this venue';
          const safeName=name.replace(/'/g,"\\'");
          const websiteUrl=_pendingBooking?.website_url;
          const safeWebsite=(websiteUrl||'').replace(/'/g,"\\'");
          _captureError(new Error('Booking URL invalid or missing'),{context:'booking_fallback',source:'showBookingFallback',venue:name});
          _trackEvent('broken_booking_url_detected',{name:name,provider:_pendingBooking?.provider||'unknown',has_website:!!websiteUrl});
          fbContent.innerHTML=`
            <div style="padding:8px 0">
              <div style="text-align:center;margin-bottom:14px">
                <div style="font-size:16px;font-weight:700;color:rgba(255,255,255,0.7);margin-bottom:6px">Booking link broken</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.4);line-height:1.5">The booking link for <strong style="color:rgba(255,255,255,0.6)">${name}</strong> isn't working.${websiteUrl?' You can still visit their official site.':' We\'ve flagged it for review.'}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px">
                ${websiteUrl?`<button class="booking-handoff-cta" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8)" onclick="_trackEvent('official_site_clicked',{name:'${safeName}',from:'fallback'});_openExternal('${safeWebsite}')">Visit official site ↗</button>`:''}
                <button class="plan-btn plan-btn-activate" style="width:100%" onclick="saveToWishlist('${safeName}','✦','','experience','Saved — booking link broken');closeBookingHandoff();toast('✦ Saved — we\\'ll fix the link')">Save to wishlist</button>
                <button class="plan-btn" style="width:100%;background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.35)" onclick="closeBookingHandoff()">Close</button>
              </div>
              <div style="text-align:center;margin-top:10px"><span style="font-size:11px;color:rgba(255,255,255,0.35);cursor:pointer" onclick="_trackEvent('support_clicked',{from:'booking_fallback'});openFeedback();closeBookingHandoff()">Report this issue</span></div>
            </div>`;
        }

        // After outbound click — ask if booking was completed
        function showBookingReturnState(){
          if(_pendingBooking)_pendingBooking.booking_status='returned';
          _trackEvent('booking_returned',{name:_pendingBooking?.name,provider:_pendingBooking?.provider,source_screen:_pendingBooking?.source_screen});
          const content=document.getElementById('booking-handoff-content');
          if(!content)return;
          // Freeze the entity snapshot NOW so reopen always matches what was just opened
          const frozenName=_pendingBooking?.name||'this venue';
          const frozenProvider=_pendingBooking?.provider||'the booking site';
          const frozenUrl=_pendingBooking?.url||null;
          // Safety: only show reopen if we have a valid URL that matches the current booking
          const showReopen=!!frozenUrl&&_isValidUrl(frozenUrl);
          content.innerHTML=`
            <div style="padding:8px 0">
              <div style="text-align:center;margin-bottom:16px">
                <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">Did you book ${frozenName}?</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.35);line-height:1.5">Let us know so we can keep your plan up to date.</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <button class="booking-confirm-btn booking-confirm-yes" onclick="confirmBookingDone()">
                  <span style="font-size:16px">✓</span>
                  <div style="text-align:left">
                    <div style="font-size:13px;font-weight:600">Yes, all booked</div>
                    <div style="font-size:11px;opacity:0.5;margin-top:1px">We'll save it to your upcoming dates</div>
                  </div>
                </button>
                <button class="booking-confirm-btn booking-confirm-no" onclick="confirmBookingSkipped()">
                  <span style="font-size:16px">-</span>
                  <div style="text-align:left">
                    <div style="font-size:13px;font-weight:600">Not yet</div>
                    <div style="font-size:11px;opacity:0.5;margin-top:1px">No rush — book whenever you're ready</div>
                  </div>
                </button>
                <button class="booking-confirm-btn" style="border-color:rgba(239,68,68,0.15)" onclick="confirmBookingFailed()">
                  <span style="font-size:16px;color:rgba(239,68,68,0.6)">!</span>
                  <div style="text-align:left">
                    <div style="font-size:13px;font-weight:600">Booking failed</div>
                    <div style="font-size:11px;opacity:0.5;margin-top:1px">Something went wrong on the partner site</div>
                  </div>
                </button>
                ${showReopen?`<button class="booking-confirm-btn booking-confirm-retry" onclick="openBookingUrl()">
                  <span style="font-size:16px">↗</span>
                  <div style="text-align:left">
                    <div style="font-size:13px;font-weight:600">Reopen ${frozenProvider}</div>
                    <div style="font-size:11px;opacity:0.5;margin-top:1px">Opens ${frozenName} in a new tab again</div>
                  </div>
                </button>`:''}
              </div>
            </div>`;
        }

        // User confirms they completed the booking
        function confirmBookingDone(){
          if(!_pendingBooking)return;
          const b=_pendingBooking;
          b.booking_status='confirmed_by_user';
          _trackEvent('booking_confirmed_yes',{name:b.name,provider:b.provider,verified:b.verified,plan_id:b.planId||null,source_screen:b.source_screen,outbound_url:b.url});
          // Record in bookings list with full attribution
          bookings.push({id:Date.now(),type:b.status==='bookable_now'?'restaurant':'experience',name:b.name,date:new Date().toISOString().slice(0,10),meta:'Booked via '+b.provider,amount:b.price,icon:_BOOKING_ICONS[b.status==='bookable_now'?'restaurant':'experience']||_SVG.experience,booking_status:'confirmed_by_user',provider:b.provider,outbound_url:b.url,source_screen:b.source_screen,clicked_at:b.clickedAt,confirmed_at:new Date().toISOString(),plan_id:b.planId||null});
          updateStats();renderBookings();_saveState();
          // Activate plan if applicable
          if(b.planId)activatePlan(b.planId);
          // Show success + satisfaction question
          const content=document.getElementById('booking-handoff-content');
          if(!content){toast('Booking saved');_pendingBooking=null;return;}
          const bName=b.name;const bPlanId=b.planId||'';
          content.innerHTML=`
            <div style="text-align:center;padding:8px 0">
              <div style="width:48px;height:48px;border-radius:50%;background:rgba(74,222,128,0.1);border:1.5px solid rgba(74,222,128,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:20px;color:#4ADE80">✓</div>
              <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">You're all set</div>
              <div style="font-size:12px;color:rgba(255,255,255,0.35);margin-bottom:14px">${bName} · via ${b.provider}</div>
              <div id="post-booking-q" style="padding:12px 14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.06);border-radius:12px;margin-bottom:14px;text-align:left">
                <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);margin-bottom:8px">How did that feel?</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="plan-react" onclick="postBookingAnswer('${bName.replace(/'/g,"\\'")}','${bPlanId}','yes_perfect')">Yes, perfect</button>
                  <button class="plan-react" onclick="postBookingAnswer('${bName.replace(/'/g,"\\'")}','${bPlanId}','yes_close')">Close enough</button>
                  <button class="plan-react" onclick="postBookingAnswer('${bName.replace(/'/g,"\\'")}','${bPlanId}','not_quite')">Not quite</button>
                </div>
              </div>
              <button class="plan-btn plan-btn-activate" style="width:100%" onclick="closeBookingHandoff()">Done</button>
            </div>`;
          toast('✓ Booking confirmed — '+bName);
          _pendingBooking=null;
        }

        function postBookingAnswer(name,planId,answer){
          _trackEvent('post_booking_satisfaction',{name:name,plan_id:planId||null,answer:answer});
          const q=document.getElementById('post-booking-q');
          if(q)q.innerHTML='<div style="font-size:11px;color:rgba(201,168,76,0.6);font-weight:500;padding:4px 0">Thanks — noted for next time.</div>';
        }

        // User didn't complete the booking
        function confirmBookingSkipped(){
          if(_pendingBooking){
            _pendingBooking.booking_status='not_booked';
            _trackEvent('booking_not_completed',{name:_pendingBooking.name,provider:_pendingBooking.provider,source_screen:_pendingBooking.source_screen});
          }
          _pendingBooking=null;
          closeBookingHandoff();
          toast('No problem — you can book anytime');
        }

        // User reports booking failed on partner site
        function confirmBookingFailed(){
          if(_pendingBooking){
            _pendingBooking.booking_status='failed';
            _trackEvent('booking_failed',{name:_pendingBooking.name,provider:_pendingBooking.provider,outbound_url:_pendingBooking.url,source_screen:_pendingBooking.source_screen});
          }
          const name=_pendingBooking?.name||'this venue';
          const websiteUrl=_pendingBooking?.website_url;
          _pendingBooking=null;
          // Show fallback with helpful next steps
          const content=document.getElementById('booking-handoff-content');
          if(content){
            const safeName=name.replace(/'/g,"\\'");
            const safeWebsite=(websiteUrl||'').replace(/'/g,"\\'");
            content.innerHTML=`
              <div style="text-align:center;padding:8px 0">
                <div style="font-size:24px;margin-bottom:12px;color:rgba(239,68,68,0.6)">!</div>
                <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:4px">Sorry about that</div>
                <div style="font-size:13px;color:rgba(255,255,255,0.4);margin-bottom:16px;line-height:1.5">We've logged this issue. ${websiteUrl?'You can try their official site directly.':'Try again later or save it for next time.'}</div>
                <div style="display:flex;flex-direction:column;gap:8px">
                  ${websiteUrl?`<button class="booking-handoff-cta" style="background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.8)" onclick="_openExternal('${safeWebsite}')">Visit official site ↗</button>`:''}
                  <button class="plan-btn plan-btn-activate" style="width:100%" onclick="saveToWishlist('${safeName}','✦','','experience','Saved — booking failed on partner site');closeBookingHandoff();toast('Saved to wishlist')">Save to wishlist</button>
                  <button class="plan-btn" style="width:100%;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.06);color:rgba(255,255,255,0.35)" onclick="closeBookingHandoff()">Close</button>
                </div>
              </div>`;
          } else {
            closeBookingHandoff();
            toast('Sorry about that — we\'ve noted the issue');
          }
        }

        function closeBookingHandoff(){
          const ov=document.getElementById('booking-handoff-overlay');
          if(ov){ov.style.display='none';document.body.style.overflow='';}
          _pendingBooking=null;
        }

        // Updated bookPlanItem — uses handoff flow
        function bookPlanItem(planId,itemIdx){
          const plan=_currentPlans.find(p=>p.id===planId);
          if(!plan||!plan.items[itemIdx])return;
          const item=plan.items[itemIdx];
          initiateBooking(item.name,item.price,item.status,planId);
        }

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
        let _wishlist=[];
        let _journal=[];
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
          const name=_userName();
          const firstName=name?name.split(' ')[0]:'';
          const namePart=firstName?', '+firstName:'';

          // Time-based greeting
          let greet;
          if(h>=5&&h<12) greet=`Good morning${namePart}`;
          else if(h>=12&&h<17) greet=`Good afternoon${namePart}`;
          else if(h>=17&&h<21) greet=`Good evening${namePart}`;
          else greet=firstName?`Hey ${firstName}`:'Hey';

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
          partner:"Let's plan something special for your partner",
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
                <div style="font-size:12px;font-weight:600;color:var(--plum)">Partner preferences</div>
              </div>
              <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:7px">
                <span class="badge badge-plum">✓ Vegetarian</span>
                <span class="badge badge-plum">Mediterranean</span>
                <span class="badge badge-plum">Indian</span>
                <span class="badge badge-plum">Thai</span>
                <span class="badge badge-rose">Romantic</span>
                <span class="badge badge-rose">Outdoor</span>
              </div>
              <div style="font-size:11px;color:var(--ink-muted)">Ideas prioritise vegetarian-friendly venues and outdoor settings</div>
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
            const who=_jamieSign?_userName():_partnerName();
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

        const _AVATAR_COLORS=['#FBEAF0','#EDE6F2','#E8F4FD','#E8F5E9','#FFF3E0','#FCE4EC','#F3E5F5','#E3F2FD'];

        // ── What's Hot data ──
        const WHATS_HOT_DATA=[
          // CONCERTS
          {id:'wh1',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎸',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&q=80',
          name:'Khruangbin – Rondeaux Tour',venue:'Roundhouse, Camden',date:'Sat 3 May',
          price:'From £45',tags:['Soulful','Intimate atmosphere','Live music'],venue_status:'active',url:'https://www.roundhouse.org.uk'},
          {id:'wh2',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎻',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=600&q=80',
          name:'LSO: Ravel & Debussy',venue:'Barbican Centre',date:'Fri 9 May',
          price:'From £28',tags:['Classical','Cultural','Elegant'],venue_status:'active',url:'https://www.barbican.org.uk'},
          {id:'wh3',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎹',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1520523839897-bd0b52f945a0?w=600&q=80',
          name:'Hania Rani – Piano Portraits',venue:"King's Place, King's Cross",date:'Thu 1 May',
          price:'From £35',tags:['Piano','Atmospheric','Intimate'],venue_status:'active',url:'https://www.kingsplace.co.uk'},
          {id:'wh4',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎷',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1511192336575-5a79af67a629?w=600&q=80',
          name:"Ronnie Scott's Late Night Jazz",venue:'Frith Street, Soho',date:'Every Fri & Sat',
          price:'From £30',tags:['Jazz','Late night','Iconic venue'],venue_status:'active',url:'https://www.ronniescotts.co.uk'},
          {id:'wh40',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎤',trending:'Ending soon',trendCls:'ending',
          img:'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80',
          name:'Jorja Smith – Falling or Flying',venue:'O2 Academy Brixton',date:'Fri 16 May',
          price:'From £55',tags:['R&B','Soulful','High energy'],venue_status:'active',url:'https://www.academymusicgroup.com/o2academybrixton'},
          {id:'wh41',cat:'concert',gradient:'wh-gradient-concert',emoji:'🎵',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&q=80',
          name:'Nils Frahm – All Encores',venue:'Royal Albert Hall',date:'Sat 24 May',
          price:'From £40',tags:['Electronic','Ambient','Immersive'],venue_status:'active',url:'https://www.royalalberthall.com'},
          // DINING
          {id:'wh5',cat:'dining',gradient:'wh-gradient-dining',emoji:'🥗',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1544025162-d76694265947?w=600&q=80',
          name:'Ottolenghi ROVI – Spring Menu',venue:'Wells Street, Fitzrovia',date:'Open now',
          price:'£70–85pp',tags:['Mediterranean','Vegetarian','Seasonal'],venue_status:'active'},
          {id:'wh6',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍜',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600&q=80',
          name:'Kiln – Northern Thai Fire',venue:'Brewer Street, Soho',date:'Open now',
          price:'£45pp',tags:['Thai','Vibrant','Counter dining'],venue_status:'active'},
          {id:'wh7',cat:'dining',gradient:'wh-gradient-dining',emoji:'🥢',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1579027989536-b7b1f875659b?w=600&q=80',
          name:'Bossa – Brazilian Izakaya',venue:'Hoxton Square, Shoreditch',date:'Open now',
          price:'£55pp',tags:['Japanese-Brazilian','Cocktails','Intimate'],venue_status:'active'},
          {id:'wh8',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍛',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=600&q=80',
          name:'Gymkhana – Tasting Menu',venue:'Albemarle Street, Mayfair',date:'Open now',
          price:'£115pp',tags:['Indian fine dining','Refined','Cultural'],venue_status:'active'},
          {id:'wh9',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍱',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1553621042-f6e147245754?w=600&q=80',
          name:'Matsunoki – Omakase Counter',venue:'Marylebone High Street',date:'Open now',
          price:'£95pp',tags:['Japanese','Omakase','Intimate'],venue_status:'active'},
          {id:'wh42',cat:'dining',gradient:'wh-gradient-dining',emoji:'🦪',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1615141982883-c7ad0e69fd62?w=600&q=80',
          name:'The Oystermen – Seafood Bar',venue:'Covent Garden',date:'Open now',
          price:'£60pp',tags:['Seafood','Champagne','Intimate'],venue_status:'active'},
          {id:'wh43',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍝',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=600&q=80',
          name:'Padella – Fresh Pasta Counter',venue:'Borough Market, SE1',date:'Open now',
          price:'£25pp',tags:['Italian','Handmade pasta','Queue-worthy'],venue_status:'active'},
          {id:'wh44',cat:'dining',gradient:'wh-gradient-dining',emoji:'🥩',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1558030006-450675393462?w=600&q=80',
          name:'Brat – Open Fire Cooking',venue:'Shoreditch High Street',date:'Open now',
          price:'£85pp',tags:['Michelin','Fire-cooked','Intimate'],venue_status:'active'},
          {id:'wh45',cat:'dining',gradient:'wh-gradient-dining',emoji:'🫕',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1600891964092-4316c288032e?w=600&q=80',
          name:'Bob Bob Ricard – Press for Champagne',venue:'Soho',date:'Open now',
          price:'£90pp',tags:['Glamorous','Champagne button','Iconic'],venue_status:'active'},
          // EXPERIENCES
          {id:'wh10',cat:'experience',gradient:'wh-gradient-experience',emoji:'🎬',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=600&q=80',
          name:'Secret Cinema: La Dolce Vita',venue:'Tobacco Dock, Wapping',date:'Every Fri & Sat',
          price:'£49pp',tags:['Italian','Cinematic','Romantic'],venue_status:'active'},
          {id:'wh11',cat:'experience',gradient:'wh-gradient-experience',emoji:'🌿',trending:'Ending soon',trendCls:'ending',
          img:'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=600&q=80',
          name:'Kew Gardens – Orchid Festival',venue:'Royal Botanic Gardens, Kew',date:'Until 4 May',
          price:'£22pp',tags:['Outdoor','Romantic','Garden'],venue_status:'active'},
          {id:'wh12',cat:'experience',gradient:'wh-gradient-experience',emoji:'🫙',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1565193566173-7a0ee3dbe261?w=600&q=80',
          name:'Pottery Date at Turning Earth',venue:'London Fields, Hackney',date:'Saturdays',
          price:'£65pp',tags:['Creative','Intimate','Hands-on'],venue_status:'active'},
          {id:'wh13',cat:'experience',gradient:'wh-gradient-experience',emoji:'🎨',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=600&q=80',
          name:'Life Drawing with Wine',venue:'Bermondsey Street, SE1',date:'Wed & Fri evenings',
          price:'£40pp',tags:['Creative','Relaxed','Cultural'],venue_status:'active'},
          {id:'wh46',cat:'experience',gradient:'wh-gradient-experience',emoji:'🎭',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&q=80',
          name:'Punchdrunk: The Burnt City',venue:'Woolwich Works, SE18',date:'Thu–Sat evenings',
          price:'£58pp',tags:['Immersive','Theatre','Atmospheric'],venue_status:'active'},
          {id:'wh47',cat:'experience',gradient:'wh-gradient-experience',emoji:'🔮',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&q=80',
          name:'Frameless – Immersive Art',venue:'Marble Arch',date:'Open daily',
          price:'£32pp',tags:['Art','Immersive','Photography'],venue_status:'active'},
          // ACTIVITIES
          {id:'wh14',cat:'activity',gradient:'wh-gradient-activity',emoji:'🍸',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=600&q=80',
          name:'Cocktail Masterclass – Negroni Ed.',venue:'Cahoots, Kingly Court, Soho',date:'Thursdays',
          price:'£55pp',tags:['Fun','Intimate','Drinks'],venue_status:'active'},
          {id:'wh15',cat:'activity',gradient:'wh-gradient-activity',emoji:'🍜',trending:'Hot',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1569050467447-ce54b3bbc37d?w=600&q=80',
          name:'Japanese Ramen Workshop',venue:'Notting Hill Kitchen',date:'Saturdays',
          price:'£70pp',tags:['Japanese','Cooking','Intimate'],venue_status:'active'},
          {id:'wh16',cat:'activity',gradient:'wh-gradient-activity',emoji:'🧘',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=600&q=80',
          name:'Sunrise Yoga at Sky Garden',venue:'20 Fenchurch Street, City',date:'Sun 4 May, 7am',
          price:'£28pp',tags:['Outdoor','Wellness','Active'],venue_status:'active'},
          {id:'wh48',cat:'activity',gradient:'wh-gradient-activity',emoji:'🏎️',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',
          name:'F1 Arcade – Racing Simulators',venue:'One New Change, City',date:'Open daily',
          price:'£35pp',tags:['Competitive','Fun','High-tech'],venue_status:'active'},
          {id:'wh49',cat:'activity',gradient:'wh-gradient-activity',emoji:'🎳',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1540747913346-19e32dc3e97e?w=600&q=80',
          name:'All Star Lanes – Boutique Bowling',venue:'Holborn',date:'Open daily',
          price:'£38pp',tags:['Retro','Cocktails','Playful'],venue_status:'active'},
          // ROOFTOPS
          {id:'wh50',cat:'rooftop',gradient:'wh-gradient-rooftop',emoji:'🌇',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=600&q=80',
          name:'Sushisamba – 38th Floor',venue:'Heron Tower, Liverpool Street',date:'Open now',
          price:'£95pp',tags:['Japanese-Brazilian','Skyline views','Prestige'],venue_status:'active'},
          {id:'wh51',cat:'rooftop',gradient:'wh-gradient-rooftop',emoji:'🥂',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=600&q=80',
          name:'Aqua Shard – Sunset Cocktails',venue:'31st Floor, The Shard',date:'Open now',
          price:'£75pp',tags:['Panoramic','Cocktails','Romantic'],venue_status:'active'},
          {id:'wh52',cat:'rooftop',gradient:'wh-gradient-rooftop',emoji:'🍹',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1560624052-449f5ddf0c31?w=600&q=80',
          name:'Roof East – Open Air Cinema',venue:'Stratford Multi-Storey',date:'Fri & Sat',
          price:'£22pp',tags:['Outdoor cinema','Casual','Summer vibes'],venue_status:'active'},
          {id:'wh53',cat:'rooftop',gradient:'wh-gradient-rooftop',emoji:'🌃',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=600&q=80',
          name:'Madison – St Paul\'s Terrace',venue:'One New Change, City',date:'Open now',
          price:'£55pp',tags:['St Paul\'s view','Elegant','After-work'],venue_status:'active'},
          // THEATRE
          {id:'wh54',cat:'theatre',gradient:'wh-gradient-theatre',emoji:'🎭',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1503095396549-807759245b35?w=600&q=80',
          name:'Cabaret at the Kit Kat Club',venue:'Playhouse Theatre, West End',date:'Mon–Sat',
          price:'From £35',tags:['Immersive','Iconic','Intimate'],venue_status:'active'},
          {id:'wh55',cat:'theatre',gradient:'wh-gradient-theatre',emoji:'🩰',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80',
          name:'Romeo & Juliet – Royal Ballet',venue:'Royal Opera House, Covent Garden',date:'Until 10 May',
          price:'From £28',tags:['Ballet','World-class','Romantic'],venue_status:'active'},
          {id:'wh56',cat:'theatre',gradient:'wh-gradient-theatre',emoji:'✨',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1460723237483-7a6dc9d0b212?w=600&q=80',
          name:'Stranger Things: The First Shadow',venue:'Phoenix Theatre, West End',date:'Mon–Sat',
          price:'From £25',tags:['Sci-fi','Immersive','Production'],venue_status:'active'},
          {id:'wh57',cat:'theatre',gradient:'wh-gradient-theatre',emoji:'🎪',trending:'Ending soon',trendCls:'ending',
          img:'https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?w=600&q=80',
          name:'The Book of Mormon',venue:'Gielgud Theatre, West End',date:'Mon–Sat',
          price:'From £30',tags:['Musical','Comedy','Award-winning'],venue_status:'active'},
          // WELLNESS
          {id:'wh58',cat:'wellness',gradient:'wh-gradient-wellness',emoji:'🧖',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1544161515-4ab6ce6db874?w=600&q=80',
          name:'AIRE Ancient Baths – Couples',venue:'Porchester Road, Bayswater',date:'Open daily',
          price:'£95pp',tags:['Candlelit','Thermal','Romantic'],venue_status:'active'},
          {id:'wh59',cat:'wellness',gradient:'wh-gradient-wellness',emoji:'🧊',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1507652313519-d4e9174996dd?w=600&q=80',
          name:'Monk London – Ice Bath & Sauna',venue:'Fulham',date:'Open daily',
          price:'£45pp',tags:['Cold plunge','Contrast therapy','Trending'],venue_status:'active'},
          {id:'wh60',cat:'wellness',gradient:'wh-gradient-wellness',emoji:'💆',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1600334129128-685c5582fd35?w=600&q=80',
          name:'Cowshed Spa – Couples Retreat',venue:'Shoreditch House',date:'Open daily',
          price:'£120pp',tags:['Spa','Members club','Luxury'],venue_status:'active'},
          // LATE NIGHT
          {id:'wh61',cat:'latenight',gradient:'wh-gradient-latenight',emoji:'🌙',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1566737236500-c8ac43014a67?w=600&q=80',
          name:'Experimental Cocktail Club',venue:'Chinatown, Soho',date:'Wed–Sun, 6pm–2am',
          price:'£50pp',tags:['Speakeasy','Inventive cocktails','Moody'],venue_status:'active'},
          {id:'wh62',cat:'latenight',gradient:'wh-gradient-latenight',emoji:'🎵',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1571204829887-3b8d69e4094d?w=600&q=80',
          name:'Nightjar – Jazz & Cocktails',venue:'Shoreditch',date:'Tue–Sat, 6pm–1am',
          price:'£55pp',tags:['Prohibition','Live jazz','Hidden bar'],venue_status:'active'},
          {id:'wh63',cat:'latenight',gradient:'wh-gradient-latenight',emoji:'🍷',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=600&q=80',
          name:'Swift – Upstairs & Downstairs',venue:'Soho',date:'Mon–Sat, 3pm–1am',
          price:'£40pp',tags:['Whisky','Art deco','Intimate'],venue_status:'active'},
          {id:'wh64',cat:'latenight',gradient:'wh-gradient-latenight',emoji:'🎶',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=600&q=80',
          name:'The Blues Kitchen – Live Music',venue:'Camden, Shoreditch, Brixton',date:'Every night',
          price:'Free–£15',tags:['Blues','Southern food','Dancing'],venue_status:'active'},
          // DINING — Matcha
          {id:'wh65',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍵',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?w=600&q=80',
          name:'Jenki Matcha – Soho',venue:'Lexington Street, Soho',date:'Open daily',
          price:'£15pp',tags:['Matcha','Aesthetic','Calm'],venue_status:'active'},
          {id:'wh66',cat:'dining',gradient:'wh-gradient-dining',emoji:'🍵',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1563822249366-3efb23b8e0c9?w=600&q=80',
          name:'Tsujiri – Kyoto Matcha House',venue:'Wardour Street, Soho',date:'Open daily',
          price:'£18pp',tags:['Kyoto matcha','Mochi','Soft serve'],venue_status:'active'},
          {id:'wh67',cat:'activity',gradient:'wh-gradient-activity',emoji:'🍵',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1556881286-fc6915169721?w=600&q=80',
          name:'Cubo – Matcha Ceremony for Two',venue:'Redchurch Street, Shoreditch',date:'Wed–Sun',
          price:'£55pp',tags:['Hands-on','Japanese','Intimate'],venue_status:'active'},
          // SOCIAL — Toca, Crazy Golf, Padel
          {id:'wh73',cat:'activity',gradient:'wh-gradient-activity',emoji:'⚽',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600&q=80',
          name:'Toca Social – Football Arcade',venue:'The O2, Greenwich',date:'Open daily',
          price:'£25pp',tags:['Interactive','Cocktails','Competitive'],venue_status:'active'},
          {id:'wh74',cat:'activity',gradient:'wh-gradient-activity',emoji:'⛳',trending:'🔥 Trending',trendCls:'hot',
          img:'https://wjezqqtkxhzydyzxocow.supabase.co/storage/v1/object/public/images/carl-raw-8Gdayy2Lhi0-unsplash.jpg',
          name:'Swingers – Crazy Golf & Cocktails',venue:'City & West End',date:'Open daily',
          price:'£28pp',tags:['Crazy golf','Street food','Date night'],venue_status:'active'},
          {id:'wh75',cat:'activity',gradient:'wh-gradient-activity',emoji:'🎾',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=600&q=80',
          name:'Padel – Court Session for Two',venue:'Various London locations',date:'Open daily',
          price:'£22pp',tags:['Padel','Competitive','Active'],venue_status:'active'},
          // FITNESS — Boxing, Yoga, Pilates
          {id:'wh68',cat:'activity',gradient:'wh-gradient-activity',emoji:'🥊',trending:'🔥 Trending',trendCls:'hot',
          img:'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600&q=80',
          name:'Kobox – Boxing Date Night',venue:'King\'s Road, Chelsea',date:'Open daily',
          price:'£28pp',tags:['Boxing','Competitive','High energy'],venue_status:'active'},
          {id:'wh69',cat:'activity',gradient:'wh-gradient-activity',emoji:'🧘',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&q=80',
          name:'Triyoga – Flow & Brunch',venue:'Camden, Shoreditch, Chelsea',date:'Open daily',
          price:'£30pp',tags:['Yoga','Brunch','Mindful'],venue_status:'active'},
          {id:'wh70',cat:'activity',gradient:'wh-gradient-activity',emoji:'🤸',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&q=80',
          name:'Heartcore – Reformer Pilates for Two',venue:'Notting Hill, Fitzrovia',date:'Open daily',
          price:'£35pp',tags:['Pilates','Reformer','Side-by-side'],venue_status:'active'},
          {id:'wh71',cat:'activity',gradient:'wh-gradient-activity',emoji:'🥊',trending:'Rising',trendCls:'rising',
          img:'https://images.unsplash.com/photo-1549719386-74dfcbf7dbed?w=600&q=80',
          name:'BXR Boxing – Pad Work Session',venue:'Chiltern Street, Marylebone',date:'Open daily',
          price:'£25pp',tags:['Boxing','Luxury gym','Endorphins'],venue_status:'active'},
          {id:'wh72',cat:'wellness',gradient:'wh-gradient-wellness',emoji:'🧘',trending:'New this week',trendCls:'new',
          img:'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&q=80',
          name:'Hotpod Yoga – 37° Pod Session',venue:'Various London locations',date:'Open daily',
          price:'£16pp',tags:['Hot yoga','Intimate','Relaxing'],venue_status:'active'},
        ];

        // ════════════════════════════════════════════════
        // ── EAT TAB (dynamic browse from IDEAS) ──
        // ════════════════════════════════════════════════
        let _eatFilter='All';
        let _eatVenues=[];

        function _buildEatVenues(){
          if(_eatVenues.length)return _eatVenues;
          const diningLoc=['italian','pizza','pasta','indian','japanese','ramen','matcha','chinese','spanish','tapas','french','thai','mediterranean','british','american','burgers','sri lankan','street food','market','wine','restaurant','dining','brasserie','bistro','cafe','café','grill','kitchen','supper','brunch','deli'];
          const all=[];
          const seen=new Set();
          ['budget','mid','treat','luxury'].forEach(tier=>{
            (IDEAS[tier]||[]).forEach(v=>{
              if(seen.has(v.name))return;
              const fmt=v.t&&v.t.fmt?v.t.fmt:[];
              const locLower=(v.loc||'').toLowerCase();
              const hasDiningFmt=fmt.includes('dining');
              const hasDiningLoc=diningLoc.some(k=>locLower.includes(k));
              if(hasDiningFmt&&hasDiningLoc){seen.add(v.name);all.push(v);}
            });
          });
          _eatVenues=all.sort((a,b)=>(b.score||0)-(a.score||0));
          return _eatVenues;
        }

        function _getEatCuisines(){
          const whitelist=['Italian','Indian','Japanese','Chinese','Spanish','French','Thai','Mediterranean','British','American','Sri Lankan','Middle Eastern','Street Food','Wine Bar','Halal','Vegetarian','Vegan'];
          const map={
            'italian':'Italian','pizza':'Italian','pasta':'Italian',
            'indian':'Indian','sri lankan':'Sri Lankan',
            'japanese':'Japanese','ramen':'Japanese','matcha':'Japanese',
            'chinese':'Chinese',
            'spanish':'Spanish','tapas':'Spanish',
            'french':'French',
            'thai':'Thai',
            'mediterranean':'Mediterranean',
            'british':'British','modern british':'British',
            'american':'American','burgers':'American',
            'middle eastern':'Middle Eastern','levantine':'Middle Eastern','turkish':'Middle Eastern','moroccan':'Middle Eastern',
            'street food':'Street Food','market':'Street Food',
            'wine':'Wine Bar',
          };
          const found=new Set();
          _buildEatVenues().forEach(v=>{
            const raw=(v.loc||'').split('·')[1]||'';
            const lower=raw.toLowerCase().trim();
            for(const[key,label] of Object.entries(map)){
              if(lower.includes(key)){found.add(label);break;}
            }
            const d=v.dietary||[];
            if(d.includes('halal'))found.add('Halal');
            if(d.includes('vegetarian'))found.add('Vegetarian');
            if(d.includes('vegan'))found.add('Vegan');
          });
          return['All',...whitelist.filter(w=>found.has(w))];
        }

        function _renderEatTab(){
          const pills=document.getElementById('eat-pills');
          const grid=document.getElementById('eat-grid');
          if(!pills||!grid)return;
          const cuisines=_getEatCuisines();
          pills.innerHTML=cuisines.map(c=>{
            const active=c===_eatFilter;
            return'<div class="occasion-chip'+(active?' active':'')+'" style="flex-shrink:0;white-space:nowrap" onclick="_filterEat(\''+c.replace(/'/g,"\\'")+'\',this)">'+c+'</div>';
          }).join('');
          const venues=_buildEatVenues();
          const _eatMap={'italian':'Italian','pizza':'Italian','pasta':'Italian','indian':'Indian','sri lankan':'Sri Lankan','japanese':'Japanese','ramen':'Japanese','matcha':'Japanese','chinese':'Chinese','spanish':'Spanish','tapas':'Spanish','french':'French','thai':'Thai','mediterranean':'Mediterranean','british':'British','modern british':'British','american':'American','burgers':'American','middle eastern':'Middle Eastern','turkish':'Middle Eastern','moroccan':'Middle Eastern','levantine':'Middle Eastern','market':'Street Food','street food':'Street Food','wine':'Wine Bar'};
          const _dietaryFilters={'Halal':'halal','Vegetarian':'vegetarian','Vegan':'vegan'};
          const filtered=_eatFilter==='All'?venues:_dietaryFilters[_eatFilter]?venues.filter(v=>(v.dietary||[]).includes(_dietaryFilters[_eatFilter])):venues.filter(v=>{
            const raw=(v.loc||'').split('·')[1]||'';
            const lower=raw.toLowerCase().trim();
            for(const[key,label] of Object.entries(_eatMap)){
              if(lower.includes(key))return label===_eatFilter;
            }
            return raw.trim()===_eatFilter;
          });
          if(!filtered.length){
            grid.innerHTML='<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,0.38);font-size:13px">No dining venues for this cuisine yet.</div>';
            return;
          }
          grid.innerHTML=filtered.map(v=>{
            const area=(v.loc||'').split('·')[0].trim();
            const cuisine=(v.loc||'').split('·').slice(1).join('·').trim();
            const safeName=v.name.replace(/'/g,"\\'");
            const safePrice=(v.price||'').replace(/'/g,"\\'");
            return'<div class="idea-card" style="display:flex;gap:0;overflow:hidden;cursor:pointer" onclick="initiateBooking(\''+safeName+'\',\''+safePrice+'\',\'partner_handoff\',null)">'
              +'<div style="width:110px;flex-shrink:0;overflow:hidden;position:relative">'
              +'<img src="'+v.img+'" alt="'+v.name+'" style="width:100%;height:100%;object-fit:cover;display:block;min-height:120px" onerror="this.style.display=\'none\'">'
              +'</div>'
              +'<div style="flex:1;padding:14px 16px;display:flex;flex-direction:column;justify-content:center">'
              +'<div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:3px">'+v.name+'</div>'
              +'<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px">'+area+(cuisine?' · '+cuisine:'')+'</div>'
              +'<div style="font-size:13px;font-weight:600;color:rgba(201,168,76,0.7);margin-bottom:6px">'+v.price+'</div>'
              +(v.dietary&&v.dietary.length?'<div style="display:flex;flex-wrap:wrap;gap:3px;margin-bottom:4px">'+v.dietary.map(function(t){var lb={halal:'Halal',vegetarian:'Veg',vegan:'Vegan',pescatarian:'Pesc',gluten_free:'GF',kosher:'Kosher'};var co={halal:'#2D8B4E',vegetarian:'#2D8B4E',vegan:'#166534',pescatarian:'#1E6091',gluten_free:'#92400E',kosher:'#5B21B6'};return'<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:'+co[t]+'22;color:'+co[t]+';border:0.5px solid '+co[t]+'44;font-weight:600">'+(lb[t]||t)+'</span>';}).join('')+'</div>':'')
              +'<div style="font-size:11px;color:rgba(255,255,255,0.35);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+v.why+'</div>'
              +'</div>'
              +'</div>';
          }).join('');
        }

        function _filterEat(cuisine,el){
          _eatFilter=cuisine;
          document.querySelectorAll('#eat-pills .occasion-chip').forEach(c=>c.classList.remove('active'));
          if(el)el.classList.add('active');
          _renderEatTab();
        }

        // ════════════════════════════════════════════════
        // ── ACTIVITIES TAB (dynamic browse from IDEAS) ──
        // ════════════════════════════════════════════════
        let _actFilter='All';
        let _actVenues=[];

        function _buildActVenues(){
          if(_actVenues.length)return _actVenues;
          const seen=new Set();
          ['budget','mid','treat','luxury'].forEach(tier=>{
            (IDEAS[tier]||[]).forEach(v=>{
              if(seen.has(v.name))return;
              const fmt=v.t&&v.t.fmt?v.t.fmt:[];
              if(fmt.includes('dining'))return;
              if(['fun','outdoor','cultural','all','romantic'].includes(v.type)){
                seen.add(v.name);_actVenues.push(v);
              }
            });
          });
          _actVenues.sort((a,b)=>(b.score||0)-(a.score||0));
          return _actVenues;
        }

        function _getActCategories(){
          const whitelist=['Outdoor','Cultural','Nightlife','Wellness','Active','Unique'];
          const found=new Set();
          _buildActVenues().forEach(v=>{
            const mood=v.mood||[];
            const vibes=v.vibes||[];
            if(v.type==='outdoor'||mood.includes('outdoors'))found.add('Outdoor');
            if(v.type==='cultural'||mood.includes('cultural'))found.add('Cultural');
            if(mood.includes('nightlife')||mood.includes('playful'))found.add('Nightlife');
            if(mood.includes('wellness'))found.add('Wellness');
            if(mood.includes('active'))found.add('Active');
            if(vibes.includes('Unique / memorable'))found.add('Unique');
          });
          return['All',...whitelist.filter(w=>found.has(w))];
        }

        function _actMatchesFilter(v,filter){
          if(filter==='All')return true;
          const mood=v.mood||[];
          const vibes=v.vibes||[];
          if(filter==='Outdoor')return v.type==='outdoor'||mood.includes('outdoors');
          if(filter==='Cultural')return v.type==='cultural'||mood.includes('cultural');
          if(filter==='Nightlife')return mood.includes('nightlife')||mood.includes('playful');
          if(filter==='Wellness')return mood.includes('wellness');
          if(filter==='Active')return mood.includes('active');
          if(filter==='Unique')return vibes.includes('Unique / memorable');
          return false;
        }

        function _renderActTab(){
          const pills=document.getElementById('act-pills');
          const grid=document.getElementById('act-grid');
          if(!pills||!grid)return;
          const categories=_getActCategories();
          pills.innerHTML=categories.map(c=>{
            const active=c===_actFilter;
            return'<div class="occasion-chip'+(active?' active':'')+'" style="flex-shrink:0;white-space:nowrap" onclick="_filterAct(\''+c.replace(/'/g,"\\'")+'\',this)">'+c+'</div>';
          }).join('');
          const venues=_buildActVenues();
          const filtered=venues.filter(v=>_actMatchesFilter(v,_actFilter));
          if(!filtered.length){
            grid.innerHTML='<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,0.38);font-size:13px">No activities for this category yet.</div>';
            return;
          }
          grid.innerHTML=filtered.map(v=>{
            const area=(v.loc||'').split('·')[0].trim();
            const desc=(v.loc||'').split('·').slice(1).join('·').trim();
            const safeName=v.name.replace(/'/g,"\\'");
            const safePrice=(v.price||'').replace(/'/g,"\\'");
            return'<div class="idea-card" style="display:flex;gap:0;overflow:hidden;cursor:pointer" onclick="initiateBooking(\''+safeName+'\',\''+safePrice+'\',\'partner_handoff\',null)">'
              +'<div style="width:110px;flex-shrink:0;overflow:hidden;position:relative">'
              +'<img src="'+v.img+'" alt="'+v.name+'" style="width:100%;height:100%;object-fit:cover;display:block;min-height:120px" onerror="this.style.display=\'none\'">'
              +'</div>'
              +'<div style="flex:1;padding:14px 16px;display:flex;flex-direction:column;justify-content:center">'
              +'<div style="font-size:14px;font-weight:600;color:rgba(255,255,255,0.9);margin-bottom:3px">'+v.name+'</div>'
              +'<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px">'+area+(desc?' · '+desc:'')+'</div>'
              +'<div style="font-size:13px;font-weight:600;color:rgba(201,168,76,0.7);margin-bottom:6px">'+v.price+'</div>'
              +'<div style="font-size:11px;color:rgba(255,255,255,0.35);line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">'+v.why+'</div>'
              +'</div>'
              +'</div>';
          }).join('');
        }

        function _filterAct(category,el){
          _actFilter=category;
          document.querySelectorAll('#act-pills .occasion-chip').forEach(c=>c.classList.remove('active'));
          if(el)el.classList.add('active');
          _renderActTab();
        }

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
          const items=(_whCat==='all'?WHATS_HOT_DATA:WHATS_HOT_DATA.filter(i=>i.cat===_whCat)).filter(i=>!i.venue_status||i.venue_status==='active');
          const catLabels={concert:'Concert',dining:'Dining',experience:'Experience',activity:'Activity',rooftop:'Rooftop',theatre:'Theatre',wellness:'Wellness',latenight:'Late Night'};
          const pinSVG=`<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`;
          const peopleSVG=`<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`;
          if(!items.length){
            feed.innerHTML='<div style="text-align:center;padding:40px 20px;color:rgba(255,255,255,0.38);font-size:13px">Nothing in this category this week. <span style="color:rgba(201,168,76,0.5);cursor:pointer" onclick="whFilter(\'all\',document.querySelector(\'.wh-chip\'))">Show all</span></div>';
            return;
          }
          feed.innerHTML=items.map(item=>`
            <div class="wh-card" data-wh-id="${item.id}" onclick="whOpenDetail(WHATS_HOT_DATA.find(x=>x.id==='${item.id}'))">
              <div class="wh-card-top ${item.gradient}">
                <img class="wh-card-img" src="${item.img}" alt="${item.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
                <div class="wh-card-top-inner">${item.emoji}</div>
                <div class="wh-trending-pill ${item.trendCls}">${item.trending}</div>
              </div>
              <div class="wh-card-body">
                <div class="wh-cat-tag">${catLabels[item.cat]||item.cat}</div>
                <div class="wh-name">${item.name}</div>
                <div class="wh-venue">${pinSVG} ${item.venue} · <span style="color:rgba(201,168,76,0.6)">${item.date}</span></div>
                <div class="wh-tags">${item.tags.map(t=>`<span class="wh-tag">${t}</span>`).join('')}</div>
                <div class="wh-footer">
                  <div>
                    <div class="wh-booked">${peopleSVG} Popular this week</div>
                    <div class="wh-price">${item.price}<span class="wh-price-note">av. per person</span></div>
                  </div>
                  <div style="display:flex;gap:6px;align-items:center">
                    <button class="wh-save-btn" onclick="event.stopPropagation();shareIdea('${item.name.replace(/'/g,"\\'")}','${item.venue.replace(/'/g,"\\'")}','${item.price.replace(/'/g,"\\'")}')" style="padding:9px 11px;min-width:0">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    </button>
                    <button class="wh-save-btn" onclick="event.stopPropagation();saveToWishlist('${item.name.replace(/'/g,"\\'")}','✦','${item.price.replace(/'/g,"\\'")}','${item.cat}','Trending in London');this.innerHTML='✓ Saved';this.style.background='rgba(74,222,128,0.15)';this.style.borderColor='rgba(74,222,128,0.4)';this.style.color='#4ADE80'">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
                      Save
                    </button>
                  </div>
                </div>
              </div>
            </div>`).join('');
        }

        function whOpenDetail(item){
          // Clear any stale booking state — this overlay reuses bf-overlay
          _pendingBooking=null;
          const catLabels={concert:'Concert',dining:'Dining',experience:'Experience',activity:'Activity',rooftop:'Rooftop',theatre:'Theatre',wellness:'Wellness',latenight:'Late Night'};
          const catLabel=catLabels[item.cat]||item.cat;
          const safeName=item.name.replace(/'/g,"\\'");
          const safeVenue=item.venue.replace(/'/g,"\\'");
          const safePrice=item.price.replace(/'/g,"\\'");
          const ov=document.getElementById('bf-overlay');
          const el=document.getElementById('bf-content');
          if(!ov||!el)return;
          el.innerHTML=`
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
              <div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--rose-dark)">${catLabel}</div>
              <button class="btn btn-sm" onclick="closeBf()" style="font-size:11px;padding:4px 10px">✕</button>
            </div>
            <div style="border-radius:14px;overflow:hidden;margin-bottom:14px;position:relative">
              <img src="${item.img}" alt="${item.name}" style="width:100%;height:180px;object-fit:cover;display:block" onerror="this.style.display='none'">
              <div style="position:absolute;top:10px;left:10px" class="wh-trending-pill ${item.trendCls}">${item.trending}</div>
            </div>
            <div style="font-size:20px;font-weight:700;color:#fff;margin-bottom:4px;font-family:var(--font-serif)">${item.name}</div>
            <div style="font-size:12px;color:var(--subtle);margin-bottom:10px;display:flex;align-items:center;gap:5px">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
              ${item.venue} · ${item.date}
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;margin-bottom:14px">
              ${item.tags.map(t=>`<span class="wh-tag">${t}</span>`).join('')}
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;padding:10px 12px;background:rgba(255,255,255,0.04);border-radius:10px;border-left:2px solid var(--rose)">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
              <span style="font-size:12px;color:var(--subtle)">Popular this week</span>
            </div>
            <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:16px">
              <div style="font-size:18px;font-weight:700;color:#fff">${item.price}<span style="font-size:11px;color:var(--subtle);font-weight:400;margin-left:4px">per person</span></div>
            </div>
            ${item.url
              ?`<a class="btn btn-rose" href="${item.url}" target="_blank" rel="noopener" style="width:100%;justify-content:center;padding:14px;border-radius:12px;font-size:15px;font-weight:700;text-decoration:none;display:flex" onclick="closeBf()">Visit venue site ↗</a>`
              :`<button class="btn btn-rose" style="width:100%;justify-content:center;padding:14px;border-radius:12px;font-size:15px;font-weight:700" onclick="closeBf();initiateBooking('${safeName}','${safePrice}','partner_handoff',null)">Book via partner ↗</button>`}
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn" style="flex:1;justify-content:center;padding:11px;font-size:12px;border-radius:10px" onclick="event.stopPropagation();saveToWishlist('${safeName}','✦','${safePrice}','${item.cat}','Trending in London');closeBf()">Save to wishlist</button>
              <button class="btn" style="flex:1;justify-content:center;padding:11px;font-size:12px;border-radius:10px" onclick="event.stopPropagation();shareIdea('${safeName}','${safeVenue}','${safePrice}');closeBf()">Share</button>
            </div>`;
          ov.style.display='flex';document.body.style.overflow='hidden';
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
          const vibeLabels={romantic:'Restaurant',fun:'Nightlife',outdoor:'Outdoors',all:'Activity'};
          const vLabel=vibeLabels[_vibeType]||'Any vibe';
          const activePill=document.querySelector('#budget-pills .occasion-chip.active');
          const bLabel=activePill?activePill.textContent.trim():(_BUDGET_BANDS.find(b=>b.id===_activeBudgetBand)||{}).label||'Any budget';
          const el=document.getElementById('discover-filter-summary');
          if(el)el.textContent=`${vLabel} · ${bLabel}`;
        }

        // ── Relationship context state ──
        let _activeRelContext='partner'; // 'partner'|'friends'|'solo'
        let _activeBudgetBand='under50'; // from _BUDGET_BANDS
        let _activeStopCount='open'; // 1|2|3|'open'
        let _pairingMode='solo'; // 'solo'|'couple'|'friends'

        function setRelFilter(el,rel){
          document.querySelectorAll('#rel-chips .occasion-chip').forEach(c=>c.classList.remove('active'));
          el.classList.add('active');
          _activeRelContext=rel;
          // Sync pairing mode for archetype selection
          _pairingMode=rel==='partner'?'couple':rel;
          _trackEvent('rel_filter_changed',{rel});
        }

        function setBudgetPill(el,band){
          document.querySelectorAll('#budget-pills .occasion-chip').forEach(c=>c.classList.remove('active'));
          el.classList.add('active');
          _activeBudgetBand=band;
          _trackEvent('budget_pill_changed',{band});
        }

        function setStopPill(el,count){
          document.querySelectorAll('#stop-pills .occasion-chip').forEach(c=>c.classList.remove('active'));
          el.classList.add('active');
          _activeStopCount=count;
          _trackEvent('stop_pill_changed',{count});
        }

        function setMoodFilter(el,energy){
          document.querySelectorAll('#mood-chips .occasion-chip').forEach(c=>c.classList.remove('active'));
          el.classList.add('active');
          _moodEnergy=energy==='low'?'tired':energy==='high'?'energetic':'moderate';
          _trackEvent('mood_filter_changed',{energy:energy});
          const profile=_getUserProfile()||{};
          if(profile.preferences)profile.preferences.energy_level=energy;
          _saveUserProfile(profile);
        }

        function curateAndCollapse(){
          generateSuggestions();
        }

        function generateSuggestions(_instant){
          _trackEvent('refresh_clicked',{instant:!!_instant});
          const area=document.getElementById('suggestions-area');

          // ── PREFERENCE PRIORITY CHAIN ──
          // 1. Saved user defaults (persistent) — from onboarding + profile
          // 2. Discover pill state (session) — budget, relationship, energy
          // 3. Refine overrides (session) — time, setting, style, pace, food, area
          // Refine > Pills > Saved defaults. Refine is checked in _scoreVenue/_generatePlans.
          const profile=_getUserProfile()||{};
          const prefs=Object.assign({},profile.preferences||_obPrefs||{});

          // Discover pills override saved defaults for this session
          const activeRelChip=document.querySelector('#rel-chips .occasion-chip.active');
          if(activeRelChip)_activeRelContext=activeRelChip.dataset.rel||'partner';
          prefs.date_mode=_activeRelContext==='partner'?'couple':_activeRelContext;

          const activeBudgetChip=document.querySelector('#budget-pills .occasion-chip.active');
          if(activeBudgetChip)_activeBudgetBand=activeBudgetChip.dataset.budget||'under50';
          prefs.budget=_activeBudgetBand;

          // Sync mood chips to saved energy default on first load
          const _mcEl=document.querySelector('#mood-chips');
          if(prefs.energy_level&&_mcEl&&!_mcEl._synced){
            _mcEl.querySelectorAll('.occasion-chip').forEach(c=>{
              c.classList.toggle('active',c.dataset.energy===prefs.energy_level);
            });
            _mcEl._synced=true;
          }

          // Mood energy from current pill state (overrides saved default)
          const activeChip=document.querySelector('#mood-chips .occasion-chip.active');
          if(activeChip)prefs.energy_level=activeChip.dataset.energy||'moderate';
          if(!prefs.energy_level)prefs.energy_level='moderate';

          // Relationship context
          prefs._relContext=_activeRelContext;

          // Stop count
          prefs.stopCount=_activeStopCount;

          const locEl=document.getElementById('loc-select');
          const loc=locEl?locEl.value:'London, UK';
          const locShort=loc.split(',')[0].trim();
          const userName=_userName();

          // Loading skeleton
          const loadMsg='Building personalised plans for '+userName+'...';
          if(!_instant) area.innerHTML=`<div style="padding:20px 0">
            <div style="background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px;margin-bottom:12px">
              <div class="skeleton-text" style="width:55%;height:16px"></div>
              <div class="skeleton-text" style="width:80%;height:12px"></div>
              <div style="display:flex;gap:8px;margin-top:14px"><div class="skeleton-text" style="width:70px;height:20px;border-radius:10px;margin:0"></div><div class="skeleton-text" style="width:70px;height:20px;border-radius:10px;margin:0"></div></div>
              <div class="skeleton" style="height:80px;border-radius:12px;margin-top:14px"></div>
            </div>
            <div style="background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.06);border-radius:16px;padding:20px">
              <div class="skeleton-text" style="width:45%;height:16px"></div>
              <div class="skeleton-text" style="width:70%;height:12px"></div>
              <div class="skeleton" style="height:80px;border-radius:12px;margin-top:14px"></div>
            </div>
            <div style="text-align:center;padding:16px 0;font-size:12px;color:rgba(255,255,255,0.3)">${loadMsg}</div>
          </div>`;

          setTimeout(async()=>{
            // Generate plans from engine (async — tries DB first)
            let plans;
            try{
              plans=await _generatePlans(prefs);
            }catch(err){
              _captureError(err,{context:'plan_generation',source:'generateSuggestions'});
              area.innerHTML=`<div style="text-align:center;padding:40px 20px">
                <div style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.6);margin-bottom:6px">Couldn't load plans</div>
                <div style="font-size:12.5px;color:rgba(255,255,255,0.35);margin-bottom:16px;line-height:1.5">Something went wrong on our end. Your preferences are safe — give it another go.</div>
                <button class="btn btn-rose" style="font-size:13px;padding:10px 20px" onclick="generateSuggestions()">Try again</button>
                <div style="margin-top:10px"><span style="font-size:11px;color:rgba(255,255,255,0.35);cursor:pointer" onclick="_trackEvent('support_clicked',{});openFeedback()">Report this issue</span></div>
              </div>`;
              return;
            }
            _currentPlans=plans;

            let html='';

            // ── Empty state: no plans matched the filters ──
            if(!plans||!plans.length){
              const relLabel={partner:'partner dates',friends:'friend outings',solo:'solo activities'}[_activeRelContext]||'plans';
              const bandLabel=(_BUDGET_BANDS.find(b=>b.id===_activeBudgetBand)||{}).label||_activeBudgetBand;
              area.innerHTML=`<div style="text-align:center;padding:48px 20px">
                <div style="font-size:32px;margin-bottom:14px;opacity:0.25">&#9673;</div>
                <div style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.6);margin-bottom:8px">No ${relLabel} found for ${bandLabel}</div>
                <div style="font-size:12.5px;color:rgba(255,255,255,0.35);margin-bottom:20px;line-height:1.5;max-width:320px;margin-left:auto;margin-right:auto">Try broadening your budget, switching the planning context, or clearing your Refine filters.</div>
                <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                  <button class="btn btn-rose" style="font-size:13px;padding:10px 20px" onclick="generateSuggestions()">Refresh</button>
                  <button class="btn" style="font-size:13px;padding:10px 20px" onclick="rfClear();generateSuggestions()">Clear filters</button>
                </div>
              </div>`;
              return;
            }

            // Hide value prop after first real generation
            const vpEl=document.getElementById('discover-value-prop');
            if(vpEl&&plans.length)vpEl.style.display='none';

            // ── Header ──
            html+=`<div class="section-head" style="flex-wrap:wrap;margin-bottom:14px"><div><div class="section-title" style="font-family:var(--font-serif);font-size:17px;letter-spacing:-0.2px">${plans.length} plan${plans.length!==1?'s':''} for ${locShort}</div><div style="font-size:12px;color:rgba(255,255,255,0.48);margin-top:3px">Tap any plan to see the details</div></div><div class="section-link" onclick="generateSuggestions()">Refresh</div></div>`;

            // ── Weather banner ──
            if(_weatherCode>=0){
              const rainy=[51,53,55,61,63,65,71,73,75,80,81,82,95,96,99].includes(_weatherCode);
              const clearWarm=[0,1,2].includes(_weatherCode)&&_weatherTemp>=15;
              if(rainy){
                html+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:12px;font-size:11.5px;color:rgba(255,255,255,0.55)"><span>🌧</span><div><span style="font-weight:600;color:rgba(255,255,255,0.75)">Raining (${_weatherTemp}°C)</span> — indoor plans prioritised</div></div>`;
              }else if(clearWarm){
                html+=`<div style="display:flex;align-items:center;gap:10px;padding:9px 14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:12px;margin-bottom:12px;font-size:11.5px;color:rgba(255,255,255,0.55)"><span>☀️</span><div><span style="font-weight:600;color:rgba(255,255,255,0.75)">Clear evening (${_weatherTemp}°C)</span> — outdoor options boosted</div></div>`;
              }
            }

            // ── How we built these plans ──
            {
              const reasons=[];
              const modeLabel={couple:'you and '+_partnerName(),solo:'a solo outing',friends:'a group'}[prefs.date_mode]||'you';
              const budgetLabel={under50:'under £50pp','50to150':'£50–150pp','150plus':'£150+pp'}[prefs.budget]||'';
              const energyLabel={low:'relaxed, low-effort venues',moderate:'a mix of dining and activities',high:'active and adventurous experiences'}[prefs.energy_level]||'';
              if(prefs.date_mode)reasons.push('Planning for '+modeLabel);
              if(budgetLabel)reasons.push(budgetLabel+' budget');
              if(energyLabel)reasons.push('prioritising '+energyLabel);
              if(prefs.interests&&prefs.interests.length){
                const intLabels={dining:'restaurants',culture:'cultural venues',outdoors:'outdoor spots',nightlife:'nightlife',wellness:'wellness',active:'activities',music:'live music',cooking:'cooking'};
                const intStr=prefs.interests.slice(0,3).map(i=>intLabels[i]||i).join(', ');
                reasons.push('focused on '+intStr);
              }
              if(prefs.setting==='indoor')reasons.push('indoor only');
              else if(prefs.setting==='outdoor')reasons.push('outdoor preferred');
              // Refine filter labels
              if(_rfActive&&typeof _rfFilters!=='undefined'){
                const rf=_rfFilters;
                const rfLabels={occasion:{first_date:'first date',casual:'casual date',anniversary:'anniversary',friends:'friends night',special:'special occasion'},time:{daytime:'daytime',evening:'evening',late_night:'late night',weekend:'weekend'},setting:{indoor:'indoor',outdoor:'outdoor',both:'indoor or outdoor'},area:{central:'Central London',east:'East London',south:'South London',north:'North London',west:'West London'},food:{dinner:'dinner',drinks:'drinks only',activity_first:'activity first',no_food:'no food',veg_friendly:'vegetarian-friendly'}};
                if(rf.occasion&&rfLabels.occasion[rf.occasion])reasons.push(rfLabels.occasion[rf.occasion]);
                if(rf.time&&rfLabels.time[rf.time])reasons.push(rfLabels.time[rf.time]);
                if(rf.setting&&rfLabels.setting[rf.setting])reasons.push(rfLabels.setting[rf.setting]);
                if(rf.area&&rfLabels.area[rf.area])reasons.push(rfLabels.area[rf.area]);
                if(rf.style&&rf.style.length)reasons.push(rf.style.join(', ')+' vibe');
                if(rf.food&&rfLabels.food[rf.food])reasons.push(rfLabels.food[rf.food]);
              }
              if(reasons.length){
                html+=`<div style="padding:10px 14px;background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06);border-radius:12px;margin-bottom:14px;font-size:12px;color:rgba(255,255,255,0.5);line-height:1.6">${reasons.join(' · ')}${_rfActive?' · <span style="color:rgba(201,168,76,0.6);cursor:pointer" onclick="openRefineSheet()">edit filters</span>':''}</div>`;
              }
            }

            // ── Weak results / limited variety notice ──
            const avgScore=plans.length?Math.round(plans.reduce((s,p)=>s+p.score,0)/plans.length):0;
            if(plans.length&&plans._poolExhausted){
              html+=`<div style="padding:10px 14px;background:rgba(201,168,76,0.04);border:0.5px solid rgba(201,168,76,0.12);border-radius:12px;margin-bottom:14px;font-size:11.5px;color:rgba(201,168,76,0.6);line-height:1.6">You've explored most options for these filters. <span style="cursor:pointer;text-decoration:underline" onclick="openRefineSheet()">Broaden your filters</span> or try a different <span style="cursor:pointer;text-decoration:underline" onclick="document.querySelector('#budget-pills .occasion-chip:nth-child(2)').click();generateSuggestions()">budget range</span> for more variety.</div>`;
            }else if(plans.length&&plans._nearDupe&&_shownSlugs.length>1){
              html+=`<div style="padding:10px 14px;background:rgba(201,168,76,0.04);border:0.5px solid rgba(201,168,76,0.12);border-radius:12px;margin-bottom:14px;font-size:11.5px;color:rgba(201,168,76,0.6);line-height:1.6">Some familiar faces in this set — tap Refresh for more variation, or <span style="cursor:pointer;text-decoration:underline" onclick="openRefineSheet()">adjust your filters</span>.</div>`;
            }else if(plans.length&&avgScore<50){
              html+=`<div style="padding:10px 14px;background:rgba(250,204,21,0.04);border:0.5px solid rgba(250,204,21,0.12);border-radius:12px;margin-bottom:14px;font-size:11.5px;color:rgba(250,204,21,0.65);line-height:1.6">Stretching a bit to find good plans. <span style="cursor:pointer;text-decoration:underline" onclick="startOnboarding()">Update your preferences</span> for better results.</div>`;
            }

            // ── Plan cards ──
            if(plans.length){
              plans.forEach((plan,idx)=>{
                const st=(_planStates[plan.id]&&_planStates[plan.id].status)||plan.status;
                const isFirst=idx===0;
                const statusLabel={draft:'Draft',generated:'New',viewed:'Viewed',saved:'Saved',active:'Active'}[st]||st;
                const statusClass='plan-status-'+st;

                html+=`<div class="plan-card${st==='active'?' plan-card-active':''}" data-plan-id="${plan.id}">`;

                // Header — reason tags instead of numerical score
                const _reasonTags=[];
                // 1. Budget match — check if every item's budgetTier is in the selected band's tiers
                {const _band=_BUDGET_BANDS.find(b=>b.id===_activeBudgetBand);
                const _tiers=_band?_band.tiers:[];
                if(_tiers.length&&plan.items.every(i=>_tiers.includes(i.budgetTier||i.budget_tier)))_reasonTags.push('In your budget');}
                // 2. Context match
                {const _ctx=_activeRelContext||'partner';
                const _ctxLabels={partner:'Great for partner',friends:'Great for friends',solo:'Great solo'};
                if(plan.items.every(i=>{const c=i.contexts||i.rel||[];return c.includes(_ctx);}))_reasonTags.push(_ctxLabels[_ctx]||'Matches context');}
                // 3. Energy/mood match
                {const _energy=prefs.energy_level||'moderate';
                const _moodLabels={low:'Matches relaxed vibe',moderate:'Matches open vibe',high:'Matches active vibe'};
                if(_moodLabels[_energy])_reasonTags.push(_moodLabels[_energy]);}
                // 4. Area proximity (only if Refine area is set)
                if(_rfActive&&_rfFilters.area){
                  const _areaLabels={central:'Central London',east:'East London',south:'South London',north:'North London',west:'West London'};
                  _reasonTags.push('Close to you');
                }
                const _tags=_reasonTags.slice(0,3);
                const _tagsHtml=_tags.length?`<div style="display:flex;flex-wrap:wrap;gap:5px;margin-top:6px">${_tags.map(t=>`<span style="display:inline-block;padding:3px 9px;font-size:10px;font-weight:500;color:rgba(201,168,76,0.75);background:rgba(201,168,76,0.08);border:0.5px solid rgba(201,168,76,0.15);border-radius:20px">${t}</span>`).join('')}</div>`:'';
                html+=`<div class="plan-card-header" onclick="togglePlanDetails('${plan.id}')">
                  <div style="flex:1;min-width:0">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                      <div class="plan-card-title">${plan.title}</div>
                      <span class="plan-status-badge ${statusClass}">${statusLabel}</span>
                    </div>
                    <div class="plan-card-summary">${plan.summary}</div>
                    ${plan.fit_reason?`<div class="plan-fit-reason">${plan.fit_reason}</div>`:''}
                    ${_tagsHtml}
                  </div>
                </div>`;

                // Meta
                html+=`<div class="plan-card-meta" onclick="togglePlanDetails('${plan.id}')">
                  <span>💰 ${plan.estimated_cost}</span>
                  <span>⏱ ${plan.estimated_duration}</span>
                  <span>${plan.items.length} stop${plan.items.length!==1?'s':''}</span>
                </div>`;

                // Items (expanded for first plan)
                html+=`<div class="plan-details" style="display:${isFirst?'block':'none'}">`;
                plan.items.forEach((item,i)=>{
                  const _itemBi=_getBookingInfo(item.name);
                  const _ils=_itemBi.link_status||'unverified';
                  let itemStatusLabel,itemStatusClass;
                  // For combined-name items (e.g. "Kew Gardens + riverside pub"), make CTA specific to what's actually booked
                  const _isCombo=item.name.includes(' + ')&&_itemBi.provider;
                  const _itemVerified=_isVenueVerifiedLive(item.name);
                  if(item.status==='details_only'){
                    itemStatusLabel='Free / walk-in';itemStatusClass='pis-details-only';
                  }else if(_itemVerified){
                    itemStatusLabel=_isCombo?'Book '+_itemBi.provider:_getVenueCta(item.name);itemStatusClass='pis-bookable-now';
                  }else if((_ils==='unverified'||_ils==='needs_review')&&(_itemBi.booking_url||_itemBi.website_url)){
                    itemStatusLabel=_isCombo?'Check '+_itemBi.provider:'Check availability';itemStatusClass='pis-partner-handoff';
                  }else if(_ils==='website_only'){
                    itemStatusLabel=_isCombo?'View '+_itemBi.provider:'Visit website';itemStatusClass='pis-partner-handoff';
                  }else{
                    itemStatusLabel='Find on Google Maps';itemStatusClass='pis-partner-handoff';
                  }
                  const _hasAnyCta=!!(_itemBi.booking_url||_itemBi.website_url)||_itemVerified;
                  const _gmapsUrl='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(item.name+', London');
                  html+=`<div class="plan-item">
                    <div class="plan-item-num">${item.order}</div>
                    <div class="plan-item-img-wrap">
                      <img class="plan-item-img" src="${item.img}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'">
                    </div>
                    <div class="plan-item-body">
                      <div class="plan-item-name">${item.name}</div>
                      <div class="plan-item-loc">${item.loc}</div>
                      <div class="plan-item-row">
                        <span class="plan-item-price">${item.price}</span>
                        <span class="plan-item-dur">${_fmtDuration(item.duration_mins)}</span>
                        <span class="plan-item-role">${item.role}</span>
                      </div>
                      <div class="plan-item-why">✦ ${item.why}</div>
                      ${_hasAnyCta
                        ?`<button class="plan-item-book-btn ${itemStatusClass}" onclick="event.stopPropagation();bookPlanItem('${plan.id}',${i})">${itemStatusLabel}</button>`
                        :`<a class="plan-item-book-btn pis-partner-handoff" href="${_gmapsUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="text-decoration:none">Find on Google Maps</a>`}
                    </div>
                  </div>`;
                });
                html+=`</div>`; // end plan-details

                // Reactions — primary 2 visible, rest behind toggle
                html+=`<div class="plan-reactions" style="padding:0 18px 10px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                  <button class="plan-react" onclick="event.stopPropagation();reactToPlan('${plan.id}','love',this)">We'd love this</button>
                  <button class="plan-react" onclick="event.stopPropagation();reactToPlan('${plan.id}','not_my_vibe',this)">Not for us</button>
                  <button class="plan-react plan-react-more" onclick="event.stopPropagation();this.style.display='none';this.parentElement.querySelector('.plan-react-extra').style.display='contents'">More</button>
                  <span class="plan-react-extra" style="display:none">
                    <button class="plan-react" onclick="event.stopPropagation();reactToPlan('${plan.id}','more_like_this',this)">More like this</button>
                    <button class="plan-react" onclick="event.stopPropagation();reactToPlan('${plan.id}','too_expensive',this)">Over budget</button>
                    <button class="plan-react" onclick="event.stopPropagation();reactToPlan('${plan.id}','too_far',this)">Too far out</button>
                  </span>
                </div>`;

                // Actions
                html+=`<div class="plan-actions">
                  <button class="plan-btn plan-btn-save" onclick="event.stopPropagation();savePlanToWishlist('${plan.id}')">♥ Save this plan</button>
                  <button class="plan-btn plan-btn-activate" onclick="event.stopPropagation();activatePlan('${plan.id}')">✦ Book each stop</button>
                </div>`;

                html+=`</div>`; // end plan-card
              });
            }else{
              // Fallback: no plans
              html+=`<div style="text-align:center;padding:40px 20px">
                <div style="font-size:15px;font-weight:600;color:rgba(255,255,255,0.6);margin-bottom:6px">Nothing quite right this time</div>
                <div style="font-size:12.5px;color:rgba(255,255,255,0.35);margin-bottom:16px;line-height:1.5">Your filters might be too narrow. Try a different mood or loosen your preferences.</div>
                <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">
                  <button class="btn btn-rose" style="font-size:12px;padding:9px 18px" onclick="generateSuggestions()">Try again</button>
                  <button class="btn" style="font-size:12px;padding:9px 18px" onclick="startOnboarding()">Adjust preferences</button>
                </div>
              </div>`;
            }

            area.innerHTML=html;

            // Fire venue_shown for each venue rendered to screen
            if(plans&&plans.length){
              const _shownScreen=document.querySelector('.page.active')?.id?.replace('page-','')||'discover';
              const _shownSet=new Set();
              plans.forEach(function(p){
                if(!p.items)return;
                p.items.forEach(function(item){
                  var key=item.name+'|'+p.id;
                  if(_shownSet.has(key))return;
                  _shownSet.add(key);
                  _trackEvent('venue_shown',{name:item.name,plan_id:p.id,source_screen:_shownScreen});
                });
              });
            }

            // Scroll to plans
            setTimeout(()=>{const fb=document.getElementById('discover-filter-bar');if(fb)fb.scrollIntoView({behavior:'smooth',block:'start'});},100);

          },_instant?0:800);
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
          // Route through honest handoff flow instead of faking a booking
          const status=type==='restaurant'?'bookable_now':'partner_handoff';
          initiateBooking(name,amount||'',status,null);
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
          {name:'The Ivy',area:'Covent Garden',cuisine:'British',img:'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=600&h=320&fit=crop&q=80',price:'avg. £55pp',rating:'4.5',reviews:'4,200',veg:true,vibes:['Classic','Elegant']},
          {name:'Hakkasan',area:'Mayfair',cuisine:'Chinese',img:'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=600&h=320&fit=crop&q=80',price:'avg. £90pp',rating:'4.7',reviews:'2,100',veg:true,vibes:['Moody','Romantic']},
          {name:'Bob Bob Ricard',area:'Soho',cuisine:'Anglo-Russian',img:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=600&h=320&fit=crop&q=80',price:'avg. £85pp',rating:'4.6',reviews:'1,560',veg:true,vibes:['Glamorous','Fun']},
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
          const covers=document.getElementById('rest-covers').value;
          const area=document.getElementById('rest-results');
          const qLow=q.toLowerCase();
          const isBrowse=!q;

          // Show loading
          area.innerHTML=`<div class="card" style="margin-top:1rem"><div class="loading-overlay"><div class="spinner"></div><div class="loading-text">${isBrowse?'Finding restaurants in '+loc+'…':'Searching restaurants for "'+q+'"…'}</div></div></div>`;

          // Try Google Places first, fall back to hardcoded DB
          _searchPlaces(isBrowse?'restaurants':q,loc,(googleResults)=>{
            let matches;
            let isGoogle=false;

            if(googleResults&&googleResults.length){
              matches=googleResults.slice(0,isBrowse?6:3);
              isGoogle=true;
            } else if(isBrowse){
              // No query — show shuffled restaurant list from DB
              matches=[..._REST_DB];
              for(let i=matches.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[matches[i],matches[j]]=[matches[j],matches[i]];}
              matches=matches.slice(0,6);
            } else {
              // Fallback to hardcoded data
              matches=_REST_DB.filter(r=>
                r.name.toLowerCase().includes(qLow)||
                r.cuisine.toLowerCase().includes(qLow)||
                r.area.toLowerCase().includes(qLow)
              );
              if(!matches.length){
                // Generate a synthetic card using the exact name the user typed
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

            const sourceLabel=isBrowse
              ?'<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--subtle);margin-bottom:12px">Restaurants in '+loc+' · '+covers+' covers</div>'
              :isGoogle
              ?'<div style="display:flex;align-items:center;gap:6px;margin-bottom:12px"><span style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--subtle)">Live results for "'+q+'"</span><span class="badge badge-green" style="font-size:9px">Google Places</span></div>'
              :'<div style="font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--subtle);margin-bottom:12px">'+(matches.some(r=>r.name.toLowerCase().includes(qLow))?'Results for "'+q+'"':'We couldn\'t find "'+q+'" — here are some suggestions')+'</div>';

            area.innerHTML=`
              <div style="margin-top:1rem">
                ${sourceLabel}
                ${matches.map((r,i)=>{
                  const hasImg=r.img&&r.img.length>0;
                  const imgHtml=hasImg
                    ?`<img src="${r.img}" alt="${r.name}" style="width:100%;height:100%;object-fit:cover;display:block;min-height:180px" onerror="this.parentElement.innerHTML='<div style=\\'height:180px;display:flex;align-items:center;justify-content:center;background:var(--bg2);color:var(--primary)\\'>${_svgIcon('restaurant',32).replace(/'/g,"\\'")}</div>'">`
                    :'<div style="height:180px;display:flex;align-items:center;justify-content:center;background:var(--bg2);color:var(--primary)">'+_svgIcon('restaurant',32)+'</div>';
                  const bInfo=_getBookingInfo(r.name);
                  const verifiedBadge=bInfo.verified?'<span class="badge" style="background:rgba(74,222,128,0.08);color:#4ADE80;border:0.5px solid rgba(74,222,128,0.15);font-size:9px">✓ Verified</span>':'';

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
                          ${verifiedBadge}
                        </div>
                        <div style="font-size:13px;font-weight:600;color:var(--ink);margin-bottom:4px">${r.price}</div>
                        <div style="margin-top:8px;padding-top:8px;border-top:0.5px solid var(--bdr)">
                          <div style="font-size:11px;color:var(--ink-muted);margin-bottom:8px">Book via ${bInfo.provider} · opens in new tab</div>
                          <button class="btn btn-rose btn-sm" style="width:100%;justify-content:center;padding:10px;font-size:13px;border-radius:10px" onclick="initiateBooking('${r.name.replace(/'/g,"\\'")}','${r.price.replace(/'/g,"\\'")}','bookable_now',null)">Book on ${bInfo.provider} ↗</button>
                        </div>
                      </div>
                    </div>
                  </div>`;
                }).join('')}
                <button class="btn" style="width:100%;justify-content:center;padding:10px;font-size:12px;margin-top:4px" onclick="document.getElementById('rest-results').innerHTML='';document.getElementById('rest-q').focus()">← Search again</button>
              </div>`;
          });
        }

        function confirmRestBooking(name,area,_d,_t,_c,price){
          // Route through honest handoff flow — no fake in-app booking
          initiateBooking(name+', '+area,price,'bookable_now',null);
        }

        function bookRest(){checkRestAvailability();}
        function bookHotel(){
          const d=document.getElementById('hotel-dest').value||'Hotel';
          const ci=document.getElementById('hotel-in').value||'';
          const q=encodeURIComponent(d+' hotel London');
          const url='https://www.booking.com/searchresults.html?ss='+q+(ci?'&checkin='+ci:'');
          _openExternal(url);
          _trackEvent('booking_click',{name:d,provider:'Booking.com',type:'hotel'});
          toast('✦ Hotel search opened — confirm when booked');
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
          _openExternal(url);
          bookings.push({id:Date.now(),type:'airbnb',name:dest+(note?' — '+note:''),date:ci,meta:type,amount:'',icon:_SVG.airbnb});
          updateStats();renderBookings();toast('✦ Airbnb search opened for '+dest);
        }
        function bookCab(){
          const f=document.getElementById('cab-from').value||'Home';
          const t=document.getElementById('cab-to').value||'Venue';
          window.open('https://m.uber.com/looking?drop='+encodeURIComponent(t),'_blank','noopener');
          _trackEvent('booking_click',{name:f+' → '+t,provider:'Uber',type:'cab'});
          toast('✦ Uber opened — book your ride there');
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
                html+='<button class="btn btn-sm'+(highlight?' btn-rose':'')+'" onclick="bookTransportCab('+i+')">Book</button>';
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
                        <div style="font-size:9px;color:rgba(201,168,76,0.35);font-weight:500;letter-spacing:0.5px">Preview — coming soon</div>
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
          _openExternal('https://www.google.com/maps/dir/'+from+'/'+to);
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
          if(!list.length){el.innerHTML='<div style="font-size:13px;color:var(--ink-muted)">No dates planned yet — explore Discover to get started.</div>';return;}
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
                <span class="badge ${isPast?'badge-muted':'badge-green'}" style="margin-top:5px">${isPast?'completed':b.booking_status==='confirmed_by_user'?'confirmed by you':'confirmed'}</span>${b.provider?`<span style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:3px;display:block">via ${b.provider}</span>`:''}
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
          const calLabel=document.getElementById('cal-label');if(calLabel)calLabel.textContent=calMonth.toLocaleString('en-GB',{month:'long',year:'numeric'});
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
            </div>`).join(''):`<div style="font-size:13px;color:var(--ink-muted)">Nothing planned — <span style="color:var(--rose);cursor:pointer" onclick="document.getElementById('rem-date').value='${ds}'">add something?</span></div>`;
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
            body:'Table for Two layers in the bits most people still hate: arguing over options, remembering to book, chasing the cab. We handle all of that.'
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
          result.classList.add('show');

          // Send vote to Formspree
          const data = new FormData();
          data.append('vote', vote);
          data.append('_subject', 'Table for Two — Would you use it? vote: ' + vote);
          fetch('https://formspree.io/f/xreodnbr', {
            method:'POST', body:data, headers:{'Accept':'application/json'}
          }).catch(()=>{});

        }

        // ── Landing page: email + password signup/signin ──
        let _lpAuthMode='signup'; // 'signup' or 'login'

        function toggleLpAuthMode(mode){
          _lpAuthMode=mode;
          const btn=document.getElementById('lp-email-btn');
          const toggle=document.getElementById('lp-auth-toggle');
          const hint=document.getElementById('lp-auth-hint');
          if(hint)hint.style.display='none';
          if(mode==='login'){
            if(btn)btn.textContent='Sign in';
            if(toggle)toggle.innerHTML='New here? <a href="#" onclick="event.preventDefault();toggleLpAuthMode(\'signup\')" style="color:#C9A84C;font-weight:600">Create account</a>';
          }else{
            if(btn)btn.textContent='Create account';
            if(toggle)toggle.innerHTML='Already have an account? <a href="#" onclick="event.preventDefault();toggleLpAuthMode(\'login\')" style="color:#C9A84C;font-weight:600">Sign in</a>';
          }
        }

        async function startBetaSignup(){
          const email=document.getElementById('lp-email').value.trim();
          const password=document.getElementById('lp-password').value;
          const honeypot=document.getElementById('lp-website');
          const hint=document.getElementById('lp-auth-hint');
          if(hint)hint.style.display='none';
          if(honeypot&&honeypot.value)return;
          if(!email||!email.includes('@')){
            document.getElementById('lp-email').style.borderColor='rgba(239,68,68,0.5)';
            setTimeout(()=>document.getElementById('lp-email').style.borderColor='',2000);
            return;
          }
          if(password.length<6){
            if(hint){hint.textContent='Password must be at least 6 characters';hint.style.display='block';hint.style.color='#F87171';}
            return;
          }
          const btn=document.getElementById('lp-email-btn');
          const origText=btn.textContent;
          btn.textContent=_lpAuthMode==='login'?'Signing in...':'Creating account...';btn.disabled=true;
          try{localStorage.setItem('t4t_last_email',email);}catch(e){}
          if(!_sb){btn.textContent=origText;btn.disabled=false;toast('Not connected');return;}

          let result;
          if(_lpAuthMode==='login'){
            try{localStorage.setItem('t4t_auth_intent','login');}catch(e){}
            result=await _authSignIn(email,password);
          }else{
            try{localStorage.setItem('t4t_auth_intent','signup');}catch(e){}
            result=await _authSignUp(email,password);
          }

          if(result.error){
            btn.textContent=origText;btn.disabled=false;
            if(hint){hint.textContent=result.error;hint.style.display='block';hint.style.color='#F87171';}
            return;
          }
          _trackEvent(_lpAuthMode==='login'?'sign_in_completed':'sign_up_started',{method:'password',email_domain:email.split('@')[1]});
          try{
            const _src=sessionStorage.getItem('t4t_source')||'direct';
            const _med=sessionStorage.getItem('t4t_medium')||'';
            const _cam=sessionStorage.getItem('t4t_campaign')||'';
            const _ref=sessionStorage.getItem('t4t_referrer')||'';
            if(_sb)_sb.from('events').insert({event_type:'signup_source',event_data:{source:_src,medium:_med,campaign:_cam,referrer:_ref,intent:_lpAuthMode},user_id:null}).then(()=>{}).catch(()=>{});
          }catch(e){}
        }

        function showLpForgotPassword(){
          document.getElementById('lp-step-email').style.display='none';
          document.getElementById('lp-step-forgot').style.display='block';
        }

        async function submitLpForgotPassword(){
          const emailEl=document.getElementById('lp-forgot-email');
          const btn=document.getElementById('lp-forgot-btn');
          const hint=document.getElementById('lp-forgot-hint');
          const email=(emailEl?.value||'').trim();
          if(!email||!email.includes('@')){if(hint){hint.textContent='Please enter a valid email';hint.style.display='block';}return;}
          if(hint)hint.style.display='none';
          btn.textContent='Sending...';btn.disabled=true;
          const result=await _authResetPassword(email);
          if(result.error){if(hint){hint.textContent=result.error;hint.style.display='block';}btn.textContent='Send reset link';btn.disabled=false;return;}
          document.getElementById('lp-step-forgot').style.display='none';
          document.getElementById('lp-step-reset-sent').style.display='block';
          document.getElementById('lp-reset-sent-email').textContent=email;
        }

        // Profile completion — shown post-signup for new users without name/handle
        function _showProfileCompletion(){
          const ov=document.getElementById('profile-completion-overlay');
          if(ov){ov.style.display='flex';}
        }

        async function submitProfileCompletion(){
          const nameEl=document.getElementById('pc-name');
          const handleEl=document.getElementById('pc-handle');
          const errorEl=document.getElementById('pc-error');
          const btn=document.getElementById('pc-submit-btn');
          const name=(nameEl?.value||'').trim();
          let handle=(handleEl?.value||'').trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
          if(!name){errorEl.textContent='Please enter your name';errorEl.style.display='block';return;}
          if(!handle)handle=_generateHandle(name);
          if(handle.length<3){errorEl.textContent='Handle must be at least 3 characters';errorEl.style.display='block';return;}
          errorEl.style.display='none';
          btn.textContent='Checking handle...';btn.disabled=true;
          const handleOk=await _checkHandleAvailable(handle);
          if(handleOk===false){
            errorEl.textContent='@'+handle+' is already taken — please choose another';errorEl.style.display='block';
            btn.textContent='Create profile';btn.disabled=false;return;
          }
          btn.textContent='Creating profile...';
          _handles.user='@'+handle;
          try{localStorage.setItem('t4t_handles',JSON.stringify(_handles));}catch(e){}
          _saveUserProfile({name,partner:'',handle:'@'+handle,account_state:'single',createdAt:new Date().toISOString()});
          // Save to Supabase
          if(_sb&&_sbUserId){
            try{await _sb.from('users').update({name,handle:'@'+handle}).eq('id',_sbUserId);}catch(e){console.warn('[T4T] Profile save failed',e);}
          }
          _trackEvent('profile_completed',{handle:'@'+handle});
          // Hide overlay and enter app
          const ov=document.getElementById('profile-completion-overlay');
          if(ov)ov.style.display='none';
          _applyUserNames();
          setSmartGreeting();
          const db=document.getElementById('demo-banner');if(db)db.style.display='block';
          const _prof=_getUserProfile();
          if(!_prof?.onboarding_completed){setTimeout(startOnboarding,600);}
          else{setTimeout(()=>generateSuggestions(true),300);}
        }


        // ── Body section waitlist form (fallback) ──
        async function submitWaitlistBody(){
          const email = document.getElementById('lp-email2').value.trim();
          const honeypot = document.getElementById('lp-website2');
          if(honeypot && honeypot.value) return;
          if(!email||!email.includes('@')){alert('Please enter a valid email address');return;}

          const btn = document.querySelector('#lp-body-form .btn-rose');
          btn.textContent = 'Sending...';
          btn.disabled = true;

          const data = new FormData();
          data.append('email', email);
          data.append('survey_answer', document.querySelector('.lp-option.selected .lp-option-text')?.textContent.trim() || 'Not answered');

          fetch('https://formspree.io/f/xreodnbr', {
            method: 'POST', body: data, headers: { 'Accept': 'application/json' }
          })
          .then(function(response){
            if(response.ok){
              document.getElementById('lp-body-form').style.display = 'none';
              document.getElementById('lp-body-success').style.display = 'block';
              // Also hide hero form if it exists
              const hf = document.getElementById('lp-hero-form');
              if(hf) hf.style.display = 'none';
              const hs = document.getElementById('lp-hero-success');
              if(hs) hs.style.display = 'block';
            } else {
              btn.textContent = 'Subscribe';
              btn.disabled = false;
            }
          })
          .catch(function(){
            alert('Could not connect. Please check your internet connection and try again.');
            btn.textContent = 'Subscribe';
            btn.disabled = false;
          });
        }

        function enterApp(){
          if(_authUser){
            const lp=document.getElementById('landing');
            if(lp){lp.style.opacity='0';lp.style.transition='opacity 0.35s';setTimeout(()=>{lp.style.display='none';lp.style.visibility='hidden';lp.style.pointerEvents='none';lp.style.zIndex='-1';},350);}
            const appEl=document.querySelector('.app');if(appEl)appEl.style.display='';
            _applyUserNames();
            return;
          }
          // Not authenticated — show auth form
          const form=document.getElementById('lp-step-email');
          if(form)form.scrollIntoView({behavior:'smooth',block:'center'});
        }

        function surpriseUs(){
          _vibeType='romantic';_vibeTag='Candlelit';_occasion='partner';
          document.querySelectorAll('#date-occasion .occasion-chip').forEach((c,i)=>c.classList.toggle('active',i===1));
          document.querySelectorAll('.vibe-card').forEach((c,i)=>c.classList.toggle('active',i===0));
          // Set budget to £150+ range for Surprise Us
          _activeBudgetBand='150plus';
          const _suPill=document.querySelector('#budget-pills [data-budget="150plus"]');
          if(_suPill){document.querySelectorAll('#budget-pills .occasion-chip').forEach(c=>c.classList.remove('active'));_suPill.classList.add('active');}
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
            navigator.share({title:_userName()+"'s asking — what shall we do? ♥",text:"Pick your favourites on Table for Two",url}).catch(()=>{});
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
          _trackEvent('partner_votes_submitted',{total:_svIdeas.length,answered:answered,yes:_svVotes.filter(v=>v===true).length});
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
        // Apply saved user names if they exist
        if(_getUserProfile())_applyUserNames();
        // Sync relationship pill — default to 'partner' on fresh load.
        // DB-backed _pairingMode overrides this later via _sbEnsureUser,
        // but we don't want the synchronous default of 'solo' to stick.
        if(!_getUserProfile()?.preferences?.date_mode){
          _activeRelContext='partner';
          _pairingMode='couple';
        }
        document.querySelectorAll('#rel-chips .occasion-chip').forEach(c=>{
          c.classList.toggle('active',c.dataset.rel===_activeRelContext);
        });
        // Show demo banner if user has access
        if(_hasBetaAccess()){const db=document.getElementById('demo-banner');if(db)db.style.display='block';}
        // Hide loading screen — two fallbacks to ensure it never stays stuck
        setTimeout(()=>{
          const ls=document.getElementById('auth-loading-screen');
          if(ls){ls.style.opacity='0';setTimeout(()=>ls.remove(),350);}
        },800);
        // Hard fallback: if still present after 4s, force remove (covers slow Supabase / network issues)
        setTimeout(()=>{
          const ls=document.getElementById('auth-loading-screen');
          if(ls)ls.remove();
        },4000);
        // Init occasion context panel for default selection (guard against missing element)
        const _initChip=document.querySelector('#date-occasion .occasion-chip.active');
        if(_initChip)selectOccasion(_initChip,'first_date');
        initFromUrl();
        setTimeout(generateSuggestions,400);
        // Track page load as a visit
        _trackEvent('page_view',{page:'init',referrer:document.referrer||'direct',url:window.location.href});
        // Pre-fill email from last login
        try{const _lastEmail=localStorage.getItem('t4t_last_email');if(_lastEmail){const _ei=document.getElementById('lp-email');if(_ei)_ei.value=_lastEmail;}}catch(e){}

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
          // Map active budget pill to legacy IDEAS tier key
          const _pillTierMap={under50:'budget','50to150':'mid','150plus':'luxury'};
          const budget=_pillTierMap[_activeBudgetBand]||'mid';
          const pool=IDEAS[budget]||IDEAS.mid;
          const area=document.getElementById('suggestions-area');
          area.innerHTML=`<div class="card"><div class="loading-overlay" style="gap:14px">
            <div class="roulette-die" style="font-size:56px"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="8" cy="8" r="1.2" fill="#C9A84C"/><circle cx="16" cy="8" r="1.2" fill="#C9A84C"/><circle cx="12" cy="12" r="1.2" fill="#C9A84C"/><circle cx="8" cy="16" r="1.2" fill="#C9A84C"/><circle cx="16" cy="16" r="1.2" fill="#C9A84C"/></svg></div>
            <div class="loading-text">Spinning the wheel…</div>
          </div></div>`;
          setTimeout(()=>{
            const picked=pool[Math.floor(Math.random()*pool.length)];
            const d=picked.dietary||[];
            const vegOk=d.includes('vegetarian')||d.includes('vegan');
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
                    ${vegOk?'<span class="badge" style="background:#F0FDF4;color:#166534;border:0.5px solid #86EFAC">✓ Veg-friendly</span>':''}
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
          _sbSaveState('wishlist',_wishlist);
          _trackEvent('wishlist_save',{name});
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
          const _wcEl=document.getElementById('hub-wishlist-count');
          if(_wcEl)_wcEl.textContent=_wishlist.length?'('+_wishlist.length+')':'';
          if(!todo.length){
            el.innerHTML='<div style="text-align:center;padding:20px;color:var(--ink-muted)"><div style="margin-bottom:8px"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#C9A84C" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></div><div style="font-size:12px">No saved ideas yet — swipe right on Discover or tap save on What\'s Hot</div></div>';
            return;
          }
          el.innerHTML=todo.slice(0,5).map(w=>`<div class="wish-card" style="margin-bottom:6px;cursor:pointer" onclick="quickBook('${w.name.replace(/'/g,"\\'")}','experience','${(w.price||'').replace(/'/g,"\\'")}')">
            <div style="flex:1">
              <div style="font-size:13px;font-weight:500;color:var(--ink);margin-bottom:2px">${w.name}</div>
              ${w.price?'<div style="font-size:11px;color:var(--ink-muted)">'+w.price+'</div>':''}
              ${w.why?'<div style="font-size:11px;color:var(--ink-muted);margin-top:3px;font-style:italic">✦ '+w.why+'</div>':''}
            </div>
            <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
              <button class="btn btn-sm btn-rose" style="font-size:10px;padding:5px 10px" onclick="event.stopPropagation();quickBook('${w.name.replace(/'/g,"\\'")}','experience','${(w.price||'').replace(/'/g,"\\'")}')">Book</button>
              <div onclick="event.stopPropagation();toggleWishDone(${w.id});renderHubWishlist()" style="width:18px;height:18px;border-radius:50%;border:1.5px solid rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:9px;color:rgba(255,255,255,0.4)" title="Mark done">${w.done?'✓':''}</div>
            </div>
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
            const empty=_wishFilter==='done'?'No completed dates yet — mark one off when you\'ve been.'
              :_wishFilter==='todo'?'Nothing on the list — you\'re all caught up.'
              :'Nothing saved yet — tap the heart on any plan to add it here.';
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
          statusEl.innerHTML=`♥ Night out scheduled <strong>${freqLabel}</strong> — next one on <strong>${nextDate.toLocaleDateString('en-GB',opts)}</strong>.<br>We'll remind you 2 days before.`;
          statusEl.style.display='';
          toast(`✦ Night out set — ${freqLabel}`);
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
          _trackEvent('journal_entry',{name,vibe});
          toast('✦ Entry saved to your journal');
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
              <div style="font-size:14px;font-weight:500;color:var(--ink-soft);margin-bottom:6px">Your journal is empty</div>
              <div style="font-size:12px;margin-bottom:20px">After a date, jot down what you loved — it helps us learn your taste</div>
              <button class="btn btn-rose btn-sm" onclick="openNewJournalEntry()">Write your first entry ✦</button>
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
            if(noteEl)noteEl.textContent=_userName()+' paid · '+_partnerName()+'\'s turn';
            toast('✦ '+_userName()+' paid last — '+_partnerName()+'\'s turn next');
          } else {
            if(valEl)valEl.innerHTML='<span style="font-size:12px">'+_partnerInitials()+'</span>';
            if(noteEl)noteEl.textContent=_partnerName()+' paid · '+_userName()+'\'s turn';
            toast('✦ '+_partnerName()+' paid last — '+_userName()+'\'s turn next');
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
          r.innerHTML=`<div style="font-size:12px;font-weight:600;color:var(--rose-dark);margin-bottom:8px">✦ Your profile</div>${lines.map(l=>`<div style="font-size:12px;color:var(--ink-soft);padding:3px 0;border-bottom:0.5px solid rgba(196,104,122,0.15)">· ${l}</div>`).join('')}`;
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
          // Sync to Supabase
          _sbSaveState('bookings',bookings);
          _sbSaveState('reminders',reminders);
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
          // Clear stale booking state when generic overlay closes
          // (bf-overlay is shared between What's Hot detail, booking flow, privacy settings, etc.)
          _pendingBooking=null;
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
                const sub=s.state==='unavail'?'<div style="font-size:9px;color:rgba(255,255,255,0.35);margin-top:3px">Full</div>':s.state==='best'?'<div style="font-size:9px;font-weight:600;color:#D4B86A;letter-spacing:0.04em;margin-top:3px">BEST</div>':'<div style="font-size:9px;color:rgba(74,222,128,0.75);margin-top:3px">Free</div>';
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
                  ${_DEMO_LABEL}
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
                  <button class="btn${v.recommended?' btn-rose':''} btn-sm" style="pointer-events:none">Book</button>
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
                    <div style="font-size:9px;color:rgba(201,168,76,0.35);font-weight:500;letter-spacing:0.5px">Preview — coming soon</div>
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
                  <button class="btn btn-sm" style="pointer-events:none;background:var(--plum);color:#fff;border-color:var(--plum)">Book</button>
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
                  <div style="width:52px;height:52px;border-radius:50%;background:rgba(196,104,122,0.12);border:1px solid rgba(196,104,122,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 10px;color:#C4687A">${_svgIcon('hotel',26)}</div>
                  <div style="font-size:18px;font-weight:700;color:var(--ink);margin-bottom:3px">Room reserved!</div>
                  <div style="font-size:9px;color:rgba(201,168,76,0.45);font-weight:600;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:2px">Simulated</div>
                  <div style="font-size:13px;color:var(--ink-soft)">Confirmation on its way to your email</div>
                </div>
                <div style="background:rgba(196,104,122,0.1);border:1px solid rgba(196,104,122,0.3);border-radius:14px;padding:16px;margin-bottom:14px">
                  <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:11px">${v.hotel}</div>
                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:11px">
                    <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--ink-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">Check-in</div><div style="font-size:12px;font-weight:600;color:#fff">${v.date} · 3:00 PM</div></div>
                    <div style="background:rgba(255,255,255,0.06);border-radius:8px;padding:8px 10px"><div style="font-size:10px;color:var(--ink-muted);letter-spacing:1px;text-transform:uppercase;margin-bottom:3px">Check-out</div><div style="font-size:12px;font-weight:600;color:#fff">Sun 20 Apr · 11 AM</div></div>
                  </div>
                  <div style="display:flex;gap:7px;flex-wrap:wrap">
                    <span class="bf-otable-badge" style="background:rgba(196,104,122,0.12);color:#E8A0B0;border:0.5px solid rgba(196,104,122,0.3);display:inline-flex;align-items:center;gap:4px">${_svgIcon('breakfast',12)} Breakfast included</span>
                    <span class="bf-otable-badge" style="background:rgba(74,222,128,0.1);color:#4ADE80;border:0.5px solid rgba(74,222,128,0.3)">✓ Free cancellation</span>
                    <span class="bf-otable-badge" style="background:rgba(255,255,255,0.06);color:var(--subtle);border:0.5px solid rgba(255,255,255,0.12)">Ref: ${hRef}</span>
                  </div>
                </div>
                <button class="btn btn-rose" style="width:100%;justify-content:center;padding:13px;border-radius:12px;font-size:14px;font-weight:600" onclick="_bfData.step=4;_bfData.subState='idle';_renderBfStep()">Almost there →</button>`;
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
            updateStats();renderBookings();_saveState();
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
            updateStats();renderBookings();_saveState();
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

        // quickBook now routes through initiateBooking — no fake booking flow

        // Wire updateStats to also call milestone stats
        const _origUpdateStats=updateStats;
        updateStats=function(){
          _origUpdateStats();
          updatePaidLastUI();
          updateMilestoneStats();
        };

        // ════════════════════════════════════════════════
        // ── ONBOARDING FLOW (multi-step preferences) ──
        // ════════════════════════════════════════════════
        const _OB_TOTAL=5;
        let _obCurrentStep=0;
        let _obPrefs={date_mode:'',budget:'',travel_radius:'',time_preference:'',setting:'',dietary:[],alcohol:'',energy_level:'',interests:[]};

        function _obChipHTML(group,value,label){
          return `<div class="ob-chip" data-group="${group}" data-value="${value}" onclick="obToggleChip(this,'${group}','${value}')" style="display:inline-flex;align-items:center;gap:6px;padding:10px 16px;border:1.5px solid rgba(255,255,255,0.1);border-radius:50px;cursor:pointer;font-size:13px;font-weight:500;color:rgba(255,255,255,0.5);background:rgba(255,255,255,0.04);transition:all 0.18s;user-select:none;margin:4px">${label}</div>`;
        }

        function obToggleChip(el,group,value){
          const isMulti=['dietary','interests'].includes(group);
          if(isMulti){
            el.classList.toggle('ob-selected');
            if(el.classList.contains('ob-selected')){
              if(!_obPrefs[group].includes(value))_obPrefs[group].push(value);
            } else {
              _obPrefs[group]=_obPrefs[group].filter(v=>v!==value);
            }
            // Handle "none" for dietary
            if(group==='dietary'&&value==='none'){
              document.querySelectorAll(`.ob-chip[data-group="dietary"]`).forEach(c=>{
                if(c.dataset.value!=='none'){c.classList.remove('ob-selected');}
              });
              _obPrefs.dietary=['none'];
            } else if(group==='dietary'&&value!=='none'){
              const noneChip=document.querySelector(`.ob-chip[data-group="dietary"][data-value="none"]`);
              if(noneChip)noneChip.classList.remove('ob-selected');
              _obPrefs.dietary=_obPrefs.dietary.filter(v=>v!=='none');
            }
          } else {
            document.querySelectorAll(`.ob-chip[data-group="${group}"]`).forEach(c=>{
              c.classList.remove('ob-selected');
            });
            el.classList.add('ob-selected');
            _obPrefs[group]=value;
          }
          // Hide error when user makes a selection
          const err=document.getElementById('ob-error');if(err)err.style.display='none';
        }

        const _OB_STEP_DATA=[
          {
            title:'What\'s your budget?',
            sub:'Per stop — each venue in your plan will be within this range',
            required:'budget',
            render:()=>`<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
              ${[['under50','Under £50'],['50to150','£50 – £150'],['150plus','£150+']].map(([v,l])=>
                _obChipHTML('budget',v,l)
              ).join('')}
            </div>
            <div style="margin-top:20px">
              <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:8px">Where are you based?</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
                ${[['local','My neighbourhood'],['central','Central London'],['anywhere','Anywhere in London']].map(([v,l])=>
                  _obChipHTML('travel_radius',v,l)
                ).join('')}
              </div>
            </div>`
          },
          {
            title:'What\'s your energy like?',
            sub:'This shapes the kinds of plans we suggest — you can tailor each outing in Refine',
            required:'energy_level',
            render:()=>`<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
              ${[['low','Relaxed & easy'],['moderate','Open to anything'],['high','Active & adventurous']].map(([v,l])=>
                _obChipHTML('energy_level',v,l)
              ).join('')}
            </div>
            <div style="margin-top:24px;padding:12px 16px;background:rgba(201,168,76,0.04);border:0.5px solid rgba(201,168,76,0.12);border-radius:12px;text-align:center">
              <div style="font-size:11px;color:rgba(255,255,255,0.35);line-height:1.5">Time of day, indoor vs outdoor, and date style can be set per outing using <strong style="color:rgba(201,168,76,0.6)">Refine your date</strong> on the Discover page.</div>
            </div>`
          },
          {
            title:'Any dietary preferences?',
            sub:'Select all that apply — we\'ll filter venues accordingly',
            required:'dietary',
            render:()=>`<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
              ${[['none','No restrictions'],['vegetarian','Vegetarian'],['vegan','Vegan'],['halal','Halal'],['gluten_free','Gluten free'],['pescatarian','Pescatarian']].map(([v,l])=>
                _obChipHTML('dietary',v,l)
              ).join('')}
            </div>
            <div style="margin-top:20px">
              <div style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:8px">Drinks?</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
                ${[['yes','Cocktails & wine'],['sometimes','Occasionally'],['no','Non-drinker']].map(([v,l])=>
                  _obChipHTML('alcohol',v,l)
                ).join('')}
              </div>
            </div>`
          },
          {
            title:'What are you into?',
            sub:'Pick at least 2 — this shapes every recommendation',
            required:'interests',
            render:()=>`<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center">
              ${[['dining','Restaurants & food'],['culture','Theatre, art & culture'],['outdoors','Parks, walks & rooftops'],['nightlife','Bars, clubs & late nights'],['wellness','Spa, yoga & wellness'],['active','Sports, games & activities'],['music','Live music & concerts'],['cooking','Cooking classes']].map(([v,l])=>
                _obChipHTML('interests',v,l)
              ).join('')}
            </div>`
          },
          {
            title:'Are you planning for someone else too?',
            sub:'You can always add a partner later in Preferences',
            required:'_optional_date_mode',
            render:()=>`<div style="display:flex;flex-direction:column;gap:10px">
              ${[['solo','Just me for now'],['couple','With my partner'],['friends','With friends']].map(([v,l])=>
                `<div class="ob-chip" data-group="date_mode" data-value="${v}" onclick="obToggleChip(this,'date_mode','${v}')" style="display:flex;align-items:center;gap:12px;padding:16px 18px;border:1.5px solid rgba(255,255,255,0.1);border-radius:16px;cursor:pointer;font-size:14px;font-weight:500;color:rgba(255,255,255,0.55);background:rgba(255,255,255,0.04);transition:all 0.18s">${l}</div>`
              ).join('')}
            </div>
            <div style="text-align:center;margin-top:14px">
              <span style="font-size:12px;color:rgba(255,255,255,0.4);cursor:pointer;text-decoration:underline" onclick="_obPrefs.date_mode='solo';obNext()">Skip for now</span>
            </div>`
          }
        ];

        function startOnboarding(){
          // Check if already completed
          const profile=_getUserProfile();
          if(profile?.onboarding_completed)return;
          _trackEvent('onboarding_started',{});
          _obCurrentStep=0;
          const ov=document.getElementById('onboarding-overlay');
          if(ov){ov.style.display='block';document.body.style.overflow='hidden';}
          _obRenderStep();
        }

        function _obRenderStep(){
          const step=_OB_STEP_DATA[_obCurrentStep];
          const content=document.getElementById('ob-step-content');
          const label=document.getElementById('ob-step-label');
          const progress=document.getElementById('ob-progress-bar');
          const backBtn=document.getElementById('ob-back-btn');
          const nextBtn=document.getElementById('ob-next-btn');
          const error=document.getElementById('ob-error');
          if(!content)return;
          label.textContent=`Step ${_obCurrentStep+1} of ${_OB_TOTAL}`;
          progress.style.width=(((_obCurrentStep+1)/_OB_TOTAL)*100)+'%';
          backBtn.style.display=_obCurrentStep>0?'block':'none';
          nextBtn.textContent=_obCurrentStep===_OB_TOTAL-1?'Finish setup':'Continue';
          error.style.display='none';
          content.innerHTML=`
            <div style="text-align:center;margin-bottom:28px">
              <h2 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:26px;font-weight:300;color:rgba(255,255,255,0.92);margin-bottom:8px">${step.title}</h2>
              <p style="font-size:13px;color:rgba(255,255,255,0.35);line-height:1.5">${step.sub}</p>
            </div>
            ${step.render()}
          `;
          // Re-apply existing selections
          _obApplySelections();
          // Scroll to top
          document.getElementById('onboarding-overlay').scrollTo({top:0});
        }

        function _obApplySelections(){
          document.querySelectorAll('.ob-chip').forEach(chip=>{
            const group=chip.dataset.group;
            const value=chip.dataset.value;
            const isMulti=['dietary','interests'].includes(group);
            if(isMulti){
              chip.classList.toggle('ob-selected',_obPrefs[group].includes(value));
            } else {
              chip.classList.toggle('ob-selected',_obPrefs[group]===value);
            }
          });
        }

        function obNext(){
          const step=_OB_STEP_DATA[_obCurrentStep];
          const error=document.getElementById('ob-error');
          // Validate required fields for current step
          const req=step.required;
          if(req==='interests'){
            if(_obPrefs.interests.length<2){
              error.textContent='Please pick at least 2 interests';error.style.display='block';return;
            }
          } else if(req==='dietary'){
            if(_obPrefs.dietary.length===0){
              error.textContent='Please select at least one option';error.style.display='block';return;
            }
            if(!_obPrefs.alcohol){
              error.textContent='Please select your drink preference';error.style.display='block';return;
            }
          } else if(req==='time_preference'){
            if(!_obPrefs.time_preference){error.textContent='Please select when you usually go out';error.style.display='block';return;}
            if(!_obPrefs.setting){error.textContent='Please select indoor or outdoor preference';error.style.display='block';return;}
            if(!_obPrefs.energy_level){error.textContent='Please select your energy level';error.style.display='block';return;}
          } else if(req==='budget'){
            if(!_obPrefs.budget){error.textContent='Please select your budget range';error.style.display='block';return;}
            if(!_obPrefs.travel_radius){error.textContent='Please select your travel preference';error.style.display='block';return;}
          } else if(req==='_optional_date_mode'){
            // Optional step — default to solo if nothing selected
            if(!_obPrefs.date_mode)_obPrefs.date_mode='solo';
          } else {
            if(!_obPrefs[req]){
              error.textContent='Please make a selection to continue';error.style.display='block';return;
            }
          }
          error.style.display='none';
          if(_obCurrentStep<_OB_TOTAL-1){
            _obCurrentStep++;
            _obRenderStep();
          } else {
            _obComplete();
          }
        }

        function obBack(){
          if(_obCurrentStep>0){
            _obCurrentStep--;
            _obRenderStep();
          }
        }

        async function _obComplete(){
          const btn=document.getElementById('ob-next-btn');
          btn.textContent='Saving...';btn.disabled=true;
          // Determine account_state from date_mode
          const accountState=_obPrefs.date_mode==='couple'?'paired':'single';
          // Save to localStorage
          const profile=_getUserProfile()||{};
          profile.onboarding_completed=true;
          profile.preferences=_obPrefs;
          profile.account_state=accountState;
          _saveUserProfile(profile);
          // Save to Supabase users table
          if(_sb&&_sbUserId){
            try{
              await _sb.from('users').update({
                onboarding_completed:true,
                preferences:_obPrefs,
                account_state:accountState
              }).eq('id',_sbUserId);
            }catch(e){_captureError(e,{context:'onboarding_save',source:'_obComplete'});}
            // Also save to user_state as backup (survives even if users table read fails)
            _sbSaveState('preferences',_obPrefs);
          }
          _trackEvent('onboarding_completed',_obPrefs);
          // Apply preferences to app state
          if(_obPrefs.date_mode)_pairingMode=_obPrefs.date_mode==='couple'?'couple':_obPrefs.date_mode;
          if(_obPrefs.budget){
            _activeBudgetBand=_obPrefs.budget;
            const pillEl=document.querySelector(`#budget-pills [data-budget="${_obPrefs.budget}"]`);
            if(pillEl){document.querySelectorAll('#budget-pills .occasion-chip').forEach(c=>c.classList.remove('active'));pillEl.classList.add('active');}
          }
          if(_obPrefs.energy_level)_moodEnergy=_obPrefs.energy_level==='low'?'tired':_obPrefs.energy_level==='high'?'energetic':'moderate';
          // Hide onboarding
          const ov=document.getElementById('onboarding-overlay');
          if(ov){ov.style.display='none';document.body.style.overflow='';}
          // Route to Discover
          go('discover',null);
          generateSuggestions();
          toast('✦ You\'re all set — let\'s find your next date.');
        }

        // Trigger onboarding after entering app
        const _origEnterApp=enterApp;
        enterApp=function(){
          _origEnterApp();
          // Check if onboarding is needed
          setTimeout(()=>{
            const profile=_getUserProfile();
            if(!profile?.onboarding_completed){
              startOnboarding();
            } else {
              go('discover',null);
            }
          },500);
        };

        /* ── Tap-to-scroll-top (mobile) ── */
        (function(){
          // 1) Mobile header tap → scroll to top
          const mh=document.querySelector('.mobile-header');
          if(mh){
            mh.style.cursor='pointer';
            mh.addEventListener('click',function(e){
              // Don't hijack clicks on buttons/links inside the header
              if(e.target.closest('.couple-pill')||e.target.closest('button')||e.target.closest('a'))return;
              const c=document.querySelector('.content');
              if(c) c.scrollTo({top:0,behavior:'smooth'});
            });
          }

          // 2) Floating back-to-top button
          const btn=document.createElement('button');
          btn.className='back-to-top';
          btn.setAttribute('aria-label','Scroll to top');
          btn.innerHTML='&#8593;';
          document.body.appendChild(btn);

          btn.addEventListener('click',function(){
            const c=document.querySelector('.content');
            if(c) c.scrollTo({top:0,behavior:'smooth'});
          });

          // Show/hide button based on scroll position
          const content=document.querySelector('.content');
          if(content){
            content.addEventListener('scroll',function(){
              if(content.scrollTop>400){
                btn.classList.add('visible');
              }else{
                btn.classList.remove('visible');
              }
            },{passive:true});
          }
        })();

        // ── Partner form ──
        function openPartnerForm(){
          const o = document.getElementById('partner-overlay');
          if(o){ o.style.display='flex'; }
        }
        function closePartnerForm(){
          const o = document.getElementById('partner-overlay');
          if(o){ o.style.display='none'; }
          // Reset form
          const fields = document.getElementById('partner-form-fields');
          const success = document.getElementById('partner-success');
          if(fields) fields.style.display='block';
          if(success) success.style.display='none';
        }
        async function submitPartnerForm(){
          const business = document.getElementById('partner-business').value.trim();
          const name = document.getElementById('partner-name').value.trim();
          const email = document.getElementById('partner-email').value.trim();
          const type = document.getElementById('partner-type').value;
          const message = document.getElementById('partner-message').value.trim();

          if(!business){alert('Please enter your business name');return;}
          if(!name){alert('Please enter your name');return;}
          if(!email||!email.includes('@')){alert('Please enter a valid email');return;}

          const btn = document.querySelector('#partner-form-fields .lp-clean-btn');
          btn.textContent = 'Sending...';
          btn.disabled = true;

          const data = new FormData();
          data.append('_subject', 'Partner enquiry: ' + business);
          data.append('business_name', business);
          data.append('contact_name', name);
          data.append('email', email);
          data.append('venue_type', type);
          data.append('message', message);

          try {
            const response = await fetch('https://formspree.io/f/xreodnbr', {
              method: 'POST',
              body: data,
              headers: { 'Accept': 'application/json' }
            });
            if(response.ok){
              document.getElementById('partner-form-fields').style.display='none';
              document.getElementById('partner-success').style.display='block';
            } else {
              alert('Something went wrong. Please try again.');
              btn.textContent = 'Submit enquiry';
              btn.disabled = false;
            }
          } catch(e) {
            alert('Could not connect. Please check your internet and try again.');
            btn.textContent = 'Submit enquiry';
            btn.disabled = false;
          }
        }

        // ── Pairing mode picker ──
        function openPairingPicker(){
          document.getElementById('pairing-overlay').style.display='flex';
        }
        function closePairingPicker(){
          document.getElementById('pairing-overlay').style.display='none';
        }
        function setPairingMode(mode){
          _pairingMode=mode;
          // Update check marks
          ['solo','couple','friends'].forEach(m=>{
            const el=document.getElementById('pairing-check-'+m);
            if(el) el.style.display=m===mode?'inline':'none';
          });
          // Update status banner
          const status=document.getElementById('pairing-status');
          if(status){
            if(mode==='solo'){
              status.innerHTML='<span style="color:var(--primary);font-weight:600">Planning solo</span> · finding things just for you';
            } else if(mode==='couple'){
              status.innerHTML='<span style="color:var(--primary);font-weight:600">Currently paired with '+_partnerName()+'</span> · planning together';
            } else if(mode==='friends'){
              status.innerHTML='<span style="color:var(--primary);font-weight:600">Planning with friends</span> · group activities & dining';
            }
          }
          // Update couple pill in header
          const pills=document.querySelectorAll('.couple-name');
          pills.forEach(p=>{
            if(mode==='solo') p.textContent='Solo';
            else if(mode==='couple') p.textContent=p.closest('.mobile-header')?_coupleShort():_userName()+' & '+_partnerName();
            else if(mode==='friends') p.textContent=p.closest('.mobile-header')?'Group':'Friends';
          });
          closePairingPicker();
          toast('✦ Switched to '+(mode==='solo'?'solo mode':mode==='couple'?'couple mode':'friends mode'));
        }

        // ── Discover category bar ──
        function selectDiscoverCat(el,cat){
          document.querySelectorAll('.dcat').forEach(c=>c.classList.remove('active'));
          el.classList.add('active');
          // Map category to vibe type
          const catMap={all:'all',romantic:'romantic',activity:'all',outdoor:'outdoor',fun:'fun',wellness:'outdoor'};
          _vibeType=catMap[cat]||'all';
          _vibeTag='';
          // Also update the vibe cards in the filter panel to match
          document.querySelectorAll('.vibe-card').forEach(c=>c.classList.remove('active'));
          generateSuggestions();
        }

        // ── Tide-inspired ambient background ──
        (function setAmbientBackground(){
          const h=new Date().getHours();
          const root=document.documentElement;
          if(h>=6&&h<10){
            // Morning — warm golden light
            root.style.setProperty('--ambient-warm','rgba(200,160,80,0.08)');
            root.style.setProperty('--ambient-cool','rgba(180,140,100,0.04)');
          } else if(h>=10&&h<16){
            // Afternoon — soft neutral
            root.style.setProperty('--ambient-warm','rgba(160,140,100,0.05)');
            root.style.setProperty('--ambient-cool','rgba(120,130,150,0.04)');
          } else if(h>=16&&h<20){
            // Golden hour / evening — warm amber
            root.style.setProperty('--ambient-warm','rgba(210,150,60,0.09)');
            root.style.setProperty('--ambient-cool','rgba(180,100,60,0.05)');
          } else if(h>=20&&h<23){
            // Night — deep blue-rose
            root.style.setProperty('--ambient-warm','rgba(160,80,100,0.06)');
            root.style.setProperty('--ambient-cool','rgba(60,80,140,0.06)');
          } else {
            // Late night — minimal, near black
            root.style.setProperty('--ambient-warm','rgba(100,80,60,0.03)');
            root.style.setProperty('--ambient-cool','rgba(40,50,80,0.04)');
          }
        })();

        // ════════════════════════════════════════════════
        // ── REFINE DATE BOTTOM SHEET ──
        // ════════════════════════════════════════════════
        let _rfFilters={occasion:'',time:'',setting:'',area:'',style:[],food:'',pace:''};
        let _rfActive=false; // true when user has applied refined filters

        function openRefineSheet(){
          const ov=document.getElementById('refine-overlay');
          const sheet=document.getElementById('refine-sheet');
          if(!ov||!sheet)return;
          // Prefill from saved onboarding preferences
          _rfPrefill();
          // Restore current selections
          _rfApplySelections();
          ov.style.display='block';
          document.body.style.overflow='hidden';
          requestAnimationFrame(()=>{sheet.classList.add('rf-open');});
        }

        function closeRefineSheet(){
          const ov=document.getElementById('refine-overlay');
          const sheet=document.getElementById('refine-sheet');
          if(!sheet)return;
          sheet.classList.remove('rf-open');
          setTimeout(()=>{if(ov)ov.style.display='none';document.body.style.overflow='';},300);
        }

        function rfToggle(el){
          const g=el.dataset.g;
          document.querySelectorAll(`.rf-chip[data-g="${g}"]`).forEach(c=>c.classList.remove('rf-on'));
          if(_rfFilters[g]===el.dataset.v){
            _rfFilters[g]='';
          }else{
            el.classList.add('rf-on');
            _rfFilters[g]=el.dataset.v;
          }
        }

        function rfToggleMulti(el){
          el.classList.toggle('rf-on');
          const v=el.dataset.v;
          if(el.classList.contains('rf-on')){
            if(!_rfFilters.style.includes(v))_rfFilters.style.push(v);
          }else{
            _rfFilters.style=_rfFilters.style.filter(s=>s!==v);
          }
        }

        function _rfApplySelections(){
          document.querySelectorAll('.rf-chip').forEach(c=>{
            const g=c.dataset.g;const v=c.dataset.v;
            if(g==='style'){
              c.classList.toggle('rf-on',_rfFilters.style.includes(v));
            }else{
              c.classList.toggle('rf-on',_rfFilters[g]===v);
            }
          });
        }

        function _rfPrefill(){
          // Inherit persistent defaults into Refine as pre-selections.
          // Only fills empty Refine fields — user overrides are preserved.
          // This is the Preferences → Refine inheritance bridge.
          const profile=_getUserProfile()||{};
          const prefs=profile.preferences||{};
          // Legacy: setting and time_preference may exist from older onboarding
          if(!_rfFilters.setting&&prefs.setting)_rfFilters.setting=prefs.setting;
          if(!_rfFilters.time&&prefs.time_preference&&prefs.time_preference!=='any')_rfFilters.time=prefs.time_preference;
          if(!_rfFilters.area&&prefs.travel_radius){
            const m={local:'east',central:'central',anywhere:''};
            if(m[prefs.travel_radius])_rfFilters.area=m[prefs.travel_radius];
          }
          // Energy → pace inference (persistent default informs session pace)
          if(!_rfFilters.pace&&prefs.energy_level){
            const m={low:'relaxed',moderate:'',high:'quick'};
            if(m[prefs.energy_level])_rfFilters.pace=m[prefs.energy_level];
          }
        }

        function rfClear(){
          _rfFilters={occasion:'',time:'',setting:'',area:'',style:[],food:'',pace:''};
          _rfActive=false;
          _rfApplySelections();
          const badge=document.getElementById('refine-active-badge');
          if(badge)badge.style.display='none';
        }

        function rfApply(){
          // Check if any filter is set
          const hasFilter=_rfFilters.occasion||_rfFilters.time||_rfFilters.setting||_rfFilters.area||_rfFilters.style.length||_rfFilters.food;
          _rfActive=!!hasFilter;
          const badge=document.getElementById('refine-active-badge');
          if(badge)badge.style.display=_rfActive?'inline':'none';
          closeRefineSheet();
          _trackEvent('refine_applied',_rfFilters);
          generateSuggestions();
        }

        // ════════════════════════════════════════════════
        // ── AUTO-SYNC WRAPPERS ──
        // Intercept render calls to sync state to Supabase
        // ════════════════════════════════════════════════
        (function _wireSyncHooks(){
          const _origRB=renderBookings;
          renderBookings=function(){_origRB();_sbSaveState('bookings',bookings);};
          if(typeof renderReminders==='function'){const _origRR=renderReminders;renderReminders=function(){_origRR();_sbSaveState('reminders',reminders);};}
          if(typeof renderWishlist==='function'){const _origRW=renderWishlist;renderWishlist=function(){_origRW();_sbSaveState('wishlist',_wishlist);};}
          if(typeof renderJournal==='function'){const _origRJ=renderJournal;renderJournal=function(){_origRJ();_sbSaveState('journal',_journal);};}
          // Track page views
          const _origGoSync=go;
          go=function(id,el){_origGoSync(id,el);_trackEvent('page_view',{page:id});};
        })();

        // ════════════════════════════════════════════════
        // ── FEEDBACK SYSTEM ──
        // ════════════════════════════════════════════════
        let _feedbackType='idea';
        function openFeedback(){
          const ov=document.getElementById('feedback-overlay');
          if(ov){ov.style.display='flex';document.body.style.overflow='hidden';}
        }
        function closeFeedback(){
          const ov=document.getElementById('feedback-overlay');
          if(ov){ov.style.display='none';document.body.style.overflow='';}
        }
        function setFeedbackType(type,btn){
          _feedbackType=type;
          document.querySelectorAll('#feedback-type-row .btn').forEach(b=>b.classList.remove('btn-rose'));
          if(btn)btn.classList.add('btn-rose');
        }
        function submitFeedback(){
          const text=(document.getElementById('feedback-text')?.value||'').trim();
          if(!text){toast('Please enter your feedback');return;}
          _trackEvent('feedback_submitted',{type:_feedbackType,text,user:_userName()});
          // Also send to Formspree as backup
          const data=new FormData();
          data.append('_subject','Beta feedback ('+_feedbackType+'): '+text.slice(0,50));
          data.append('feedback_type',_feedbackType);
          data.append('feedback_text',text);
          data.append('user_name',_userName());
          data.append('user_id',_getLocalUserId());
          fetch('https://formspree.io/f/xreodnbr',{method:'POST',body:data,headers:{'Accept':'application/json'}}).catch(()=>{});
          closeFeedback();
          document.getElementById('feedback-text').value='';
          toast('✦ Thanks — we read every one');
        }

        // ════════════════════════════════════════════════
        // ── ERROR MONITORING (Sentry + Supabase fallback) ──
        // ════════════════════════════════════════════════

        // PII scrubber — strips emails, names, handles from error data
        function _scrubPII(str){
          if(!str||typeof str!=='string')return str;
          return str
            .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,'[email]')
            .replace(/@[a-zA-Z0-9_]+/g,'@[handle]')
            .replace(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g,'[jwt]');
        }

        // Init Sentry if SDK loaded
        function _initSentry(){
          if(typeof Sentry==='undefined')return;
          try{
            Sentry.init({
              dsn:'', // Add your Sentry DSN here when ready
              environment:'beta',
              release:'t4t-beta-1.0',
              sampleRate:1.0,
              beforeSend(event){
                // Scrub PII from all string values
                if(event.message)event.message=_scrubPII(event.message);
                if(event.exception?.values){
                  event.exception.values.forEach(v=>{if(v.value)v.value=_scrubPII(v.value);});
                }
                // Remove user email from breadcrumbs
                if(event.breadcrumbs){
                  event.breadcrumbs.forEach(b=>{if(b.message)b.message=_scrubPII(b.message);});
                }
                return event;
              },
              beforeBreadcrumb(breadcrumb){
                // Skip noisy fetch breadcrumbs to Supabase
                if(breadcrumb.category==='fetch'&&breadcrumb.data?.url?.includes('supabase'))return null;
                return breadcrumb;
              }
            });
            // Set anonymous user context
            Sentry.setUser({id:_analytics._getAnonId()});
            console.log('[T4T] Sentry initialized');
          }catch(e){console.warn('[T4T] Sentry init failed',e);}
        }
        // Try init after a short delay to let the SDK load
        setTimeout(_initSentry,1000);

        // Capture error to both Sentry and Supabase
        function _captureError(error,context){
          const msg=_scrubPII(error?.message||String(error));
          const ctx=context||{};
          // Supabase event
          _trackEvent('error_state_seen',{message:msg,context:ctx.context||null,source:ctx.source||null});
          // Sentry
          if(typeof Sentry!=='undefined'){
            Sentry.withScope(scope=>{
              if(ctx.context)scope.setTag('context',ctx.context);
              if(ctx.source)scope.setTag('source',ctx.source);
              if(ctx.plan_id)scope.setExtra('plan_id',ctx.plan_id);
              if(ctx.venue)scope.setExtra('venue',ctx.venue);
              Sentry.captureException(error instanceof Error?error:new Error(msg));
            });
          }
        }

        // Global handlers
        window.addEventListener('error',function(e){
          _captureError(e.error||e.message,{context:'global',source:(e.filename||'').split('/').pop()+':'+e.lineno});
        });
        window.addEventListener('unhandledrejection',function(e){
          _captureError(e.reason,{context:'promise',source:'unhandledrejection'});
        });

