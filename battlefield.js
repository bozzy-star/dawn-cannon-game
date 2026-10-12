/** Coastlines, shore targets, weather particles, and friendly landing visuals.
 * Shore targets are caller-owned combat objects. This class never changes HP,
 * fires weapons, awards score, or adds those targets to its environment group.
 */
export class Battlefield {
  constructor(scene, kit) {
    this.scene = scene; this.kit = kit; this.THREE = kit.THREE;
    this.geometries = new Set(); this.materials = new Set(); this.textures = new Set();
    this.group = null; this.landGroup = null; this.coastGroup = null; this.rain = null; this.area = null;
    this.landingBoats = []; this.landingTime = 0; this.landingActive = false;
  }

  _geometry(geometry) { this.geometries.add(geometry); return geometry; }
  _material(material) { this.materials.add(material); return material; }
  _box(parent, width, height, length, x, y, z, material) {
    const THREE = this.THREE;
    const object = new THREE.Mesh(this._geometry(new THREE.BoxGeometry(width, height, length)), material);
    object.position.set(x, y, z); object.castShadow = object.receiveShadow = true;
    parent.add(object); return object;
  }

  prepare(area = {}) {
    this.reset(); this.area = area;
    const THREE = this.THREE;
    this.group = new THREE.Group(); this.group.name = 'battlefield-environment'; this.scene.add(this.group);
    this.landGroup = this.group;
    const rock = this._material(new THREE.MeshStandardMaterial({color:0x645b4b, roughness:.98, side:THREE.DoubleSide}));
    const earth = this._material(new THREE.MeshStandardMaterial({color:0x555745, roughness:1}));
    const green = this._material(new THREE.MeshStandardMaterial({color:0x455442, roughness:1}));
    const beach = this._material(new THREE.MeshStandardMaterial({color:0x8f8262, roughness:1}));
    if (area.terrainSpec) {
      const terrain = area.terrainSpec;
      const distance = Number(terrain.bankDistance) || 68, width = Number(terrain.bankWidth) || 75;
      const height = Number(terrain.bankHeight) || 21, length = Number(terrain.length) || 800;
      for (const side of [-1,1]) {
        this._box(this.group,width,height,length,side*(distance+width/2),height/2,-length*.24,earth);
        this._box(this.group,width,.24,length,side*(distance+width/2),height+.12,-length*.24,green);
        // One irregular cliff mesh per bank keeps the view readable and cheap.
        const vertices = [], indices = [], steps = 28, front = length*.26;
        for(let i=0;i<=steps;i++) {
          const z=front-i*length/steps, jut=Math.sin(i*1.73)*2+Math.sin(i*.43)*2.5;
          vertices.push(side*(distance-2+jut),.15,z,side*(distance+3+jut*.4),height,z);
          if(i<steps) {const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}
        }
        const cliff=this._geometry(new THREE.BufferGeometry());
        cliff.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));cliff.setIndex(indices);cliff.computeVertexNormals();
        const face=new THREE.Mesh(cliff,rock);face.castShadow=face.receiveShadow=true;this.group.add(face);
        for(let i=0;i<12;i++) {
          const stone=new THREE.Mesh(this._geometry(new THREE.DodecahedronGeometry(1,0)),rock);
          stone.position.set(side*(distance+5+(i%3)*7),height+1,-30-i*44);
          stone.scale.set(2+(i%3),1.7+(i%2),3);stone.rotation.y=i*.43;this.group.add(stone);
        }
      }
    }
    if (area.shoreAssault) {
      this.coastGroup=new THREE.Group();this.coastGroup.name='assault-coast';this.coastGroup.visible=false;
      this.group.add(this.coastGroup);
      // A broad island coast, with its front around -100 and inland at -210.
      this._box(this.coastGroup,440,4.0,245,0,0,-217.5,earth);
      this._box(this.coastGroup,430,.22,217,0,2.1,-231.5,green);
      this._box(this.coastGroup,440,.22,30,0,2.1,-109.5,beach);
      for(let i=0;i<18;i++) {
        const stone=new THREE.Mesh(this._geometry(new THREE.DodecahedronGeometry(1,0)),rock);
        stone.position.set((i-8.5)*24,2.6,-97-(i%3)*2.5);
        stone.scale.set(3+(i%3),2.2,2.6);stone.rotation.y=i*.52;this.coastGroup.add(stone);
      }
      // Uneven background hills frame the beach without obscuring the targets.
      for(let i=0;i<7;i++) {
        const hill=new THREE.Mesh(this._geometry(new THREE.DodecahedronGeometry(1,0)),green);
        hill.position.set((i-3)*58,7,-306-(i%2)*12);hill.scale.set(54,15+(i%3)*9,47);
        hill.rotation.y=i*.73;this.coastGroup.add(hill);
      }
    }
    if (['rain','storm'].includes(area.weather?.weather)) this._prepareRain(area.weather);
    return (area.terrainSpec?.shoreBatteries || []).map(def=>this._target('coastalBattery',def,area));
  }

  assaultTargets(area = this.area || {}) {
    return (area.shoreAssault?.targets || []).map(def=>this._target(def.kind,def,area));
  }

  startAssault() {
    if(!this.coastGroup)return false;
    this.coastGroup.visible=true;return true;
  }

  _target(kind, def = {}, area = {}) {
    const {THREE} = this;
    const root = new THREE.Group(); root.name = `shore-${kind}`;
    const ownedMaterials = [], ownedTextures = [];
    const material = (color, metalness=.15) => {
      const m=new THREE.MeshStandardMaterial({color,metalness,roughness:.83});ownedMaterials.push(m);return m;
    };
    const concrete=material(0x777366),armor=material(kind==='tank'?0x505c46:0x586360,.5);
    const dark=material(0x202b2a,.25),sand=material(0x73694f),stripe=material(0xc7c3a8);
    const weak=material(0x9a4732,.4);weak.emissive.setHex(0x571d0d);weak.emissiveIntensity=.48;
    const box=(parent,w,h,d,x,y,z,m=concrete)=>{
      const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);
      mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
    };
    const tube=(parent,radius,length,x,y,z,m=dark)=>{
      const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*1.2,length,10),m);
      mesh.rotation.x=Math.PI/2;mesh.position.set(x,y,z);mesh.castShadow=true;parent.add(mesh);return mesh;
    };
    let hullWidth=12,hullLength=12,markerHeight=8,weakOffset=new THREE.Vector3(0,2.8,4),muzzleOffsets=[];
    if(kind==='tank') {
      hullWidth=5.5;hullLength=8.0;markerHeight=6.6;
      box(root,6.4,.3,9,0,.15,0,sand);
      for(const side of [-1,1]) {box(root,1.15,1.3,7.1,side*2.2,1.05,0,dark);
        for(let i=0;i<4;i++){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.49,.49,.22,8),armor);wheel.rotation.z=Math.PI/2;wheel.position.set(side*2.79,1.03,-2.45+i*1.65);root.add(wheel);}}
      box(root,3.65,1.35,6.0,0,1.75,0,armor);box(root,2.7,1.1,3.3,0,2.95,.1,armor);
      tube(root,.18,5.0,0,3.15,3.2);box(root,.95,.42,.3,0,2.25,3.03,weak);
      weakOffset.set(0,2.25,3.2);muzzleOffsets.push(new THREE.Vector3(0,3.15,5.7));
    } else if(kind==='airfield') {
      hullWidth=39;hullLength=58;markerHeight=10;
      box(root,39,.35,58,0,.18,0,sand);box(root,11,.10,55,-5,.41,0,dark);
      for(let i=0;i<9;i++) box(root,.28,.025,2.1,-5,.48,-23+i*5.6,stripe);
      box(root,12,5,16,11,2.75,-5,concrete);box(root,12.6,.35,16.6,11,5.42,-5,armor);
      box(root,4.7,7.7,4.7,12,4.1,19,concrete);box(root,6.6,1.8,6.6,12,8.6,19,armor);
      box(root,4.8,.65,.10,12,8.7,22.35,dark);
      for(let i=0;i<3;i++) {
        const plane=new THREE.Group();plane.position.set(-5,.95,-16+i*10);root.add(plane);
        box(plane,.58,.58,4.2,0,0,0,armor);box(plane,6.0,.10,1.05,0,-.12,.45,armor);
        box(plane,2.0,.09,.58,0,.15,-1.8,armor);box(plane,.12,.9,.7,0,.36,-1.8,dark);
        box(plane,.42,.27,.8,0,.41,.25,dark);
      }
      box(root,3.5,1.8,.4,11,2.3,3.23,weak);weakOffset.set(11,2.3,3.6);
      muzzleOffsets.push(new THREE.Vector3(12,9.5,22));
    } else {
      const heavy=(area.part||1)>=3;hullWidth=heavy?15:12;hullLength=heavy?14:12;markerHeight=heavy?10:8;
      box(root,hullWidth+1,.55,hullLength+1,0,.3,0,sand);
      box(root,hullWidth,3.6,hullLength,0,2.35,0,concrete);
      const roof=box(root,hullWidth+.9,.9,hullLength+.8,0,4.45,0,armor);roof.rotation.x=-.04;
      box(root,7.8,1.5,.12,0,2.95,hullLength/2+.04,dark);
      for(const x of heavy?[-2.1,0,2.1]:[-1.55,1.55]) {
        tube(root,heavy?.34:.27,heavy?7.0:5.9,x,3.02,hullLength/2+2.3);
        muzzleOffsets.push(new THREE.Vector3(x,3.02,hullLength/2+(heavy?5.8:5.25)));
      }
      for(const side of [-1,1])box(root,1.2,1.0,2.8,side*(hullWidth/2+1),1.2,3,sand);
      box(root,2.1,1.25,.25,0,1.35,hullLength/2+.11,weak);weakOffset.set(0,1.35,hullLength/2+.28);
    }
    const y=Number.isFinite(def.y)?def.y:area.terrainSpec?Number(area.terrainSpec.bankHeight)||21:2;
    // Assault definitions place guns/tanks on higher ground than the beach.
    // A unique earthwork joins that elevation to the island instead of floating.
    if(area.shoreAssault && Number.isFinite(def.y) && y>2.1) {
      const height=y-2.05;
      box(root,hullWidth+2,height,hullLength+2,0,-height/2,0,sand);
    }
    root.position.set(Number(def.x)||0,y,Number(def.z)||-110);
    // Bunkers and tanks point their +Z guns toward the origin/player approach.
    if(kind!=='airfield')root.rotation.y=Math.atan2(-root.position.x,-root.position.z);
    root.userData.kind=kind;root.userData.isShore=true;
    root.userData.dimensions={width:hullWidth,length:hullLength,deckHeight:markerHeight-2};
    root.userData.weakOffset=weakOffset;
    const names={coastalBattery:(area.part||1)>=3?'重沿岸砲台':'沿岸砲台',tank:'敵戦車',airfield:'敵飛行場'};
    const spec={name:def.name||names[kind]||'沿岸目標',hp:Number(def.hp)||20,damage:Number(def.damage)||5,
      attackInterval:Number(def.attackInterval)||12,score:Number(def.score)||200,speed:0,radius:Number(def.radius)||hullWidth*.55,
      ...(def.launchCount?{launchCount:Number(def.launchCount)}:{})};
    return {root,kind,isShore:true,spec,hullWidth,hullLength,markerHeight,weakOffset,muzzleOffsets,smokeOffsets:[],
      ownedMaterials,ownedTextures,hitRadius:spec.radius,activeAfter:Number(def.activeAfter)||0,groundSpeed:Number(def.speed)||0,
      hp:spec.hp,maxHP:spec.hp,dead:false,removed:false};
  }

  _prepareRain(weather) {
    const THREE=this.THREE,count=weather.weather==='storm'?1400:850;
    const positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){positions[i*3]=(Math.random()-.5)*170;positions[i*3+1]=3+Math.random()*63;positions[i*3+2]=(Math.random()-.65)*240;}
    const geometry=this._geometry(new THREE.BufferGeometry());geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));
    const material=this._material(new THREE.ShaderMaterial({transparent:true,depthWrite:false,
      vertexShader:'void main(){vec4 p=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*p;gl_PointSize=clamp(180.0/max(8.0,-p.z),2.0,11.0);}',
      fragmentShader:'void main(){vec2 p=gl_PointCoord;if(abs(p.x-.5)>.08||p.y<.04||p.y>.96)discard;float a=(1.0-abs(p.x-.5)/.08)*sin(p.y*3.14159);gl_FragColor=vec4(.73,.81,.85,a*.48);}',
    }));
    const points=new THREE.Points(geometry,material);points.name='sea-rain';points.frustumCulled=false;this.group.add(points);
    this.rain={points,positions,count,windX:(Number(weather.windX)||0)*4,windZ:(Number(weather.windZ)||0)*4};
  }

  startLanding(playerPos = new this.THREE.Vector3(), transitSeconds = 6) {
    if(this.landingActive)return this.landingBoats.length;
    if(!this.group)return 0;
    const THREE=this.THREE;
    this.landingActive=true;this.landingTime=0;
    const hull=this._material(new THREE.MeshStandardMaterial({color:0x687471,roughness:.78,metalness:.38}));
    const inside=this._material(new THREE.MeshStandardMaterial({color:0x3e4949,roughness:.9}));
    const troop=this._material(new THREE.MeshStandardMaterial({color:0x686349,roughness:1}));
    const duration=Number.isFinite(transitSeconds)&&transitSeconds>0?transitSeconds:6;
    for(let i=0;i<5;i++) {
      const root=new THREE.Group();root.name='friendly-landing-boat';this.group.add(root);
      this._box(root,4.3,.7,10.8,0,.35,0,hull);this._box(root,3.4,.18,8.1,0,.76,.3,inside);
      for(const side of [-1,1])this._box(root,.30,1.0,10.5,side*2,1.05,0,hull);
      this._box(root,3.9,1.05,.4,0,1.05,5.1,hull);this._box(root,2.1,1.9,2.1,0,1.68,-3.3,hull);
      for(let n=0;n<4;n++)this._box(root,.53,1.25,.5,(n%2-.5)*1.25,1.45,1.7-Math.floor(n/2)*1.5,troop);
      const start=new THREE.Vector3(playerPos.x+(i-2)*13,0,playerPos.z+18+i*5);
      const destination=new THREE.Vector3((i-2)*25,.12,-91-(i%2)*2);
      root.position.copy(start);root.rotation.y=Math.atan2(destination.x-start.x,destination.z-start.z);
      this.landingBoats.push({root,start,destination,duration,phase:i*.7,landed:false});
    }
    return this.landingBoats.length;
  }

  tick(dt, playerPos = new this.THREE.Vector3()) {
    if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);
    if(this.rain) {
      const rain=this.rain;rain.points.position.copy(playerPos);
      for(let i=0;i<rain.count;i++) {
        const n=i*3;rain.positions[n]+=rain.windX*dt;rain.positions[n+1]-=(30+i%7)*dt;rain.positions[n+2]+=rain.windZ*dt;
        if(rain.positions[n+1]<1)rain.positions[n+1]=66;
        if(rain.positions[n]>85)rain.positions[n]=-85;if(rain.positions[n]<-85)rain.positions[n]=85;
        if(rain.positions[n+2]>84)rain.positions[n+2]=-156;if(rain.positions[n+2]<-156)rain.positions[n+2]=84;
      }
      rain.points.geometry.attributes.position.needsUpdate=true;
    }
    if(this.landingActive) {
      this.landingTime+=dt;
      for(const boat of this.landingBoats) {
        const progress=Math.max(0,Math.min(1,this.landingTime/boat.duration));
        boat.root.position.copy(boat.start).lerp(boat.destination,progress);
        boat.root.position.y+=Math.sin(this.landingTime*1.5+boat.phase)*.13*(1-progress);
        boat.root.rotation.z=Math.sin(this.landingTime+boat.phase)*.018*(1-progress);
        boat.landed=progress>=1;
      }
    }
  }

  get status() {
    return {rainCount:this.rain?.count||0,landingActive:this.landingActive,landingTime:this.landingTime,
      landingBoats:this.landingBoats.length,landedBoats:this.landingBoats.filter(b=>b.landed).length};
  }

  reset() {
    if(this.group)this.scene.remove(this.group);
    for(const geometry of this.geometries)geometry.dispose();
    for(const material of this.materials)material.dispose();
    for(const texture of this.textures)texture.dispose();
    this.geometries.clear();this.materials.clear();this.textures.clear();
    this.group=null;this.landGroup=null;this.coastGroup=null;this.rain=null;this.area=null;
    this.landingBoats.length=0;this.landingTime=0;this.landingActive=false;
  }
}
