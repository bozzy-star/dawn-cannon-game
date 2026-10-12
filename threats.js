import * as THREE from 'three';

// The existing cannon scene displays one world unit as ten metres.
export const METRES_PER_UNIT = 10;
const MAX_AIRCRAFT = 120;
const ORIGIN = new THREE.Vector3(0, 0, 0);
const clamp = THREE.MathUtils.clamp;

function combinedAircraftGeometry() {
  const vertices = [];
  for (const [w, h, d, x, y, z] of [
    [.7, .65, 4.4, 0, 0, 0], [6.1, .13, 1.05, 0, -.15, .55],
    [2.2, .12, .65, 0, .1, -1.7], [.13, 1.1, .8, 0, .5, -1.7],
    [.5, .45, 1.05, 0, .4, .5], [1.65, .13, .16, 0, 0, 2.25],
  ]) {
    const box = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    const p = box.getAttribute('position');
    for (let i = 0; i < p.count; i++) vertices.push(p.getX(i) + x, p.getY(i) + y, p.getZ(i) + z);
    box.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Air attacks, automatic AA, sonar, submarine torpedoes, and ASW weapons.
 * Scene objects for aircraft use one InstancedMesh, including the patrol plane.
 * Callback damage and rewards are owned by the main campaign/combat controller.
 */
export class NavalThreats {
  constructor({ scene, audio, onDamage = () => {}, onAirKill = () => {},
    onSubKill = () => {}, onEffect = () => {}, consume = () => true,
    getUpgrades = () => ({}), getAim = () => ({ origin: ORIGIN, direction: new THREE.Vector3(0, 0, -1), targetPoint: new THREE.Vector3(0, -6, -100) }),
  }) {
    this.scene = scene; this.audio = audio;
    this.onDamage = onDamage; this.onAirKill = onAirKill; this.onSubKill = onSubKill;
    this.onEffect = onEffect; this.consume = consume;
    this.getUpgrades = getUpgrades; this.getAim = getAim;
    this.nextId = 1; this.shipRecords = new Map(); this.aircraft = [];
    this.bombs = []; this.torpedoes = []; this.projectiles = []; this.tracers = [];
    this.pending = 0; this.airKills = 0; this.sonarOn = false;
    this.aswCooldown = 0; this.aaCooldown = 0; this.pingCooldown = 0;
    this.time = 0; this.patrol = null; this.buoyDeployed = false;
    this.geometries = []; this.materials = []; this.initialized = false;
    this.dummy = new THREE.Object3D(); this.scratch = new THREE.Vector3();
    this.reset();
  }

  _geometry(g) { this.geometries.push(g); return g; }
  _material(m) { this.materials.push(m); return m; }
  _mesh(geometry, material, position) {
    const m = new THREE.Mesh(geometry, material);
    if (position) m.position.copy(position);
    this.group.add(m); return m;
  }
  reset() {
    if (this.group) this.scene.remove(this.group);
    this.planes?.dispose();
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
    this.geometries = []; this.materials = [];
    this.group = new THREE.Group(); this.group.name = 'naval-threats'; this.scene.add(this.group);
    this.planeGeo = this._geometry(combinedAircraftGeometry());
    this.planeMat = this._material(new THREE.MeshStandardMaterial({ color: 0x777951, roughness: .76, metalness: .25 }));
    this.planes = new THREE.InstancedMesh(this.planeGeo, this.planeMat, MAX_AIRCRAFT + 1);
    this.planes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.planes.count = 0; this.planes.frustumCulled = false;
    this.group.add(this.planes);
    this.smallGeo = this._geometry(new THREE.SphereGeometry(.22, 6, 4));
    this.torpedoGeo = this._geometry(new THREE.CylinderGeometry(.2, .2, 2.2, 6));
    this.torpedoGeo.rotateX(Math.PI / 2);
    this.chargeGeo = this._geometry(new THREE.CylinderGeometry(.52, .52, 1.05, 8));
    this.lineGeo = this._geometry(new THREE.CylinderGeometry(.045, .045, 1, 5));
    this.darkMat = this._material(new THREE.MeshStandardMaterial({ color: 0x343f44, roughness: .65, metalness: .65 }));
    this.bombMat = this._material(new THREE.MeshStandardMaterial({ color: 0x242b2c, roughness: .75 }));
    this.tracerMat = this._material(new THREE.MeshBasicMaterial({ color: 0xffd490, transparent: true, opacity: .9 }));
    this.wakeMat = this._material(new THREE.MeshBasicMaterial({ color: 0xc8e5e6, transparent: true, opacity: .56, depthWrite: false }));
    this.buoyMat = this._material(new THREE.MeshStandardMaterial({ color: 0xe9a246, roughness: .6 }));
    this.shipRecords.clear(); this.aircraft.length = 0; this.bombs.length = 0;
    this.torpedoes.length = 0; this.projectiles.length = 0; this.tracers.length = 0;
    this.pending = 0; this.airKills = 0; this.aswCooldown = 0; this.aaCooldown = 0;
    this.pingCooldown = .6; this.time = 0; this.patrol = null; this.buoyDeployed = false;
    this.sonarOn = (this.getUpgrades().sonar || 0) >= 3;
    this.initialized = true;
  }

  spawnAirRaid(count) {
    const amount = clamp(Math.floor(Number(count) || 0), 0, 1000);
    this.pending += amount; this._fillRaid(); return amount;
  }
  _fillRaid() {
    while (this.pending > 0 && this.aircraft.length < MAX_AIRCRAFT) {
      this.pending--;
      const n = this.nextId++;
      this.aircraft.push({ id: n, position: new THREE.Vector3((n % 12 - 5.5) * 8 + Math.random() * 5, 23 + (n % 5) * 3, -250 - Math.random() * 85),
        hp: 2.5, phase: Math.random() * Math.PI * 2, state: 'approach', bombed: false,
        speed: 22 + Math.random() * 6, targetX: (Math.random() - .5) * 14 });
    }
  }
  registerShip(enemy) {
    if (!enemy || this.shipRecords.has(enemy.id)) return;
    const submarine = enemy.submarine || enemy.kind === 'submarine';
    const r = { enemy, launchTimer: 4 + Math.random() * 5, torpedoTimer: 5 + Math.random() * 4, phase: Math.random() * 10, ghost: null };
    if (submarine) {
      enemy.submarine = true;
      // ASW target positions retain their real depth; the faint surface silhouette
      // is a separate object, so it cannot become an accidental main-gun target.
      enemy.depth = Number.isFinite(enemy.depth) && enemy.depth > 0 ? enemy.depth : 8;
      enemy.root.position.y = -enemy.depth; enemy.root.visible = false; enemy.detected = false;
      const g = this._geometry(new THREE.SphereGeometry(1, 10, 5));
      const m = this._material(new THREE.MeshBasicMaterial({ color: 0x648c92, transparent: true, opacity: .1, depthTest: false, depthWrite: false }));
      r.ghost = this._mesh(g, m); r.ghost.scale.set(1.65, .05, 10.5);
      r.ghost.renderOrder = 3; r.ghost.visible = false;
    }
    this.shipRecords.set(enemy.id, r);
  }

  toggleSonar() {
    const level = this.getUpgrades().sonar || 0;
    if (!level) return { ok: false, on: false, mode: 'off', reason: 'ソナー未配備' };
    this.sonarOn = !this.sonarOn;
    if (!this.sonarOn) for (const { enemy } of this.shipRecords.values()) if (enemy.submarine) enemy.detected = false;
    if (this.sonarOn && level >= 3 && !this.buoyDeployed && !this.patrol) this._launchPatrol();
    this.pingCooldown = .1;
    return { ok: true, on: this.sonarOn, mode: this.sonarMode,
      reason: this.sonarOn ? level === 1 ? 'パッシブ探知中・主砲装填2倍' : level === 2 ? 'アクティブ探知2000m' : '哨戒機・ソノブイを展開' : 'ソナー停止' };
  }
  get sonarMode() {
    if (!this.sonarOn) return 'off';
    return ['off', 'passive', 'active', 'sonobuoy'][Math.min(3, this.getUpgrades().sonar || 0)];
  }
  _launchPatrol() {
    this.patrol = { time: 0, position: new THREE.Vector3(-18, 9, 45) };
  }
  get contacts() {
    const result = [];
    for (const { enemy: e } of this.shipRecords.values()) {
      if (!e.submarine || e.dead || e.removed) continue;
      result.push({ id: e.id, kind: 'submarine', position: e.root.position.clone(),
        detected: !!e.detected, depth: Math.round(e.depth * METRES_PER_UNIT), hp: e.hp });
    }
    return result;
  }
  get stats() {
    return { airborne: this.aircraft.length, pending: this.pending, airKills: this.airKills,
      sonarOn: this.sonarOn, sonarMode: this.sonarMode, sonarReady: this.buoyDeployed,
      aswCooldown: this.aswCooldown, aswActive: this.projectiles.filter(p => p.kind === 'asw').length, subCount: this.contacts.length,
      bombs: this.bombs.length, torpedoes: this.torpedoes.length };
  }

  _killAircraft(index, reward = true) {
    const a = this.aircraft[index]; if (!a) return;
    this.onEffect(a.position.clone(), 'blast', .5);
    this.aircraft.splice(index, 1); this.airKills++;
    if (reward) this.onAirKill(25);
  }
  dragonSweep() {
    const count = this.aircraft.length + this.pending;
    for (let i = this.aircraft.length - 1; i >= 0; i--) this._killAircraft(i);
    for (let i = 0; i < this.pending; i++) { this.airKills++; this.onAirKill(25); }
    this.pending = 0;
    // A fleet-clearing beam also prevents bombs already dropped by its victims
    // from continuing to damage the player after the dramatic clear.
    for (const b of this.bombs) this.group.remove(b.mesh); this.bombs.length = 0;
    this._updateInstances();
    return count;
  }

  _segment(a, b, material = this.tracerMat, life = .13) {
    const delta = b.clone().sub(a); const length = delta.length();
    const mesh = this._mesh(this.lineGeo, material, a.clone().add(b).multiplyScalar(.5));
    mesh.scale.y = length; mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
    this.tracers.push({ mesh, life });
    // Wake/tracer geometry and materials are shared and disposed by reset only.
    if (this.tracers.length > 180) this.group.remove(this.tracers.shift().mesh);
  }
  _dropBomb(a) {
    if (this.bombs.length >= 80) return;
    const mesh = this._mesh(this.torpedoGeo, this.bombMat, a.position); mesh.rotation.x = Math.PI / 2;
    this.bombs.push({ mesh, velocity: new THREE.Vector3(0, -3, 16), life: 8 });
  }
  _tickAircraft(dt, upgrades) {
    for (const a of this.aircraft) {
      a.phase += dt;
      if (a.state === 'approach') {
        a.position.z += a.speed * dt;
        a.position.x += (a.targetX - a.position.x) * dt * .24;
        a.position.y += (15 + Math.sin(a.phase * .8) * 2 - a.position.y) * dt * .17;
        if (!a.bombed && a.position.z > -42) { this._dropBomb(a); a.bombed = true; }
        if (a.position.z > 75) a.state = 'return';
      } else {
        a.position.z -= a.speed * 1.5 * dt;
        a.position.y += (42 - a.position.y) * dt * .8;
        a.position.x += (70 * Math.sin(a.phase * .25) - a.position.x) * dt * .3;
        if (a.position.z < -300) { a.state = 'approach'; a.bombed = false; }
      }
    }
    this.aaCooldown -= dt;
    const aa = upgrades.aa || 0, radar = upgrades.radar || 0;
    if (aa > 0 && this.aaCooldown <= 0 && this.aircraft.length) {
      let best = -1, distance = Infinity;
      const range = (aa >= 3 ? 245 : 200) * (1 + Math.min(radar, 2) * .14);
      for (let i = 0; i < this.aircraft.length; i++) {
        const d = this.aircraft[i].position.length();
        if (d > range || (aa === 1 && d < 45)) continue;
        if (d < distance) { best = i; distance = d; }
      }
      if (best >= 0) {
        const close = distance < 55 && aa >= 2;
        this.aaCooldown = close ? .13 : aa >= 3 ? .22 : .48;
        if (this.consume('aa', 1)) {
          const target = this.aircraft[best], mount = new THREE.Vector3(best % 2 ? -8 : 8, 4.8, -4);
          this._segment(mount, target.position);
          const vt = radar >= 3;
          const accuracy = vt ? 1 : clamp(.63 + radar * .09 + (close ? .23 : 0), 0, .98);
          if (Math.random() < accuracy) {
            target.hp -= (aa >= 3 ? 2.5 : close ? 1.6 : 1.1) * (vt ? 1.6 : 1);
            this.onEffect(target.position.clone(), 'blast', close ? .16 : .32);
            if (target.hp <= 0) this._killAircraft(best);
          }
          // VT/special ammunition detonates beside aircraft and reaches a nearby
          // formation partner, rather than only increasing a hidden accuracy stat.
          if (vt || aa >= 3) {
            for (let i = this.aircraft.length - 1; i >= 0; i--) {
              const other = this.aircraft[i]; if (other === target) continue;
              if (other.position.distanceTo(target.position) < (vt ? 11 : 7)) {
                other.hp -= vt ? 1.5 : .85;
                if (other.hp <= 0) this._killAircraft(i);
              }
            }
          }
        }
      }
    }
    this._fillRaid();
    for (let i = this.bombs.length - 1; i >= 0; i--) {
      const b = this.bombs[i]; b.life -= dt; b.velocity.y -= 12 * dt;
      b.mesh.position.addScaledVector(b.velocity, dt);
      if (b.mesh.position.y <= 1.5 || b.life <= 0) {
        const p = b.mesh.position.clone(); p.y = .1;
        this.onEffect(p, 'splash', .75);
        if (Math.abs(p.x) < 13 && p.z > -30 && p.z < 28) this.onDamage(7);
        this.group.remove(b.mesh); this.bombs.splice(i, 1);
      }
    }
  }

  _tickPatrol(dt) {
    if (!this.patrol) return;
    const p = this.patrol; p.time += dt;
    p.position.set(-18 + Math.sin(p.time * .5) * 35, 12 + p.time * 1.3, 45 - p.time * 45);
    if (p.time >= 4 && !this.buoyDeployed) {
      this.buoyDeployed = true;
      const mesh = this._mesh(this.chargeGeo, this.buoyMat, p.position);
      this.projectiles.push({ kind: 'buoy', mesh, time: 0, velocity: new THREE.Vector3(0, -2, 0) });
    }
    if (p.time > 9) this.patrol = null;
  }
  _updateInstances() {
    let index = 0;
    for (const a of this.aircraft) {
      this.dummy.position.copy(a.position);
      this.dummy.rotation.set(0, a.state === 'return' ? Math.PI : 0, Math.sin(a.phase) * .11);
      this.dummy.scale.setScalar(1); this.dummy.updateMatrix(); this.planes.setMatrixAt(index++, this.dummy.matrix);
    }
    if (this.patrol) {
      this.dummy.position.copy(this.patrol.position); this.dummy.rotation.set(0, Math.PI, -.12);
      this.dummy.scale.setScalar(1.25); this.dummy.updateMatrix(); this.planes.setMatrixAt(index++, this.dummy.matrix);
    }
    this.planes.count = index; this.planes.instanceMatrix.needsUpdate = true;
  }

  _torpedoFromSub(e) {
    const position = e.root.position.clone(); position.y = .1;
    const target = new THREE.Vector3((Math.random() - .5) * 12, .1, 0);
    const velocity = target.sub(position).normalize().multiplyScalar(24);
    const mesh = this._mesh(this.torpedoGeo, this.darkMat, position);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), velocity.clone().normalize());
    this.torpedoes.push({ mesh, velocity, life: 25, wake: 0, damage: e.spec?.damage || 15 });
  }
  _tickShips(dt, upgrades) {
    let nearest = Infinity;
    for (const [id, r] of this.shipRecords) {
      const e = r.enemy;
      if (e.dead || e.removed) {
        if (r.ghost) this.group.remove(r.ghost);
        this.shipRecords.delete(id); continue;
      }
      if (!e.submarine) {
        const launch = e.spec?.launchCount || 0;
        if (launch) {
          r.launchTimer -= dt;
          if (r.launchTimer <= 0) {
            const free = Math.max(0, MAX_AIRCRAFT - this.aircraft.length - this.pending);
            const count = Math.min(launch, free);
            // Carrier deck departures begin at the carrier's actual position.
            const start = this.aircraft.length;
            this.spawnAirRaid(count);
            for (let i = start; i < this.aircraft.length; i++) {
              const a = this.aircraft[i]; a.position.copy(e.root.position);
              a.position.x += (i - start - count / 2) * 3;
              a.position.z += 5; a.position.y = 9 + (i - start) * .6;
            }
            r.launchTimer = 18 + Math.random() * 10;
          }
        }
        continue;
      }
      r.phase += dt;
      e.root.position.z += dt * (e.spec?.speed || 2);
      e.root.position.x += Math.sin(r.phase * .18) * dt * .55;
      if (e.root.position.z > -36) { e.root.position.z = -65; e.root.position.x *= .8; }
      e.root.position.y = -e.depth;
      const distance = Math.hypot(e.root.position.x, e.root.position.z);
      nearest = Math.min(nearest, distance);
      const sonar = upgrades.sonar || 0;
      e.detected = this.sonarOn && (sonar === 1 ? distance <= 100 : sonar === 2 ? distance <= 200 : sonar >= 3 && this.buoyDeployed);
      if (r.ghost) {
        r.ghost.position.set(e.root.position.x, .045, e.root.position.z); r.ghost.rotation.y = e.root.rotation.y;
        r.ghost.visible = distance < 45 || !!e.detected;
        r.ghost.material.opacity = e.detected ? .3 : .11;
      }
      r.torpedoTimer -= dt;
      if (r.torpedoTimer <= 0) {
        this._torpedoFromSub(e); r.torpedoTimer = e.spec?.attackInterval || 12;
      }
    }
    if (this.sonarOn && (upgrades.sonar || 0) >= 3 && !this.buoyDeployed && !this.patrol && nearest < Infinity) this._launchPatrol();
    if (this.sonarOn && (upgrades.sonar || 0) >= 2 && nearest <= ((upgrades.sonar || 0) >= 3 ? Infinity : 200)) {
      this.pingCooldown -= dt;
      if (this.pingCooldown <= 0) {
        this.audio?.sonarPing?.();
        this.pingCooldown = clamp(.32 + nearest / 200 * 2.3, .38, 3.2);
      }
    }
    for (let i = this.torpedoes.length - 1; i >= 0; i--) {
      const t = this.torpedoes[i], before = t.mesh.position.clone();
      t.mesh.position.addScaledVector(t.velocity, dt); t.life -= dt; t.wake -= dt;
      if (t.wake <= 0) { this._segment(before, before.clone().addScaledVector(t.velocity, -.4), this.wakeMat, 1); t.wake = .16; }
      if (Math.abs(t.mesh.position.x) < 13 && Math.abs(t.mesh.position.z) < 17) {
        this.onDamage(t.damage); this.onEffect(t.mesh.position.clone(), 'splash', 1.1); t.life = 0;
      }
      if (t.life <= 0 || t.mesh.position.z > 70) { this.group.remove(t.mesh); this.torpedoes.splice(i, 1); }
    }
  }

  _findSub(id) {
    const e = this.shipRecords.get(id)?.enemy;
    return e && e.submarine && !e.dead && !e.removed ? e : null;
  }
  _nearestDetected(point) {
    let target = null, best = Infinity;
    for (const c of this.contacts) {
      if (!c.detected) continue;
      const d = c.position.distanceTo(point);
      if (d < best) { best = d; target = this._findSub(c.id); }
    }
    return target;
  }
  fireASW() {
    const level = this.getUpgrades().asw || 0;
    if (!level) return { ok: false, reason: '対潜兵装未配備' };
    if (this.aswCooldown > 0) return { ok: false, reason: `対潜兵装 装填中 ${this.aswCooldown.toFixed(1)}秒` };
    const aim = this.getAim() || {}, point = aim.targetPoint?.clone?.() || new THREE.Vector3(0, -7, -80);
    if (![point.x, point.y, point.z].every(Number.isFinite)) return { ok: false, reason: '投下位置を指定してください' };
    const start = new THREE.Vector3(0, level === 1 || level >= 4 ? 4 : -6, -12);
    const target = this._nearestDetected(point);
    if (level >= 3 && !target) return { ok: false, reason: 'ソナーで潜水艦を探知してください' };
    if (level === 1 && Math.hypot(point.x, point.z) > 120) return { ok: false, reason: '爆雷の投下範囲は1200m以内' };
    if (!this.consume('asw', 1)) return { ok: false, reason: '対潜弾薬がありません' };
    if (target && level >= 2) point.copy(target.root.position);
    // An aimed empty-water point still has a chosen detonation depth. Sonar
    // contacts provide their actual depth, rewarding preparation and placement.
    const depth = point.y < -.5 ? clamp(-point.y, 1.5, 25) : 7;
    point.y = -depth;
    const mesh = this._mesh(level === 1 ? this.chargeGeo : this.torpedoGeo, this.darkMat, start);
    const shot = { kind: 'asw', level, mesh, time: 0, stage: level === 1 ? 'lob' : level >= 4 ? 'rocket' : 'swim',
      target: point, start, targetId: target?.id, depth, velocity: new THREE.Vector3(), life: 22, wake: 0 };
    if (shot.stage === 'swim') {
      mesh.position.y = -depth;
      shot.velocity.copy(point).sub(mesh.position).normalize().multiplyScalar(level === 2 ? 40 : 45);
    }
    this.projectiles.push(shot); this.aswCooldown = level >= 4 ? 5 : level === 1 ? 6 : 7;
    return { ok: true, reason: ['','爆雷投下・深度と位置で威力変化','対潜魚雷 発射','追尾魚雷 発射','アスロック 発射'][Math.min(level, 4)] };
  }
  _damageSub(e, amount) {
    if (!e || e.dead || amount <= .08) return;
    e.hp -= amount;
    this.onEffect(e.root.position.clone(), 'blast', .65);
    if (e.hp <= 0) this.onSubKill(e);
    else if (e.marker?.querySelector) {
      const bar = e.marker.querySelector('i'); if (bar) bar.style.width = `${Math.max(0, e.hp / e.maxHP) * 100}%`;
    }
  }
  _depthExplosion(position) {
    const surface = position.clone(); surface.y = .1; this.onEffect(surface, 'splash', 1.5);
    this.audio?.impact?.(clamp(position.x / 100, -1, 1), false);
    for (const { enemy: e } of this.shipRecords.values()) {
      if (!e.submarine || e.dead) continue;
      const horizontal = Math.hypot(position.x - e.root.position.x, position.z - e.root.position.z);
      const vertical = Math.abs(position.y - e.root.position.y);
      const damage = 10 * Math.max(0, 1 - horizontal / 16) * Math.max(0, 1 - vertical / 10);
      this._damageSub(e, damage);
    }
  }
  _tickProjectiles(dt) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i]; p.time += dt;
      if (p.kind === 'buoy') {
        if (p.mesh.position.y > .3) {
          p.velocity.y -= 9 * dt; p.mesh.position.addScaledVector(p.velocity, dt);
          if (p.mesh.position.y <= .3) { p.mesh.position.y = .3; this.onEffect(p.mesh.position.clone(), 'splash', .4); }
        } else p.mesh.position.y = .3 + Math.sin(this.time * 1.8) * .12;
        continue;
      }
      p.life -= dt; const before = p.mesh.position.clone();
      if (p.stage === 'lob') {
        const t = clamp(p.time / 1.3, 0, 1);
        const sea = p.target.clone(); sea.y = .1;
        p.mesh.position.copy(p.start).lerp(sea, t); p.mesh.position.y += Math.sin(t * Math.PI) * 14;
        if (t >= 1) { p.stage = 'sink'; p.time = 0; this.onEffect(sea, 'splash', .5); }
      } else if (p.stage === 'sink') {
        p.mesh.position.y = -.1 - p.depth * clamp(p.time / 2.4, 0, 1);
        if (p.time >= 2.4) { this._depthExplosion(p.mesh.position); p.life = 0; }
      } else if (p.stage === 'rocket') {
        const target = this._findSub(p.targetId);
        if (target) p.target.copy(target.root.position);
        const t = clamp(p.time / 1.8, 0, 1);
        const sea = p.target.clone(); sea.y = .15;
        p.mesh.position.copy(p.start).lerp(sea, t); p.mesh.position.y += Math.sin(t * Math.PI) * 30;
        this._segment(before, p.mesh.position, this.tracerMat, .3);
        if (t >= 1) {
          this.onEffect(sea, 'splash', .65); p.stage = 'swim'; p.time = 0;
          p.mesh.position.y = -p.depth;
          p.velocity.copy(p.target).sub(p.mesh.position).normalize().multiplyScalar(55);
        }
      } else if (p.stage === 'swim') {
        const target = this._findSub(p.targetId);
        if (p.level >= 3 && target) {
          const desired = target.root.position.clone().sub(p.mesh.position).normalize().multiplyScalar(p.level >= 4 ? 55 : 45);
          p.velocity.lerp(desired, Math.min(1, dt * 5));
        }
        p.mesh.position.addScaledVector(p.velocity, dt);
        if (p.velocity.lengthSq() > .01) p.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), p.velocity.clone().normalize());
        p.wake -= dt;
        if (p.wake <= 0) {
          const a = before.clone(); a.y = .08;
          const b = a.clone().addScaledVector(p.velocity, -.15); b.y = .08;
          this._segment(a, b, this.wakeMat, .6); p.wake = .18;
        }
        const segment = new THREE.Line3(before, p.mesh.position);
        for (const { enemy: e } of this.shipRecords.values()) {
          if (!e.submarine || e.dead) continue;
          const nearest = segment.closestPointToPoint(e.root.position, true, new THREE.Vector3());
          if (nearest.distanceTo(e.root.position) < 3.8) {
            this._damageSub(e, p.level >= 4 ? 40 : p.level >= 3 ? 25 : 18);
            const impact = e.root.position.clone(); impact.y = .1; this.onEffect(impact, 'splash', 1.3);
            this.audio?.impact?.(clamp(impact.x / 100, -1, 1), false); p.life = 0; break;
          }
        }
      }
      if (p.life <= 0 || p.mesh.position.length() > 1600) { this.group.remove(p.mesh); this.projectiles.splice(i, 1); }
    }
  }
  tick(dt, enemies = []) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    dt = Math.min(dt, .1); this.time += dt;
    this.aswCooldown = Math.max(0, this.aswCooldown - dt);
    for (const e of enemies) if (!e.dead && !e.removed) this.registerShip(e);
    const upgrades = this.getUpgrades();
    this._tickShips(dt, upgrades); this._tickPatrol(dt); this._tickAircraft(dt, upgrades);
    this._tickProjectiles(dt); this._updateInstances();
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      this.tracers[i].life -= dt;
      if (this.tracers[i].life <= 0) { this.group.remove(this.tracers[i].mesh); this.tracers.splice(i, 1); }
    }
  }
}

/** Visible permanent AA / radar / sonar / ASW fittings for the player's deck.
 * The caller owns this Group and disposes its unique geometries/materials when
 * rebuilding the loadout. It is independent of NavalThreats.reset().
 */
export function createAuxiliaryMounts(upgrades = {}) {
  const u = typeof upgrades === 'function' ? upgrades() : upgrades;
  const root = new THREE.Group(); root.name = 'auxiliary-armament';
  const steel = new THREE.MeshStandardMaterial({ color: 0x616d71, metalness: .7, roughness: .45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x252f35, metalness: .5, roughness: .63 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xa4965b, metalness: .7, roughness: .4 });
  const add = (geometry, material, parent, x, y, z) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  };
  const box = (parent, w, h, d, x, y, z, material = steel) => add(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
  const tube = (parent, radius, length, x, y, z, material = dark) => {
    const mesh = add(new THREE.CylinderGeometry(radius, radius, length, 8), material, parent, x, y, z);
    mesh.rotation.x = -.72; return mesh;
  };
  if (u.aa >= 1) for (const x of [-8, 8]) {
    const mount = new THREE.Group(); mount.position.set(x, 2.1, -4.5); root.add(mount);
    add(new THREE.CylinderGeometry(1.2, 1.45, .6, 12), dark, mount, 0, .3, 0);
    box(mount, 2.2, 1.3, 1.8, 0, 1.1, 0);
    for (const dx of [-.43, .43]) tube(mount, .16, 3.4, dx, 2.1, -1.2);
    box(mount, 2.35, .18, 1.9, 0, 1.9, 0, dark);
  }
  if (u.aa >= 2) for (const x of [-8.8, 8.8]) {
    const mount = new THREE.Group(); mount.position.set(x, 2.1, 5); root.add(mount);
    box(mount, 1.9, .6, 1.6, 0, .3, 0, dark);
    box(mount, 1.6, 1.0, 1.0, 0, 1, 0);
    for (const dx of [-.5, 0, .5]) tube(mount, .075, 2.2, dx, 1.75, -.7);
    if (u.aa >= 3) box(mount, 1.7, .23, .65, 0, .9, .75, bronze);
  }
  if (u.radar >= 1) {
    box(root, .34, 5.5, .34, 7.4, 5, 11);
    const dish = add(new THREE.CylinderGeometry(1.7, 1.7, .15, 12, 1, true), dark, root, 7.4, 8, 11);
    dish.rotation.x = Math.PI / 2; dish.rotation.z = .22;
    box(root, 3.2, .1, .14, 7.4, 8, 10.9, steel);
    box(root, .1, 2.0, .14, 7.4, 8, 10.9, steel);
    if (u.radar >= 2) box(root, 2.4, .35, .35, 7.4, 9.3, 11, bronze);
  }
  if (u.sonar >= 1) {
    box(root, 1.6, .65, 2.0, -8, 2.4, 10, dark);
    if (u.sonar >= 3) for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(.28, .28, 1.6, 8), bronze, root, -8 + i * .55, 3.4, 10);
  }
  if (u.asw >= 1) {
    const bank = new THREE.Group(); bank.position.set(-7.5, 2.1, -9); root.add(bank);
    box(bank, 2.4, .5, 3.0, 0, .3, 0, dark);
    for (const x of [-.7, .7]) {
      const barrel = add(new THREE.CylinderGeometry(.38, .45, u.asw >= 4 ? 3.4 : 2.3, 8), steel, bank, x, 1.0, -.8);
      barrel.rotation.x = u.asw >= 4 ? -.5 : Math.PI / 2;
    }
    if (u.asw >= 4) box(bank, 2.3, .3, 1.2, 0, .9, .9, bronze);
  }
  // Avoid keeping unused material resources when this is an empty base loadout.
  const used = new Set(); root.traverse(n => { if (n.material) used.add(n.material); });
  for (const m of [steel, dark, bronze]) if (!used.has(m)) m.dispose();
  return root;
}
