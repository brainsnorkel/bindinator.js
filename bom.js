/**
#BindOMatic

Binds your data and methods so you can concentrate on your actual goals.
*/

function BOM(){};

/**
	BOM.find(selector);       						// syntax sugar for querySelectorAll, returns proper array
	BOM.findOne(selector);        				// syntax sugar for querySelector
	BOM.findWithin(element, selector);		// find scoped within element
	BOM.findOneWithin(element, selector);	// findOne scoped within element
	BOM.makeArray(arrayish);							// creates a proper array from something array-like
	BOM.nearest(element, selector);				// like closest, but includes the element itself
	BOM.succeeding(element, selector);		// next succeeding sibling matching selector
*/
BOM.find = selector => BOM.makeArray(document.querySelectorAll(selector));
BOM.findOne = document.querySelector.bind(document);
BOM.findWithin = (element, selector) => BOM.makeArray(element.querySelectorAll(selector));
BOM.findOneWithin = (element, selector) => element.querySelector(selector);
BOM.makeArray = arrayish => [].slice.apply(arrayish);
BOM.nearest = (element, selector) => element.matches(selector) ? element : element.closest(selector);
BOM.succeeding = (element, selector) => {
	while(element.nextSibling && !element.nextElementSibling.matches(selector)){
		element = element.nextElementSibling
	}
	return element.nextElementSibling;
};

/**
	BOM.id();             // syntax sugar for findElementById
*/
BOM.id = document.getElementById.bind(document);

function getByPath(obj, path) {
	if(path && path !== '/') {
		path = path.split(/\.|\[/);
		while (path.length && obj) {
			var key = path.shift();
			if (key.substr(-1) === ']') {
				key = parseInt(key, 10);
			}
			obj = obj[key];
		} 
	}
	return obj;
}

function setByPath(obj, path, val) {
	path = path.split(/\.|\[/);
	while (path.length > 1) {
		var key = path.shift();
		if (key.substr(-1) === ']') {
			key = parseInt(key, 10);
		}
		if (!obj[key]) {
			obj[key] = path[0].substr(-1) === ']' ? [] : {};
		}
		obj = obj[key];
	}
	if (path[0].substr(-1) === ']') {
		obj[parseInt(path[0], 10)] = val;
	} else {
		obj[path[0]] = val;
	}
}

var models = {};

/**
	BOM.register(name, obj);						// register an object by name as data or controller
	BOM.deregister(name);								// remove a registered object
	BOM.setByPath(name, path, value);		// set a registered object's property by path
	BOM.getByPath(name, path);					// get a registered object's property by path
*/

BOM.register = function (name, obj) {
	models[name] = obj;
	if (BOM.getByPath(models[name], 'add')) {
		models[name].add();
	}
	BOM.find('[data-bind*="' + name + '"]').forEach(elt => bind(elt));
	BOM.find('[data-list*="' + name + '"]').forEach(elt => bindList(elt));
	// play back messages
};

BOM.deregister = function (name) {
	if (BOM.getByPath(models[name], 'remove')) {
		models[name].remove();
	}
	delete(models[name]);
};

BOM.setByPath = function (name, path, value, source_element) {
	if (models[name]) {
		setByPath(models[name], path, value);
		// this may update some false positives, but very few
		var elements = BOM.makeArray(document.querySelectorAll('[data-bind*="=' + name + '.' + path + '"]'));
		elements.forEach(element => element !== source_element && bind(element));
	}
};

BOM.getByPath = function (name, path) {
	if (models[name]) {
		return getByPath(models[name], path);
	}
};

/**
	BOM.on(event_type, model_name, method_name) // creates an implicit event-binding data attribute
		// data-event="event_type:module_name.method_name"
		// multiple handlers are semicolon-delimited
		// you can bind multiple event types separated by commas, e.g. click,keyup:do.something
		// NOTE if you link two event types to the same method separately they will NOT be collated
		// TODO convenience event types, e.g. keyup(arrow) or keyup(meta-c,ctrl-y)
*/
BOM.on = function (element, event_type, object, method) {
	// check if handler already exists
	// var existingHandlers = implicitEventHandlers(element);
	if (!event_type instanceof Array) {
		event_type = [event_type];
	}
	var handler = event_type.sort().join(',') + ':' + object + '.' + method;
	var existing = element.getAttribute('data-event');
	if (existing) {
		if (existing.replace(/\s*(^|$|[,:;])\s*/g, '$1').split(';').indexOf(handler) === -1) {
			element.setAttribute('data-event', existing + ';' + handler);
		}
	} else {
		element.setAttribute('data-event', handler);
	}
};

/*
 	returns an array of parsed implicit event handlers for an element
 	data-event="type1:model1.method1;type2,type3:model2.method2" is returned as
 	[
		{ types: ["type1"], model: "model1", method: "method1"},
		{ types: ["type2", "type3"], model: "model2", method: "method2"}
	]
*/
function implicitEventHandlers (element) {
	var source = element.getAttribute('data-event');
	var handlers = [];
	if (source) {
		source = source.split(';');
		handlers = source.map(function(instruction){
			var [type, handler] = instruction.split(':');
			var [model, method] = handler.trim().split('.');
			return { types: type.split(',').map(s => s.trim()).sort(), model, method };
		});
	}
	return handlers;
}

/**
	BOM.callMethod(model, method, evt);	// Call a method by name from a registered method
*/
BOM.callMethod = function (model, method, evt) {
	var result = null;
	if( models[model] ) {
		result = models[model][method](evt);
	} else {
		// TODO queue if model not available
		// event is stopped from further propagation
		// provide global wrappers that can e.g. put up a spinner then call the method
		result = false;
	}
	return result;
};

function handleEvent (evt) {
	var target = evt.target;
	var done = false;
	var result;
	while (target && !done) {
		var handlers = implicitEventHandlers(target);
		for (var i = 0; i < handlers.length; i++) {
			if (handlers[i].types.indexOf(evt.type) > -1) {
				var handler = handlers[i];
				result = BOM.callMethod(handler.model, handler.method, evt);
			}
		}
		// use stopPropagation?!
		if (result === false) {
			break;
		}
		target = target.parentElement;
	}
}

var implicit_event_types = [
	'mousedown', 'mouseup', 'click',
	'input', 'change',
	'focus', // more to follow
];

implicit_event_types.forEach(type => document.body.addEventListener(type, handleEvent));

/*
	This is where we define all the methods for binding to/from the DOM
*/
var toTargets = {
	value: function(element, value){
		switch (element.getAttribute('type')) {
			case 'radio': 
				element.checked = element.value === value;
				break;
			case 'checkbox':
				element.checked = value;
				break;
			default:
				element.value = value;
		}
	},
	text: function(element, value){
		element.textContent = value;
	},
	attr: function(element, value, dest) {
		element.setAttribute(dest, value);
	},
	style: function(element, value, dest) {
		element.style[dest] = value;
	},
	class: function(element, value, class_to_toggle) {
		if (value) {
			element.classList.add(class_to_toggle);
		} else {
			element.classList.remove(class_to_toggle);
		}
	},
	// conditional styles
};

var fromTargets = {
	value: function(element){
		return element.value;
	},
	checked: function(element) {
		return element.checked;
	},
	text: function(element){
		return element.textContent;
	}
};

function toDOM (element, target, obj, path) {
	var [,to,,dest] = target.match(/(\w+)(\((\w+)\))?/);
	if (!to) {
		console.error('bad DOM target', target);
	}
	if (toTargets[to]) {
		toTargets[to](element, getByPath(obj, path), dest);
	} else {
		console.error('unknown data target', target);
	}
}

function fromDOM (element, target) {
	if (fromTargets[target]) {
		return fromTargets[target](element);
	} else {
		console.error('unknown data source target', target);
	}
}

function parseBinding (binding) {
	var [targets, source] = binding.split('=');
	targets = targets.split(',').map(function(target){ 
		var parts = target.match(/(\w+)(\((\w+)\))?/);
		if(!parts) {
			console.error('bad target', target, 'in binding', binding);
			return;
		}
		return parts ? { target: parts[1], key: parts[3] } : null;
	});
	var [, model,, path] = source.match(/(\w*)(\.([^;]+))?/);
	return {targets, model, path};
}

function getBindings (element) {
	return element.getAttribute('data-bind').split(';').map(parseBinding);
}

function buildTargets (binding) {
	return binding.targets.map(target => target.target + (target.key ? '(' + target.key + ')' : ''));
}

function addBasePathToBindings(element, bindings, basePath) {
	if (basePath) {
		element.setAttribute(
			'data-bind',
			bindings.map(
				binding => 
				buildTargets(binding) +
					'=' + basePath +
					'.' + binding.model +
					binding.path.substr(binding.path.indexOf('.'))).join(';')
		);
	}
}

function findBindables (element) {
	return BOM.findWithin(element, '[data-bind]')
						.filter(elt => !elt.matches('[data-list]') && !elt.closest('[data-list]'));
}

function bind (element, data, basePath) {
	var bindings = getBindings(element);
	addBasePathToBindings(element, bindings, basePath);
	for (var i = 0; i < bindings.length; i++) {
		var {targets, model, path} = bindings[i];
		var obj = data || models[model];
		var _toTargets = targets.filter(t => toTargets[t.target]);
		var _fromTargets = targets.filter(t => fromTargets[t.target]);
		if (obj && _toTargets.length) {
			_toTargets.forEach(t => {
				toTargets[t.target](element, getByPath(obj, path), t.key)
			});
		} else {
			// save message for when source is registered
		}
		if (_fromTargets.length) {
			BOM.on(element, ['change', 'input'], '_BOM_', 'update');
		}
	}
}

function findLists (element) {
	return BOM.findWithin(element, '[data-list]')
			  .filter(elt => !elt.matches('[data-list]') && !elt.closest('[data-list]'));
}

function bindList (element, data, basePath) {
	var list_path = element.getAttribute('data-list');
	var [,model, path] = list_path.match(/^([^\.]*)?\.(.*)$/);
	var list = data ? getByPath(data, list_path) : BOM.getByPath(model, path);
	while(
		element.previousSibling &&
		(
			!element.previousSibling.matches ||
			element.previousSibling.matches('[data-list-instance]')
		)
	) {
		element.parentElement.removeChild(element.previousSibling);
	}
	for (var i = 0; i < list.length; i++) {
		var instance = element.cloneNode(true);
		instance.removeAttribute('data-list');
		var basePath = list_path + '[' + i + ']';
		instance.setAttribute('data-list-instance', basePath);
		bindAll(instance, list[i], basePath);
		element.parentElement.insertBefore(instance, element);
	}
}

function bindAll (element, data, basePath) {
	findBindables(element).forEach(elt => bind(elt, data, basePath));
	findLists(element).forEach(elt => bindList(elt, data, basePath));
}

BOM.register('_BOM_', {
	update: function(evt) {
		var bindings = getBindings(evt.target);
		for (var i = 0; i < bindings.length; i++) {
			var {targets, model, path} = bindings[i];
			targets = targets.filter(t => fromTargets[t.target]);
			targets.forEach(t => {
				BOM.setByPath(model, path, fromTargets[t.target](evt.target, t.key), evt.target);
			});
		}
	},
});

/**
	BOM.ajax(url, method, data).then(success, failure)
	BOM.json(url, method, data).then(success, failure)
*/
BOM.ajax = function (url, method, data) {
	return new Promise(function(resolve, reject) {
		var request = new XMLHttpRequest();
		request.open(method || 'GET', url, true);
		request.onreadystatechange = () => {
			if (request.readyState === XMLHttpRequest.DONE) {
				switch (Math.floor(request.status / 100)) {
					case 5:
					case 4:
						reject(request);
						break;
					case 3:
						// redirect of some kind
						break;
					case 2:
						resolve(request.responseText);
						break;
				}
			}
		};
		var request_data = data;
		if (typeof data !== 'string') {
			request_data = data ? JSON.stringify(data) : null;
		}
		request.send(request_data);
	});
};

BOM.json = function (url, method, data) {
	return new Promise(function(resolve, reject) {
		BOM.ajax(url, method, data).then(data => resolve(JSON.parse(data)), reject);
	});
};

var components = {};

/**
	BOM.text() // syntax sugar for document.createTextNode()
	BOM.fragment() // syntax sugar for document.createDocumentFragment();
	BOM.create('div') // syntax sugar for document.createElement('div');
*/

BOM.text = document.createTextNode.bind(document);
BOM.fragment = document.createDocumentFragment.bind(document);
BOM.create = document.createElement.bind(document);

/**
	BOM.empty(element); // removes contents of element
*/
BOM.empty = function (element) {
	while (element.lastChild) {
		element.removeChild(element.lastChild);
	}
};

/**
	BOM.copyChildren(source, dest); // copies contents of source to dest
*/
BOM.copyChildren = function (source, dest) {
	var element = source.firstChild;
	while (element) {
		dest.appendChild(element.cloneNode(true));
		element = element.nextSibling;
	}
};

/**
	BOM.component(name, url); // loads component from url
	  // registers it as "name"
	  // the extension .component.html is appended to url
	  // component will automatically be inserted as expected once loaded
*/
BOM.component = function (name, url) {
	return new Promise(function(resolve, reject) {
		if (components[name]) {
			resolve();
		} else {
			BOM.ajax(url + '.component.html').then(html => {
				var css = false;
				var view;
				var [,css, remains] = html.split(/<style>|<\/style>/);
				var [content, script,] = remains.split(/<script>|<\/script>/);
				var div = BOM.create('div');
				div.innerHTML = content;
				var load = script ? new Function('component', 'BOM', script) : false;
				if (css) {
					var style = BOM.create('style');
					style.type = 'text/css';
					style.appendChild(BOM.text(css));
					document.head.appendChild(style);
				}
				var component = {style: css ? style : false, view: div, load: load};
				components[name] = component;
				var targets = BOM.find('[data-component="' + name + '"]');
				targets.forEach(element => BOM.insertComponent(component, element));
				resolve();
			});
		}
	});
};

/**
	BOM.insertComponent(component); // inserts component at end of document.body
	BOM.insertComponent(component, element); // inserts component into element
*/
BOM.insertComponent = function (component, element) {
	if (typeof component === 'string') {
		if(!components[component]) {
			console.error('could not insert component', component);
			return;
		}
		component = components[component];
	}
	if (!element) {
		element = BOM.create('div');
		document.body.appendChild(element);
	}
	BOM.empty(element);
	BOM.copyChildren(component.view, element);
	bindAll(element);
	if (component.load) {
		component.load(element, BOM);
	}
};
