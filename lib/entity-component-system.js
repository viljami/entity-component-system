import present from 'present';

const getZero = () => 0;

class EntityComponentSystem {
  constructor() {
    this.systems = [];
    this.systemNames = [];
    this.systemTimes = [];
    this.runCount = 0;
  }

  add(code) {
    this.systems.push(code);
    this.systemNames.push(code.name);
    this.systemTimes.push(0);
  }

  addEach(code, search) {
    this.systems.push((entities, elapsed) => {
      const keys = entities.find(search);
      for (let i = 0; i < keys.length; i++) {
        code(keys[i], elapsed);
      }
    });
    this.systemNames.push(code.name);
    this.systemTimes.push(0);
  }

  run(entities, elapsed) {
    for (let i = 0; i < this.systems.length; i++) {
      const start = present();
      this.systems[i](entities, elapsed);
      this.systemTimes[i] += present() - start;
    }

    this.runCount++;
  }

  runs() {
    return this.runCount;
  }

  timings() {
    return this.systemNames.map((name, i) => ({
      name: name,
      time: this.systemTimes[i]
    }));
  }

  resetTimings() {
    this.systemTimes = this.systemTimes.map(getZero);
  }
}

export default EntityComponentSystem;
