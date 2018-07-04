//     Backbone.js 1.3.3

//     (c) 2010-2017 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Backbone may be freely distributed under the MIT license.
//     For all details and documentation:
//     http://backbonejs.org

(function(factory) {

    // root代表全局对象
    var root = (typeof self == 'object' && self.self === self && self) || 
                (typeof global == 'object' && global.global === global && global);
    
    // AMD规范加载Backbone
    if (typeof define === 'function' && define.amd) {
        define(['underscore', 'jquery', 'exports'], function(_, $, exports) {
            root.Backbone = factory(root, exports, _, $);
        });
    // CommonJS规范加载Backbone
    } else if (typeof exports !== 'undefined') {
        var _ = require('underscore'), $;
        
        try {
            $ = require('jquery');
        } catch (e) {

        }

        factory(root, exports, _, $);
    // 浏览器环境下加载Backbone
    } else {
        root.Backbone = factory(root, {}, root._, (root.jQuery || root.Zepto || root.ender || root.$));
    }
})(function(root, Backbone, _, $) {

    // 用作Backbone的冲突处理
    var previousBackbone = root.Backbone;
    var slice = Array.prototype.slice;

    Backbone.VERSION = '1.3.3';
    Backbone.$ = $;

    // 可以用别名保存保存Backbone
    Backbone.noConflict = function() {
        root.Backbone = previousBackbone;
        return this;
    };

    Backbone.emulateHTTP = false;
    Backbone.emulateJSON = false;

    // 事件模块
    var Events = Backbone.Events = {};
    // 匹配空白符
    var eventSplitter = /\s+/;
    var _listening;

    var eventsApi = function(iteratee, events, name, callback, opts) {
        var i = 0, names;

        // 将不同回调函数绑定到不同事件上
        if (name && typeof name === 'object') {
            if (callback !== void 0 && 'context' in opts && opts.context === void 0) {
                opts.context = callback;
            }

            for (names = _.keys(name); i < names.length; i++) {
                events = eventsApi(iteratee, events, names[i], name[names[i]], opts);
            }
        // 将同一个回调函数绑定到不同事件上
        } else if (name && eventSplitter.test(name)) {
            for (names = name.split(eventSplitter); i < names.length; i++) {
                events = iteratee(events, names[i], callback, opts);
            }
        } else {
            events = iteratee(events, name, callback, opts);
        }

        return events;
    };

    // 监听事件
    Events.on = function(name, callback, context) {
        this._events = eventsApi(onApi, this._events || {}, name, callback, {
            context: context,
            ctx: this,
            listening: _listening
        });

        // 这里的_listening呼应listenTo里面的tryCatchOn函数
        if (_listening) {
            var listeners = this._listeners || (this._listeners = {});
            listeners[_listening.id] = _listening;
            _listening.interop = false;
        }

        return this;
    };

    // 可以去监听另一个对象上的特定事件
    Events.listenTo = function(obj, name, callback) {
        if (!obj) {
            return this;
        }

        // 生成一个全局唯一的id
        var id = obj._listenId || (obj._listenId = _.uniqueId('l'));
        var listeningTo = this._listeningTo || (this._listeningTo = {});
        var listening = _listening = listeningTo[id];

        if (!listening) {
            this._listenId || (this._listenId = _.uniqueId('l'));
            // 这里根据id指向一个监听对象
            listening = _listening = listeningTo[id] = new Listening(this, obj);
        }

        // 尝试让obj去监听name事件 如果发生错误 则返回错误
        var error = tryCatchOn(obj, name, callback, this);

        // 如果执行下面这语句, 那么_listening = new Listening(this, obj);意义在哪
        // 执行这条语句前 _listening.interop和listening.interop具有相同的引用
        _listening = void 0;

        if (error) {
            throw error;
        }

        // 让listening去监听name事件
        // 如果tryCatchOn成功执行 则_listening.interop = false;
        if (listening.interop) {
            listening.on(name, callback);
        }

        return this;
    };

    // 给events增加name事件的回调函数
    var onApi = function(events, name, callback, options) {
        if (callback) {
            // handlers储存着name事件类型的回调函数
            var handlers = events[name] || (events[name] = []);
            var context = options.context, ctx = options.ctx, listening = options.listening;

            if (listening) {
                listening.count++;
            }

            // handlers数组保持着各种不同的回调函数 每个回调函数都具有各自的上下文
            handlers.push({
                callback: callback,
                context: context,
                ctx: context || ctx,
                listening: listening
            });
        }

        return events;
    };

    var tryCatchOn = function(obj, name, callback, context) {
        try {
            obj.on(name, callback, context);
        } catch (e) {
            return e;
        }
    };

    // 移除之前绑定的回掉函数
    Events.off = function(name, callback, context) {
        if (!this._events) {
            return this;
        }

        this._events = eventsApi(offApi, this._events, name, callback, {
            context: context,
            listeners: this._listeners
        });
        
        return this;
    };

    Events.stopListening = function(obj, name, callback) {
        var listeningTo = this._listeningTo;

        if (!listeningTo) {
            return this;
        }

        var ids = obj ? [obj._listenId] : _.keys(listeningTo);

        // 移除监听obj的函数 或者移除所有的监听函数
        for (var i = 0; i < ids.length; i++) {
            var listening = listeningTo[ids[i]];

            if (!listening) {
                break;
            }

            // 移除监听obj的函数
            listening.obj.off(name, callback, this);

            if (listening.interop) {
                listening.off(name, callback);
            }
        }

        // 如果不再有监听其他对象事件的函数 则把this._listeningTo置为undefined
        if (_.isEmpty(listeningTo)) {
            this._listeningTo = void 0;
        }

        return this;
    };

    var offApi = function(events, name, callback, options) {
        if (!events) {
            return;
        }

        var context = options.context, listeners = options.listeners; //listeners 监听其他对象事件的集合
        var i = 0, names;

        // 当不存在事件名和上下文和回调函数时 清除掉所有监听其他对象上的的监听事件
        if (!name && !context && !callback) {
            for (names = _.keys(listeners); i < names.length; i++) {
                listeners[names[i]].cleanup();
            }
        }

        names = name ? [name] : _.keys(events); // 所有类型的事件和相应的回掉函数

        for (; i < names.length; i++) {
            name = names[i];
            var handlers = events[name];

            // 如果handers为空说明没有监听函数
            if (!handlers) {
                break;
            }

            // remaining保存着不该注销的监听函数
            var remaining = [];

            for (var j = 0; j < handlers.length; j++) {
                var handler = handlers[i];

                // 如果上下文或者监听函数和实参不一样说明改函数不应该移除
                if (callback && callback !== handler.callback &&
                        callback !== handler.callback._callback ||
                            context && context !== handler.context
                ) {
                    remaining.push(handler);
                } else {
                    var listening = handler.listening;

                    if (listening) {
                        listening.off(name, callback);
                    }
                }
            }

            // 如果remaining不为空说明改事件不应该被注销
            if (remaining.length) {
                events[name] = remaining;
            // 注销name事件
            } else {
                delete events[name];
            }
        }

        return events;
    };

    // 绑定的回调函数触发一次将被移除
    Events.once = function(name, callback, context) {
        var events = eventsApi(onceMap, {}, name, callback, _.bind(this.off, this));
        return this.listenTo(obj, events);
    };

    // 只监听一次事件 之后callback将被移除
    Events.listenToOnce = function(obj, name, callback) {
        var events = eventsApi(onceMap, {}, name, callback, _.bind(this.stopListening, this, obj));
        return this.listenTo(obj, events);
    };

    var onceMap = function(map, name, callback, offer) {
        if (callback) {
            // _.once函数创建一个只执行一次函数
            var once = map[name] = _.once(function() {
                offer(name, once);
                callback.apply(this, arguments);
            });

            once._callback = callback;
        }

        return map;
    };

    // 触发name事件 
    Events.trigger = function(name) {
        if (!this._events) {
            return this;
        }

        var length = Math.max(0, arguments - 1);
        // 把除去第一个参数以外的所有参数保存到args中
        var args = Array(length);

        for (var i = 0; i < length; i++) {
            args[i] = arguments[i + 1];
        }

        eventsApi(triggerApi, this._events, name, void 0, args);
        return this;
    };

    var triggerApi = function(objEvents, name, callback, args) {
        if (objEvents) {
            var events = objEvents[name];
            var allEvents = objEvents.all;

            if (events && allEvents) {
                allEvents = allEvents.slice();
            }

            if (events) {
                triggerEvents(events, args);
            }

            if (allEvents) {
                triggerEvents(allEvents, [name].concat(args));
            }
        }

        return objEvents;
    };

    var triggerEvents = function(events, args) {
        var ev, i = -1, l = events.length, a1 = args[0], a2 = args[1], a3 = args[2];

        switch (args.length) {
            case 0:
                while (++i < l) {
                    (ev = events[i]).callback.call(ev.ctx);
                }
                return;
            case 1:
                while (++i < l) {
                    (ev = events[i]).callback.call(ev.ctx, a1);
                }
                return;
            case 2:
                while (++i < l) {
                    (ev = events[i]).callback.call(ev.ctx, a1, a2);
                }
                return;
            case 3:
                while (++i < l) {
                    (ev = events[i]).callback.call(ev.ctx, a1, a2, a3);
                }
                return;
            default:
                while (++i < l) {
                    (ev = events[i]).callback.apply(ev.ctx, args);
                }
                return;
        }
    };

    // 一个创建监听其他对象的构造函数
    // obj表示正在被监听的对象
    var Listening = function(listener, obj) {
        this.id = listener._listenId;
        this.listener = listener;
        this.obj = obj;
        this.interop = true;
        this.count = 0;
        this._events = void 0;
    };

    Listening.prototype.on = Events.on;

    Listening.prototype.off = function(name, callback) {
        var cleanup;

        if (this.interop) {
            this._events = eventsApi(offApi, this._events, name, callback, {
                context: void 0,
                listeners: void 0
            });

            cleanup = !this._events;
        } else {
            this.count--;
            cleanup = this.count === 0;
        }

        if (cleanup) {
            this.cleanup();
        }
    };

    Listening.prototype.cleanup = function() {
        delete this.listener._listeningTo[this.obj._listenId];

        if (!this.interop) {
            delete this.obj._listeners[this.id];
        }
    };

    Events.bind   = Events.on;
    Events.unbind = Events.off;

    _.extend(Backbone, Events);

    // Backbone.model
    var Model = Backbone.model = function(attributes, options) {
        var attrs = attributes || {};
        options || (options = {});
        this.preinitialize(this, arguments);
        this.cid = _.uniqueId(this.cidPrefix);
        this.attributes = {};

        if (options.collection) {
            this.collection = options.collection;
        }

        if (options.parse) {
            attrs = this.parse(attrs, options) || {};
        }

        var defaults = _.result(this, 'defaults');
        attrs = _.defaults(_.extend({}, defaults, attrs), defaults);
        this.set(attrs, options);
        // 存储历史变化记录
        this.changed = {};
        this.initialize.apply(this, arguments);
    };

    _.extend(Model.prototype, Events, {
        changed: null,
        validationError: null,
        idAttribute: 'id',
        cidPrefix: 'c',
        preinitialize: function() {},
        initialize: function() {},
        // 复制Model实例的attribues属性
        toJSON: function(options) {
            return _.clone(this.attributes);
        },
        sync: function() {
            return Backbone.sync.apply(this, arguments);
        },
        // 获取attr属性
        get: function(attr) {
            return this.attributes[attr];
        },
        // 获取attr转义过的属性
        escape: function(attr) {
            return _.escape(this.get(attr));
        },
        // 判断是否含有attr属性
        has: function(attr) {
            return this.get(attr) != null;
        },
        // 判断attr中的属性是否匹配this.attributes
        matches: function(attrs) {
            return !!_.iteratee(attrs, this)(this.attributes);
        },
        set: function(key, val, options) {
            if (key == null) {
                return this;
            }

            var attrs;

            // 如果key是一个对象则忽略第三个参数options
            if (typeof key === 'object') {
                attrs = key;
                options = val;
            } else {
                (attrs = {})[key] = val;
            }

            options || (options = {});

            // 验证参数是否合法
            if (!this._validate(attrs, options)) {
                return false;
            }

            var unset = options.unset;
            // slient表示是否静默改变
            var silent = options.silent;
            var changes = [];
            // 和上一次对比是否改变过
            var changing = this._changing;
            this._changing = true;

            // 之前不曾改变过
            if (!changing) {
                this._previousAttributes = _.clone(this.attributes);
                this.changed = {};
            }

            var current = this.attributes;
            var changed = this.changed;
            var prev = this._previousAttributes;

            for (var attr in attrs) {
                val = attrs[attr];

                // 如果当前的值和要设置的值不一样 则在changes数组中添加
                if (!_.isEqual(current[attr], val)) {
                    changes.push(attr);
                }

                // 如果要设置的值和上一次的值不一样 则记录key和val
                // 这里不是很明白
                if (!_.isEqual(prev[attr], val)) {
                    changed[attr] = val;
                } else {
                    delete changed[attr];
                }

                // unset为true时会从内部属性种删除指定属性
                // unset为false时可以实时更新指定属性
                unset ? delete current[attr] : current[attr] = val;
            }

            // 获取id
            if (this.idAttribute in attrs) {
                this.id = this.get(this.idAttribute);
            }

            // silent参数表示是否静默触发change事件
            if (!silent) {
                if (changes.length) {
                    this._pending = options;
                }

                for (var i = 0; i < changes.length; i++) {
                    this.trigger('change:' + changes[i], this, current[changes[i]], options);
                }
            }

            // 如果是正处于change时 直接return this
            if (changing) {
                return this;
            }

            // 这里为什么还要触发一次change事件
            if (!silent) {
                while (this._pending) {
                    options = this._pending;
                    this._pending = false;
                    this.trigger('change', this, options);
                }
            }

            // 执行到这里说明change事件 已经完成
            this._pending = false;
            this._changing = false;
            return this;
        },
        // 删除指定的内部属性
        unset: function(attr, options) {
            return this.set(attr, void 0, _.extend({}, options, {unset: true}));
        },
        // 把所有的内部属性都置为undefined
        clear: function(options) {
            var attrs = {};

            for (var key in this.attributes) {
                attrs[key] = void 0;
            }

            return this.set(attrs, _.extend({}, options, {unset: true}));
        },
        // 不传参数时 判断this.changed的数组是否为空
        // 否则判断attr属性是否改变过
        hasChanged: function(attr) {
            if (attr == null) {
                return !_.isEmpty(this.changed);
            }

            return _.has(this.changed, attr);
        },
        // 不传参数时 返回改变过的属性
        // 如果什么都没改变返回false
        // 否则返回改变过的历史记录
        changedAttributes: function(diff) {
            if (!diff) {
                return this.hasChanged() ? _.clone(this.changed) : false;
            }

            // 如果正处于改变中old为this._previousAttributes
            // 否则old为this.attributes
            var old = this._changing ? this._previousAttributes : this.attributes;
            var changed = {};
            var hasChanged;

            for (var attr in diff) {
                var val = diff[attr];

                // 判断是否changed
                if (_.isEqual(old[attr], val)) {
                    continue;
                }

                changed[attr] = val;
                hasChanged = true;
            }

            // 如果有改变过则返回changed
            return hasChanged ? changed : false;
        },
        // 返回上一次的attribues的指定属性
        previous: function(attr) {
            if (attr == null || !this._previousAttributes) {
                return null;
            }

            return this._previousAttributes[attr];
        },
        // 返回上一次的attribues
        previousAttributes: function() {
            return _.clone(this._previousAttributes);
        },
        fetch: function(options) {
            options = _.extend({parse: true}, options);
            var model = this;
            var success = options.success;

            // 这个回掉函数什么时候会执行
            options.success = function(resp) {
                // model.parse(resp, options)直接返回resp
                // 这个参数的意义在哪?
                var serverAttrs = options.parse ? model.parse(resp, options) : resp;

                // 如果数据校验不通过则返回false
                // 否则更新内部属性this.attributes
                if (!model.set(serverAttrs, options)) {
                    return false;
                }

                // 如果存在success回调函数 则执行
                if (success) {
                    success.call(options.context, model, resp, options);
                }

                // 触发sync事件
                model.trigger('sync', model, resp, options);
            };

            // wrapError中的回调函数什么时候执行
            wrapError(this, options);
            return this.sync('read', options);
        },
        save: function(key, val, options) {
            var attrs;

            if (key == null || typeof key === 'object') {
                attrs = key;
                options = val;
            } else {
                (attrs = {})[key] = val;
            }

            options = _.extend({validate: true, parse: true}, options);
            // wait决定是否更新模型内部状态
            var wait = options.wait;

            if (attrs && wait) {
                // 数据校验不通过则返回false
                // 否则更新内部属性
                if (!this.set(attrs, options)) {
                    return false;
                }
            } else if (!this._validate(attrs, options)) {
                return false;
            }

            var model = this;
            var success = options.success;
            var attributes = this.attributes;

            options.success = function(resp) {
                // 既然上面已经将this覆给model 
                // 这里为什么会把attribues覆给model.attribues
                // model本身的attribues不就指向this.attribues吗?
                model.attributes = attributes;
                var serverAttrs = options.parse ? model.parse(resp, options) : resp;

                // 是否更新模型内部状态
                if (wait) {
                    serverAttrs = _.extend({}, attrs, serverAttrs);
                }

                // 如果数据校验不通过 则返回false
                if (serverAttrs && !model.set(serverAttrs, options)) {
                    return false;
                }

                if (success) {
                    success.call(options.context, model, resp, options);
                }

                model.trigger('sync', model, resp, options);
            };

            wrapError(this, options);

            // 根据传入的参数更新模型内部状态
            if (attrs && wait) {
                this.attributes = _.extend({}, attributes, attrs);
            }

            var method = this.isNew() ? 'create' : (options.patch ? 'patch' : 'update');

            if (method === 'patch' && !options.attrs) {
                options.attrs = attrs;
            }

            var xhr = this.sync(method, this, options);
            this.attributes = attributes;
            return this;
        },
        destory: function(options) {
            options = options ? _.clone(options) : {};
            var model = this;
            var success = options.success;
            // wait表示是否等待服务器返回结果再销毁模型
            var wait = options.wait;

            // 销毁模型
            var destory = function() {
                model.stopListening();
                model.trigger('destory', model, model.collection, options);
            };

            options.success = function(resp) {
                if (wait) {
                    destory();
                }

                if (success) {
                    success.call(options.context, model, resp, options);
                }

                if (!model.isNew()) {
                    model.trigger('sync', model, resp, options);
                }
            };

            var xhr = false;

            // 如果isNew()返回true 则不用通知服务器销毁模型
            if (this.isNew()) {
                _.defer(options.success);
            // 通知服务器销毁模型
            } else {
                wrapError(this, options);
                xhr = this.sync('delete', this, options);
            }

            if (!wait) {
                destory();
            }

            return xhr;
        },
        url: function() {
            var base = 
                _.result(this, 'urlRoot') ||
                _.result(this.collection, 'url') ||
                urlError();
            
            if (this.isNew()) {
                return base;
            }

            var id = this.get(this.idAttribute);
            return base.replace(/[^\/]/, '$&') + encodeURIComponent(id);
        },
        // 第二个参数作用是什么
        parse: function(resp, options) {
            return resp;
        },
        // 返回该模型具有相同属性的实例
        clone: function() {
            return new this.constructor(this.attributes);
        },
        // 模型是否已经保存到服务器
        isNew: function() {
            return !this.has(this.idAttribute);
        },
        // 检查模型状态
        isValid: function(options) {
            return this._validate({}, _.extend({}, options, {validate: true}));
        },
        // 检查模型是否满足校验规则
        _validate: function(attrs, options) {
            if (!options.validate || !this.validate) {
                return true;
            }

            attrs = _.extend({}, this.attributes, attrs);
            var error = this.validationError = this.validate(attrs, options) || null;

            if (!error) {
                return true;
            }

            this.trigger('invalid', this, error, _.extend(options, {validationError: error}));
            return false;
        }
    });

    // Collection
    var Collection = Backbone.Collection = function(models, options) {
        options || (options = {});
        this.preinitialize.apply(this, arguments);

        if (options.model) {
            this.model = options.model;
        }

        if (options.comparator !== void 0) {
            this.comparator = options.comparator;
        }

        this._reset();
        this.initialize.apply(this, arguments);

        if (models) {
            this.reset(models, _.extend({slient: true}, options));
        }
    };

    var setOptions = {
        add: true, 
        remove: true,
        merge: true
    };

    var addOptions = {
        add: true,
        remove: false
    };

    // 在指定位置插入数组
    var splice = function(array, insert, at) {
        // 0 <= at <= length
        at = Math.min(Math.max(at, 0), array.length);
        var tail = Array(array.length - at);
        var length = insert.length;
        var i;

        // tail保存着at之后的元素
        for (i = 0; i < tail.length; i++) {
            tail[i] = array[i + at];
        }

        // 把insert中的元素插入到at之后
        for (i = 0; i < length; i++) {
            array[i + at] = insert[i];
        }

        // 把tail的元素插入到insert之后
        for (i = 0; i < tail.length; i++) {
            array[i + length + at] = tail[i];
        }
    };

    _.extend(Collection.prototype, Events, {
        model: Model,
        preinitialize: function() {},
        initialize: function() {},
        toJSON: function(options) {
            return this.map(function(model) {
                return model.toJSON(options);
            });
        },
        sync: function() {
            return Backbone.sync.apply(this, arguments);
        },
        add: function(models, options) {
            return this.set(models, _.extend({merge: false}, options, addOptions));
        },
        remove: function(models, options) {
            options = _.extend({}, options);
            var singular = !_.isArray(models);
            // 把models转换成数组
            models = singular ? [models] : models.slice();
            // removed保存着被移除的模型
            var removed = this._removeModels(models, options);

            // 如果不是静默改变 将会触发update事件
            if (!options.slient && removed.length) {
                options.changes = {
                    added: [],
                    merged: [],
                    removed: removed
                };
                this.trigger('update', this, options);
            }

            return singular ? removed[0] : removed;
        },
        set: function(models, options) {
            if (models == null) {
                return ;
            }

            options = _.extend({}, setOptions, options);

            if (options.parse && !this._isModel(model)) {
                models = this.parse(models, options) || [];
            }

            var singular = !_.isArray(models);
            models = singular ? [models] : models.slice();

            var at = options.at;

            if (at != null) {
                at = +at;
            }

            if (at > this.length) {
                at = this.length;
            }

            if (at < 0) {
                at += this.length + 1;
            }

            var set = [];
            var toAdd = [];
            var toMerge = [];
            var toRemove = [];
            var modelMap = {};

            var add = options.add;
            var merge = options.merge;
            var remove = options.remove;

            var sort = false;
            var sortable = this.comparator && at == null && options.sort !== false;
            var sortAttr = _.isString(this.comparator) ? this.comparator : null;

            var model, i;

            for (i = 0; i < models.length; i++) {
                model = models[i];

                // 是否存在该模型
                var existing = this.get(model);

                if (existing) {
                    if (merge && model !== existing) {
                        var attrs = this._isModel(model) ? model.attributes : model;

                        if (options.parse) {
                            attrs = existing.parse(attrs, options);
                        }

                        existing.set(attrs, options);
                        toMerge.push(existing);

                        if (sortable && !sort) {
                            sort = existing.hasChanged(sortAttr);
                        }
                    }

                    if (!modelMap(existing.cid)) {
                        modelMap[existing.cid] = true;
                        set.push(model);
                    }

                    models[i] = existing;
                } else if (add) {
                    // 添加模型是否成功
                    model = modes[i] = this._prepareModel(model, options);
    
                    if (model) {
                        toAdd.push(model);
                        this._addReference(model, options);
                        modelMap[model.cid] = true;
                        set.push(model);
                    }
                }
            } 

            if (remove) {
                // 遍历集合查询不存在与列表中的模型
                for (i = 0; i < this.length; i++) {
                    model = this.models[i];

                    // 添加列表中不存在的模型
                    if (!modelMap[model.cid]) {
                        toRemove.push(model);
                    }
                }

                // 如果集合中包含列表不存在的模型将会被移除
                if (toRemove.length) {
                    this._removeModels(toRemove, options);
                }
            }

            var orderChanged = false;
            var replace = !sortable && add && remove;

            if (set.length && replace) {
                // 判断是否需要更新模型
                orderChanged = this.length !== set.length || _.some(this.models, function(m, index) {
                    return m !== set[index];
                });

                this.models.length = 0;
                // 添加set中的模型
                splice(this.models, set, 0);
                // 更新集合的长度
                this.length = this.models.length;
            } else if (toAdd.length) {
                // 添加toAdd中的模型到原先的集合中
                if (sortable) {
                    sort = true;
                }

                splice(this.models, toAdd, at == null ? this.length : at);
                this.length = this.models.length;
            }

            if (sort) {
                this.sort({slient: true});
            }

            if (!options.slient) {
                for (i = 0; i < toAdd.length; i++) {
                    if (at != null) {
                        options.index = at + i;
                    }

                    model = toAdd[i];
                    // 如果不是静默添加 触发add事件
                    model.trigger('add', model, this, options);
                }

                if (sort || orderChanged) {
                    this.trigger('sort', this, options);
                }

                // 如果集合中的模型发生改变 则触发update事件
                if (toAdd.length || toRemove.length || toMerge.length) {
                    options.changes = {
                        added: toAdd,
                        remove: toRemove,
                        merged: toMerge
                    };
                    this.trigger('update', this, options);
                }
            }

            return singular ? models[0] : models;
        },
        // 使用models替换原先的集合
        reset: function(models, options) {
            options = options ? _.clone(options) : {};

            // 移除之前的关联
            for (var i = 0; i < this.models.length; i++) {
                this._removeReference(this.models[i], options);
            }

            options.previousModels = this.models;
            // 重置集合
            this._reset();
            // 添加models中的模型到集合中
            models = this.add(models, _.extend({slient: true}, options));

            // 触发rest事件
            if (!options.slient) {
                this.trigger('reset', this, options);
            }

            return models;
        },
        // 在集合尾部添加一个模型
        push: function(model, options) {
            return this.add(model, _.extend({at: this.length}, options));
        },
        // 从集合尾部删除一个模型
        pop: function(options) {
            var model = this.at(this.length - 1);
            return this.remove(model, options);
        },
        // 在集合头部添加一个模型
        unshift: function(model, options) {
            return this.add(model, _.extend({at: 0}, options));
        },
        // 在集合头部删除一个模型
        shift: function(options) {
            var model = this.at(0);
            return this.remove(model, options);
        },
        // 返回集合模型的一个浅拷贝版本
        slice: function() {
            return slice.apply(this.models, arguments);
        },
        // 根据id返回集合中的模型
        get: function(obj) {
            if (obj == null) {
                return void 0;
            }

            return this._byId[obj] ||
                this._byId[this.modelId(this._isModel(obj) ? obj.attributes : obj)] ||
                obj.cid && this._byId[obj.cid];
        },
        // 判断集合中是否存在指定模型
        has: function(obj) {
            return this.get(obj) != null;
        },
        // 返回指定位置的集合
        at: function(index) {
            if (index < 0) {
                index += this.length;
            }

            return this.models[index];
        },
        // 如果first为true则返回集合种满足条件的第一个模型
        // 否则返回所有满足条件的模型
        where: function(attrs, first) {
            return this[first ? 'find' : 'filter'](attrs);
        },
        // 返回所有满足条件的模型
        findWhere: function(attrs) {
            return this.find(attrs);
        },
        // 对集合从新排序
        sort: function(options) {
            var comparator = this.comparator;

            if (!comparator) {
                throw new Error('Cannot sort a set without a comparator');
            }

            options || (options = {});

            var length = comparator.length;

            if (_.isFunction(comparator)) {
                // 把this绑定到comparator
                comparator = _.bind(comparator, this);
            }

            if (length === 1 || _.isString(comparator)) {
                this.models = this.sortBy(comparator);
            } else {
                this.models.sort(comparator);
            }

            if (!options.slient) {
                this.trigger('sort', this, options);
            }

            return this;
        },
        // 返回集合中模型的attr属性数组
        pluck: function(attr) {
            return this.map(attr + '');
        },
        fetch: function(options) {
            options = _.extend({parse: true}, options);
            var success = options.success;
            var collection = this;

            options.success = function(resp) {
                var method = options.reset ? 'reset' : 'set';
                collection[method](resp, options);

                if (success) {
                    success.call(options.context, collection, resp, options);
                }

                collection.trigger('sync', collection, resp, options);
            };

            wrapError(this, options);
            return this.sync('read', this, options);
        },
        create: function(model, options) {
            options = options ? _.clone(options) : {};
            var wait = options.wait;
            model = this._prepareModel(model, options);

            if (!model) {
                return false;
            }

            if (!wait) {
                this.add(model, options);
            }

            var collection = this;
            var success = options.success;

            options.success = function(m, resp, callbackOpts) {
                if (wait) {
                    collection.add(m, callbackOpts);
                }

                if (success) {
                    success.call(callbackOpts.context, m, resp, callbackOpts);
                }
            };

            model.save(null, options);
            return model;
        },
        parse: function(resp, options) {
            return resp;
        },
        // 根据集合中的模型创建一个完全相同的集合
        clone: function() {
            return new this.constructor(this.models, {
                model: this.model,
                comparator: this.comparator
            });
        },
        modelId: function(attrs) {
            return attrs[this.model.prototype.idAttribute || 'id'];
        },
        // 返回一个models的迭代器
        values: function() {
            return new CollectionIterator(this, ITERATOR_VALUES);
        },
        // 返回一个模型id的迭代器
        keys: function() {
            return new CollectionIterator(this, ITERATOR_KEYS);
        },
        // 返回一个模型id, model的迭代器
        entries: function() {
            return new CollectionIterator(this, ITERATOR_KEYSVALUES);
        },
        // 重置集合
        _reset: function() {
            this.length = 0;
            this.models = [];
            this._byId = {};
        },
        // 类似于构造函数?
        // 如果校验通过返回一个集合
        _prepareModel: function(attrs, options) {
            if (this._isModel(attrs)) {
                if (!attrs.collection) {
                    attr.collection = this;
                }
                
                return attrs;
            }

            options = options ? _.clone(options) : {};
            options.collection = this;
            var model = new this.model(attrs, options);

            if (!model.validationError) {
                return model;
            }

            this.trigger('invalid', this, model.validationError, options);
            return false;
        },
        // 移除列表中的模型
        _removeModels: function(models, options) {
            var removed = [];

            for (var i = 0; i < models.length; i++) {
                var model = this.get(models[i]);

                if (!model) {
                    continue;
                }

                var index = this.indexOf(model);
                this.models.splice(index, 1);
                this.length--;

                delete this._byId[model.cid];
                var id = this.modelId(model.attributes);

                if (id != null) {
                    delete this._byId[id];
                }

                if (!options.slient) {
                    options.index = index;
                    model.trigger('remove', model, this, options);
                }

                removed.push(model);
                this._removeReference(mode, options);
            }

            return removed;
        },
        // 判断是否是一个Model的实例
        _isModel: function(model) {
            return model instanceof Model;
        },
        // 生成一个关于集合中关于模型的映射表
        _addReference: function(model, options) {
            this._byId[model.cid] = model;
            var id = this.modelId(model.attributes);

            if (id != null) {
                this._byId[id] = model;
            }

            model.on('all', this._onModelEvent, this);
        },
        // 从映射表中删除模型
        _removeReference: function(model, options) {
            delete this._byId[model.cid];
            var id = this.modelId(model.attributes);

            if (id != null) {
                delete this._byId[id];
            }

            if (this === model.collection) {
                delete model.collection;
            }

            model.off('all', this._onModelEvent, this);
        },
        // 如果是change事件则更新映射表
        // 如果是destory事件 删除模型
        _onModelEvent: function(event, model, collection, options) {
            if (model) {
                if ((event === 'add' || event === 'remove') && collection !== this) {
                    return;
                }

                if (event === 'destory') {
                    this.remove(model, options);
                }

                if (event === 'change') {
                    var prevId = this.modelId(model.previousAttributes());
                    var id = this.modelId(model.attributes);

                    if (prevId !== id) {
                        if (prevId != null) {
                            delete this._byId[prevId];
                        }

                        if (id != null) {
                            this._byId[id] = model;
                        }
                    }
                }
            }

            this.trigger.apply(this, arguments);
        }
    });

    var $$iterator = typeof Symbol === 'function' && Symbol.iterator;

    // 使集合拥有迭代能力
    // 迭代集合相当于迭代集合的values
    if ($$iterator) {
        Collection.prototype[$$iterator] = Collection.prototype.values;
    }

    var CollectionIterator = function(collection, kind) {
        this._collection = collection;
        this._kind = kind;
        this._index = 0;
    };

    var ITERATOR_VALUES = 1;
    var ITERATOR_KEYS = 2;
    var ITERATOR_KEYSVALUES = 3;

    if ($$iterator) {
        CollectionIterator.prototype[$$iterator] = function() {
            return this;
        };
    }

    // 使用'for of'便利CollectionIterator的实例时会调用next方法
    CollectionIterator.prototype.next = function() {
        if (this._collection) {
            if (this._index < this.collection.length) {
                var model = this._collection.at(this.index);
                this._index++;
                var value;

                if (this.kind === ITERATOR_VALUES) {
                    value = model;
                } else {
                    var id = this._collection.modelId(model.attributes);

                    if (this._kind === ITERATOR_KEYS) {
                        value = id;
                    } else {
                        value = [id, value];
                    }
                }

                return {
                    value: value,
                    done: false
                };
            }

            this._collection = void 0;
        }

        return {
            value: void 0,
            done: true
        };
    };

    var View = Backbone.View = function(options) {
        this.cid = _.uniqueId('view');
        this.preinitialize.apply(this, arguments);
        // _.pick方法回方法viewOptions列表中options对应的属性
        _.extend(this, _.pick(options, viewOptions));
        this._ensureElement();
        this.initialize.apply(this, arguments);
    };

    var delegateEventSplitter = /^(\S+)\s*(.*)$/;

    var viewOptions = ['model', 'collection', 'el', 'attributes', 'className', 'tagName', 'events'];

    _.extend(View.prototype, Events, {
        tagName: 'div',
        // 从this.$el的子节点从寻找元素
        $: function(selector) {
            return this.$el.find(selector);
        },
        preinitialize: function() {},
        initialize: function() {},
        render: function() {
            return this;
        },
        // 从DOM中移除自身
        // 并且移除监听对象
        remove: function() {
            this._removeElement();
            this.stopListening();
            return this;
        },
        // 从DOM中移除自身
        _removeElement: function() {
            this.$el.remove();
        },
        setElement: function(element) {
            this.undelegateEvents();
            this._setElement(element);
            this.delegateEvents();
            return this;
        },
        // this.$el是一个jQuery对象
        // this.el是一个DOM对象
        _setElement: function(el) {
            this.$el = el instanceof Backbone.$ ? el : Backbone.$(el);
            this.el = this.$el[0];
        },
        // 派发事件
        delegateEvents: function(events) {
            events || (events = _.result(this, 'events'));

            if (!events) {
                return this;
            }

            this.undelegateEvents();

            for (var key in events) {
                var method = events[key];

                if (_.isFunction(method)) {
                    method = this[method];
                }

                if (!method) {
                    continue;
                }

                var match = key.match(delegateEventSplitter);
                this.delegate(match[1], match[2], _.bind(method), this);
            }

            return this;
        },
        // 事件委托
        // select上的事件会冒泡到this.$el上
        delegate: function(eventName, selector, listener) {
            this.$el.on(eventName + '.delegateEvents' + this.cid, selector, listener);
            return this;
        },
        // 删除指定命名空间上的所有事件
        undelegateEvents: function() {
            // 删除事件
            if (this.$el) {
                this.$el.off('.delegateEvents' + this.cid);
            }

            return this;
        },
        // 删除指定命名空间上的指定事件
        undelegate: function(eventName, selector, listener) {
            this.$el.off(eventName + '.delegateEvents' + this.cid, selector, listener);
            return this;
        },
        // 根据标签名创建元素
        _createElement: function(tagName) {
            return document.createElement(tagName);
        },
        // 确保元素存在
        _ensureElement: function() {
            if (!this.el) {
                var attrs = _.extend({}, _.result(this, 'attributes'));

                if (this.id) {
                    attrs.id = _.result(this, 'id');
                }

                if (this.className) {
                    attrs['class'] = _.result(this, 'className');
                }

                this.setElement(this._createElement(_.result(this, 'className')));
                this._setAttribues(attrs);
            } else {
                this.setElement(_.result(this, 'el'));
            }
        },
        // 设置属性
        _setAttribues: function(attributes) {
            this.$el.attr(attributes);
        }
    });

    var addMethod = function(base, length, method, attribute) {
        switch (length) {
            case 1: return function() {
                return base[method](this[attribute]);
            };
            case 2: return function(value) {
                return base[method](this[attribute], value);
            };
            case 3: return function(iteratee, context) {
                return base[method](this[attribute], cb(iteratee, this), context);
            };
            case 4: return function(iteratee, defaultVal, context) {
                return base[method](this[attribute], cb(iteratee, this), defaultVal, context);
            };
            default: return function() {
                var args = slice.call(arguments);
                args.unshift(this[attribute]);
                return base[method].apply(base, args);
            };
        }
    };

    var addUnderscoreMethods = function(Class, base, methods, attribute) {
        _.each(methods, function(length, method) {
            if (base[method]) {
                Class.prototype[method] = addMethod(base, length, method, attribute);
            }
        });
    };

    var cb = function(iteratee, instance) {
        if (_.isFunction(iteratee)) {
            return iteratee;
        }

        if (_.isObject(iteratee) && !instance._isModel(iteratee)) {
            modelMatcher(iteratee);
        }

        if (_.isString(iteratee)) {
            return function(model) {
                return model.get(iteratee);
            };
        }

        return iteratee;
    };

    var modelMatcher = function(attrs) {
        var matcher = _.matches(attrs);

        return function(model) {
            matcher(model.attributes);
        };
    };

    // underscore中要添加到Collection中的方法
    var collectionMethods = {
        forEach: 3, each: 3, map: 3, collect: 3, reduce: 0,
        foldl: 0, inject: 0, reduceRight: 0, foldr: 0, find: 3, detect: 3, filter: 3,
        select: 3, reject: 3, every: 3, all: 3, some: 3, any: 3, include: 3, includes: 3,
        contains: 3, invoke: 0, max: 3, min: 3, toArray: 1, size: 1, first: 3,
        head: 3, take: 3, initial: 3, rest: 3, tail: 3, drop: 3, last: 3,
        without: 0, difference: 0, indexOf: 3, shuffle: 1, lastIndexOf: 3,
        isEmpty: 1, chain: 1, sample: 3, partition: 3, groupBy: 3, countBy: 3,
        sortBy: 3, indexBy: 3, findIndex: 3, findLastIndex: 3
    };

    // underscore中要添加到Model中的方法
    // key代表方法 value代表接受的参数个数
    var modelMethods = {
        keys: 1, values: 1, pairs: 1,
        invert: 1, pick: 1, omit: 0, 
        chain: 1, isEmpty: 1
    };

    _.each([
        [Collection, collectionMethods, 'models'],
        [Model, modelMethods, 'attributes']
    ], function(config) {
        var Base = config[0],
            methods = config[1],
            attribute = config[2];

        Base.mixin = function(obj) {
            var mappings = _.reduce(_.function(obj), function(memo, name) {
                memo[name] = 0;
                return memo;
            }, {});

            addUnderscoreMethods(Base, obj, mappings, attribute);
        };

        // 把underscore中的方法添加到Collection或者Model中
        addUnderscoreMethods(Base, _, methods, attribute);
    });

    Backbone.sync = function(method, model, options) {
        var type = methodMap(method);

        // 第二个参数将会填充第一个参数中undefined属性
        _.defaults(options || (options = {}), {
            emulateHTTP: Backbone.emulateHTTP,
            emulateJSON: Backbone.emulateJSON
        });

        var params = {
            type: type,
            dataType: 'json'
        };

        if (!options.url) {
            params.url = _.result(model, 'url') || urlError();
        }

        if (options.data == null && model && (method === 'create' || method === 'update' || method === 'patch')) {
            params.contentType = 'application/json';
            params.data = JSON.stringify(options.attrs || model.toJSON(options));
        }

        if (options.emulateJSON) {
            params.contentType = 'application/x-www-form-urlencoded';
            params.data = params.data ? {model: params.data} : {};
        }

        // 在不支持HTTP的服务器上伪造PUT, DELETE, PATCH请求
        if (options.emulateHTTP && (type === 'PUT' || type === 'DELETE' || type === 'PATCH')) {
            params.type = 'POST';

            if (options.emulateJSON) {
                params.data._method = type;
            }

            var beforeSend = options.beforeSend;

            options.beforeSend = function(xhr) {
                // 在发送请求前设置请求头
                // X-HTTP-Method-Override可以覆盖当前HTTP方法
                // 发送真实的HTTP方法名
                xhr.setRequestHeader('X-HTTP-Method-Override', type);

                if (beforeSend) {
                    return beforeSend.apply(this, arguments);
                }
            };
        }

        // 如果不是get请求不需要processData
        if (params.type !== 'GET' && !options.emulateJSON) {
            params.processData = false;
        }

        var error = options.error;

        options.error = function(xhr, textStatus, errorThrown) {
            options.textStatus = textStatus;
            options.errorThrown = errorThrown;
            
            if (error) {
                error.call(options.context, xhr, textStatus, errorThrown);
            }
        };

        // 使用jQuery的ajax函数发请求
        var xhr = options.xhr = Backbone.ajax(_.extend(params, options));
        model.trigger('request', model, xhr, options);
        return xhr;
    };

    // 方法名的映射表
    var methodMap = {
        'create': 'POST',
        'update': 'PUT',
        'patch': 'PATCH',
        'delete': 'DELETE',
        'read': 'GET'
    };

    // ajax函数
    Backbone.ajax = function() {
        return Backbone.$.ajax.apply(Backbone.$, arguments);
    };

    var Router = Backbone.Router = function(options) {
        options || (options = {});
        this.preinitialize.apply(this, arguments);

        if (options.routes) {
            this.routes = options.routes;
        }

        this._bindRoutes();
        this.initialize.apply(this, arguments);
    };

    var optionalParam = /\((.*?)\)/g;
    var namedParam = /(\(\?)?:\w+)/g;
    var splatParam = /\*\w+/g;
    var escapeRegExp = /[\-{}\[\]+?.,\\\^$|#\s]/g;

    _.extend(Router.prototype, Events, {
        preinitialize: function() {},
        initialize: function() {},
        route: function(route, name, callback) {
            if (!_.isRegExp(route)) {
                route = this._routeToRegExp(route);
            }

            if (_.isFunction(name)) {
                callback = name;
                name = '';
            }

            if (!callback) {
                callback = this[name];
            }

            var router = this;

            Backbone.history.route(route, function(fragment) {
                var args = router._extractParameters(route, fragment);

                if (router.execute(callback, args, name) !== false) {
                    router.trigger.apply(router, ['route:' + name].concat(args));
                    router.trigger('route', name, args);
                    Backbone.history.trigger('route', router, name, args);
                }
            });
        },
        execute: function(callback, args, name) {
            if (callback) {
                callback.apply(this, args);
            }
        },
        navigate: function(fragment, options) {
            Backbone.history.navigate(fragment, options);
            return this;
        },
        _bindRoutes: function() {
            if (!this.routes) {
                return;
            }

            this.routes = _.result(this, 'routes');
            var route, routes = _.keys(this.routes);

            while ((route = routes.pop()) != null) {
                this.route(route, this.routes[route]);
            }
        },
        _routeToRegExp: function(route) {
            route = route.replace(escapeRegExp, '\\$&')
                         .replace(optionalParam, '(?:$1)?')
                         .replace(namedParam, function(match, optional) {
                             return optional ? match : '([^/?]+)';
                         })
                         .replace(splatParam, '([^?]*?)');

            return new RegExp('^' + route + '(?:\\?([\\s\\S]*))?$');
        },
        _extractParameters: function(route, fragment) {
            var params = route.exec(fragment).slice(1);

            return _.map(params, function(param, i) {
                if (i === params.length) {
                    return param || null;
                };

                return param ? decodeURIComponent(param) : null;
            });
        }
    });

    var History = Backbone.History = function() {
        this.handlers = [];
        this.checkUrl = _.bind(this.checkUrl, this);

        if (typeof window !== 'undefined') {
            this.location = window.location;
            this.history = window.history;
        }
    }

    var routeStripper = /^[#\/]|\s+$/g

    var rootStripper = /^\/+|\/+$/g;

    var pathStripper = /#.*$/;

    History.started = false;

    _.extend(History.prototype, Events, {
        interval: 50,
        atRoot: function() {
            var path = this.location.pathname.replace(/[^\/]/, '$&');
            return path === this.root && !this.getSearch();
        },
        matchRoot: function() {
            var path = this.decodeFragment(this.location.pathname);
            var rootPath = path.slice(0, this.root.length - 1) + '/';
            return rootPath === this.root;
        },
        decodeFragment: function(fragment) {
            return decodeURI(fragment.replace(/%25/g, '%2525'));
        },
        getSearch: function() {
            var match = this.location.href.replace(/#.*/, '').match(/\?.+/);
            return match ? match[0] : '';
        },
        getHash: function(window) {
            var match = (window || this).location.href.match(/#(.*)$/);
            return match ? match[1] : '';
        },
        getPath: function() {
            var path = this.decodeFragment(
                this.location.pathname + this.getSearch()
            ).slice(this.root.length - 1);
            
            return path.charAt(0) === '/' ? path.slice(1) : path;
        },
        getFragment: function(fragment) {
            if (fragment == null) {
                if (this._usePushState || !this._wantsHashChange) {
                    fragment = this.getPath();
                } else {
                    fragment = this.getHash();
                }
            }

            return fragment.replace(routeStripper, '');
        },
        start: function(options) {
            if (History.started) {
                throw new Error('Backbone.history has already been started');
            }

            History.started = true;

            this.options = _.extend({root: '/'}, this.options, options);
            this.root = this.options.root;
            this._wantsHashChange = this.options.hashChange !== false;
            this._hasHashChange = 'onhashChange' in window && (document.documentMode === void 0 || document.documentMode > 7);
            this._useHashChange = this._wantsHashChange && this._hasHashChange;
            this._wanstPushState = !!this.options.pushState;
            this._hasPushState = !!(this.history && this.history.pushState);
            this._usePushState = this._wantsHashChange && this._hasPushState;
            this.fragment = this.getFragment();

            this.root = ('/' + this.root + '/').replace(rootStripper, '/');

            if (this._wantsHashChange && this._wanstPushState) {
                if (!this._hasPushState && !this.atRoot()) {
                    var rootPath = this.root.slice(0, -1) || '/';
                    this.location.replace(rootPath + '#' + this.getPath());
                    return true;
                } else if (this._hasPushState && this.atRoot()) {
                    this.navigate(this.getHash(), {replace: true});
                }
            }

            if (!this._hasHashChange && this._wantsHashChange && !this._usePushState) {
                this.iframe = document.createElement('iframe');
                this.iframe.src = 'javascript:0';
                this.iframe.style.display = 'none';
                this.iframe.tabIndex = -1;
                
                var body = document.body;
                var iWindow = body.insertBefore(this.iframe, body.firstChild).contentWindow;
                iWindow.document.open();
                iWindow.document.close();
                iWindow.location.hash = '#' + this.fragment;
            }

            var addEventListener = window.addEventListener || function(eventName, listener) {
                return attachEvent('on' + eventName, listener);
            };

            if (this._usePushState) {
                addEventListener('popstate', this.checkUrl, false);
            } else if (this._useHashChange && !this.iframe) {
                addEventListener('hashchange', this.checkUrl, false);
            } else if (this._wantsHashChange) {
                this._checkUrlInterval = setInterval(this.checkUrl, this.interval);
            }

            if (!this.options.slient) {
                return this.loadUrl();
            }
        },
        stop: function() {
            var removeEventListener = window.removeEventListener || function(eventName, listener) {
                return detachEvent('on' + eventName, listener);
            };

            if (this._usePushState) {
                removeEventListener('popstate', this.checkUrl, false);
            } else if (this._useHashChange && !this.iframe) {
                removeEventListener('hashchange', this.checkUrl, false);
            }

            if (this.iframe) {
                document.body.removeChild(this.iframe);
                this.iframe = null;
            }

            if (this._checkUrlInterval) {
                clearInterval(this._checkUrlInterval);
            }

            History.started = false;
        },
        route: function(route, callback) {
            this.handlers.unshift({route: route, callback: callback});
        },
        checkUrl: function(e) {
            var current = this.getFragment();

            if (current === this.fragment && this.iframe) {
                current = this.getHash(this.iframe.contentWindow);
            }

            if (current === this.fragment) {
                return false;
            }

            if (iframe) {
                this.navigate(current);
            }

            this.loadUrl();
        },
        loadUrl: function(fragment) {
            if (!this.matchRoot()) {
                return false;
            }

            fragment = this.fragment = this.getFragment(fragment);
            
            return _.some(this.handlers, function(handler) {
                if (handler.route.test(fragment)) {
                    handler.callback(fragment);
                    return true;
                }
            });
        },
        navigate: function(fragment, options) {
            if (!History.started) {
                return false;
            }

            if (!options || options === true) {
                options = {
                    trigger: !!options
                };
            }

            fragment = this.getFragment(fragment || '');
            var rootPath = this.root;

            if (fragment === '' || fragment.charAt(0) === '?') {
                rootPath = rootPath.slice(0, -1) || '/';
            }

            var url = rootPath + fragment;
            fragment = fragment.replace(pathStripper, '');
            var decodeFragment = this.decodeFragment(fragment);

            if (this.fragment === decodeFragment) {
                return;
            }

            this.fragment = decodeFragment;

            if (this._usePushState) {
                this.history[options.replace ? 'replaceState' : 'pushState']({}, document.title, url);
            } else if (this._wantsHashChange) {
                this._updateHash(this.location, fragment, options.replace);

                if (this.iframe && fragment !== this.getHash(this.iframe.contentWindow)) {
                    var iWindow = this.iframe.contentWindow;

                    if (!option.replace) {
                        iWindow.document.open();
                        iWindow.document.close();
                    }

                    this._updateHash(iWindow.location, fragment, options.replace);
                }
            } else {
                return this.location.assign(url);
            }

            if (options.trigger) {
                return this.loadUrl(fragment);
            }
        },
        _updateHash: function(location, fragment, replace) {
            if (replace) {
                var href = location.href.replace(/(javascript:|#)/, '');
                location.replace(href + '#' + fragment);
            } else {
                location.hash = '#' + fragment;
            }
        }
    });

    Backbone.history = new History;

    var extend = function(protoProps, staticProps) {
        var parent = this;
        var child;

        if (protoProps && _.has(protoProps, 'constructor')) {
            child = protoProps.constructor;
        } else {
            child = function() {
                return parent.apply(this, arguments);
            };
        }

        _.extend(child, parent, staticProps);

        child.prototype = _.create(parent.prototype, protoProps);
        child.prototype.constructor = child;
        child.__super__ = parent.prototype;
        
        return child;
    };

    Model.extend = Collection.extend = Router.extend = View.extend = History.extend = extend;

    var urlError = function() {
        throw new Error('A "url" property or function must be specified');
    };

    var wrapError = function(model, options) {
        var error = options.error;
        
        options.error = function(resp) {
            if (error) {
                error.call(options.context, model, resp, options);
            }

            model.trigger('error', model, resp, options);
        };
    };

    return Backbone;
});
