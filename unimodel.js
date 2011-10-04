!function(exports) {

	var EventMachine = function (events) {
		var me = this;
		this.events = {};
		if ($.isPlainObject(events)) {
			$.each(events, function(key, value) {
				me.on(key, value);
			});
		}
	}
	EventMachine.prototype = {
		on: function (event, fn) {
			this.events[event] = this.events[event] || [];
			this.events[event].push(fn);
		},
		un: function (event, fn) {
			if (event in this.events === false) return;
			if ($.isFunction(fn)) {
				this.events[event].splice(this.events[event].indexOf(fn), 1);
			} else if (fn === undefined) {
				this.events[event] = [];
			}
		},
		trigger: function (event) {
			if (event in this.events === false) return;
			for (var i = this.events[event].length - 1; i >= 0; i--) {
				this.events[event][i].apply(this, [].slice.call(arguments, 1));
			}
		}
	}

	var remove = function (array, from, to) {
		var rest = array.slice((to || from) + 1 || array.length);
		array.length = from < 0 ? array.length + from : from;
		return array.push.apply(array, rest);
	};

	var isNumber = function(value) {
		return typeof value === 'number' && isFinite(value);
	}

	var hash = function(array, fn) {
		if (typeof fn === 'string') {
			var key = fn;
			fn = function () {
				return [this[key], this]
			}
		}
		var results = {},
				i = 0,
				len = array.length,
				pair = [];

		for (; i < len; i++) {
			pair = fn.call(array[i], array[i], i, array);
			results[ pair[0] ] = pair[1];
		}

		return results;
	}

	var ns = function(src, path) {
		var o, d;
		if (path === undefined) return src;
		if (path.indexOf('.') != -1) {
			d = path.split(".");
			o = src[d[0]] = src[d[0]] || {};
			$.each(d.slice(1), function(v2) {
				o = o[v2] = o[v2] || {};
			});
		} else {
			o = src[path] = src[path] || {};
		}
		return o;
	}

	var getPath = function(field) {
		var lastField;
		var path;
		if (field.indexOf('.') != -1) {
			var tmp = field.toString().split(".");
			lastField = tmp[tmp.length - 1];
			remove(tmp, tmp.length - 1);
			path = tmp.join('.');
		} else {
			lastField = field;
		}
		return {
			path: path,
			field: isNumber(Number(lastField)) ? Number(lastField) : lastField
		};
	}

	var Unimodel = function(config) {
		this.override = {};
		this.silentMode = false;
		this.data = this.data || {};

		$.extend(this, config);

		$.extend(this, new EventMachine(this.events));
	}

	Unimodel.prototype = {
		silent: function(bool) {
			if (bool === undefined) {
				return this.silentMode;
			}
			this.silentMode = bool;
		},

		get: function(field) {
			if (!field) return this.data;

			var result, me = this;
			var maybePromise = !$.isFunction(this.override[field]) || this.override[field](undefined, field, 'get');

			if (maybePromise && maybePromise.promise) {
				return maybePromise.promise();
			} else if (maybePromise === true) {
				if (field.indexOf('.') != -1) {
					var o, d;
					var v = field;
					d = v.toString().split(".");
					o = me.data[d[0]];
					if (o === undefined) return;
					var v2 = d.slice(1);
					while (v2.length > 1) {
						o = o[v2[0]];
						if (o === undefined) return;
						v2 = v2.slice(1);
					}
					if (v2.length == 1) {
						if (o === undefined) return;
						return o[v2[0]];
					}
				} else {
					return me.data[field];
				}
			}
		},

		set: function(field, value) {
			if (typeof value === 'undefined') {
				return;
			}

			var result, me = this;

			if (!$.isPlainObject(field)) {
				var fields = {};
				fields[field] = value;
			} else {
				var fields = field;
			}
			$.each(fields, function(field, value) {
				var maybePromise = !$.isFunction(me.override[field]) || me.override[field](value, field, 'set');
				if (maybePromise && maybePromise.promise) {
					result = maybePromise.promise();
				} else {
					result = $.Deferred();
					maybePromise ? result.resolve() : result.reject();
				}

				result.done(function(data) {
					value = data || value;

					var found = getPath(field);

					ns(me.data, found.path);

					me.get(found.path)[found.field] = value;
					if (!me.silentMode) {
						me.trigger('update', field, value, data);
					}
				});
			});

		},

		merge: function(field, value, mode, idProperty) {
			if (typeof value === 'undefined') {
				return;
			}

			var result, me = this;
			var maybePromise = !$.isFunction(this.override[field]) || this.override[field](value, field, 'merge');

			if (maybePromise && maybePromise.promise) {
				result = maybePromise.promise();
			} else {
				result = $.Deferred();
				maybePromise ? result.resolve() : result.reject();
			}

			result.done(function(data) {
				value = data || value;

				var found = getPath(field);

				ns(me.data, found.path);

				var element = me.get(found.path);
				element[found.field] = element[found.field] || mode;

				if ($.isArray(mode)) {
					if (!$.isArray(value)) {
						value = [value];
					}
					if (idProperty) {
						var innerMap = hash(element[found.field], idProperty);
						var outerMap = hash(value, idProperty);

						for (id in outerMap) {
							if (id in innerMap) {
								innerMap[id] = outerMap[id];
							} else {
								element[found.field].push(outerMap[id]);
							}
						}
					} else {
						element[found.field] = element[found.field].concat(value);
					}
				}
				else if ($.isPlainObject(mode)) {
					$.extend(true, element[found.field], value);
				}
				else if ($.isFunction(mode)) {
					element[found.field] = mode.call(me, element[found.field], value);
				}
				else {
					element[found.field] += value;
				}
				if (!me.silentMode) {
					me.trigger('merge', field, value, data);
				}
			});
		},

		remove: function(field) {
			var fields, me = this;
			if ($.isArray(field)) {
				fields = field;
			} else {
				fields = [];
				fields.push(field);
			}
			for (var i = -1, len = fields.length; ++i < len;) {
				field = fields[i];
				var maybePromise = !$.isFunction(this.override[field]) || this.override[field](undefined, field, 'remove');
				var result;
				if (maybePromise && maybePromise.promise) {
					result = maybePromise.promise();
				} else {
					result = $.Deferred();
					maybePromise ? result.resolve() : result.reject();
				}

				result.done(function(data) {
					var found = getPath(field);
					var value = me.get(found.path);

					if ($.isArray(value) && isNumber(found.field)) {
						value = me.get(found.path)[found.field];
						remove(me.get(found.path), found.field);
					} else {
						value = me.get(found.path)[found.field];
						delete me.get(found.path)[found.field];
					}
					if (!me.silentMode) {
						me.trigger('remove', field, value, data);
					}
				});
			}
		},

		exists: function(field) {
			var found = getPath(field);

			var element = this.get(found.path);

			if ($.isArray(element) && isNumber(found.field)) {
				return (element.length > Number(found.field));
			} else {
				return (found.field in element);
			}
		},

		removeAll: function() {
			this.data = {};
			if (!this.silentMode) {
				this.trigger('removeAll');
			}
		}
	}

	exports.Unimodel = Unimodel;
}(window);
