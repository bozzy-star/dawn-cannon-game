// Four silhouettes share the weathered steel materials supplied by the scene.
// Local +Z is the bow, facing the player's ship. Sizes are in scene metres.
export function createWarship(kind, kit) {
  const { THREE, steel, darkSteel, edgeSteel, deckMat, wood, black, bronze,
    box, cylinder, ring, mesh } = kit;
  const key = ({ destroyer: 'destroyer', cruiser: 'cruiser', battleship: 'battleship', carrier: 'carrier' })[kind] || 'destroyer';
  const sizes = {
    destroyer: { width: 2.7, length: 19, deck: 1.75, hull: 2.05, radius: 2.65 },
    cruiser: { width: 8, length: 25, deck: 2.25, hull: 2.55, radius: 4.7 },
    battleship: { width: 11, length: 33, deck: 2.8, hull: 3.15, radius: 6.3 },
    carrier: { width: 12, length: 35, deck: 3.5, hull: 3.9, radius: 6.6 },
  };
  const s = sizes[key];
  const root = new THREE.Group();
  root.name = key;
  const muzzleOffsets = [], smokeOffsets = [], ownedMaterials = [], ownedTextures = [];
  const weakMaterial = new THREE.MeshStandardMaterial({
    color: 0x86392b, emissive: 0x551404, emissiveIntensity: .72,
    metalness: .57, roughness: .56,
  });
  ownedMaterials.push(weakMaterial);
  const minor = (m) => { m.castShadow = false; return m; };

  // A rounded stern and pointed bow preserve a ship silhouette at long range.
  const shape = new THREE.Shape();
  const hw = s.width / 2, hl = s.length / 2;
  shape.moveTo(-hw * .76, -hl);
  shape.quadraticCurveTo(-hw, -hl, -hw, -hl + 2);
  shape.lineTo(-hw, hl * .5);
  shape.quadraticCurveTo(-hw * .78, hl * .91, 0, hl);
  shape.quadraticCurveTo(hw * .78, hl * .91, hw, hl * .5);
  shape.lineTo(hw, -hl + 2);
  shape.quadraticCurveTo(hw, -hl, hw * .76, -hl);
  shape.closePath();
  const hull = mesh(new THREE.ExtrudeGeometry(shape, {
    depth: s.hull, bevelEnabled: true, bevelSize: .13,
    bevelThickness: .12, bevelSegments: 1, steps: 1,
  }), darkSteel, root, 0, s.deck, 0);
  hull.rotation.x = Math.PI / 2;
  const mainDeck = mesh(new THREE.ShapeGeometry(shape, 12), key === 'carrier' ? deckMat : wood, root, 0, s.deck + .025, 0);
  mainDeck.rotation.x = Math.PI / 2;
  // ShapeGeometry normally faces down after rotation; deck must be visible above.
  mainDeck.rotation.y = Math.PI;

  function house(w, h, d, x, y, z, windows = true) {
    const group = new THREE.Group(); group.position.set(x, y, z); root.add(group);
    box(group, w, h, d, 0, 0, 0, steel);
    box(group, w + .18, .16, d + .18, 0, h / 2 + .08, 0, deckMat);
    if (windows) {
      // A continuous dark window strip remains readable on a phone screen.
      minor(box(group, w * .81, .38, .04, 0, h * .19, d / 2 + .025, black));
      for (const side of [-1, 1]) minor(box(group, .035, .38, d * .65, side * (w / 2 + .025), h * .19, 0, black));
    }
    return group;
  }

  function funnel(x, z, radius, height, y = s.deck) {
    const top = y + height;
    cylinder(root, radius * .87, radius, height, x, y + height / 2, z, darkSteel, 12);
    cylinder(root, radius * .91, radius * .91, .17, x, top, z, black, 12);
    minor(ring(root, radius * .94, .06, x, top - .18, z, edgeSteel)).rotation.x = Math.PI / 2;
    smokeOffsets.push(new THREE.Vector3(x, top + .12, z));
  }

  function mast(x, z, baseY, height, large = false) {
    minor(cylinder(root, .055, .1, height, x, baseY + height / 2, z, edgeSteel, 6));
    const arm = minor(cylinder(root, .035, .035, large ? 3.7 : 1.8, x, baseY + height * .73, z, darkSteel, 6));
    arm.rotation.z = Math.PI / 2;
    if (large) {
      box(root, 1.8, .36, .2, x, baseY + height - .35, z, darkSteel);
      box(root, .16, .85, .15, x, baseY + height - .7, z, edgeSteel);
    }
  }

  function turret(x, z, y, scale, barrels, length, direction = 1) {
    const g = new THREE.Group(); g.position.set(x, y, z); root.add(g);
    if (direction < 0) g.rotation.y = Math.PI;
    const width = scale * (barrels === 3 ? 2.8 : barrels === 2 ? 2.35 : 1.65);
    cylinder(g, width * .51, width * .57, .42 * scale, 0, .21 * scale, 0, darkSteel, 12);
    box(g, width, .85 * scale, 1.8 * scale, 0, .77 * scale, 0, steel);
    const armor = box(g, width * .91, .9 * scale, .27 * scale, 0, .82 * scale, .93 * scale, edgeSteel);
    armor.rotation.x = -.16;
    for (let i = 0; i < barrels; i++) {
      const bx = (i - (barrels - 1) / 2) * .59 * scale;
      const bz = .58 * scale + length / 2;
      const barrel = cylinder(g, .1 * scale, .19 * scale, length, bx, 1.03 * scale, bz, darkSteel, 10);
      barrel.rotation.x = Math.PI / 2 - .025;
      minor(ring(g, .105 * scale, .025 * scale, bx, 1.03 * scale + length * .0125, .58 * scale + length, edgeSteel));
      muzzleOffsets.push(new THREE.Vector3(x + bx * direction, y + 1.03 * scale + length * .0125, z + direction * (.58 * scale + length)));
    }
  }

  function rail(x, z, length, y) {
    const bar = minor(cylinder(root, .026, .026, length, x, y + .62, z, edgeSteel, 5));
    bar.rotation.x = Math.PI / 2;
    for (const dz of [-length / 2, 0, length / 2]) minor(cylinder(root, .028, .028, .69, x, y + .3, z + dz, edgeSteel, 5));
  }

  function weakEngine(x, y, z, width) {
    box(root, width + .3, 1.3, 1.1, x, y, z - .25, darkSteel);
    box(root, width, .94, .2, x, y, z + .34, weakMaterial);
    for (const dx of [-.27, .27]) minor(box(root, .055, .98, .035, x + dx * width, y, z + .45, bronze));
    minor(box(root, width + .08, .09, .1, x, y + .49, z + .45, edgeSteel));
    return new THREE.Vector3(x, y, z + .47);
  }

  let weakOffset;
  if (key === 'destroyer') {
    // Low bridge, two slim funnels, two single guns: a narrow escort profile.
    house(1.95, 1.3, 3.3, 0, s.deck + .65, -.3);
    house(1.7, 1.0, 1.6, 0, s.deck + 1.75, .65);
    funnel(0, -3.0, .37, 2.7);
    funnel(0, -5.0, .34, 2.4);
    mast(-.5, -.7, s.deck + 2.3, 3.5);
    turret(0, 6.1, s.deck, .7, 1, 2.4);
    turret(0, -7.2, s.deck, .65, 1, 2.0, -1);
    for (const x of [-1.13, 1.13]) rail(x, -.5, 10, s.deck);
    weakOffset = weakEngine(0, s.deck + .78, 3.6, 1.25);
    box(root, .8, .3, 1.3, .75, s.deck + .18, -3.5, deckMat);
  } else if (key === 'cruiser') {
    // A long raised bridge and two broad funnels distinguish the cruiser.
    house(4.3, 1.9, 7.0, 0, s.deck + .95, -1.8);
    house(3.3, 1.6, 3.0, 0, s.deck + 2.7, .05);
    house(2.6, .6, 2.4, 0, s.deck + 3.85, .2);
    funnel(0, -3.8, .75, 4.1);
    funnel(0, -6.8, .64, 3.7);
    mast(-.8, -.8, s.deck + 3.6, 4.2, true);
    turret(0, 7.7, s.deck, 1.0, 2, 3.2);
    turret(0, -9.3, s.deck, .95, 2, 2.9, -1);
    for (const side of [-1, 1]) {
      rail(side * 3.6, 1, 13, s.deck);
      turret(side * 3.0, -2.3, s.deck + .1, .48, 1, 1.35);
      box(root, .8, .5, 2.6, side * 2.65, s.deck + .28, -6.0, deckMat);
    }
    weakOffset = weakEngine(2.4, s.deck + .95, 4.5, 1.8);
  } else if (key === 'battleship') {
    // Armored superstructure plus three triple main turrets, two forward.
    house(5.7, 1.55, 11.0, 0, s.deck + .78, -2.3, false);
    house(4.7, 2.2, 4.4, 0, s.deck + 2.65, -.5);
    house(3.7, 1.8, 3.2, 0, s.deck + 4.65, -.45);
    house(2.9, .55, 2.7, 0, s.deck + 5.83, -.4);
    funnel(0, -5.0, 1.04, 5.15);
    mast(-.3, -.6, s.deck + 5.4, 4.0, true);
    turret(0, 10.8, s.deck, 1.42, 3, 4.3);
    turret(0, 5.8, s.deck + 1.1, 1.3, 3, 4.0);
    turret(0, -11.1, s.deck, 1.38, 3, 4.0, -1);
    for (const side of [-1, 1]) {
      rail(side * 5.0, -2, 16, s.deck);
      turret(side * 4.35, -3.7, s.deck + .15, .5, 1, 1.8);
      minor(box(root, 1.0, .55, 2.8, side * 3.85, s.deck + .35, -7, deckMat));
    }
    weakOffset = weakEngine(3.5, s.deck + 1.0, 4.8, 2.05);
  } else {
    // An uninterrupted flight deck and a starboard island make the carrier
    // recognizable even without aircraft launches in this prototype.
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 512;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#4a514e'; ctx.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 512; y += 22) { ctx.fillStyle = '#2b333544'; ctx.fillRect(0, y, 256, 1); }
    ctx.strokeStyle = '#cfccbc'; ctx.lineWidth = 3; ctx.strokeRect(42, 18, 143, 476);
    ctx.setLineDash([13, 11]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(113, 19); ctx.lineTo(113, 494); ctx.stroke();
    ctx.setLineDash([]); ctx.lineWidth = 4;
    for (const y of [70, 84, 98]) { ctx.beginPath(); ctx.moveTo(49, y); ctx.lineTo(178, y); ctx.stroke(); }
    ctx.fillStyle = '#ceccbe'; ctx.font = 'bold 27px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('04', 113, 47);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    ownedTextures.push(texture);
    const flightMat = new THREE.MeshStandardMaterial({ map: texture, roughness: .88, metalness: .32 });
    ownedMaterials.push(flightMat);
    box(root, 12, .35, 34.0, 0, s.deck + .18, -.2, darkSteel);
    const flightDeck = mesh(new THREE.PlaneGeometry(11.7, 33.8), flightMat, root, 0, s.deck + .365, -.2);
    flightDeck.rotation.x = -Math.PI / 2;
    house(2.05, 3.2, 6.0, 4.35, s.deck + 1.85, -1.2);
    house(2.45, 1.05, 3.1, 4.4, s.deck + 3.9, .15);
    funnel(4.4, -2.4, .55, 5.1);
    mast(4.3, -.3, s.deck + 4.1, 3.7, true);
    for (const x of [-5.8, 5.8]) {
      box(root, .85, .55, 7, x, s.deck - .4, -8, darkSteel);
      rail(x, -6, 13, s.deck);
    }
    // Two parked silhouettes: fuselage, wings, tail, nose, and dark canopy.
    function plane(x, z, angle) {
      const group = new THREE.Group(); group.position.set(x, s.deck + .69, z); group.rotation.y = angle; root.add(group);
      box(group, .52, .42, 2.75, 0, 0, 0, edgeSteel);
      box(group, 3.7, .09, .67, 0, -.1, .3, steel);
      box(group, 1.33, .07, .44, 0, .06, -1.12, steel);
      box(group, .07, .6, .54, 0, .24, -1.12, darkSteel);
      minor(box(group, .43, .21, .65, 0, .29, .15, black));
      const prop = minor(box(group, 1.23, .1, .07, 0, 0, 1.43, black));
      prop.rotation.z = -.3;
    }
    plane(-2.8, -9.8, .12); plane(1.1, -11.6, -.08);
    turret(-5.0, 9.1, s.deck - .35, .65, 2, 2.1);
    weakOffset = weakEngine(4.05, s.deck + .93, 5.0, 1.65);
  }

  root.userData.kind = key;
  root.userData.dimensions = { width: s.width, length: s.length, deckHeight: s.deck };
  root.userData.weakOffset = weakOffset;
  return { root, weakOffset, muzzleOffsets, smokeOffsets, hitRadius: s.radius,
    ownedMaterials, ownedTextures, hullLength: s.length, hullWidth: s.width,
    markerHeight: key === 'battleship' ? 13 : key === 'carrier' ? 12 : key === 'cruiser' ? 11 : 9 };
}
