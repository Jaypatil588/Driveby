import RAPIER from "@dimforge/rapier3d-compat";

class PhysicsWorld {

  constructor() {
    this.world = null;
    this.bodies = new Map(); // body handle -> body
  }

  async init() {
    console.log("PhysicsWorld: Initializing Rapier WASM...");
    await RAPIER.init();
    
    // Create world with Earth-like gravity along the Y axis
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    console.log("PhysicsWorld: Rapier World initialized successfully.");

    // Run test scene: dynamic box falling under gravity and landing on a static plane body
    const groundHandle = this.addBoxCollider(0, -2, 0, 10, 0.1, 10, true);
    const boxHandle = this.addBoxCollider(0, 10, 0, 0.5, 0.5, 0.5, false);
    
    console.log("PhysicsWorld Test: Starting fall simulation under gravity...");
    for (let step = 0; step < 120; step++) {
      this.world.timestep = 1 / 60;
      this.world.step();
      if (step % 20 === 0 || step === 119) {
        console.log(`Step ${step}: Box Y position = ${this.getPosition(boxHandle).y.toFixed(3)}`);
      }
    }
    console.log("PhysicsWorld Test: Fall simulation completed.");

    // Clean up test bodies from the world so they don't clutter the active simulation
    const boxBody = this.bodies.get(boxHandle);
    const groundBody = this.bodies.get(groundHandle);
    if (boxBody) this.world.removeRigidBody(boxBody);
    if (groundBody) this.world.removeRigidBody(groundBody);
    this.bodies.delete(boxHandle);
    this.bodies.delete(groundHandle);
  }

  step(delta) {
    if (this.world) {
      // Step simulation using the delta time
      this.world.timestep = Math.max(0.001, Math.min(0.1, delta));
      this.world.step();
    }
  }

  addBoxCollider(x, y, z, halfW, halfH, halfD, isStatic) {
    if (!this.world) {
      console.warn("PhysicsWorld: Cannot add box collider, world not initialized.");
      return null;
    }

    const bodyDesc = isStatic 
      ? RAPIER.RigidBodyDesc.fixed() 
      : RAPIER.RigidBodyDesc.dynamic();
    
    bodyDesc.setTranslation(x, y, z);
    
    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfW, halfH, halfD);
    this.world.createCollider(colliderDesc, body);
    
    const handle = body.handle;
    this.bodies.set(handle, body);
    return handle;
  }

  addCarCollider(x, y, z) {
    if (!this.world) {
      console.warn("PhysicsWorld: Cannot add car collider, world not initialized.");
      return null;
    }

    // Car bounding box: width = 2.0, height = 1.5, length = 4.8
    // So half-extents are: halfW = 1.0, halfH = 0.75, halfD = 2.4
    const halfW = 1.0;
    const halfH = 0.75;
    const halfD = 2.4;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic();
    bodyDesc.setTranslation(x, y, z);
    
    // Lock translation along Y and lock rotation on X and Z (no tip over or flight)
    bodyDesc.setEnabledTranslations(true, false, true);
    bodyDesc.setEnabledRotations(false, true, false);

    const body = this.world.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.cuboid(halfW, halfH, halfD);
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
    if (!body) return { x: 0, y: 0, z: 0 };
    const translation = body.translation();
    return { x: translation.x, y: translation.y, z: translation.z };
  }

  applyForce(handle, fx, fy, fz) {
    const body = this.bodies.get(handle);
    if (body) {
      body.resetForces(true);
      body.addForce({ x: fx, y: fy, z: fz }, true);
    }
  }

  removeBody(handle) {
    const body = this.bodies.get(handle);
    if (body) {
      this.world.removeRigidBody(body);
      this.bodies.delete(handle);
    }
  }

}

export { PhysicsWorld };
