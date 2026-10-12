import * as THREE from 'three';
import { CannonAudio } from './audio.js?v=asahi-v4';
import { AREAS, ENEMY_TYPES, UPGRADES, CONSUMABLES, WORLD, CampaignStore } from './campaign.js?v=asahi-v4';
import { createWarship } from './enemies.js?v=asahi-v4';
import { NavalThreats, createAuxiliaryMounts } from './threats.js?v=asahi-v4';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const canvas = $('sea');
const audio = new CannonAudio();
const campaign = new CampaignStore();
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('loading').textContent = '3D表示に対応したSafari / Chromeで開いてください。';
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa5b6c2, .0017);
const camera = new THREE.PerspectiveCamera(62, 1, .15, 2200);
const clock = new THREE.Clock();
const sunDirection = new THREE.Vector3(-.45, .52, -.66).normalize();
scene.add(new THREE.HemisphereLight(0xc8dae9, 0x324954, 2.15));
const sun = new THREE.DirectionalLight(0xffe4bd, 3.0);
sun.position.copy(sunDirection).multiplyScalar(150);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -28; sun.shadow.camera.right = 28;
sun.shadow.camera.top = 36; sun.shadow.camera.bottom = -25;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 250;
sun.shadow.bias = -.0006; sun.shadow.normalBias = .045;
scene.add(sun);

// Cloudy atmospheric sky: rendered once, also used for steel reflections.
const skyMat = new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{sun:{value:sunDirection}},vertexShader:`varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
varying vec3 vP;uniform vec3 sun;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float a=.55,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+17.1;a*=.5;}return s;}
void main(){vec3 d=normalize(vP);float h=max(d.y,0.);vec3 col=mix(vec3(.58,.67,.73),vec3(.19,.36,.52),pow(h,.48));
vec2 uv=d.xz/(max(d.y,.04)+.35)*2.3;float n=fbm(uv);float cloud=smoothstep(.39,.7,n)*smoothstep(0.,.16,d.y);col=mix(col,vec3(.79,.81,.8),cloud*.94);col+=vec3(1.,.79,.52)*pow(max(dot(d,sun),0.),45.)*.25;col+=vec3(1.,.91,.76)*pow(max(dot(d,sun),0.),750.)*.7;gl_FragColor=vec4(col,1.);}`});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1800,32,16),skyMat);
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new THREE.Mesh(new THREE.SphereGeometry(15,32,16),skyMat);
envScene.add(envSky);
const envRT = pmrem.fromScene(envScene, .03, .1, 100);
scene.environment = envRT.texture;
pmrem.dispose(); envSky.geometry.dispose();

const waterMat = new THREE.ShaderMaterial({uniforms:{time:{value:0},sun:{value:sunDirection},seaTint:{value:new THREE.Color(0x163642)},fogTint:{value:new THREE.Color(0xa5b6c2)}},vertexShader:`
uniform float time;varying vec3 world;varying float wave;
void main(){vec3 p=position;float w=sin(p.x*.043+time*.7)*.34+sin(p.y*.065-time*.9)*.21+sin((p.x+p.y)*.11+time*1.1)*.07;p.z=w;wave=w;vec4 wp=modelMatrix*vec4(p,1.);world=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,fragmentShader:`
uniform float time;uniform vec3 sun;uniform vec3 seaTint;uniform vec3 fogTint;varying vec3 world;varying float wave;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){vec2 p=world.xz;float nx=cos(p.x*.043+time*.7)*.0146+cos((p.x-p.y)*.9+time*1.2)*.055+cos(p.x*2.4+time*1.6)*.017;
float nz=cos(p.y*.065+time*.9)*.014+cos((p.x+p.y)*.75-time*.9)*.045+cos(p.y*2.1-time)*.02;
vec3 n=normalize(vec3(-nx,1.,-nz));vec3 v=normalize(cameraPosition-world);float fres=pow(1.-max(dot(n,v),0.),3.);vec3 refl=reflect(-v,n);vec3 sky=mix(vec3(.58,.67,.73),vec3(.23,.4,.56),sqrt(max(refl.y,0.)));
float sparkle=pow(max(dot(reflect(-sun,n),v),0.),145.);float ripple=noise(p*.45+time*.06);vec3 col=mix(mix(vec3(.025,.105,.135),seaTint,.35)+ripple*.035,sky,fres*.83);col+=vec3(1.,.85,.6)*sparkle*.85;
float dist=length(cameraPosition-world);float fog=1.-exp(-dist*.0016);col=mix(col,fogTint,fog);gl_FragColor=vec4(col,1.);}`});
const water = new THREE.Mesh(new THREE.PlaneGeometry(2800,2800,150,150),waterMat);
water.rotation.x = -Math.PI/2;
scene.add(water);

function canvasTexture(paint, size=256, color=true) {
  const c=document.createElement('canvas'); c.width=c.height=size;
  paint(c.getContext('2d'),size);
  const tex=new THREE.CanvasTexture(c);
  if(color)tex.colorSpace=THREE.SRGBColorSpace;
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  tex.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
  return tex;
}
const metalMap=canvasTexture((ctx,s)=>{
  ctx.fillStyle='#637079';ctx.fillRect(0,0,s,s);
  for(let i=0;i<14000;i++){const a=Math.random()*.18;ctx.fillStyle=`rgba(${Math.random()<.5?'18,26,30':'189,192,185'},${a})`;ctx.fillRect(Math.random()*s,Math.random()*s,1,1);}
  for(let i=0;i<160;i++){ctx.strokeStyle=`rgba(210,218,211,${Math.random()*.07})`;ctx.beginPath();let x=Math.random()*s,y=Math.random()*s;ctx.moveTo(x,y);ctx.lineTo(x+Math.random()*90,y+Math.random()*3);ctx.stroke();}
  for(let i=0;i<36;i++){let x=Math.random()*s,y=Math.random()*s,r=3+Math.random()*16,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(100,48,22,.2)');g.addColorStop(1,'rgba(100,48,22,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
  ctx.strokeStyle='#24333d44';ctx.strokeRect(1,1,s-2,s-2);
});
const bumpMap=canvasTexture((ctx,s)=>{ctx.fillStyle='#888';ctx.fillRect(0,0,s,s);for(let i=0;i<18000;i++){let v=80+Math.floor(Math.random()*110);ctx.fillStyle=`rgb(${v},${v},${v})`;ctx.fillRect(Math.random()*s,Math.random()*s,1,1);}ctx.strokeStyle='#333';ctx.strokeRect(1,1,s-2,s-2);},256,false);
const steel=new THREE.MeshStandardMaterial({color:0x889699,map:metalMap,bumpMap,bumpScale:.024,metalness:.84,roughness:.36});
const darkSteel=steel.clone();darkSteel.color.setHex(0x424c50);darkSteel.roughness=.48;
const edgeSteel=steel.clone();edgeSteel.color.setHex(0xa7aaa1);edgeSteel.roughness=.29;
const deckMat=steel.clone();deckMat.color.setHex(0x5a635f);deckMat.roughness=.72;deckMat.metalness=.5;
const black=new THREE.MeshStandardMaterial({color:0x060b0e,roughness:.95});
const bronze=new THREE.MeshStandardMaterial({color:0x997751,metalness:.8,roughness:.5});
const woodMap=canvasTexture((ctx,s)=>{ctx.fillStyle='#544d3b';ctx.fillRect(0,0,s,s);for(let y=0;y<s;y+=24){ctx.fillStyle='#211f1999';ctx.fillRect(0,y,s,2);for(let k=0;k<12;k++){ctx.strokeStyle='#a4967144';ctx.beginPath();ctx.moveTo(0,y+Math.random()*23);ctx.lineTo(s,y+Math.random()*23);ctx.stroke();}}});
const wood=new THREE.MeshStandardMaterial({map:woodMap,roughness:.82,color:0xc5c0a7});
function mesh(geo,mat,parent,x=0,y=0,z=0){const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function box(parent,w,h,d,x,y,z,mat=steel){return mesh(new THREE.BoxGeometry(w,h,d),mat,parent,x,y,z);}
function cylinder(parent,rt,rb,h,x,y,z,mat=steel,segments=24){return mesh(new THREE.CylinderGeometry(rt,rb,h,segments),mat,parent,x,y,z);}
function ring(parent,r,t,x,y,z,mat=edgeSteel){return mesh(new THREE.TorusGeometry(r,t,8,32),mat,parent,x,y,z);}
const ship = new THREE.Group();scene.add(ship);
box(ship,22,1.2,37,0,1.1,2,deckMat);
box(ship,20,.18,35,0,1.8,2,wood);
for(let z=-15;z<19;z+=3.8){box(ship,22,.045,.09,0,1.92,z,darkSteel);}
for(const x of [-10.5,10.5]){
  box(ship,.7,1.4,37,x,2.2,2,darkSteel);
  for(let z=-14;z<=20;z+=4.8){cylinder(ship,.08,.08,1.7,x,3.5,z,edgeSteel,8);}
  const rail=cylinder(ship,.055,.055,35,x,4.2,2,edgeSteel,8);rail.rotation.x=Math.PI/2;
  for(let z=-12;z<18;z+=8){box(ship,1.1,.7,1.6,x*.86,2.15,z,deckMat);}
}
for(const x of [-8.8,8.8]){
  const cable=cylinder(ship,.065,.065,24,x,2.05,5,black,8);cable.rotation.x=Math.PI/2;
  cylinder(ship,.65,.65,.7,x,2.3,-11,darkSteel);
}
const guns=[];
const batteryMount=new THREE.Group();batteryMount.position.set(0,2,-3);ship.add(batteryMount);
cylinder(batteryMount,4.75,5.15,.7,0,.35,0,darkSteel,48);
cylinder(batteryMount,4.55,4.75,.65,0,1,0,steel,48);
for(let a=0;a<28;a++){const t=a*Math.PI*2/28;cylinder(batteryMount,.09,.09,.12,4.55*Math.sin(t),1.35,4.55*Math.cos(t),edgeSteel,8);}
const turretYaw=new THREE.Group();turretYaw.position.y=1.25;batteryMount.add(turretYaw);
const armorPlan=new THREE.Shape();armorPlan.moveTo(-4.5,3);armorPlan.lineTo(-4.5,-1.7);armorPlan.lineTo(-3.65,-3.1);armorPlan.lineTo(3.65,-3.1);armorPlan.lineTo(4.5,-1.7);armorPlan.lineTo(4.5,3);armorPlan.closePath();
const armorHouse=new THREE.Mesh(new THREE.ExtrudeGeometry(armorPlan,{depth:2.55,bevelEnabled:true,bevelThickness:.22,bevelSize:.22,bevelSegments:1,steps:1}),steel);armorHouse.rotation.x=Math.PI/2;armorHouse.position.y=3.0;armorHouse.castShadow=true;armorHouse.receiveShadow=true;turretYaw.add(armorHouse);
box(turretYaw,7.6,.13,5.2,0,3.23,.15,edgeSteel);
for(const x of [-4.55,4.55]){box(turretYaw,.14,1.35,2.7,x,1.8,.7,darkSteel);box(turretYaw,.3,.7,1.0,x,2.8,1.7,darkSteel);}
const turretElevation=new THREE.Group();turretElevation.position.set(0,1.95,-2.7);turretYaw.add(turretElevation);
const MUZZLE_Z=-9.8;
for(let i=0;i<3;i++){
  const barrel=new THREE.Group();barrel.position.x=(i-1)*2.15;turretElevation.add(barrel);
  const breech=cylinder(barrel,.73,.82,1.3,0,0,-.3,darkSteel,24);breech.rotation.x=-Math.PI/2;
  const tube=cylinder(barrel,.43,.67,9.0,0,0,-5.1,steel,32);tube.rotation.x=-Math.PI/2;
  for(const [z,r] of [[-1.3,.66],[-2.1,.61],[-4.8,.54],[-8.9,.45]])ring(barrel,r,.05,0,0,z);
  ring(barrel,.44,.09,0,0,-9.65,edgeSteel);
  const muzzle=mesh(new THREE.CircleGeometry(.35,24),black,barrel,0,0,-9.69);muzzle.rotation.y=Math.PI;
  for(const x of [-.6,.6]){const piston=cylinder(barrel,.1,.13,2.5,x,-.42,-1.1,edgeSteel,12);piston.rotation.x=Math.PI/2;}
  const plate=canvasTexture((ctx,s)=>{ctx.fillStyle='#2b3436';ctx.fillRect(0,0,s,s);ctx.fillStyle='#e4d6b7';ctx.textAlign='center';ctx.font=`bold ${s*.5}px Georgia`;ctx.fillText(`0${i+1}`,s/2,s*.7);},128);
  box(turretYaw,1,.48,.035,(i-1)*2.15,1.9,3.25,new THREE.MeshStandardMaterial({map:plate,roughness:.7}));
  const flash=new THREE.PointLight(0xffbd64,0,26,2);barrel.add(flash);flash.position.set(0,0,MUZZLE_Z);
  guns.push({base:batteryMount,swivel:turretYaw,pitch:turretElevation,barrel,flash,cooldown:0,recoil:0,index:i});
}

const smokeTex=canvasTexture((ctx,s)=>{const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'rgba(239,233,215,.9)');g.addColorStop(.25,'rgba(202,207,202,.65)');g.addColorStop(.6,'rgba(171,181,183,.28)');g.addColorStop(1,'rgba(150,170,178,0)');ctx.fillStyle=g;ctx.fillRect(0,0,s,s);},64);
const flameTex=canvasTexture((ctx,s)=>{const g=ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);g.addColorStop(0,'rgba(255,255,231,1)');g.addColorStop(.18,'rgba(255,232,131,1)');g.addColorStop(.38,'rgba(255,152,36,.8)');g.addColorStop(.7,'rgba(208,74,5,.3)');g.addColorStop(1,'rgba(135,25,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,s,s);},64);
const effects=[],shots=[],enemies=[];
const shellGeo=new THREE.SphereGeometry(.19,8,6);
const shellMaterials=[0xffd68a,0xfff2cf,0xffa452].map(color=>new THREE.MeshBasicMaterial({color}));
const energyMaterial=new THREE.MeshBasicMaterial({color:0x75deff,transparent:true,opacity:.76});
for(const g of guns){
  g.energy=[];
  for(const z of [-1.9,-3.9,-5.8]){const r=ring(g.barrel,.72,.055,0,0,z,energyMaterial);r.castShadow=false;r.visible=false;g.energy.push(r);}
}
const WEAPONS=[
  {name:'通常砲弾',damage:1,speed:160,critical:3},
  {name:'徹甲弾',damage:2,speed:200,critical:2.4},
  {name:'炸裂弾',damage:4,speed:175,critical:1.9,splash:13},
  {name:'電磁砲',damage:8,speed:480,critical:1.6,beam:0x94e4f3},
  {name:'光子主砲',damage:14,speed:900,critical:1.4,beam:0x69dbff},
];
const kit={THREE,steel,darkSteel,edgeSteel,deckMat,wood,black,bronze,box,cylinder,ring,mesh};
const keys=new Set();
let gameTime=0,elapsed=0,started=false,paused=false,finished=true;
let hp=100,maxHP=100,kills=0,wave=0,waveWait=0,selected=1,yaw=0,pitch=-.018,shake=0,damage=0,toastTime=0;
let activeArea=clamp(campaign.state.unlockedArea,1,AREAS.length),chosenArea=activeArea;
let uiMode='title',harborTab='map',aimPointer=null,holdFire=false,salvoQueue=[],specialUsed=false,charge=null;
let stats={shots:0,hits:0,kills:0,killScore:0,time:0,hull:100};
let lastResult=null,enemyCounter=0,morseCooldown=0,energyFlash=0;
let dragonUses=0,fuelTimer=0,selectedContact=null,bombDepth=50,auxiliary=null;
let worldPart=AREAS[chosenArea-1].part||1;
const tempV=new THREE.Vector3();
const weapon=()=>WEAPONS[campaign.state.upgrades.weapon];
const reloadTime=()=>2.7*Math.pow(.82,campaign.state.upgrades.reload)*(threats.stats.sonarOn&&campaign.state.upgrades.sonar===1?2:1);
const detectionRange=()=>[180,280,400,650][campaign.state.upgrades.radar||0];
const threats=new NavalThreats({scene,audio,onDamage:damageHull,onAirKill:(score)=>{stats.airKills=(stats.airKills||0)+1;stats.airScore=(stats.airScore||0)+score;},onSubKill:(e)=>sinkEnemy(e,false,true),onEffect:(position,type,power=1)=>{if(type==='splash')splash(position,power);else if(type==='blast'){blast(position,power);puff(position,4,0x62656b,power);}else puff(position,2,0xcfe1e8,.3,true);},consume:(kind,n=1)=>campaign.consume(kind,n),getUpgrades:()=>campaign.state.upgrades,getAim:()=>{
  const direction=camera.getWorldDirection(new THREE.Vector3());
  const contact=threats.contacts.find(c=>c.detected&&c.id===selectedContact);
  const surfaceDistance=direction.y<-.001?-camera.position.y/direction.y:150;
  const point=camera.position.clone().addScaledVector(direction,clamp(surfaceDistance,15,350));point.y=-bombDepth/10;
  return {origin:new THREE.Vector3(0,3,-12),direction,targetPoint:campaign.state.upgrades.asw>1&&contact?contact.position.clone():point};
}});
function syncAuxiliary(){
  if(auxiliary){ship.remove(auxiliary);const geometry=new Set(),materials=new Set();auxiliary.traverse(n=>{if(n.geometry)geometry.add(n.geometry);if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);});for(const g of geometry)g.dispose();for(const m of materials)m.dispose();}
  auxiliary=createAuxiliaryMounts(campaign.state.upgrades);ship.add(auxiliary);
}
function toast(message,duration=1.8){$('message').textContent=message;toastTime=duration;$('message').style.opacity='1';}
function setScreen(mode){
  uiMode=mode;
  for(const [id,screen] of [['start','title'],['harbor','harbor'],['pausePanel','pause'],['end','result']])$(id).classList.toggle('hidden',screen!==mode);
  document.body.classList.toggle('playing',mode==='battle'||mode==='pause');
  paused=mode==='pause';
}
function updateSaveSummary(){
  $('saveSummary').textContent=`全5部 · 制圧 ${campaign.state.conquered.length} / ${AREAS.length}海域 · 保有 ${campaign.state.credits.toLocaleString()} C`;
}
const supplyNames={shell:'主砲弾',aa:'対空弾',asw:'対潜弾',dragon:'龍神弾',fuel:'燃料'};
function renderWorldMap(){
  const project=(lon,lat)=>[(((lon%360)+360)%360)/360*1000,(80-lat)/140*430];
  const points=(list)=>list.map(p=>project(...p).map(v=>v.toFixed(1)).join(',')).join(' ');
  const land=(WORLD.landmasses||[]).map(l=>`<polygon points="${points(l.points)}" fill="${l.nation==='akatsuwa'?'#927344':'#293f48'}" stroke="#6f8b9055" stroke-width="1.2"/>`).join('');
  const route=AREAS.map(a=>project(a.lon,a.lat));
  const path=route.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const captured=new Set(campaign.state.conquered);
  const nodes=AREAS.map(a=>{const [x,y]=project(a.lon,a.lat),held=captured.has(a.id),selected=a.id===chosenArea;const tile=Array.from({length:6},(_,i)=>`${(x+13*Math.cos(i*Math.PI/3)).toFixed(1)},${(y+13*Math.sin(i*Math.PI/3)).toFixed(1)}`).join(' ');return `${held?`<polygon points="${tile}" fill="#48b89766" stroke="#75d1b0"/>`:''}<g data-map-area="${a.id}"><circle cx="${x}" cy="${y}" r="${selected?8:4.5}" fill="${selected?'#f2c47f':held?'#62c5a5':a.id>campaign.state.unlockedArea?'#6c707f':'#f0a974'}" stroke="#101c26" stroke-width="2"/><title>${a.id}. ${a.name}${held?'・制圧済み':''}</title></g>`;}).join('');
  $('worldMap').innerHTML=`<svg viewBox="0 0 1000 430" role="img" aria-label="架空世界の作戦経路と制圧海域"><defs><linearGradient id="mapSea" x2="1" y2="1"><stop stop-color="#102638"/><stop offset="1" stop-color="#193d46"/></linearGradient></defs><rect width="1000" height="430" fill="url(#mapSea)"/>${Array.from({length:7},(_,i)=>`<path d="M0 ${i*70}H1000" stroke="#7195a015"/>`).join('')}${land}<path d="${path}" fill="none" stroke="#d5b67d66" stroke-width="1.8" stroke-dasharray="4 5"/>${nodes}<text x="455" y="255" fill="#8ba6b1" font-size="18" letter-spacing="7">蒼環洋</text><text x="790" y="210" fill="#8ba6b1" font-size="13">黎明大陸</text></svg>`;
}
function renderSupplies(){
  const stock=campaign.state.stock;
  $('supplyCards').innerHTML=Object.entries(CONSUMABLES).map(([kind,item])=>`<article class="shop-card supply-card"><small>SUPPLY / 保有 ${stock[kind]}</small><h3>${item.name}</h3><p>${item.description||`${supplyNames[kind]}を${item.amount}補給します。`}</p><button data-supply="${kind}" ${campaign.state.credits<item.price?'disabled':''}>+${item.amount} / ${item.price.toLocaleString()} C</button></article>`).join('');
  const emergency=campaign.canEmergencyResupply();$('emergencySupply').disabled=!emergency.ok;$('emergencyStatus').textContent=emergency.reason;
}
function renderHarbor(){
  const state=campaign.state;
  $('credits').textContent=`${state.credits.toLocaleString()} C`;
  for(const [id,tab] of [['mapTab','map'],['shopTab','shop'],['supplyTab','supply']])$(id).classList.toggle('active',harborTab===tab);
  for(const [id,tab] of [['mapView','map'],['shopView','shop'],['supplyView','supply']])$(id).classList.toggle('hidden',harborTab!==tab);
  $('worldView').classList.toggle('hidden',harborTab!=='map');
  $('partTabs').innerHTML=WORLD.parts.map(p=>`<button data-part="${p.id}" class="${worldPart===p.id?'active':''}">第${p.id}部</button>`).join('');
  const part=WORLD.parts.find(p=>p.id===worldPart);$('partStory').textContent=`${part.title} — ${part.story}`;
  $('mapList').innerHTML=AREAS.filter(a=>a.part===worldPart).map(a=>`<button class="area-card ${a.id===chosenArea?'selected':''} ${a.id>state.unlockedArea?'locked':''}" data-area="${a.id}"><span>${String(a.id).padStart(2,'0')}</span><strong>${a.name}</strong><small>${state.conquered.includes(a.id)?'制圧済':a.id>state.unlockedArea?'未解放':'出撃可能'}</small></button>`).join('');
  const area=AREAS[chosenArea-1];
  $('areaNumber').textContent=`第${area.part}部 / OPERATION ${String(area.id).padStart(2,'0')} / ${area.waves.length} WAVES`;$('areaName').textContent=area.name;$('briefing').textContent=area.briefing;
  const kinds=[...new Set(area.waves.flat().map(e=>e.kind))];
  $('enemyList').innerHTML=kinds.map(k=>`<span>${ENEMY_TYPES[k].name}</span>`).join('')+(area.airRaid?.some(n=>n>0)?`<span>爆撃機 ${area.airRaid.reduce((a,b)=>a+b,0)}機</span>`:'');
  const record=state.records[String(area.id)];
  $('areaRecord').textContent=record?`最高 ${record.bestScore.toLocaleString()}点 · 命中 ${record.bestAccuracy}% · 評価 ${record.rank} · 制圧 ${record.victories}回`:'未制圧の海域。勝利すると次の海域が解放されます。';
  $('loadout').textContent=`主砲：${weapon().name} / 装填 ${reloadTime().toFixed(2)}秒 / 艦体 ${100+state.upgrades.armor*30} / ${Object.entries(state.stock).map(([k,n])=>`${supplyNames[k]} ${n}`).join(' · ')}`;
  const deploy=campaign.canDeploy(chosenArea);$('deploy').disabled=!deploy.ok;$('deploymentStatus').textContent=deploy.ok?'装備・補給確認完了。出撃できます。':deploy.reason;$('deploymentStatus').classList.toggle('warning',!deploy.ok);
  const categories={weapon:'MAIN BATTERY / 主砲',reload:'LOADER / 装填',armor:'ARMOR / 艦体',special:'SPECIAL / 必殺技',aa:'AIR DEFENSE / 対空',radar:'FIRE CONTROL / レーダー',sonar:'DETECTION / ソナー',asw:'ANTI SUB / 対潜'};
  $('shopCards').innerHTML=Object.keys(UPGRADES).map(kind=>{
    const item=campaign.nextUpgrade(kind);
    if(!item)return `<article class="shop-card"><small>${categories[kind]}</small><h3>${kind==='weapon'?weapon().name:kind==='special'?'龍神砲':'最終強化'}</h3><p>この装備は最大まで強化済みです。</p><span class="maxed">装備済み</span></article>`;
    const locked=state.unlockedArea<item.unlockArea;
    const label=locked?`第${item.unlockArea}海域で解放`:state.credits<item.price?`${item.price.toLocaleString()} C · 資金不足`:`${item.price.toLocaleString()} C で購入`;
    return `<article class="shop-card"><small>${categories[kind]} · Lv.${item.level}</small><h3>${item.name}</h3><p>${item.description}</p><button data-buy="${kind}" ${campaign.canBuy(kind)?'':'disabled'}>${label}</button></article>`;
  }).join('');
  renderWorldMap();renderSupplies();
  updateSaveSummary();
}
function openHarbor(tab='map'){
  holdFire=false;aimPointer=null;keys.clear();salvoQueue=[];finished=true;charge=null;
  campaign.save();
  audio.pause(false);cleanupBattle();harborTab=tab;worldPart=AREAS[chosenArea-1].part;setScreen('harbor');renderHarbor();$('shopMessage').textContent='';
}
function makeEnemy(x,z,kind,depth){
  const model=createWarship(kind,kit);const scale=AREAS[activeArea-1].enemyScale||1,original=ENEMY_TYPES[kind];const spec={...original,hp:original.hp*scale,damage:original.damage*Math.sqrt(scale),attackInterval:original.attackInterval/Math.sqrt(scale),score:Math.round(original.score*scale)};
  model.root.position.set(x,0,z);scene.add(model.root);
  const marker=document.createElement('div');marker.className='enemy-marker';marker.innerHTML=`<span>${spec.name}</span><div class="enemy-hp"><i></i></div>`;$('markers').append(marker);
  const e={...model,id:++enemyCounter,kind,spec,marker,hp:spec.hp,maxHP:spec.hp,attack:spec.attackInterval+Math.random()*2,phase:Math.random()*10,sinking:0,dead:false,removed:false,smokeTimer:0,depth:depth??8,detected:kind!=='submarine'};
  enemies.push(e);threats.registerShip(e);return e;
}
function removeEnemy(e){
  if(e.removed)return;scene.remove(e.root);e.marker.remove();
  e.root.traverse(node=>{if(node.isMesh)node.geometry.dispose();});
  for(const mat of e.ownedMaterials)mat.dispose();for(const tex of e.ownedTextures)tex.dispose();e.removed=true;
}
function spawnWave(){
  wave++;waveWait=0;const area=AREAS[activeArea-1];
  for(const position of area.waves[wave-1])makeEnemy(position.x,position.z,position.kind,position.depth);
  if(area.airRaid?.[wave-1])threats.spawnAirRaid(area.airRaid[wave-1]);
  $('wave').textContent=`第${area.part}部 · ${area.id}海域 · ${wave}/${area.waves.length}波`;
  toast(wave===1?`第${area.id}海域　${area.name}`:'敵の増援を捕捉',2.8);
  audio.morse('CQ');
}
function cleanupBattle(){
  threats.reset();selectedContact=null;
  for(const e of enemies)removeEnemy(e);enemies.length=0;
  for(const s of shots)scene.remove(s.ball);shots.length=0;
  for(const e of effects)removeEffect(e);effects.length=0;
}
function beginArea(id=chosenArea){
  const parsed=Number(id);if(!Number.isInteger(parsed)||parsed<1||parsed>campaign.state.unlockedArea)return false;
  const check=campaign.canDeploy(parsed);if(!check.ok){$('shopMessage').textContent=check.reason;toast(check.reason,3);return false;}
  audio.pause(false);cleanupBattle();activeArea=chosenArea=parsed;
  maxHP=100+campaign.state.upgrades.armor*30;hp=maxHP;kills=0;wave=0;waveWait=0;gameTime=0;
  yaw=0;pitch=-.018;shake=0;damage=0;energyFlash=0;finished=false;started=true;paused=false;holdFire=false;aimPointer=null;salvoQueue=[];specialUsed=false;charge=null;keys.clear();morseCooldown=0;
  stats={shots:0,hits:0,kills:0,killScore:0,time:0,hull:100,airKills:0,airScore:0};lastResult=null;dragonUses=0;fuelTimer=0;syncAuxiliary();
  for(const g of guns){g.cooldown=0;g.recoil=0;}
  selected=1;const area=AREAS[activeArea-1];scene.fog.color.setHex(area.fogTint);waterMat.uniforms.seaTint.value.setHex(area.seaTint);waterMat.uniforms.fogTint.value.copy(scene.fog.color);
  setScreen('battle');updateHullHUD();spawnWave();return true;
}
function updateCamera(){
  ship.position.y=Math.sin(elapsed*.7)*.09;ship.rotation.z=Math.sin(elapsed*.49)*.0025;
  camera.position.set(0,13+ship.position.y,9.5);camera.rotation.order='YXZ';
  camera.rotation.set(pitch+(Math.random()-.5)*shake*.013,yaw+(Math.random()-.5)*shake*.008,Math.sin(elapsed*.49)*.002);
  const merge=charge?clamp(charge.time/1.25,0,1)*(charge.fired?clamp(1-(charge.time-1.4)/.9,0,1):1):0;
  turretYaw.rotation.y=yaw;turretElevation.rotation.x=pitch+.012;
  for(const g of guns){
    g.barrel.position.z=g.recoil*.82;g.flash.intensity=g.recoil>.75?35:0;
    for(const r of g.energy)r.visible=campaign.state.upgrades.weapon>=3||merge>0;
  }
  camera.updateMatrixWorld(true);
}
function weakPosition(e){return e.root.localToWorld(e.weakOffset.clone());}
function findTarget(){
  let best=null,bestDist=campaign.state.upgrades.radar>=3?.22:.16;
  for(const e of enemies){if(e.dead||e.kind==='submarine'||camera.position.distanceTo(e.root.position)>detectionRange())continue;const p=weakPosition(e).project(camera);if(p.z<-1||p.z>1)continue;const d=Math.hypot(p.x,p.y);if(d<bestDist){best=e;bestDist=d;}}
  return best;
}
function removeEffect(e){
  scene.remove(e.object);e.object.traverse(node=>{if(node.material){for(const m of (Array.isArray(node.material)?node.material:[node.material]))m.dispose();}if(e.geometry&&node.geometry)node.geometry.dispose();});
}
function effect(object,life,vel=new THREE.Vector3(),growth=0,gravity=0,geometry=false){
  if(effects.length>=260){removeEffect({object,geometry});return;}
  scene.add(object);effects.push({object,life,max:life,vel,growth,gravity,startScale:object.scale.clone(),geometry});
}
function puff(position,count=8,color=0xd0d4cf,power=1,water=false){
  for(let i=0;i<count;i++){
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeTex,color,transparent:true,opacity:.65,depthWrite:false}));sprite.position.copy(position);sprite.scale.setScalar((water?1.1:1.4)*power*(.6+Math.random()));
    const vel=new THREE.Vector3((Math.random()-.5)*5*power,water?3+Math.random()*13*power:1.1+Math.random()*3*power,(Math.random()-.5)*5*power);
    effect(sprite,water?1.6:2.5,vel,water?.22:.9,water?8:0);
  }
}
function blast(position,power=1){
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:flameTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));sprite.position.copy(position);sprite.scale.setScalar(4*power);effect(sprite,.17,new THREE.Vector3(),2.4);
}
function splash(position,power=1){
  const p=position.clone();p.y=.2;puff(p,12,0xe0eef0,power,true);
  const column=new THREE.Mesh(new THREE.ConeGeometry(.8*power,8*power,8),new THREE.MeshBasicMaterial({color:0xc7e5eb,transparent:true,opacity:.5,depthWrite:false}));column.position.copy(p).y=4*power;effect(column,.7,new THREE.Vector3(0,1,0),.65,0,true);
  const ripple=new THREE.Mesh(new THREE.RingGeometry(1,1.8,32),new THREE.MeshBasicMaterial({color:0xb4dfe6,transparent:true,opacity:.48,side:THREE.DoubleSide,depthWrite:false}));ripple.rotation.x=-Math.PI/2;ripple.position.copy(p);effect(ripple,1.7,new THREE.Vector3(),6,0,true);
  audio.impact(clamp(p.x/80,-1,1),true);
}
function beamBetween(from,to,color=0x74ddff,radius=.17,life=.24){
  const delta=to.clone().sub(from),len=delta.length();if(len<.01)return;
  const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius,1,8),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));m.position.copy(from).add(to).multiplyScalar(.5);m.scale.y=len;m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());effect(m,life,new THREE.Vector3(),.03,0,true);
}
function fire(index=selected){
  if(uiMode!=='battle'||finished||charge)return false;
  const g=guns[index];if(!g||g.cooldown>0)return false;
  if(!campaign.consume('shell')){toast('主砲弾切れ。補給のため撤退します。',2);if(!shots.some(s=>!s.enemy))endGame(false,'主砲弾切れ・撤退');return false;}
  const w=weapon();g.cooldown=reloadTime();g.recoil=1;shake=Math.min(2.1,shake+.8);stats.shots++;
  scene.updateMatrixWorld(true);const origin=g.barrel.localToWorld(new THREE.Vector3(0,0,MUZZLE_Z));const target=findTarget();
  let dest;
  if(target){dest=weakPosition(target);if(campaign.state.upgrades.radar>=3)dest.z+=target.spec.speed*origin.distanceTo(dest)/w.speed;}else{camera.getWorldDirection(tempV);dest=camera.position.clone().addScaledVector(tempV,w.beam?320:180);}
  blast(origin,w.beam?1.5:1.15);puff(origin,7,0xc5c6bb,.55);
  if(w.beam){
    const direction=dest.clone().sub(origin).normalize();const far=origin.clone().addScaledVector(direction,520);
    const impacts=enemies.filter(e=>!e.dead&&e.kind!=='submarine').map(e=>({e,point:shipIntersection(origin,far,e)})).filter(x=>x.point).sort((a,b)=>a.point.distanceTo(origin)-b.point.distanceTo(origin));
    const hit=impacts[0];const end=hit?hit.point:far;
    beamBetween(origin,end,w.beam,campaign.state.upgrades.weapon===4?.38:.1,.32);beamBetween(origin,end,0xe4ffff,.07,.2);audio.beam((index-1)*.55);energyFlash=.18;
    if(hit){stats.hits++;hitEnemy(hit.e,target===hit.e?weakPosition(hit.e):hit.point,w.damage);}
    else {end.y=.2;splash(end,1.3);}
    return true;
  }
  const velocity=dest.clone().sub(origin);const t=velocity.length()/w.speed;velocity.divideScalar(t);velocity.y+=.5*5*t;
  const ball=new THREE.Mesh(shellGeo,shellMaterials[campaign.state.upgrades.weapon]);ball.position.copy(origin);if(w.splash)ball.scale.setScalar(1.5);scene.add(ball);
  shots.push({ball,velocity,life:12,enemy:false,prev:origin.clone(),damage:w.damage,splash:w.splash||0,target:target?.id,proximity:campaign.state.upgrades.radar>=3?3.5:0});audio.fire((index-1)*.55);return true;
}
function salvo(){
  if(uiMode!=='battle'||finished||charge)return false;
  let n=0;for(let i=0;i<3;i++)if(guns[i].cooldown<=0&&!salvoQueue.some(q=>q.index===i)){salvoQueue.push({index:i,delay:n*.09});n++;}
  if(n)toast(n===3?'3門斉射':`${n}門発射`,1);else toast('装填中',.7);return n>0;
}
function enemyFire(e){
  const muzzle=e.muzzleOffsets[Math.floor(Math.random()*e.muzzleOffsets.length)]||new THREE.Vector3(0,3,8);
  const origin=e.root.localToWorld(muzzle.clone());const target=new THREE.Vector3((Math.random()-.5)*12,2.7,0);
  const velocity=target.sub(origin);const t=velocity.length()/76;velocity.divideScalar(t);velocity.y+=.5*5*t;
  const ball=new THREE.Mesh(shellGeo,shellMaterials[0]);ball.position.copy(origin);scene.add(ball);shots.push({ball,velocity,life:7,enemy:true,damage:e.spec.damage,prev:origin.clone()});blast(origin,.6);
}
function sinkEnemy(e,critical=false,notify=true){
  if(e.dead)return false;e.dead=true;e.root.visible=true;e.sinking=0;kills++;stats.kills=kills;stats.killScore+=e.spec.score;e.marker.remove();
  const weak=weakPosition(e);if(e.kind==='submarine')weak.y=.5;puff(weak,12,0x565b58,1.8);blast(weak,2.1);audio.sinking(clamp(e.root.position.x/80,-1,1),camera.position.distanceTo(e.root.position)*10);
  if(notify){toast(critical?'機関部直撃 · 敵艦撃沈！':'敵艦撃沈！',1.6);audio.sunk();if(morseCooldown<=0){audio.morse('SUNK');morseCooldown=2.7;}}
  return true;
}
function hitEnemy(e,point,amount=weapon().damage){
  if(e.dead)return false;const weak=weakPosition(e);const critical=point.distanceTo(weak)<2.6;
  e.hp-=amount*(critical?weapon().critical:1);shake=Math.max(shake,.2);
  blast(point,1.2);puff(point,7,0x7c7d77,1.0);audio.impact(clamp(e.root.position.x/80,-1,1),false);
  if(e.hp<=0)sinkEnemy(e,critical);else{e.marker.querySelector('i').style.width=`${e.hp/e.maxHP*100}%`;toast(critical?'機関部直撃':'命中',.7);}return true;
}
function updateHullHUD(){
  $('hpText').textContent=`${Math.ceil(hp)}/${maxHP}`;$('hpBar').style.width=`${hp/maxHP*100}%`;$('hpBar').style.background=hp/maxHP<.3?'#d98563':'#b6cbbc';
}
function damageHull(amount=8){
  if(finished)return;hp=Math.max(0,hp-amount);damage=.85;shake=Math.min(2,shake+.7);updateHullHUD();audio.impact(0,false);if(hp<=0)endGame(false);
}
function shipIntersection(from,to,e){
  // Long hulls use a box rather than one enormous sphere, keeping near misses honest.
  const a=e.root.worldToLocal(from.clone()),b=e.root.worldToLocal(to.clone());const d=b.clone().sub(a),length=d.length();if(length<.001)return null;
  const box=new THREE.Box3(new THREE.Vector3(-e.hullWidth/2-.25,.15,-e.hullLength/2),new THREE.Vector3(e.hullWidth/2+.25,e.markerHeight-2,e.hullLength/2));
  const hit=new THREE.Ray(a,d.normalize()).intersectBox(box,new THREE.Vector3());if(!hit||hit.distanceTo(a)>length)return null;return e.root.localToWorld(hit);
}
function cleanShot(i){scene.remove(shots[i].ball);shots.splice(i,1);}
function fireDragon(){
  const limit=campaign.state.upgrades.special>=2?2:1;
  if(uiMode!=='battle'||finished||charge||!campaign.state.upgrades.special||dragonUses>=limit||(!enemies.some(e=>!e.dead&&e.kind!=='submarine')&&!threats.stats.airborne))return false;
  if(!campaign.consume('dragon')){toast('龍神弾がありません。港で補給してください。');return false;}
  dragonUses++;specialUsed=dragonUses>=limit;holdFire=false;salvoQueue=[];charge={time:0,fired:false};yaw=0;pitch=-.018;audio.special();audio.announce('三連装、連結。龍神砲、発射準備。');toast(`龍神砲 充填 · ${dragonUses}/${limit}回`,2);return true;
}
function dragonBlast(){
  const start=new THREE.Vector3(0,4.8,-8);const target=start.clone().add(new THREE.Vector3(0,2,-450));
  for(const g of guns){const from=g.barrel.localToWorld(new THREE.Vector3(0,0,MUZZLE_Z));beamBetween(from,start,0x81f6e6,.3,.8);g.recoil=1;g.cooldown=reloadTime();}
  beamBetween(start,target,0x55dfeb,3.6,1.3);beamBetween(start,target,0xd7ffff,1.4,.9);
  for(let side=0;side<2;side++){
    const points=[];for(let j=0;j<=32;j++){const z=-8-j*11;points.push(new THREE.Vector3(Math.sin(j*.5+side*Math.PI)*5,5.4+Math.cos(j*.5+side*Math.PI)*2,z));}
    const dragon=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),48,.65,5,false),new THREE.MeshBasicMaterial({color:side?0xf3dba0:0x63ffdd,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));effect(dragon,1.5,new THREE.Vector3(),0,0,true);
  }
  const crest=new THREE.Mesh(new THREE.ConeGeometry(4.5,16,7),new THREE.MeshBasicMaterial({color:0x7bffff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));crest.rotation.x=-Math.PI/2;crest.position.set(0,6,-33);effect(crest,1.1,new THREE.Vector3(0,0,-115),0,0,true);
  energyFlash=.9;shake=2.2;
  let sunk=0;for(const e of enemies)if(!e.dead&&e.kind!=='submarine'){sinkEnemy(e,false,false);splash(e.root.position,1.6);sunk++;}
  const planes=threats.dragonSweep();
  toast(`龍神砲　敵艦${sunk}隻・航空機${planes}機撃破`,2.8);if(sunk)audio.sunk();audio.morse('SUNK');morseCooldown=2.7;
}
function tick(dt){
  gameTime+=dt;morseCooldown=Math.max(0,morseCooldown-dt);
  fuelTimer+=dt;while(fuelTimer>=1){fuelTimer--;campaign.consume('fuel');}
  if(campaign.state.stock.fuel<=0){endGame(false,'燃料切れ・撤退');return;}
  for(const g of guns){g.cooldown=Math.max(0,g.cooldown-dt);g.recoil=Math.max(0,g.recoil-dt*3.8);}
  if(charge){charge.time+=dt;if(!charge.fired&&charge.time>=1.4){charge.fired=true;scene.updateMatrixWorld(true);dragonBlast();}if(charge.time>2.5)charge=null;return;}
  for(const q of salvoQueue)q.delay-=dt;
  const due=salvoQueue.filter(q=>q.delay<=0);salvoQueue=salvoQueue.filter(q=>q.delay>0);for(const q of due)fire(q.index);
  if(holdFire)fire(selected);
  const rate=dt*.5;
  if(keys.has('ArrowLeft')||keys.has('a'))yaw+=rate;if(keys.has('ArrowRight')||keys.has('d'))yaw-=rate;
  if(keys.has('ArrowUp')||keys.has('w'))pitch+=rate*.48;if(keys.has('ArrowDown')||keys.has('s'))pitch-=rate*.48;
  yaw=clamp(yaw,-.78,.78);pitch=clamp(pitch,-.2,.13);
  for(const e of enemies){
    if(e.dead){e.sinking+=dt;e.root.position.y=-e.sinking*.8;e.root.rotation.z=e.sinking*.075;e.root.rotation.x=e.sinking*.025;if(e.sinking>7)removeEnemy(e);continue;}
    if(e.kind==='submarine')continue;
    e.phase+=dt;e.root.position.y=Math.sin(e.phase*1.4)*.24;e.root.rotation.z=Math.sin(e.phase)*.017;
    e.root.position.z+=dt*e.spec.speed;e.root.position.x+=Math.sin(e.phase*.28)*dt*(e.kind==='destroyer'?.8:.25);
    e.attack-=dt;if(e.attack<=0){if(!e.spec.launchCount)enemyFire(e);e.attack=e.spec.attackInterval*.8+Math.random()*3;}
    e.smokeTimer-=dt;if(e.smokeTimer<=0){for(const offset of e.smokeOffsets)puff(e.root.localToWorld(offset.clone()),1,0x6e7472,.5);e.smokeTimer=1.1;}
    if(e.root.position.z>-38){damageHull(e.spec.damage*1.5);e.root.position.z=-72;e.attack=2.8;toast('敵艦接近！',1);}
    if(finished)return;
  }
  threats.tick(dt,enemies);if(finished)return;
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.prev.copy(s.ball.position);s.velocity.y-=5*dt;s.ball.position.addScaledVector(s.velocity,dt);s.life-=dt;
    let hit=false;
    if(!s.enemy){
      for(const e of enemies){if(e.dead||e.kind==='submarine')continue;let point=shipIntersection(s.prev,s.ball.position,e);if(!point&&s.proximity){const weak=weakPosition(e);if(weak.distanceTo(s.ball.position)<s.proximity)point=weak;}if(!point)continue;
        stats.hits++;hitEnemy(e,s.target===e.id?weakPosition(e):point,s.damage);hit=true;
        if(s.splash){for(const other of enemies){if(other===e||other.dead||other.kind==='submarine')continue;if(other.root.position.distanceTo(e.root.position)<s.splash)hitEnemy(other,other.root.position.clone().add(new THREE.Vector3(0,3,0)),s.damage*.45);}}
        break;
      }
    } else if(s.ball.position.z>-13&&Math.abs(s.ball.position.x)<13&&s.ball.position.y<8){damageHull(s.damage);blast(s.ball.position,.8);puff(s.ball.position,5,0x7b7c72,.8);hit=true;}
    if(!hit&&(s.ball.position.y<.15||s.life<=0)){const pos=s.ball.position.clone();pos.y=.2;splash(pos,1.2);hit=true;}
    if(hit)cleanShot(i);if(finished)return;
  }
  const area=AREAS[activeArea-1];
  if(enemies.length&&enemies.every(e=>e.dead)&&threats.stats.airborne===0){
    waveWait+=dt;
    if(waveWait>3.5){if(wave>=area.waves.length){if(dragonUses>=(area.requiredDragonUses||0))endGame(true);else endGame(false,'作戦条件未達・撤退');}else{hp=Math.min(maxHP,hp+maxHP*.12);updateHullHUD();spawnWave();}}
  }
  if(finished)return;
  const alive=enemies.filter(e=>!e.dead),pending=shots.some(s=>!s.enemy)||!!charge;
  if(campaign.state.stock.shell<=0&&!pending&&alive.some(e=>e.kind!=='submarine'))endGame(false,'主砲弾切れ・撤退');
  else if(campaign.state.stock.aa<=0&&threats.stats.airborne>0)endGame(false,'対空弾切れ・撤退');
  else if(campaign.state.stock.asw<=0&&alive.some(e=>e.kind==='submarine')&&!threats.stats.aswActive)endGame(false,'対潜弾切れ・撤退');
}
function updateEffects(dt){
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;e.vel.y-=e.gravity*dt;e.object.position.addScaledVector(e.vel,dt);e.object.scale.copy(e.startScale).multiplyScalar(1+(e.max-e.life)*e.growth);
    e.object.traverse(node=>{if(node.material)for(const m of (Array.isArray(node.material)?node.material:[node.material]))m.opacity=clamp(e.life/e.max,0,1)*.7;});
    if(e.life<=0){removeEffect(e);effects.splice(i,1);}
  }
}
function updateHUD(){
  const target=findTarget();$('reticle').classList.toggle('locked',!!target);$('range').textContent=target?`${target.spec.name} ${Math.round(camera.position.distanceTo(target.root.position)*10)} m`:'照準を敵艦へ';$('weaponName').textContent=weapon().name;
  $('kills').textContent=`撃沈 ${kills} · 命中 ${stats.shots?Math.round(stats.hits/stats.shots*100):0}%`;
  for(const e of enemies){if(e.dead)continue;const p=e.root.position.clone();p.y=e.markerHeight+1;p.project(camera);const detected=e.kind==='submarine'?e.detected:camera.position.distanceTo(e.root.position)<=detectionRange();const visible=detected&&p.z>-1&&p.z<1&&Math.abs(p.x)<1.2&&Math.abs(p.y)<1.2;e.marker.style.display=visible?'block':'none';if(visible){e.marker.style.left=`${(p.x*.5+.5)*innerWidth}px`;e.marker.style.top=`${(-p.y*.5+.5)*innerHeight}px`;e.marker.querySelector('i').style.width=`${clamp(e.hp/e.maxHP,0,1)*100}%`;}}
  const buttons=document.querySelectorAll('.gun');guns.forEach((g,i)=>{const b=buttons[i];b.classList.toggle('selected',i===selected);b.classList.toggle('loading',g.cooldown>0);b.querySelector('span').textContent=g.cooldown>0?`${g.cooldown.toFixed(1)}秒`:'装填完了';b.querySelector('i').style.width=`${clamp(1-g.cooldown/reloadTime(),0,1)*100}%`;});
  $('fire').classList.toggle('reloading',guns[selected].cooldown>0);$('fire').querySelector('b').textContent=charge?'充填':guns[selected].cooldown>0?'装填':'発射';
  const limit=campaign.state.upgrades.special>=2?2:1,remaining=Math.max(0,limit-dragonUses);
  const ready=!!campaign.state.upgrades.special&&remaining>0&&campaign.state.stock.dragon>0&&uiMode==='battle'&&!finished&&!charge;
  $('special').disabled=!ready;$('special').classList.toggle('ready',ready);$('special').querySelector('small').textContent=!campaign.state.upgrades.special?'未装備':charge?'充填中':!remaining?'使用済み':!campaign.state.stock.dragon?'弾なし':`残り${remaining}回`;
  updateTacticalHUD();
}
function updateTacticalHUD(){
  const state=campaign.state,u=state.upgrades,t=threats.stats,contacts=threats.contacts.filter(c=>c.detected);
  $('supplyHUD').textContent=`主砲 ${state.stock.shell} · 対空 ${state.stock.aa} · 対潜 ${state.stock.asw} · 燃料 ${state.stock.fuel}`;
  $('threatStatus').textContent=`航空 ${t.airborne}機 · 撃墜 ${stats.airKills||0}機 · 潜水接触 ${contacts.length}`;
  $('tactical').classList.toggle('hidden',(!u.sonar&&!u.asw)||(uiMode!=='battle'&&uiMode!=='pause'));
  $('sonar').disabled=!u.sonar;$('sonar').textContent=!u.sonar?'ソナー未装備':`${['','パッシブ','アクティブ','ソノブイ'][u.sonar]} ${t.sonarOn?'ON':'OFF'}`;
  $('sonar').classList.toggle('active',t.sonarOn);
  const aswNames=['対潜未装備','爆雷','直進魚雷','誘導魚雷','アスロック'];$('asw').disabled=!u.asw||t.aswCooldown>0||!state.stock.asw;$('asw').textContent=`${aswNames[u.asw]}${t.aswCooldown>0?` ${Math.ceil(t.aswCooldown)}秒`:''}`;
  $('depthControl').classList.toggle('hidden',u.asw!==1);$('contact').disabled=!contacts.length;
  const selected=contacts.find(c=>c.id===selectedContact);$('contact').textContent=selected?`接触 ${Math.round(selected.position.length()*10)}m / 深度${Math.round(selected.depth)}m`:'潜水接触を選ぶ';
  $('radarScope').classList.toggle('hidden',!u.radar&&!u.sonar);
  const range=detectionRange(),dots=[];
  if(u.radar)for(const e of enemies)if(!e.dead&&e.kind!=='submarine'&&e.root.position.length()<range)dots.push({position:e.root.position,color:'#efb076'});
  for(const c of contacts)dots.push({position:c.position,color:c.id===selectedContact?'#ffdf7e':'#6df2c6'});
  $('radarScope').innerHTML=`<svg viewBox="0 0 100 100" aria-label="索敵表示"><circle cx="50" cy="50" r="46"/><circle cx="50" cy="50" r="23"/><path d="M4 50H96M50 4V96"/>${dots.map(d=>`<circle class="scope-dot" cx="${clamp(50+d.position.x/range*44,5,95)}" cy="${clamp(50+d.position.z/range*44,5,95)}" r="2.5" style="fill:${d.color}"/>`).join('')}<path class="self" d="M50 46l-3 7h6z"/></svg><span>${u.radar>=3?'射撃管制 / VT':t.sonarOn?'SONAR':'RADAR'} ${range*10}m</span>`;
}
function selectSubContact(){
  const contacts=threats.contacts.filter(c=>c.detected);if(!contacts.length){toast('潜水接触なし。ソナーで索敵してください。');return;}
  const index=contacts.findIndex(c=>c.id===selectedContact),c=contacts[(index+1)%contacts.length];selectedContact=c.id;
  const dx=c.position.x-camera.position.x,dz=c.position.z-camera.position.z;yaw=clamp(Math.atan2(-dx,-dz),-.78,.78);pitch=clamp(Math.atan2(-camera.position.y,Math.hypot(dx,dz)),-.2,.13);
  toast(`潜水接触 · 深度 ${Math.round(c.depth)}m`);
}
function toggleSonar(){
  if(uiMode!=='battle'||!campaign.state.upgrades.sonar)return;
  const before=threats.stats.sonarOn;threats.toggleSonar();const after=threats.stats.sonarOn;
  if(campaign.state.upgrades.sonar===1&&before!==after)for(const g of guns)g.cooldown*=after?2:.5;
  toast(after&&campaign.state.upgrades.sonar===1?'パッシブ索敵開始 · 主砲装填2倍':after?'索敵開始':'索敵停止');
}
function fireAntiSub(){if(uiMode!=='battle'||finished)return;audio.unlock();if(!selectedContact&&campaign.state.upgrades.asw>1)selectedContact=threats.contacts.find(c=>c.detected)?.id??null;const result=threats.fireASW();toast(result.reason||'対潜兵器、発射。');}
function endGame(won,reason='艦体大破'){
  if(finished)return;finished=true;holdFire=false;aimPointer=null;keys.clear();salvoQueue=[];charge=null;
  stats.time=gameTime;stats.hull=hp/maxHP*100;lastResult=campaign.settle(activeArea,stats,won);const area=AREAS[activeArea-1];
  setScreen('result');$('endEyebrow').textContent=won?'AREA CONQUERED':reason.includes('撤退')?'WITHDRAWAL':'MISSION FAILED';$('endTitle').textContent=won?(activeArea===AREAS.length?'全海域制圧':'海域制圧'):reason;$('endArea').textContent=`第${area.part}部 · 第${activeArea}海域 · ${area.name}`;
  const values=[['撃沈数',`${kills}`, '隻'],['得点',lastResult.score.toLocaleString(),'点'],['命中率',`${lastResult.accuracy}`,'%'],['発射 / 命中',`${stats.shots} / ${stats.hits}`,'砲撃'],['艦体耐久',`${Math.round(hp/maxHP*100)}`,'%'],['総合評価',lastResult.rank,`${Math.floor(gameTime)}秒`],['撃墜数',`${stats.airKills||0}`,'機'],['龍神砲',`${dragonUses}`,'回'],['残存燃料',`${campaign.state.stock.fuel}`,'単位']];
  $('endScore').innerHTML=values.map(([label,value,unit])=>`<div class="stat-value"><small>${label}</small><strong>${value}</strong><em>${unit}</em></div>`).join('');$('reward').textContent=`+${lastResult.reward.toLocaleString()} C`;
  $('nextArea').classList.toggle('hidden',!won||activeArea>=AREAS.length);$('toHarbor').textContent=won?'港で強化':'港で装備を見直す';
  if(won){audio.morse('VICTORY');audio.announce(activeArea===AREAS.length?'全海域、制圧完了。':'海域、制圧完了。');}
  updateSaveSummary();
}
function setPause(value){
  if(finished||!started||(value&&uiMode!=='battle')||(!value&&uiMode!=='pause'))return;
  holdFire=false;keys.clear();aimPointer=null;salvoQueue=[];audio.pause(value);setScreen(value?'pause':'battle');
}
async function start(){const promise=audio.unlock();started=true;chosenArea=clamp(campaign.state.unlockedArea,1,AREAS.length);openHarbor('map');await promise;}
$('startButton').addEventListener('click',start);
$('deploy').addEventListener('click',()=>beginArea(chosenArea));
$('mapTab').addEventListener('click',()=>{harborTab='map';renderHarbor();});$('shopTab').addEventListener('click',()=>{harborTab='shop';renderHarbor();});$('supplyTab').addEventListener('click',()=>{harborTab='supply';renderHarbor();});$('backToMap').addEventListener('click',()=>{harborTab='map';renderHarbor();});
$('partTabs').addEventListener('click',e=>{const button=e.target.closest('button[data-part]');if(!button)return;worldPart=Number(button.dataset.part);chosenArea=AREAS.find(a=>a.part===worldPart).id;renderHarbor();});
$('worldMap').addEventListener('click',e=>{const node=e.target.closest('[data-map-area]');if(!node)return;chosenArea=Number(node.dataset.mapArea);worldPart=AREAS[chosenArea-1].part;renderHarbor();});
$('mapList').addEventListener('click',e=>{const button=e.target.closest('button[data-area]');if(!button||button.disabled)return;chosenArea=Number(button.dataset.area);renderHarbor();});
$('shopCards').addEventListener('click',e=>{const button=e.target.closest('button[data-buy]');if(!button||button.disabled)return;const result=campaign.buy(button.dataset.buy);renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');});
$('supplyCards').addEventListener('click',e=>{const button=e.target.closest('button[data-supply]');if(!button||button.disabled)return;const result=campaign.buySupply(button.dataset.supply);renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');});
$('emergencySupply').addEventListener('click',()=>{const result=campaign.emergencyResupply();renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');});
$('sonar').addEventListener('click',()=>{audio.unlock();toggleSonar();});$('asw').addEventListener('click',fireAntiSub);$('contact').addEventListener('click',selectSubContact);$('depth').addEventListener('change',()=>{bombDepth=clamp(Number($('depth').value)||50,20,150);});
$('toHarbor').addEventListener('click',()=>openHarbor('shop'));$('nextArea').addEventListener('click',()=>{chosenArea=Math.min(activeArea+1,AREAS.length);openHarbor('map');});
$('restart').addEventListener('click',()=>beginArea(activeArea));$('restartPause').addEventListener('click',()=>beginArea(activeArea));$('toHarborPause').addEventListener('click',()=>{chosenArea=activeArea;openHarbor('map');});
$('pause').addEventListener('click',()=>setPause(true));$('resume').addEventListener('click',()=>setPause(false));
$('resetProgress').addEventListener('click',()=>{$('resetConfirm').classList.remove('hidden');});$('cancelReset').addEventListener('click',()=>{$('resetConfirm').classList.add('hidden');});
$('confirmReset').addEventListener('click',()=>{campaign.reset();chosenArea=1;worldPart=1;$('resetConfirm').classList.add('hidden');renderHarbor();$('shopMessage').textContent='新しい作戦を開始しました。';});
$('mute').addEventListener('click',()=>{if(uiMode!=='pause')audio.unlock();audio.setMuted(!audio.muted);$('mute').textContent=audio.muted?'音 OFF':'音 ON';});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch{}});
document.querySelectorAll('.gun').forEach(b=>b.addEventListener('click',()=>{if(uiMode!=='battle')return;selected=Number(b.dataset.gun);audio.unlock();}));
$('salvo').addEventListener('click',()=>{if(uiMode==='battle')audio.unlock();salvo();});$('special').addEventListener('click',()=>{if(uiMode==='battle')audio.unlock();fireDragon();});
$('fire').addEventListener('pointerdown',e=>{if(uiMode!=='battle'||charge)return;e.preventDefault();audio.unlock();$('fire').setPointerCapture(e.pointerId);holdFire=true;fire(selected);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('fire').addEventListener(name,()=>{holdFire=false;});
canvas.addEventListener('pointerdown',e=>{if(uiMode!=='battle'||finished||charge||aimPointer!==null)return;e.preventDefault();audio.unlock();aimPointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!aimPointer||aimPointer.id!==e.pointerId)return;const scale=1.35/Math.min(innerWidth,900);yaw-=(e.clientX-aimPointer.x)*scale;pitch-=(e.clientY-aimPointer.y)*scale*.6;aimPointer.x=e.clientX;aimPointer.y=e.clientY;yaw=clamp(yaw,-.78,.78);pitch=clamp(pitch,-.2,.13);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(aimPointer?.id===e.pointerId)aimPointer=null;});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(uiMode==='battle')setPause(true);else if(uiMode==='pause')setPause(false);return;}
  if(uiMode!=='battle')return;if([' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();if(e.repeat)return;keys.add(e.key);
  if(e.key===' '){audio.unlock();holdFire=true;fire(selected);}if(e.key.toLowerCase()==='f')salvo();if(e.key.toLowerCase()==='g')fireDragon();if(['1','2','3'].includes(e.key))selected=Number(e.key)-1;
  if(e.key.toLowerCase()==='v')toggleSonar();if(e.key.toLowerCase()==='h')fireAntiSub();if(e.key.toLowerCase()==='r')selectSubContact();
});
window.addEventListener('keyup',e=>{keys.delete(e.key);if(e.key===' ')holdFire=false;});
window.addEventListener('blur',()=>{holdFire=false;aimPointer=null;keys.clear();if(uiMode==='battle')setPause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&uiMode==='battle')setPause(true);});
window.addEventListener('pagehide',()=>{campaign.save();audio.pause(true);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<h?80:62;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();updateCamera();updateSaveSummary();syncAuxiliary();
$('loading').classList.add('hidden');
let frames=0,sample=0,adapted=false;
function animate(){
  requestAnimationFrame(animate);const raw=clock.getDelta(),dt=Math.min(raw,.04);
  if(!paused){elapsed+=dt;waterMat.uniforms.time.value=elapsed;updateEffects(dt);shake=Math.max(0,shake-dt*3.6);damage=Math.max(0,damage-dt*1.7);energyFlash=Math.max(0,energyFlash-dt*1.4);if(uiMode==='battle'&&!finished)tick(dt);if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('message').style.opacity='0';}}
  updateCamera();updateHUD();$('damage').style.opacity=damage.toFixed(3);$('energyFlash').style.opacity=energyFlash.toFixed(3);renderer.render(scene,camera);
  if(uiMode==='battle'&&!adapted){frames++;sample+=raw;if(sample>5){if(frames/sample<36){renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;resize();}adapted=true;}}
}
animate();
// Read-only diagnostic snapshot; play is controlled through the visible UI.
const snapshot=()=>({title:'弩級戦艦 朝日',started,paused,finished,screen:uiMode,hp,maxHP,kills,area:activeArea,wave,selected,gunCount:guns.length,cooldowns:guns.map(g=>g.cooldown),shots:shots.length,enemies:enemies.filter(e=>!e.dead).map(e=>({kind:e.kind,hp:e.hp})),effects:effects.length,stats:{...stats},specialUsed,upgrades:{...campaign.state.upgrades},credits:campaign.state.credits,unlockedArea:campaign.state.unlockedArea,conquered:[...campaign.state.conquered],viewport:[innerWidth,innerHeight]});
Object.defineProperty(window,'ASAHI',{get:snapshot});
