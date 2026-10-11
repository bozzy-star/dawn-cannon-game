import * as THREE from 'three';
import { CannonAudio } from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = THREE.MathUtils.clamp;
const canvas = $('sea');
const audio = new CannonAudio();
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

const waterMat = new THREE.ShaderMaterial({uniforms:{time:{value:0},sun:{value:sunDirection}},vertexShader:`
uniform float time;varying vec3 world;varying float wave;
void main(){vec3 p=position;float w=sin(p.x*.043+time*.7)*.34+sin(p.y*.065-time*.9)*.21+sin((p.x+p.y)*.11+time*1.1)*.07;p.z=w;wave=w;vec4 wp=modelMatrix*vec4(p,1.);world=wp.xyz;gl_Position=projectionMatrix*viewMatrix*wp;}`,fragmentShader:`
uniform float time;uniform vec3 sun;varying vec3 world;varying float wave;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
void main(){vec2 p=world.xz;float nx=cos(p.x*.043+time*.7)*.0146+cos((p.x-p.y)*.9+time*1.2)*.055+cos(p.x*2.4+time*1.6)*.017;
float nz=cos(p.y*.065+time*.9)*.014+cos((p.x+p.y)*.75-time*.9)*.045+cos(p.y*2.1-time)*.02;
vec3 n=normalize(vec3(-nx,1.,-nz));vec3 v=normalize(cameraPosition-world);float fres=pow(1.-max(dot(n,v),0.),3.);vec3 refl=reflect(-v,n);vec3 sky=mix(vec3(.58,.67,.73),vec3(.23,.4,.56),sqrt(max(refl.y,0.)));
float sparkle=pow(max(dot(reflect(-sun,n),v),0.),145.);float ripple=noise(p*.45+time*.06);vec3 col=mix(vec3(.025,.105,.135)+ripple*.035,sky,fres*.83);col+=vec3(1.,.85,.6)*sparkle*.85;
float dist=length(cameraPosition-world);float fog=1.-exp(-dist*.0016);col=mix(col,vec3(.59,.67,.72),fog);gl_FragColor=vec4(col,1.);}`});
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
const shellMat=new THREE.MeshBasicMaterial({color:0xffd68a});
const enemySteel=steel.clone();enemySteel.color.setHex(0x596164);
const enemyRed=new THREE.MeshStandardMaterial({color:0x573325,roughness:.65,metalness:.65,map:metalMap});
const boilerMat=new THREE.MeshStandardMaterial({color:0x6d3728,emissive:0x2b0c03,roughness:.53,metalness:.45});
let gameTime=0, elapsed=0, started=false, paused=false, finished=false;
let hp=100,kills=0,wave=0,waveWait=0,selected=1,yaw=0,pitch=-.018,shake=0,damage=0,toastTime=0;
let aimPointer=null,holdFire=false,salvoQueue=[];
const keys=new Set();
function makeEnemy(x,z,type=0){
  const root=new THREE.Group();root.position.set(x,0,z);scene.add(root);
  const shape=new THREE.Shape();shape.moveTo(-3.8,8);shape.lineTo(-3.8,-6);shape.quadraticCurveTo(-3,-11,0,-13);shape.quadraticCurveTo(3,-11,3.8,-6);shape.lineTo(3.8,8);shape.closePath();
  const hull=mesh(new THREE.ExtrudeGeometry(shape,{depth:2.4,bevelEnabled:true,bevelSize:.4,bevelThickness:.3,bevelSegments:1,steps:1}),enemySteel,root,0,2.2,0);hull.rotation.x=Math.PI/2;
  box(root,6.6,.28,14,0,2.3,-.5,wood);
  box(root,4,2.7,5,0,3.7,1,enemySteel);
  box(root,4.3,.28,5.3,0,5.1,1,deckMat);
  for(let xx=-1.2;xx<=1.21;xx+=1.2){box(root,.7,.65,.05,xx,4.3,-1.53,black);}
  const stack=cylinder(root,.78,1.1,4.8,0,5.0,4,darkSteel);ring(root,.83,.13,0,7.4,4,darkSteel).rotation.x=Math.PI/2;
  const boiler=cylinder(root,1.18,1.18,3.6,0,3.0,5.2,boilerMat);boiler.rotation.z=Math.PI/2;
  for(const x0 of [-1.5,1.5]){const r=ring(root,1.2,.07,x0,3,5.2,bronze);r.rotation.y=Math.PI/2;}
  cylinder(root,.85,.9,.8,0,2.9,-7,enemySteel);
  const gun=cylinder(root,.17,.24,3.8,0,3.4,-8.4,darkSteel,12);gun.rotation.x=-Math.PI/2;
  const mast=cylinder(root,.06,.12,7,-1.6,6.8,2,darkSteel,8);
  const flag=box(root,1.7,.7,.02,-.7,9.6,2,enemyRed);
  for(const side of [-1,1]){for(let zz=-5;zz<8;zz+=3){cylinder(root,.04,.04,1,side*3.3,2.85,zz,edgeSteel,6);}}
  const marker=document.createElement('div');marker.className='enemy-marker';marker.innerHTML=`<span>${type?'装甲巡洋艦':'海賊砲艦'}</span><div class="enemy-hp"><i></i></div>`;$('markers').append(marker);
  const enemy={root,marker,hp:type?5:3,maxHP:type?5:3,type,attack:9+Math.random()*3,phase:Math.random()*10,sinking:0,dead:false,smokeTimer:0};
  enemies.push(enemy);return enemy;
}
function spawnWave(){
  wave++;waveWait=0;$('wave').textContent=`第${wave}波 / 3`;
  const count=wave+2;
  for(let i=0;i<count;i++)makeEnemy((i-(count-1)/2)*34,-150-Math.abs(i-(count-1)/2)*12,wave>1&&i%2===0?1:0);
  toast(`第${wave}波　敵艦隊接近`,3);
}
function removeEnemy(e){
  if(e.removed)return;
  scene.remove(e.root);e.root.traverse(node=>{if(node.isMesh)node.geometry.dispose();});e.removed=true;
}
function toast(message,duration=1.8){$('message').textContent=message;toastTime=duration;$('message').style.opacity='1';}
function updateCamera(){
  ship.position.y=Math.sin(elapsed*.7)*.09;ship.rotation.z=Math.sin(elapsed*.49)*.0025;
  camera.position.set(0,7.6+ship.position.y,8.6);
  camera.rotation.order='YXZ';
  camera.rotation.set(pitch+(Math.random()-.5)*shake*.013,yaw+(Math.random()-.5)*shake*.008,Math.sin(elapsed*.49)*.002);
  // All three guns traverse together; each reload and recoil independently.
  for(const g of guns){g.swivel.rotation.y=yaw;g.pitch.rotation.x=pitch+.012;g.barrel.position.z=g.recoil*.82;g.flash.intensity=g.recoil> .75?35:0;}
}
function findTarget(){
  let best=null,bestDist=.13;
  for(const e of enemies){if(e.dead)continue;const p=e.root.position.clone();p.y=3.5;p.project(camera);if(p.z<-1||p.z>1)continue;const d=Math.hypot(p.x,p.y);if(d<bestDist){best=e;bestDist=d;}}
  return best;
}
function puff(position,count=8,color=0xd0d4cf,power=1,water=false){
  for(let i=0;i<count;i++){
    const mat=new THREE.SpriteMaterial({map:smokeTex,color,transparent:true,opacity:.65,depthWrite:false});
    const sprite=new THREE.Sprite(mat);sprite.position.copy(position);const size=(water?1.1:1.4)*power*(.6+Math.random());sprite.scale.setScalar(size);scene.add(sprite);
    const vel=new THREE.Vector3((Math.random()-.5)*5*power,water?3+Math.random()*13*power:1.1+Math.random()*3*power,(Math.random()-.5)*5*power);
    effects.push({sprite,vel,life:water?1.6:2.5,max:water?1.6:2.5,size,growth:water?.2:1.3,gravity:water?8:0});
  }
}
function blast(position,power=1){
  const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:flameTex,transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));sprite.position.copy(position);sprite.scale.setScalar(4*power);scene.add(sprite);effects.push({sprite,vel:new THREE.Vector3(),life:.17,max:.17,size:4*power,growth:12,gravity:0});
}
const tempV=new THREE.Vector3();
function fire(index=selected){
  if(!started||paused||finished)return false;
  const g=guns[index];if(g.cooldown>0)return false;
  g.cooldown=2.7;g.recoil=1;shake=Math.min(2.1,shake+.8);
  scene.updateMatrixWorld(true);
  const origin=g.barrel.localToWorld(new THREE.Vector3(0,0,-6.6));
  const target=findTarget();
  let dest;
  if(target){dest=target.root.position.clone();dest.y=3.3;}
  else {camera.getWorldDirection(tempV);dest=camera.position.clone().addScaledVector(tempV,180);}
  const velocity=dest.clone().sub(origin);const t=velocity.length()/160;velocity.divideScalar(t);velocity.y+=.5*5*t;
  const ball=new THREE.Mesh(shellGeo,shellMat);ball.position.copy(origin);scene.add(ball);shots.push({ball,velocity,life:4,enemy:false,prev:origin.clone()});
  blast(origin,1.15);puff(origin,7,0xc5c6bb,.55);audio.fire((index-1)*.55);return true;
}
function salvo(){
  if(!started||paused||finished)return;
  let n=0;for(let i=0;i<3;i++)if(guns[i].cooldown<=0){salvoQueue.push({index:i,delay:n*.09});n++;}
  if(n)toast(n===3?'3門斉射':`${n}門発射`,1);else toast('装填中',.7);
}
function enemyFire(e){
  const origin=e.root.position.clone().add(new THREE.Vector3(0,3,-7));
  const target=new THREE.Vector3((Math.random()-.5)*12,2.7,0);
  const velocity=target.sub(origin);const t=velocity.length()/76;velocity.divideScalar(t);velocity.y+=.5*5*t;
  const ball=new THREE.Mesh(shellGeo,shellMat);ball.position.copy(origin);scene.add(ball);shots.push({ball,velocity,life:5,enemy:true,prev:origin.clone()});blast(origin,.6);
}
function hitEnemy(e,point){
  const weak=e.root.position.clone().add(new THREE.Vector3(0,3,5.2));
  const critical=point.distanceTo(weak)<3.4;
  e.hp-=critical?3:1;shake=Math.max(shake,.2);
  blast(point,1.2);puff(point,8,0x7c7d77,1.2);audio.impact(clamp(e.root.position.x/80,-1,1));
  if(e.hp<=0){e.dead=true;e.sinking=0;kills++;$('kills').textContent=`撃沈 ${kills}`;e.marker.remove();toast(critical?'機関部直撃 · 撃沈':'敵艦撃沈',1.6);puff(weak,15,0x565b58,2);blast(weak,2.5);}
  else{e.marker.querySelector('i').style.width=`${e.hp/e.maxHP*100}%`;toast(critical?'機関部直撃':'命中',.75);}
}
function damageHull(amount=8){
  hp=Math.max(0,hp-amount);damage=.85;shake=Math.min(2,shake+.7);$('hpText').textContent=Math.round(hp);$('hpBar').style.width=`${hp}%`;$('hpBar').style.background=hp<30?'#d98563':'#b6cbbc';audio.impact(0,false);
  if(hp<=0)endGame(false);
}
function segmentDistance(a,b,p){const d=b.clone().sub(a),length=d.lengthSq();const t=length?clamp(p.clone().sub(a).dot(d)/length,0,1):0;return p.distanceTo(a.clone().addScaledVector(d,t));}
function cleanShot(i){scene.remove(shots[i].ball);shots.splice(i,1);}
function tick(dt){
  gameTime+=dt;
  for(const q of salvoQueue)q.delay-=dt;
  const due=salvoQueue.filter(q=>q.delay<=0);salvoQueue=salvoQueue.filter(q=>q.delay>0);for(const q of due)fire(q.index);
  for(const g of guns){g.cooldown=Math.max(0,g.cooldown-dt);g.recoil=Math.max(0,g.recoil-dt*3.8);}
  if(holdFire)fire(selected);
  const rate=dt*.5;
  if(keys.has('ArrowLeft')||keys.has('a'))yaw+=rate;if(keys.has('ArrowRight')||keys.has('d'))yaw-=rate;
  if(keys.has('ArrowUp')||keys.has('w'))pitch+=rate*.48;if(keys.has('ArrowDown')||keys.has('s'))pitch-=rate*.48;
  yaw=clamp(yaw,-.78,.78);pitch=clamp(pitch,-.2,.13);
  for(const e of enemies){
    if(e.dead){e.sinking+=dt;e.root.position.y=-e.sinking*.8;e.root.rotation.z=e.sinking*.075;e.root.rotation.x=e.sinking*.025;if(e.sinking>7){removeEnemy(e);}continue;}
    e.phase+=dt;e.root.position.y=Math.sin(e.phase*1.4)*.24;e.root.rotation.z=Math.sin(e.phase)*.017;
    e.root.position.z+=dt*(e.type?2.5:3.1);e.root.position.x+=Math.sin(e.phase*.28)*dt*.45;
    e.attack-=dt;
    if(e.attack<=0){enemyFire(e);e.attack=6+Math.random()*3;}
    e.smokeTimer-=dt;if(e.smokeTimer<=0){puff(e.root.localToWorld(new THREE.Vector3(0,7.4,4)),1,0x6e7472,.5);e.smokeTimer=.9;}
    if(e.root.position.z>-38){damageHull(12);e.root.position.z=-65;e.attack=2.8;toast('敵艦接近！',1);}
  }
  for(let i=shots.length-1;i>=0;i--){
    const s=shots[i];s.prev.copy(s.ball.position);s.velocity.y-=5*dt;s.ball.position.addScaledVector(s.velocity,dt);s.life-=dt;
    let hit=false;
    if(!s.enemy){for(const e of enemies){if(e.dead)continue;const center=e.root.position.clone();center.y=3.0;if(segmentDistance(s.prev,s.ball.position,center)<5.4){hitEnemy(e,s.ball.position.clone());hit=true;break;}}}
    else if(s.ball.position.z>-13&&Math.abs(s.ball.position.x)<13&&s.ball.position.y<8){damageHull(7+wave);blast(s.ball.position,.8);puff(s.ball.position,5,0x7b7c72,.8);hit=true;}
    if(!hit&&s.ball.position.y<.15){const pos=s.ball.position.clone();pos.y=.2;puff(pos,12,0xe0eef0,1.25,true);audio.impact(clamp(pos.x/80,-1,1),true);hit=true;}
    if(hit||s.life<=0)cleanShot(i);
  }
  if(enemies.length&&enemies.every(e=>e.dead)){
    waveWait+=dt;
    if(waveWait>3.5){if(wave>=3)endGame(true);else{hp=Math.min(100,hp+15);$('hpText').textContent=Math.round(hp);$('hpBar').style.width=`${hp}%`;spawnWave();}}
  }
}
function updateEffects(dt){
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;e.vel.y-=e.gravity*dt;e.sprite.position.addScaledVector(e.vel,dt);e.sprite.scale.setScalar(e.size+(e.max-e.life)*e.growth);e.sprite.material.opacity=clamp(e.life/e.max,0,1)*.7;e.sprite.material.rotation+=(i%2?.1:-.1)*dt;if(e.life<=0){scene.remove(e.sprite);e.sprite.material.dispose();effects.splice(i,1);}}
}
function updateHUD(){
  const target=findTarget();$('reticle').classList.toggle('locked',!!target);$('range').textContent=target?`敵艦 ${Math.round(camera.position.distanceTo(target.root.position)*10)} m`:'照準を敵艦へ';
  for(const e of enemies){if(e.dead)continue;const p=e.root.position.clone();p.y=11;p.project(camera);const visible=p.z>-1&&p.z<1&&Math.abs(p.x)<1.2&&Math.abs(p.y)<1.2;e.marker.style.display=visible?'block':'none';if(visible){e.marker.style.left=`${(p.x*.5+.5)*innerWidth}px`;e.marker.style.top=`${(-p.y*.5+.5)*innerHeight}px`;}}
  const buttons=document.querySelectorAll('.gun');guns.forEach((g,i)=>{const b=buttons[i];b.classList.toggle('selected',i===selected);b.classList.toggle('loading',g.cooldown>0);b.querySelector('span').textContent=g.cooldown>0?`${g.cooldown.toFixed(1)}秒`:'装填完了';b.querySelector('i').style.width=`${(1-g.cooldown/2.7)*100}%`;});
  $('fire').classList.toggle('reloading',guns[selected].cooldown>0);$('fire').querySelector('b').textContent=guns[selected].cooldown>0?'装填':'発射';
}
function reset(){
  for(const e of enemies){removeEnemy(e);e.marker.remove();}enemies.length=0;
  for(const s of shots)scene.remove(s.ball);shots.length=0;
  for(const e of effects){scene.remove(e.sprite);e.sprite.material.dispose();}effects.length=0;
  hp=100;kills=0;wave=0;waveWait=0;gameTime=0;yaw=0;pitch=-.018;shake=0;damage=0;finished=false;paused=false;holdFire=false;aimPointer=null;salvoQueue=[];keys.clear();
  for(const g of guns){g.cooldown=0;g.recoil=0;}selected=1;
  $('hpText').textContent='100';$('hpBar').style.width='100%';$('hpBar').style.background='#b6cbbc';$('kills').textContent='撃沈 0';$('end').classList.add('hidden');$('pausePanel').classList.add('hidden');spawnWave();
}
function endGame(won){
  if(finished)return;finished=true;holdFire=false;salvoQueue=[];$('endEyebrow').textContent=won?'MISSION COMPLETE':'MISSION FAILED';$('endTitle').textContent=won?'海域制圧':'艦体大破';$('endScore').textContent=`撃沈 ${kills}隻 · 艦体耐久 ${Math.round(hp)} · ${Math.floor(gameTime)}秒`;$('end').classList.remove('hidden');
}
function setPause(value){if(!started||finished)return;paused=value;
  if(value){audio.context?.suspend().catch(()=>{});}else{audio.unlock();}
  holdFire=false;keys.clear();aimPointer=null;salvoQueue=[];$('pausePanel').classList.toggle('hidden',!value);}
async function start(){
  const promise=audio.unlock();started=true;$('start').classList.add('hidden');document.body.classList.add('playing');reset();
  await promise;
}
$('startButton').addEventListener('click',start);
$('restart').addEventListener('click',()=>{audio.unlock();reset();});
$('restartPause').addEventListener('click',reset);
$('pause').addEventListener('click',()=>setPause(true));$('resume').addEventListener('click',()=>{audio.unlock();setPause(false);});
$('mute').addEventListener('click',()=>{audio.unlock();audio.setMuted(!audio.muted);$('mute').textContent=audio.muted?'音 OFF':'音 ON';});
$('fullscreen').addEventListener('click',async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('game').requestFullscreen();if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch{/* Browser may leave the regular view in place. */}});
document.querySelectorAll('.gun').forEach(b=>b.addEventListener('click',()=>{selected=Number(b.dataset.gun);audio.unlock();}));
$('salvo').addEventListener('click',()=>{audio.unlock();salvo();});
$('fire').addEventListener('pointerdown',e=>{e.preventDefault();audio.unlock();$('fire').setPointerCapture(e.pointerId);holdFire=true;fire(selected);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])$('fire').addEventListener(name,()=>{holdFire=false;});
canvas.addEventListener('pointerdown',e=>{if(!started||paused||finished||aimPointer!==null)return;e.preventDefault();audio.unlock();aimPointer={id:e.pointerId,x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener('pointermove',e=>{if(!aimPointer||aimPointer.id!==e.pointerId)return;const scale=1.35/Math.min(innerWidth,900);yaw-= (e.clientX-aimPointer.x)*scale;pitch-= (e.clientY-aimPointer.y)*scale*.6;aimPointer.x=e.clientX;aimPointer.y=e.clientY;yaw=clamp(yaw,-.78,.78);pitch=clamp(pitch,-.2,.13);});
for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,e=>{if(aimPointer?.id===e.pointerId)aimPointer=null;});
window.addEventListener('keydown',e=>{if([' ','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();if(e.repeat)return;keys.add(e.key);if(e.key===' '){audio.unlock();holdFire=true;fire(selected);}if(e.key.toLowerCase()==='f')salvo();if(['1','2','3'].includes(e.key))selected=Number(e.key)-1;if(e.key==='Escape')setPause(!paused);});
window.addEventListener('keyup',e=>{keys.delete(e.key);if(e.key===' ')holdFire=false;});
window.addEventListener('blur',()=>{holdFire=false;aimPointer=null;keys.clear();if(started&&!finished)setPause(true);});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&!finished)setPause(true);});
window.addEventListener('contextmenu',e=>e.preventDefault());
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.fov=w<h?80:62;camera.updateProjectionMatrix();}
window.addEventListener('resize',resize);resize();updateCamera();
$('loading').classList.add('hidden');
let frames=0,sample=0,adapted=false;
function animate(){
  requestAnimationFrame(animate);
  const raw=clock.getDelta();const dt=Math.min(raw,.04);
  if(!paused){elapsed+=dt;waterMat.uniforms.time.value=elapsed;updateEffects(dt);shake=Math.max(0,shake-dt*3.6);damage=Math.max(0,damage-dt*1.7);if(started&&!finished)tick(dt);if(toastTime>0){toastTime-=dt;if(toastTime<=0)$('message').style.opacity='0';}}
  updateCamera();updateHUD();$('damage').style.opacity=damage.toFixed(3);renderer.render(scene,camera);
  if(started&&!paused&&!adapted){frames++;sample+=raw;if(sample>5){if(frames/sample<36){renderer.setPixelRatio(1);renderer.shadowMap.enabled=false;resize();}adapted=true;}}
}
animate();
// Read-only state for smoke checks; play controls remain ordinary UI events.
Object.defineProperty(window,'DAWN',{get:()=>({started,paused,finished,hp,kills,wave,selected,gunCount:guns.length,cooldowns:guns.map(g=>g.cooldown),shots:shots.length,enemies:enemies.filter(e=>!e.dead).length,effects:effects.length,audioEnabled:!!audio.context,viewport:[innerWidth,innerHeight],drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles})});
