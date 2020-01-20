import ObjectPool from './object-pool';

class Entity {
  constructor(id) {
    this.id = id;
  }
}

class EntityPool {
  constructor() {
    this.entities = {};
    this.nextId = 0;
    this.entityPool = new ObjectPool(() => new Entity(this.nextId++));
    this.componentPools = {};
    this.resetFunctions = {};
    this.searchToComponents = {};
    this.componentToSearches = {};
    this.searchResults = {};
    this.callbacks = {};
  }

  create() {
    const entity = this.entityPool.alloc();
    this.entities[entity.id] = entity;
    return entity.id;
  }

  destroy(id) {
    const entity = this.entities[id];

    Object.keys(entity).forEach((component) => {
      if (component === 'id') {
        return;
      }

      this.removeComponent(id, component);
    });

    delete this.entities[id];
    this.entityPool.free(entity);
  }

  registerComponent(component, factory, reset, size) {
    this.componentPools[component] = new ObjectPool(factory, size);
    this.resetFunctions[component] = reset;
  }

  // private
  resetComponent(id, component) {
    const reset = this.resetFunctions[component];
    if (typeof reset === 'function') {
      reset(this.entities[id][component]);
    }
  }

  getComponent(id, component) {
    return this.entities[id][component];
  }

  removeComponent(id, component) {
    const oldValue = this.entities[id][component];

    if (oldValue === undefined) {
      return;
    }

    for (let i = 0; i < this.componentToSearches[component].length; i++) {
      let search = this.componentToSearches[component][i];
      removeFromArray(this.searchResults[search], id);
    }

    this.fireCallback('remove', id, component, oldValue);

    if (!isPrimitive(oldValue)) {
      this.resetComponent(id, component);
      this.componentPools[component].free(oldValue);
    }

    delete this.entities[id][component];
  }

  addComponent(id, component) {
    if (!this.componentPools[component]) {
      throw new Error(
        `You can't call addComponent id "${component}"
        for a component name that hasn't been registered with
        registerComponent factory[, reset][, size]).`
      );
    }

    const predefinedValue = this.entities[id][component];
    if (predefinedValue && !isPrimitive(predefinedValue)) {
      this.resetComponent(id, component);
      return predefinedValue;
    }

    const value = this.componentPools[component].alloc();
    this.setComponentValue(id, component, value);

    return value;
  }

  setComponent(id, component, value) {
    if (!isPrimitive(value)) {
      throw new TypeError(
        `You can't call setComponent id "${component}", ${JSON.stringify(value)}) with
        a value that isn't of a primitive type (i.e. null, undefined, boolean,
        number, string, or symbol). For objects or arrays, use
        addComponent component) and modify
        the result it returns.`
      );
    }

    if (!isPrimitive(this.entities[id][component])) {
      throw new Error(
        `You can't set a non-primitive type component "${component}" to a primitive value.
        If you must do this, remove the existing component first with
        removeComponent component).`
      );
    }

    if (typeof value === 'undefined') {
      this.removeComponent(id, component);
    } else {
      this.setComponentValue(id, component, value);
    }
  }

  // private
  setComponentValue(id, component, value) {
    const existingValue = this.entities[id][component];
    if (typeof existingValue !== 'undefined' && existingValue === value) {
      return;
    }

    this.entities[id][component] = value;
    if (typeof existingValue === 'undefined') {
      if (this.searchToComponents[component] === undefined) {
        this.mapSearch(component, [component]);
      }

      for (let i = 0; i < this.componentToSearches[component].length; i++) {
        const search = this.componentToSearches[component][i];
        if (objectHasProperties(this.searchToComponents[search], this.entities[id])) {
          this.searchResults[search].push(id);
        }
      }

      this.fireCallback('add', id, component, value);
    }
  }
  // private
  addCallback(type, component, callback) {
    this.callbacks[type] = this.callbacks[type] || {};
    this.callbacks[type][component] = this.callbacks[type][component] || [];
    this.callbacks[type][component].push(callback);
  }

  // private
  fireCallback(type, id, component) {
    if (this.callbackQueue) {
      this.callbackQueue.push(Array.prototype.slice.call(arguments, 0));
      return;
    }

    const cbs = this.callbacks[type] || {};
    const ccbs = cbs[component] || [];
    const args = Array.prototype.slice.call(arguments, 3);
    for (let i = 0; i < ccbs.length; i++) {
      ccbs[i].apply(this, [id, component].concat(args));
    }
  }

  // private
  fireQueuedCallbacks() {
    const queue = this.callbackQueue;

    if (!queue) {
      return;
    }

    delete this.callbackQueue;

    for (let i = 0; i < queue.length; i++) {
      this.fireCallback.apply(this, queue[i]);
    }
  }

  onAddComponent(component, callback) {
    this.addCallback('add', component, callback);
  }

  onRemoveComponent(component, callback) {
    this.addCallback('remove', component, callback);
  }

  find(search) {
    return this.searchResults[search] || [];
  }

  // private
  mapSearch(search, components) {
    if (this.searchToComponents[search] !== undefined) {
      throw `The search "${search}" was already registered`;
    }

    this.searchToComponents[search] = components.slice(0);

    for (let i = 0; i < components.length; i++) {
      const c = components[i];

      if (this.componentToSearches[c] === undefined) {
        this.componentToSearches[c] = [search];
      } else {
        this.componentToSearches[c].push(search);
      }
    }

    this.searchResults[search] = [];
  }

  registerSearch(search, components) {
    this.mapSearch(search, components);
    this.searchResults[search] = objectValues(this.entities)
      .filter(objectHasProperties.bind(undefined, components))
      .map(getId);
  }

  load(entities) {
    this.callbackQueue = [];

    entities.forEach((entity) => {
      const id = entity.id;
      const allocatedEntity = this.entityPool.alloc();
      allocatedEntity.id = id;
      this.entities[id] = allocatedEntity;

      if (this.nextId <= id) {
        this.nextId = id + 1;
      }

      Object.keys(entity).forEach((component) => {
        if (component === 'id') {
          return;
        }
        const valueToLoad = entity[component];
        if (isPrimitive(valueToLoad)) {
          this.setComponent(id, component, valueToLoad);
          return;
        }
        const newComponentObject = this.addComponent(id, component);
        Object.keys(valueToLoad).forEach((key) => {
          newComponentObject[key] = valueToLoad[key];
        });
      });
    });

    this.fireQueuedCallbacks();
  }

  save() {
    return objectValues(this.entities);
  }
}

function removeFromArray(array, item) {
  const i = array.indexOf(item);
  if (i !== -1) {
    array.splice(i, 1);
  }
  return array;
}

function getId(obj) {
  return obj.id;
}

function objectHasProperties(properties, obj) {
  return properties.every(Object.prototype.hasOwnProperty.bind(obj));
}

function objectValues(obj) {
  return Object.keys(obj).map((key) => obj[key]);
}

/* returns true if the value is a primitive
 * type a.k.a. null, undefined, boolean,
 * number, string, or symbol.
 */
function isPrimitive(value) {
  return typeof value !== 'object' || value === null;
}

export default EntityPool;
