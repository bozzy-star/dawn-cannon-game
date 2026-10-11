import * as THREE from 'three';
import { CannonAudio } from './audio.js?v=asahi-v2';
import { AREAS, ENEMY_TYPES, UPGRADES, CampaignStore } from './campaign.js?v=asahi-v2';
import { createWarship } from './enemies.js?v=asahi-v2';

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
const envRT = pmrem.fromScene(envScene, .06, .1, 100);
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
for(let i=0;i<3;i++){
  const base=new THREE.Group();base.position.set((i-1)*5.0,2.0,-1.2);ship.add(base);
  cylinder(base,1.9,2.15,.4,0,.2,0,darkSteel,40);
  cylinder(base,1.7,1.9,.6,0,.65,0,steel,40);
  for(let a=0;a<12;a++){const t=a*Math.PI/6;cylinder(base,.09,.09,.1,1.65*Math.sin(t),.98,1.65*Math.cos(t),edgeSteel,8);}
  const swivel=new THREE.Group();swivel.position.y=.9;base.add(swivel);
  box(swivel,2.35,1.5,2.1,0,.8,.35,darkSteel);
  for(const x of [-1.28,1.28]){const trunnion=cylinder(swivel,.52,.52,.4,x,1.6,-.3,edgeSteel);trunnion.rotation.z=Math.PI/2;}
  const pitch=new THREE.Group();pitch.position.set(0,1.55,-.28);swivel.add(pitch);
  const barrel=new THREE.Group();pitch.add(barrel);
  box(barrel,1.55,1.5,1.9,0,0,.3,steel);
  const tube=cylinder(barrel,.61,.93,6.2,0,0,-3.35,steel,40);tube.rotation.x=-Math.PI/2;
  for(const [z,r] of [[-1.3,.83],[-2.1,.79],[-4.0,.69],[-6.25,.63]]){ring(barrel,r,.065,0,0,z);}
  ring(barrel,.61,.11,0,0,-6.45,edgeSteel);
  const muzzle=mesh(new THREE.CircleGeometry(.51,32),black,barrel,0,0,-6.46);muzzle.rotation.y=Math.PI;
  const bore=cylinder(barrel,.53,.53,.4,0,0,-6.24,darkSteel);bore.rotation.x=Math.PI/2;
  for(const x of [-.8,.8]){const piston=cylinder(barrel,.12,.16,3.2,x,-.5,-.75,edgeSteel,12);piston.rotation.x=Math.PI/2;}
  const wheel=ring(swivel,.42,.07,-1.62,.65,.75,bronze);wheel.rotation.y=Math.PI/2;
  for(let a=0;a<4;a++){const spoke=cylinder(swivel,.03,.03,.8,-1.62,.65,.75,bronze,8);spoke.rotation.x=a*Math.PI/4;spoke.rotation.z=Math.PI/2;}
  const plate=canvasTexture((ctx,s)=>{ctx.fillStyle='#2b3436';ctx.fillRect(0,0,s,s);ctx.fillStyle='#e4d6b7';ctx.textAlign='center';ctx.font=`bold ${s*.5}px Georgia`;ctx.fillText(`0${i+1}`,s/2,s*.7);},128);
  box(swivel,1,.48,.035,0,.7,1.42,new THREE.MeshStandardMaterial({map:plate,roughness:.7}));
  const flash=new THREE.PointLight(0xffbd64,0,26,2);barrel.add(flash);flash.position.set(0,0,-6.8);
  guns.push({base,swivel,pitch,barrel,flash,cooldown:0,recoil:0,index:i});
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
const tempV=new THREE.Vector3();
const weapon=()=>WEAPONS[campaign.state.upgrades.weapon];
const reloadTime=()=>2.7*Math.pow(.82,campaign.state.upgrades.reload);
function toast(message,duration=1.8){$('message').textContent=message;toastTime=duration;$('message').style.opacity='1';}
function setScreen(mode){
  uiMode=mode;
  for(const [id,screen] of [['start','title'],['harbor','harbor'],['pausePanel','pause'],['end','result']])$(id).classList.toggle('hidden',screen!==mode);
  document.body.classList.toggle('playing',mode==='battle'||mode==='pause');
  paused=mode==='pause';
}
function updateSaveSummary(){
  $('saveSummary').textContent=`制圧 ${campaign.state.conquered.length} / ${AREAS.length}海域 · 保有 ${campaign.state.credits.toLocaleString()} C`;
}
function renderHarbor(){
  const state=campaign.state;
  $('credits').textContent=`${state.credits.toLocaleString()} C`;
  $('mapTab').classList.toggle('active',harborTab==='map');$('shopTab').classList.toggle('active',harborTab==='shop');
  $('mapView').classList.toggle('hidden',harborTab!=='map');$('shopView').classList.toggle('hidden',harborTab!=='shop');
  $('mapList').innerHTML=AREAS.map(a=>`<button class="area-card ${a.id===chosenArea?'selected':''}" data-area="${a.id}" ${a.id>state.unlockedArea?'disabled':''}><span>0${a.id}</span><strong>${a.name}</strong><small>${state.conquered.includes(a.id)?'制圧済':a.id>state.unlockedArea?'未解放':'出撃可能'}</small></button>`).join('');
  const area=AREAS[chosenArea-1];
  $('areaNumber').textContent=`OPERATION 0${area.id} / 2 WAVES`;$('areaName').textContent=area.name;$('briefing').textContent=area.briefing;
  const kinds=[...new Set(area.waves.flat().map(e=>e.kind))];
  $('enemyList').innerHTML=kinds.map(k=>`<span>${ENEMY_TYPES[k].name}</span>`).join('');
  const record=state.records[String(area.id)];
  $('areaRecord').textContent=record?`最高 ${record.bestScore.toLocaleString()}点 · 命中 ${record.bestAccuracy}% · 評価 ${record.rank} · 制圧 ${record.victories}回`:'未制圧の海域。勝利すると次の海域が解放されます。';
  $('loadout').textContent=`主砲：${weapon().name} / 装填 ${reloadTime().toFixed(2)}秒 / 艦体 ${100+state.upgrades.armor*30}${state.upgrades.special?' / 龍神砲 装備済':''}`;
  const categories={weapon:'MAIN BATTERY / 主砲',reload:'LOADER / 装填',armor:'ARMOR / 艦体',special:'SPECIAL / 必殺技'};
  $('shopCards').innerHTML=Object.keys(UPGRADES).map(kind=>{
    const item=campaign.nextUpgrade(kind);
    if(!item)return `<article class="shop-card"><small>${categories[kind]}</small><h3>${kind==='weapon'?weapon().name:kind==='special'?'龍神砲':'最終強化'}</h3><p>この装備は最大まで強化済みです。</p><span class="maxed">装備済み</span></article>`;
    const locked=state.unlockedArea<item.unlockArea;
    const label=locked?`第${item.unlockArea}海域で解放`:state.credits<item.price?`${item.price.toLocaleString()} C · 資金不足`:`${item.price.toLocaleString()} C で購入`;
    return `<article class="shop-card"><small>${categories[kind]} · Lv.${item.level}</small><h3>${item.name}</h3><p>${item.description}</p><button data-buy="${kind}" ${campaign.canBuy(kind)?'':'disabled'}>${label}</button></article>`;
  }).join('');
  updateSaveSummary();
}
function openHarbor(tab='map'){
  holdFire=false;aimPointer=null;keys.clear();salvoQueue=[];finished=true;charge=null;
  audio.pause(false);cleanupBattle();harborTab=tab;setScreen('harbor');renderHarbor();$('shopMessage').textContent='';
}
function makeEnemy(x,z,kind){
  const model=createWarship(kind,kit);const spec=ENEMY_TYPES[kind];
  model.root.position.set(x,0,z);scene.add(model.root);
  const marker=document.createElement('div');marker.className='enemy-marker';marker.innerHTML=`<span>${spec.name}</span><div class="enemy-hp"><i></i></div>`;$('markers').append(marker);
  const e={...model,id:++enemyCounter,kind,spec,marker,hp:spec.hp,maxHP:spec.hp,attack:spec.attackInterval+Math.random()*2,phase:Math.random()*10,sinking:0,dead:false,removed:false,smokeTimer:0};
  enemies.push(e);return e;
}
function removeEnemy(e){
  if(e.removed)return;scene.remove(e.root);e.marker.remove();
  e.root.traverse(node=>{if(node.isMesh)node.geometry.dispose();});
  for(const mat of e.ownedMaterials)mat.dispose();for(const tex of e.ownedTextures)tex.dispose();e.removed=true;
}
function spawnWave(){
  wave++;waveWait=0;const area=AREAS[activeArea-1];
  for(const position of area.waves[wave-1])makeEnemy(position.x,position.z,position.kind);
  $('wave').textContent=`第${area.id}海域 · ${wave}/${area.waves.length}波`;
  toast(wave===1?`第${area.id}海域　${area.name}`:'敵の増援を捕捉',2.8);
  audio.morse('CQ');
}
function cleanupBattle(){
  for(const e of enemies)removeEnemy(e);enemies.length=0;
  for(const s of shots)scene.remove(s.ball);shots.length=0;
  for(const e of effects)removeEffect(e);effects.length=0;
}
function beginArea(id=chosenArea){
  const parsed=Number(id);if(!Number.isInteger(parsed)||parsed<1||parsed>campaign.state.unlockedArea)return false;
  audio.pause(false);cleanupBattle();activeArea=chosenArea=parsed;
  maxHP=100+campaign.state.upgrades.armor*30;hp=maxHP;kills=0;wave=0;waveWait=0;gameTime=0;
  yaw=0;pitch=-.018;shake=0;damage=0;energyFlash=0;finished=false;started=true;paused=false;holdFire=false;aimPointer=null;salvoQueue=[];specialUsed=false;charge=null;keys.clear();morseCooldown=0;
  stats={shots:0,hits:0,kills:0,killScore:0,time:0,hull:100};lastResult=null;
  for(const g of guns){g.cooldown=0;g.recoil=0;}
  selected=1;const area=AREAS[activeArea-1];scene.fog.color.setHex(area.fogTint);waterMat.uniforms.seaTint.value.setHex(area.seaTint);waterMat.uniforms.fogTint.value.copy(scene.fog.color);
  setScreen('battle');updateHullHUD();spawnWave();return true;
}
function updateCamera(){
  ship.position.y=Math.sin(elapsed*.7)*.09;ship.rotation.z=Math.sin(elapsed*.49)*.0025;
  camera.position.set(0,7.6+ship.position.y,8.6);camera.rotation.order='YXZ';
  camera.rotation.set(pitch+(Math.random()-.5)*shake*.013,yaw+(Math.random()-.5)*shake*.008,Math.sin(elapsed*.49)*.002);
  const merge=charge?clamp(charge.time/1.25,0,1)*(charge.fired?clamp(1-(charge.time-1.4)/.9,0,1):1):0;
  for(const g of guns){
    g.base.position.x=(g.index-1)*5*(1-merge*.87);g.swivel.rotation.y=yaw;g.pitch.rotation.x=pitch+.012;
    g.pitch.rotation.z=Math.sin(elapsed*26+g.index)*g.recoil*.003;
    g.barrel.position.z=g.recoil*.82;g.flash.intensity=g.recoil>.75?35:0;
    for(const r of g.energy)r.visible=campaign.state.upgrades.weapon>=3||merge>0;
  }
  camera.updateMatrixWorld(true);
}
function weakPosition(e){return e.root.localToWorld(e.weakOffset.clone());}
function findTarget(){
  let best=null,bestDist=.16;
  for(const e of enemies){if(e.dead)continue;const p=weakPosition(e).project(camera);if(p.z<-1||p.z>1)continue;const d=Math.hypot(p.x,p.y);if(d<bestDist){best=e;bestDist=d;}}
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
  const w=weapon();g.cooldown=reloadTime();g.recoil=1;shake=Math.min(2.1,shake+.8);stats.shots++;
  scene.updateMatrixWorld(true);const origin=g.barrel.localToWorld(new THREE.Vector3(0,0,-6.6));const target=findTarget();
  let dest;
  if(target)dest=weakPosition(target);else{camera.getWorldDirection(tempV);dest=camera.position.clone().addScaledVector(tempV,w.beam?320:180);}
  blast(origin,w.beam?1.5:1.15);puff(origin,7,0xc5c6bb,.55);
  if(w.beam){
    const direction=dest.clone().sub(origin).normalize();const far=origin.clone().addScaledVector(direction,520);
    const impacts=enemies.filter(e=>!e.dead).map(e=>({e,point:shipIntersection(origin,far,e)})).filter(x=>x.point).sort((a,b)=>a.point.distanceTo(origin)-b.point.distanceTo(origin));
    const hit=impacts[0];const end=hit?hit.point:far;
    beamBetween(origin,end,w.beam,campaign.state.upgrades.weapon===4?.38:.1,.32);beamBetween(origin,end,0xe4ffff,.07,.2);audio.beam((index-1)*.55);energyFlash=.18;
    if(hit){stats.hits++;hitEnemy(hit.e,target===hit.e?weakPosition(hit.e):hit.point,w.damage);}
    else {end.y=.2;splash(end,1.3);}
    return true;
  }
  const velocity=dest.clone().sub(origin);const t=velocity.length()/w.speed;velocity.divideScalar(t);velocity.y+=.5*5*t;
  const ball=new THREE.Mesh(shellGeo,shellMaterials[campaign.state.upgrades.weapon]);ball.position.copy(origin);if(w.splash)ball.scale.setScalar(1.5);scene.add(ball);
  shots.push({ball,velocity,life:12,enemy:false,prev:origin.clone(),damage:w.damage,splash:w.splash||0,target:target?.id});audio.fire((index-1)*.55);return true;
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
  if(e.dead)return false;e.dead=true;e.sinking=0;kills++;stats.kills=kills;stats.killScore+=e.spec.score;e.marker.remove();
  const weak=weakPosition(e);puff(weak,12,0x565b58,1.8);blast(weak,2.1);audio.sinking(clamp(e.root.position.x/80,-1,1));
  if(notify){toast(critical?'機関部直撃 · 敵艦沈没':'敵艦沈没',1.6);audio.announce('敵艦、沈没。');if(morseCooldown<=0){audio.morse('SUNK');morseCooldown=2.7;}}
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
  if(uiMode!=='battle'||finished||charge||!campaign.state.upgrades.special||specialUsed||!enemies.some(e=>!e.dead))return false;
  specialUsed=true;holdFire=false;salvoQueue=[];charge={time:0,fired:false};yaw=0;pitch=-.018;audio.special();audio.announce('三門合体。龍神砲、発射準備。');toast('3門合体　龍神砲 充填',2);return true;
}
function dragonBlast(){
  const start=new THREE.Vector3(0,4.8,-8);const target=start.clone().add(new THREE.Vector3(0,2,-450));
  for(const g of guns){const from=g.barrel.localToWorld(new THREE.Vector3(0,0,-6.6));beamBetween(from,start,0x81f6e6,.3,.8);g.recoil=1;g.cooldown=reloadTime();}
  beamBetween(start,target,0x55dfeb,3.6,1.3);beamBetween(start,target,0xd7ffff,1.4,.9);
  for(let side=0;side<2;side++){
    const points=[];for(let j=0;j<=32;j++){const z=-8-j*11;points.push(new THREE.Vector3(Math.sin(j*.5+side*Math.PI)*5,5.4+Math.cos(j*.5+side*Math.PI)*2,z));}
    const dragon=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),48,.65,5,false),new THREE.MeshBasicMaterial({color:side?0xf3dba0:0x63ffdd,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));effect(dragon,1.5,new THREE.Vector3(),0,0,true);
  }
  const crest=new THREE.Mesh(new THREE.ConeGeometry(4.5,16,7),new THREE.MeshBasicMaterial({color:0x7bffff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));crest.rotation.x=-Math.PI/2;crest.position.set(0,6,-33);effect(crest,1.1,new THREE.Vector3(0,0,-115),0,0,true);
  energyFlash=.9;shake=2.2;
  let sunk=0;for(const e of enemies)if(!e.dead){sinkEnemy(e,false,false);splash(e.root.position,1.6);sunk++;}
  toast(`龍神砲　敵艦${sunk}隻を撃沈`,2.8);audio.announce('敵艦隊、全艦沈没。');audio.morse('SUNK');morseCooldown=2.7;
}
function tick(dt){
  gameTime+=dt;morseCooldown=Math.max(0,morseCooldown-dt);
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
    e.phase+=dt;e.root.position.y=Math.sin(e.phase*1.4)*.24;e.root.rotation.z=Math.sin(e.phase)*.017;
    e.root.position.z+=dt*e.spec.speed;e.root.position.x+=Math.sin(e.phase*.28)*dt*(e.kind==='destroyer'?.8:.25);
    e.attack-=dt;if(e.attack<=0){enemyFire(e);e.attack=e.spec.attackInterval*.8+Math.random()*3;}
    e.smokeTimer-=dt;if(e.smokeTimer<=0){for(const offset of e.smokeOffsets)puff(e.root.localToWorld(offset.clone()),1,0x6e7472,.5);e.smokeTimer=1.1;}
    if(e.root.position.z>-38){damageHull(e.spec.damage*1.5);e.root.position.z=-72;e.attack=2.8;toast('敵艦接近！',1);}
    if(finished)return;
  }
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.prev.copy(s.ball.position);s.velocity.y-=5*dt;s.ball.position.addScaledVector(s.velocity,dt);s.life-=dt;
    let hit=false;
    if(!s.enemy){
      for(const e of enemies){if(e.dead)continue;const point=shipIntersection(s.prev,s.ball.position,e);if(!point)continue;
        stats.hits++;hitEnemy(e,s.target===e.id?weakPosition(e):point,s.damage);hit=true;
        if(s.splash){for(const other of enemies){if(other===e||other.dead)continue;if(other.root.position.distanceTo(e.root.position)<s.splash)hitEnemy(other,other.root.position.clone().add(new THREE.Vector3(0,3,0)),s.damage*.45);}}
        break;
      }
    } else if(s.ball.position.z>-13&&Math.abs(s.ball.position.x)<13&&s.ball.position.y<8){damageHull(s.damage);blast(s.ball.position,.8);puff(s.ball.position,5,0x7b7c72,.8);hit=true;}
    if(!hit&&(s.ball.position.y<.15||s.life<=0)){const pos=s.ball.position.clone();pos.y=.2;splash(pos,1.2);hit=true;}
    if(hit)cleanShot(i);if(finished)return;
  }
  const area=AREAS[activeArea-1];
  if(enemies.length&&enemies.every(e=>e.dead)){
    waveWait+=dt;
    if(waveWait>3.5){if(wave>=area.waves.length)endGame(true);else{hp=Math.min(maxHP,hp+maxHP*.12);updateHullHUD();spawnWave();}}
  }
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
  for(const e of enemies){if(e.dead)continue;const p=e.root.position.clone();p.y=e.markerHeight+1;p.project(camera);const visible=p.z>-1&&p.z<1&&Math.abs(p.x)<1.2&&Math.abs(p.y)<1.2;e.marker.style.display=visible?'block':'none';if(visible){e.marker.style.left=`${(p.x*.5+.5)*innerWidth}px`;e.marker.style.top=`${(-p.y*.5+.5)*innerHeight}px`;}}
  const buttons=document.querySelectorAll('.gun');guns.forEach((g,i)=>{const b=buttons[i];b.classList.toggle('selected',i===selected);b.classList.toggle('loading',g.cooldown>0);b.querySelector('span').textContent=g.cooldown>0?`${g.cooldown.toFixed(1)}秒`:'装填完了';b.querySelector('i').style.width=`${clamp(1-g.cooldown/reloadTime(),0,1)*100}%`;});
  $('fire').classList.toggle('reloading',guns[selected].cooldown>0);$('fire').querySelector('b').textContent=charge?'充填':guns[selected].cooldown>0?'装填':'発射';
  const ready=!!campaign.state.upgrades.special&&!specialUsed&&uiMode==='battle'&&!finished&&!charge;
  $('special').disabled=!ready;$('special').classList.toggle('ready',ready);$('special').querySelector('small').textContent=!campaign.state.upgrades.special?'未装備':charge?'充填中':specialUsed?'使用済み':'残り1回';
}
function endGame(won){
  if(finished)return;finished=true;holdFire=false;aimPointer=null;keys.clear();salvoQueue=[];charge=null;
  stats.time=gameTime;stats.hull=hp/maxHP*100;lastResult=campaign.settle(activeArea,stats,won);const area=AREAS[activeArea-1];
  setScreen('result');$('endEyebrow').textContent=won?'AREA CONQUERED':'MISSION FAILED';$('endTitle').textContent=won?(activeArea===AREAS.length?'全海域制圧':'海域制圧'):'艦体大破';$('endArea').textContent=`第${activeArea}海域 · ${area.name}`;
  const values=[['撃沈数',`${kills}`, '隻'],['得点',lastResult.score.toLocaleString(),'点'],['命中率',`${lastResult.accuracy}`,'%'],['発射 / 命中',`${stats.shots} / ${stats.hits}`,'砲撃'],['艦体耐久',`${Math.round(hp/maxHP*100)}`,'%'],['総合評価',lastResult.rank,`${Math.floor(gameTime)}秒`]];
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
$('mapTab').addEventListener('click',()=>{harborTab='map';renderHarbor();});$('shopTab').addEventListener('click',()=>{harborTab='shop';renderHarbor();});$('backToMap').addEventListener('click',()=>{harborTab='map';renderHarbor();});
$('mapList').addEventListener('click',e=>{const button=e.target.closest('button[data-area]');if(!button||button.disabled)return;chosenArea=Number(button.dataset.area);renderHarbor();});
$('shopCards').addEventListener('click',e=>{const button=e.target.closest('button[data-buy]');if(!button||button.disabled)return;const result=campaign.buy(button.dataset.buy);renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');});
$('toHarbor').addEventListener('click',()=>openHarbor('shop'));$('nextArea').addEventListener('click',()=>{chosenArea=Math.min(activeArea+1,AREAS.length);openHarbor('map');});
$('restart').addEventListener('click',()=>beginArea(activeArea));$('restartPause').addEventListener('click',()=>beginArea(activeArea));$('toHarborPause').addEventListener('click',()=>{chosenArea=activeArea;openHarbor('map');});
$('pause').addEventListener('click',()=>setPause(true));$('resume').addEventListener('click',()=>setPause(false));
$('resetProgress').addEventListener('click',()=>{$('resetConfirm').classList.remove('hidden');});$('cancelReset').addEventListener('click',()=>{$('resetConfirm').classList.add('hidden');});
$('confirmReset').addEventListener('click',()=>{campaign.reset();chosenArea=1;$('resetConfirm').classList.add('hidden');renderHarbor();$('shopMessage').textContent='新しい作戦を開始しました。';});
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
});
window.addEventListener('keyup',e=>{keys.delete(e.key);if(e.key===' ')holdFire=false;});
window.addEventListener('blur',()=>{holdFire=false;aimPointer=null;keys.clear();if(uiMode==='battle')setPause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&uiMode==='battle')setPause(true);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<h?80:62;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();updateCamera();updateSaveSummary();
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
