const RaceNetwork = (() => {
  let session = null, epoch = 0, listTimer = 0, listEpoch = 0;
  const fast = new Set(['s','f','in','pg','po']);
  async function api(path, body, keepalive=false) {
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(),9000);
    try {
      const response = await fetch('/api/'+path,{method:body?'POST':'GET',cache:'no-store',
        body:body?JSON.stringify(body):undefined,headers:body?{'Content-Type':'application/json'}:undefined,
        signal:controller.signal,keepalive});
      if(!response.ok) throw Object.assign(new Error('Сервер '+response.status),{status:response.status});
      return await response.json();
    } finally { clearTimeout(timer); }
  }
  function stopList(){ clearTimeout(listTimer); listEpoch++; }
  async function list(){
    stopList(); const generation=listEpoch;
    try {
      const rows=await api('rooms');
      if(generation!==listEpoch) return;
      const box=$('#roomList'); box.replaceChildren();
      for(const r of rows){
        const b=document.createElement('button'); b.className='btn glass room-choice';
        b.textContent=r.name+' · '+r.track+' · '+r.count+'/'+r.capacity;
        b.disabled=r.count>=r.capacity;
        b.onclick=()=>{S.name=$('#fName').value.trim();saveS();RT.setNick(S.name);joinLobby(r.id);};
        box.append(b);
      }
      $('#roomHint').textContent=rows.length?'Выбери комнату хоста':'Открытых комнат пока нет. Можно создать свою.';
    } catch { if(generation===listEpoch) $('#roomHint').textContent='Список временно недоступен. Повторяем поиск…'; }
    if(generation===listEpoch) listTimer=setTimeout(list,2500);
  }
  function close(){
    epoch++;
    const s=session; session=null;
    if(!s) return;
    clearTimeout(s.timer);clearTimeout(s.socketRetry);s.socket?.close();
    for(const link of s.links.values()) link.close();
    api('leave',{id:s.id,token:s.token},true).catch(()=>{});
  }
  async function begin(room){
    netClose(); const generation=epoch, isHost=!room;
    Net.hosting=isHost; joinBusy(!isHost); hostBusy(isHost);
    netStatus(isHost?'Создаём комнату…':'Подключаемся к хосту…');
    try {
      const ticket=await api(isHost?'host':'join',{room,name:myName(),track:TRK[S.track].name});
      if(generation!==epoch){api('leave',ticket).catch(()=>{});return;}
      const s=session={...ticket,seq:0,out:[],latest:new Map(),links:new Map(),last:Date.now(),timer:0};
      Object.assign(Net,{host:isHost,me:s.id,code:s.room,laps:S.laps,track:S.track});
      if(isHost){
        Net.o={q:S.quali,b:S.bots,t:S.tyres,w:S.weather,m:S.wx,tw:S.tw,tm:false,rl:true};
        Net.players=[{id:s.id,name:myName(),team:S.team,host:1,rk:RT.pub,dv:RT.dev}];
        hostBusy(false);show('lobby');renderLobby();netStatus('');
      } else {
        Net.hc=linkFor(s,s.host);
        Net.hc.send({t:'hi',name:myName(),team:S.team,rk:RT.pub,dv:RT.dev,sk:S.skin|0});
      }
      openSocket(s);
      poll(s);
    } catch(e) {
      if(generation!==epoch)return;
      netClose();netStatus(e.status===409?'Комната заполнена или хост вышел.':'Не удалось открыть соединение. Попробуй ещё раз.');
    }
  }
  function openSocket(s){
    if(session!==s)return;
    s.near=new Set();
    const url=new URL('/api/live',location.href);
    url.protocol=url.protocol==='https:'?'wss:':'ws:';
    let socket;
    try {socket=s.socket=new WebSocket(url);} catch {return;}
    socket.onopen=()=>socket.send(JSON.stringify({auth:true,id:s.id,token:s.token}));
    socket.onmessage=({data})=>{
      if(session!==s)return;
      const frame=JSON.parse(data);
      if(frame.peer){if(frame.up)s.near.add(frame.peer);else s.near.delete(frame.peer);}
      else if(fast.has(frame.m?.t) && s.links.has(frame.from)) deliver(s,frame.from,frame.m);
    };
    socket.onclose=()=>{
      s.near.clear();
      if(session===s)s.socketRetry=setTimeout(()=>openSocket(s),10000);
    };
  }
  function linkFor(s,id){
    if(s.links.has(id)) return s.links.get(id);
    let pc=null, channel=null;
    const pendingIce=[];
    const hasSocket=()=>s.socket?.readyState===1 && s.near?.has(id);
    const signal=data=>s.out.push({to:id,m:{t:'signal',...data}});
    const bind=c=>{
      channel=c;
      c.onmessage=e=>{if(session!==s)return;const m=JSON.parse(e.data);if(fast.has(m.t)) deliver(s,id,m);};
    };
    const link={open:true,get route(){return channel?.readyState==='open'?'ПРЯМОЙ':hasSocket()?'WEBSOCKET':'HTTP';},get broker(){return channel?.readyState!=='open';},
      send(m){
        if(!this.open)return;
        if(fast.has(m.t)){
          if(channel?.readyState==='open' && channel.bufferedAmount<65536){try{channel.send(JSON.stringify(m));return;}catch{}}
          if(hasSocket() && s.socket.bufferedAmount<65536){try{s.socket.send(JSON.stringify({to:id,m}));return;}catch{}}
          s.latest.set(id+'/'+m.t,{to:id,m});
        } else s.out.push({to:id,m});
      },
      async negotiate(data){
        if(!window.RTCPeerConnection)return;
        try{
          if(!pc){
            pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]});
            pc.onicecandidate=e=>{if(e.candidate && session===s) signal({ice:e.candidate.toJSON()});};
            pc.ondatachannel=e=>bind(e.channel);
          }
          if(!data){bind(pc.createDataChannel('race',{ordered:false,maxRetransmits:0}));const offer=await pc.createOffer();signal({desc:offer});await pc.setLocalDescription(offer);}
          else if(data.desc){await pc.setRemoteDescription(data.desc);if(data.desc.type==='offer'){const answer=await pc.createAnswer();signal({desc:answer});await pc.setLocalDescription(answer);}}
          else if(data.ice) pendingIce.push(data.ice);
          if(pc.remoteDescription)while(pendingIce.length)await pc.addIceCandidate(pendingIce.shift());
        }catch{/* The HTTP relay continues whenever direct negotiation fails. */}
      },
      close(){this.open=false;pc?.close();}
    };
    s.links.set(id,link);return link;
  }
  function deliver(s,id,m){
    const l=linkFor(s,id);
    if(Net.host){
      if(m.t==='hi'){const first=!Net.conns.has(id);hostData(l,id,m);if(first && Net.conns.has(id)) l.negotiate();}
      else if(!Net.conns.has(id))return;
      else if(m.t==='signal')return l.negotiate(m);
      else hostData(l,id,m);
    } else if(id===s.host){
      if(m.t==='signal')return l.negotiate(m);
      if(m.t==='lobby'){joinBusy(false);netStatus('');}
      clientData(m);
    }
  }
  async function poll(s){
    if(s!==session)return;
    const body={id:s.id,token:s.token,cursor:s.cursor,seq:++s.seq,track:TRK[Net.track]?.name,capacity:Net.o.tm?22:11,
      out:s.out.splice(0,96)};
    for(const [k,v] of s.latest){if(body.out.length>=150)break;body.out.push(v);s.latest.delete(k);}
    while(s===session){
      let result;
      try{result=await api('sync',body);}
      catch(e){
        if(session!==s)return;
        if(e.status===410 || Date.now()-s.last>35000){netClose();startAttract();show('friends');netStatus('Связь с комнатой потеряна. Выбери хоста снова.');return;}
        await new Promise(resolve=>setTimeout(resolve,450));continue;
      }
      if(session!==s)return;
      for(const {from,m} of result.messages){if(session!==s)return;await deliver(s,from,m);}
      if(session!==s)return;
      s.cursor=result.cursor;s.last=Date.now();
      if(Net.host) for(const [id,l] of Net.conns) if(!result.members.includes(id)){hostDrop(id,l);l.close();s.links.delete(id);}
      const active=G.net==='host'||G.net==='client';
      const relay=[...s.links.values()].some(l=>l.open && l.route==='HTTP');
      s.timer=setTimeout(()=>poll(s),active && relay?5:active?240:180);return;
    }
  }
  addEventListener('pagehide',close);
  return {begin,close,list,stopList};
})();
