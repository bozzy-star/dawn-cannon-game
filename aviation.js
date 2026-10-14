import * as THREE from 'three';
import { aviationStats } from './campaign.js?v=asahi-v9.2-final';

const ROLES = ['interceptor', 'bomber', 'fighter'];
const CAPACITIES = [6, 12, 24, 36, 60];
const MAX_ACTIVE = 18;
const ACTIVE = new Set(['takeoff', 'combat', 'return', 'landing']);
const clamp = THREE.MathUtils.clamp;
const ZERO = new THREE.Vector3();
const up = new THREE.Vector3(0, 1, 0);

function aircraftGeometry(role, level) {
  const vertices = [], colors = [];
  const tint = level >= 4 ? 0x4e6472 : role === 'bomber' ? 0xacb8b7 : role === 'interceptor' ? 0x8daaa8 : 0x839aaa;
  const append = (g, color = tint) => {
    const flat = g.index ? g.toNonIndexed() : g, p = flat.getAttribute('position'), c = new THREE.Color(color);
    for (let i = 0; i < p.count; i++) {
      vertices.push(p.getX(i), p.getY(i), p.getZ(i)); colors.push(c.r, c.g, c.b);
    }
    if (flat !== g) flat.dispose(); g.dispose();
  };
  const box = (w,h,d,x,y,z,color) => {const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);append(g,color);};
  const ellipsoid = (x,y,z,rx,ry,rz,color) => {const g=new THREE.SphereGeometry(1,10,6);g.scale(rx,ry,rz);g.translate(x,y,z);append(g,color);};
  const wing = (points, height = .12) => {
    const s=new THREE.Shape();s.moveTo(...points[0]);for(const p of points.slice(1))s.lineTo(...p);s.closePath();
    const g=new THREE.ExtrudeGeometry(s,{depth:height,bevelEnabled:false});g.rotateX(Math.PI/2);append(g);
  };
  const span = role === 'bomber' ? 3.6 : 2.6;
  if (level >= 4) {
    wing([[0,2.8],[-.55,1.7],[-span,-1.4],[-span*.6,-1.75],[0,-1.3],[span*.6,-1.75],[span,-1.4],[.55,1.7]],.24);
    ellipsoid(0,.3,.5,.45,.28,1.4,0x263f4c);
    for(const x of [-.55,.55])box(.38,.3,.8,x,.16,-1.1,0x273846);
  } else {
    ellipsoid(0,0,0,.38,.42,2.35);
    ellipsoid(0,.38,.9,.28,.25,.72,0x274755);
    for(const sign of [-1,1]){
      wing([[sign*.25,1],[sign*span,level>=1?-1.0:.25],[sign*span,-1.5],[sign*.3,-.55]]);
      wing([[sign*.2,-1.55],[sign*1.2,-2.02],[sign*1.16,-2.38],[sign*.2,-2.24]],.1);
      if(role==='bomber')ellipsoid(sign*1.5,-.12,.15,.22,.22,.85,0x6a7e84);
    }
    box(.11,.85,.65,0,.5,-1.94);
    if(level===0){box(.04,1.25,.05,0,0,2.33,0x3e5053);box(1.25,.04,.05,0,0,2.33,0x3e5053);}
    else {box(.44,.4,.4,0,0,-2.1,0x263944);ellipsoid(0,0,-2.3,.18,.18,.12,0x90cee5);}
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();return geometry;
}

/** Friendly aircraft belong to one deployment. Surviving aircraft rearm on deck;
 * lost aircraft stay lost until reset. Ship damage/rewards remain caller-owned.
 * onAirKill is a notification only: NavalThreats already awards its air-kill callback.
 */
export class NavalAviation {
  constructor({scene,getState=()=>({}),getManeuver=()=>({position:ZERO,velocity:ZERO}),getWeather=()=>({}),consume=()=>true,
    onEffect=()=>{},onSurfaceHit=()=>{},onAirKill=()=>{},onMessage=()=>{},getThreats=()=>null,getDeckPose=null}) {
    Object.assign(this,{scene,getState,getManeuver,getWeather,consume,onEffect,onSurfaceHit,onAirKill,onMessage,getThreats,getDeckPose});
    this.nextId=1;this.dummy=new THREE.Object3D();this.reset();
  }
  _state() {return this.getState() || {};}
  _enabled() {const a=this._state();return !!a.converted && a.hullMode==='hybrid';}
  _pose() {
    const raw=this.getDeckPose?.() || {}, m=this.getManeuver()||{}, p=m.position?.clone?.()||new THREE.Vector3(), yaw=raw.yaw??m.yaw??0;
    const launchOrigin=raw.launchOrigin?.clone?.()||new THREE.Vector3(0,9,65).applyAxisAngle(up,yaw).add(p);
    const landingOrigin=raw.landingOrigin?.clone?.()||new THREE.Vector3(0,9,82).applyAxisAngle(up,yaw).add(p);
    return {launchOrigin,landingOrigin,yaw,position:p,forward:new THREE.Vector3(0,0,1).applyAxisAngle(up,yaw)};
  }
  reset() {
    if(this.group){this.scene.remove(this.group);for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();for(const m of Object.values(this.meshes))m.dispose();}
    this.group=new THREE.Group();this.group.name='naval-aviation';this.scene.add(this.group);
    this.geometries=[];this.materials=[];this.meshes={};this.aircraft=[];this.projectiles=[];this.enemies=[];this.time=0;this.autoTimer=0;this.messageTimer=0;
    this.fuelBlocked=false;this.ammoBlocked=false;this.airKills=0;this.groundHits=0;this.losses=0;this.launched=0;this.returned=0;
    const state=this._state();this.capacity=CAPACITIES[clamp(Math.floor(Number(state.capacityLevel)||0),0,4)];
    let remaining=this.capacity;
    for(const role of ROLES){
      const level=clamp(Math.floor(Number(state.levels?.[role])||0),0,5), spec=aviationStats(role,level);
      const geometry=aircraftGeometry(role,level), material=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:level>=4?.66:.47,metalness:level>=4?.35:.55});
      this.geometries.push(geometry);this.materials.push(material);
      const instance=new THREE.InstancedMesh(geometry,material,this.capacity);instance.instanceMatrix.setUsage(THREE.DynamicDrawUsage);instance.count=0;instance.frustumCulled=false;instance.name=`friendly-${role}`;this.group.add(instance);this.meshes[role]=instance;
      const count=Math.min(remaining,clamp(Math.floor(Number(state.loadout?.[role])||0),0,60));remaining-=count;
      for(let i=0;i<count;i++)this.aircraft.push({id:this.nextId++,role,level,spec:{...spec},state:'reserve',position:new THREE.Vector3(),velocity:new THREE.Vector3(),direction:new THREE.Vector3(0,0,1),hp:spec.hp,readyAt:0,time:0,cooldown:0,attacks:0,exposure:0,targetId:null,roll:0});
    }
    this.roundGeo=new THREE.SphereGeometry(.14,6,4);this.geometries.push(this.roundGeo);
    this.roundMat=new THREE.MeshBasicMaterial({color:0xffe3a4});this.materials.push(this.roundMat);
    this._updateInstances();
  }
  get stats() {
    const active=this.aircraft.filter(a=>ACTIVE.has(a.state)).length, ready=this.aircraft.filter(a=>a.state==='reserve'||(a.state==='rearm'&&a.readyAt<=this.time)).length;
    return {enabled:this._enabled(),active,reserve:this.aircraft.filter(a=>!ACTIVE.has(a.state)&&a.state!=='lost').length,ready,
      capacity:this.capacity,allocated:this.aircraft.length,alive:this.aircraft.length-this.losses,airKills:this.airKills,groundHits:this.groundHits,losses:this.losses,launched:this.launched,returned:this.returned,
      fuelBlocked:this.fuelBlocked,ammoBlocked:this.ammoBlocked,ordnance:this.projectiles.filter(p=>p.kind!=='hostile').length,
      status:!this._enabled()?'航空戦艦未改装':this.ammoBlocked?'航空弾不足':this.fuelBlocked?'発艦燃料不足':active?'航空隊作戦中':'発艦準備',
      roles:Object.fromEntries(ROLES.map(role=>[role,this.aircraft.filter(a=>a.role===role&&a.state!=='lost').length])),
      deckRoles:Object.fromEntries(ROLES.map(role=>[role,this.aircraft.filter(a=>a.role===role&&a.state!=='lost'&&!ACTIVE.has(a.state)).length]))};
  }
  hasSurfaceCapability() {
    return this._enabled() && (this.projectiles.some(p=>p.kind==='bomb')||(!this.ammoBlocked&&this.aircraft.some(a=>a.state!=='lost'&&a.role!=='interceptor'&&(ACTIVE.has(a.state)||!this.fuelBlocked))));
  }
  hasAirCapability() {
    return this._enabled() && (this.projectiles.some(p=>p.kind==='air')||(!this.ammoBlocked&&this.aircraft.some(a=>a.state!=='lost'&&a.role!=='bomber'&&(ACTIVE.has(a.state)||!this.fuelBlocked))));
  }
  _airContacts() {return this.getThreats()?.airborneTargets?.() || [];}
  _range(a) {return a.spec.range*(this.getWeather()?.radarFactor??1);}
  _surface(enemies) {return enemies.filter(e=>!e.dead&&!e.removed&&!e.submarine&&e.kind!=='submarine'&&e.root?.position);}
  _target(a,enemies,air=this._airContacts()) {
    const ship=this._pose().position, range=this._range(a), reserved=new Set(this.projectiles.filter(p=>p.kind==='air').map(p=>p.targetId));
    let best=null,distance=Infinity;
    if(a.role!=='bomber')for(const c of air){
      const d=c.position.distanceTo(a.position), fromShip=c.position.distanceTo(ship);
      if(fromShip>range || reserved.has(c.id))continue;
      if(d<distance){distance=d;best={...c,type:'air'};}
    }
    if(best)return best;
    if(a.role==='interceptor')return null;
    for(const e of this._surface(enemies)){
      const p=e.root.position, d=p.distanceTo(a.position);if(p.distanceTo(ship)>range)continue;
      if(d<distance){distance=d;best={id:e.id??e.root.uuid,type:'surface',position:p.clone(),velocity:e.velocity?.clone?.()||new THREE.Vector3(),enemy:e};}
    }
    return best;
  }
  _launchOne(a) {
    if(!this.consume('fuel',3)){this.fuelBlocked=true;return false;}
    const pose=this._pose();a.state='takeoff';a.position.copy(pose.launchOrigin);a.direction.copy(pose.forward);a.hp=Math.min(a.spec.hp,a.hp+a.spec.hp*.35);a.time=0;a.attacks=0;a.cooldown=.2;a.exposure=0;a.velocity.set(0,0,0);this.launched++;return true;
  }
  launch(enemies=this.enemies||[]) {
    if(!this._enabled())return {ok:false,count:0,reason:'航空戦艦に改装してください'};
    if(this.ammoBlocked)return {ok:false,count:0,reason:'航空弾が不足しています'};
    const free=MAX_ACTIVE-this.aircraft.filter(a=>ACTIVE.has(a.state)).length;
    if(free<=0)return {ok:false,count:0,reason:'航空隊はすでに出撃中です'};
    let count=0;
    for(const a of this.aircraft){
      if(count>=Math.min(6,free))break;if(a.state!=='reserve'&&!(a.state==='rearm'&&a.readyAt<=this.time))continue;
      a.position.copy(this._pose().launchOrigin);if(!this._target(a,enemies))continue;
      if(!this._launchOne(a))break;count++;
    }
    const reason=count?`航空隊 ${count}機、発艦！`:this.fuelBlocked?'発艦用燃料が不足しています':'攻撃範囲に目標がありません';
    if(count)this._message(reason);this._updateInstances();return {ok:count>0,count,reason};
  }
  _message(text) {if(this.messageTimer<=0){this.onMessage(text);this.messageTimer=3;}}
  _round(position) {const mesh=new THREE.Mesh(this.roundGeo,this.roundMat);mesh.position.copy(position);this.group.add(mesh);return mesh;}
  _attack(a,target) {
    if(!this.consume('aviation',1)){this.ammoBlocked=true;a.state='return';this._message('航空弾不足！ 航空隊、帰艦');return;}
    a.attacks++;a.cooldown=a.spec.attackInterval||Math.max(.65,(a.role==='interceptor'?1.7:2.0)-a.level*.19);
    if(target.type==='air'){
      const speed=155+a.level*25, t=target.position.distanceTo(a.position)/speed;
      const point=target.position.clone().addScaledVector(target.velocity||ZERO,t), velocity=point.sub(a.position).normalize().multiplyScalar(speed);
      this.projectiles.push({kind:'air',mesh:this._round(a.position),velocity,life:1.8,targetId:target.id,damage:a.spec.damage*(a.role==='fighter'?.85:1),radius:a.level>=4?5:3.8});
    } else {
      // The bomb has a fixed physical intercept at release. Wind or a course
      // change can make it miss, especially the early piston aircraft.
      const height=Math.max(1,a.position.y-target.position.y), t=Math.sqrt(height/8);
      const point=target.position.clone().addScaledVector(target.velocity||ZERO,t*.7), weather=this.getWeather()||{};
      if(a.level>=3){point.x-=(weather.windX||0)*.15*t*t;point.z-=(weather.windZ||0)*.15*t*t;}
      const velocity=new THREE.Vector3((point.x-a.position.x)/t,0,(point.z-a.position.z)/t);
      this.projectiles.push({kind:'bomb',mesh:this._round(a.position),velocity,life:8,enemy:target.enemy,damage:a.spec.damage*(a.role==='fighter'?.65:1),radius:(target.enemy.spec?.radius||5)+(a.level>=3?2:0)});
      a.state='return';a.time=0;
    }
    this.onEffect(a.position.clone(),'aviation-fire',.2);
  }
  _move(a,point,dt,speed=a.spec.speed) {
    const delta=point.clone().sub(a.position), distance=delta.length();if(distance<.001)return distance;
    a.direction.copy(delta).normalize();a.position.addScaledVector(a.direction,Math.min(distance,speed*dt));return distance;
  }
  _lose(a) {
    if(a.state==='lost')return;a.state='lost';this.losses++;this.onEffect(a.position.clone(),'blast',.5);this._message('味方機、被弾！ 帰還不能');
  }
  _exposure(a,air,enemies,dt) {
    if(a.state!=='combat')return;
    const nearby=air.filter(c=>c.position.distanceTo(a.position)<75), escorts=this.aircraft.filter(o=>o!==a&&o.state==='combat'&&o.role!=='bomber'&&o.position.distanceTo(a.position)<90).length;
    const surface=this._surface(enemies).find(e=>e.root.position.distanceTo(a.position)<65&&(e.isShore||e.kind==='battleship'||e.kind.startsWith('carrier')));
    const pressure=nearby.length?Math.min(6,nearby.length)/(1+escorts*.4):surface?.spec?.damage?1.3:0;
    if(!pressure){a.exposure=Math.max(0,a.exposure-dt);return;}
    a.exposure+=dt*(.5+pressure*.12);
    if(a.exposure<1.35)return;a.exposure=0;
    const origin=nearby[0]?.position.clone()||surface.root.position.clone().add(new THREE.Vector3(0,5,0));
    const velocity=a.position.clone().sub(origin).normalize().multiplyScalar(130);
    this.projectiles.push({kind:'hostile',mesh:this._round(origin),velocity,life:1.2,targetId:a.id,damage:.8+pressure*.13,radius:4.2});
  }
  _tickPlane(a,enemies,air,dt) {
    if(!ACTIVE.has(a.state))return;const before=a.position.clone(), pose=this._pose();a.time+=dt;a.cooldown=Math.max(0,a.cooldown-dt);
    if(a.state==='takeoff'){
      const t=clamp(a.time/1.8,0,1);a.position.copy(pose.launchOrigin).addScaledVector(pose.forward,38*t);a.position.y+=Math.max(0,t-.4)*30;
      a.direction.copy(pose.forward);if(t>=1){a.state='combat';a.time=0;}
    } else if(a.state==='combat'){
      const target=this._target(a,enemies,air);
      if(!target||a.attacks>=3||this.ammoBlocked){a.state='return';a.time=0;}
      else {
        a.targetId=target.id;const point=target.position.clone();point.y=target.type==='air'?point.y:28+a.level*2;
        const distance=this._move(a,point,dt), attackRange=target.type==='air'?58+a.level*8:32+a.level*5;
        if(distance<attackRange&&a.cooldown<=0)this._attack(a,target);
        this._exposure(a,air,enemies,dt);
      }
    } else if(a.state==='return'){
      const approach=pose.landingOrigin.clone().addScaledVector(pose.forward,55);approach.y+=16;
      if(this._move(a,approach,dt)<4){a.state='landing';a.time=0;}
    } else if(a.state==='landing'){
      if(this._move(a,pose.landingOrigin,dt,a.spec.speed*.45)<2){a.state='rearm';a.readyAt=this.time+a.spec.rearm;a.time=0;this.returned++;this.onEffect(pose.landingOrigin.clone(),'aviation-land',.2);}
    }
    a.velocity.copy(a.position).sub(before).divideScalar(dt);a.roll=Math.sin(this.time+a.id)*.12;
  }
  _tickProjectiles(dt) {
    const threats=this.getThreats(), airById=new Map((threats?.airborneTargets?.()||[]).map(a=>[a.id,a]));
    for(let i=this.projectiles.length-1;i>=0;i--){
      const p=this.projectiles[i],before=p.mesh.position.clone();p.life-=dt;
      if(p.kind==='bomb'){
        const weather=this.getWeather()||{};p.velocity.y-=16*dt;p.velocity.x+=(weather.windX||0)*dt*.3;p.velocity.z+=(weather.windZ||0)*dt*.3;
      }
      p.mesh.position.addScaledVector(p.velocity,dt);const segment=new THREE.Line3(before,p.mesh.position);
      if(p.kind==='air'){
        const target=airById.get(p.targetId);
        if(target&&segment.closestPointToPoint(target.position,true,new THREE.Vector3()).distanceTo(target.position)<p.radius){
          const result=threats.attackAircraft(p.targetId,p.damage);if(result?.killed){airById.delete(p.targetId);this.airKills++;this.onAirKill({id:p.targetId,source:'aviation'});}
          this.onEffect(target.position.clone(),'blast',.25);p.life=0;
        } else if(!target)p.life=0;
      } else if(p.kind==='hostile'){
        const a=this.aircraft.find(a=>a.id===p.targetId&&ACTIVE.has(a.state));
        if(a&&segment.closestPointToPoint(a.position,true,new THREE.Vector3()).distanceTo(a.position)<p.radius){a.hp-=p.damage;if(a.hp<=0)this._lose(a);this.onEffect(a.position.clone(),'blast',.18);p.life=0;}
        else if(!a)p.life=0;
      } else if(p.mesh.position.y<=(p.enemy.root?.position.y||0)+2||p.life<=0){
        const e=p.enemy;
        if(e&&!e.dead&&!e.removed&&!e.submarine&&e.kind!=='submarine'&&e.root?.position){
          const separation=Math.hypot(e.root.position.x-p.mesh.position.x,e.root.position.z-p.mesh.position.z);
          if(separation<=p.radius){this.onSurfaceHit(e,p.mesh.position.clone(),p.damage);this.groundHits++;this.onEffect(p.mesh.position.clone(),'blast',.6);}
          else this.onEffect(p.mesh.position.clone(),'splash',.7);
        }
        p.life=0;
      }
      if(p.life<=0){this.group.remove(p.mesh);this.projectiles.splice(i,1);}
    }
  }
  _updateInstances() {
    this.group.visible=this._enabled();const indices=Object.fromEntries(ROLES.map(r=>[r,0]));
    // Flagship owns representative parked aircraft. Only live flying aircraft
    // render here, so landing/rearming and hangar capacity never duplicate them.
    for(const a of this.aircraft){
      if(!ACTIVE.has(a.state))continue;const n=indices[a.role];
      this.dummy.position.copy(a.position);this.dummy.rotation.set(-Math.asin(clamp(a.direction.y,-1,1)),Math.atan2(a.direction.x,a.direction.z),a.roll);this.dummy.scale.setScalar(a.role==='bomber'?1.1:.88);this.dummy.updateMatrix();this.meshes[a.role].setMatrixAt(n,this.dummy.matrix);indices[a.role]++;
    }
    for(const role of ROLES){this.meshes[role].count=indices[role];this.meshes[role].instanceMatrix.needsUpdate=true;}
  }

  tick(dt,enemies=[]) {
    if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(.1,dt);this.time+=dt;this.enemies=enemies;this.messageTimer=Math.max(0,this.messageTimer-dt);
    if(!this._enabled()){this.group.visible=false;return;}
    const air=this._airContacts();this.autoTimer-=dt;
    if(this.autoTimer<=0&&!this.ammoBlocked){
      this.autoTimer=1.0;
      const free=MAX_ACTIVE-this.aircraft.filter(a=>ACTIVE.has(a.state)).length;
      if(free>0){
        // Rotate through the three roles so escorts do not occupy every flight slot.
        const roles=[...ROLES.slice(Math.floor(this.time)%3),...ROLES.slice(0,Math.floor(this.time)%3)];
        for(const role of roles){const a=this.aircraft.find(a=>a.role===role&&(a.state==='reserve'||(a.state==='rearm'&&a.readyAt<=this.time)));if(!a)continue;a.position.copy(this._pose().launchOrigin);if(this._target(a,enemies,air)){this._launchOne(a);break;}}
      }
    }
    for(const a of this.aircraft)this._tickPlane(a,enemies,air,dt);
    this._tickProjectiles(dt);this._updateInstances();
  }
  dispose() {
    this.scene.remove(this.group);for(const m of Object.values(this.meshes))m.dispose();for(const g of this.geometries)g.dispose();for(const m of this.materials)m.dispose();this.aircraft=[];this.projectiles=[];
  }
}
