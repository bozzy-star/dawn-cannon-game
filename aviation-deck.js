// A raised aft hangar/flight deck and prebuilt aircraft keep refits inexpensive.
export function createAviationDeck(kit) {
  const {THREE,steel,darkSteel,edgeSteel,wood,black,box,cylinder,mesh}=kit;
  const group=new THREE.Group();group.name='hybrid-aviation-deck';
  const ownedMaterials=[],ownedTextures=[];
  const safety=new THREE.MeshStandardMaterial({color:0xc6b78b,roughness:.8,metalness:.2});
  const planeMaterials={
    interceptor:new THREE.MeshStandardMaterial({vertexColors:true,color:0x9eabad,metalness:.4,roughness:.63}),
    bomber:new THREE.MeshStandardMaterial({vertexColors:true,color:0xb0aaa0,metalness:.35,roughness:.67}),
    fighter:new THREE.MeshStandardMaterial({vertexColors:true,color:0x8b9da2,metalness:.42,roughness:.6}),
  };
  ownedMaterials.push(safety,...Object.values(planeMaterials));
  // The visible flight deck is higher than the aft guns and wider than the hull.
  // Open side supports and the dark stern hangar opening distinguish the hybrid.
  box(group,19.5,4.95,33.4,0,5.4,67.5,black).name='shadowed-hangar-interior';
  const deckOutline=new THREE.Shape();deckOutline.moveTo(-8.9,48);
  for(const point of [[8.9,48],[11.7,54],[11.7,85.5],[9.55,89],[-9.55,89],[-11.7,85.5],[-11.7,54]])deckOutline.lineTo(...point);deckOutline.closePath();
  const deckPlate=mesh(new THREE.ExtrudeGeometry(deckOutline,{depth:.36,bevelEnabled:true,bevelSize:.07,bevelThickness:.04,bevelSegments:1,steps:1}),steel,group,0,8.48,0);deckPlate.rotation.x=Math.PI/2;deckPlate.name='chamfered-flight-deck';
  const flightSurface=mesh(new THREE.ShapeGeometry(deckOutline,10),wood,group,0,8.53,0);flightSurface.rotation.x=-Math.PI/2;flightSurface.scale.y=-1;flightSurface.name='teak-flight-deck';
  box(group,14.2,3.65,.08,0,4.86,84.55,black).name='stern-hangar-door';
  box(group,15.4,.56,1.0,0,7.2,84.8,edgeSteel);
  box(group,20.1,5.2,.5,0,5.2,50.5,steel).name='hangar-forward-bulkhead';
  for(const side of [-1,1]) {
    box(group,.48,5.4,34,side*10.1,5.55,67.5,steel);
    box(group,.22,.68,40.4,side*11.5,8.2,68.5,darkSteel);
    for(const z of [50,60,70,80,87]) {
      box(group,.45,4.5,.45,side*11.1,5.6,z,edgeSteel);
      const brace=box(group,.33,2.7,.38,side*10.65,7.1,z,darkSteel);brace.rotation.z=side*-.56;
    }
  }
  const deckLines=[],cableLines=[];
  const line=(list,a,b)=>list.push(...a,...b);
  // Tall hinged hangar doors, side louvers and structural braces give the
  // elevated flight deck depth instead of an uninterrupted gray block.
  for(const side of [-1,1]){
    for(let z=52;z<83;z+=4.0){line(cableLines,[side*10.4,3.1,z],[side*10.4,7.7,z+2.2]);line(cableLines,[side*10.4,7.7,z],[side*10.4,3.1,z+2.2]);}
    for(let z=54;z<82;z+=3)for(const y of [5.35,5.65,5.95])line(cableLines,[side*10.36,y,z],[side*10.36,y,z+1.6]);
    for(const x of [1.2,2.4,3.6,4.8,6.0])line(cableLines,[side*x,3.12,84.66],[side*x,6.57,84.66]);
  }
  for(const y of [3.3,4.1,4.9,5.7,6.5])line(cableLines,[-6.9,y,84.65],[6.9,y,84.65]);
  // Painted centerline, arresting wires, elevator recess and a dashed launch lane.
  for(const x of [-2.9,2.9])line(deckLines,[x,8.61,49],[x,8.61,87.7]);
  for(let z=49.5;z<87;z+=3.0)line(deckLines,[0,8.62,z],[0,8.62,z+1.4]);
  for(const z of [78,80,82,84])line(cableLines,[-9.8,8.65,z],[9.8,8.65,z]);
  for(const x of [-11.65,11.65]) {
    for(const y of [8.96,9.36])line(cableLines,[x,y,48.4],[x,y,88.7]);
    for(let z=48.5;z<89;z+=1.55)line(cableLines,[x,8.55,z],[x,9.41,z]);
  }
  const elevator=box(group,5.2,.13,7.2,7.55,8.66,68.5,darkSteel);elevator.name='aircraft-elevator';
  for(const x of [4.9,10.2])line(deckLines,[x,8.75,64.85],[x,8.75,72.15]);
  for(const z of [64.85,72.15])line(deckLines,[4.9,8.75,z],[10.2,8.75,z]);
  for(const z of [51,54])box(group,.12,.035,9,0,8.64,z,safety).rotation.y=Math.PI/2;
  // Two wing cranes retain the Ise-like silhouette without extra spotlights.
  for(const side of [-1,1]) {
    cylinder(group,.25,.38,6.2,side*11.7,7.4,59.5,steel,8);
    const arm=box(group,.28,.32,7.2,side*10.8,10.7,62.6,edgeSteel);arm.rotation.x=-.14;
    line(cableLines,[side*11.7,10.8,59.5],[side*10.8,11.15,66.2]);
    line(cableLines,[side*10.8,11.15,66.2],[side*10.8,8.85,66.2]);
    line(cableLines,[side*12.5,8.6,48.5],[side*12.5,8.6,89]);
  }
  for(const [data,color,name] of [[deckLines,0xd2c8ae,'flight-deck-markings'],[cableLines,0x7f8989,'flight-deck-railings-and-cables']]) {
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(data,3));
    const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:.85});ownedMaterials.push(material);
    const detail=new THREE.LineSegments(geo,material);detail.name=name;group.add(detail);
  }
  function makeAircraftGeometry(generation) {
    const positions=[],normals=[],colors=[];
    const palette={body:[.80,.84,.85],wing:[.64,.70,.72],dark:[.09,.15,.18],nose:[.72,.77,.78]};
    function part(geometry,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0],color='body') {
      const plain=geometry.index?geometry.toNonIndexed():geometry;
      const matrix=new THREE.Matrix4().compose(new THREE.Vector3(...position),new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),new THREE.Vector3(...scale));
      plain.applyMatrix4(matrix);
      const p=plain.getAttribute('position'),n=plain.getAttribute('normal'),rgb=palette[color];
      for(let i=0;i<p.count;i++){positions.push(p.getX(i),p.getY(i),p.getZ(i));normals.push(n.getX(i),n.getY(i),n.getZ(i));colors.push(...rgb);}
      if(plain!==geometry)plain.dispose();geometry.dispose();
    }
    const block=(w,h,d,x,y,z,color='body',rotation=[0,0,0])=>part(new THREE.BoxGeometry(w,h,d),[x,y,z],[1,1,1],rotation,color);
    if(generation==='propeller') {
      part(new THREE.SphereGeometry(1,8,5),[0,.44,0],[.35,.34,2.12]);
      block(4.65,.1,.73,0,.45,-.16,'wing');block(1.72,.08,.42,0,.69,1.61,'wing');
      block(.075,.82,.6,0,1.0,1.58,'wing');block(.39,.34,.81,0,.73,-.43,'dark');
      part(new THREE.CylinderGeometry(.31,.31,.4,8),[0,.44,-1.9],[1,1,1],[Math.PI/2,0,0],'nose');
      block(1.66,.095,.08,0,.44,-2.17,'dark',[0,0,.25]);
      block(.095,1.66,.08,0,.44,-2.17,'dark',[0,0,.25]);
      for(const side of [-1,1])part(new THREE.CylinderGeometry(.15,.15,.12,6),[side*.52,.10,-.24],[1,1,1],[0,0,Math.PI/2],'dark');
    } else if(generation==='jet') {
      part(new THREE.SphereGeometry(1,8,5),[0,.48,0],[.31,.31,2.25]);
      for(const side of [-1,1]) {
        block(2.6,.10,1.04,side*1.0,.44,.22,'wing',[0,side*-.42,0]);
        block(.32,.38,1.40,side*.46,.35,.96,'dark');
        block(1.19,.065,.61,side*.53,.61,1.65,'wing',[0,side*-.3,0]);
      }
      block(.10,1.00,.72,0,1.10,1.66,'wing',[.13,0,0]);
      block(.35,.27,.88,0,.79,-.8,'dark');block(.17,.10,.15,0,.08,-.95,'dark');
    } else {
      // Broad diamond wing and twin canted tails read as a stealth airframe.
      const wing=new THREE.Shape();wing.moveTo(0,-2.6);wing.lineTo(-2.6,.8);wing.lineTo(-.85,1.55);wing.lineTo(0,1.1);wing.lineTo(.85,1.55);wing.lineTo(2.6,.8);wing.closePath();
      part(new THREE.ExtrudeGeometry(wing,{depth:.14,bevelEnabled:false}),[0,.43,0],[1,1,1],[Math.PI/2,0,0],'wing');
      part(new THREE.SphereGeometry(1,7,4),[0,.58,-.1],[.39,.24,2.15]);
      for(const side of [-1,1])block(.085,.83,.72,side*.7,.94,1.30,'wing',[.1,0,side*-.31]);
      block(.33,.17,.85,0,.83,-.88,'dark');
      for(const side of [-1,1])block(.39,.14,.38,side*.38,.41,1.68,'dark');
    }
    const geo=new THREE.BufferGeometry();
    geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));
    geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geo.computeBoundingSphere();return geo;
  }
  const geometries={propeller:makeAircraftGeometry('propeller'),jet:makeAircraftGeometry('jet'),stealth:makeAircraftGeometry('stealth')};
  const parked=[];
  for(let i=0;i<8;i++) {
    const slot=new THREE.Group();slot.name=`parked-aircraft-${i+1}`;
    slot.position.set(i%2?-5.15:5.15,8.74,52.1+Math.floor(i/2)*10.0);slot.rotation.y=i%2?.07:-.07;group.add(slot);
    const models={};
    for(const generation of Object.keys(geometries)) {
      const aircraft=mesh(geometries[generation],planeMaterials.interceptor,slot);aircraft.name=generation;aircraft.castShadow=false;
      aircraft.visible=false;models[generation]=aircraft;
    }
    parked.push({slot,models});
  }
  function configure(capacityLevel=0,levels={},loadout={}) {
    levels=levels&&typeof levels==='object'?levels:{};
    loadout=loadout&&typeof loadout==='object'?loadout:{};
    const capacity=Math.max(0,Math.min(5,Math.floor(Number(capacityLevel)||0)));
    const maxParked=Math.min(8,2+capacity*2);
    const roles=['interceptor','bomber','fighter'];
    const counts=roles.map(role=>Math.max(0,Math.floor(Number(loadout[role])||0)));
    const hasCounts=roles.some(role=>Object.prototype.hasOwnProperty.call(loadout,role));
    let sequence=[];
    if(hasCounts){while(sequence.length<maxParked&&counts.some(n=>n>0)){for(let i=0;i<roles.length&&sequence.length<maxParked;i++)if(counts[i]>0){sequence.push(roles[i]);counts[i]--;}}}
    else sequence=Array.from({length:maxParked},(_,i)=>roles[i%3]);
    parked.forEach((entry,i)=>{
      entry.slot.visible=i<sequence.length;
      const role=sequence[i]||'interceptor',level=Math.max(0,Math.min(5,Number(levels[role]??levels.aircraft)||0));
      const generation=level>=4?'stealth':level>=1?'jet':'propeller';
      entry.slot.userData={role,generation,level};
      for(const [name,object] of Object.entries(entry.models)){object.visible=name===generation;object.material=planeMaterials[role];}
      entry.slot.scale.setScalar(role==='bomber'?1.08:1);
    });
    group.userData={capacityLevel:capacity,parkedCount:sequence.length,roles:sequence};
    return {...group.userData};
  }
  configure();
  return {group,parked,configure,ownedMaterials,ownedTextures};
}
