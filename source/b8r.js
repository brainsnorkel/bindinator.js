/**
#bindinator
Copyright ©2016-2017 Tonio Loewald

Bindinator (b8r) binds data and methods to the DOM and lets you quickly turn chunks of
markup, style, and code into reusable components so you can concentrate on your project.

b8r leverages your understanding of the DOM and the browser rather than trying to
implement some kind of virtual machine to replace it.
*/
/* jshint esnext:true, loopfunc:true, latedef:false */
/* globals console, require, module */

'use strict';

const { getByPath, pathSplit } = require('./b8r.byPath.js');

function b8r() {}

module.exports = b8r;

Object.assign(b8r, require('./b8r.dom.js'));
Object.assign(b8r, require('./b8r.perf.js'));
Object.assign(b8r, require('./b8r.iterators.js'));
const {
  on,
  off,
  enable,
  disable,
  callMethod,
  trigger,
  implicit_event_types,
  handle_event,
} = require('./b8r.events.js');
Object.assign(b8r, { on, off, enable, disable, callMethod, trigger });
const {
  addDataBinding,
  removeDataBinding,
  getDataPath,
  getListInstancePath,
  getComponentDataPath,
  findLists,
  findBindables,
  getBindings,
  replaceInBindings
} = require('./b8r.bindings.js');
Object.assign(b8r, {addDataBinding, removeDataBinding, getDataPath, getListInstancePath});
const { saveDataForElement, dataForElement } =
  require('./b8r.dataForElement.js');
const {onAny, offAny, anyListeners} =
    require('./b8r.anyEvent.js');
Object.assign(b8r, { onAny, offAny, anyListeners });
Object.assign(b8r, require('./b8r.registry.js'));
b8r.observe(
    () => true,
            (path, source_element) => b8r.touchByPath(path, source_element));
const { keystroke, modifierKeys } = require('./b8r.keystroke.js');
b8r.keystroke = keystroke;
b8r.modifierKeys = modifierKeys;

/**
    b8r.register(name, obj);

registers an object by name as data or controller. The names `_component_`,
`_data_` and `_b8r_` are reserved; other similar names may be reserved later.

`_b8r_` is the name of the collection of internal event handlers for bound variables.

    b8r.deregister(name); // removes a registered object
    b8r.deregister(); // just cleans up obsolete component data

Remove a registered (named) object. deregister also removes component instance objects
for components no longer in the DOM.

    b8r.setByPath('model', 'data.path, value);
    b8r.setByPath('model.data.path', value);

Set a registered object's property by path; bound elements will be updated automatically.

    b8r.getByPath('model', 'data.path');
    b8r.getByPath('model.data.path');

Get a registered object's property by path.

    b8r.pushByPath('model', 'data.path', item, callback);
    b8r.pushByPath('model.data.path', item, callback);

As above, but unshift (and no callback).

    b8r.unshiftByPath('model', 'data.path', item);
    b8r.unshiftByPath('model.data.path', item);

Insert an item into the specified array property. (Automatically updates bound
lists).


> ### Note
>
> Having gained experience with the framework, I am doubling down
> on object paths and simplifying the API in favor of:
> <pre>
> b8r.get('path.to.value');
> b8r.set('path.to.value', new_value);
> </pre>
> The older APIs (setByPath, etc.) will ultimately be deprecated. Even now they
> are little more than wrappers for set/get. See the *Registry* docs.

Also note that the new registry APIs provide an explicit *observable*.

    b8r.removeListInstance(element);

Removes a data-list-instance's corresponding list member and any other bound
data-list-instances.
*/

b8r._component_instances = () =>
  b8r.models().filter(key => key.indexOf(/^c#/) !== -1);

/**
    b8r.debounce(method, min_interval_ms) => debounced method
    b8r.throttle(method, min_interval_ms) => throttled method

Two utility functios for preventing a method from being called too frequently.
Not recommended for use on methods which take arguments!

The key difference is that **debounce** is guaranteed to actually call the
original method after the debounced wrapper stops being called for the
minimum interval.

Meanwhile **throttle** will refuse to call the original method again
if it was previously called within the specified interval.
*/

b8r.debounce = (orig_fn, min_interval) => {
  let debounce_id;
  return (...args) => {
    if (debounce_id) {
      clearTimeout(debounce_id);
    }
    debounce_id = setTimeout(() => orig_fn(...args), min_interval);
  };
};

b8r.throttle = (orig_fn, min_interval) => {
  let last_call = Date.now() - min_interval;
  return (...args) => {
    const now = Date.now();
    if (now - last_call > min_interval) {
      last_call = now;
      orig_fn(args);
    }
  };
};

b8r.cleanupComponentInstances = b8r.debounce(() => {
  // garbage collect models
  b8r.forEachKey(_component_instances, (element, component_id) => {
    if (!b8r.isInBody(element) || element.dataset.componentId !== component_id) {
      delete _component_instances[component_id];
    }
  });
  b8r.models().forEach((model) => {
    if (model.substr(0, 2) === 'c#' && !_component_instances[model]) {
      b8r.remove(model);
    }
  });
}, 100);

b8r.deregister = name => b8r.remove(name);

/**
> ### Experiment: Async Updates
>
> With the goal of keeping all updates smooth and seamless, the idea here is to
> make automatically generated DOM updates asynchronous (via requestAnimationFrame)
> This has the advantage of deduplicating updates (i.e. not updating a given element)
> more than once owing to underlying data changes) and also allowing updates to be
> broken up into time-budgeted chunks (e.g. 1/30 or 1/60 of a second)
>
> Initial experiments seem to cause no breakage *except* for unit tests, but simply
> updating the unit tests and then turning them on by default seems a bit risky, so
> instead for the time being we get the following usage:
>
> <pre>
> b8r.force_update(); // flushes all queued updates immediately
> b8r.after_update(callback); // fires callback after async updates are complete
> </pre>
>
> So, if you had code that looked like this:
>
> <pre>
> b8r.register('foo', {bar: 17});
> console.log(b8r.findOne('[data-bind="text=foo.bar"]').value); // logs 17
> </pre>
>
> You would now have to write this:
>
> <pre>
> b8r.register('foo', {bar: 17});
> b8r.force_update(); // or wrap next line in after_update(() => {...})
> console.log(b8r.findOne('[data-bind="text=foo.bar"]').value);
> </pre>
>
> Note that async_updates is a **global** setting, so you could easily break other
> stuff by doing this. The end goal is to use async_updates everywhere.
*/

const _update_list = []; // {path, element}
const _after_update_callbacks = [];
let _update_frame = null;

b8r.force_update = () => {
  cancelAnimationFrame(_update_frame);
  _update_frame = null;

  b8r.logStart('async_update', 'update');

  const binds = b8r.find('[data-bind]').map(elt => { return {elt, data_binding: elt.dataset.bind}; });
  const lists = b8r.find('[data-list]').map(elt => { return {elt, list_binding: elt.dataset.list}; });

  while(_update_list.length) {
    const {path, source} = _update_list.shift();
    try {
      binds.
      filter(bound => bound.elt !== source && bound.data_binding.indexOf(path) > -1).
      forEach(({elt}) => bind(elt));

      lists.
      filter(bound => bound.elt !== source && bound.list_binding.indexOf(path) > -1).
      forEach(({elt}) => bindList(elt));
    } catch (e) {
      console.error('update error', e, path, source);
    }
  }

  b8r.logStart('async_update', '_after_update_callbacks');
  while(_after_update_callbacks.length) {
    let fn;
    try {
      fn = _after_update_callbacks.shift();
      fn();
    } catch(e) {
      console.error('_after_update_callback error', e, fn);
    }
  }
  b8r.logEnd('async_update', '_after_update_callbacks');

  b8r.logEnd('async_update', 'update');
};

const _change_list = [];

const _trigger_changes = () => {
  b8r.logStart('async_update', 'changes');
  while (_change_list.length) {
    b8r.trigger('change', _change_list.shift());
  }
  b8r.logEnd('async_update', 'changes');
};

const _trigger_change = element => {
  if (element instanceof HTMLElement) {
    if (!_change_list.length) {
      requestAnimationFrame(_trigger_changes);
    }
    if (_change_list.indexOf(element) === -1) {
      _change_list.push(element);
    }
  }
};

const async_update = (path, source) => {
  b8r.logStart('async_update', 'queue');
  const item = _update_list.find(item => item.path === path);
  if (item) {
    // if the path was already marked for update, then the new source element is (now) correct
    item.source = source;
  } else {
    if (!_update_frame) {
      _update_frame = requestAnimationFrame(b8r.force_update);
    }
    _update_list.push({ path, source });
  }
  b8r.logEnd('async_update', 'queue');
};

b8r.after_update = callback => {
  if (_update_list.length) {
    if (_after_update_callbacks.indexOf(callback) === -1) {
      _after_update_callbacks.push(callback);
    }
  } else {
    callback();
  }
};

b8r.touchByPath = (...args) => {
  let full_path, source_element, name, path;

  if (args[1] instanceof HTMLElement) {
    [full_path, source_element] = args;
  } else {
    [name, path, source_element] = args;
    full_path = !path || path === '/' ? name : name + (path[0] !== '[' ? '.' : '') + path;
  }

  b8r.logStart('touchByPath', full_path);

  async_update(full_path, source_element);

  b8r.logEnd('touchByPath', full_path);
};

b8r.setByPath = function(...args) {
  let name, path, value, source_element;
  if (args.length === 2 && typeof args[1] === 'object' && !Array.isArray(args[1])) {
    [name, value] = args;
    b8r.forEachKey(value, (val, path) => b8r.setByPath(name, path, val));
    return;
  } else if (args.length === 2 || args[2] instanceof Element) {
    [path, value, source_element] = args;
    path = b8r.resolvePath(path, source_element);
    [name, path] = pathSplit(path);
  } else {
    [name, path, value, source_element] = args;
  }
  if (b8r.registered(name)) {
    // const model = b8r.get(name);
    if (typeof path === 'object') {
      // Object.assign(model, path);
      // b8r.touchByPath(name, '/', source_element);
      b8r.set(name, path, source_element);
    } else {
      // setByPath(model, path, value);
      // b8r.touchByPath(name, path, source_element);
      b8r.set(
        path[0] === '[' || !path ?
        `${name}${path}` :
        `${name}.${path}`, value, source_element
      );
    }
  } else {
    console.error(`setByPath failed; ${name} is not a registered model`);
  }
};

b8r.pushByPath = function(...args) {
  let name, path, value, callback;
  if (args.length === 2 || typeof args[2] === 'function') {
    [path, value, callback] = args;
    [name, path] = pathSplit(path);
  } else {
    [name, path, value, callback] = args;
  }
  if (b8r.registered(name)) {
    const list = b8r.get(path ? `${name}.${path}` : name);
    list.push(value);
    if (callback) {
      callback(list);
    }
    b8r.touchByPath(name, path);
  } else {
    console.error(`pushByPath failed; ${name} is not a registered model`);
  }
};

b8r.unshiftByPath = function(...args) {
  let name, path, value;
  if (args.length === 2) {
    [path, value] = args;
    [name, path] = pathSplit(path);
  } else {
    [name, path, value] = args;
  }
  if (b8r.registered(name)) {
    const list = getByPath(b8r.get(name), path);
    list.unshift(value);
    b8r.touchByPath(name, path);
  } else {
    console.error(`unshiftByPath failed; ${name} is not a registered model`);
  }
};

b8r.removeListInstance = function(elt) {
  elt = elt.closest('[data-list-instance]');
  if (elt) {
    const ref = elt.dataset.listInstance;
    try {
      const [, model, path, key] = ref.match(/^([^.]+)\.(.+)\[([^\]]+)\]$/);
      b8r.removeByPath(model, path, key);
    } catch (e) {
      console.error('cannot find list item for instance', ref);
    }
  } else {
    console.error('cannot remove list instance for', elt);
  }
};

function indexFromKey(list, key) {
  if (typeof key === 'number') {
    return key;
  }
  const [id_path, value] = key.split('=');
  return list.findIndex(elt => getByPath(elt, id_path) == value);
}

b8r.removeByPath = function(...args) {
  let name, path, key;
  if (args.length === 2) {
    [path, key] = args;
    [name, path] = pathSplit(path);
  } else {
    [name, path, key] = args;
  }
  if (b8r.registered(name)) {
    const list = getByPath(b8r.get(name), path);
    const index = indexFromKey(list, key);
    if (Array.isArray(list) && index > -1) {
      list.splice(index, 1);
    } else {
      delete list[key];
    }
    b8r.touchByPath(name, path);
  }
};

b8r.getByPath = function(model, path) {
  return b8r.get(path ? model + (path[0] === '[' ? path : '.' + path) : model);
};

b8r.listItems = element =>
  b8r.makeArray(element.children)
    .filter(elt => elt.matches('[data-list-instance]'));
b8r.listIndex = element =>
  b8r.listItems(element.parentElement).indexOf(element);

/**
### Finding Bound Data

To get a component's id (which you should not need to do very often)
you can call getComponentId:

    b8r.getComponentId(elt)

The component id looks like c# _component name_ # _n_ where _n_ is the
simply the creation order. It follows that component ids are guaranteed
to be unique.

To quickly obtain bound data a component from an element inside it:

    b8r.getComponentData(elt)

In effect this simply gets the component id and then finds the corresponding
registered data object (or "model").

To quickly obtain bound data a list instance from an element inside it:

    b8r.getListInstance(elt)
*/

b8r.getComponentId = getComponentDataPath;

b8r.getComponentData = elt => {
  const id = getComponentDataPath(elt);
  return id ? b8r.get(id) : null;
};

b8r.setComponentData = (elt, path, value) => {
  const id = getComponentDataPath(elt);
  b8r.setByPath(id, path, value);
};

b8r.getListInstance = function(elt) {
  const instancePath = b8r.getListInstancePath(elt);
  return instancePath ? b8r.get(instancePath, elt) : null;
};

if (document.body) {
  implicit_event_types.
  forEach(type => document.body.addEventListener(type, handle_event, true));
} else {
  document.addEventListener('DOMContentLoaded', () => {
    implicit_event_types.
    forEach(type => document.body.addEventListener(type, handle_event, true));
  });
}

/**
    b8r.implicityHandleEventsOfType(type_string)

Adds implicit event handling for a new event type. E.g. you might want
to use `data-event` bindings for the seeking `media` event, which you
could do with `b8r.implicityHandleEventsOfType('seeking')`.
*/

b8r.implicitlyHandleEventsOfType = type => {
  if (implicit_event_types.indexOf(type) === -1) {
    implicit_event_types.push(type);
    document.body.addEventListener(type, handle_event, true);
  }
};

/**
## Data Binding

Data binding is implemented via the data-bind and data-list attributes.

See the docs on binding data to and from the DOM for more detail.

The key public methods are:

    b8r.bindAll(target); // binds all elements within target; loads available components

Or:

    b8r.bindAll(target, 'path.to.data'); // as above, but uses path for dynamic bindings

Note (FIXME): bindAll only applies its path to components and lists; it doesn't do it to
individual elements, which it probably should.

Also, there's a utility method:

    b8r.interpolate('string with ${data.to.path} and ${data.with.other.path}');
    b8r.interpolate('string with ${data.to.path} and ${data.with.other.path}', element);

The second argument is required if any path used is relative (e.g. `.foo.bar`),
data-relative (e.g. `_data_.foo.bar`), or component-relative (e.g. `_component_.foo.bar`).

In essence, if you want to use string interpolation, bindinator uses the ES6-style
interpolations for data paths (javascript is not supported, just data paths). Data
paths are evaluated normally, so _data_, _component_, and relative paths should
work exactly as expected.
*/

const toTargets = require('./b8r.toTargets.js')(b8r);
const fromTargets = require('./b8r.fromTargets.js')(b8r);

b8r.onAny([ 'change', 'input' ], '_b8r_._update_', true);

const debug_paths = true;

b8r.interpolate = (template, elt) => {
  let formatted = '';
  if (template.match(/\$\{.*?\}/)) {
    formatted = template.replace(/\$\{(.*?)\}/g, (_, path) => {
      if (debug_paths && !b8r.isValidPath(path)) {
        console.error('bad path', path, 'in data-bind', elt);
      } else {
        const value = b8r.get(path, elt);
        return value !== null ? value : '';
      }
    }) ;
  } else {
    if (debug_paths && !b8r.isValidPath(template)) {
      console.error('bad path', template, 'in binding', elt);
    } else {
      formatted = b8r.get(template, elt);
    }
  }
  return formatted;
};

function bind(element) {
  if (element.closest('[data-component],[data-list]')) {
    return;
  }
  const bindings = getBindings(element);
  const logArgs = [ 'bind', b8r.elementSignature(element) ];
  b8r.logStart(...logArgs);
  const boundValues = element._b8rBoundValues || (element._b8rBoundValues = {});
  const newValues = {};
  for (let i = 0; i < bindings.length; i++) {
    const { targets, path } = bindings[i];
    const value = b8r.interpolate(path, element);
    const existing = boundValues[path];
    if (existing !== value || (value && value.constructor)) {
      const signature = b8r.elementSignature(element);
      b8r.logStart('toTargets', signature);
      newValues[path] = value;
      const _toTargets = targets.filter(t => toTargets[t.target]);
      if (_toTargets.length) {
        _toTargets.forEach(t => {
          toTargets[t.target](element, value, t.key);
        });
      } else {
        console.warn(`unrecognized toTarget in binding`, element, bindings[i]);
      }
      b8r.logEnd('toTargets', signature);
    }
  }
  Object.assign(boundValues, newValues);
  b8r.logEnd(...logArgs);
}

const { show, hide } = require('./b8r.show.js');
b8r.show = show;
b8r.hide = hide;

function removeListInstances(element) {
  while (element.previousSibling &&
         (!element.previousSibling.matches ||
          element.previousSibling.matches('[data-list-instance]'))) {
    element.parentElement.removeChild(element.previousSibling);
  }
}

b8r.listInstances = list_template => {
  const instances = [];
  let instance = list_template.previousSibling;
  while (instance && instance instanceof Element &&
         instance.matches('[data-list-instance]')) {
    instances.push(instance);
    instance = instance.previousSibling;
  }
  return instances.reverse();
};

const resolveListInstanceBindings = (instance_elt, instance_path) => {
  const elements = b8r.findWithin(instance_elt, '[data-bind]', true)
                      .filter(elt => !elt.closest('[data-list]'));
  elements.forEach(elt => {
    const binding_source = elt.dataset.bind;
    if (binding_source.indexOf('=.') > -1) {
      const path_prefix = `=${instance_path}.`;
      elt.dataset.bind = binding_source.replace(/\=\./g, path_prefix);
    }
    if (binding_source.indexOf('${.') > -1) {
      elt.dataset.bind = binding_source.
                         replace(/\$\{(\.[^\}]+)\}/g, '${' + instance_path + '$1}');
    }
  });
};

/**
  This is an optimization that eliminates the costlier parts of bindAll
  for list elements, especially in the finest-grained case (where you're
  binding a buttload of fairly simple elements).
*/
function makeListInstanceBinder (list_template) {
  if (b8r.findWithin(list_template, '[data-list],[data-component]').length) {
    return (instance, itemPath) => {
      findBindables(instance).forEach(elt => bind(elt));
      findLists(instance).forEach(elt => bindList(elt, itemPath));
      loadAvailableComponents(instance, itemPath);
    };
  } else {
    return instance => {
      findBindables(instance).forEach(elt => bind(elt));
    };
  }
}

const forEachItemIn = (obj, id_path, func) => {
  if (Array.isArray(obj)) {
    for (let i = obj.length - 1; i >= 0; i--) {
      const item = obj[i];
      func(item, id_path ? `${id_path}=${getByPath(item, id_path)}` : i);
    }
  } else if (obj.constructor === Object) {
    if (id_path) {
      throw `id-path is not supported for objects bound as lists`;
    }
    const keys = Object.keys(obj);
    for (let i = keys.length - 1; i >= 0; i--) {
      const key = keys[i];
      func(obj[key], `=${key}`);
    }
  } else if (obj !== null) {
    throw 'can only bind Array and Object instances as lists';
  }
};

function bindList(list_template, data_path) {
  if (!list_template.parentElement || list_template.closest('[data-component]')) {
    return;
  }
  const [source_path, id_path] = list_template.dataset.list.split(':');
  let method_path, list_path, arg_paths;
  try {
    // parse computed list method if any
    [, , method_path, arg_paths] =
      source_path.match(/^(([^()]*)\()?([^()]*)(\))?$/);
    arg_paths = arg_paths.split(',');
    list_path = arg_paths[0];
  } catch (e) {
    console.error('bindList failed; bad source path', source_path);
  }
  if (data_path) {
    list_path = data_path + list_path;
  }
  b8r.logStart('bindList', b8r.elementSignature(list_template));
  if (debug_paths && !b8r.isValidPath(list_path)) {
    console.error('bad path', list_path, 'in data-list', list_template);
    return;
  }
  // without this step, nested lists will not have fully-resolved paths
  list_path = b8r.resolvePath(list_path, list_template);
  let list = b8r.get(list_path);
  if (!list) {
    return;
  }
  // compute list
  if (method_path) {
    (() => {
      try {
        const args = arg_paths.map(b8r.get);
        const filtered_list = b8r.callMethod(method_path, ...args, list_template);
        // debug warning for lists that get "filtered" into new objects
        if (
          Array.isArray(list) &&
          filtered_list.length &&
          list.indexOf(filtered_list[0]) === -1
        ) {
          console.warn(
            `list filter ${method_path} returned a new object` +
            ` (not from original list); this will break updates!`
          );
        }
        list = filtered_list;
      } catch (e) {
        console.error(`bindList failed, ${method_path} threw error`, e);
      }
    })();
    if (!list) {
      throw 'could not compute list; async filtered list methods not supported (yet)';
    }
  }
  b8r.show(list_template);
  if (!id_path) {
    removeListInstances(list_template);
  }
  // efficient list update:
  // if we have an id_path we grab existing instances, and re-use those with
  // matching ids
  const existing_list_instances = id_path ? b8r.listInstances(list_template) : [];
  const path_to_instance_map = {};
  if (existing_list_instances.length) {
    existing_list_instances.
    forEach(elt => path_to_instance_map[elt.dataset.listInstance] = elt);
  }

  /* Safari refuses to hide hidden options */
  const template = list_template.cloneNode(true);
  if (template.dataset.list) {
    delete template.dataset.list;
  }
  if (list_template.tagName === 'OPTION') {
    list_template.setAttribute('disabled', '');
    list_template.textContent = '';
    template.removeAttribute('disabled');
  }

  const binder = makeListInstanceBinder(template);

  let previous_instance = list_template;
  let instance;

  const ids = {};
  forEachItemIn(list, id_path, (item, id) => {
    if (ids[id]) {
      console.warn(`${id} not unique ${id_path} in ${list_template.dataset.list}`);
      return;
    }
    ids[id] = true;
    const itemPath = `${list_path}[${id}]`;
    instance = path_to_instance_map[itemPath];
    if (instance === undefined) {
      instance = template.cloneNode(true);
      instance.dataset.listInstance = itemPath;
      resolveListInstanceBindings(instance, itemPath);
      binder(instance);
      list_template.parentElement.insertBefore(instance, previous_instance);
    } else {
      delete path_to_instance_map[itemPath];
      binder(instance);
      if (instance.nextSibling !== previous_instance) {
        list_template.parentElement.insertBefore(instance, previous_instance);
      }
    }
    previous_instance = instance;
  });
  // anything still there is no longer in the list and can be removed
  if (id_path) {
    b8r.forEachKey(path_to_instance_map, instance => instance.remove());
  }
  b8r.hide(list_template);
  _trigger_change(list_template.parentElement);
  b8r.logEnd('bindList', b8r.elementSignature(list_template));
}

b8r.bindAll = (element, data_path) => {
  const signature = b8r.elementSignature(element);
  b8r.logStart('bindAll', signature);
  loadAvailableComponents(element, data_path);
  findBindables(element).forEach(elt => bind(elt));
  findLists(element).forEach(elt => bindList(elt, data_path));
  b8r.logEnd('bindAll', signature);
  b8r.cleanupComponentInstances();
};

/**
## `_b8r_`

The _b8r_ object is registered by default as a useful set of always available
methods, especially for handling events.

You can use them the obvious way:

    <button data-event="click:_b8r_.echo">
      Click Me, I cause console spam
    </button>

    _b8r_.echo // logs events to the console
    _b8r_.stopEvent // use this to simply catch an event silently
    _b8r_._update_ // this is used by b8r to update models automatically
*/

b8r._register('_b8r_', {
  echo : evt => console.log(evt) || true,
  stopEvent : () => {},
  _update_ : evt => {
    let elements = b8r.findAbove(evt.target, '[data-bind]', null, true);
    // update elements with selected fromTarget
    if (evt.target.tagName === 'SELECT') {
      const options = b8r.findWithin(evt.target, 'option[data-bind]:not([data-list])');
      elements = elements.concat(options);
    }
    elements.filter(elt => !elt.matches('[data-list]')).forEach(elt => {
      const bindings = getBindings(elt);
      for (let i = 0; i < bindings.length; i++) {
        const { targets, path } = bindings[i];
        const bound_targets = targets.filter(t => fromTargets[t.target]);
        bound_targets.forEach(t => {
          // all bets are off on bound values!
          const value = fromTargets[t.target](elt, t.key);
          if (value !== undefined) {
            delete elt._b8rBoundValues;
            b8r.setByPath(path, value, elt);
          }
        });
      }
    });
    return true;
  },
});

const ajax = require('./b8r.ajax.js');
Object.assign(b8r, ajax);

const components = {};
const component_timeouts = {};

/**
    b8r.component(name, url);

Loads component from url registers it as "name". (Components are registered
separately from other objects.)
Returns a promise of the component once loaded.

    b8r.component('path/to/name');

If just a url parameter is provided, the name of the component will be
inferred.

**Note**: the extension .component.html is appended to url

Instances of the component will automatically be inserted as expected once
loaded.

**Also note**: you can usually avoid the pattern:

    b8r.component(...).then(c => b8r.insertComponent(c, target))

By simply binding the component to the target and letting nature take its
course.
*/

const component_promises = {};

b8r.component = function(name, url, preserve_source) {
  if (url === undefined) {
    url = name;
    name = url.split('/').pop();
  }
  if (!component_promises[name] || preserve_source) {
    component_promises[name] = new Promise(function(resolve, reject) {
      if (components[name] && !preserve_source) {
        resolve(components[name]);
      } else {
        b8r.ajax(`${url}.component.html`)
          .then(source => resolve(b8r.makeComponent(name, source, url, preserve_source)))
          .catch(err => {
            delete component_promises[name];
            console.error(err, `failed to load component ${url}`);
            reject(err);
          });
      }
    });
  }
  return component_promises[name];
};

const _path_relative_b8r = _path => {
  _path = _path.replace(/\bcomponents$/, '');
  return !_path ? b8r : Object.assign({}, b8r, {
    _path,
    component: (...args) => {
      const path_index = args[1] ? 1 : 0;
      let url = args[path_index];
      if (url.indexOf('://') === -1) {
        url = `${_path}/${url}`;
        args[path_index] = url;
      }
      return b8r.component(...args);
    }
  });
};

b8r.components = () => Object.keys(components);

const makeStylesheet = require('./b8r.makeStylesheet.js');

b8r.makeComponent = function(name, source, url, preserve_source) {
  let css = false, content, script = false, parts, remains;

  // nothing <style> css </style> rest-of-component
  parts = source.split(/<style>|<\/style>/);
  if (parts.length === 3) {
    [, css, remains] = parts;
  } else {
    remains = source;
  }

  // content <script> script </script> nothing
  parts = remains.split(/<script>|<\/script>/);
  if (parts.length === 3) {
    [content, script] = parts;
  } else {
    content = remains;
  }

  const div = b8r.create('div');
  div.innerHTML = content;
  /*jshint evil: true */
  let load = () => console.error('component', name, 'cannot load properly');
  try {
    load = script ?
             new Function(
                'require',
                'component',
                'b8r',
                'find',
                'findOne',
                'data',
                'register',
                'get',
                'set',
                'on',
                'touch',
                `${script}\n//# sourceURL=${name}(component)`
              ) :
              false;
  } catch(e) {
    console.error('error creating load method for component', name, e);
    throw `component ${name} load method could not be created`;
  }
  /*jshint evil: false */
  const style = makeStylesheet(css, name + '-component');
  const component = {
    name,
    style,
    view : div,
    load,
    path : url.split('/').slice(0,-1).join('/'),
  };
  if (preserve_source) {
    component._source = source;
  }
  if (component_timeouts[name]) {
    clearInterval(component_timeouts[name]);
  }
  if (components[name]) {
    // don't want to leak stylesheets
    if (components[name].style) {
      components[name].style.remove();
    }
    console.warn('component %s has been redefined', name);
  }
  components[name] = component;

  b8r.find(`[data-component="${name}"]`).forEach(element => {
    // somehow things can happen in between find() and here so the
    // second check is necessary to prevent race conditions
    if (!element.closest('[data-list]') && element.dataset.component === name) {
      b8r.insertComponent(component, element);
    }
  });
  return component;
};

function loadAvailableComponents(element, data_path) {
  b8r.findWithin(element || document.body, '[data-component]', true)
    .forEach(target => {
      if (!target.closest('[data-list]') &&
          !target.dataset.componentId) {
        const name = target.dataset.component;
        b8r.insertComponent(name, target, data_path);
      }
    });
}

/**
    b8r.insertComponent(component, element, data);

insert a component by name or by passing a component record (e.g. promised by
component() or produced by makeComponent)

If no element is provided, the component will be appended to document.body

Data will be passed to the component's load method and registered as the
component's private instance data. (Usually data is passed automatically
from parent components or via binding, e.g. `data-path="path.to.data` binds that
data to the component).
*/

let component_count = 0;
const _component_instances = {};
b8r.insertComponent = function(component, element, data) {
  const data_path = typeof data === 'string' ? data : b8r.getDataPath(element);
  if (!element) {
    element = b8r.create('div');
  }
  if (typeof component === 'string') {
    if (!components[component]) {
      if (!component_timeouts[component]) {
        // if this doesn't happen for five seconds, we have a problem
        component_timeouts[component] = setTimeout(
          () => console.error('component timed out: ', component), 5000);
      }
      if (data) {
        saveDataForElement(element, data);
      }
      element.dataset.component = component;
      return;
    }
    component = components[component];
  }
  b8r.logStart('insertComponent', component.name);
  if (element.dataset.component) {
    delete element.dataset.component;
  }
  if (!data || data_path) {
    data = dataForElement(element, b8r.getComponentData(element) ||
                                   b8r.getListInstance(element) || {});
  }
  if (element.parentElement === null) {
    document.body.appendChild(element);
  }
  const children = b8r.fragment();
  /*
    * if you're replacing a component, it should get the replaced component's children.
    * we probably want to be able to remove a component (i.e. pull out an instance's
      children and then delete element's contents, replace the children, and remove
      its id)
    * note that components with no DOM nodes present a problem since they may have
      passed-through child elements that aren't distinguishable from a component's
      original body
  */
  const component_id = 'c#' + component.name + '#' + (++component_count);
  if (component.view.children.length) {
    if (element.dataset.componentId) {
      if (element.querySelector('[data-children]')) {
        b8r.moveChildren(element.querySelector('[data-children]'), children);
      }
    } else {
      b8r.moveChildren(element, children);
    }
    b8r.copyChildren(component.view, element);
    replaceInBindings(element, '_component_', component_id);
    if (data_path) {
      replaceInBindings(element, '_data_', data_path);
    }
    const children_dest = b8r.findOneWithin(element, '[data-children]');
    if (children.firstChild && children_dest) {
      b8r.empty(children_dest);
      b8r.moveChildren(children, children_dest);
    }
  }
  element.dataset.componentId = component_id;
  _component_instances[component_id] = element;
  b8r.makeArray(element.classList).forEach(c => {
    if (c.substr(-10) === '-component') {
      element.classList.remove(c);
    }
  });
  element.classList.add(component.name + '-component');
  if (data_path) {
    element.dataset.path = data_path;
  }
  const register = component_data => b8r.register(component_id, component_data);
  data = Object.assign({}, data, {data_path, component_id});
  if (component.load) {
    const get = path => b8r.getByPath(component_id, path);
    const set = (...args) => b8r.setByPath(component_id, ...args);
    const on = (...args) => b8r.on(element, ...args);
    const touch = (path) => b8r.touchByPath(component_id, path);
    b8r.register(component_id, data, true);
    try {
      component.load(
        require.relative(component.path),
        element, _path_relative_b8r(component.path), selector => b8r.findWithin(element, selector),
        selector => b8r.findOneWithin(element, selector), data, register,
        get, set, on, touch, component
      );
    } catch(e) {
      debugger; // jshint ignore:line
      console.error('component', component.name, 'failed to load', e);
    }
  } else {
    b8r.register(component_id, data, true);
  }
  if (data_path) {
    resolveListInstanceBindings(element, data_path);
  }
  b8r.bindAll(element);

  // nicer reveals
  const reveal = element.closest('.b8r-hide-while-loading');
  if (reveal) {
    const unloaded = b8r.findWithin(reveal, '[data-component]').
                     filter(elt => !elt.closest('[data-list]'));
    if (unloaded.length) {
      const missing_list = [];
      unloaded.map(elt => {
        const missing = elt.dataset.component;
        if (missing_list.indexOf(missing) === -1) {
          missing_list.push(missing);
        }
      });
      reveal.classList.remove('b8r-loaded');
    } else {
      reveal.classList.add('b8r-loaded');
    }
  }

  b8r.logEnd('insertComponent', component.name);
};

/**
    b8r.wrapWithComponent(component, element [, data_path [, attributes]]);

Sometimes you want a component outside an element rather than inside it.
The most common example is trying to create a specific modal or floater wrapped
inside a generic modal or floater "wrapper". You could simply use the
generic component inside the specific component but then the generic component
has no simple way to "clean itself up".

    <div
      class="my-custom-dialog"
      data-component="modal"
    >
      <button
        data-event="click:_component_.terrific"
      >Terrific</button>
    </div>
    <script>
      set('terrific', () => alert('This is terrific!'));
    </script>

In the above example the modal ends up inside the `my-custom-dialog` div. Supposing
that the modal's behavior includes removing itself on close, it will leave behind the
component itself (with nothing inside).

Instead with `wrapWithComponent` you could do this (in a component):

    <button>Terrific</button>
    <script>
      b8r.component('components/modal');
      b8r.wrapWithComponent('modal', component);
      set('terrific', () => alert('This is terrific!'));
    </script>

(Note that this example doesn't play well with the inline-documentation system!)
*/

b8r.wrapWithComponent = (component, element, data, attributes) => {
  const wrapper = b8r.create('div');
  if (attributes) {
    b8r.forEachKey(attributes, (val, prop) => wrapper.setAttribute(prop, val));
  }
  wrapper.classList.add('b8r-hide-while-loading');
  b8r.wrap(element, wrapper);
  b8r.insertComponent(component, wrapper, data);
};

/**
    b8r.removeComponent(elt);

If elt has a component in it (i.e. has the attribute data-component-id) removes the
element's contents, removes the component-id, and removes any class that ends with '-component'.
Note that `removeComponent` does not preserve children!
*/

b8r.removeComponent = elt => {
  if (elt.dataset.componentId) {
    delete elt.dataset.componentId;
    b8r.makeArray(elt.classList).forEach(c => {
      if (/-component$/.test(c)) {
        elt.classList.remove(c);
      }
    });
    b8r.cleanupComponentInstances();
  }
};

/**
    b8r.componentOnce(url [,name]);

This loads the component (if necessary) and then if there is no instance of the component
in the DOM it creates one. It replaces the pattern:

    b8r.component(url).then(c => b8r.insertComponent(c));

And doesn't run the risk of leaking multiple instances of components into the DOM.
*/
b8r.componentOnce = function(...args) {
  // may be switched out for relative version
  this.component(...args).then(c => {
    if (!b8r.findOne(`[data-component-id*="${c.name}"]`)) {
      b8r.insertComponent(c);
    }
  });
};
