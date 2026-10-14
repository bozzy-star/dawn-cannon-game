import * as THREE from 'three';
import { CannonAudio } from './audio.js?v=asahi-v9.2';
import { AREAS, ENEMY_TYPES, UPGRADES, CONSUMABLES, WORLD, CampaignStore, AIRCRAFT_TYPES, AVIATION_CONVERSION, aviationStats, CONSUMPTION_MULTIPLIER } from './campaign.js?v=asahi-v9.2';
import { createWarship } from './enemies.js?v=asahi-v9.2';
import { NavalThreats, createAuxiliaryMounts, getAirBalance } from './threats.js?v=asahi-v9.2';
import { Battlefield } from './battlefield.js?v=asahi-v9.2';
import { buildFlagship } from './flagship.js?v=asahi-v9.2';
import { NavalAviation } from './aviation.js?v=asahi-v9.2';

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
renderer.toneMappingExposure = 1.02;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xa5b6c2, .0017);
const camera = new THREE.PerspectiveCamera(62, 1, .15, 2200);
const clock = new THREE.Clock();
const sunDirection = new THREE.Vector3(-.45, .52, -.66).normalize();
const hemisphere=new THREE.HemisphereLight(0xc8dae9, 0x324954, 1.25);scene.add(hemisphere);
const sun = new THREE.DirectionalLight(0xffe4bd, 2.45);
sun.position.copy(sunDirection).multiplyScalar(150);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -85; sun.shadow.camera.right = 85;
sun.shadow.camera.top = 95; sun.shadow.camera.bottom = -75;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 250;
sun.shadow.bias = -.0006; sun.shadow.normalBias = .045;
scene.add(sun);scene.add(sun.target);

// Cloudy atmospheric sky: rendered once, also used for steel reflections.
const skyMat = new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{sun:{value:sunDirection},skyTone:{value:new THREE.Color(1,1,1)},cloudCover:{value:1}},vertexShader:`varying vec3 vP; void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`
varying vec3 vP;uniform vec3 sun;uniform vec3 skyTone;uniform float cloudCover;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
float fbm(vec2 p){float a=.55,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+17.1;a*=.5;}return s;}
void main(){vec3 d=normalize(vP);float h=max(d.y,0.);vec3 col=mix(vec3(.58,.67,.73),vec3(.19,.36,.52),pow(h,.48));
vec2 uv=d.xz/(max(d.y,.04)+.35)*2.3;float n=fbm(uv);float cloud=smoothstep(.39,.7,n)*smoothstep(0.,.16,d.y);col=mix(col,mix(vec3(.32,.4,.46),vec3(.88,.86,.79),smoothstep(.47,.72,n)),cloud*.94*cloudCover);col+=vec3(1.,.79,.52)*pow(max(dot(d,sun),0.),45.)*.25;col+=vec3(1.,.91,.76)*pow(max(dot(d,sun),0.),750.)*.7;gl_FragColor=vec4(col*skyTone,1.);}`});
const sky = new THREE.Mesh(new THREE.SphereGeometry(1800,32,16),skyMat);
scene.add(sky);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new THREE.Mesh(new THREE.SphereGeometry(15,32,16),skyMat);
envScene.add(envSky);
const envRT = pmrem.fromScene(envScene, .03, .1, 100);
scene.environment = envRT.texture;
pmrem.dispose(); envSky.geometry.dispose();

const waterMat = new THREE.ShaderMaterial({uniforms:{time:{value:0},sun:{value:sunDirection},seaTint:{value:new THREE.Color(0x163642)},fogTint:{value:new THREE.Color(0xa5b6c2)},waveStrength:{value:1},lightLevel:{value:1},shipXZ:{value:new THREE.Vector2()},shipSpeed:{value:1.6}},vertexShader:`
uniform float time;uniform float waveStrength;varying vec3 world;varying float wave;
void main(){vec3 p=position;float w=sin(p.x*.043+time*.7)*.34+sin(p.y*.065-time*.9)*.21+sin((p.x+p.y)*.11+time*1.1)*.07;w*=waveStrength;p.z=w;wave=w;vec4 wp=modelMatrix*vec4(p,1.);world=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,fragmentShader:`
uniform float time;uniform vec3 sun;uniform vec3 seaTint;uniform vec3 fogTint;uniform float lightLevel;uniform vec2 shipXZ;uniform float shipSpeed;varying vec3 world;varying float wave;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){vec2 p=world.xz;float dist=length(cameraPosition-world);float detail=1.-smoothstep(25.,190.,dist);
float nx=cos(p.x*.043+time*.7)*.021+cos((p.x-p.y)*.9+time*1.2)*.044*detail+cos(p.x*2.4+time*1.6)*.012*detail;
float nz=cos(p.y*.065+time*.9)*.018+cos((p.x+p.y)*.75-time*.9)*.036*detail+cos(p.y*2.1-time)*.012*detail;
vec3 n=normalize(vec3(-nx,1.,-nz));vec3 v=normalize(cameraPosition-world);float fres=pow(1.-max(dot(n,v),0.),3.);vec3 refl=reflect(-v,n);vec3 sky=mix(vec3(.58,.67,.73),vec3(.23,.4,.56),sqrt(max(refl.y,0.)));
float sparkle=pow(max(dot(reflect(-sun,n),v),0.),145.);float ripple=noise(p*.45+time*.06);vec3 col=mix(mix(vec3(.025,.105,.135),seaTint,.35)+ripple*.035,sky,fres*.83);col+=vec3(1.,.85,.6)*sparkle*.85;
float seaWave=sin(p.x*.043+time*.7)*.34+sin(-p.y*.065-time*.9)*.21+sin((p.x-p.y)*.11+time*1.1)*.07;
float crest=smoothstep(.31,.55,seaWave)*smoothstep(.45,.78,noise(p*.6+time*.22))*(.25+.75*detail);
vec2 wake=p-shipXZ;float aft=wake.y-80.;float wakeWidth=4.+max(aft,0.)*.16;
float trail=step(0.,aft)*exp(-max(aft,0.)*.018)*exp(-pow(abs(wake.x)/wakeWidth,2.));
float bowFoam=exp(-pow((wake.y+37.)*.35,2.))*exp(-pow((abs(wake.x)-4.)*.28,2.));
float foam=clamp(crest*.6+(trail*.58+bowFoam*.55)*smoothstep(.25,.7,noise(p*.8-time*.9))*min(shipSpeed*.5,1.5),0.,.76);
col=mix(col,vec3(.68,.77,.77),foam);
float fog=1.-exp(-dist*.0016);col=mix(col,fogTint,fog);col*=lightLevel;gl_FragColor=vec4(col,1.);}`});
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
const kit={THREE,steel,darkSteel,edgeSteel,deckMat,wood,black,bronze,box,cylinder,ring,mesh};
const {ship,guns,batteryMount,turretYaw,turretElevation,MUZZLE_Z,setHullMode,getDeckPose,setEquipmentVisuals,setSurfaceMaps}=buildFlagship(kit);scene.add(ship);
// Painted steel and teak are actual hull materials, rather than a picture over the game.
const illustratedTextures=[];
if(typeof Image!=='undefined'){
  const loader=new THREE.TextureLoader();
  const surface=(file)=>new Promise(resolve=>loader.load(new URL(`./assets/${file}`,import.meta.url).href,texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    texture.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());illustratedTextures.push(texture);resolve(texture);
  },undefined,()=>resolve(null)));
  Promise.all([surface('naval-steel-v8.png'),surface('naval-teak-v8.png')]).then(([steelMap,teakMap])=>{
    if(steelMap)for(const [material,color] of [[steel,0x8b9da5],[darkSteel,0x4d6671],[edgeSteel,0xa5b3b7],[deckMat,0x637781]]){
      material.map=steelMap;material.color.setHex(color);material.metalness=.24;material.roughness=.68;material.needsUpdate=true;
    }
    if(teakMap){wood.map=teakMap;wood.color.setHex(0xb9b3a0);wood.roughness=.87;wood.needsUpdate=true;}
    setSurfaceMaps({steel:steelMap,wood:teakMap,bump:bumpMap});
  });
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
const battlefield=new Battlefield(scene,kit);
const zoneNames={bow:'艦首',stern:'艦尾',port:'左舷',starboard:'右舷',bridge:'艦橋',engine:'機関部'};
const zonePositions={bow:[0,2,-30],stern:[0,3,84],port:[-10,2,12],starboard:[10,2,12],bridge:[0,14,34],engine:[0,5,52]};
const damageVisuals={};
for(const [key,pos] of Object.entries(zonePositions)){const group=new THREE.Group();group.position.set(...pos);ship.add(group);const scar=mesh(new THREE.SphereGeometry(1.8,12,8),new THREE.MeshStandardMaterial({color:0x131617,roughness:1}),group);scar.scale.set(1.4,.12,1);for(let i=0;i<3;i++){const debris=box(group,.5,1.1,1.2,(i-1)*1.2,.5,.5,darkSteel);debris.rotation.z=(i-1)*.45;}damageVisuals[key]=group;}
const keys=new Set();
let gameTime=0,elapsed=0,started=false,paused=false,finished=true;
let hp=100,maxHP=100,kills=0,wave=0,waveWait=0,selected=0,yaw=0,pitch=-.018,shake=0,damage=0,toastTime=0;
let activeArea=clamp(campaign.state.unlockedArea,1,AREAS.length),chosenArea=activeArea;
let uiMode='title',harborTab='map',aimPointer=null,holdFire=false,repeatFireDelay=0,salvoQueue=[],specialUsed=false,charge=null;
let stats={shots:0,hits:0,kills:0,killScore:0,time:0,hull:100};
let lastResult=null,enemyCounter=0,morseCooldown=0,energyFlash=0;
let dragonUses=0,fuelTimer=0,selectedContact=null,bombDepth=50,auxiliary=null;
let worldPart=AREAS[chosenArea-1].part||1;
let mapZoom='world',weaponMode='main',battlePhase='naval',assaultTime=0,landingIntegrity=100,landingArrival=0;
let reviewReturn='result',reviewActive=false,reviewTime=0,reviewPending=false,rangeSetting=180,damageSmokeTimer=0,stackSmokeTimer=0,advancedOpen=false;
let tutorial=null;
let weather={timeOfDay:'day',weather:'clear',seaState:.35,windX:0,windZ:0,radarFactor:1};
const maneuver={position:new THREE.Vector3(),velocity:new THREE.Vector3(),speed:1.6,speedMode:'cruise',boost:false,evading:false,evadeWindow:false,evadeTimer:0,evadeCooldown:0,side:0,rollKick:0,pitchKick:0};
let zones={...campaign.state.damageZones};
const tempV=new THREE.Vector3();
const combatRaycaster=new THREE.Raycaster();
const gunLoadout=(index=selected)=>campaign.gunLoadout(index)||{weapon:0,power:0,reload:0};
const weapon=(index=selected)=>{const loadout=gunLoadout(index),base=WEAPONS[loadout.weapon];return {...base,damage:base.damage*(1+.35*loadout.power),tier:loadout.weapon};};
function battleUpgrades(){
  const upgrades={...campaign.state.upgrades};
  for(const [kind,level] of Object.entries(tutorial?.loans.upgrades||{}))upgrades[kind]=Math.max(upgrades[kind]||0,level);
  return upgrades;
}
function battleSupply(kind){return (campaign.state.stock[kind]||0)+(tutorial?.stock[kind]||0);}
function consumeBattle(kind,n=1){
  if(!Number.isInteger(n)||n<1)return false;
  const cost=n*CONSUMPTION_MULTIPLIER,loan=tutorial?.stock[kind]||0;
  if(!loan)return campaign.consume(kind,n);
  if(battleSupply(kind)<cost)return false;
  const used=Math.min(loan,cost),rest=cost-used;
  if(rest&&!campaign.consume(kind,rest/CONSUMPTION_MULTIPLIER))return false;
  tutorial.stock[kind]-=used;return true;
}
function tutorialWave(){
  if(!tutorial)return;
  tutorial.age=0;tutorial.holding=false;tutorial.window=false;
  if(tutorial.kind==='asw')selectedContact=null;
  tutorial.step=tutorial.kind==='dragon'?'muster':tutorial.kind==='asw'?(threats.stats.sonarOn?'contact':'sonar'):'aim';
  if(tutorial.kind==='asw'&&tutorial.step==='sonar')tutorial.holding=true;
}
function tutorialEvent(event){
  if(!tutorial)return;
  if(tutorial.kind==='gunnery'){
    if(event==='main-fired'&&tutorial.step==='aim')tutorial.step='impact';
    if(event==='main-hit'){tutorial.step='complete';tutorial.age=0;}
  }else if(tutorial.kind==='asw'){
    if(event==='sonar-on'){tutorial.step='contact';tutorial.holding=false;}
    if(event==='contact'){
      const contact=threats.contacts.find(c=>c.id===selectedContact);
      const close=contact&&Math.hypot(contact.position.x-maneuver.position.x,contact.position.z-maneuver.position.z)<=115;
      const ready=threats.stats.aswCooldown<=0;
      tutorial.step=battleUpgrades().asw>1||close?(ready?'asw':'reload'):'approach';tutorial.holding=tutorial.step==='asw';
    }
    if(event==='asw-fired'){tutorial.step='blast';tutorial.holding=false;tutorial.age=0;}
    if(event==='sub-sunk'){tutorial.step='complete';tutorial.holding=false;tutorial.age=0;}
  }
}
function tickTutorial(dt){
  if(!tutorial)return;
  tutorial.age+=dt;
  if(tutorial.kind==='dragon'&&tutorial.step==='muster'&&(tutorial.age>=2.5||threats.stats.bombs>0)){
    tutorial.step='dragon';tutorial.window=true;tutorial.holding=true;holdFire=false;salvoQueue=[];
    audio.announce('今だ！ 龍神砲、撃て！');
  }
  if(tutorial.kind==='asw'){
    const contacts=threats.contacts.filter(c=>c.detected);
    if(tutorial.holding&&battleSupply('asw')<CONSUMPTION_MULTIPLIER&&tutorial.step==='asw'){tutorial.holding=false;tutorial.step='blast';}
    if(tutorial.step==='contact'&&contacts.length){tutorial.step='select';tutorial.holding=true;}
    if(tutorial.step==='approach'){
      const contact=contacts.find(c=>c.id===selectedContact);
      if(contact&&Math.hypot(contact.position.x-maneuver.position.x,contact.position.z-maneuver.position.z)<=115){tutorial.step='select';tutorial.holding=true;}
    }
    if((tutorial.step==='reload'||tutorial.step==='blast'&&tutorial.age>3)&&contacts.some(c=>c.id===selectedContact)&&threats.stats.aswCooldown<=0){tutorial.step='select';tutorial.holding=true;}
  }
}
function tutorialAction(){
  if(!tutorial||uiMode!=='battle')return;
  audio.unlock();
  if(tutorial.kind==='dragon'&&tutorial.window){fireDragon();return;}
  if(tutorial.kind==='asw'){
    if(tutorial.step==='sonar'){toggleSonar();return;}
    if(tutorial.step==='select'){selectSubContact();return;}
    if(tutorial.step==='asw'){fireAntiSub();return;}
  }
}
function updateTutorialHUD(){
  const show=!!tutorial&&uiMode==='battle'&&!finished&&(tutorial.step!=='complete'||tutorial.age<4);
  $('tutorialGuide').classList.toggle('hidden',!show);
  if(!show){for(const id of ['fire','special','sonar','contact','asw'])$(id).classList.remove('tutorial-target');return;}
  const step=tutorial.step;
  let title=tutorial.title,body='',action='',target='';
  if(tutorial.kind==='gunnery'){
    title=step==='complete'?'命中！ 砲撃の基本を習得':step==='impact'?'着弾を確認しよう':'敵の進路を先読みして、主砲を発射';
    body=step==='complete'?'敵は左右へ航過します。通り過ぎた艦は旋回して再攻撃するので、追いながら砲撃してください。':step==='impact'?'白い水柱は外れ。敵艦の少し先へ照準を動かし、装填が終わったら次弾を撃ちましょう。':'海面をドラッグして照準。赤い敵艦の少し先を狙い、下の「発射」またはSpaceを押します。';
    if(step==='aim'||step==='impact')target='fire';
  }else if(tutorial.kind==='dragon'){
    title=step==='dragon'?`今だ！ 龍神砲を撃て！ (${wave}/2)` :step==='charging'?'全主砲連結！ 龍神砲、発射！':step==='complete'?'敵航空隊、掃討！':'敵機群が集結するまで待て';
    body=step==='dragon'?'時間を止めて発射の練習中です。光る「龍神砲」か下のボタンを押してください。訓練用の2発を貸与しています。':step==='charging'?'充填後に、水上艦と敵航空隊を一掃します。次の波でも合図を待ってもう一度発射。':'60機ずつ、全120機の空襲です。大編隊が揃ったら「今だ！」の合図で龍神砲を使います。貸与兵装は帰港時に返却します。';
    if(step==='dragon'){action='龍神砲を撃つ · G';target='special';}
  }else{
    title=step==='sonar'?'① ソナーをONにして潜水艦を探す':step==='select'?'② 潜水接触を選び、海面の位置を狙う':step==='approach'?'爆雷の投下範囲、1200m以内へ接近':step==='reload'?'対潜兵器、再装填中':step==='asw'?'③ 探知した深度に合わせて対潜攻撃':step==='complete'?'潜水艦、撃沈！':'爆発と探知位置を確認';
    body=step==='sonar'?'訓練用アクティブソナーと爆雷を貸与。潜水艦に主砲は効きません。まずソナーを押してください。':step==='select'?'選択すると探知した位置へ照準が移ります。ソナーの表示から、位置と深度を確認しましょう。':step==='asw'?`深度${Math.round(bombDepth)}mに設定済み。爆雷は指定位置へ投下し、数秒後に爆発します。移動したら探知位置を選び直しましょう。`:'爆雷の着弾には時間差があります。撃沈できなければ、接触を選び直してもう一度対潜攻撃します。貸与品は帰港時に返却します。';
    if(step==='approach')body='探知は2000m、爆雷の投下は1200m以内です。接近する間に水上艦へ砲撃し、射程内に入ったら接触を選び直します。';
    if(step==='sonar'){action='ソナーをON · V';target='sonar';}
    if(step==='select'){action='探知位置を選ぶ · R';target='contact';}
    if(step==='asw'){action='対潜兵器を発射 · H';target='asw';}
  }
  $('tutorialTitle').textContent=title;$('tutorialBody').textContent=body;
  $('tutorialAction').classList.toggle('hidden',!action);$('tutorialAction').textContent=action;
  for(const id of ['fire','special','sonar','contact','asw'])$(id).classList.toggle('tutorial-target',id===target);
}
const reloadTime=(index=selected)=>2.7*Math.pow(.82,gunLoadout(index).reload)*(threats.stats.sonarOn&&battleUpgrades().sonar===1?2:1);
const detectionRange=()=>[180,280,400,650][campaign.state.upgrades.radar||0]*(weather.radarFactor||1);
const threats=new NavalThreats({scene,audio,getArea:()=>AREAS[activeArea-1],onDamage:damageHull,onAirSpotted:(count)=>{audio.airSpotted(count);toast(`敵機発見！ ${count}機 · 自動高角砲、迎撃開始`,2.6);},onAirKill:(score)=>{stats.airKills=(stats.airKills||0)+1;stats.airScore=(stats.airScore||0)+score;},onSubKill:(e)=>sinkEnemy(e,false,true),onEffect:(position,type,power=1)=>{if(type==='splash')splash(position,power);else if(type==='blast'){blast(position,power);puff(position,4,0x62656b,power);}else puff(position,2,0xcfe1e8,.3,true);},consume:(kind,n=1)=>consumeBattle(kind,n),getUpgrades:()=>battleUpgrades(),getManeuver:()=>maneuver,getWeather:()=>weather,getAim:()=>{
  const direction=camera.getWorldDirection(new THREE.Vector3());
  const contact=threats.contacts.find(c=>c.detected&&c.id===selectedContact);
  const surfaceDistance=direction.y<-.001?-camera.position.y/direction.y:150;
  const point=camera.position.clone().addScaledVector(direction,clamp(surfaceDistance,15,350));point.y=-bombDepth/10;
  return {origin:camera.position.clone(),direction,targetPoint:battleUpgrades().asw>1&&contact?contact.position.clone():point};
}});
const aviation=new NavalAviation({scene,getState:()=>campaign.state.aviation,getManeuver:()=>maneuver,getWeather:()=>weather,consume:(kind,n=1)=>consumeBattle(kind,n),getThreats:()=>threats,
  getDeckPose:()=>{ship.updateMatrixWorld(true);const pose=getDeckPose();return {launchOrigin:ship.localToWorld(pose.launchOrigin.clone()),landingOrigin:ship.localToWorld(pose.landingOrigin.clone()),yaw:ship.rotation.y};},
  onSurfaceHit:(e,point,amount)=>{if(!e.dead&&e.kind!=='submarine'){hitEnemy(e,point,amount,1);stats.airGroundHits=(stats.airGroundHits||0)+1;}},
  onEffect:(position,type,power=1)=>{if(type==='blast'){blast(position,power);puff(position,2,0x60656b,power);}else if(type==='splash')splash(position,power);else puff(position,1,0xd2dde0,.25,true);},
  onMessage:message=>toast(message,1.8)
});
function syncGunLoadout(){
  const count=campaign.gunCount();selected=clamp(selected,0,count-1);
  guns.forEach((g,i)=>{g.barrel.visible=i<count;g.barrel.position.x=(i-(count-1)/2)*(count===4?2.05:2.3);g.barrel.scale.setScalar(1+.035*gunLoadout(i).power);});
  setEquipmentVisuals(campaign.state);
}
function syncAuxiliary(){
  syncGunLoadout();
  const a=campaign.state.aviation;setHullMode(a.hullMode,a.capacityLevel,a.levels,a.loadout);
  if(auxiliary){ship.remove(auxiliary);const geometry=new Set(),materials=new Set();auxiliary.traverse(n=>{if(n.geometry)geometry.add(n.geometry);if(n.material)for(const m of Array.isArray(n.material)?n.material:[n.material])materials.add(m);});for(const g of geometry)g.dispose();for(const m of materials)m.dispose();}
  auxiliary=createAuxiliaryMounts(battleUpgrades());ship.add(auxiliary);
}
function toast(message,duration=1.8){$('message').textContent=message;toastTime=duration;$('message').style.opacity='1';}
function setScreen(mode){
  uiMode=mode;
  for(const [id,screen] of [['start','title'],['harbor','harbor'],['pausePanel','pause'],['end','result'],['reviewPanel','review']])$(id).classList.toggle('hidden',screen!==mode);
  document.body.classList.toggle('playing',mode==='battle'||mode==='pause');
  paused=mode==='pause';
  const a=campaign.state.aviation;aviation.group.visible=a.hullMode==='hybrid'&&(mode==='battle'||mode==='pause');
  if(mode==='review'&&reviewReturn==='result')setHullMode(a.hullMode,a.capacityLevel,a.levels,aviation.stats.roles);
}
function updateSaveSummary(){
  const state=campaign.state;
  const ongoing=state.conquered.length>0||state.unlockedArea>1||campaign.gunCount()>1||state.aviation.converted||Object.values(state.upgrades).some(n=>n>0)||state.guns.some(g=>g.weapon||g.power||g.reload)||state.credits!==1200||state.stock.shell!==180||state.hull<100;
  $('startButton').textContent=ongoing?'この航海を続ける →':'通常戦艦・主砲1門で出航 →';
  $('newVoyageButton').classList.toggle('hidden',!ongoing);
  $('saveSummary').textContent=`現在の記録：${state.aviation.hullMode==='hybrid'?'航空戦艦':'通常戦艦'}・主砲${campaign.gunCount()}門 · 制圧 ${state.conquered.length}/${AREAS.length} · ${state.credits.toLocaleString()} C`;
}
function renderVoyageHistory(){
  const entries=campaign.archivedCampaigns();
  const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  $('voyageList').innerHTML=entries.length?entries.map(entry=>`<article class="voyage-entry"><div><strong>${entry.hullMode==='hybrid'?'航空戦艦':'通常戦艦'} · 主砲${entry.gunCount}門 · 制圧${entry.conquered}海域</strong><small>${escape(entry.date)} · ${entry.credits.toLocaleString()} C</small></div><button data-restore-voyage="${escape(entry.id)}">この航海に戻る</button></article>`).join(''):'<p class="voyage-empty">保存された以前の航海はありません。</p>';
}
function applyVoyageResult(result){
  if(!result.ok){$('startMessage').textContent=result.reason;$('voyageMessage').textContent=result.reason;return false;}
  cleanupBattle();finished=true;started=true;holdFire=false;aimPointer=null;keys.clear();salvoQueue=[];charge=null;
  reviewActive=reviewPending=false;selected=0;kills=0;wave=0;lastResult=null;
  activeArea=chosenArea=clamp(campaign.state.unlockedArea,1,AREAS.length);worldPart=AREAS[chosenArea-1].part;mapZoom='world';
  maxHP=100+campaign.state.upgrades.armor*30;hp=maxHP*campaign.state.hull/100;zones={...campaign.state.damageZones};
  stats={shots:0,hits:0,kills:0,killScore:0,time:0,hull:campaign.state.hull,airKills:0,airScore:0};
  for(const gun of guns){gun.cooldown=0;gun.recoil=0;}maneuver.position.set(0,0,0);maneuver.velocity.set(0,0,0);
  syncAuxiliary();syncDamageVisual();updateHullHUD();$('voyagePanel').classList.add('hidden');openHarbor('map');
  $('shopMessage').textContent=result.reason;updateSaveSummary();audio.unlock();return true;
}
const supplyNames={shell:'主砲弾',aa:'対空弾',asw:'対潜弾',dragon:'龍神弾',fuel:'燃料',aviation:'航空弾'};
function renderWorldMap(){
  const project=(lon,lat)=>[(((lon%360)+360)%360)/360*1000,(80-lat)/140*430];
  const points=(list)=>list.map(p=>project(...p).map(v=>v.toFixed(1)).join(',')).join(' ');
  const land=(WORLD.landmasses||[]).map(l=>`<polygon points="${points(l.points)}" fill="${l.nation==='akatsuwa'?'#927344':'#293f48'}" stroke="#6f8b9055" stroke-width="1.2"/>`).join('');
  const visibleAreas=mapZoom==='part'?AREAS.filter(a=>a.part===worldPart):AREAS;
  const route=visibleAreas.map(a=>project(a.lon,a.lat));
  const local=AREAS.filter(a=>a.part===worldPart).map(a=>project(a.lon,a.lat));
  const minX=Math.min(...local.map(p=>p[0]))-35,minY=Math.min(...local.map(p=>p[1]))-28,maxX=Math.max(...local.map(p=>p[0]))+35,maxY=Math.max(...local.map(p=>p[1]))+28;
  const view=mapZoom==='part'?`${minX} ${minY} ${Math.max(100,maxX-minX)} ${Math.max(90,maxY-minY)}`:'0 0 1000 430';
  $('mapWorld').classList.toggle('active',mapZoom==='world');$('mapPart').classList.toggle('active',mapZoom==='part');$('mapWorld').setAttribute('aria-pressed',String(mapZoom==='world'));$('mapPart').setAttribute('aria-pressed',String(mapZoom==='part'));$('mapPart').textContent=`第${worldPart}部を拡大`;
  const path=route.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const captured=new Set(campaign.state.conquered);
  const nodes=visibleAreas.map(a=>{const [x,y]=project(a.lon,a.lat),held=captured.has(a.id),selected=a.id===chosenArea;const tile=Array.from({length:6},(_,i)=>`${(x+13*Math.cos(i*Math.PI/3)).toFixed(1)},${(y+13*Math.sin(i*Math.PI/3)).toFixed(1)}`).join(' ');return `${held?`<polygon data-map-conquered="${a.id}" points="${tile}" fill="#48b89766" stroke="#75d1b0"/>`:''}<g data-map-area="${a.id}" data-map-part="${a.part}"><circle cx="${x}" cy="${y}" r="${selected?8:4.5}" fill="${selected?'#f2c47f':held?'#62c5a5':a.id>campaign.state.unlockedArea?'#6c707f':'#f0a974'}" stroke="#101c26" stroke-width="2"/><title>${a.id}. ${a.name}${held?'・制圧済み':''}</title></g>`;}).join('');
  $('worldMap').innerHTML=`<svg viewBox="${view}" role="img" aria-label="架空世界の作戦経路と制圧海域"><defs><linearGradient id="mapSea" x2="1" y2="1"><stop stop-color="#102638"/><stop offset="1" stop-color="#193d46"/></linearGradient></defs><rect width="1000" height="430" fill="url(#mapSea)"/>${Array.from({length:7},(_,i)=>`<path d="M0 ${i*70}H1000" stroke="#7195a015"/>`).join('')}${land}<path d="${path}" fill="none" stroke="#d5b67d66" stroke-width="1.8" stroke-dasharray="4 5"/>${nodes}<text x="455" y="255" fill="#8ba6b1" font-size="18" letter-spacing="7">蒼環洋</text><text x="790" y="210" fill="#8ba6b1" font-size="13">黎明大陸</text></svg>`;
}
function renderSupplies(){
  const stock=campaign.state.stock;
  $('supplyCards').innerHTML=Object.entries(CONSUMABLES).map(([kind,item])=>{
    const amount=kind==='fuel'?Math.max(0,Math.min(item.amount,campaign.fuelCapacity()-stock.fuel)):item.amount,cost=Math.ceil(item.price*amount/item.amount);
    return `<article class="shop-card supply-card"><small>SUPPLY / 保有 ${stock[kind]}</small><h3>${item.name}</h3><p>${item.description||`${supplyNames[kind]}を${amount}補給します。`}</p><button data-supply="${kind}" ${!amount||campaign.state.credits<cost?'disabled':''}>${amount?`+${amount} / ${cost.toLocaleString()} C`:'燃料庫は満杯'}</button></article>`;
  }).join('');
  const emergency=campaign.canEmergencyResupply();$('emergencySupply').disabled=!emergency.ok;$('emergencyStatus').textContent=emergency.reason;
}
function renderHarbor(){
  const state=campaign.state,area=AREAS[chosenArea-1],requirements=campaign.requirements(chosenArea),recommendations=area.recommendations||{};
  $('credits').textContent=`${state.credits.toLocaleString()} C`;
  for(const [id,tab] of [['mapTab','map'],['shopTab','shop'],['supplyTab','supply'],['aviationTab','aviation']])$(id).classList.toggle('active',harborTab===tab);
  for(const [id,tab] of [['mapView','map'],['shopView','shop'],['supplyView','supply'],['aviationView','aviation']])$(id).classList.toggle('hidden',harborTab!==tab);
  $('worldView').classList.toggle('hidden',harborTab!=='map');
  $('partTabs').innerHTML=WORLD.parts.map(p=>`<button data-part="${p.id}" class="${worldPart===p.id?'active':''}">第${p.id}部</button>`).join('');
  const part=WORLD.parts.find(p=>p.id===worldPart);$('partStory').textContent=`${part.title} — ${part.story}`;
  $('mapList').innerHTML=AREAS.filter(a=>a.part===worldPart).map(a=>`<button class="area-card ${a.id===chosenArea?'selected':''} ${a.id>state.unlockedArea?'locked':''}" data-area="${a.id}"><span>${String(a.id).padStart(2,'0')}</span><strong>${a.name}</strong><small>${state.conquered.includes(a.id)?'制圧済':a.id>state.unlockedArea?'未解放':'出撃可能'}</small></button>`).join('');
  $('areaNumber').textContent=`第${area.part}部 / OPERATION ${String(area.id).padStart(2,'0')} / ${area.waves.length} WAVES`;$('areaName').textContent=area.name;
  const weatherNames={clear:'晴れ',cloudy:'曇り',rain:'雨',storm:'荒天'},times={dawn:'朝',day:'昼',night:'夜'},battleNames={front:'正面戦',broadside:'並走戦',crossing:'交差戦'};
  $('briefing').textContent=`${area.briefing} ${times[area.weather.timeOfDay]}・${weatherNames[area.weather.weather]} / ${battleNames[area.engagement]}${area.shoreAssault?' / 艦隊戦後に上陸支援':''}${area.terrain!=='open'?' / 両岸砲台に警戒':''}`;
  const kinds=[...new Set(area.waves.flat().map(e=>e.kind))];
  $('enemyList').innerHTML=kinds.map(k=>`<span>${ENEMY_TYPES[k].name}</span>`).join('')+(area.airRaid?.some(n=>n>0)?`<span>爆撃機 ${area.airRaid.reduce((a,b)=>a+b,0)}機</span>`:'')+(area.minefield?.count?'<span>機雷原</span>':'')+(area.shoreAssault?'<span>基地・戦車・航空基地</span>':'');
  const hasAir=area.airRaid?.some(n=>n>0)||kinds.some(k=>(ENEMY_TYPES[k].launchCount||0)>0)||Boolean(area.shoreAssault?.airfields);
  const airBalance=getAirBalance(area,state.upgrades);
  $('airBalanceNote').classList.toggle('hidden',!hasAir);
  $('airBalanceNote').textContent=area.tutorial?(area.tutorial.kind==='gunnery'?'教習：照準・発射・着弾を学びます。通常戦艦の主砲1門で始められます。':`教習：${area.tutorial.title}。必要な訓練用兵装と弾薬は出撃中だけ貸与します。購入は不要で、恒久装備・在庫はそのままです。`):(hasAir?`対空装備目安：Lv.${requirements.aa||1} / 現在Lv.${state.upgrades.aa||0}。この装備での敵機は同時最大${airBalance.maxAirborne}機。敵の編隊数は出撃時の対空装備に合わせて調整されます。`:'');
  $('airBalanceNote').classList.toggle('hidden',!hasAir&&!area.tutorial);
  const record=state.records[String(area.id)];$('areaRecord').textContent=record?`最高 ${record.bestScore.toLocaleString()}点 · 命中 ${record.bestAccuracy}% · 評価 ${record.rank} · 制圧 ${record.victories}回`:'未制圧の海域。勝利すると次の海域が解放されます。';
  $('loadout').textContent=`${state.aviation.hullMode==='hybrid'?`航空戦艦 · 搭載${Object.values(state.aviation.loadout).reduce((a,b)=>a+b,0)}/${campaign.aviationCapacity()}機`:'標準戦艦'} / 主砲${campaign.gunCount()}門：${state.guns.map((g,i)=>`第${i+1}門 ${WEAPONS[g.weapon].name}・出力${g.power}・給弾${g.reload}`).join(' / ')} / 船体状態 ${Math.round(state.hull)}% / 燃料庫 ${campaign.fuelCapacity()} / ${Object.entries(state.stock).map(([k,n])=>`${supplyNames[k]} ${n}`).join(' · ')}`;
  const deploy=campaign.canDeploy(chosenArea);$('deploy').disabled=!deploy.ok;$('deploymentStatus').textContent=deploy.ok?'装備・補給・船体確認完了。出撃できます。':deploy.reason;$('deploymentStatus').classList.toggle('warning',!deploy.ok);
  const focus=gunRequirementFocus(requirements),missing=Object.keys(requirements).filter(k=>['weapon','gunPower','reload'].includes(k)?(state.guns[focus][{weapon:'weapon',gunPower:'power',reload:'reload'}[k]]||0)<requirements[k]:(state.upgrades[k]||0)<requirements[k]);$('shopTab').classList.toggle('needed',missing.length>0);$('shopTab').textContent=missing.length?`強化パーツ · 必須${missing.length}`:'強化パーツ';
  const categories={weapon:'MAIN BATTERY / 砲弾系統',gunPower:'GUN POWER / 主砲出力',reload:'LOADER / 給弾',armor:'ARMOR / 装甲',special:'SPECIAL / 必殺技',aa:'AIR DEFENSE / 対空',radar:'FIRE CONTROL / レーダー',sonar:'DETECTION / ソナー',asw:'ANTI SUB / 対潜',fuelTank:'FUEL TANK / 燃料庫',propeller:'PROPULSION / スクリュー'};
  $('gunShopCards').innerHTML=renderGunShop(requirements,recommendations);
  $('shopCards').innerHTML=Object.keys(UPGRADES).filter(k=>!['weapon','gunPower','reload'].includes(k)).map(kind=>{
    const item=campaign.nextUpgrade(kind),need=(requirements[kind]||0)>(state.upgrades[kind]||0),recommended=!need&&(recommendations[kind]||0)>(state.upgrades[kind]||0),cls=need?'required':recommended?'recommended':'';
    if(!item)return `<article class="shop-card"><small>${categories[kind]}</small><h3>${kind==='weapon'?weapon().name:'最終強化'}</h3><p>この装備は最大まで強化済みです。</p><span class="maxed">装備済み</span></article>`;
    const locked=state.unlockedArea<item.unlockArea,label=locked?`第${item.unlockArea}海域で解放`:state.credits<item.price?`${item.price.toLocaleString()} C · 資金不足`:`${item.price.toLocaleString()} C で購入`;
    const note=need?`この作戦に必須：Lv.${requirements[kind]}まで準備してください。`:recommended?'この作戦に推奨：攻略を助ける装備です。':'';
    return `<article class="shop-card ${cls}"><small>${categories[kind]} · Lv.${item.level}</small><h3>${item.name}</h3>${note?`<strong class="requirement-note">${note}</strong>`:''}<p>${item.description}</p><button data-buy="${kind}" ${campaign.canBuy(kind)?'':'disabled'}>${need?'必須 · ':recommended?'推奨 · ':''}${label}</button></article>`;
  }).join('');
  const quote=campaign.repairQuote();$('condition').textContent=`船体状態 ${Math.round(state.hull)}% · ${Object.entries(state.damageZones).filter(([,n])=>n>2).map(([k,n])=>`${zoneNames[k]}損傷${Math.round(n)}%`).join(' / ')||'損傷なし'}`;
  $('repair').textContent=quote.cost?`全修理 ${quote.cost.toLocaleString()} C`:'修理済み';$('repair').disabled=!quote.cost||state.credits<quote.cost;
  $('repair').classList.toggle('needed',state.hull<65);$('repairNote').textContent=state.hull<35?'大破状態です。修理しないと出撃できません。':quote.cost?'損傷は次の出撃にも残ります。港で修理してください。':'船体・各部位とも健全です。';
  renderWorldMap();renderSupplies();renderAviationShop();updateSaveSummary();syncDamageVisual();
}
function renderAviationShop(){
  const state=campaign.state,a=state.aviation,capacity=campaign.aviationCapacity(),assigned=Object.values(a.loadout).reduce((n,x)=>n+x,0);
  const buyLabel=item=>state.unlockedArea<item.unlockArea?`第${item.unlockArea}海域で解放`:`${item.price.toLocaleString()} C${state.credits<item.price?' · 資金不足':' で購入'}`;
  if(!a.converted){const item=AVIATION_CONVERSION;$('aviationConversion').innerHTML=`<article class="aviation-refit"><div><small>航空戦艦への改装 · 一度だけ購入</small><h3>${item.name}</h3><p>後部に飛行甲板・格納庫を新設。迎撃機・爆撃機・戦闘機を各2機、航空弾150単位付きで配備します。主砲は残ります。</p></div><button data-air-convert ${state.unlockedArea<item.unlockArea||state.credits<item.price?'disabled':''}>${buyLabel(item)}</button></article>`;}
  else $('aviationConversion').innerHTML=`<article class="aviation-refit"><div><small>改装済み · 船体を無料で切り替え</small><h3>${a.hullMode==='hybrid'?'航空戦艦 朝日':'標準戦艦 朝日'}</h3><p>航空設備・主砲の個別強化・編成は保存されます。航空隊が飛ぶのは航空戦艦の時です。</p></div><div class="hull-mode-buttons"><button data-hull-mode="battleship" class="${a.hullMode==='battleship'?'active':''}">標準戦艦</button><button data-hull-mode="hybrid" class="${a.hullMode==='hybrid'?'active':''}">航空戦艦</button></div></article>`;
  const expansion=campaign.nextAviationUpgrade('capacity');
  $('aviationCapacity').innerHTML=`<article class="aviation-refit"><div><small>格納庫・飛行甲板 / Lv.${a.capacityLevel}</small><h3>搭載上限 ${capacity}機${expansion?` → ${expansion.capacity}機`: ' · 最大まで増設済み'}</h3><p>6 → 12 → 24 → 36 → 60機。航空隊を長く維持し、迎撃と爆撃の機数を増やせます。</p></div>${expansion?`<button data-air-buy="capacity" ${!a.converted||state.unlockedArea<expansion.unlockArea||state.credits<expansion.price?'disabled':''}>${!a.converted?'航空戦艦への改装が必要':buyLabel(expansion)}</button>`:'<span class="maxed">増設完了</span>'}</article>`;
  $('aviationCards').innerHTML=Object.entries(AIRCRAFT_TYPES).map(([kind,type])=>{
    const spec=aviationStats(kind,a.levels[kind]),item=campaign.nextAviationUpgrade(kind);
    return `<article class="shop-card"><small>${type.name} / Lv.${a.levels[kind]} / 5</small><h3>${spec.name}</h3><span class="air-tier">${spec.generation}</span><p>${type.description}</p><p class="air-stats">威力 ${spec.damage} · 耐久 ${spec.hp} · 速度 ${Math.round(spec.speed*10)}m/s<br>攻撃圏 ${Math.round(spec.range*10)}m · 帰艦後再装填 ${spec.rearm}秒</p>${item?`<p>次：${item.name}</p><button data-air-buy="${kind}" ${!a.converted||state.unlockedArea<item.unlockArea||state.credits<item.price?'disabled':''}>${!a.converted?'航空戦艦への改装が必要':buyLabel(item)}</button>`:'<span class="maxed">最新世代ステルス · 最終強化済み</span>'}</article>`;
  }).join('');
  $('airAllocationSummary').textContent=a.converted?`編成 ${assigned} / ${capacity}機 · 空き ${capacity-assigned}`:'改装後に編成できます';$('autoAirLoadout').disabled=!a.converted;
  $('airAllocation').innerHTML=Object.entries(AIRCRAFT_TYPES).map(([kind,type])=>`<div class="air-allocation-row"><label for="air-count-${kind}">${type.name}</label><input id="air-count-${kind}" data-air-role="${kind}" type="range" min="0" max="${capacity-(assigned-a.loadout[kind])}" step="1" value="${a.loadout[kind]}" aria-label="${type.name}の搭載数" ${a.converted?'':'disabled'}><output>${a.loadout[kind]}機</output></div>`).join('');
}
function applyAviationResult(result){if(!result)return;syncAuxiliary();renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');}
function launchAirWing(){if(uiMode!=='battle'||finished)return false;audio.unlock();const result=aviation.launch(enemies);if(result.reason)toast(result.reason,1.8);return result.ok;}
function gunRequirementFocus(requirements){
  const guns=campaign.state.guns;const deficit=g=>Math.max(0,(requirements.weapon||0)-g.weapon)*2+Math.max(0,(requirements.gunPower||0)-g.power)+Math.max(0,(requirements.reload||0)-g.reload);
  return guns.reduce((best,g,i)=>deficit(g)<deficit(guns[best])?i:best,0);
}
function renderGunShop(requirements,recommendations){
  const state=campaign.state,expansion=campaign.nextGunExpansion(),readyGun=state.guns.findIndex((g,i)=>campaign.gunMeetsRequirements(i,requirements));
  const focus=readyGun>=0?readyGun:gunRequirementFocus(requirements);
  const cards=state.guns.map((g,i)=>`<section class="gun-upgrade-group"><header><small>MAIN GUN ${String(i+1).padStart(2,'0')}</small><h3>第${i+1}門 · ${WEAPONS[g.weapon].name}</h3><span>出力 ${g.power}/3 · 給弾 ${g.reload}/3</span></header><div class="gun-upgrade-cards">${['weapon','gunPower','reload'].map(kind=>{
    const field={weapon:'weapon',gunPower:'power',reload:'reload'}[kind],item=campaign.nextGunUpgrade(i,kind),need=readyGun<0&&i===focus&&g[field]<(requirements[kind]||0),recommended=!need&&i===focus&&g[field]<(recommendations[kind]||0),cls=need?'required':recommended?'recommended':'';
    if(!item)return `<article class="shop-card"><small>${{weapon:'弾種',gunPower:'主砲機構',reload:'給弾'}[kind]}</small><h3>最終強化済み</h3><span class="maxed">第${i+1}門に装備済み</span></article>`;
    const locked=state.unlockedArea<item.unlockArea,label=locked?`第${item.unlockArea}海域で解放`:`${item.price.toLocaleString()} C${state.credits<item.price?' · 資金不足':' で購入'}`;
    return `<article class="shop-card ${cls}"><small>第${i+1}門 / Lv.${item.level}</small><h3>${item.name}</h3>${need?`<strong class="requirement-note">この門をLv.${requirements[kind]}へ。必須主砲と機構は同じ門に揃えてください。</strong>`:recommended?'<strong class="requirement-note">この作戦の主力砲におすすめ</strong>':''}<p>${item.description}</p><button data-gun-buy="${kind}" data-gun-index="${i}" ${locked||state.credits<item.price?'disabled':''}>${need?'必須 · ':''}${label}</button></article>`;
  }).join('')}</div></section>`).join('');
  const addition=expansion?`<article class="gun-expansion"><div><small>BATTERY EXPANSION / ${campaign.gunCount()} → ${expansion.level}門</small><h3>${expansion.name}</h3><p>${expansion.description} 新しい門は通常砲弾から始まります。</p></div><button data-add-gun="true" ${state.unlockedArea<expansion.unlockArea||state.credits<expansion.price?'disabled':''}>${state.unlockedArea<expansion.unlockArea?`第${expansion.unlockArea}海域で解放`:`${expansion.price.toLocaleString()} C で増設`}</button></article>`:'<p class="gun-expansion">4門すべて増設済み。各門の兵装を個別に強化できます。</p>';
  return addition+cards;
}
function openHarbor(tab='map'){
  if(['battle','pause','review','result'].includes(uiMode)&&maxHP>0)saveCondition();reviewActive=false;reviewPending=false;
  holdFire=false;aimPointer=null;keys.clear();salvoQueue=[];finished=true;charge=null;
  campaign.save();
  audio.pause(false);cleanupBattle();syncAuxiliary();harborTab=tab;worldPart=AREAS[chosenArea-1].part;setScreen('harbor');renderHarbor();$('shopMessage').textContent='';
}
function attachEnemy(model,kind,spec,x,z,extra={}){
  model.root.position.x=x;model.root.position.z=z;scene.add(model.root);
  const marker=document.createElement('div');marker.className='enemy-marker';marker.innerHTML=`<span>${spec.name}</span><div class="enemy-hp"><i></i></div>`;$('markers').append(marker);
  const e={...model,id:++enemyCounter,kind,spec,marker,hp:spec.hp,maxHP:spec.hp,attack:spec.attackInterval+Math.random()*2,phase:Math.random()*10,sinking:0,dead:false,removed:false,smokeTimer:0,detected:kind!=='submarine',velocity:new THREE.Vector3(),...extra};
  enemies.push(e);threats.registerShip(e);return e;
}
function makeEnemy(x,z,kind,depth){
  const original=ENEMY_TYPES[kind],area=AREAS[activeArea-1],scale=area.enemyScale||1;
  const spec={...original,hp:Math.ceil(original.hp*scale),damage:original.damage*Math.sqrt(scale),attackInterval:original.attackInterval/Math.sqrt(scale),score:Math.round(original.score*scale)};
  return attachEnemy(createWarship(kind,kit),kind,spec,x+maneuver.position.x,z+maneuver.position.z,{depth:depth??8});
}
function addShore(model){return attachEnemy(model,model.kind,model.spec,model.root.position.x,model.root.position.z,{isShore:true,activeAfter:model.activeAfter||0,spawnedAt:gameTime});}
function removeEnemy(e){
  if(e.removed)return;scene.remove(e.root);e.marker.remove();
  e.root.traverse(node=>{if(node.geometry)node.geometry.dispose();});
  for(const mat of e.ownedMaterials)mat.dispose();for(const tex of e.ownedTextures)tex.dispose();e.removed=true;
}
function spawnWave(){
  wave++;waveWait=0;const area=AREAS[activeArea-1],formation=area.waves[wave-1];
  formation.forEach((position,index)=>{
    let x=position.x,z=position.z;
    if(area.engagement==='broadside'&&position.kind!=='submarine'){x=98+index*13;z=-65+(index-(formation.length-1)/2)*32;}
    if(area.engagement==='crossing'&&position.kind!=='submarine'){x=(index%2?1:-1)*(105+index*17);z=-145-index*13;}
    if(area.terrainSpec&&position.kind!=='submarine'){x=(index%2?1:-1)*(area.terrainSpec.bankDistance-18);z=-110-index*42;}
    const e=makeEnemy(x,z,position.kind,position.depth);
    if(position.kind!=='submarine'){
      if(area.terrainSpec){e.velocity.set(0,0,e.spec.speed*.65);e.root.rotation.y=0;}
      else if(area.engagement==='broadside'){e.velocity.set(0,0,-(maneuver.speed+(.8+index*.6)));e.root.rotation.y=Math.PI;}
      else if(area.engagement==='crossing'){e.velocity.set(x<0?3.2+index*.2:-3.2-index*.2,0,-maneuver.speed*.55);e.root.rotation.y=x<0?Math.PI/2:-Math.PI/2;}
      else e.velocity.set(0,0,e.spec.speed);
      e.root.rotation.y=Math.atan2(e.velocity.x,e.velocity.z);
    }
  });
  if(area.airRaid?.[wave-1])threats.spawnAirRaid(area.airRaid[wave-1]);
  if(wave===1&&area.minefield?.count)threats.spawnMines(area.minefield.count);
  $('wave').textContent=`第${area.part}部 · ${area.id}海域 · ${wave}/${area.waves.length}波`;
  toast(wave===1?`第${area.id}海域　${area.name}`:'敵の増援を捕捉',2.8);audio.morse('CQ');
  const visibleFleet=enemies.filter(e=>!e.dead&&!e.isShore&&e.kind!=='submarine');
  if(visibleFleet.length){scene.updateMatrixWorld(true);const focus=weakPosition(visibleFleet[Math.floor(visibleFleet.length/2)]),from=maneuver.position.clone().add(new THREE.Vector3(0,13,9.5)),delta=focus.sub(from);yaw=Math.atan2(-delta.x,-delta.z);pitch=clamp(Math.atan2(delta.y,Math.hypot(delta.x,delta.z)),-.3,.2);}
  tutorialWave();
}
function cleanupBattle(){
  tutorial=null;
  threats.reset();aviation.reset();battlefield.reset();selectedContact=null;
  for(const e of enemies)removeEnemy(e);enemies.length=0;
  for(const s of shots)scene.remove(s.ball);shots.length=0;
  for(const e of effects)removeEffect(e);effects.length=0;
}
function beginArea(id=chosenArea){
  if(['battle','pause'].includes(uiMode))saveCondition();
  const parsed=Number(id);if(!Number.isInteger(parsed)||parsed<1||parsed>campaign.state.unlockedArea)return false;
  const check=campaign.canDeploy(parsed);if(!check.ok){$('shopMessage').textContent=check.reason;toast(check.reason,3);return false;}
  audio.pause(false);cleanupBattle();activeArea=chosenArea=parsed;
  const training=AREAS[parsed-1].tutorial;
  if(training){const loans=campaign.tutorialEquipment(parsed);tutorial={kind:training.kind,title:training.title,loans,stock:{...loans.stock},step:'',holding:false,window:false,age:0};}
  maxHP=100+campaign.state.upgrades.armor*30;hp=maxHP*campaign.state.hull/100;zones={...campaign.state.damageZones};kills=0;wave=0;waveWait=0;gameTime=0;
  Object.assign(maneuver,{speed:1.6+.65*(campaign.state.upgrades.propeller||0),speedMode:'cruise',boost:false,evading:false,evadeWindow:false,evadeTimer:0,evadeCooldown:0,side:0,rollKick:0,pitchKick:0});maneuver.position.set(0,0,0);maneuver.velocity.set(0,0,-maneuver.speed);
  yaw=0;pitch=-.018;shake=0;damage=0;energyFlash=0;finished=false;started=true;paused=false;holdFire=false;aimPointer=null;salvoQueue=[];specialUsed=false;charge=null;keys.clear();morseCooldown=0;
  stats={shots:0,hits:0,kills:0,killScore:0,time:0,hull:campaign.state.hull,airKills:0,airScore:0,shoreKills:0,shoreScore:0,landingIntegrity:100};lastResult=null;dragonUses=0;fuelTimer=0;reviewActive=false;reviewPending=false;battlePhase='naval';assaultTime=0;landingArrival=0;landingIntegrity=100;weaponMode='main';advancedOpen=false;
  syncAuxiliary();syncDamageVisual();for(const g of guns){g.cooldown=0;g.recoil=0;}selected=0;
  const area=AREAS[activeArea-1];setWeather(area);rangeSetting=[80,120,180].filter(n=>n<=detectionRange()).at(-1)||80;
  setScreen('battle');updateHullHUD();for(const model of battlefield.prepare(area))addShore(model);spawnWave();return true;
}
function setWeather(area){
  weather={...area.weather,radarFactor:area.weather.weather==='rain'||area.weather.weather==='storm'?.7:1};
  const night=weather.timeOfDay==='night',morning=weather.timeOfDay==='dawn',wet=weather.weather==='rain'||weather.weather==='storm';
  scene.fog.color.setHex(night?0x1b2e45:morning?0x9f9290:wet?0x7c8e99:area.fogTint);scene.fog.density=wet?.0028:.0015;
  waterMat.uniforms.seaTint.value.setHex(area.seaTint);waterMat.uniforms.fogTint.value.copy(scene.fog.color);waterMat.uniforms.waveStrength.value=1+weather.seaState*1.7;waterMat.uniforms.lightLevel.value=night?.42:wet?.68:1;
  skyMat.uniforms.skyTone.value.setRGB(night?.24:morning?1:.85,night?.32:morning?.77:wet?.8:1,night?.49:morning?.66:1);skyMat.uniforms.cloudCover.value=wet?1.18:weather.weather==='clear'?.62:1;
  sun.intensity=night?.62:wet?1.1:morning?2.25:2.45;sun.color.setHex(morning?0xffbd87:night?0x9cb6e3:0xffe4bd);hemisphere.intensity=night?1.12:wet?1.25:1.25;scene.environmentIntensity=night?.35:wet?.65:.78;
}
function syncDamageVisual(){for(const [key,group] of Object.entries(damageVisuals)){const amount=zones[key]||0;group.visible=amount>3;group.scale.setScalar(.65+amount/70);}}
function saveCondition(){campaign.setHullCondition(clamp(hp/maxHP*100,0,100),zones);}
function tickManeuver(dt){
  const level=campaign.state.upgrades.propeller||0,bank=AREAS[activeArea-1].terrainSpec?.bankDistance;
  maneuver.evadeCooldown=Math.max(0,maneuver.evadeCooldown-dt);maneuver.rollKick*=Math.exp(-dt*1.8);maneuver.pitchKick*=Math.exp(-dt*2.1);
  maneuver.evadeTimer=Math.max(0,maneuver.evadeTimer-dt);maneuver.evading=maneuver.evadeTimer>0;
  const age=2-maneuver.evadeTimer;maneuver.evadeWindow=maneuver.evading&&age>.15&&age<.65+level*.12;
  const speedFactor=maneuver.boost?1.5:maneuver.speedMode==='slow'?.55:1;
  maneuver.velocity.set(maneuver.evading?maneuver.side*(10+level*2)*Math.sin(Math.PI*clamp(age/2,0,1)):0,0,-maneuver.speed*speedFactor);
  maneuver.position.addScaledVector(maneuver.velocity,dt);if(AREAS[activeArea-1].shoreAssault&&maneuver.position.z<-38){maneuver.position.z=-38;maneuver.velocity.z=0;}if(bank)maneuver.position.x=clamp(maneuver.position.x,-bank+18,bank-18);
  damageSmokeTimer-=dt;if(damageSmokeTimer<=0){if(uiMode==='battle'||reviewActive)for(const [key,group] of Object.entries(damageVisuals))if(group.visible)puff(group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0,1,0)),1,0x252b31,.6+(zones[key]||0)/100);damageSmokeTimer=1.3;}
}
function evade(side){
  if(uiMode!=='battle'||finished||tutorial?.holding||maneuver.evadeCooldown>0)return false;
  if(!consumeBattle('fuel',3)){toast('回避用の燃料が不足しています。');return false;}
  maneuver.side=side;maneuver.evadeTimer=2;maneuver.evadeCooldown=12-(campaign.state.upgrades.propeller||0)*1.6;maneuver.rollKick=side*.07;
  toast(side<0?'左へ回避 · 着弾直前に合わせよう':'右へ回避 · 着弾直前に合わせよう',1.3);return true;
}
function setSpeedMode(mode){
  if(uiMode!=='battle'||finished||tutorial?.holding||!['slow','cruise','full'].includes(mode))return false;
  maneuver.speedMode=mode;maneuver.boost=mode==='full';
  toast(mode==='full'?'全速前進 · 速度1.5倍 / 燃料消費2倍':mode==='slow'?'低速航行 · 速度55% / 燃料消費半分':'巡航 · 標準速度 / 標準燃料消費',1.3);
  return true;
}
function changeSpeed(step){
  const modes=['slow','cruise','full'],index=Math.max(0,modes.indexOf(maneuver.speedMode));
  return setSpeedMode(modes[clamp(index+Math.sign(step),0,2)]);
}
function beginAssault(){
  battlePhase='shore';assaultTime=0;waveWait=0;const area=AREAS[activeArea-1];battlefield.startAssault();
  for(const model of battlefield.assaultTargets(area))addShore(model);
  const count=area.shoreAssault?.airfields?3*area.part:0;if(count)threats.spawnAirRaid(count);
  yaw=0;pitch=-.045;toast('上陸支援開始！ 到着までに岸砲台・戦車・航空基地を制圧せよ',3);audio.morse('LAND');
}
function updateCamera(){
  sky.position.copy(maneuver.position);water.position.x=maneuver.position.x;water.position.z=maneuver.position.z;waterMat.uniforms.shipXZ.value.set(maneuver.position.x,maneuver.position.z);waterMat.uniforms.shipSpeed.value=maneuver.velocity.length();sun.position.copy(sunDirection).multiplyScalar(150).add(maneuver.position);sun.target.position.copy(maneuver.position).z+=25;
  const sea=weather.seaState||.35,roll=Math.sin(elapsed*.91)*.012*sea+Math.sin(elapsed*1.83)*.006*sea+maneuver.rollKick;
  const heave=Math.sin(elapsed*.76)*(.12+sea*.3),swell=Math.sin(elapsed*.62)*.01*sea+maneuver.pitchKick;
  ship.position.copy(maneuver.position);ship.position.y=heave;ship.rotation.set(swell,maneuver.evading?maneuver.side*.1*Math.sin(maneuver.evadeTimer):0,roll);
  if(reviewActive){const angle=reviewTime*Math.PI/4+Math.PI*.73;camera.position.set(ship.position.x+Math.sin(angle)*112,ship.position.y+48,ship.position.z+24+Math.cos(angle)*112);camera.lookAt(ship.position.clone().add(new THREE.Vector3(0,6,24)));camera.updateMatrixWorld(true);return;}
  camera.position.set(ship.position.x,13+ship.position.y,ship.position.z+9.5);camera.rotation.order='YXZ';
  camera.rotation.set(pitch+swell*.75+(Math.random()-.5)*shake*.013,yaw+(Math.random()-.5)*shake*.008,roll*.8);
  const merge=charge?clamp(charge.time/1.25,0,1)*(charge.fired?clamp(1-(charge.time-1.4)/.9,0,1):1):0;
  turretYaw.rotation.y=yaw-ship.rotation.y;turretElevation.rotation.x=clamp(pitch+.012,-.3,.25);
  for(const g of guns){const tier=gunLoadout(g.index).weapon;g.barrel.position.z=g.recoil*.92;g.flash.intensity=g.recoil>.75?48:0;for(const r of g.energy)r.visible=tier>=3||merge>0;g.reactor.visible=tier>=4||merge>.1;}
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
function fire(index=selected,voice=true){
  if(uiMode!=='battle'||finished||charge||tutorial?.holding)return false;
  const g=guns[index];if(!g||index>=campaign.gunCount()||g.cooldown>0)return false;
  if(!consumeBattle('shell')){toast('主砲弾不足。港で補給してください。',2);return false;}
  tutorialEvent('main-fired');
  const w=weapon(index),radar=campaign.state.upgrades.radar||0;
  g.cooldown=reloadTime(index);g.recoil=1;shake=Math.min(2.1,shake+.8);maneuver.pitchKick-=.023;maneuver.rollKick+=(index-(campaign.gunCount()-1)/2)*.008;stats.shots++;if(voice)audio.fireCommand?.(false);
  scene.updateMatrixWorld(true);const origin=g.barrel.localToWorld(new THREE.Vector3(0,0,MUZZLE_Z)),target=findTarget();
  const maxRange=detectionRange()*(1+.12*gunLoadout(index).power);
  const distance=clamp(target?camera.position.distanceTo(weakPosition(target)):rangeSetting,30,maxRange);
  const direction=camera.getWorldDirection(new THREE.Vector3());
  let dest=camera.position.clone().addScaledVector(direction,distance),flight=origin.distanceTo(dest)/w.speed;
  // Basic radar supplies range only: aim, velocity, waves and wind still decide the hit.
  // The final fire-control upgrade predicts motion and compensates crosswind.
  if(target&&radar>=3){dest=weakPosition(target).addScaledVector(target.velocity,flight);dest.x-=weather.windX*flight*flight*.5;dest.z-=weather.windZ*flight*flight*.5;}
  const dispersion=radar>=3?.03:(.07+distance*distance*.000006)*(1+weather.seaState*.35);
  dest.x+=(Math.random()-.5)*dispersion;dest.y+=(Math.random()-.5)*dispersion*.4;
  blast(origin,w.beam?1.5:1.15);puff(origin,7,0xc5c6bb,.55);
  if(w.beam){
    const far=origin.clone().addScaledVector(dest.clone().sub(origin).normalize(),maxRange);
    const impacts=enemies.filter(e=>!e.dead&&e.kind!=='submarine').map(e=>({e,point:shipIntersection(origin,far,e)})).filter(x=>x.point).sort((a,b)=>a.point.distanceTo(origin)-b.point.distanceTo(origin));
    const hit=impacts[0],end=hit?hit.point:far;
    beamBetween(origin,end,w.beam,w.tier===4?.38:.1,.32);beamBetween(origin,end,0xe4ffff,.07,.2);audio.beam((index-(campaign.gunCount()-1)/2)*.38);energyFlash=.18;
    if(hit){stats.hits++;hitEnemy(hit.e,hit.point,w.damage,w.critical);}else {end.y=.2;splash(end,1.3);}
    return true;
  }
  const velocity=dest.clone().sub(origin);flight=velocity.length()/w.speed;velocity.divideScalar(flight);velocity.y+=.5*5*flight;
  const ball=new THREE.Mesh(shellGeo,shellMaterials[w.tier]);ball.position.copy(origin);if(w.splash)ball.scale.setScalar(1.5);scene.add(ball);
  shots.push({ball,velocity,life:Math.min(12,maxRange/w.speed+.65),enemy:false,prev:origin.clone(),damage:w.damage,splash:w.splash||0,origin:origin.clone(),maxRange,proximity:radar>=3?3.5:0,weaponTier:w.tier,critical:w.critical});audio.fire((index-(campaign.gunCount()-1)/2)*.38);return true;
}
function fireSelected(){
  if(uiMode!=='battle'||finished||charge||salvoQueue.length)return false;
  const fired=fire(selected);if(fired)selected=(selected+1)%campaign.gunCount();return fired;
}

function salvo(){
  if(uiMode!=='battle'||finished||charge||weaponMode!=='main')return false;
  let n=0;for(let i=0;i<campaign.gunCount();i++)if(guns[i].cooldown<=0&&!salvoQueue.some(q=>q.index===i)){salvoQueue.push({index:i,delay:0});n++;}
  if(n){audio.fireCommand?.(true);toast(`${n}門斉射`,1);}else toast('装填中',.7);return n>0;
}
function enemyFire(e){
  const muzzle=e.muzzleOffsets[Math.floor(Math.random()*e.muzzleOffsets.length)]||new THREE.Vector3(0,3,8),origin=e.root.localToWorld(muzzle.clone());
  const t=origin.distanceTo(maneuver.position)/76;
  const target=maneuver.position.clone().add(new THREE.Vector3((Math.random()-.5)*14,2.7,8+(Math.random()-.5)*16)).addScaledVector(maneuver.velocity,t*.65);
  const velocity=target.sub(origin);velocity.divideScalar(t||.1);velocity.y+=.5*5*t;
  const ball=new THREE.Mesh(shellGeo,shellMaterials[0]);ball.position.copy(origin);scene.add(ball);shots.push({ball,velocity,life:9,enemy:true,damage:e.spec.damage,prev:origin.clone()});blast(origin,.6);
}

function sinkEnemy(e,critical=false,notify=true){
  if(e.dead)return false;e.dead=true;e.root.visible=true;e.sinking=0;e.marker.remove();
  if(e.kind==='submarine')tutorialEvent('sub-sunk');
  if(e.isShore){stats.shoreKills=(stats.shoreKills||0)+1;stats.shoreScore=(stats.shoreScore||0)+e.spec.score;}
  else{kills++;stats.kills=kills;stats.killScore+=e.spec.score;}
  const weak=weakPosition(e);if(e.kind==='submarine')weak.y=.5;puff(weak,12,0x565b58,1.8);blast(weak,2.1);audio.sinking(clamp((e.root.position.x-maneuver.position.x)/80,-1,1),camera.position.distanceTo(e.root.position)*10);
  if(notify){toast(e.isShore?`${e.spec.name}壊滅！`:critical?'機関部直撃 · 敵艦撃沈！':'敵艦撃沈！',1.6);if(!e.isShore)audio.sunk(e.kind);if(morseCooldown<=0){audio.morse(e.isShore?'CLEAR':'SUNK');morseCooldown=2.7;}}
  return true;
}

function hitEnemy(e,point,amount=weapon().damage,criticalMultiplier=weapon().critical){
  if(e.dead)return false;const weak=weakPosition(e);const critical=point.distanceTo(weak)<2.6;
  e.hp-=amount*(critical?criticalMultiplier:1);shake=Math.max(shake,.2);
  blast(point,1.2);puff(point,7,0x7c7d77,1.0);audio.impact(clamp(e.root.position.x/80,-1,1),false);
  if(e.hp<=0)sinkEnemy(e,critical);else{e.marker.querySelector('i').style.width=`${e.hp/e.maxHP*100}%`;toast(critical?'機関部直撃':'命中',.7);}return true;
}
function updateHullHUD(){
  $('hpText').textContent=`${Math.ceil(hp)}/${maxHP}`;$('hpBar').style.width=`${hp/maxHP*100}%`;$('hpBar').style.background=hp/maxHP<.3?'#d98563':'#b6cbbc';
}
function damageHull(amount=8,detail={}){
  if(finished)return false;
  let zone=detail.location;
  if(!zoneNames[zone]){const local=detail.position?detail.position.clone().sub(maneuver.position):new THREE.Vector3();zone=local.z<-8?'bow':local.z>32?'stern':local.y>8?'bridge':Math.abs(local.x)>4?(local.x<0?'port':'starboard'):'engine';}
  hp=Math.max(0,hp-amount);zones[zone]=clamp((zones[zone]||0)+amount/maxHP*140+4,0,100);
  damage=.85;shake=Math.min(2.6,shake+1);maneuver.rollKick+=(zone==='port'?-1:zone==='starboard'?1:Math.random()>.5?1:-1)*.095;maneuver.pitchKick+=zone==='bow'?.052:-.032;
  updateHullHUD();syncDamageVisual();audio.impact(0,false);audio.hitReport(zone);toast(`${zoneNames[zone]}被弾！`,1.3);
  if(hp<=0)endGame(false);return true;
}

function shipIntersection(from,to,e){
  // Long hulls use a box rather than one enormous sphere, keeping near misses honest.
  const a=e.root.worldToLocal(from.clone()),b=e.root.worldToLocal(to.clone());const d=b.clone().sub(a),length=d.length();if(length<.001)return null;
  const box=new THREE.Box3(new THREE.Vector3(-e.hullWidth/2-.25,.15,-e.hullLength/2),new THREE.Vector3(e.hullWidth/2+.25,e.markerHeight-2,e.hullLength/2));
  if(!box.containsPoint(a)){const broadHit=new THREE.Ray(a,d.normalize()).intersectBox(box,new THREE.Vector3());if(!broadHit||broadHit.distanceTo(a)>length)return null;}
  combatRaycaster.set(from,to.clone().sub(from).normalize());combatRaycaster.near=0;combatRaycaster.far=length+.01;
  const hit=combatRaycaster.intersectObject(e.root,true).find(x=>x.object.isMesh&&x.point.y>.15);return hit?.point||null;
}
function cleanShot(i){scene.remove(shots[i].ball);shots.splice(i,1);}
function fireDragon(){
  const upgrades=battleUpgrades(),limit=upgrades.special>=2?2:1;
  if(tutorial?.kind==='dragon'&&!tutorial.window){toast('訓練中：敵機群が揃い、「今だ！」の合図が出るまで待て。',2);return false;}
  if(uiMode!=='battle'||finished||charge||!upgrades.special||dragonUses>=limit||(!tutorial?.window&&!enemies.some(e=>!e.dead&&!e.isShore&&e.kind!=='submarine')&&!threats.stats.airborne))return false;
  if(!consumeBattle('dragon')){toast('龍神弾がありません。港で補給してください。');return false;}
  if(tutorial?.kind==='dragon'){tutorial.window=false;tutorial.holding=false;tutorial.step='charging';}
  dragonUses++;specialUsed=dragonUses>=limit;holdFire=false;salvoQueue=[];charge={time:0,fired:false};yaw=0;pitch=-.018;audio.special();audio.announce('全主砲、連結！ 龍神砲、発射準備！');toast(`龍神砲 充填 · ${dragonUses}/${limit}回`,2);return true;
}
function dragonBlast(){
  const start=maneuver.position.clone().add(new THREE.Vector3(0,4.8,-8));const target=start.clone().add(new THREE.Vector3(0,2,-450));
  for(const g of guns.slice(0,campaign.gunCount())){const from=g.barrel.localToWorld(new THREE.Vector3(0,0,MUZZLE_Z));beamBetween(from,start,0x81f6e6,.3,.8);g.recoil=1;g.cooldown=reloadTime(g.index);}
  beamBetween(start,target,0x55dfeb,3.6,1.3);beamBetween(start,target,0xd7ffff,1.4,.9);
  for(let side=0;side<2;side++){
    const points=[];for(let j=0;j<=32;j++){const z=-8-j*11;points.push(maneuver.position.clone().add(new THREE.Vector3(Math.sin(j*.5+side*Math.PI)*5,5.4+Math.cos(j*.5+side*Math.PI)*2,z)));}
    const dragon=new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),48,.65,5,false),new THREE.MeshBasicMaterial({color:side?0xf3dba0:0x63ffdd,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));effect(dragon,1.5,new THREE.Vector3(),0,0,true);
  }
  const crest=new THREE.Mesh(new THREE.ConeGeometry(4.5,16,7),new THREE.MeshBasicMaterial({color:0x7bffff,transparent:true,opacity:.8,blending:THREE.AdditiveBlending,depthWrite:false}));crest.rotation.x=-Math.PI/2;crest.position.copy(maneuver.position).add(new THREE.Vector3(0,6,-33));effect(crest,1.1,new THREE.Vector3(0,0,-115),0,0,true);
  energyFlash=.9;shake=2.2;
  let sunk=0;for(const e of enemies)if(!e.dead&&!e.isShore&&e.kind!=='submarine'){sinkEnemy(e,false,false);splash(e.root.position,1.6);sunk++;}
  const planes=threats.dragonSweep();
  if(tutorial?.kind==='dragon'){tutorial.step='complete';tutorial.age=0;}
  toast(`龍神砲　敵艦${sunk}隻・航空機${planes}機撃破`,2.8);if(sunk)audio.sunk();audio.morse('SUNK');morseCooldown=2.7;
}
function enemyNavFrame(){
  const heading=Number.isFinite(maneuver.heading)?maneuver.heading:ship.rotation.y;
  const forward=new THREE.Vector3(-Math.sin(heading),0,-Math.cos(heading)),right=new THREE.Vector3(-forward.z,0,forward.x);
  return {forward,right,center:maneuver.position.clone().addScaledVector(forward,-24.5)};
}
function enemyNavCoordinates(position,frame){
  const delta=position.clone().sub(frame.center);return {side:delta.dot(frame.right),ahead:delta.dot(frame.forward)};
}
function enemyNavWaypoint(frame,side,ahead){return frame.center.clone().addScaledVector(frame.right,side).addScaledVector(frame.forward,ahead);}
function turnEnemyContinuously(e,nav,nextPhase,area,frame){
  nav.phase='turn';nav.nextPhase=nextPhase;nav.turnRemaining=Math.PI;
  const derivative=new THREE.Vector3(Math.cos(nav.heading),0,-Math.sin(nav.heading)),away=frame.right.clone().multiplyScalar(nav.side);
  nav.turnSign=Math.sign(derivative.dot(away))||nav.side;
  // Strait/canal turns use the inner half of the channel, after the player has
  // passed. They never wrap across land or clamp a ship into a different place.
  if(area.terrainSpec){nav.turnSign=-nav.turnSign;nav.side=-nav.side;}
}
function aimNavigatingEnemyTurrets(e,dt){
  if(!e.turrets?.length)return;
  const localTarget=e.root.worldToLocal(maneuver.position.clone().add(new THREE.Vector3(0,3,20)));
  for(const turret of e.turrets){
    const delta=localTarget.clone().sub(turret.group.position),desired=Math.atan2(delta.x,delta.z);
    const difference=Math.atan2(Math.sin(desired-turret.group.rotation.y),Math.cos(desired-turret.group.rotation.y));
    turret.group.rotation.y+=clamp(difference,-dt*.85,dt*.85);
    turret.group.updateMatrix();
    for(const muzzle of turret.muzzles){
      const world=turret.group.localToWorld(muzzle.local.clone());e.muzzleOffsets[muzzle.index].copy(e.root.worldToLocal(world));
    }
  }
}
function ramPlayerLocal(position){
  const heading=Number.isFinite(maneuver.heading)?maneuver.heading:ship.rotation.y,delta=position.clone().sub(maneuver.position),c=Math.cos(heading),s=Math.sin(heading);
  return new THREE.Vector3(delta.x*c-delta.z*s,delta.y,delta.x*s+delta.z*c);
}
function ramContactPoint(previous,current,beam=0){
  const from=ramPlayerLocal(previous),to=ramPlayerLocal(current),delta=to.clone().sub(from),length=delta.length();
  const hull=new THREE.Box3(new THREE.Vector3(-11.2-beam,-8,-42),new THREE.Vector3(11.2+beam,12,91));
  let local=hull.containsPoint(to)?to:null;
  if(!local&&length>.001){const intersection=new THREE.Ray(from,delta.clone().normalize()).intersectBox(hull,new THREE.Vector3());if(intersection&&intersection.distanceTo(from)<=length+.001)local=intersection;}
  if(!local)return null;
  const heading=Number.isFinite(maneuver.heading)?maneuver.heading:ship.rotation.y,c=Math.cos(heading),s=Math.sin(heading);
  return {local,world:new THREE.Vector3(local.x*c+local.z*s,local.y,-local.x*s+local.z*c).add(maneuver.position)};
}
function ramBodyContactPoint(e){
  const frame=enemyNavFrame(),heading=e.navigation.heading,forward=new THREE.Vector3(Math.sin(heading),0,Math.cos(heading)),right=new THREE.Vector3(forward.z,0,-forward.x),delta=e.root.position.clone().sub(frame.center);
  for(const axis of [frame.right,frame.forward,right,forward]){
    const playerExtent=11.2*Math.abs(frame.right.dot(axis))+66.5*Math.abs(frame.forward.dot(axis));
    const enemyExtent=e.hullWidth*.5*Math.abs(right.dot(axis))+e.hullLength*.5*Math.abs(forward.dot(axis));
    if(Math.abs(delta.dot(axis))>playerExtent+enemyExtent)return null;
  }
  const local=ramPlayerLocal(e.root.position);local.x=clamp(local.x,-11.2,11.2);local.z=clamp(local.z,-42,91);local.y=.9;
  const yaw=Number.isFinite(maneuver.heading)?maneuver.heading:ship.rotation.y,c=Math.cos(yaw),s=Math.sin(yaw);
  return {local,world:new THREE.Vector3(local.x*c+local.z*s,local.y,-local.x*s+local.z*c).add(maneuver.position)};
}
function resolveRamEnemyContact(e,nav,previousBow,currentBow){
  if(nav.ramResolved||e.dead)return false;
  const contact=ramContactPoint(previousBow,currentBow,e.hullWidth*.18)||ramBodyContactPoint(e);if(!contact)return false;
  nav.ramResolved=true;
  if(maneuver.evadeWindow){stats.ramEvades=(stats.ramEvades||0)+1;toast('突撃艦の体当たりを回避！',1.5);nav.phase='ramPass';return false;}
  const zone=contact.local.z<-8?'bow':contact.local.z>32?'stern':contact.local.x<0?'port':'starboard';
  blast(contact.world,2.2);puff(contact.world,8,0x505459,1.4);splash(contact.world,1.8);
  stats.ramHits=(stats.ramHits||0)+1;sinkEnemy(e,false,false);
  // Collision damage is a fraction of maximum hull integrity, including armor
  // upgrades. It is never scaled by stage damage or reduced as a cannon hit.
  damageHull(maxHP*.8,{kind:'ram',bypassArmor:true,position:contact.world,location:zone});
  return true;
}
function tickEnemyNavigation(e,dt,area){
  if(e.dead)return;
  const step=Math.min(.04,Math.max(0,dt)),frame=enemyNavFrame(),coordinates=enemyNavCoordinates(e.root.position,frame),ramming=e.kind==='ramship'||e.spec.ramming;
  if(!e.navigation){
    const mode=area.terrainSpec?'front':area.engagement||'front',side=Math.abs(coordinates.side)>8?Math.sign(coordinates.side):(e.id%2?1:-1),baseSpeed=Math.max(.6,ramming?e.spec.speed:(e.velocity.length()||e.spec.speed||1));
    const lane=area.terrainSpec?Math.min(32,area.terrainSpec.bankDistance-21):32+(e.id%4)*4;
    e.navigation={mode,side,lane,parallelLane:Math.max(55,Math.abs(coordinates.side)),crossTarget:coordinates.side<0?1:-1,
      heading:Math.atan2(e.velocity.x,e.velocity.z),speed:baseSpeed,baseSpeed,phase:ramming?'ramApproach':mode==='broadside'?'parallel':mode==='crossing'?'cross':'approach',ramResolved:false,ramLocked:false};
  }
  const nav=e.navigation,oldPosition=e.root.position.clone(),oldHeading=nav.heading;
  const bowOffset=e.ramBowOffset||new THREE.Vector3(0,.9,e.hullLength/2);
  const previousBow=bowOffset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),oldHeading).add(oldPosition);
  const turnRate=ramming?.26:e.kind==='battleship'?.14:e.kind.includes('carrier')?.16:.23;
  let target=null,desired=nav.heading;
  if(nav.phase==='turn'){
    const angle=Math.min(nav.turnRemaining,turnRate*step);nav.heading+=nav.turnSign*angle;nav.turnRemaining-=angle;
    if(nav.turnRemaining<=.0001){nav.phase=nav.nextPhase;if(ramming){nav.ramResolved=false;nav.ramLocked=false;e.ramWarning=false;}}
  }else{
    if(nav.phase==='ramApproach'){
      if(!e.ramWarning&&Math.hypot(coordinates.side,coordinates.ahead)<175){e.ramWarning=true;e.marker?.classList?.add?.('ram-threat');toast('突撃艦接近！ 撃破するか、着突直前に回避！',2.5);audio.announce?.('突撃艦、接近！');}
      if(!nav.ramLocked){
        target=frame.center.clone().addScaledVector(maneuver.velocity,clamp(e.root.position.distanceTo(frame.center)/Math.max(2,nav.baseSpeed+Math.abs(maneuver.velocity.z)),0,3));
        desired=Math.atan2(target.x-e.root.position.x,target.z-e.root.position.z);
        if(coordinates.ahead<110&&coordinates.ahead>0){nav.ramLocked=true;nav.lockHeading=desired;}
      }else desired=nav.lockHeading;
      if(coordinates.ahead<-115){nav.phase='ramPass';nav.ramResolved=true;}
    }
    if(nav.phase==='ramPass'){
      desired=nav.lockHeading??nav.heading;
      if(coordinates.ahead<-175)turnEnemyContinuously(e,nav,'ramApproach',area,frame);
    }else if(nav.phase==='approach'){
      target=enemyNavWaypoint(frame,nav.side*nav.lane,75);
      if(e.root.position.distanceTo(target)<18||coordinates.ahead<65)nav.phase='pass';
    }else if(nav.phase==='pass'){
      target=enemyNavWaypoint(frame,nav.side*nav.lane,-210);
      if(coordinates.ahead<-145)turnEnemyContinuously(e,nav,'return',area,frame);
    }else if(nav.phase==='return'){
      target=enemyNavWaypoint(frame,nav.side*nav.lane,125);
      if(coordinates.ahead>120)turnEnemyContinuously(e,nav,'approach',area,frame);
    }else if(nav.phase==='parallel'||nav.phase==='parallelReturn'){
      const ahead=nav.phase==='parallel'?310:-240;target=enemyNavWaypoint(frame,nav.side*nav.parallelLane,ahead);
      if(nav.phase==='parallel'&&coordinates.ahead>255)turnEnemyContinuously(e,nav,'parallelReturn',area,frame);
      else if(nav.phase==='parallelReturn'&&coordinates.ahead<-180)turnEnemyContinuously(e,nav,'parallel',area,frame);
    }else if(nav.phase==='cross'){
      target=enemyNavWaypoint(frame,nav.crossTarget*195,140);
      if(coordinates.side*nav.crossTarget>175){nav.crossTarget=-nav.crossTarget;turnEnemyContinuously(e,nav,'cross',area,frame);}
    }
    if(nav.mode==='crossing'&&nav.phase!=='turn'){
      if(coordinates.ahead<115)nav.crossClearance=true;
      if(nav.crossClearance&&coordinates.ahead>175&&Math.abs(coordinates.side)>55)nav.crossClearance=false;
      if(nav.crossClearance)target=enemyNavWaypoint(frame,(Math.sign(coordinates.side)||nav.side)*145,215);
    }
    if(target&&nav.phase!=='turn')desired=Math.atan2(target.x-e.root.position.x,target.z-e.root.position.z);
    // Anticipate the bank using the ship's projected width at its current yaw.
    // Steer inside the navigable channel instead of changing position abruptly.
    if(area.terrainSpec){
      const extent=Math.abs(Math.sin(nav.heading))*e.hullLength*.5+Math.abs(Math.cos(nav.heading))*e.hullWidth*.5,limit=area.terrainSpec.bankDistance-extent-4;
      if(Math.abs(e.root.position.x)>limit&&Math.sin(desired)*Math.sign(e.root.position.x)>0){desired=Math.atan2(-Math.sign(e.root.position.x)*.8,Math.cos(desired)||1);}
    }
    if(nav.phase!=='turn'){
      const difference=Math.atan2(Math.sin(desired-nav.heading),Math.cos(desired-nav.heading));nav.heading+=clamp(difference,-turnRate*step,turnRate*step);
    }
  }
  nav.heading=Math.atan2(Math.sin(nav.heading),Math.cos(nav.heading));
  e.velocity.set(Math.sin(nav.heading)*nav.speed,0,Math.cos(nav.heading)*nav.speed);e.root.position.addScaledVector(e.velocity,step);e.root.rotation.y=nav.heading;
  e.root.position.y=Math.sin(e.phase*1.4)*(.18+weather.seaState*.2);e.root.rotation.z=Math.sin(e.phase)*.017*weather.seaState;
  aimNavigatingEnemyTurrets(e,step);
  if(ramming){
    const currentBow=bowOffset.clone().applyAxisAngle(new THREE.Vector3(0,1,0),nav.heading).add(e.root.position);
    resolveRamEnemyContact(e,nav,previousBow,currentBow);
  }else{
    // Ordinary hull contacts are one entry event, never a reposition or a
    // damage-per-frame loop. Normal passing courses keep the hulls apart.
    const contact=ramContactPoint(oldPosition,e.root.position,e.hullWidth*.35);
    if(contact&&!nav.contactActive){nav.contactActive=true;if(!maneuver.evadeWindow&&e.spec.damage>0)damageHull(e.spec.damage*1.5,{position:contact.world});toast('敵艦接近！ 横へ回避して距離を取ろう',1.0);}
    if(!contact)nav.contactActive=false;
  }
}
function tick(dt){
  tickTutorial(dt);
  if(tutorial?.holding)return;
  gameTime+=dt;stackSmokeTimer-=dt;if(stackSmokeTimer<=0){for(const [y,z] of [[12.7,49.6],[10.3,63.6]])puff(ship.localToWorld(new THREE.Vector3(0,y,z)),1,0x353a3e,.8);stackSmokeTimer=.8;}morseCooldown=Math.max(0,morseCooldown-dt);tickManeuver(dt);battlefield.tick(dt,maneuver.position);
  const area=AREAS[activeArea-1];fuelTimer+=dt*(!maneuver.boost&&maneuver.speedMode==='slow'?.5:1);while(fuelTimer>=1-1e-9){fuelTimer=Math.max(0,fuelTimer-1);if(!consumeBattle('fuel',maneuver.boost?2:1)){endGame(false,'燃料不足・撤退');return;}}
  if(battleSupply('fuel')<5){endGame(false,'燃料不足・撤退');return;}
  for(const g of guns){g.cooldown=Math.max(0,g.cooldown-dt);g.recoil=Math.max(0,g.recoil-dt*3.8);}
  if(charge){charge.time+=dt;if(!charge.fired&&charge.time>=1.4){charge.fired=true;scene.updateMatrixWorld(true);dragonBlast();}if(charge.time>2.5)charge=null;}
  else{for(const q of salvoQueue)q.delay-=dt;const due=salvoQueue.filter(q=>q.delay<=0);salvoQueue=salvoQueue.filter(q=>q.delay>0);for(const q of due)fire(q.index,false);if(holdFire){repeatFireDelay=Math.max(0,repeatFireDelay-dt);if(repeatFireDelay<=0){const fired=fireSelected();repeatFireDelay=fired?.35:.08;}}}
  const rate=dt*.65;
  if(keys.has('ArrowLeft')||keys.has('a'))yaw+=rate;if(keys.has('ArrowRight')||keys.has('d'))yaw-=rate;
  if(keys.has('ArrowUp')||keys.has('w'))pitch+=rate*.65;if(keys.has('ArrowDown')||keys.has('s'))pitch-=rate*.65;
  yaw=THREE.MathUtils.euclideanModulo(yaw+Math.PI,Math.PI*2)-Math.PI;pitch=clamp(pitch,-.65,1.15);
  for(const e of enemies){
    if(e.dead){e.sinking+=dt;if(e.isShore){if(e.sinking<7&&Math.random()<dt*2)puff(weakPosition(e),1,0x262b29,1);continue;}e.root.position.y=-e.sinking*.8;e.root.rotation.z=e.sinking*.075;e.root.rotation.x=e.sinking*.025;if(e.sinking>9)removeEnemy(e);continue;}
    if(e.kind==='submarine')continue;e.phase+=dt;
    if(e.isShore){if(e.kind==='tank')e.root.position.x+=Math.sin(e.phase*.35)*dt*(e.groundSpeed||1);if(gameTime-e.spawnedAt<e.activeAfter)continue;}
    else{
      tickEnemyNavigation(e,dt,area);if(finished)return;if(e.dead)continue;
    }
    e.attack-=dt;if(e.attack<=0){if(!e.spec.launchCount&&!e.spec.ramming)enemyFire(e);e.attack=e.spec.attackInterval*.8+Math.random()*3;}
    e.smokeTimer-=dt;if(e.smokeTimer<=0){for(const offset of e.smokeOffsets)puff(e.root.localToWorld(offset.clone()),1,0x6e7472,.5);e.smokeTimer=1.1;}
    if(finished)return;
  }
  threats.tick(dt,enemies);if(finished)return;
  aviation.tick(dt,enemies);if(finished)return;
  const a=campaign.state.aviation;if(a.hullMode==='hybrid')setHullMode(a.hullMode,a.capacityLevel,a.levels,aviation.stats.deckRoles||a.loadout);
  // Advance transforms before collision tests: contacts are tested at this frame's positions.
  scene.updateMatrixWorld(true);
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.prev.copy(s.ball.position);s.velocity.y-=5*dt;s.velocity.x+=weather.windX*dt;s.velocity.z+=weather.windZ*dt;s.ball.position.addScaledVector(s.velocity,dt);s.life-=dt;let hit=false;
    if(!s.enemy){
      for(const e of enemies){if(e.dead||e.kind==='submarine')continue;let point=shipIntersection(s.prev,s.ball.position,e);if(!point&&s.proximity){const weak=weakPosition(e);if(weak.distanceTo(s.ball.position)<s.proximity)point=weak;}if(!point)continue;
        stats.hits++;tutorialEvent('main-hit');hitEnemy(e,point,s.damage,s.critical);hit=true;
        if(s.splash)for(const other of enemies){if(other===e||other.dead||other.kind==='submarine')continue;if(other.root.position.distanceTo(e.root.position)<s.splash)hitEnemy(other,other.root.position.clone().add(new THREE.Vector3(0,3,0)),s.damage*.45,1);}break;
      }
    }else{
      const a=ship.worldToLocal(s.prev.clone()),b=ship.worldToLocal(s.ball.position.clone()),d=b.clone().sub(a),len=d.length();
      const contact=len>.001?new THREE.Ray(a,d.clone().normalize()).intersectBox(new THREE.Box3(new THREE.Vector3(-11,-1,-42),new THREE.Vector3(11,24,91)),new THREE.Vector3()):null;
      if(contact&&contact.distanceTo(a)<=len){if(!maneuver.evadeWindow){damageHull(s.damage,{position:ship.localToWorld(contact)});blast(s.ball.position,.8);puff(s.ball.position,5,0x7b7c72,.8);}else toast('砲弾回避！',.6);hit=true;}
    }
    if(!hit&&(s.ball.position.y<.15||s.life<=0||(!s.enemy&&s.ball.position.distanceTo(s.origin)>s.maxRange))){const pos=s.ball.position.clone();pos.y=.2;splash(pos,1.2);hit=true;}
    if(hit)cleanShot(i);if(finished)return;
  }
  const navalAlive=enemies.some(e=>!e.dead&&!e.isShore),shoreAlive=enemies.filter(e=>!e.dead&&e.isShore),air=threats.stats.airborne,mines=threats.stats.mines;
  if(battlePhase==='naval'&&!navalAlive&&!air&&!mines){
    waveWait+=dt;if(waveWait>3.5){
      if(wave<area.waves.length)spawnWave();
      else if(dragonUses<(area.requiredDragonUses||0)){endGame(false,'作戦条件未達・撤退');return;}
      else if(area.shoreAssault){beginAssault();return;}
      else if(!shoreAlive.length){endGame(true);return;}
    }
  }
  if(battlePhase==='shore'){
    assaultTime+=dt;const deadline=area.shoreAssault.duration;
    const landingFire=shoreAlive.reduce((n,e)=>n+(e.kind==='coastalBattery'?12:e.kind==='tank'?5:3),0)+Math.min(30,air)*.5;
    if(assaultTime>=deadline&&landingFire>0){landingIntegrity=Math.max(0,landingIntegrity-dt*landingFire);stats.landingIntegrity=landingIntegrity;if(landingIntegrity<=0){endGame(false,'上陸部隊壊滅・撤退');return;}}
    if((assaultTime>=deadline-6||(!shoreAlive.length&&!air&&!mines))&&!landingArrival){battlefield.startLanding(maneuver.position);landingArrival=.01;toast('上陸艇接近！ 最後の敵火力を排除せよ',2);}
    if(landingArrival)landingArrival+=dt;
    if(!shoreAlive.length&&!air&&!mines&&landingArrival>6){stats.landingIntegrity=landingIntegrity;endGame(true);return;}
  }
  if(finished)return;
  const alive=enemies.filter(e=>!e.dead),pending=shots.some(s=>!s.enemy)||!!charge;
  if(battleSupply('shell')<5&&!pending&&alive.some(e=>e.kind!=='submarine')&&!aviation.hasSurfaceCapability())endGame(false,'主砲弾不足・撤退');
  else if(battleSupply('aa')<5&&air>0&&!threats.stats.aaActive&&!charge&&!aviation.hasAirCapability())endGame(false,'対空弾不足・撤退');
  else if(battleSupply('asw')<5&&alive.some(e=>e.kind==='submarine')&&!threats.stats.aswActive)endGame(false,'対潜弾不足・撤退');
  else if(mines&&battleSupply('aa')<5&&battleSupply('asw')<5&&!threats.stats.aaActive&&!threats.stats.aswActive)endGame(false,'機雷処理弾不足・撤退');
}

function updateEffects(dt){
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;e.vel.y-=e.gravity*dt;e.object.position.addScaledVector(e.vel,dt);e.object.scale.copy(e.startScale).multiplyScalar(1+(e.max-e.life)*e.growth);
    e.object.traverse(node=>{if(node.material)for(const m of (Array.isArray(node.material)?node.material:[node.material]))m.opacity=clamp(e.life/e.max,0,1)*.7;});
    if(e.life<=0){removeEffect(e);effects.splice(i,1);}
  }
}
function updateHUD(){
  const target=findTarget();
  $('reticle').classList.toggle('locked',!!target);$('range').textContent=target?`${target.spec.name} ${Math.round(camera.position.distanceTo(target.root.position)*10)} m`:'偏差照準 · 航行方向の少し先を狙う';
  $('weaponName').textContent=`次は第${selected+1}門 · ${weapon().name} · 出力 ${gunLoadout().power}/3`;
  $('kills').textContent=`撃沈 ${kills} · 命中 ${stats.shots?Math.round(stats.hits/stats.shots*100):0}%`;
  for(const e of enemies){if(e.dead)continue;const p=e.root.position.clone();p.y+=e.markerHeight+1;p.project(camera);const detected=e.kind==='submarine'?e.detected:camera.position.distanceTo(e.root.position)<=detectionRange();const visible=detected&&p.z>-1&&p.z<1&&Math.abs(p.x)<1.2&&Math.abs(p.y)<1.2;e.marker.style.display=visible?'block':'none';if(visible){e.marker.style.left=`${(p.x*.5+.5)*innerWidth}px`;e.marker.style.top=`${(-p.y*.5+.5)*innerHeight}px`;e.marker.querySelector('i').style.width=`${clamp(e.hp/e.maxHP,0,1)*100}%`;}}
  const buttons=document.querySelectorAll('.gun');guns.forEach((g,i)=>{const b=buttons[i];if(!b)return;b.classList.toggle('hidden',i>=campaign.gunCount());b.disabled=i>=campaign.gunCount();b.classList.toggle('selected',i===selected);b.classList.toggle('loading',g.cooldown>0);b.querySelector('span').textContent=g.cooldown>0?`${g.cooldown.toFixed(1)}秒`:WEAPONS[gunLoadout(i).weapon].name;b.querySelector('i').style.width=`${clamp(1-g.cooldown/reloadTime(i),0,1)*100}%`;});
  const cooldown=guns[selected].cooldown;
  $('fire').classList.toggle('reloading',cooldown>0);$('fire').querySelector('b').textContent=charge?'充填':cooldown>0?'装填':'発射';$('fire').querySelector('small').textContent=`第${selected+1}門`;
  $('salvo').querySelector('span').textContent=`${campaign.gunCount()}門`;
  $('batteryLabel').textContent=`主砲 ${campaign.gunCount()}門 / 順番発射`;
  const upgrades=battleUpgrades(),limit=upgrades.special>=2?2:1,remaining=Math.max(0,limit-dragonUses),trainingReady=tutorial?.kind!=='dragon'||tutorial.window,ready=!!upgrades.special&&remaining>0&&battleSupply('dragon')>=5&&uiMode==='battle'&&!finished&&!charge&&trainingReady;
  $('special').disabled=!ready;$('special').classList.toggle('ready',ready);$('special').querySelector('small').textContent=!upgrades.special?'未装備':charge?'充填中':!remaining?'使用済み':battleSupply('dragon')<5?'弾なし':!trainingReady?'合図を待て':`残り${remaining}回`;
  const marker=$('leadMarker');marker.classList.add('hidden');
  if(target&&campaign.state.upgrades.radar>=2&&uiMode==='battle'){
    const t=camera.position.distanceTo(weakPosition(target))/weapon().speed,point=weakPosition(target).addScaledVector(target.velocity,t);point.x-=weather.windX*t*t*.5;point.z-=weather.windZ*t*t*.5;point.project(camera);
    if(point.z>-1&&point.z<1&&Math.abs(point.x)<1&&Math.abs(point.y)<1){marker.style.left=`${(point.x*.5+.5)*innerWidth}px`;marker.style.top=`${(-point.y*.5+.5)*innerHeight}px`;marker.classList.remove('hidden');}
  }
  updateTacticalHUD();updateTutorialHUD();
}

function updateTacticalHUD(){
  const state=campaign.state,stock=Object.fromEntries(Object.keys(state.stock).map(k=>[k,battleSupply(k)])),u=battleUpgrades(),t=threats.stats,contacts=threats.contacts.filter(c=>c.detected),area=AREAS[activeArea-1];
  const trainingFuel=tutorial?.loans.stock.fuel||0;
  $('supplyHUD').textContent=`主砲 ${stock.shell} · 対空 ${stock.aa} · 対潜 ${stock.asw} · 燃料 ${stock.fuel}/${campaign.fuelCapacity()+trainingFuel}${tutorial&&Object.keys(tutorial.stock).length?' · 訓練貸与込み':''}`;
  $('threatStatus').textContent=`航空 ${t.airborne}機 · 撃墜 ${stats.airKills||0}機 · 潜水 ${contacts.length} · 機雷 ${t.mines}`;
  $('tactical').classList.toggle('hidden',uiMode!=='battle'&&uiMode!=='pause');
  const a=state.aviation,wing=aviation.stats,hybrid=a.converted&&a.hullMode==='hybrid';
  $('airWingControl').classList.toggle('hidden',!hybrid||(uiMode!=='battle'&&uiMode!=='pause'));
  $('launchAir').disabled=uiMode!=='battle'||stock.fuel<15||stock.aviation<5||!wing.ready;
  $('launchAir').textContent=stock.aviation<5?'航空弾なし':stock.fuel<15?'燃料不足':'航空隊発艦';
  $('airWingStatus').textContent=`飛行 ${wing.active}機 · 待機 ${wing.ready}機 · 喪失 ${wing.losses}機`;
  if(hybrid)$('threatStatus').textContent+=` · 味方 ${wing.active}機 / 航空弾 ${stock.aviation}`;
  const helmStopped=uiMode!=='battle'||!!tutorial?.holding,mode=maneuver.boost?'full':maneuver.speedMode||'cruise';
  for(const id of ['evadeRight','evadeLeft']){$(id).disabled=helmStopped||maneuver.evadeCooldown>0||stock.fuel<15;$(id).textContent=(id==='evadeRight'?'右旋回':'左旋回')+(maneuver.evadeCooldown>0?` ${Math.ceil(maneuver.evadeCooldown)}`:'');}
  $('speedButton').disabled=helmStopped;$('speedButton').textContent=tutorial?.holding?'教習停止中':mode==='cruise'&&!maneuver.evading?'巡航中':'巡航へ戻る';$('speedButton').classList.toggle('active',!maneuver.evading&&mode==='cruise');
  $('speedDown').disabled=helmStopped||mode==='slow';$('speedDown').textContent=mode==='slow'?'低速中':'減速';$('speedDown').classList.toggle('active',mode==='slow');
  $('speedUp').disabled=helmStopped||mode==='full';$('speedUp').textContent=mode==='full'?'全速中':'増速';$('speedUp').classList.toggle('active',mode==='full');
  $('sonar').classList.toggle('hidden',!u.sonar);$('asw').classList.toggle('hidden',!u.asw);$('contact').classList.toggle('hidden',!u.sonar);$('sonar').disabled=!u.sonar;$('sonar').textContent=!u.sonar?'ソナー未装備':`${['','パッシブ','アクティブ','ソノブイ'][u.sonar]} ${t.sonarOn?'ON':'OFF'}`;$('sonar').classList.toggle('active',t.sonarOn);
  const aswNames=['対潜未装備','爆雷','直進魚雷','誘導魚雷','アスロック'];$('asw').disabled=!u.asw||t.aswCooldown>0||stock.asw<5;$('asw').textContent=`${aswNames[u.asw]}${t.aswCooldown>0?` ${Math.ceil(t.aswCooldown)}秒`:''}`;
  $('depthControl').classList.toggle('hidden',u.asw!==1);$('contact').disabled=!contacts.length;
  const selected=contacts.find(c=>c.id===selectedContact);$('contact').textContent=selected?`接触 ${Math.round(selected.position.distanceTo(maneuver.position)*10)}m / 深度${Math.round(selected.depth)}m`:'潜水接触を選ぶ';
  $('autoAAStatus').textContent=u.aa?`対空 ${t.aaStatus}${t.airborne?` · ${t.airborne}機を迎撃`:''}${stock.aa<5?' · 弾切れ':''}`:'対空砲未配備';
  for(const option of $('rangeDial').options||[])option.disabled=Number(option.value)>detectionRange()*(1+.12*gunLoadout().power);
  $('rangeDial').value=String(rangeSetting);
  const time={dawn:'朝',day:'昼',night:'夜'},names={clear:'晴',cloudy:'曇',rain:'雨',storm:'荒天'};
  $('weatherHUD').textContent=`${time[weather.timeOfDay]} · ${names[weather.weather]} · 波${weather.seaState.toFixed(1)} · 風${Math.abs(weather.windX).toFixed(1)}${weather.windX<0?'←':'→'} / 索敵${Math.round(detectionRange()*10)}m${weather.radarFactor<1?' 雨×0.7':''}`;
  const incomingShots=shots.filter(s=>s.enemy&&s.ball.position.distanceTo(maneuver.position)<180),incoming=incomingShots.length;const impactTime=incoming?Math.min(...incomingShots.map(s=>s.ball.position.distanceTo(maneuver.position)/Math.max(1,s.velocity.length()))):0;
  $('objectiveHUD').textContent=battlePhase==='shore'?`上陸支援 · 岸目標 ${enemies.filter(e=>e.isShore&&!e.dead).length} · ${landingArrival?'上陸中':`到着まで${Math.ceil(Math.max(0,area.shoreAssault.duration-assaultTime))}秒`} · 部隊${Math.round(landingIntegrity)}%`:area.terrain!=='open'?`海峡航行 · 両岸砲台 ${enemies.filter(e=>e.isShore&&!e.dead).length} · 敵弾${incoming}`:incoming?`敵弾接近 ${incoming} · 推定${impactTime.toFixed(1)}秒 / 直前に左右回避`:`${{front:'対向戦',broadside:'並走戦 · 速度差に注意',crossing:'交差戦 · 敵の進路を先読み'}[area.engagement]} · ${mode==='full'?'全速 / 燃料10毎秒':mode==='slow'?'低速 / 燃料5を2秒ごと':'巡航 / 燃料5毎秒'}`;
  const bombAlert=!!t.incomingBombs&&t.nearestBombETA!==null,evadeNow=bombAlert&&t.nearestBombETA<=.6&&t.nearestBombETA>=.12&&!helmStopped;
  if(bombAlert)$('objectiveHUD').textContent=evadeNow?`今だ！ 左右旋回で爆弾を回避！ · 着弾${t.nearestBombETA.toFixed(1)}秒`:`爆弾 ${t.incomingBombs}発接近 · 着弾${t.nearestBombETA.toFixed(1)}秒 · 0.6秒前に左右回避`;
  for(const id of ['evadeRight','evadeLeft','threatStatus'])$(id).classList.toggle('evade-alert',evadeNow);
  const rammer=enemies.filter(e=>!e.dead&&e.kind==='ramship').sort((a,b)=>a.root.position.distanceToSquared(maneuver.position)-b.root.position.distanceToSquared(maneuver.position))[0];
  if(rammer&&rammer.root.position.distanceTo(maneuver.position)<175)$('objectiveHUD').textContent=`突撃艦 ${Math.round(rammer.root.position.distanceTo(maneuver.position)*10)}m · 体当たりで最大耐久の80%損失！ 撃破・左右回避`;
  if(tutorial?.holding)$('objectiveHUD').textContent='教習で一時停止中 · 光る教習ボタンを押すと操艦も再開します';

}

function selectSubContact(){
  const contacts=threats.contacts.filter(c=>c.detected);if(!contacts.length){toast('潜水接触なし。ソナーで索敵してください。');return;}
  const index=contacts.findIndex(c=>c.id===selectedContact),c=contacts[(index+1)%contacts.length];selectedContact=c.id;
  const dx=c.position.x-camera.position.x,dz=c.position.z-camera.position.z;yaw=Math.atan2(-dx,-dz);pitch=clamp(Math.atan2(-camera.position.y,Math.hypot(dx,dz)),-.65,1.15);
  if(tutorial?.kind==='asw'){bombDepth=Math.round(c.depth);$('depth').value=String(bombDepth);tutorialEvent('contact');}
  updateCamera();
  toast(`潜水接触 · 深度 ${Math.round(c.depth)}m`);
}
function toggleSonar(){
  if(uiMode!=='battle'||!battleUpgrades().sonar)return;
  const before=threats.stats.sonarOn;threats.toggleSonar();const after=threats.stats.sonarOn;
  if(battleUpgrades().sonar===1&&before!==after)for(const g of guns)g.cooldown*=after?2:.5;
  if(after)tutorialEvent('sonar-on');else if(tutorial?.kind==='asw'){tutorial.step='sonar';tutorial.holding=true;}
  toast(after&&battleUpgrades().sonar===1?'パッシブ索敵開始 · 主砲装填2倍':after?'索敵開始':'索敵停止');
}
function fireAntiSub(){if(uiMode!=='battle'||finished)return;
  if(tutorial?.kind==='asw'&&!threats.contacts.some(c=>c.detected&&c.id===selectedContact)){toast('訓練中：先にソナーで探知し、潜水接触を選んでください。',2);return {ok:false,reason:'潜水接触を選んでください。'};}
  audio.unlock();if(!selectedContact&&battleUpgrades().asw>1)selectedContact=threats.contacts.find(c=>c.detected)?.id??null;const result=threats.fireASW();if(result.ok)tutorialEvent('asw-fired');toast(result.reason||'対潜兵器、発射。');return result;}
function endGame(won,reason='艦体大破'){
  if(finished)return;finished=true;holdFire=false;aimPointer=null;keys.clear();salvoQueue=[];charge=null;
  stats.time=gameTime;stats.hull=hp/maxHP*100;stats.landingIntegrity=landingIntegrity;saveCondition();lastResult=campaign.settle(activeArea,stats,won);const area=AREAS[activeArea-1];
  $('endEyebrow').textContent=won?'AREA CONQUERED':reason.includes('撤退')?'WITHDRAWAL':'MISSION FAILED';$('endTitle').textContent=won?(activeArea===AREAS.length?'全海域制圧':'海域制圧'):reason;$('endArea').textContent=`第${area.part}部 · 第${activeArea}海域 · ${area.name}`;
  const values=[['撃沈数',`${kills}`,'隻'],['得点',lastResult.score.toLocaleString(),'点'],['命中率',`${lastResult.accuracy}`,'%'],['発射 / 命中',`${stats.shots} / ${stats.hits}`,'砲撃'],['艦体状態',`${Math.round(hp/maxHP*100)}`,'%'],['総合評価',lastResult.rank,`${Math.floor(gameTime)}秒`],['撃墜数',`${stats.airKills||0}`,'機'],['龍神砲',`${dragonUses}`,'回'],['残存燃料',`${campaign.state.stock.fuel}`,'単位'],['岸目標壊滅',`${stats.shoreKills||0}`,'か所'],['上陸部隊',area.shoreAssault?`${Math.round(landingIntegrity)}`:'—',area.shoreAssault?'%':'海上戦'],['修理費',`${campaign.repairQuote().cost}`,'C']];
  $('endScore').innerHTML=values.map(([label,value,unit])=>`<div class="stat-value"><small>${label}</small><strong>${value}</strong><em>${unit}</em></div>`).join('');$('reward').textContent=`+${lastResult.reward.toLocaleString()} C`;
  $('nextArea').classList.toggle('hidden',!won||activeArea>=AREAS.length);$('toHarbor').textContent=won?'港で修理・強化':'港で装備を見直す';
  if(won){reviewReturn='result';$('reviewPanel').querySelector('h2').textContent='朝日、海域制圧。';$('skipReview').textContent='戦績を見る →';audio.morse('VICTORY');audio.announce(activeArea===AREAS.length?'全海域、制圧完了。':'海域、制圧完了。');reviewActive=true;reviewTime=0;reviewPending=true;setScreen('review');}
  else setScreen('result');updateSaveSummary();
}
function showResult(){if(!reviewPending)return;reviewPending=false;reviewActive=false;if(reviewReturn==='harbor'){setScreen('harbor');renderHarbor();}else setScreen('result');}
function inspectHull(){
  syncAuxiliary();
  if(uiMode!=='harbor')return false;
  maxHP=100+campaign.state.upgrades.armor*30;hp=maxHP*campaign.state.hull/100;zones={...campaign.state.damageZones};syncDamageVisual();updateHullHUD();maneuver.position.set(0,0,0);maneuver.rollKick=maneuver.pitchKick=0;
  setWeather({...AREAS[0],weather:{...AREAS[0].weather,timeOfDay:'day'}});reviewReturn='harbor';reviewTime=0;reviewPending=reviewActive=true;
  $('reviewPanel').querySelector('h2').textContent=campaign.state.aviation.hullMode==='hybrid'?'航空戦艦 朝日、船体点検。':'朝日、船体点検。';$('skipReview').textContent='港に戻る →';setScreen('review');return true;
}


function setPause(value){
  if(finished||!started||(value&&uiMode!=='battle')||(!value&&uiMode!=='pause'))return;
  holdFire=false;keys.clear();aimPointer=null;salvoQueue=[];audio.pause(value);setScreen(value?'pause':'battle');
}
async function start(){const promise=audio.unlock();started=true;chosenArea=clamp(campaign.state.unlockedArea,1,AREAS.length);openHarbor('map');await promise;}
$('startButton').addEventListener('click',start);
$('newVoyageButton').addEventListener('click',()=>applyVoyageResult(campaign.newCampaign()));
$('voyageMenu').addEventListener('click',()=>{renderVoyageHistory();$('voyageMessage').textContent='';$('voyagePanel').classList.remove('hidden');});
$('closeVoyage').addEventListener('click',()=>{$('voyagePanel').classList.add('hidden');});
$('voyageFreshButton').addEventListener('click',()=>applyVoyageResult(campaign.newCampaign()));
$('voyageList').addEventListener('click',e=>{const button=e.target.closest('button[data-restore-voyage]');if(button)applyVoyageResult(campaign.restoreCampaign(button.dataset.restoreVoyage));});
$('mapWorld').addEventListener('click',()=>{mapZoom='world';renderWorldMap();});$('mapPart').addEventListener('click',()=>{mapZoom='part';renderWorldMap();});
$('repair').addEventListener('click',()=>{const result=campaign.repairHull();zones={...campaign.state.damageZones};hp=maxHP*campaign.state.hull/100;renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');});
$('portInspect').addEventListener('click',inspectHull);$('aviationInspect').addEventListener('click',inspectHull);$('skipReview').addEventListener('click',showResult);
$('aviationTab').addEventListener('click',()=>{harborTab='aviation';renderHarbor();});
$('aviationView').addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;if(button.dataset.airConvert!==undefined)applyAviationResult(campaign.convertAviation());else if(button.dataset.hullMode)applyAviationResult(campaign.setHullMode(button.dataset.hullMode));else if(button.dataset.airBuy)applyAviationResult(campaign.buyAviationUpgrade(button.dataset.airBuy));});
$('airAllocation').addEventListener('change',e=>{const input=e.target.closest('input[data-air-role]');if(input)applyAviationResult(campaign.setAirLoadout(input.dataset.airRole,Number(input.value)));});
$('autoAirLoadout').addEventListener('click',()=>applyAviationResult(campaign.autoAirLoadout()));
$('launchAir').addEventListener('click',launchAirWing);
$('evadeLeft').addEventListener('click',()=>{audio.unlock();evade(-1);});$('evadeRight').addEventListener('click',()=>{audio.unlock();evade(1);});
$('speedButton').addEventListener('click',()=>{if(setSpeedMode('cruise')){maneuver.evadeTimer=0;maneuver.evading=false;}});
$('speedDown').addEventListener('click',()=>changeSpeed(-1));$('speedUp').addEventListener('click',()=>changeSpeed(1));
$('rangeDial').addEventListener('change',()=>{rangeSetting=clamp(Number($('rangeDial').value)||180,30,detectionRange()*(1+.12*gunLoadout().power));toast(`射程設定 ${Math.round(rangeSetting*10)}m`);});
$('deploy').addEventListener('click',()=>beginArea(chosenArea));
$('mapTab').addEventListener('click',()=>{harborTab='map';renderHarbor();});$('shopTab').addEventListener('click',()=>{harborTab='shop';renderHarbor();});$('supplyTab').addEventListener('click',()=>{harborTab='supply';renderHarbor();});$('backToMap').addEventListener('click',()=>{harborTab='map';renderHarbor();});
$('partTabs').addEventListener('click',e=>{const button=e.target.closest('button[data-part]');if(!button)return;worldPart=Number(button.dataset.part);chosenArea=AREAS.find(a=>a.part===worldPart).id;renderHarbor();});
$('worldMap').addEventListener('click',e=>{const node=e.target.closest('[data-map-area]');if(!node)return;chosenArea=Number(node.dataset.mapArea);worldPart=AREAS[chosenArea-1].part;renderHarbor();});
$('mapList').addEventListener('click',e=>{const button=e.target.closest('button[data-area]');if(!button||button.disabled)return;chosenArea=Number(button.dataset.area);renderHarbor();});
$('gunShopCards').addEventListener('click',e=>{const button=e.target.closest('button');if(!button||button.disabled)return;const result=button.dataset.addGun?campaign.addGun():button.dataset.gunBuy?campaign.buyGunUpgrade(Number(button.dataset.gunIndex),button.dataset.gunBuy):null;if(!result)return;syncGunLoadout();renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');});
$('shopCards').addEventListener('click',e=>{const button=e.target.closest('button[data-buy]');if(!button||button.disabled)return;const result=campaign.buy(button.dataset.buy);renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');});
$('supplyCards').addEventListener('click',e=>{const button=e.target.closest('button[data-supply]');if(!button||button.disabled)return;const result=campaign.buySupply(button.dataset.supply);renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');});
$('emergencySupply').addEventListener('click',()=>{const result=campaign.emergencyResupply();renderHarbor();$('shopMessage').textContent=result.reason;audio.unlock();if(result.ok)audio.morse('OK');});
$('tutorialAction').addEventListener('click',tutorialAction);
$('sonar').addEventListener('click',()=>{audio.unlock();toggleSonar();});$('asw').addEventListener('click',fireAntiSub);$('contact').addEventListener('click',selectSubContact);$('depth').addEventListener('change',()=>{bombDepth=clamp(Number($('depth').value)||50,20,150);});
$('toHarbor').addEventListener('click',()=>openHarbor('shop'));$('nextArea').addEventListener('click',()=>{chosenArea=Math.min(activeArea+1,AREAS.length);openHarbor('map');});
$('restart').addEventListener('click',()=>beginArea(activeArea));$('restartPause').addEventListener('click',()=>beginArea(activeArea));$('toHarborPause').addEventListener('click',()=>{chosenArea=activeArea;openHarbor('map');});
$('pause').addEventListener('click',()=>setPause(true));$('resume').addEventListener('click',()=>setPause(false));
$('resetProgress').addEventListener('click',()=>{$('resetConfirm').classList.remove('hidden');});$('cancelReset').addEventListener('click',()=>{$('resetConfirm').classList.add('hidden');});
$('confirmReset').addEventListener('click',()=>{campaign.reset();syncAuxiliary();zones={...campaign.state.damageZones};maxHP=hp=100;chosenArea=1;worldPart=1;mapZoom='world';$('resetConfirm').classList.add('hidden');renderHarbor();$('shopMessage').textContent='新しい作戦を開始しました。';});
$('mute').addEventListener('click',()=>{if(uiMode!=='pause')audio.unlock();audio.setMuted(!audio.muted);$('mute').textContent=audio.muted?'音 OFF':'音 ON';});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch{}});
document.querySelectorAll('.gun').forEach(b=>b.addEventListener('click',()=>{if(uiMode!=='battle')return;const index=Number(b.dataset.gun);if(index<campaign.gunCount())selected=index;audio.unlock();}));
$('salvo').addEventListener('click',()=>{if(uiMode==='battle')audio.unlock();salvo();});$('special').addEventListener('click',()=>{if(uiMode==='battle')audio.unlock();fireDragon();});
$('fire').addEventListener('pointerdown',e=>{if(uiMode!=='battle'||charge)return;e.preventDefault();audio.unlock();$('fire').setPointerCapture(e.pointerId);holdFire=true;fireSelected();repeatFireDelay=.35;});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('fire').addEventListener(name,()=>{holdFire=false;});
canvas.addEventListener('pointerdown',e=>{if(uiMode!=='battle'||finished||charge||aimPointer!==null)return;e.preventDefault();audio.unlock();aimPointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!aimPointer||aimPointer.id!==e.pointerId)return;const scale=1.35/Math.min(innerWidth,900);yaw-=(e.clientX-aimPointer.x)*scale;pitch-=(e.clientY-aimPointer.y)*scale*.6;aimPointer.x=e.clientX;aimPointer.y=e.clientY;yaw=THREE.MathUtils.euclideanModulo(yaw+Math.PI,Math.PI*2)-Math.PI;pitch=clamp(pitch,-.65,1.15);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(aimPointer?.id===e.pointerId)aimPointer=null;});
window.addEventListener('keydown',e=>{
  if(e.key==='Escape'){if(uiMode==='battle')setPause(true);else if(uiMode==='pause')setPause(false);return;}
  if(uiMode!=='battle')return;if([' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();if(e.repeat)return;keys.add(e.key);
  if(e.key===' '){audio.unlock();holdFire=true;fireSelected();repeatFireDelay=.35;}if(e.key.toLowerCase()==='f')salvo();if(e.key.toLowerCase()==='g')fireDragon();if(['1','2','3','4'].includes(e.key)&&Number(e.key)<=campaign.gunCount())selected=Number(e.key)-1;
  if(e.key.toLowerCase()==='q')evade(-1);if(e.key.toLowerCase()==='e')evade(1);if(e.key.toLowerCase()==='x')changeSpeed(1);if(e.key.toLowerCase()==='z')changeSpeed(-1);
  if(e.key.toLowerCase()==='v')toggleSonar();if(e.key.toLowerCase()==='h')fireAntiSub();if(e.key.toLowerCase()==='r')selectSubContact();
  if(e.key.toLowerCase()==='c')launchAirWing();
});
window.addEventListener('keyup',e=>{keys.delete(e.key);if(e.key===' ')holdFire=false;});
window.addEventListener('blur',()=>{holdFire=false;aimPointer=null;keys.clear();if(uiMode==='battle')setPause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&uiMode==='battle')setPause(true);});
window.addEventListener('pagehide',()=>{if(['battle','pause','review','result'].includes(uiMode))saveCondition();else campaign.save();audio.pause(true);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<h?80:62;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();updateCamera();updateSaveSummary();syncAuxiliary();
$('loading').classList.add('hidden');
let frames=0,sample=0,adapted=false;
function animate(){
  requestAnimationFrame(animate);const raw=clock.getDelta(),dt=Math.min(raw,.04);
  if(!paused){elapsed+=dt;waterMat.uniforms.time.value=elapsed;updateEffects(dt);shake=Math.max(0,shake-dt*3.6);damage=Math.max(0,damage-dt*1.7);energyFlash=Math.max(0,energyFlash-dt*1.4);if(uiMode==='battle'&&!finished)tick(dt);if(reviewActive){reviewTime+=dt;battlefield.tick(dt,maneuver.position);maneuver.rollKick*=Math.exp(-dt*1.8);maneuver.pitchKick*=Math.exp(-dt*2.1);damageSmokeTimer-=dt;if(damageSmokeTimer<=0){for(const [key,group] of Object.entries(damageVisuals))if(group.visible)puff(group.getWorldPosition(new THREE.Vector3()),1,0x252b31,1);damageSmokeTimer=1.1;}if(reviewTime>=8)showResult();}if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('message').style.opacity='0';}}
  updateCamera();updateHUD();$('damage').style.opacity=damage.toFixed(3);$('energyFlash').style.opacity=energyFlash.toFixed(3);renderer.render(scene,camera);
  if(uiMode==='battle'&&!adapted){frames++;sample+=raw;if(sample>5){if(frames/sample<36){renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;resize();}adapted=true;}}
}
animate();
// Read-only diagnostic snapshot; play is controlled through the visible UI.
const snapshot=()=>({title:'弩級戦艦 朝日',started,paused,finished,screen:uiMode,weaponMode,battlePhase,weather:{...weather},maneuver:{position:maneuver.position.toArray(),velocity:maneuver.velocity.toArray(),evading:maneuver.evading,evadeWindow:maneuver.evadeWindow,speedMode:maneuver.speedMode,boost:maneuver.boost},damageZones:{...zones},reviewActive,landingIntegrity,hp,maxHP,kills,area:activeArea,wave,selected,gunCount:campaign.gunCount(),gunLoadouts:campaign.state.guns.map(g=>({...g})),aviation:{...campaign.state.aviation,stats:aviation.stats},cooldowns:guns.map(g=>g.cooldown),shots:shots.length,enemies:enemies.filter(e=>!e.dead).map(e=>({kind:e.kind,hp:e.hp})),effects:effects.length,stats:{...stats},specialUsed,upgrades:{...campaign.state.upgrades},credits:campaign.state.credits,unlockedArea:campaign.state.unlockedArea,conquered:[...campaign.state.conquered],viewport:[innerWidth,innerHeight]});
Object.defineProperty(window,'ASAHI',{get:snapshot});
