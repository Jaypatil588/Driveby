import RAPIER from '@dimforge/rapier3d-compat';

export class PhysicsWorld {
  constructor() {
    this.world = null;
    this.bodies = new Map(); // handle → rigidBody
    this._ready = false;
  }

  async init() {
    await RAPIER.init();
    // gravity zero — cars are on a flat plane, Y is locked per body
    this.world = new RAPIER.World({ x: 0.0, y: 0.0, z: 0.0 });
    this._ready = true;
  }

  get ready() { return this._ready; }

  step(delta) {
    if (!this._ready) return;
    this.world.timestep = delta;
    this.world.step();
  }

  // Static box collider (buildings, boundary walls)
  addBoxCollider(x, y, z, halfW, halfH, halfD) {
    const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfW, halfH, halfD);
    this.world.createCollider(colliderDesc, body);
    const handle = body.handle;
    this.bodies.set(handle, body);
    return handle;
  }

  // Dynamic box body sized for a car (~4m × 2m × 1.5m in mercator units)
  addCarCollider(x, y, z, halfW, halfH, halfD) {
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y, z)
      .lockTranslations() // we control position manually; collisions handled via events
      .setLinearDamping(4.0)
      .setAngularDamping(10.0);
    const body = this.world.createRigidBody(bodyDesc);
    // unlock X/Y (mercator plane), keep Z locked
    body.lockTranslations(false);
    body.setEnabledTranslations(true, true, false, true);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfW, halfH, halfD)
      .setRestitution(0.3)
      .setFriction(0.8);
    this.world.createCollider(colliderDesc, body);
    const handle = body.handle;
    this.bodies.set(handle, body);
    return handle;
  }

  getBody(handle) {
    return this.bodies.get(handle) ?? null;
  }

  getPosition(handle) {
    const body = this.bodies.get(handle);
    if (!body) return null;
    return body.translation();
  }

  applyForce(handle, fx, fy, fz) {
    const body = this.bodies.get(handle);
    if (!body) return;
    body.applyImpulse({ x: fx, y: fy, z: fz }, true);
  }

  removeBody(handle) {
    const body = this.bodies.get(handle);
    if (!body) return;
    this.world.removeRigidBody(body);
    this.bodies.delete(handle);
  }
}
