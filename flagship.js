import { createAviationDeck } from './aviation-deck.js?v=asahi-v9.2-final';
// Code-built naval geometry: long bow, pagoda bridge and a shared expanding turret.
export function buildFlagship(kit) {
  const {THREE,steel:baseSteel,darkSteel:baseDarkSteel,edgeSteel:baseEdgeSteel,wood:baseWood,black,bronze,box,cylinder,ring,mesh}=kit;
  const ownedMaterials=[],ownedTextures=[];
  function surfaceTexture(paint) {
    const canvas=document.createElement('canvas');canvas.width=canvas.height=256;paint(canvas.getContext('2d'));
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;ownedTextures.push(texture);return texture;
  }
  const plateMap=surfaceTexture(ctx=>{
    ctx.fillStyle='#7a8386';ctx.fillRect(0,0,256,256);
    let seed=70143;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    for(let i=0;i<2500;i++){ctx.fillStyle=i%2?'#b5bfc31c':'#19232920';ctx.fillRect(random()*256,random()*256,1+random()*2,1);}
    for(let y=0;y<256;y+=64){ctx.fillStyle='#16232b75';ctx.fillRect(0,y,256,1);for(let x=8;x<256;x+=16){ctx.fillStyle='#c1c6c084';ctx.fillRect(x,y+3,2,2);ctx.fillStyle='#273037a0';ctx.fillRect(x+1,y+4,1,1);}}
    for(let x=0;x<256;x+=128){ctx.fillStyle='#27303977';ctx.fillRect(x,0,1,256);}
    for(let i=0;i<30;i++){const x=random()*256,y=random()*256;ctx.fillStyle='#7c523626';ctx.fillRect(x,y,2+random()*5,4+random()*17);}
  });
  const plankMap=surfaceTexture(ctx=>{
    ctx.fillStyle='#a28a62';ctx.fillRect(0,0,256,256);
    for(let x=0;x<256;x+=16){ctx.fillStyle=x%32?'#877353':'#b49a6c';ctx.fillRect(x,0,15,256);ctx.fillStyle='#403d32';ctx.fillRect(x,0,1,256);
      for(let y=(x%48)*2;y<256;y+=84){ctx.fillRect(x,y,16,1);ctx.fillRect(x+3,y+3,1,1);ctx.fillRect(x+12,y+3,1,1);}
      ctx.fillStyle='#dbc49833';ctx.fillRect(x+5,0,1,256);ctx.fillStyle='#63523e44';ctx.fillRect(x+11,0,1,256);}
  });
  plateMap.repeat.set(2,1);plankMap.repeat.set(1,1);
  const steel=baseSteel.clone();steel.map=plateMap;steel.color.setHex(0x91a5b0);steel.roughness=.62;steel.metalness=.24;
  const darkSteel=baseDarkSteel.clone();darkSteel.map=plateMap;darkSteel.color.setHex(0x637b8a);darkSteel.roughness=.70;darkSteel.metalness=.19;
  const edgeSteel=baseEdgeSteel.clone();edgeSteel.map=plateMap;edgeSteel.color.setHex(0xb7c6cc);edgeSteel.roughness=.58;edgeSteel.metalness=.25;
  const wood=baseWood.clone();wood.map=plankMap;wood.color.setHex(0xa7b1be);wood.roughness=.86;
  for(const material of [steel,darkSteel,edgeSteel,wood]){material.vertexColors=true;material.envMapIntensity=.55;}
  ownedMaterials.push(steel,darkSteel,edgeSteel,wood);
  const ship=new THREE.Group();ship.name='Asahi';
  const detail=new THREE.Group();detail.name='ship-details';ship.add(detail);
  const standardAft=new THREE.Group();standardAft.name='battleship-aft-equipment';ship.add(standardAft);
  const red=new THREE.MeshStandardMaterial({color:0x782f27,roughness:.87,metalness:.1});
  const glass=new THREE.MeshStandardMaterial({color:0x030b11,metalness:.02,roughness:.25,envMapIntensity:.18});
  ownedMaterials.push(red,glass);
  const plan=new THREE.Shape();plan.moveTo(0,-42);
  plan.bezierCurveTo(-3,-40,-9,-25,-10.6,-10);plan.lineTo(-11.2,63);
  plan.bezierCurveTo(-10.8,79,-8,88,-5,91);plan.lineTo(5,91);
  plan.bezierCurveTo(8,88,10.8,79,11.2,63);plan.lineTo(10.6,-10);
  plan.bezierCurveTo(9,-25,3,-40,0,-42);plan.closePath();
  const hull=mesh(new THREE.ExtrudeGeometry(plan,{depth:4.6,bevelEnabled:true,bevelSize:.38,bevelThickness:.4,bevelSegments:2,steps:1}),darkSteel,ship,0,2.0,0);hull.rotation.x=Math.PI/2;
  const under=hull.clone();under.material=red;under.position.y=-1.9;under.scale.set(.98,.98,.48);ship.add(under);
  const bootstripe=mesh(new THREE.ExtrudeGeometry(plan,{depth:.65,bevelEnabled:false}),red,ship,0,.21,0);bootstripe.rotation.x=Math.PI/2;bootstripe.scale.set(1.009,1.002,1);bootstripe.name='oxide-red-waterline';
  const deck=mesh(new THREE.ShapeGeometry(plan,22),wood,ship,0,2.08,0);deck.rotation.x=-Math.PI/2;deck.scale.y=-1;
  const foredeck=box(ship,15.5,.75,28,0,2.4,-5,steel);foredeck.name='armored-foredeck';
  box(ship,17.4,.16,38,0,2.83,25,wood);
  // One batched line mesh keeps railings, panel joints and aerial rigging inexpensive.
  const lines=[];
  const line=(a,b)=>lines.push(...a,...b);
  const railPoints=[[-.6,-40],[-5,-32],[-8.2,-22],[-10.4,-8],[-11,20],[-11,59],[-9.8,75],[-7.5,85],[-4.6,90],[4.6,90],[7.5,85],[9.8,75],[11,59],[11,20],[10.4,-8],[8.2,-22],[5,-32],[.6,-40]];
  for(let i=0;i<railPoints.length-1;i++)for(const y of [2.65,3.3])line([railPoints[i][0],y,railPoints[i][1]],[railPoints[i+1][0],y,railPoints[i+1][1]]);
  for(const side of [-1,1]){
    for(let z=-10;z<85;z+=5){const x=side*(z>65?10-(z-65)*.18:10.8);line([x,2.2,z],[x,3.3,z]);line([x,-.2,z],[x,1.8,z]);}
    for(const y of [.3,1.25])line([side*10.8,y,-7],[side*10.8,y,64]);
    for(const z of [22,51,69]){box(ship,1.8,.45,4,side*8.5,2.5,z,darkSteel);cylinder(ship,.32,.38,.65,side*8.5,2.9,z,edgeSteel,8);}
    // anchor chains, capstans and hatch covers
    const chain=cylinder(ship,.07,.07,15,side*3.5,2.92,-26,black,6);chain.rotation.x=Math.PI/2;
    cylinder(ship,.7,.85,.6,side*3.5,3.1,-18,darkSteel,16);
    for(const z of [-12,19,59,82])box(ship,1.5,.19,2.1,side*6.1,2.8,z,edgeSteel);
    // Long armor plates, fine portholes and vertical seams catch oblique light.
    for(let z=-8;z<65;z+=3.8){line([side*11.24,.27,z],[side*11.24,1.85,z]);line([side*11.25,1.2,z+.9],[side*11.25,1.2,z+1.18]);}
    for(let z=-30;z<-8;z+=3.0){const x=side*(3+(z+30)*.29);line([x,.3,z],[x,1.85,z]);}
  }
  // The stepped bridge rises above the funnels, matching the references' silhouette.
  const bridge=new THREE.Group();bridge.name='pagoda-bridge';bridge.position.z=34;ship.add(bridge);
  function armoredPrism(parent,w,h,d,x,y,z,material=steel,bevel=.04){
    const outline=new THREE.Shape(),cut=Math.min(w,d)*.19;
    outline.moveTo(-w/2+cut,-d/2);for(const p of [[w/2-cut,-d/2],[w/2,-d/2+cut],[w/2,d/2-cut],[w/2-cut,d/2],[-w/2+cut,d/2],[-w/2,d/2-cut],[-w/2,-d/2+cut]])outline.lineTo(...p);outline.closePath();
    const body=mesh(new THREE.ExtrudeGeometry(outline,{depth:h,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:1,steps:1}),material,parent,x,y+h/2,z);body.rotation.x=Math.PI/2;return body;
  }
  for(const [y,w,d,h] of [[4.0,13,12,2.4],[6.4,10.2,10,2.6],[9.1,8.2,8.3,2.4],[11.8,9.8,6.7,2.1],[14,7.2,5.8,2],[16,6,5,1.9],[18,5.4,4.4,1.8],[20,7.4,3.9,1.5]]){
    armoredPrism(bridge,w,h,d,0,y,0);
    armoredPrism(bridge,w+.7,.2,d+.6,0,y+h*.5+.15,0,edgeSteel,.01);
    if(y>=6){box(bridge,w*.60,.48,.055,0,y+.26,-d/2-.06,glass);for(const side of [-1,1])box(bridge,.055,.48,d*.60,side*(w/2+.06),y+.26,0,glass);
      for(let x=-w*.27;x<=w*.27;x+=.73)line([x,y+.03,34-d/2-.10],[x,y+.5,34-d/2-.10]);}
  }
  for(const [y,w,z] of [[9.8,14,-.9],[13.5,12,-.3],[17.2,9,0]]){box(bridge,w,.23,3.8,0,y,z,edgeSteel);for(const side of [-1,1]){box(bridge,2.1,.9,2.9,side*(w/2-1),y+.55,z,darkSteel);box(bridge,1.7,.35,.05,side*(w/2-1),y+.7,z-1.5,glass);line([side*w/2,y+.85,z+32],[side*w/2,y+.85,z+36]);}}
  // Observation wings, optical directors and exterior lattice stairs make the
  // central pagoda denser than a stack of uninterrupted round platforms.
  for(const side of [-1,1]){
    for(const [y,z,w] of [[7.8,-1.5,11.4],[12.0,.1,10.4],[15.6,.25,8.5]]){
      box(bridge,2.25,.19,3.7,side*(w/2),y,z,steel);
      cylinder(bridge,.24,.34,.65,side*(w/2),y+.45,z-.9,darkSteel,8);
      line([side*(w/2-1.1),y+.75,z+32.2],[side*(w/2+1.1),y+.75,z+32.2]);
      for(let dz=-1.6;dz<1.6;dz+=.8)line([side*(w/2+1.1),y,z+34+dz],[side*(w/2+1.1),y+.75,z+34+dz]);
    }
    for(let y=7;y<18.5;y+=.52){line([side*4.1,y,35.8],[side*4.8,y,35.8]);}
    line([side*4.1,6.6,35.8],[side*4.1,19,35.8]);line([side*4.8,6.6,35.8],[side*4.8,19,35.8]);
  }
  for(const side of [-1,1]){line([side*3,3.2,28],[side*3,19.5,32]);for(let y=4;y<19;y+=.65)line([side*3-.3,y,28+(y-3.2)*.24],[side*3+.3,y,28+(y-3.2)*.24]);}
  cylinder(bridge,.15,.28,9,0,24.5,1,edgeSteel,10);
  for(const [y,w] of [[22,13],[25,9],[28,6]]){box(bridge,w,.12,.12,0,y,1,darkSteel);line([-w/2,y,35],[0,29,35]);line([w/2,y,35],[0,29,35]);}
  for(const side of [-1,1]){const leg=cylinder(bridge,.2,.32,15,side*2.2,16.8,2.5,darkSteel,8);leg.rotation.z=side*.16;box(bridge,4,.8,1.2,side*5.5,20.3,0,darkSteel);}
  // Open lattice radar arrays are readable in the orbit and don't look like solid cubes.
  for(const side of [-1,1])for(let i=0;i<5;i++)line([side*(3.5+i*.55),21.9,34.3],[side*(3.5+i*.55),23.4,34.3]);
  for(const side of [-1,1])for(const y of [21.9,22.65,23.4])line([side*3.5,y,34.3],[side*5.7,y,34.3]);
  const funnels=[];
  const funnelLineMaterial=new THREE.LineBasicMaterial({color:0x9ba5a5,transparent:true,opacity:.8});ownedMaterials.push(funnelLineMaterial);
  for(const [z,r,h] of [[50,2.15,9.4],[64,1.65,7]]){
    const funnel=new THREE.Group();funnel.position.z=z;funnel.name=`funnel-${funnels.length+1}`;ship.add(funnel);funnels.push(funnel);
    const f=cylinder(funnel,r*.85,r,h,0,3+h/2,0,darkSteel,20);f.rotation.x=-.09;
    cylinder(funnel,r*.88,r*.88,.6,0,3+h,-.45,black,20);
    for(const y of [5,8]){const rim=ring(funnel,r,.07,0,y,0,edgeSteel);rim.rotation.x=Math.PI/2;}
    const ladderLines=[];
    for(const side of [-1,1]){box(funnel,.25,h*.65,.7,side*(r+.08),3+h*.45,0,steel);for(let y=4;y<3+h;y+=.7)ladderLines.push(side*(r+.13),y,-.23,side*(r+.13),y,.23);}
    const ladderGeometry=new THREE.BufferGeometry();ladderGeometry.setAttribute('position',new THREE.Float32BufferAttribute(ladderLines,3));funnel.add(new THREE.LineSegments(ladderGeometry,funnelLineMaterial));
  }
  box(standardAft,10.8,2.7,27,0,3.8,54,steel);box(standardAft,11.4,.17,25,0,5.23,54,wood);
  cylinder(standardAft,.13,.22,13,0,12.5,67,edgeSteel,8);box(standardAft,9,.12,.12,0,16.3,67,edgeSteel);
  const aftLines=[-4.5,16.3,67,0,19,67,4.5,16.3,67,0,19,67];
  // Legacy decorative heavy guns are absent. Every visible main barrel belongs
  // to the purchased battery; a conversion does not create free artillery.
  const aftTurret=new THREE.Group();aftTurret.name='aft-heavy-turret';aftTurret.visible=false;standardAft.add(aftTurret);
  const hybridForeTurret=new THREE.Group();hybridForeTurret.name='hybrid-forward-secondary-turret';hybridForeTurret.visible=false;ship.add(hybridForeTurret);
  aftTurret.userData.decorativeWeapon=hybridForeTurret.userData.decorativeWeapon=true;
  armoredPrism(standardAft,5.0,.45,7.8,0,2.4,76,steel,.08).name='aft-deck-storage';
  for(const side of [-1,1]){const boat=mesh(new THREE.SphereGeometry(1,10,6),wood,detail,side*7.3,5.6,45);boat.scale.set(1.2,.55,4.4);box(detail,1.5,.45,5.3,side*7.3,5.8,45,edgeSteel);}
  box(standardAft,9,.25,.7,0,3.0,86,darkSteel);cylinder(standardAft,.13,.25,6,5.7,5.5,85,darkSteel,8);aftLines.push(5.7,8.5,85,.5,6.7,87,5.7,8.5,85,5.7,3,85);
  const lineMaterial=new THREE.LineBasicMaterial({color:0x8c9897,transparent:true,opacity:.68});ownedMaterials.push(lineMaterial);
  const lineGeo=new THREE.BufferGeometry();lineGeo.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));detail.add(new THREE.LineSegments(lineGeo,lineMaterial));
  const aftLineGeo=new THREE.BufferGeometry();aftLineGeo.setAttribute('position',new THREE.Float32BufferAttribute(aftLines,3));standardAft.add(new THREE.LineSegments(aftLineGeo,lineMaterial));
  const rivets=[];for(const side of [-1,1])for(let z=-6;z<63;z+=1.4)for(const y of [.48,1.56])rivets.push(side*11.24,y,z);
  const rivetGeometry=new THREE.BufferGeometry();rivetGeometry.setAttribute('position',new THREE.Float32BufferAttribute(rivets,3));
  const rivetMaterial=new THREE.PointsMaterial({color:0xb0b9b9,size:.08});ownedMaterials.push(rivetMaterial);
  detail.add(new THREE.Points(rivetGeometry,rivetMaterial));
  const aviation=createAviationDeck({...kit,steel,darkSteel,edgeSteel,wood});ship.add(aviation.group);aviation.group.visible=false;
  ownedMaterials.push(...aviation.ownedMaterials);ownedTextures.push(...aviation.ownedTextures);
  const armorBelts=[];
  for(let level=1;level<=3;level++){
    const belt=new THREE.Group();belt.name=`armor-upgrade-${level}`;ship.add(belt);belt.visible=false;
    for(const side of [-1,1])box(belt,.10,.21,65,side*(11.25+level*.045),1.35+level*.13,29,level===3?edgeSteel:steel);
    armorBelts.push(belt);
  }
  const batteryMount=new THREE.Group();batteryMount.name='expanding-main-battery';batteryMount.position.set(0,2.8,-5);ship.add(batteryMount);
  cylinder(batteryMount,5.1,5.55,.65,0,.33,0,darkSteel,40);cylinder(batteryMount,4.95,5.1,.75,0,1,0,steel,40);
  const turretYaw=new THREE.Group();turretYaw.position.y=1.35;batteryMount.add(turretYaw);
  const armorPlan=new THREE.Shape();armorPlan.moveTo(-4.8,3.4);for(const p of [[-4.8,-1.9],[-3.9,-3.5],[3.9,-3.5],[4.8,-1.9],[4.8,3.4]])armorPlan.lineTo(...p);armorPlan.closePath();
  const house=mesh(new THREE.ExtrudeGeometry(armorPlan,{depth:2.9,bevelEnabled:true,bevelThickness:.22,bevelSize:.22,bevelSegments:1,steps:1}),steel,turretYaw,0,3.4,0);house.rotation.x=Math.PI/2;
  box(turretYaw,8.7,.15,5.8,0,3.63,.3,edgeSteel);
  for(const side of [-1,1]){box(turretYaw,.16,1.8,3.8,side*4.86,2.0,.5,darkSteel);box(turretYaw,.48,.7,1.1,side*4.5,3.5,1.9,darkSteel);}
  const turretElevation=new THREE.Group();turretElevation.position.set(0,2.22,-3);turretYaw.add(turretElevation);
  const guns=[],MUZZLE_Z=-13.1;
  for(let i=0;i<4;i++){
    const barrel=new THREE.Group();barrel.name=`main-gun-${i+1}`;barrel.userData={weaponRole:'main',barrelIndex:i,purchased:i===0};turretElevation.add(barrel);
    const breech=cylinder(barrel,.7,.82,2,0,0,-.3,darkSteel,20);breech.rotation.x=-Math.PI/2;
    const tube=cylinder(barrel,.4,.65,12.1,0,0,-6.8,steel,28);tube.rotation.x=-Math.PI/2;tube.name=`main-gun-tube-${i+1}`;tube.userData={weaponRole:'main',barrelIndex:i};
    for(const [z,r] of [[-1.5,.68],[-3,.6],[-5.5,.53],[-8.8,.47],[-12.5,.42]])ring(barrel,r,.065,0,0,z,edgeSteel);
    ring(barrel,.43,.105,0,0,-13,edgeSteel);const muzzle=mesh(new THREE.CircleGeometry(.33,20),black,barrel,0,0,-13.12);muzzle.rotation.y=Math.PI;
    for(const side of [-1,1]){const piston=cylinder(barrel,.12,.15,3,side*.68,-.42,-1.7,edgeSteel,10);piston.rotation.x=-Math.PI/2;}
    const powerBands=[];
    for(const [level,z,radius] of [[1,-1.8,.72],[2,-3.8,.64],[3,-6.3,.56]]){
      const jacket=cylinder(barrel,radius,radius+.025,.87,0,0,z,darkSteel,8);jacket.rotation.x=-Math.PI/2;jacket.name=`gun-${i+1}-power-${level}`;jacket.visible=false;powerBands.push(jacket);
    }
    const feedCase=armoredPrism(barrel,.95,.32,2.5,0,-.72,-.05,darkSteel,.025);feedCase.name=`gun-${i+1}-feed-mechanism`;feedCase.visible=false;
    const reactorMat=new THREE.MeshBasicMaterial({color:0x66dfff,transparent:true,opacity:.9});
    ownedMaterials.push(reactorMat);
    const reactor=mesh(new THREE.CircleGeometry(.26,20),reactorMat,barrel,0,0,-13.14);reactor.rotation.y=Math.PI;reactor.visible=false;
    const flash=new THREE.PointLight(0xffba64,0,32,2);flash.position.set(0,0,MUZZLE_Z);barrel.add(flash);
    guns.push({base:batteryMount,swivel:turretYaw,pitch:turretElevation,barrel,flash,reactor,tube,powerBands,feedCase,cooldown:0,recoil:0,index:i});
  }
  // Shape/Extrude UVs otherwise contain metre-sized coordinates. Project them
  // into a bounded panel/deck range so external bitmap tiles do not shimmer.
  const normalizedGeometries=new Set();
  ship.traverse(object=>{
    const geometry=object.geometry;if(!geometry||normalizedGeometries.has(geometry)||(!['ShapeGeometry','ExtrudeGeometry'].includes(geometry.type)&&!(object.material===wood&&geometry.type==='BoxGeometry')))return;
    normalizedGeometries.add(geometry);geometry.computeBoundingBox();
    const min=geometry.boundingBox.min,size=geometry.boundingBox.getSize(new THREE.Vector3()),p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),uv=[];
    const ratio=(value,offset,extent)=>(value-offset)/Math.max(.001,extent);
    for(let i=0;i<p.count;i++){
      if(object.material===wood){
        if(Math.abs(n?.getZ(i)||0)>.70&&geometry.type!=='BoxGeometry')uv.push((p.getX(i)-min.x)/10.8,(p.getY(i)-min.y)/26);
        else uv.push((p.getX(i)-min.x)/10.8,(p.getZ(i)-min.z)/26);
      }
      else if(Math.abs(n?.getZ(i)||0)>.70)uv.push(ratio(p.getX(i),min.x,size.x),ratio(p.getY(i),min.y,size.y));
      else if(Math.abs(n?.getY(i)||0)>.70)uv.push(ratio(p.getX(i),min.x,size.x),ratio(p.getZ(i),min.z,size.z));
      else uv.push(ratio(p.getY(i),min.y,size.y),ratio(p.getZ(i),min.z,size.z));
    }
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  });
  // Paint a restrained ambient shade into existing vertices. Under-platform
  // faces stay dark even when a bright sky would otherwise flatten the bridge.
  // This adds no meshes, lights, texture fetches or post-processing passes.
  ship.updateMatrixWorld(true);
  const shadedGeometries=new Set(),paintMaterials=new Set([steel,darkSteel,edgeSteel,wood]);
  ship.traverse(object=>{
    const geometry=object.geometry;if(!object.isMesh||!paintMaterials.has(object.material)||shadedGeometries.has(geometry))return;
    shadedGeometries.add(geometry);const normals=geometry.getAttribute('normal');if(!normals)return;
    const matrix=new THREE.Matrix3().getNormalMatrix(object.matrixWorld),normal=new THREE.Vector3(),colors=[];
    for(let i=0;i<normals.count;i++){
      normal.set(normals.getX(i),normals.getY(i),normals.getZ(i)).applyNormalMatrix(matrix);
      const shade=Math.max(.46,Math.min(.98,.74+.24*Math.max(0,normal.y)-.28*Math.max(0,-normal.y)));
      colors.push(shade*.985,shade,Math.min(1,shade*1.015));
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  });
  ship.userData.dimensions={width:22.4,length:133,bow:-42,stern:91};
  let hullMode='battleship',capacityLevel=0;
  function setHullMode(mode='battleship',capacity=0,levels={},loadout={}) {
    hullMode=mode==='hybrid'?'hybrid':'battleship';capacityLevel=Math.max(0,Math.min(5,Math.floor(Number(capacity)||0)));
    const hybrid=hullMode==='hybrid';standardAft.visible=!hybrid;hybridForeTurret.visible=false;aftTurret.visible=false;aviation.group.visible=hybrid;
    funnels[0].position.z=hybrid?41.1:50;funnels[1].position.z=hybrid?46.0:64;
    const deckState=aviation.configure(capacityLevel,levels,loadout);
    ship.userData.hullMode=hullMode;ship.userData.aviation={...deckState};
    return {mode:hullMode,capacityLevel,parkedCount:hybrid?deckState.parkedCount:0};
  }
  function getDeckPose() {
    return {launchOrigin:new THREE.Vector3(0,9,65),landingOrigin:new THREE.Vector3(0,9,82),elevatorPos:new THREE.Vector3(7.55,8.75,68.5),mode:hullMode,capacityLevel};
  }
  function setBatteryCount(count=1,gunLevels=[]){
    const installed=Math.max(1,Math.min(4,Math.floor(Number(count)||1)));
    guns.forEach((gun,i)=>{
      const level=gunLevels?.[i]||{},power=Math.max(0,Math.min(3,Number(level.power)||0)),reload=Math.max(0,Math.min(3,Number(level.reload)||0));
      gun.barrel.visible=i<installed;gun.barrel.userData.purchased=i<installed;
      gun.barrel.position.x=(i-(installed-1)/2)*(installed===4?2.05:2.3);gun.barrel.scale.setScalar(1+.035*power);
      gun.powerBands.forEach((band,j)=>{band.visible=power>=j+1;});gun.feedCase.visible=reload>0;gun.feedCase.scale.z=1+reload*.18;
    });
    ship.userData.armedGunCount=installed;return installed;
  }
  function setEquipmentVisuals(state={}){
    const source=state&&typeof state==='object'?state:{},installed=Array.isArray(source.guns)&&source.guns.length?source.guns:[{}],upgrades=source.upgrades||{};
    const count=setBatteryCount(installed.length,installed),armor=Math.max(0,Math.min(3,Number(upgrades.armor)||0));
    armorBelts.forEach((belt,i)=>{belt.visible=armor>=i+1;});
    ship.userData.visualEquipment={gunCount:count,armorLevel:armor,radarLevel:Number(upgrades.radar)||0,aaLevel:Number(upgrades.aa)||0};
    return {...ship.userData.visualEquipment};
  }
  function setSurfaceMaps(maps={}){
    const source=maps&&typeof maps==='object'?maps:{};
    for(const material of [steel,darkSteel,edgeSteel]){
      if(source.steel?.isTexture)material.map=source.steel;
      if(source.bump?.isTexture){material.bumpMap=source.bump;material.bumpScale=.026;}
      material.needsUpdate=true;
    }
    if(source.steel?.isTexture){steel.color.setHex(0x91a5b0);darkSteel.color.setHex(0x637b8a);edgeSteel.color.setHex(0xb7c6cc);}
    if(source.wood?.isTexture){wood.map=source.wood;wood.color.setHex(0xa7b1be);wood.needsUpdate=true;}
    // Supplied textures are owned by the caller. The original fallback maps
    // remain listed here so they can be disposed independently at teardown.
    ship.userData.surfaceMaps={steel:steel.map?.uuid,wood:wood.map?.uuid};
    return {...ship.userData.surfaceMaps};
  }
  setHullMode();
  setEquipmentVisuals();
  return {ship,guns,batteryMount,turretYaw,turretElevation,MUZZLE_Z,setHullMode,getDeckPose,setBatteryCount,setEquipmentVisuals,setSurfaceMaps,aviationDeck:aviation.group,ownedMaterials,ownedTextures};
}
