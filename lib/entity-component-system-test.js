import test from 'tape';
import ECS from './entity-component-system';
import Pool from './entity-pool';
import present from 'present';

test('run with system and entities calls system with entities', function(t) {
  t.plan(1);

  const entities = [{}];
  const ecs = new ECS();
  const done = function(arg) {
    t.deepEqual(arg, entities);
  };
  ecs.add(done);
  ecs.run(entities);
});

test('run with each system and array of entities calls system with each entity', function(t) {
  t.plan(2);

  const entities = new Pool();
  const id = entities.create();
  entities.setComponent(id, 'name', 'jimmy');

  const ecs = new ECS();
  const done = function(arg, arg2) {
    t.deepEqual(arg, id);
    t.deepEqual(arg2, 'arg2');
  };
  ecs.addEach(done, 'name');
  ecs.run(entities, 'arg2');
});

test('runs returns number of runs', function(t) {
  t.plan(1);

  const ecs = new ECS();
  ecs.run();
  t.equal(ecs.runs(), 1);
});

function waitForTimeToChange() {
  const start = present();
  while (present() === start) {} // eslint-disable-line no-empty
}

test('timings returns timing information for each system', function(t) {
  t.plan(2);

  const ecs = new ECS();
  ecs.add(waitForTimeToChange);
  ecs.run();
  const timings = ecs.timings();
  t.equal(timings[0].name, 'waitForTimeToChange');
  t.ok(timings[0].time > 0, 'should be greater than 0');
});

test('resetTimings resets timing information to zero', function(t) {
  t.plan(1);

  const ecs = new ECS();
  ecs.add(waitForTimeToChange);
  ecs.run();
  ecs.resetTimings();
  const timings = ecs.timings();
  t.equal(timings[0].time, 0);
});
