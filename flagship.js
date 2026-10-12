// Code-built naval geometry: long bow, pagoda bridge and a shared expanding turret.
export function buildFlagship(kit) {
  const {THREE,steel,darkSteel,edgeSteel,wood,black,bronze,box,cylinder,ring,mesh}=kit;
  const ship=new THREE.Group();ship.name='Asahi';
  const detail=new THREE.Group();detail.name='ship-details';ship.add(detail);
  const red=new THREE.MeshStandardMaterial({color:0x4d2624,roughness:.86,metalness:.2});
  const glass=new THREE.MeshStandardMaterial({color:0x07181f,metalness:.08,roughness:.32});
  const plan=new THREE.Shape();plan.moveTo(0,-42);
  plan.bezierCurveTo(-3,-40,-9,-25,-10.6,-10);plan.lineTo(-11.2,63);
  plan.bezierCurveTo(-10.8,79,-8,88,-5,91);plan.lineTo(5,91);
  plan.bezierCurveTo(8,88,10.8,79,11.2,63);plan.lineTo(10.6,-10);
  plan.bezierCurveTo(9,-25,3,-40,0,-42);plan.closePath();
  const hull=mesh(new THREE.ExtrudeGeometry(plan,{depth:4.6,bevelEnabled:true,bevelSize:.38,bevelThickness:.4,bevelSegments:2,steps:1}),darkSteel,ship,0,2.0,0);hull.rotation.x=Math.PI/2;
  const under=hull.clone();under.material=red;under.position.y=-1.9;under.scale.set(.98,.98,.48);ship.add(under);
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
  }
  // The stepped bridge rises above the funnels, matching the references' silhouette.
  const bridge=new THREE.Group();bridge.name='pagoda-bridge';bridge.position.z=34;ship.add(bridge);
  for(const [y,w,d,h] of [[4.0,13,12,2.4],[6.4,10.2,10,2.6],[9.1,8.2,8.3,2.4],[11.8,9.8,6.7,2.1],[14,7.2,5.8,2],[16,6,5,1.9],[18,5.4,4.4,1.8],[20,7.4,3.9,1.5]]){
    if(y<10){box(bridge,w,h,d,0,y,0,steel);}else{const core=cylinder(bridge,w*.48,w*.51,h,0,y,0,steel,20);core.scale.z=d/w;}
    const roof=cylinder(bridge,w*.53,w*.53,.18,0,y+h*.5+.15,0,edgeSteel,20);roof.scale.z=(d+.6)/(w+1);
    if(y>=6&&y<10){box(bridge,w*.86,.54,.05,0,y+.3,-d/2-.035,glass);for(const side of [-1,1])box(bridge,.05,.54,d*.75,side*(w/2+.035),y+.3,0,glass);}
    if(y>=10){const panes=mesh(new THREE.CylinderGeometry(w*.49+.04,w*.49+.04,.48,24,1,true,Math.PI/2,Math.PI),glass,bridge,0,y+.25,0);panes.scale.z=d/w;}
  }
  for(const [y,w,z] of [[9.8,14,-.9],[13.5,12,-.3],[17.2,9,0]]){box(bridge,w,.23,3.8,0,y,z,edgeSteel);for(const side of [-1,1]){box(bridge,2.1,.9,2.9,side*(w/2-1),y+.55,z,darkSteel);box(bridge,1.7,.35,.05,side*(w/2-1),y+.7,z-1.5,glass);line([side*w/2,y+.85,z+32],[side*w/2,y+.85,z+36]);}}
  for(const side of [-1,1]){line([side*3,3.2,28],[side*3,19.5,32]);for(let y=4;y<19;y+=.65)line([side*3-.3,y,28+(y-3.2)*.24],[side*3+.3,y,28+(y-3.2)*.24]);}
  cylinder(bridge,.15,.28,9,0,24.5,1,edgeSteel,10);
  for(const [y,w] of [[22,13],[25,9],[28,6]]){box(bridge,w,.12,.12,0,y,1,darkSteel);line([-w/2,y,35],[0,29,35]);line([w/2,y,35],[0,29,35]);}
  for(const side of [-1,1]){const leg=cylinder(bridge,.2,.32,15,side*2.2,16.8,2.5,darkSteel,8);leg.rotation.z=side*.16;box(bridge,4,.8,1.2,side*5.5,20.3,0,darkSteel);}
  // Open lattice radar arrays are readable in the orbit and don't look like solid cubes.
  for(const side of [-1,1])for(let i=0;i<5;i++)line([side*(3.5+i*.55),21.9,34.3],[side*(3.5+i*.55),23.4,34.3]);
  for(const side of [-1,1])for(const y of [21.9,22.65,23.4])line([side*3.5,y,34.3],[side*5.7,y,34.3]);
  for(const [z,r,h] of [[50,2.15,9.4],[64,1.65,7]]){const f=cylinder(ship,r*.85,r,h,0,3+h/2,z,darkSteel,20);f.rotation.x=-.09;cylinder(ship,r*.88,r*.88,.6,0,3+h,z-.45,black,20);for(const y of [5,8]){const rim=ring(ship,r,.07,0,y,z,edgeSteel);rim.rotation.x=Math.PI/2;}}
  box(ship,10.8,2.7,27,0,3.8,54,steel);box(ship,11.4,.17,25,0,5.23,54,wood);
  cylinder(ship,.13,.22,13,0,12.5,67,edgeSteel,8);box(ship,9,.12,.12,0,16.3,67,edgeSteel);line([-4.5,16.3,67],[0,19,67]);line([4.5,16.3,67],[0,19,67]);
  // Aft heavy turret, secondary batteries, boats and stern aircraft catapult.
  function decorativeTurret(x,z,scale=1,direction=1){
    const t=new THREE.Group();t.position.set(x,2.9,z);t.scale.setScalar(scale);t.rotation.y=direction<0?Math.PI:0;ship.add(t);
    cylinder(t,3.2,3.6,1,0,.5,0,darkSteel,20);box(t,6.5,2,4.8,0,1.6,0,steel);box(t,6.8,.18,4.8,0,2.7,0,edgeSteel);
    for(const x of [-1.65,0,1.65]){const tube=cylinder(t,.29,.43,7,x,1.9,-4.8,steel,16);tube.rotation.x=-Math.PI/2;ring(t,.3,.055,x,1.9,-8.25,edgeSteel);}
  }
  decorativeTurret(0,74,.91,-1);for(const side of [-1,1])for(const z of [31,57])decorativeTurret(side*7.5,z,.36,side<0?1:-1);
  for(const side of [-1,1]){const boat=mesh(new THREE.SphereGeometry(1,10,6),wood,detail,side*7.3,5.6,45);boat.scale.set(1.2,.55,4.4);box(detail,1.5,.45,5.3,side*7.3,5.8,45,edgeSteel);}
  box(detail,9,.25,.7,0,3.0,86,darkSteel);cylinder(detail,.13,.25,6,5.7,5.5,85,darkSteel,8);line([5.7,8.5,85],[.5,6.7,87]);line([5.7,8.5,85],[5.7,3,85]);
  const lineGeo=new THREE.BufferGeometry();lineGeo.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));detail.add(new THREE.LineSegments(lineGeo,new THREE.LineBasicMaterial({color:0x8c9897,transparent:true,opacity:.68})));
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
    const barrel=new THREE.Group();barrel.name=`main-gun-${i+1}`;turretElevation.add(barrel);
    const breech=cylinder(barrel,.7,.82,2,0,0,-.3,darkSteel,20);breech.rotation.x=-Math.PI/2;
    const tube=cylinder(barrel,.4,.65,12.1,0,0,-6.8,steel,28);tube.rotation.x=-Math.PI/2;
    for(const [z,r] of [[-1.5,.68],[-3,.6],[-5.5,.53],[-8.8,.47],[-12.5,.42]])ring(barrel,r,.065,0,0,z,edgeSteel);
    ring(barrel,.43,.105,0,0,-13,edgeSteel);const muzzle=mesh(new THREE.CircleGeometry(.33,20),black,barrel,0,0,-13.12);muzzle.rotation.y=Math.PI;
    for(const side of [-1,1]){const piston=cylinder(barrel,.12,.15,3,side*.68,-.42,-1.7,edgeSteel,10);piston.rotation.x=-Math.PI/2;}
    const reactorMat=new THREE.MeshBasicMaterial({color:0x66dfff,transparent:true,opacity:.9});
    const reactor=mesh(new THREE.CircleGeometry(.26,20),reactorMat,barrel,0,0,-13.14);reactor.rotation.y=Math.PI;reactor.visible=false;
    const flash=new THREE.PointLight(0xffba64,0,32,2);flash.position.set(0,0,MUZZLE_Z);barrel.add(flash);
    guns.push({base:batteryMount,swivel:turretYaw,pitch:turretElevation,barrel,flash,reactor,cooldown:0,recoil:0,index:i});
  }
  ship.userData.dimensions={width:22.4,length:133,bow:-42,stern:91};
  return {ship,guns,batteryMount,turretYaw,turretElevation,MUZZLE_Z};
}
