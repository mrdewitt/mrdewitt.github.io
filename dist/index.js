(function() {

  // Ensure that the `unresolved` attribute added by the WebComponents polyfills
  // is removed. This is done as a convenience so users don't have to remember
  // to do so themselves. This attribute provides FOUC prevention when
  // native Custom Elements is not available.

  function resolve() {
    document.body.removeAttribute('unresolved');
  }

  if (window.WebComponents) {
    addEventListener('WebComponentsReady', resolve);
  } else {
    if (document.readyState === 'interactive' || document.readyState === 'complete') {
      resolve();
    } else {
      addEventListener('DOMContentLoaded', resolve);
    }
  }

})();
window.Polymer = {
    Settings: (function() {
      // NOTE: Users must currently opt into using ShadowDOM. They do so by doing:
      // Polymer = {dom: 'shadow'};
      // TODO(sorvell): Decide if this should be auto-use when available.
      // TODO(sorvell): if SD is auto-use, then the flag above should be something
      // like: Polymer = {dom: 'shady'}

      // via Polymer object
      var user = window.Polymer || {};

      // via url
      var parts = location.search.slice(1).split('&');
      for (var i=0, o; (i < parts.length) && (o=parts[i]); i++) {
        o = o.split('=');
        o[0] && (user[o[0]] = o[1] || true);
      }

      var wantShadow = (user.dom === 'shadow');
      var hasShadow = Boolean(Element.prototype.createShadowRoot);
      var nativeShadow = hasShadow && !window.ShadowDOMPolyfill;
      var useShadow = wantShadow && hasShadow;

      var hasNativeImports = Boolean('import' in document.createElement('link'));
      var useNativeImports = hasNativeImports;

      var useNativeCustomElements = (!window.CustomElements ||
        window.CustomElements.useNative);

      return {
        wantShadow: wantShadow,
        hasShadow: hasShadow,
        nativeShadow: nativeShadow,
        useShadow: useShadow,
        useNativeShadow: useShadow && nativeShadow,
        useNativeImports: useNativeImports,
        useNativeCustomElements: useNativeCustomElements
      };
    })()
  };
(function() {

    // until ES6 modules become standard, we follow Occam and simply stake out
    // a global namespace

    // Polymer is a Function, but of course this is also an Object, so we
    // hang various other objects off of Polymer.*

    var userPolymer = window.Polymer;

    window.Polymer = function(prototype) {
      // if input is a `class` (aka a function with a prototype), use the prototype
      // remember that the `constructor` will never be called
      if (typeof prototype === 'function') {
        prototype = prototype.prototype;
      }
      // if there is no prototype, use a default empty object
      if (!prototype) {
        prototype = {};
      }
      // desugar the prototype and return a factory object
      var factory = desugar(prototype);
      // Polymer.Base is now chained to factory.prototype, and for IE10 compat
      // this may have resulted in a new prototype being created
      prototype = factory.prototype;
      var options = {
        prototype: prototype
      };
      // NOTE: we're specifically supporting older Chrome versions here 
      // (specifically Chrome 39) that throw when options.extends is undefined.
      if (prototype.extends) {
        options.extends = prototype.extends;
      }
      Polymer.telemetry._registrate(prototype);
      document.registerElement(prototype.is, options);
      return factory;
    };

    var desugar = function(prototype) {
      // Note: need to chain user prototype with the correct type-extended
      // version of Polymer.Base; this is especially important when you can't
      // prototype swizzle (e.g. IE10), since CustomElements uses getPrototypeOf
      var base = Polymer.Base;
      if (prototype.extends) {
        base = Polymer.Base._getExtendedPrototype(prototype.extends);
      }
      prototype = Polymer.Base.chainObject(prototype, base);
      prototype.registerCallback();
      return prototype.constructor;
    };

    window.Polymer = Polymer;

    if (userPolymer) {
      for (var i in userPolymer) {
        Polymer[i] = userPolymer[i];
      }
    }

    Polymer.Class = desugar;

  })();

  /*
  // Raw usage
  [ctor =] Polymer.Class(prototype);
  document.registerElement(name, ctor);

  // Simplified usage
  [ctor = ] Polymer(prototype);
  */

  // telemetry: statistics, logging, and debug

  Polymer.telemetry = {
    registrations: [],
    _regLog: function(prototype) {
      console.log('[' + prototype.is + ']: registered')
    },
    _registrate: function(prototype) {
      this.registrations.push(prototype);
      Polymer.log && this._regLog(prototype);
    },
    dumpRegistrations: function() {
      this.registrations.forEach(this._regLog);
    }
  };
// a tiny bit of sugar for `document.currentScript.ownerDocument`
  Object.defineProperty(window, 'currentImport', {
    enumerable: true,
    configurable: true,
    get: function() {
      return (document._currentScript || document.currentScript).ownerDocument;
    }
  });
/*
   * Helper for determining when first render occurs.
   * Call `Polymer.RenderStatus.whenReady(callback)` to be notified when
   * first render occurs or immediately if it has already occured.
   * Note that since HTML Imports are designed to load before rendering, 
   * this call can also be used to guarantee that imports have loaded.
   * This behavior is normalized to function correctly with the HTMLImports
   * polyfill which does not otherwise maintain this rendering guarantee.
   * Querying style and layout data before first render is currently 
   * problematic on some browsers (Blink/Webkit) so this helper can be used
   * to prevent doing so until a safe time.
   */
  Polymer.RenderStatus = {

    _ready: false,

    _callbacks: [],

    whenReady: function(cb) {
      if (this._ready) {
        cb();
      } else {
        this._callbacks.push(cb);
      }
    },

    _makeReady: function() {
      this._ready = true;
      for (var i=0; i < this._callbacks.length; i++) {
        this._callbacks[i]();
      }
      this._callbacks = [];
    },

    _catchFirstRender: function() {
      requestAnimationFrame(function() {
        Polymer.RenderStatus._makeReady();
      });
    },

    _afterNextRenderQueue: [],
    _waitingNextRender: false,

    afterNextRender: function(element, fn, args) {
      this._watchNextRender();
      this._afterNextRenderQueue.push([element, fn, args]);
    },

    _watchNextRender: function() {
      if (!this._waitingNextRender) {
        this._waitingNextRender = true;
        var fn = function() {
          Polymer.RenderStatus._flushNextRender();
        }
        if (!this._ready) {
          this.whenReady(fn);
        } else {
          requestAnimationFrame(fn);
        }
      }
    },

    _flushNextRender: function() {
      var self = this;
      // we want to defer after render until just after the paint.
      setTimeout(function() {
        self._flushRenderCallbacks(self._afterNextRenderQueue);
        self._afterNextRenderQueue = [];
        self._waitingNextRender = false;
      });
    },

    _flushRenderCallbacks: function(callbacks) {
      for (var i=0, h; i < callbacks.length; i++) {
        h = callbacks[i];
        h[1].apply(h[0], h[2] || Polymer.nar);
      };
    }
  };

  if (window.HTMLImports) {
    HTMLImports.whenReady(function() {
      Polymer.RenderStatus._catchFirstRender();
    });
  } else {
    Polymer.RenderStatus._catchFirstRender();
  }

  // NOTE: for bc.
  Polymer.ImportStatus = Polymer.RenderStatus;
  Polymer.ImportStatus.whenLoaded = Polymer.ImportStatus.whenReady;
Polymer.Base = {

    // Used for `isInstance` type checking; cannot use `instanceof` because
    // there is no common Polymer.Base in the prototype chain between type
    // extensions and normal custom elements
    __isPolymerInstance__: true,

    // pluggable features
    // `this` context is a prototype, not an instance
    _addFeature: function(feature) {
      this.extend(this, feature);
    },

    // `this` context is a prototype, not an instance
    registerCallback: function() {
      // TODO(sjmiles): perhaps this method should be called from polymer-bootstrap?
      this._desugarBehaviors(); // abstract
      this._doBehavior('beforeRegister'); // abstract
      this._registerFeatures();  // abstract
      this._doBehavior('registered'); // abstract
    },

    createdCallback: function() {
      Polymer.telemetry.instanceCount++;
      this.root = this;
      this._doBehavior('created'); // abstract
      this._initFeatures(); // abstract
    },

    // reserved for canonical behavior
    attachedCallback: function() {
      // NOTE: workaround for:
      // https://code.google.com/p/chromium/issues/detail?id=516550
      // To allow querying style/layout data in attached, we defer it
      // until we are sure rendering is ready.
      var self = this;
      Polymer.RenderStatus.whenReady(function() {
        self.isAttached = true;
        self._doBehavior('attached'); // abstract
      });
    },

    // reserved for canonical behavior
    detachedCallback: function() {
      this.isAttached = false;
      this._doBehavior('detached'); // abstract
    },

    // reserved for canonical behavior
    attributeChangedCallback: function(name, oldValue, newValue) {
      // TODO(sorvell): consider filtering out changes to host attributes
      // note: this was barely measurable with 3 host attributes.
      this._attributeChangedImpl(name); // abstract
      this._doBehavior('attributeChanged', [name, oldValue, newValue]); // abstract
    },

    _attributeChangedImpl: function(name) {
      this._setAttributeToProperty(this, name);
    },

    /**
     * Copies own properties (including accessor descriptors) from a source
     * object to a target object.
     *
     * @method extend
     * @param {Object} prototype Target object to copy properties to.
     * @param {Object} api Source object to copy properties from.
     * @return {Object} prototype object that was passed as first argument.
     */
    extend: function(prototype, api) {
      if (prototype && api) {
        var n$ = Object.getOwnPropertyNames(api);
        for (var i=0, n; (i<n$.length) && (n=n$[i]); i++) {
          this.copyOwnProperty(n, api, prototype);
        }
      }
      return prototype || api;
    },

    /**
     * Copies props from a source object to a target object.
     *
     * Note, this method uses a simple `for...in` strategy for enumerating
     * properties.  To ensure only `ownProperties` are copied from source
     * to target and that accessor implementations are copied, use `extend`.
     *
     * @method mixin
     * @param {Object} target Target object to copy properties to.
     * @param {Object} source Source object to copy properties from.
     * @return {Object} Target object that was passed as first argument.
     */
    mixin: function(target, source) {
      for (var i in source) {
        target[i] = source[i];
      }
      return target;
    },

    copyOwnProperty: function(name, source, target) {
      var pd = Object.getOwnPropertyDescriptor(source, name);
      if (pd) {
        Object.defineProperty(target, name, pd);
      }
    },

    _log: console.log.apply.bind(console.log, console),
    _warn: console.warn.apply.bind(console.warn, console),
    _error: console.error.apply.bind(console.error, console),
    _logf: function(/* args*/) {
      return this._logPrefix.concat([this.is]).concat(Array.prototype.slice.call(arguments, 0));
    }

  };

  Polymer.Base._logPrefix = (function(){
    var color = window.chrome || (/firefox/i.test(navigator.userAgent));
    return color ? ['%c[%s::%s]:', 'font-weight: bold; background-color:#EEEE00;'] : ['[%s::%s]:'];
  })();

  Polymer.Base.chainObject = function(object, inherited) {
    if (object && inherited && object !== inherited) {
      if (!Object.__proto__) {
        object = Polymer.Base.extend(Object.create(inherited), object);
      }
      object.__proto__ = inherited;
    }
    return object;
  };

  Polymer.Base = Polymer.Base.chainObject(Polymer.Base, HTMLElement.prototype);

  if (window.CustomElements) {
    Polymer.instanceof = CustomElements.instanceof;
  } else {
    Polymer.instanceof = function(obj, ctor) {
      return obj instanceof ctor;
    };
  }

  Polymer.isInstance = function(obj) {
    return Boolean(obj && obj.__isPolymerInstance__);
  };

  // TODO(sjmiles): ad hoc telemetry
  Polymer.telemetry.instanceCount = 0;
(function() {

  var modules = {};
  var lcModules = {};
  var findModule = function(id) {
    return modules[id] || lcModules[id.toLowerCase()];
  };

  /**
   * The `dom-module` element registers the dom it contains to the name given
   * by the module's id attribute. It provides a unified database of dom
   * accessible via any dom-module element. Use the `import(id, selector)`
   * method to locate dom within this database. For example,
   *
   * <dom-module id="foo">
   *   <img src="stuff.png">
   * </dom-module>
   *
   * Then in code in some other location that cannot access the dom-module above
   *
   * var img = document.createElement('dom-module').import('foo', 'img');
   *
   */
  var DomModule = function() {
    return document.createElement('dom-module');
  };

  DomModule.prototype = Object.create(HTMLElement.prototype);

  Polymer.Base.extend(DomModule.prototype, {

    constructor: DomModule,

    createdCallback: function() {
      this.register();
    },

    /**
     * Registers the dom-module at a given id. This method should only be called
     * when a dom-module is imperatively created. For
     * example, `document.createElement('dom-module').register('foo')`.
     * @method register
     * @param {String} id The id at which to register the dom-module.
     */
    register: function(id) {
      var id = id || this.id ||
        this.getAttribute('name') || this.getAttribute('is');
      if (id) {
        this.id = id;
        // store id separate from lowercased id so that
        // in all cases mixedCase id will stored distinctly
        // and lowercase version is a fallback
        modules[id] = this;
        lcModules[id.toLowerCase()] = this;
      }
    },

    /**
     * Retrieves the dom specified by `selector` in the module specified by
     * `id`. For example, this.import('foo', 'img');
     * @method register
     * @param {String} id
     * @param {String} selector
     * @return {Object} Returns the dom which matches `selector` in the module
     * at the specified `id`.
     */
    import: function(id, selector) {
      if (id) {
        var m = findModule(id);
        if (!m) {
          // If polyfilling, a script can run before a dom-module element
          // is upgraded. We force the containing document to upgrade
          // dom-modules and try again to workaround this polyfill limitation.
          forceDomModulesUpgrade();
          m = findModule(id);
        }
        if (m && selector) {
          m = m.querySelector(selector);
        }
        return m;
      }
    }

  });

  // NOTE: HTMLImports polyfill does not
  // block scripts on upgrading elements. However, we want to ensure that
  // any dom-module in the tree is available prior to a subsequent script
  // processing.
  // Therefore, we force any dom-modules in the tree to upgrade when dom-module
  // is registered by temporarily setting CE polyfill to crawl the entire
  // imports tree. (Note: this should only upgrade any imports that have been
  // loaded by this point. In addition the HTMLImports polyfill should be
  // changed to upgrade elements prior to running any scripts.)
  var cePolyfill = window.CustomElements && !CustomElements.useNative;
  document.registerElement('dom-module', DomModule);

  function forceDomModulesUpgrade() {
    if (cePolyfill) {
      var script = document._currentScript || document.currentScript;
      var doc = script && script.ownerDocument || document;
      // find all dom-modules
      var modules = doc.querySelectorAll('dom-module');
      // minimize work by going backwards and stopping if we find an 
      // upgraded module.
      for (var i= modules.length-1, m; (i >=0) && (m=modules[i]); i--) {
        if (m.__upgraded__) {
          return;
        } else {
          CustomElements.upgrade(m);
        }
      }
    }
  }

})();
Polymer.Base._addFeature({

    _prepIs: function() {
      if (!this.is) {
        var module =
          (document._currentScript || document.currentScript).parentNode;
        if (module.localName === 'dom-module') {
          var id = module.id || module.getAttribute('name')
            || module.getAttribute('is');
          this.is = id;
        }
      }
      if (this.is) {
        this.is = this.is.toLowerCase();
      }
    }

  });
/**
   * Automatically extend using objects referenced in `behaviors` array.
   *
   *     someBehaviorObject = {
   *       accessors: {
   *        value: {type: Number, observer: '_numberChanged'}
   *       },
   *       observers: [
   *         // ...
   *       ],
   *       ready: function() {
   *         // called before prototoype's ready
   *       },
   *       _numberChanged: function() {}
   *     };
   *
   *     Polymer({
   *
   *       behaviors: [
   *         someBehaviorObject
   *       ]
   *
   *       ...
   *
   *     });
   *
   * @class base feature: behaviors
   */

  Polymer.Base._addFeature({

    /**
     * Array of objects to extend this prototype with.
     *
     * Each entry in the array may specify either a behavior object or array
     * of behaviors.
     *
     * Each behavior object may define lifecycle callbacks, `properties`,
     * `hostAttributes`, `observers` and `listeners`.
     *
     * Lifecycle callbacks will be called for each behavior in the order given
     * in the `behaviors` array, followed by the callback on the prototype.
     * Additionally, any non-lifecycle functions on the behavior object are
     * mixed into the base prototype, such that same-named functions on the
     * prototype take precedence, followed by later behaviors over earlier
     * behaviors.
     */
    behaviors: [],

    _desugarBehaviors: function() {
      if (this.behaviors.length) {
        this.behaviors = this._desugarSomeBehaviors(this.behaviors);
      }
    },

    _desugarSomeBehaviors: function(behaviors) {
      // iteration 1
      behaviors = this._flattenBehaviorsList(behaviors);
      // iteration 2
      // traverse the behaviors in _reverse_ order (youngest first) because
      // `_mixinBehavior` has _first property wins_ behavior, this is done
      // to optimize # of calls to `_copyOwnProperty`
      for (var i=behaviors.length-1; i>=0; i--) {
        this._mixinBehavior(behaviors[i]);
      }
      return behaviors;
    },

    _flattenBehaviorsList: function(behaviors) {
      var flat = [];
      for (var i=0; i < behaviors.length; i++) {
        var b = behaviors[i];
        if (b instanceof Array) {
          flat = flat.concat(this._flattenBehaviorsList(b));
        }
        // filter out null entries so other iterators don't need to check
        else if (b) {
          flat.push(b);
        } else {
          this._warn(this._logf('_flattenBehaviorsList', 'behavior is null, check for missing or 404 import'));
        }
      }
      return flat;
    },

    _mixinBehavior: function(b) {
      var n$ = Object.getOwnPropertyNames(b);
      for (var i=0, n; (i<n$.length) && (n=n$[i]); i++) {
        if (!Polymer.Base._behaviorProperties[n] && !this.hasOwnProperty(n)) {
          this.copyOwnProperty(n, b, this);
        }
      }
    },

    _prepBehaviors: function() {
      this._prepFlattenedBehaviors(this.behaviors);
    },

    _prepFlattenedBehaviors: function(behaviors) {
      // iteration 3
      // `_prepBehavior` goes in natural order
      // otherwise, it's a tricky detail for implementors of `_prepBehavior`
      for (var i=0, l=behaviors.length; i<l; i++) {
        this._prepBehavior(behaviors[i]);
      }
      // prep our prototype-as-behavior
      this._prepBehavior(this);
    },

    _doBehavior: function(name, args) {
      for (var i=0; i < this.behaviors.length; i++) {
        this._invokeBehavior(this.behaviors[i], name, args);
      }
      this._invokeBehavior(this, name, args);
    },

    _invokeBehavior: function(b, name, args) {
      var fn = b[name];
      if (fn) {
        fn.apply(this, args || Polymer.nar);
      }
    },

    _marshalBehaviors: function() {
      for (var i=0; i < this.behaviors.length; i++) {
        this._marshalBehavior(this.behaviors[i]);
      }
      this._marshalBehavior(this);
    }

  });

  // special properties on behaviors are not mixed in and are instead 
  // either processed specially (e.g. listeners, properties) or available
  // for calling via doBehavior (e.g. created, ready)
  Polymer.Base._behaviorProperties = {
    hostAttributes: true,
    beforeRegister: true,
    registered: true,
    properties: true,
    observers: true,
    listeners: true,
    created: true,
    attached: true,
    detached: true,
    attributeChanged: true,
    ready: true
  };
/**
   * Support `extends` property (for type-extension only).
   *
   * If the mixin is String-valued, the corresponding Polymer module
   * is mixed in.
   *
   *     Polymer({
   *       is: 'pro-input',
   *       extends: 'input',
   *       ...
   *     });
   *
   * Type-extension objects are created using `is` notation in HTML, or via
   * the secondary argument to `document.createElement` (the type-extension
   * rules are part of the Custom Elements specification, not something
   * created by Polymer).
   *
   * Example:
   *
   *     <!-- right: creates a pro-input element -->
   *     <input is="pro-input">
   *
   *     <!-- wrong: creates an unknown element -->
   *     <pro-input>
   *
   *     <script>
   *        // right: creates a pro-input element
   *        var elt = document.createElement('input', 'pro-input');
   *
   *        // wrong: creates an unknown element
   *        var elt = document.createElement('pro-input');
   *     <\script>
   *
   *   @class base feature: extends
   */

  Polymer.Base._addFeature({

    _getExtendedPrototype: function(tag) {
      return this._getExtendedNativePrototype(tag);
    },

    _nativePrototypes: {}, // static

    _getExtendedNativePrototype: function(tag) {
      var p = this._nativePrototypes[tag];
      if (!p) {
        var np = this.getNativePrototype(tag);
        p = this.extend(Object.create(np), Polymer.Base);
        this._nativePrototypes[tag] = p;
      }
      return p;
    },

    /**
     * Returns the native element prototype for the tag specified.
     *
     * @method getNativePrototype
     * @param {string} tag  HTML tag name.
     * @return {Object} Native prototype for specified tag.
    */
    getNativePrototype: function(tag) {
      // TODO(sjmiles): sad necessity
      return Object.getPrototypeOf(document.createElement(tag));
    }

  });
/**
   * Generates a boilerplate constructor.
   * 
   *     XFoo = Polymer({
   *       is: 'x-foo'
   *     });
   *     ASSERT(new XFoo() instanceof XFoo);
   *  
   * You can supply a custom constructor on the prototype. But remember that 
   * this constructor will only run if invoked **manually**. Elements created
   * via `document.createElement` or from HTML _will not invoke this method_.
   * 
   * Instead, we reuse the concept of `constructor` for a factory method which 
   * can take arguments. 
   * 
   *     MyFoo = Polymer({
   *       is: 'my-foo',
   *       constructor: function(foo) {
   *         this.foo = foo;
   *       }
   *       ...
   *     });
   * 
   * @class base feature: constructor
   */

  Polymer.Base._addFeature({

    // registration-time

    _prepConstructor: function() {
      // support both possible `createElement` signatures
      this._factoryArgs = this.extends ? [this.extends, this.is] : [this.is];
      // thunk the constructor to delegate allocation to `createElement`
      var ctor = function() { 
        return this._factory(arguments); 
      };
      if (this.hasOwnProperty('extends')) {
        ctor.extends = this.extends; 
      }
      // ensure constructor is set. The `constructor` property is
      // not writable on Safari; note: Chrome requires the property
      // to be configurable.
      Object.defineProperty(this, 'constructor', {value: ctor, 
        writable: true, configurable: true});
      ctor.prototype = this;
    },

    _factory: function(args) {
      var elt = document.createElement.apply(document, this._factoryArgs);
      if (this.factoryImpl) {
        this.factoryImpl.apply(elt, args);
      }
      return elt;
    }

  });
/**
   * Define property metadata.
   *
   *     properties: {
   *       <property>: <Type || Object>,
   *       ...
   *     }
   *
   * Example:
   *
   *     properties: {
   *       // `foo` property can be assigned via attribute, will be deserialized to
   *       // the specified data-type. All `properties` properties have this behavior.
   *       foo: String,
   *
   *       // `bar` property has additional behavior specifiers.
   *       //   type: as above, type for (de-)serialization
   *       //   notify: true to send a signal when a value is set to this property
   *       //   reflectToAttribute: true to serialize the property to an attribute
   *       //   readOnly: if true, the property has no setter
   *       bar: {
   *         type: Boolean,
   *         notify: true
   *       }
   *     }
   *
   * By itself the properties feature doesn't do anything but provide property
   * information. Other features use this information to control behavior.
   *
   * The `type` information is used by the `attributes` feature to convert
   * String values in attributes to typed properties. The `bind` feature uses
   * property information to control property access.
   *
   * Marking a property as `notify` causes a change in the property to
   * fire a non-bubbling event called `<property>-changed`. Elements that
   * have enabled two-way binding to the property use this event to
   * observe changes.
   *
   * `readOnly` properties have a getter, but no setter. To set a read-only
   * property, use the private setter method `_set_<property>(value)`.
   *
   * @class base feature: properties
   */

  // null object
  Polymer.nob = Object.create(null);

  Polymer.Base._addFeature({

    /*
     * Object containing property configuration data, where keys are property
     * names and values are descriptor objects that configure Polymer features
     * for the property.  Valid fields in the property descriptor object are
     * as follows:
     *
     * * `type` - used to determine how to deserialize attribute value strings
     *    to JS properties.  By convention, this field takes a JS constructor
     *    for the type, such as `String` or `Boolean`.
     * * `value` - default value for the property.  The value may either be a
     *    primitive value, or a function that returns a value (which should be
     *    used for initializing Objects and Arrays to avoid shared objects on
     *    instances).
     * * `notify` - when `true`, configures the property to fire a non-bubbling
     *    event called `<property>-changed` for each change to the property.
     *    Elements that have enabled two-way binding to the property use this
     *    event to observe changes.
     * * `readOnly` - when `true` configures the property to have a getter, but
     *    no setter. To set a read-only property, use the private setter method
     *    `_set_<property>(value)`.
     * * `reflectToAttribute` - when `true` configures the property value to
     *    be serialized to a string and reflected to the attribute each time
     *    it changes.  This can impact performance, so it should be used
     *    only when reflecting the attribute value is important.
     * * `observer` - indicates the name of a function that should be called
     *    each time the property changes. `e.g.: `observer: 'valueChanged'
     * * `computed` - configures the property to be computed by a computing
     *    function each time one or more dependent properties change.
     *    `e.g.: `computed: 'computeValue(prop1, prop2)'
     *
     * Note: a shorthand may be used for the object descriptor when only the
     * type needs to be specified by using the type as the descriptor directly.
     */
    properties: {
    },

    /**
     * Returns a property descriptor object for the property specified.
     *
     * This method allows introspecting the configuration of a Polymer element's
     * properties as configured in its `properties` object.  Note, this method
     * normalizes shorthand forms of the `properties` object into longhand form.
     *
     * @method getPropertyInfo
     * @param {string} property Name of property to introspect.
     * @return {Object} Property descriptor for specified property.
    */
    // TODO(sorvell): This function returns the first property object found
    // and this is not the property info Polymer acts on for readOnly or type
    // This api should be combined with _propertyInfo.
    getPropertyInfo: function(property) {
      var info = this._getPropertyInfo(property, this.properties);
      if (!info) {
        for (var i=0; i < this.behaviors.length; i++) {
          info = this._getPropertyInfo(property, this.behaviors[i].properties);
          if (info) {
            return info;
          }
        };
      }
      return info || Polymer.nob;
    },

    _getPropertyInfo: function(property, properties) {
      var p = properties && properties[property];
      if (typeof(p) === 'function') {
        p = properties[property] = {
          type: p
        };
      }
      // Let users determine whether property was defined without null check
      if (p) {
        p.defined = true;
      }
      return p;
    },

    // union properties, behaviors.properties, and propertyEffects
    _prepPropertyInfo: function() {
      this._propertyInfo = {};
      for (var i=0, p; i < this.behaviors.length; i++) {
        this._addPropertyInfo(this._propertyInfo, this.behaviors[i].properties);
      }
      this._addPropertyInfo(this._propertyInfo, this.properties);
      this._addPropertyInfo(this._propertyInfo, this._propertyEffects);
    },

    // list of propertyInfo with {readOnly, type, attribute}
    _addPropertyInfo: function(target, source) {
      if (source) {
        var t, s;
        for (var i in source) {
          t = target[i];
          s = source[i];
          // optimization: avoid info'ing properties that are protected and
          // not read only since they are not needed for attributes or
          // configuration.
          if (i[0] === '_' && !s.readOnly) {
            continue;
          }
          if (!target[i]) {
            target[i] = {
              type: typeof(s) === 'function' ? s : s.type,
              readOnly: s.readOnly,
              attribute: Polymer.CaseMap.camelToDashCase(i)
            }
          } else {
            if (!t.type) {
              t.type = s.type;
            }
            if (!t.readOnly) {
              t.readOnly = s.readOnly;
            }
          }
        }
      }
    },

  });
Polymer.CaseMap = {

    _caseMap: {},

    dashToCamelCase: function(dash) {
      var mapped = Polymer.CaseMap._caseMap[dash];
      if (mapped) {
        return mapped;
      }
      // TODO(sjmiles): is rejection test actually helping perf?
      if (dash.indexOf('-') < 0) {
        return Polymer.CaseMap._caseMap[dash] = dash;
      }
      return Polymer.CaseMap._caseMap[dash] = dash.replace(/-([a-z])/g, 
        function(m) {
          return m[1].toUpperCase(); 
        }
      );
    },

    camelToDashCase: function(camel) {
      var mapped = Polymer.CaseMap._caseMap[camel];
      if (mapped) {
        return mapped;
      }
      return Polymer.CaseMap._caseMap[camel] = camel.replace(/([a-z][A-Z])/g, 
        function (g) { 
          return g[0] + '-' + g[1].toLowerCase() 
        }
      );
    }

  };
/**
   * Support for `hostAttributes` property.
   *
   *     hostAttributes: {
   *       'aria-role': 'button',
   *       tabindex: 0
   *     }
   *
   * `hostAttributes` is an object containing attribute names as keys and static values
   * to set to attributes when the element is created.
   *
   * Support for mapping attributes to properties.
   *
   * Properties that are configured in `properties` with a type are mapped
   * to attributes.
   *
   * A value set in an attribute is deserialized into the specified
   * data-type and stored into the matching property.
   *
   * Example:
   *
   *     properties: {
   *       // values set to index attribute are converted to Number and propagated
   *       // to index property
   *       index: Number,
   *       // values set to label attribute are propagated to index property
   *       label: String
   *     }
   *
   * Types supported for deserialization:
   *
   * - Number
   * - Boolean
   * - String
   * - Object (JSON)
   * - Array (JSON)
   * - Date
   *
   * This feature implements `attributeChanged` to support automatic
   * propagation of attribute values at run-time. If you override
   * `attributeChanged` be sure to call this base class method
   * if you also want the standard behavior.
   *
   * @class base feature: attributes
   */

  Polymer.Base._addFeature({

    // prototype time
    _addHostAttributes: function(attributes) {
      if (!this._aggregatedAttributes) {
        this._aggregatedAttributes = {};
      }
      if (attributes) {
        this.mixin(this._aggregatedAttributes, attributes);
      }
    },

    // instance time
    _marshalHostAttributes: function() {
      if (this._aggregatedAttributes) {
        this._applyAttributes(this, this._aggregatedAttributes);
      }
    },

    /* apply attributes to node but avoid overriding existing values */
    _applyAttributes: function(node, attr$) {
      for (var n in attr$) {
        // NOTE: never allow 'class' to be set in hostAttributes
        // since shimming classes would make it work
        // inconsisently under native SD
        if (!this.hasAttribute(n) && (n !== 'class')) {
          var v = attr$[n];
          this.serializeValueToAttribute(v, n, this);
        }
      }
    },

    _marshalAttributes: function() {
      this._takeAttributesToModel(this);
    },

    _takeAttributesToModel: function(model) {
      if (this.hasAttributes()) {
        for (var i in this._propertyInfo) {
          var info = this._propertyInfo[i];
          if (this.hasAttribute(info.attribute)) {
            this._setAttributeToProperty(model, info.attribute, i, info);
          }
        }
      }
    },

    _setAttributeToProperty: function(model, attribute, property, info) {
      // Don't deserialize back to property if currently reflecting
      if (!this._serializing) {
        var property = property || Polymer.CaseMap.dashToCamelCase(attribute);
        // fallback to property lookup
        // TODO(sorvell): check for _propertyInfo existence because of dom-bind
        info = info || (this._propertyInfo && this._propertyInfo[property]);
        if (info && !info.readOnly) {
          var v = this.getAttribute(attribute);
          model[property] = this.deserialize(v, info.type);
        }
      }
    },

    _serializing: false,

    /**
     * Serializes a property to its associated attribute.
     *
     * Generally users should set `reflectToAttribute: true` in the
     * `properties` configuration to achieve automatic attribute reflection.
     *
     * @method reflectPropertyToAttribute
     * @param {string} property Property name to reflect.
     * @param {*=} attribute Attribute name to reflect.
     * @param {*=} value Property value to refect.
     */
    reflectPropertyToAttribute: function(property, attribute, value) {
      this._serializing = true;
      value = (value === undefined) ? this[property] : value;
      this.serializeValueToAttribute(value,
        attribute || Polymer.CaseMap.camelToDashCase(property));
      this._serializing = false;
    },

    /**
     * Sets a typed value to an HTML attribute on a node.
     *
     * This method calls the `serialize` method to convert the typed
     * value to a string.  If the `serialize` method returns `undefined`,
     * the attribute will be removed (this is the default for boolean
     * type `false`).
     *
     * @method serializeValueToAttribute
     * @param {*} value Value to serialize.
     * @param {string} attribute Attribute name to serialize to.
     * @param {Element=} node Element to set attribute to (defaults to this).
     */
    serializeValueToAttribute: function(value, attribute, node) {
      var str = this.serialize(value);
      // TODO(kschaaf): Consider enabling under a flag
      // if (str && str.length > 250) {
      //   this._warn(this._logf('serializeValueToAttribute',
      //     'serializing long attribute values can lead to poor performance', this));
      // }
      node = node || this;
      if (str === undefined) {
        node.removeAttribute(attribute);
      } else {
        node.setAttribute(attribute, str);
      }
    },

    /**
     * Converts a string to a typed value.
     *
     * This method is called by Polymer when reading HTML attribute values to
     * JS properties.  Users may override this method on Polymer element
     * prototypes to provide deserialization for custom `type`s.  Note,
     * the `type` argument is the value of the `type` field provided in the
     * `properties` configuration object for a given property, and is
     * by convention the constructor for the type to deserialize.
     *
     * Note: The return value of `undefined` is used as a sentinel value to
     * indicate the attribute should be removed.
     *
     * @method deserialize
     * @param {string} value Attribute value to deserialize.
     * @param {*} type Type to deserialize the string to.
     * @return {*} Typed value deserialized from the provided string.
     */
    deserialize: function(value, type) {
      switch (type) {
        case Number:
          value = Number(value);
          break;

        case Boolean:
          value = (value !== null);
          break;

        case Object:
          try {
            value = JSON.parse(value);
          } catch(x) {
            // allow non-JSON literals like Strings and Numbers
          }
          break;

        case Array:
          try {
            value = JSON.parse(value);
          } catch(x) {
            value = null;
            console.warn('Polymer::Attributes: couldn`t decode Array as JSON');
          }
          break;

        case Date:
          value = new Date(value);
          break;

        case String:
        default:
          break;
      }
      return value;
    },

    /**
     * Converts a typed value to a string.
     *
     * This method is called by Polymer when setting JS property values to
     * HTML attributes.  Users may override this method on Polymer element
     * prototypes to provide serialization for custom types.
     *
     * @method serialize
     * @param {*} value Property value to serialize.
     * @return {string} String serialized from the provided property value.
     */
    serialize: function(value) {
      switch (typeof value) {
        case 'boolean':
          return value ? '' : undefined;

        case 'object':
          if (value instanceof Date) {
            return value;
          } else if (value) {
            try {
              return JSON.stringify(value);
            } catch(x) {
              return '';
            }
          }

        default:
          return value != null ? value : undefined;
      }
    }

  });
Polymer.version = 'master';
Polymer.Base._addFeature({

    _registerFeatures: function() {
      // identity
      this._prepIs();
      // shared behaviors
      this._prepBehaviors();
      // factory
      this._prepConstructor();
      // fast access to property info
      this._prepPropertyInfo();
    },

    _prepBehavior: function(b) {
      this._addHostAttributes(b.hostAttributes);
    },

    _marshalBehavior: function(b) {
    },

    _initFeatures: function() {
      // install host attributes
      this._marshalHostAttributes();
      // acquire behaviors
      this._marshalBehaviors();
    }

  });
/**
   * Automatic template management.
   *
   * The `template` feature locates and instances a `<template>` element
   * corresponding to the current Polymer prototype.
   *
   * The `<template>` element may be immediately preceeding the script that
   * invokes `Polymer()`.
   *
   * @class standard feature: template
   */

  Polymer.Base._addFeature({

    _prepTemplate: function() {
      // locate template using dom-module
      if (this._template === undefined) {
        this._template = Polymer.DomModule.import(this.is, 'template');
      }
      // stick finger in footgun
      if (this._template && this._template.hasAttribute('is')) {
        this._warn(this._logf('_prepTemplate', 'top-level Polymer template ' +
          'must not be a type-extension, found', this._template,
          'Move inside simple <template>.'));
      }
      // bootstrap the template if it has not already been
      if (this._template && !this._template.content &&
          window.HTMLTemplateElement && HTMLTemplateElement.decorate) {
        HTMLTemplateElement.decorate(this._template);
      }
    },

    _stampTemplate: function() {
      if (this._template) {
        // note: root is now a fragment which can be manipulated
        // while not attached to the element.
        this.root = this.instanceTemplate(this._template);
      }
    },

    /**
     * Calls `importNode` on the `content` of the `template` specified and
     * returns a document fragment containing the imported content.
     *
     * @method instanceTemplate
     * @param {HTMLTemplateElement} template HTML template element to instance.
     * @return {DocumentFragment} Document fragment containing the imported
     *   template content.
    */
    instanceTemplate: function(template) {
      var dom =
        document.importNode(template._content || template.content, true);
      return dom;
    }

  });
/**
   * Provides `ready` lifecycle callback which is called parent to child.
   *
   * This can be useful in a number of cases. Here are some examples:
   *
   * Setting a default property value that should have a side effect: To ensure
   * the side effect, an element must set a default value no sooner than
   * `created`; however, since `created` flows child to host, this is before the
   * host has had a chance to set a property value on the child. The `ready`
   * method solves this problem since it's called host to child.
   *
   * Dom distribution: To support reprojection efficiently, it's important to
   * distribute from host to child in one shot. The `attachedCallback` mostly
   * goes in the desired order except for elements that are in dom to start; in
   * this case, all children are attached before the host element. Ready also
   * addresses this case since it's guaranteed to be called host to child.
   *
   * @class standard feature: ready
   */

(function() {

  var baseAttachedCallback = Polymer.Base.attachedCallback;

  Polymer.Base._addFeature({

    _hostStack: [],

    /**
     * Lifecycle callback invoked when all local DOM children of this element
     * have been created and "configured" with data bound from this element,
     * attribute values, or defaults.
     *
     * @method ready
     */
    ready: function() {
    },

    // NOTE: The concept of 'host' is overloaded. There are two different
    // notions:
    // 1. an element hosts the elements in its local dom root.
    // 2. an element hosts the elements on which it configures data.
    // Practially, these notions are almost always coincident.
    // Some special elements like templates may separate them.
    // In order not to over-emphaisize this technical difference, we expose
    // one concept to the user and it maps to the dom-related meaning of host.
    //
    // set this element's `host` and push this element onto the `host`'s
    // list of `client` elements
    // this.dataHost reflects the parent element who manages
    // any bindings for the element.  Only elements originally
    // stamped from Polymer templates have a dataHost, and this
    // never changes
    _registerHost: function(host) {
      // NOTE: The `dataHost` of an element never changes.
      this.dataHost = host = host || 
        Polymer.Base._hostStack[Polymer.Base._hostStack.length-1];
      if (host && host._clients) {
        host._clients.push(this);
      }
      this._clients = null;
      this._clientsReadied = false;
    },

    // establish this element as the current hosting element (allows
    // any elements we stamp to easily set host to us).
    _beginHosting: function() {
      Polymer.Base._hostStack.push(this);
      if (!this._clients) {
        this._clients = [];
      }
    },

    _endHosting: function() {
      // this element is no longer the current hosting element
      Polymer.Base._hostStack.pop();
    },

    _tryReady: function() {
      this._readied = false;
      if (this._canReady()) {
        this._ready();
      }
    },

    _canReady: function() {
      return !this.dataHost || this.dataHost._clientsReadied;
    },

    _ready: function() {
      // extension point
      this._beforeClientsReady();
      if (this._template) {
        // prepare root
        this._setupRoot();
        this._readyClients();
      }
      this._clientsReadied = true;
      this._clients = null;
      // extension point
      this._afterClientsReady();
      this._readySelf();
    },

    _readyClients: function() {
      // logically distribute self
      this._beginDistribute();
      // now fully prepare localChildren
      var c$ = this._clients;
      if (c$) {
        for (var i=0, l= c$.length, c; (i<l) && (c=c$[i]); i++) {
          c._ready();
        }
      }
      // perform actual dom composition
      this._finishDistribute();
      // ensure elements are attached if they are in the dom at ready time
      // helps normalize attached ordering between native and polyfill ce.
      // TODO(sorvell): worth perf cost? ~6%
      // if (!Polymer.Settings.useNativeCustomElements) {
      //   CustomElements.takeRecords();
      // }
    },

    // mark readied and call `ready`
    // note: called localChildren -> host
    _readySelf: function() {
      this._doBehavior('ready');
      this._readied = true;
      if (this._attachedPending) {
        this._attachedPending = false;
        this.attachedCallback();
      }
    },

    // for system overriding
    _beforeClientsReady: function() {},
    _afterClientsReady: function() {},
    _beforeAttached: function() {},

    /**
     * Polymer library implementation of the Custom Elements `attachedCallback`.
     *
     * Note, users should not override `attachedCallback`, and instead should
     * implement the `attached` method on Polymer elements to receive
     * attached-time callbacks.
     *
     * @protected
     */
    attachedCallback: function() {
      if (this._readied) {
        this._beforeAttached();
        baseAttachedCallback.call(this);
      } else {
        this._attachedPending = true;
      }
    }

  });

})();
Polymer.ArraySplice = (function() {
  
  function newSplice(index, removed, addedCount) {
    return {
      index: index,
      removed: removed,
      addedCount: addedCount
    };
  }

  var EDIT_LEAVE = 0;
  var EDIT_UPDATE = 1;
  var EDIT_ADD = 2;
  var EDIT_DELETE = 3;

  function ArraySplice() {}

  ArraySplice.prototype = {

    // Note: This function is *based* on the computation of the Levenshtein
    // "edit" distance. The one change is that "updates" are treated as two
    // edits - not one. With Array splices, an update is really a delete
    // followed by an add. By retaining this, we optimize for "keeping" the
    // maximum array items in the original array. For example:
    //
    //   'xxxx123' -> '123yyyy'
    //
    // With 1-edit updates, the shortest path would be just to update all seven
    // characters. With 2-edit updates, we delete 4, leave 3, and add 4. This
    // leaves the substring '123' intact.
    calcEditDistances: function(current, currentStart, currentEnd,
                                old, oldStart, oldEnd) {
      // "Deletion" columns
      var rowCount = oldEnd - oldStart + 1;
      var columnCount = currentEnd - currentStart + 1;
      var distances = new Array(rowCount);

      // "Addition" rows. Initialize null column.
      for (var i = 0; i < rowCount; i++) {
        distances[i] = new Array(columnCount);
        distances[i][0] = i;
      }

      // Initialize null row
      for (var j = 0; j < columnCount; j++)
        distances[0][j] = j;

      for (var i = 1; i < rowCount; i++) {
        for (var j = 1; j < columnCount; j++) {
          if (this.equals(current[currentStart + j - 1], old[oldStart + i - 1]))
            distances[i][j] = distances[i - 1][j - 1];
          else {
            var north = distances[i - 1][j] + 1;
            var west = distances[i][j - 1] + 1;
            distances[i][j] = north < west ? north : west;
          }
        }
      }

      return distances;
    },

    // This starts at the final weight, and walks "backward" by finding
    // the minimum previous weight recursively until the origin of the weight
    // matrix.
    spliceOperationsFromEditDistances: function(distances) {
      var i = distances.length - 1;
      var j = distances[0].length - 1;
      var current = distances[i][j];
      var edits = [];
      while (i > 0 || j > 0) {
        if (i == 0) {
          edits.push(EDIT_ADD);
          j--;
          continue;
        }
        if (j == 0) {
          edits.push(EDIT_DELETE);
          i--;
          continue;
        }
        var northWest = distances[i - 1][j - 1];
        var west = distances[i - 1][j];
        var north = distances[i][j - 1];

        var min;
        if (west < north)
          min = west < northWest ? west : northWest;
        else
          min = north < northWest ? north : northWest;

        if (min == northWest) {
          if (northWest == current) {
            edits.push(EDIT_LEAVE);
          } else {
            edits.push(EDIT_UPDATE);
            current = northWest;
          }
          i--;
          j--;
        } else if (min == west) {
          edits.push(EDIT_DELETE);
          i--;
          current = west;
        } else {
          edits.push(EDIT_ADD);
          j--;
          current = north;
        }
      }

      edits.reverse();
      return edits;
    },

    /**
     * Splice Projection functions:
     *
     * A splice map is a representation of how a previous array of items
     * was transformed into a new array of items. Conceptually it is a list of
     * tuples of
     *
     *   <index, removed, addedCount>
     *
     * which are kept in ascending index order of. The tuple represents that at
     * the |index|, |removed| sequence of items were removed, and counting forward
     * from |index|, |addedCount| items were added.
     */

    /**
     * Lacking individual splice mutation information, the minimal set of
     * splices can be synthesized given the previous state and final state of an
     * array. The basic approach is to calculate the edit distance matrix and
     * choose the shortest path through it.
     *
     * Complexity: O(l * p)
     *   l: The length of the current array
     *   p: The length of the old array
     */
    calcSplices: function(current, currentStart, currentEnd,
                          old, oldStart, oldEnd) {
      var prefixCount = 0;
      var suffixCount = 0;

      var minLength = Math.min(currentEnd - currentStart, oldEnd - oldStart);
      if (currentStart == 0 && oldStart == 0)
        prefixCount = this.sharedPrefix(current, old, minLength);

      if (currentEnd == current.length && oldEnd == old.length)
        suffixCount = this.sharedSuffix(current, old, minLength - prefixCount);

      currentStart += prefixCount;
      oldStart += prefixCount;
      currentEnd -= suffixCount;
      oldEnd -= suffixCount;

      if (currentEnd - currentStart == 0 && oldEnd - oldStart == 0)
        return [];

      if (currentStart == currentEnd) {
        var splice = newSplice(currentStart, [], 0);
        while (oldStart < oldEnd)
          splice.removed.push(old[oldStart++]);

        return [ splice ];
      } else if (oldStart == oldEnd)
        return [ newSplice(currentStart, [], currentEnd - currentStart) ];

      var ops = this.spliceOperationsFromEditDistances(
          this.calcEditDistances(current, currentStart, currentEnd,
                                 old, oldStart, oldEnd));

      var splice = undefined;
      var splices = [];
      var index = currentStart;
      var oldIndex = oldStart;
      for (var i = 0; i < ops.length; i++) {
        switch(ops[i]) {
          case EDIT_LEAVE:
            if (splice) {
              splices.push(splice);
              splice = undefined;
            }

            index++;
            oldIndex++;
            break;
          case EDIT_UPDATE:
            if (!splice)
              splice = newSplice(index, [], 0);

            splice.addedCount++;
            index++;

            splice.removed.push(old[oldIndex]);
            oldIndex++;
            break;
          case EDIT_ADD:
            if (!splice)
              splice = newSplice(index, [], 0);

            splice.addedCount++;
            index++;
            break;
          case EDIT_DELETE:
            if (!splice)
              splice = newSplice(index, [], 0);

            splice.removed.push(old[oldIndex]);
            oldIndex++;
            break;
        }
      }

      if (splice) {
        splices.push(splice);
      }
      return splices;
    },

    sharedPrefix: function(current, old, searchLength) {
      for (var i = 0; i < searchLength; i++)
        if (!this.equals(current[i], old[i]))
          return i;
      return searchLength;
    },

    sharedSuffix: function(current, old, searchLength) {
      var index1 = current.length;
      var index2 = old.length;
      var count = 0;
      while (count < searchLength && this.equals(current[--index1], old[--index2]))
        count++;

      return count;
    },

    calculateSplices: function(current, previous) {
      return this.calcSplices(current, 0, current.length, previous, 0,
                              previous.length);
    },

    equals: function(currentValue, previousValue) {
      return currentValue === previousValue;
    }
  };

  return new ArraySplice();

})();
Polymer.domInnerHTML = (function() {

  // Cribbed from ShadowDOM polyfill
  // https://github.com/webcomponents/webcomponentsjs/blob/master/src/ShadowDOM/wrappers/HTMLElement.js#L28
  /////////////////////////////////////////////////////////////////////////////
  // innerHTML and outerHTML

  // http://www.whatwg.org/specs/web-apps/current-work/multipage/the-end.html#escapingString
  var escapeAttrRegExp = /[&\u00A0"]/g;
  var escapeDataRegExp = /[&\u00A0<>]/g;

  function escapeReplace(c) {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case '\u00A0':
        return '&nbsp;';
    }
  }

  function escapeAttr(s) {
    return s.replace(escapeAttrRegExp, escapeReplace);
  }

  function escapeData(s) {
    return s.replace(escapeDataRegExp, escapeReplace);
  }

  function makeSet(arr) {
    var set = {};
    for (var i = 0; i < arr.length; i++) {
      set[arr[i]] = true;
    }
    return set;
  }

  // http://www.whatwg.org/specs/web-apps/current-work/#void-elements
  var voidElements = makeSet([
    'area',
    'base',
    'br',
    'col',
    'command',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
  ]);

  var plaintextParents = makeSet([
    'style',
    'script',
    'xmp',
    'iframe',
    'noembed',
    'noframes',
    'plaintext',
    'noscript'
  ]);

  function getOuterHTML(node, parentNode, composed) {
    switch (node.nodeType) {
      case Node.ELEMENT_NODE:
        //var tagName = node.tagName.toLowerCase();
        var tagName = node.localName;
        var s = '<' + tagName;
        var attrs = node.attributes;
        for (var i = 0, attr; attr = attrs[i]; i++) {
          s += ' ' + attr.name + '="' + escapeAttr(attr.value) + '"';
        }
        s += '>';
        if (voidElements[tagName]) {
          return s;
        }
        return s + getInnerHTML(node, composed) + '</' + tagName + '>';
      case Node.TEXT_NODE:
        var data = node.data;
        if (parentNode && plaintextParents[parentNode.localName]) {
          return data;
        }
        return escapeData(data);
      case Node.COMMENT_NODE:
        return '<!--' + node.data + '-->';
      default:
        console.error(node);
        throw new Error('not implemented');
    }
  }

  function getInnerHTML(node, composed) {
    if (node instanceof HTMLTemplateElement)
      node = node.content;
    var s = '';
    var c$ = Polymer.dom(node).childNodes;
    for (var i=0, l=c$.length, child; (i<l) && (child=c$[i]); i++) {  
      s += getOuterHTML(child, node, composed);
    }
    return s;
  }

  return {
    getInnerHTML: getInnerHTML
  };

})();
(function() {
  
  'use strict';

  // native add/remove
  var nativeInsertBefore = Element.prototype.insertBefore;
  var nativeAppendChild = Element.prototype.appendChild;
  var nativeRemoveChild = Element.prototype.removeChild;
  
  /**
   * TreeApi is a dom manipulation library used by Shady/Polymer.dom to 
   * manipulate composed and logical trees.
   */
  var TreeApi = Polymer.TreeApi = {
    
    // sad but faster than slice...
    arrayCopyChildNodes: function(parent) {
      var copy=[], i=0;
      for (var n=parent.firstChild; n; n=n.nextSibling) {
        copy[i++] = n;
      }
      return copy;
    },

    arrayCopyChildren: function(parent) {
      var copy=[], i=0;
      for (var n=parent.firstElementChild; n; n=n.nextElementSibling) {
        copy[i++] = n;
      }
      return copy;
    },

    arrayCopy: function(a$) {
      var l = a$.length;
      var copy = new Array(l);
      for (var i=0; i < l; i++) {
        copy[i] = a$[i];
      }
      return copy;
    }

  };

  Polymer.TreeApi.Logical = {

    hasParentNode: function(node) {
      return Boolean(node.__dom && node.__dom.parentNode);
    },

    hasChildNodes: function(node) {
      return Boolean(node.__dom && node.__dom.childNodes !== undefined);
    },
    
    getChildNodes: function(node) {
      // note: we're distinguishing here between undefined and false-y:
      // hasChildNodes uses undefined check to see if this element has logical
      // children; the false-y check indicates whether or not we should rebuild
      // the cached childNodes array.
      return this.hasChildNodes(node) ? this._getChildNodes(node) :
        node.childNodes;
    },

    _getChildNodes: function(node) {
      if (!node.__dom.childNodes) {
        node.__dom.childNodes = [];
        for (var n=node.__dom.firstChild; n; n=n.__dom.nextSibling) {
          node.__dom.childNodes.push(n);
        } 
      }
      return node.__dom.childNodes;
    },

    // NOTE: __dom can be created under 2 conditions: (1) an element has a
    // logical tree, or (2) an element is in a logical tree. In case (1), the
    // element will store firstChild/lastChild, and in case (2), the element
    // will store parentNode, nextSibling, previousSibling. This means that
    // the mere existence of __dom is not enough to know if the requested
    // logical data is available and instead we do an explicit undefined check.
    getParentNode: function(node) {
      return node.__dom && node.__dom.parentNode !== undefined ? 
        node.__dom.parentNode : node.parentNode;
    },

    getFirstChild: function(node) {
      return node.__dom && node.__dom.firstChild !== undefined ? 
        node.__dom.firstChild : node.firstChild;
    },

    getLastChild: function(node) {
      return node.__dom && node.__dom.lastChild  !== undefined ? 
        node.__dom.lastChild : node.lastChild;
    },

    getNextSibling: function(node) {
      return node.__dom && node.__dom.nextSibling  !== undefined ? 
        node.__dom.nextSibling : node.nextSibling;
    },

    getPreviousSibling: function(node) {
      return node.__dom && node.__dom.previousSibling  !== undefined ? 
        node.__dom.previousSibling : node.previousSibling;
    },

    getFirstElementChild: function(node) {
      return node.__dom && node.__dom.firstChild !== undefined ?  
        this._getFirstElementChild(node) : node.firstElementChild;
    },

    _getFirstElementChild: function(node) {
      var n = node.__dom.firstChild;
      while (n && n.nodeType !== Node.ELEMENT_NODE) {
        n = n.__dom.nextSibling;
      }
      return n;
    },

    getLastElementChild: function(node) {
      return node.__dom && node.__dom.lastChild !== undefined ?
        this._getLastElementChild(node) : node.lastElementChild;
    },

    _getLastElementChild: function(node) {
      var n = node.__dom.lastChild;
      while (n && n.nodeType !== Node.ELEMENT_NODE) {
        n = n.__dom.previousSibling;
      }
      return n;
    },

    getNextElementSibling: function(node) {
      return node.__dom && node.__dom.nextSibling !== undefined ?
        this._getNextElementSibling(node) : node.nextElementSibling;
    },

    _getNextElementSibling: function(node) {
      var n = node.__dom.nextSibling;
      while (n && n.nodeType !== Node.ELEMENT_NODE) {
        n = n.__dom.nextSibling;
      }
      return n;
    },

    getPreviousElementSibling: function(node) {
      return node.__dom && node.__dom.previousSibling !== undefined ?
        this._getPreviousElementSibling(node) : node.previousElementSibling;
    },

    _getPreviousElementSibling: function(node) {
      var n = node.__dom.previousSibling;
      while (n && n.nodeType !== Node.ELEMENT_NODE) {
        n = n.__dom.previousSibling;
      }
      return n;
    },

    // Capture the list of light children. It's important to do this before we
    // start transforming the DOM into "rendered" state.
    // Children may be added to this list dynamically. It will be treated as the
    // source of truth for the light children of the element. This element's
    // actual children will be treated as the rendered state once this function
    // has been called.
    saveChildNodes: function(node) {
      if (!this.hasChildNodes(node)) {
        node.__dom = node.__dom || {};
        node.__dom.firstChild = node.firstChild;
        node.__dom.lastChild = node.lastChild;
        node.__dom.childNodes = [];
        for (var n=node.firstChild; n; n=n.nextSibling) {
          n.__dom = n.__dom || {};
          n.__dom.parentNode = node;
          node.__dom.childNodes.push(n);
          n.__dom.nextSibling = n.nextSibling;
          n.__dom.previousSibling = n.previousSibling;
        }
      }
    },

    recordInsertBefore: function(node, container, ref_node) {
      container.__dom.childNodes = null;
      // handle document fragments
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
        // TODO(sorvell): remember this for patching:
        // the act of setting this info can affect patched nodes
        // getters; therefore capture childNodes before patching.
        for (var n=node.firstChild; n; n=n.nextSibling) {
          this._linkNode(n, container, ref_node);
        }
      } else {
        this._linkNode(node, container, ref_node);
      }
    },

    _linkNode: function(node, container, ref_node) {
      node.__dom = node.__dom || {};
      container.__dom = container.__dom || {};
      if (ref_node) {
        ref_node.__dom = ref_node.__dom || {};
      }      
      // update ref_node.previousSibling <-> node
      node.__dom.previousSibling = ref_node ? ref_node.__dom.previousSibling : 
        container.__dom.lastChild;
      if (node.__dom.previousSibling) {
        node.__dom.previousSibling.__dom.nextSibling = node;
      }
      // update node <-> ref_node
      node.__dom.nextSibling = ref_node;
      if (node.__dom.nextSibling) {
        node.__dom.nextSibling.__dom.previousSibling = node;
      }
      // update node <-> container
      node.__dom.parentNode = container;
      if (ref_node) {
        if (ref_node === container.__dom.firstChild) {
          container.__dom.firstChild = node;
        }
      } else {
        container.__dom.lastChild = node;
        if (!container.__dom.firstChild) {
          container.__dom.firstChild = node;
        }
      }
      // remove caching of childNodes
      container.__dom.childNodes = null;
    },

    recordRemoveChild: function(node, container) {
      node.__dom = node.__dom || {};
      container.__dom = container.__dom || {};
      if (node === container.__dom.firstChild) {
        container.__dom.firstChild = node.__dom.nextSibling;
      }
      if (node === container.__dom.lastChild) {
        container.__dom.lastChild = node.__dom.previousSibling;
      }
      var p = node.__dom.previousSibling;
      var n = node.__dom.nextSibling;
      if (p) {
        p.__dom.nextSibling = n;
      }
      if (n) {
        n.__dom.previousSibling = p;
      }
      // When an element is removed, logical data is no longer tracked.
      // Explicitly set `undefined` here to indicate this. This is disginguished
      // from `null` which is set if info is null.
      node.__dom.parentNode = node.__dom.previousSibling = 
        node.__dom.nextSibling = undefined;
      // remove caching of childNodes
      container.__dom.childNodes = null;
    }

  }

  // TODO(sorvell): composed tree manipulation is made available
  // (1) to maninpulate the composed tree, and (2) to track changes
  // to the tree for optional patching pluggability.
  Polymer.TreeApi.Composed = {

    getChildNodes: function(node) {
      return Polymer.TreeApi.arrayCopyChildNodes(node);
    },

    getParentNode: function(node) {
      return node.parentNode;
    },

    // composed tracking needs to reset composed children here in case
    // they may have already been set (this shouldn't happen but can 
    // if dependency ordering is incorrect and as a result upgrade order 
    // is unexpected)
    clearChildNodes: function(node) {
      node.textContent = '';
    },

    insertBefore: function(parentNode, newChild, refChild) {
      return nativeInsertBefore.call(parentNode, newChild, refChild || null);
    },

    appendChild: function(parentNode, newChild) {
      return nativeAppendChild.call(parentNode, newChild);
    },

    removeChild: function(parentNode, node) {
      return nativeRemoveChild.call(parentNode, node);
    }

  };

})();
/**
   * DomApi is a dom manipulation library which is compatible with both
   * Shady DOM and Shadow DOM. The general usage is
   * `Polymer.dom(node).method(arguments)` where methods and arguments
   * match native DOM where possible.
   */
  Polymer.DomApi = (function() {
    'use strict';

    var Settings = Polymer.Settings;
    var TreeApi = Polymer.TreeApi;

    var DomApi = function(node) {
      this.node = needsToWrap ? DomApi.wrap(node) : node;
    };

    // ensure nodes are wrapped if SD polyfill is present
    var needsToWrap = Settings.hasShadow && !Settings.nativeShadow;
    DomApi.wrap = window.wrap ? window.wrap : function(node) { return node; };

    DomApi.prototype = {

      flush: function() {
        Polymer.dom.flush();
      },

      /**
       * Check that the given node is a descendant of `this`,
       * ignoring ShadowDOM boundaries
       * @param {Node} node
       * @return {Boolean} true if `node` is a descendant or equal to `this`
       */
      deepContains: function(node) {
        // fast path, use shallow `contains`.
        if (this.node.contains(node)) {
          return true;
        }
        var n = node;
        var doc = node.ownerDocument;
        // walk from node to `this` or `document`
        while (n && n !== doc && n !== this.node) {
          // use logical parentnode, or native ShadowRoot host
          n = Polymer.dom(n).parentNode || n.host;
        }
        return n === this.node;
      },

      /*
        Returns a list of nodes distributed within this element. These can be
        dom children or elements distributed to children that are insertion
        points.
      */
      queryDistributedElements: function(selector) {
        var c$ = this.getEffectiveChildNodes();
        var list = [];
        for (var i=0, l=c$.length, c; (i<l) && (c=c$[i]); i++) {
          if ((c.nodeType === Node.ELEMENT_NODE) &&
              DomApi.matchesSelector.call(c, selector)) {
            list.push(c);
          }
        }
        return list;
      },

      /*
        Returns a list of effective childNoes within this element. These can be
        dom child nodes or elements distributed to children that are insertion
        points.
      */
      getEffectiveChildNodes: function() {
        var list = [];
        var c$ = this.childNodes;
        for (var i=0, l=c$.length, c; (i<l) && (c=c$[i]); i++) {
          if (c.localName === CONTENT) {
            var d$ = dom(c).getDistributedNodes();
            for (var j=0; j < d$.length; j++) {
              list.push(d$[j]);
            }
          } else {
            list.push(c);
          }
        }
        return list;
      },

      /**
       * Notifies callers about changes to the element's effective child nodes,
       * the same list as returned by `getEffectiveChildNodes`.
       * @param {function} callback The supplied callback is called with an
       * `info` argument which is an object that provides
       * the `target` on which the changes occurred, a list of any nodes
       * added in the `addedNodes` array, and nodes removed in the
       * `removedNodes` array.
       * @return {object} Returns a handle which is the argument to
       * `unobserveNodes`.
       */
      observeNodes: function(callback) {
        if (callback) {
          if (!this.observer) {
            this.observer = this.node.localName === CONTENT ?
              new DomApi.DistributedNodesObserver(this) :
              new DomApi.EffectiveNodesObserver(this);
          }
          return this.observer.addListener(callback);
        }
      },

      /**
       * Stops observing changes to the element's effective child nodes.
       * @param {object} handle The handle for the callback that should
       * no longer receive notifications. This handle is returned from
       * `observeNodes`.
       */
      unobserveNodes: function(handle) {
        if (this.observer) {
          this.observer.removeListener(handle);
        }
      },

      notifyObserver: function() {
        if (this.observer) {
          this.observer.notify();
        }
      },

      // NOTE: `_query` is used primarily for ShadyDOM's querySelector impl,
      // but it's also generally useful to recurse through the element tree
      // and is used by Polymer's styling system. 
      _query: function(matcher, node, halter) {
        node = node || this.node;
        var list = [];
        this._queryElements(TreeApi.Logical.getChildNodes(node), matcher, 
          halter, list);
        return list;
      },

      _queryElements: function(elements, matcher, halter, list) {
        for (var i=0, l=elements.length, c; (i<l) && (c=elements[i]); i++) {
          if (c.nodeType === Node.ELEMENT_NODE) {
            if (this._queryElement(c, matcher, halter, list)) {
              return true;
            }
          }
        }
      },

      _queryElement: function(node, matcher, halter, list) {
        var result = matcher(node);
        if (result) {
          list.push(node);
        }
        if (halter && halter(result)) {
          return result;
        }
        this._queryElements(TreeApi.Logical.getChildNodes(node), matcher, 
          halter, list);
      }

    };

    var CONTENT = DomApi.CONTENT = 'content';

    var dom = DomApi.factory = function(node) {
      node = node || document;
      if (!node.__domApi) {
        node.__domApi = new DomApi.ctor(node);
      }
      return node.__domApi;
    };

    DomApi.hasApi = function(node) {
      return Boolean(node.__domApi);
    };

    DomApi.ctor = DomApi;

    Polymer.dom = function(obj, patch) {
      if (obj instanceof Event) {
        return Polymer.EventApi.factory(obj);
      } else {
        return DomApi.factory(obj, patch);
      }
    };

    var p = Element.prototype;
    DomApi.matchesSelector = p.matches || p.matchesSelector ||
      p.mozMatchesSelector || p.msMatchesSelector ||
      p.oMatchesSelector || p.webkitMatchesSelector;

    return DomApi;

  })();
(function() {
  'use strict';

  var Settings = Polymer.Settings;
  var DomApi = Polymer.DomApi;
  var dom = DomApi.factory;
  var TreeApi = Polymer.TreeApi;
  var getInnerHTML = Polymer.domInnerHTML.getInnerHTML;
  var CONTENT = DomApi.CONTENT;

  // *************** Configure DomApi for Shady DOM!! ***************
  if (Settings.useShadow) {
    return;
  }

  var nativeCloneNode = Element.prototype.cloneNode;
  var nativeImportNode = Document.prototype.importNode;

  Polymer.Base.extend(DomApi.prototype, {

    _lazyDistribute: function(host) {
      // note: only try to distribute if the root is not clean; this ensures
      // we don't distribute before initial distribution
      if (host.shadyRoot && host.shadyRoot._distributionClean) {
        host.shadyRoot._distributionClean = false;
        Polymer.dom.addDebouncer(host.debounce('_distribute',
          host._distributeContent));
      }
    },

    appendChild: function(node) {
      return this.insertBefore(node);
    },

    // cases in which we may not be able to just do standard native call
    // 1. container has a shadyRoot (needsDistribution IFF the shadyRoot
    // has an insertion point)
    // 2. container is a shadyRoot (don't distribute, instead set
    // container to container.host.
    // 3. node is <content> (host of container needs distribution)
    insertBefore: function(node, ref_node) {
      if (ref_node && TreeApi.Logical.getParentNode(ref_node) !== this.node) {
        throw Error('The ref_node to be inserted before is not a child ' +
          'of this node');
      }
      // remove node from its current position iff it's in a tree.
      if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
        var parent = TreeApi.Logical.getParentNode(node);
        // notify existing parent that this node is being removed.
        if (parent) {
          if (DomApi.hasApi(parent)) {
            dom(parent).notifyObserver();
          }
          this._removeNode(node);
        } else {
          this._removeOwnerShadyRoot(node);
        }
      }
      if (!this._addNode(node, ref_node)) {
        if (ref_node) {
          // if ref_node is <content> replace with first distributed node
          ref_node = ref_node.localName === CONTENT ?
            this._firstComposedNode(ref_node) : ref_node;
        }
        // if adding to a shadyRoot, add to host instead
        var container = this.node._isShadyRoot ? this.node.host : this.node;
        if (ref_node) {
          TreeApi.Composed.insertBefore(container, node, ref_node);
        } else {
          TreeApi.Composed.appendChild(container, node);
        }
      }
      this.notifyObserver();
      return node;
    },

    // Try to add node. Record logical info, track insertion points, perform
    // distribution iff needed. Return true if the add is handled.
    _addNode: function(node, ref_node) {
      var root = this.getOwnerRoot();
      if (root) {
        // note: we always need to see if an insertion point is added
        // since this saves logical tree info; however, invalidation state
        // needs 
        var ipAdded = this._maybeAddInsertionPoint(node, this.node);
        // invalidate insertion points IFF not already invalid!
        if (!root._invalidInsertionPoints) {
          root._invalidInsertionPoints = ipAdded;
        }
        this._addNodeToHost(root.host, node);
      }
      if (TreeApi.Logical.hasChildNodes(this.node)) {
        TreeApi.Logical.recordInsertBefore(node, this.node, ref_node);
      }
      // if not distributing and not adding to host, do a fast path addition
      var handled = this._maybeDistribute(node) ||
        this.node.shadyRoot;
      // if shady is handling this node, 
      // the actual dom may not be removed if the node or fragment contents
      // remain undistributed so we ensure removal here.
      // NOTE: we only remove from existing location iff shady dom is involved.
      // This is because a node fragment is passed to the native add method
      // which expects to see fragment children. Regular elements must also
      // use this check because not doing so causes separation of 
      // attached/detached and breaks, for example, 
      // dom-if's attached/detached checks.
      if (handled) {
        if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
          while (node.firstChild) {
            TreeApi.Composed.removeChild(node, node.firstChild);
          }
        } else {
          var parent = TreeApi.Composed.getParentNode(node);
          if (parent) {
            TreeApi.Composed.removeChild(parent, node);
          }
        }
      }
      return handled;
    },

    /**
      Removes the given `node` from the element's `lightChildren`.
      This method also performs dom composition.
    */
    removeChild: function(node) {
      if (TreeApi.Logical.getParentNode(node) !== this.node) {
        throw Error('The node to be removed is not a child of this node: ' + 
          node);
      }
      if (!this._removeNode(node)) {
        // if removing from a shadyRoot, remove form host instead
        var container = this.node._isShadyRoot ? this.node.host : this.node;
        // not guaranteed to physically be in container; e.g.
        // undistributed nodes.
        var parent = TreeApi.Composed.getParentNode(node);
        if (container === parent) {
          TreeApi.Composed.removeChild(container, node);
        }
      }
      this.notifyObserver();
      return node;
    },

    // Try to remove node: update logical info and perform distribution iff 
    // needed. Return true if the removal has been handled.
    // note that it's possible for both the node's host and its parent
    // to require distribution... both cases are handled here.
    _removeNode: function(node) {
      // important that we want to do this only if the node has a logical parent
      var logicalParent = TreeApi.Logical.hasParentNode(node) &&
        TreeApi.Logical.getParentNode(node);
      var distributed;
      var root = this._ownerShadyRootForNode(node);
      if (logicalParent) {
        // distribute node's parent iff needed
        distributed = dom(node)._maybeDistributeParent();
        TreeApi.Logical.recordRemoveChild(node, logicalParent);
        // remove node from root and distribute it iff needed
        if (root && this._removeDistributedChildren(root, node)) {
          root._invalidInsertionPoints = true;
          this._lazyDistribute(root.host);
        }
      }
      this._removeOwnerShadyRoot(node);
      if (root) {
        this._removeNodeFromHost(root.host, node);
      }
      return distributed;
    },

    replaceChild: function(node, ref_node) {
      this.insertBefore(node, ref_node);
      this.removeChild(ref_node);
      return node;
    },

    _hasCachedOwnerRoot: function(node) {
      return Boolean(node._ownerShadyRoot !== undefined);
    },

    getOwnerRoot: function() {
      return this._ownerShadyRootForNode(this.node);
    },

    _ownerShadyRootForNode: function(node) {
      if (!node) {
        return;
      }
      var root = node._ownerShadyRoot;
      if (root === undefined) {
        if (node._isShadyRoot) {
          root = node;
        } else {
          var parent = TreeApi.Logical.getParentNode(node);
          if (parent) {
            root = parent._isShadyRoot ? parent :
              this._ownerShadyRootForNode(parent);
          } else {
           root = null;
          }
        }
        // memo-ize result for performance but only memo-ize a false-y
        // result if node is in the document. This avoids a problem where a root
        // can be cached while an element is inside a fragment. 
        // If this happens and we cache the result, the value can become stale
        // because for perf we avoid processing the subtree of added fragments.
        if (root || document.documentElement.contains(node)) {
          node._ownerShadyRoot = root;
        }
      }
      return root;
    },

    _maybeDistribute: function(node) {
      // TODO(sorvell): technically we should check non-fragment nodes for
      // <content> children but since this case is assumed to be exceedingly
      // rare, we avoid the cost and will address with some specific api
      // when the need arises.  For now, the user must call
      // distributeContent(true), which updates insertion points manually
      // and forces distribution.
      var fragContent = (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE) &&
        !node.__noContent && dom(node).querySelector(CONTENT);
      var wrappedContent = fragContent &&
        (TreeApi.Logical.getParentNode(fragContent).nodeType !==
        Node.DOCUMENT_FRAGMENT_NODE);
      var hasContent = fragContent || (node.localName === CONTENT);
      // There are 2 possible cases where a distribution may need to occur:
      // 1. <content> being inserted (the host of the shady root where
      //    content is inserted needs distribution)
      // 2. children being inserted into parent with a shady root (parent
      //    needs distribution)
      if (hasContent) {
        var root = this.getOwnerRoot();
        if (root) {
          // note, insertion point list update is handled after node
          // mutations are complete
          this._lazyDistribute(root.host);
        }
      }
      var needsDist = this._nodeNeedsDistribution(this.node);
      if (needsDist) {
        this._lazyDistribute(this.node);
      }
      // Return true when distribution will fully handle the composition
      // Note that if a content was being inserted that was wrapped by a node,
      // and the parent does not need distribution, return false to allow
      // the nodes to be added directly, after which children may be
      // distributed and composed into the wrapping node(s)
      return needsDist || (hasContent && !wrappedContent);
    },

    /* note: parent argument is required since node may have an out
    of date parent at this point; returns true if a <content> is being added */
    _maybeAddInsertionPoint: function(node, parent) {
      var added;
      if (node.nodeType === Node.DOCUMENT_FRAGMENT_NODE &&
        !node.__noContent) {
        var c$ = dom(node).querySelectorAll(CONTENT);
        for (var i=0, n, np, na; (i<c$.length) && (n=c$[i]); i++) {
          np = TreeApi.Logical.getParentNode(n);
          // don't allow node's parent to be fragment itself
          if (np === node) {
            np = parent;
          }
          na = this._maybeAddInsertionPoint(n, np);
          added = added || na;
        }
      } else if (node.localName === CONTENT) {
        TreeApi.Logical.saveChildNodes(parent);
        TreeApi.Logical.saveChildNodes(node);
        added = true;
      }
      return added;
    },

    _updateInsertionPoints: function(host) {
      var i$ = host.shadyRoot._insertionPoints =
        dom(host.shadyRoot).querySelectorAll(CONTENT);
      // ensure <content>'s and their parents have logical dom info.
      for (var i=0, c; i < i$.length; i++) {
        c = i$[i];
        TreeApi.Logical.saveChildNodes(c);
        TreeApi.Logical.saveChildNodes(TreeApi.Logical.getParentNode(c));
      }
    },

    _nodeNeedsDistribution: function(node) {
      return node && node.shadyRoot && 
        DomApi.hasInsertionPoint(node.shadyRoot);
    },

    // a node being added is always in this same host as this.node.
    _addNodeToHost: function(host, node) {
      if (host._elementAdd) {
        host._elementAdd(node);
      }
    },

    _removeNodeFromHost: function(host, node) {
      if (host._elementRemove) {
        host._elementRemove(node);
      }
    },

    _removeDistributedChildren: function(root, container) {
      var hostNeedsDist;
      var ip$ = root._insertionPoints;
      for (var i=0; i<ip$.length; i++) {
        var content = ip$[i];
        if (this._contains(container, content)) {
          var dc$ = dom(content).getDistributedNodes();
          for (var j=0; j<dc$.length; j++) {
            hostNeedsDist = true;
            var node = dc$[j];
            var parent = TreeApi.Composed.getParentNode(node);
            if (parent) {
              TreeApi.Composed.removeChild(parent, node);
            }
          }
        }
      }
      return hostNeedsDist;
    },

    _contains: function(container, node) {
      while (node) {
        if (node == container) {
          return true;
        }
        node = TreeApi.Logical.getParentNode(node);
      }
    },

    _removeOwnerShadyRoot: function(node) {
      // optimization: only reset the tree if node is actually in a root
      if (this._hasCachedOwnerRoot(node)) {
        var c$ = TreeApi.Logical.getChildNodes(node);
        for (var i=0, l=c$.length, n; (i<l) && (n=c$[i]); i++) {
          this._removeOwnerShadyRoot(n);
        }
      }
      node._ownerShadyRoot = undefined;
    },

    // TODO(sorvell): This will fail if distribution that affects this
    // question is pending; this is expected to be exceedingly rare, but if
    // the issue comes up, we can force a flush in this case.
    _firstComposedNode: function(content) {
      var n$ = dom(content).getDistributedNodes();
      for (var i=0, l=n$.length, n, p$; (i<l) && (n=n$[i]); i++) {
        p$ = dom(n).getDestinationInsertionPoints();
        // means that we're composed to this spot.
        if (p$[p$.length-1] === content) {
          return n;
        }
      }
    },

    // TODO(sorvell): consider doing native QSA and filtering results.
    querySelector: function(selector) {
      // match selector and halt on first result.
      var result = this._query(function(n) {
        return DomApi.matchesSelector.call(n, selector);
      }, this.node, function(n) {
        return Boolean(n);
      })[0];
      return result || null;
    },

    querySelectorAll: function(selector) {
      return this._query(function(n) {
        return DomApi.matchesSelector.call(n, selector);
      }, this.node);
    },

    getDestinationInsertionPoints: function() {
      return this.node._destinationInsertionPoints || [];
    },

    getDistributedNodes: function() {
      return this.node._distributedNodes || [];
    },

    _clear: function() {
      while (this.childNodes.length) {
        this.removeChild(this.childNodes[0]);
      }
    },

    setAttribute: function(name, value) {
      this.node.setAttribute(name, value);
      this._maybeDistributeParent();
    },

    removeAttribute: function(name) {
      this.node.removeAttribute(name);
      this._maybeDistributeParent();
    },

    _maybeDistributeParent: function() {
      if (this._nodeNeedsDistribution(this.parentNode)) {
        this._lazyDistribute(this.parentNode);
        return true;
      }
    },

    cloneNode: function(deep) {
      var n = nativeCloneNode.call(this.node, false);
      if (deep) {
        var c$ = this.childNodes;
        var d = dom(n);
        for (var i=0, nc; i < c$.length; i++) {
          nc = dom(c$[i]).cloneNode(true);
          d.appendChild(nc);
        }
      }
      return n;
    },

    importNode: function(externalNode, deep) {
      // for convenience use this node's ownerDoc if the node isn't a document
      var doc = this.node instanceof Document ? this.node :
        this.node.ownerDocument;
      var n = nativeImportNode.call(doc, externalNode, false);
      if (deep) {
        var c$ = TreeApi.Logical.getChildNodes(externalNode);
        var d = dom(n);
        for (var i=0, nc; i < c$.length; i++) {
          nc = dom(doc).importNode(c$[i], true);
          d.appendChild(nc);
        }
      }
      return n;
    },

    _getComposedInnerHTML: function() {
      return getInnerHTML(this.node, true);
    }

  });

  Object.defineProperties(DomApi.prototype, {

    activeElement: {
      get: function() {
        var active = document.activeElement;
        if (!active) {
          return null;
        }
        var isShadyRoot = !!this.node._isShadyRoot;
        if (this.node !== document) {
          // If this node isn't a document or shady root, then it doesn't have
          // an active element.
          if (!isShadyRoot) {
            return null;
          }
          // If this shady root's host is the active element or the active
          // element is not a descendant of the host (in the composed tree),
          // then it doesn't have an active element.
          if (this.node.host === active ||
              !this.node.host.contains(active)) {
            return null;
          }
        }
        // This node is either the document or a shady root of which the active
        // element is a (composed) descendant of its host; iterate upwards to
        // find the active element's most shallow host within it.
        var activeRoot = dom(active).getOwnerRoot();
        while (activeRoot && activeRoot !== this.node) {
          active = activeRoot.host;
          activeRoot = dom(active).getOwnerRoot();
        }
        if (this.node === document) {
          // This node is the document, so activeRoot should be null.
          return activeRoot ? null : active;
        } else {
          // This node is a non-document shady root, and it should be
          // activeRoot.
          return activeRoot === this.node ? active : null;
        }
      },
      configurable: true
    },

    childNodes: {
      get: function() {
        var c$ = TreeApi.Logical.getChildNodes(this.node);
        return Array.isArray(c$) ? c$ : TreeApi.arrayCopyChildNodes(this.node);
      },
      configurable: true
    },

    children: {
      get: function() {
        if (TreeApi.Logical.hasChildNodes(this.node)) {
          return Array.prototype.filter.call(this.childNodes, function(n) {
            return (n.nodeType === Node.ELEMENT_NODE);
          });
        } else {
          return TreeApi.arrayCopyChildren(this.node);
        }
      },
      configurable: true
    },

    parentNode: {
      get: function() {
        return TreeApi.Logical.getParentNode(this.node);
      },
      configurable: true
    },

    firstChild: {
      get: function() {
        return TreeApi.Logical.getFirstChild(this.node);
      },
      configurable: true
    },

    lastChild: {
      get: function() {
        return TreeApi.Logical.getLastChild(this.node);
      },
      configurable: true
    },

    nextSibling: {
      get: function() {
        return TreeApi.Logical.getNextSibling(this.node);
      },
      configurable: true
    },

    previousSibling: {
      get: function() {
        return TreeApi.Logical.getPreviousSibling(this.node);
      },
      configurable: true
    },

    firstElementChild: {
      get: function() {
        return TreeApi.Logical.getFirstElementChild(this.node);
      },
      configurable: true
    },

    lastElementChild: {
      get: function() {
        return TreeApi.Logical.getLastElementChild(this.node);
      },
      configurable: true
    },

    nextElementSibling: {
      get: function() {
        return TreeApi.Logical.getNextElementSibling(this.node);
      },
      configurable: true
    },

    previousElementSibling: {
      get: function() {
        return TreeApi.Logical.getPreviousElementSibling(this.node);
      },
      configurable: true
    },

    // textContent / innerHTML
    textContent: {
      get: function() {
        var nt = this.node.nodeType;
        if (nt === Node.TEXT_NODE || nt === Node.COMMENT_NODE) {
          return this.node.textContent;
        } else {
          var tc = [];
          for (var i = 0, cn = this.childNodes, c; c = cn[i]; i++) {
            if (c.nodeType !== Node.COMMENT_NODE) {
              tc.push(c.textContent);
            }
          }
          return tc.join('');
        }
      },
      set: function(text) {
        var nt = this.node.nodeType;
        if (nt === Node.TEXT_NODE || nt === Node.COMMENT_NODE) {
          this.node.textContent = text;
        } else {
          this._clear();
          if (text) {
            this.appendChild(document.createTextNode(text));
          }
        }
      },
      configurable: true
    },

    innerHTML: {
      get: function() {
        var nt = this.node.nodeType;
        if (nt === Node.TEXT_NODE || nt === Node.COMMENT_NODE) {
          return null;
        } else {
          return getInnerHTML(this.node);
        }
      },
      set: function(text) {
        var nt = this.node.nodeType;
        if (nt !== Node.TEXT_NODE || nt !== Node.COMMENT_NODE) {
          this._clear();
          var d = document.createElement('div');
          d.innerHTML = text;
          // here, appendChild may move nodes async so we cannot rely
          // on node position when copying
          var c$ = TreeApi.arrayCopyChildNodes(d);
          for (var i=0; i < c$.length; i++) {
            this.appendChild(c$[i]);
          }
        }
      },
      configurable: true
    }

  });

  DomApi.hasInsertionPoint = function(root) {
    return Boolean(root && root._insertionPoints.length);
  };

})();
(function() {
  'use strict';

  var Settings = Polymer.Settings;
  var TreeApi = Polymer.TreeApi;
  var DomApi = Polymer.DomApi;

  // *************** Configure DomApi for Shadow DOM!! ***************
  if (!Settings.useShadow) {
    return;
  }

  Polymer.Base.extend(DomApi.prototype, {

    querySelectorAll: function(selector) {
      return TreeApi.arrayCopy(this.node.querySelectorAll(selector));
    },

    getOwnerRoot: function() {
      var n = this.node;
      while (n) {
        if (n.nodeType === Node.DOCUMENT_FRAGMENT_NODE && n.host) {
          return n;
        }
        n = n.parentNode;
      }
    },

    importNode: function(externalNode, deep) {
      var doc = this.node instanceof Document ? this.node :
        this.node.ownerDocument;
      return doc.importNode(externalNode, deep);
    },

    getDestinationInsertionPoints: function() {
      var n$ = this.node.getDestinationInsertionPoints &&
        this.node.getDestinationInsertionPoints();
      return n$ ? TreeApi.arrayCopy(n$) : [];
    },

    getDistributedNodes: function() {
      var n$ = this.node.getDistributedNodes &&
        this.node.getDistributedNodes();
      return n$ ? TreeApi.arrayCopy(n$) : [];
    }

  });

  Object.defineProperties(DomApi.prototype, {

    activeElement: {
      get: function() {
        var node = DomApi.wrap(this.node);
        var activeElement = node.activeElement;
        // Prevents `activeElement` from returning elements outside of the
        // ShadowRoot, even if they would become descendants of the ShadowRoot
        // in the composed tree. See w3c/webcomponents#358.
        return node.contains(activeElement) ? activeElement : null;
      },
      configurable: true
    },

    childNodes: {
      get: function() {
        return TreeApi.arrayCopyChildNodes(this.node);
      },
      configurable: true
    },

    children: {
      get: function() {
        return TreeApi.arrayCopyChildren(this.node);
      },
      configurable: true
    },

    // textContent / innerHTML
    textContent: {
      get: function() {
        return this.node.textContent;
      },
      set: function(value) {
        return this.node.textContent = value;
      },
      configurable: true
    },

    innerHTML: {
      get: function() {
        return this.node.innerHTML;
      },
      set: function(value) {
        return this.node.innerHTML = value;
      },
      configurable: true
    }

  });

  var forwardMethods = function(m$) {
    for (var i=0; i < m$.length; i++) {
      forwardMethod(m$[i]);
    }
  };

  var forwardMethod = function(method) {
    DomApi.prototype[method] = function() {
      return this.node[method].apply(this.node, arguments);
    }
  };

  forwardMethods(['cloneNode', 'appendChild', 'insertBefore',
    'removeChild', 'replaceChild', 'setAttribute', 'removeAttribute',
    'querySelector']);

  var forwardProperties = function(f$) {
    for (var i=0; i < f$.length; i++) {
      forwardProperty(f$[i]);
    }
  };

  var forwardProperty = function(name) {
    Object.defineProperty(DomApi.prototype, name, {
      get: function() {
        return this.node[name];
      },
      configurable: true
    });
  };

  forwardProperties(['parentNode', 'firstChild', 'lastChild',
    'nextSibling', 'previousSibling', 'firstElementChild',
    'lastElementChild', 'nextElementSibling', 'previousElementSibling']);

})();
/**
   * `Polymer.dom.flush()` causes any asynchronously queued actions to be
   * flushed synchronously. It should be used sparingly as calling it frequently
   * can negatively impact performance since work is often deferred for
   * efficiency. Calling `Polymer.dom.flush()` is useful, for example, when
   * an element has to measure itself and is unsure about the state of its
   * internal or compoased DOM.
   */
  Polymer.Base.extend(Polymer.dom, {

    _flushGuard: 0,
    _FLUSH_MAX: 100,
    _needsTakeRecords: !Polymer.Settings.useNativeCustomElements,
    _debouncers: [],
    _staticFlushList: [],
    _finishDebouncer: null,

    // flush and debounce exposed as statics on Polymer.dom
    flush: function() {
      this._flushGuard = 0;
      this._prepareFlush();
      while (this._debouncers.length && this._flushGuard < this._FLUSH_MAX) {
        // Avoid using an index in this loop to ensure flush is safe to be
        // called reentrantly from a debouncer callback being flushed
        while (this._debouncers.length) {
          this._debouncers.shift().complete();
        }
        // clear the list of debouncers
        if (this._finishDebouncer) {
          this._finishDebouncer.complete();
        }
        this._prepareFlush();
        this._flushGuard++;
      }
      if (this._flushGuard >= this._FLUSH_MAX) {
        console.warn('Polymer.dom.flush aborted. Flush may not be complete.')
      }
    },

    _prepareFlush: function() {
      // TODO(sorvell): There is currently not a good way
      // to process all custom elements mutations under SD polyfill because
      // these mutations may be inside shadowRoots.
      // again make any pending CE mutations that might trigger debouncer
      // additions go...
      if (this._needsTakeRecords) {
        CustomElements.takeRecords();
      }
      for (var i=0; i < this._staticFlushList.length; i++) {
        this._staticFlushList[i]();
      }
    },

    // add to the static list of methods to call when flushing
    addStaticFlush: function(fn) {
      this._staticFlushList.push(fn);
    },

    // remove a function from the static list of methods to call when flushing
    removeStaticFlush: function(fn) {
      var i = this._staticFlushList.indexOf(fn);
      if (i >= 0) {
        this._staticFlushList.splice(i, 1);
      }
    },

    addDebouncer: function(debouncer) {
      this._debouncers.push(debouncer);
      // ensure the list of active debouncers is cleared when done.
      this._finishDebouncer = Polymer.Debounce(this._finishDebouncer,
        this._finishFlush);
    },

    _finishFlush: function() {
      Polymer.dom._debouncers = [];
    }

  });
Polymer.EventApi = (function() {
  'use strict';

  var DomApi = Polymer.DomApi.ctor;
  var Settings = Polymer.Settings;


  /**
   * DomApi.Event allows maniuplation of events compatible with
   * the scoping concepts in Shadow DOM and compatible with both Shady DOM
   * and Shadow DOM. The general usage is
   * `Polymer.dom(event).property`. The `path` property returns `event.path`
   * matching Shadow DOM. The `rootTarget` property returns the first node
   * in the `path` and is the original event target. The `localTarget` property
   * matches event.target under Shadow DOM and is the scoped event target.
   */
  DomApi.Event = function(event) {
    this.event = event;
  };

  if (Settings.useShadow) {

    DomApi.Event.prototype = {

      get rootTarget() {
        return this.event.path[0];
      },

      get localTarget() {
        return this.event.target;
      },

      get path() {
        return this.event.path;
      }

    };

  } else {

    DomApi.Event.prototype = {

      get rootTarget() {
        return this.event.target;
      },

      get localTarget() {
        var current = this.event.currentTarget;
        var currentRoot = current && Polymer.dom(current).getOwnerRoot();
        var p$ = this.path;
        for (var i=0; i < p$.length; i++) {
          if (Polymer.dom(p$[i]).getOwnerRoot() === currentRoot) {
            return p$[i];
          }
        }
      },

      // TODO(sorvell): simulate event.path. This probably incorrect for
      // non-bubbling events.
      get path() {
        if (!this.event._path) {
          var path = [];
          var current = this.rootTarget;
          while (current) {
            path.push(current);
            var insertionPoints = Polymer.dom(current).getDestinationInsertionPoints();
            if (insertionPoints.length) {
              for (var i = 0; i < insertionPoints.length - 1; i++) {
                path.push(insertionPoints[i]);
              }
              current = insertionPoints[insertionPoints.length - 1];
            } else {
              current = Polymer.dom(current).parentNode || current.host;
            }
          }
          // event path includes window in most recent native implementations
          path.push(window);
          this.event._path = path;
        }
        return this.event._path;
      }

    };

  }

  var factory = function(event) {
    if (!event.__eventApi) {
      event.__eventApi = new DomApi.Event(event);
    }
    return event.__eventApi;
  };

  return {
    factory: factory
  };

})();
(function() {
  'use strict';

  var DomApi = Polymer.DomApi.ctor;

  var useShadow = Polymer.Settings.useShadow;

  /**
   * DomApi.classList allows maniuplation of `classList` compatible with 
   * Polymer.dom. The general usage is 
   * `Polymer.dom(node).classList.method(arguments)` where methods and arguments
   * match native DOM.
   */
  Object.defineProperty(DomApi.prototype, 'classList', {
    get: function() {
      if (!this._classList) {
        this._classList = new DomApi.ClassList(this);
      }
      return this._classList;
    },
    configurable: true
  });

  DomApi.ClassList = function(host) {
    this.domApi = host;
    this.node = host.node;
  }

  DomApi.ClassList.prototype = {

    add: function() {
      this.node.classList.add.apply(this.node.classList, arguments);
      this._distributeParent();
    },

    remove: function() {
      this.node.classList.remove.apply(this.node.classList, arguments);
      this._distributeParent();
    },

    toggle: function() {
      this.node.classList.toggle.apply(this.node.classList, arguments);
      this._distributeParent();
    },

    _distributeParent: function() {
      if (!useShadow) {
        this.domApi._maybeDistributeParent();
      }
    },

    contains: function() {
      return this.node.classList.contains.apply(this.node.classList,
        arguments);
    }
  }

})();
(function() {
  'use strict';

    var DomApi = Polymer.DomApi.ctor;
    var Settings = Polymer.Settings;
    var hasDomApi = Polymer.DomApi.hasDomApi;

    /**
     * DomApi.EffectiveNodesObserver tracks changes to an element's 
     * effective child nodes, the same list returned from 
     * `Polymer.dom(node).getEffectiveChildNodes()`.
     * It is not meant to be used directly; it is used by
     * `Polymer.dom(node).observeNodes(callback)` to observe changes.
     */
    DomApi.EffectiveNodesObserver = function(domApi) {
      this.domApi = domApi;
      this.node = this.domApi.node;
      this._listeners = [];
    };

    DomApi.EffectiveNodesObserver.prototype = {

      addListener: function(callback) {
        if (!this._isSetup) {
          this._setup();
          this._isSetup = true;
        }
        var listener = {fn: callback, _nodes: []};
        this._listeners.push(listener);
        this._scheduleNotify();
        return listener;
      },

      removeListener: function(handle) {
        var i = this._listeners.indexOf(handle);
        if (i >= 0) {
          this._listeners.splice(i, 1);
          handle._nodes = [];
        }
        if (!this._hasListeners()) {
          this._cleanup();
          this._isSetup = false;
        }
      },

      _setup: function() {
        this._observeContentElements(this.domApi.childNodes);
      },

      _cleanup: function() {
        this._unobserveContentElements(this.domApi.childNodes);
      },

      _hasListeners: function() {
        return Boolean(this._listeners.length);
      },

      _scheduleNotify: function() {
        if (this._debouncer) {
          this._debouncer.stop();
        }
        this._debouncer = Polymer.Debounce(this._debouncer, 
          this._notify);
        this._debouncer.context = this;
        Polymer.dom.addDebouncer(this._debouncer);
      },

      notify: function() {
        if (this._hasListeners()) {
          this._scheduleNotify();
        }
      },

      _notify: function(mxns) {
        this._beforeCallListeners();
        this._callListeners();
      },

      _beforeCallListeners: function() {
        this._updateContentElements();
      },

      _updateContentElements: function() {
        this._observeContentElements(this.domApi.childNodes);
      },

      _observeContentElements: function(elements) {
        for (var i=0, n; (i < elements.length) && (n=elements[i]); i++) {
          if (this._isContent(n)) {
            n.__observeNodesMap = n.__observeNodesMap || new WeakMap();
            if (!n.__observeNodesMap.has(this)) {
              n.__observeNodesMap.set(this, this._observeContent(n));
            }
          }
        }
      },

      _observeContent: function(content) {
        var self = this;
        var h = Polymer.dom(content).observeNodes(function() {
          self._scheduleNotify();
        });
        h._avoidChangeCalculation = true;
        return h;
      },

      _unobserveContentElements: function(elements) {
        for (var i=0, n, h; (i < elements.length) && (n=elements[i]); i++) {
          if (this._isContent(n)) {
            h = n.__observeNodesMap.get(this);
            if (h) {
              Polymer.dom(n).unobserveNodes(h);
              n.__observeNodesMap.delete(this);
            }
          }
        }
      },

      _isContent: function(node) {
        return (node.localName === 'content');
      },

      _callListeners: function() {
        var o$ = this._listeners;
        var nodes = this._getEffectiveNodes();
        for (var i=0, o; (i < o$.length) && (o=o$[i]); i++) {
          var info = this._generateListenerInfo(o, nodes);
          if (info || o._alwaysNotify) {
            this._callListener(o, info);
          }
        }
      },

      _getEffectiveNodes: function() {
        return this.domApi.getEffectiveChildNodes()
      },

      _generateListenerInfo: function(listener, newNodes) {
        if (listener._avoidChangeCalculation) {
          return true;
        }
        var oldNodes = listener._nodes;
        var info = {
          target: this.node,
          addedNodes: [],
          removedNodes: []
        };
        var splices = Polymer.ArraySplice.calculateSplices(newNodes, oldNodes);
        // process removals
        for (var i=0, s; (i<splices.length) && (s=splices[i]); i++) {
          for (var j=0, n; (j < s.removed.length) && (n=s.removed[j]); j++) {
            info.removedNodes.push(n);
          }
        }
        // process adds
        for (var i=0, s; (i<splices.length) && (s=splices[i]); i++) {
          for (var j=s.index; j < s.index + s.addedCount; j++) {
            info.addedNodes.push(newNodes[j]);
          }
        }
        // update cache
        listener._nodes = newNodes;
        if (info.addedNodes.length || info.removedNodes.length) {
          return info;
        }
      },

      _callListener: function(listener, info) {
        return listener.fn.call(this.node, info);
      },

      enableShadowAttributeTracking: function() {}

    };

    if (Settings.useShadow) {

      var baseSetup = DomApi.EffectiveNodesObserver.prototype._setup;
      var baseCleanup = DomApi.EffectiveNodesObserver.prototype._cleanup;

      var beforeCallListeners = DomApi.EffectiveNodesObserver
        .prototype._beforeCallListeners;

      Polymer.Base.extend(DomApi.EffectiveNodesObserver.prototype, {
        
        _setup: function() {
          if (!this._observer) {
            var self = this;
            this._mutationHandler = function(mxns) {
              if (mxns && mxns.length) {
                self._scheduleNotify();
              }
            };
            this._observer = new MutationObserver(this._mutationHandler);
            this._boundFlush = function() {
              self._flush();
            }
            Polymer.dom.addStaticFlush(this._boundFlush);
            // NOTE: subtree true is way too aggressive, but it easily catches
            // attribute changes on children. These changes otherwise require
            // attribute observers on every child. Testing has shown this
            // approach to be more efficient. 
            // TODO(sorvell): do we still need to include an option to defeat
            // attribute tracking?
            this._observer.observe(this.node, { childList: true });
          }
          baseSetup.call(this);
        },

        _cleanup: function() {
          this._observer.disconnect();
          this._observer = null;
          this._mutationHandler = null;
          Polymer.dom.removeStaticFlush(this._boundFlush);
          baseCleanup.call(this);
        },

        _flush: function() {
          if (this._observer) {
            this._mutationHandler(this._observer.takeRecords());
          }
        },

        enableShadowAttributeTracking: function() {
          if (this._observer) {
            // provoke all listeners needed for <content> observation
            // to always call listeners when no-op changes occur (which may
            // affect lower distributions.
            this._makeContentListenersAlwaysNotify();
            this._observer.disconnect();
            this._observer.observe(this.node, { 
              childList: true,
              attributes: true,
              subtree: true
            });
            var root = this.domApi.getOwnerRoot();
            var host = root && root.host;
            if (host && Polymer.dom(host).observer) {
              Polymer.dom(host).observer.enableShadowAttributeTracking();
            }
          }
        },

        _makeContentListenersAlwaysNotify: function() {
          for (var i=0, h; i < this._listeners.length ; i++) {
            h = this._listeners[i];
            h._alwaysNotify = h._isContentListener;
          }
        }

      });

    }

})();
(function() {
  'use strict';

    var DomApi = Polymer.DomApi.ctor;
    var Settings = Polymer.Settings;

    /**
     * DomApi.DistributedNodesObserver notifies when the list returned by 
     * a <content> element's `getDistributedNodes()` may have changed.
     * It is not meant to be used directly; it is used by
     * `Polymer.dom(node).observeNodes(callback)` to observe changes to
     * `<content>.getDistributedNodes()`.
     */
    DomApi.DistributedNodesObserver = function(domApi) {
      DomApi.EffectiveNodesObserver.call(this, domApi);
    };

    DomApi.DistributedNodesObserver.prototype = 
      Object.create(DomApi.EffectiveNodesObserver.prototype);

    Polymer.Base.extend(DomApi.DistributedNodesObserver.prototype, {

      // NOTE: ShadyDOM distribute provokes notification of these observers
      // so no setup is required.
      _setup: function() {},

      _cleanup: function() {},

      // no need to update sub-elements since <content> does not nest
      // (but note that <slot> will)
      _beforeCallListeners: function() {},

      _getEffectiveNodes: function() {
        return this.domApi.getDistributedNodes();
      }

    });

    if (Settings.useShadow) {
      
      Polymer.Base.extend(DomApi.DistributedNodesObserver.prototype, {
        
        // NOTE: Under ShadowDOM we must observe the host element for
        // changes.
        _setup: function() {
          if (!this._observer) {
            var root = this.domApi.getOwnerRoot();
            var host = root && root.host;
            if (host) {
              var self = this;
              this._observer = Polymer.dom(host).observeNodes(function() {
                self._scheduleNotify();
              });
              // NOTE: we identify this listener as needed for <content>
              // notification so that enableShadowAttributeTracking 
              // can find these observers an ensure that we pass always 
              // pass notifications down.
              this._observer._isContentListener = true;
              if (this._hasAttrSelect()) {
                Polymer.dom(host).observer.enableShadowAttributeTracking();
              }
            }
          }
        },

        _hasAttrSelect: function() {
          var select = this.node.getAttribute('select');
          return select && select.match(/[[.]+/);
        },

        _cleanup: function() {
          var root = this.domApi.getOwnerRoot();
          var host = root && root.host;
          if (host) {
            Polymer.dom(host).unobserveNodes(this._observer);
          }
          this._observer = null;
        }

      });
    
    }

})();
(function() {
    /**
      Implements a pared down version of ShadowDOM's scoping, which is easy to
      polyfill across browsers.
    */
    var DomApi = Polymer.DomApi;
    var TreeApi = Polymer.TreeApi;

    Polymer.Base._addFeature({

      _prepShady: function() {
        // Use this system iff localDom is needed.
        this._useContent = this._useContent || Boolean(this._template);
      },

      _setupShady: function() {
        // object shaping...
        this.shadyRoot = null;
        if (!this.__domApi) {
          this.__domApi = null;
        }
        if (!this.__dom) {
          this.__dom = null;
        }
        if (!this._ownerShadyRoot) {
          this._ownerShadyRoot = undefined;
        }
      },

      // called as part of content initialization, prior to template stamping
      _poolContent: function() {
        if (this._useContent) {
          // capture lightChildren to help reify dom scoping
          TreeApi.Logical.saveChildNodes(this);
        }
      },

      // called as part of content initialization, after template stamping
      _setupRoot: function() {
        if (this._useContent) {
          this._createLocalRoot();
          // light elements may not be upgraded if they are light children
          // and there is no configuration flow (no dataHost) and they are
          // removed from document by shadyDOM distribution
          // so we ensure this here
          if (!this.dataHost) {
            upgradeLogicalChildren(TreeApi.Logical.getChildNodes(this));
          }
        }
      },

      _createLocalRoot: function() {
        this.shadyRoot = this.root;
        this.shadyRoot._distributionClean = false;
        this.shadyRoot._hasDistributed = false;
        this.shadyRoot._isShadyRoot = true;
        this.shadyRoot._dirtyRoots = [];
        // capture insertion point list
        var i$ = this.shadyRoot._insertionPoints = !this._notes || 
          this._notes._hasContent ?
          this.shadyRoot.querySelectorAll('content') : [];
        // save logical tree info
        // a. for shadyRoot 
        // b. for insertion points (fallback) 
        // c. for parents of insertion points
        TreeApi.Logical.saveChildNodes(this.shadyRoot);
        for (var i=0, c; i < i$.length; i++) {
          c = i$[i];
          TreeApi.Logical.saveChildNodes(c);
          TreeApi.Logical.saveChildNodes(c.parentNode);
        }
        this.shadyRoot.host = this;
      },

      /**
       * Return the element whose local dom within which this element
       * is contained. This is a shorthand for
       * `Polymer.dom(this).getOwnerRoot().host`.
       */
      get domHost() {
        var root = Polymer.dom(this).getOwnerRoot();
        return root && root.host;
      },

      /**
       * Force this element to distribute its children to its local dom.
       * A user should call `distributeContent` if distribution has been
       * invalidated due to changes to selectors on child elements that
       * effect distribution that were not made via `Polymer.dom`.
       * For example, if an element contains an insertion point with
       * `<content select=".foo">` and a `foo` class is added to a child,
       * then `distributeContent` must be called to update
       * local dom distribution.
       * @method distributeContent
       * @param {boolean} updateInsertionPoints Shady DOM does not detect
       *   <content> insertion that is nested in a sub-tree being appended.
       *   Set to true to distribute to newly added nested <content>'s.
       */
      distributeContent: function(updateInsertionPoints) {
        if (this.shadyRoot) {
          this.shadyRoot._invalidInsertionPoints = 
            this.shadyRoot._invalidInsertionPoints || updateInsertionPoints;
          // Distribute the host that's the top of this element's distribution
          // tree. Distributing that host will *always* distibute this element.
          var host = getTopDistributingHost(this);
          Polymer.dom(this)._lazyDistribute(host);
        }
      },

      _distributeContent: function() {
        if (this._useContent && !this.shadyRoot._distributionClean) {
          if (this.shadyRoot._invalidInsertionPoints) {
            Polymer.dom(this)._updateInsertionPoints(this);
            this.shadyRoot._invalidInsertionPoints = false;
          }
          // logically distribute self
          this._beginDistribute();
          this._distributeDirtyRoots();
          this._finishDistribute();
        }
      },

      _beginDistribute: function() {
        if (this._useContent && DomApi.hasInsertionPoint(this.shadyRoot)) {
          // reset distributions
          this._resetDistribution();
          // compute which nodes should be distributed where
          // TODO(jmesserly): this is simplified because we assume a single
          // ShadowRoot per host and no `<shadow>`.
          this._distributePool(this.shadyRoot, this._collectPool());
        }
      },

      _distributeDirtyRoots: function() {
        var c$ = this.shadyRoot._dirtyRoots;
        for (var i=0, l= c$.length, c; (i<l) && (c=c$[i]); i++) {
          c._distributeContent();
        }
        this.shadyRoot._dirtyRoots = [];
      },

      _finishDistribute: function() {
        // compose self
        if (this._useContent) {
          // note: it's important to mark this clean before distribution
          // so that attachment that provokes additional distribution (e.g. 
          // adding something to your parentNode) works
          this.shadyRoot._distributionClean = true;
          if (DomApi.hasInsertionPoint(this.shadyRoot)) {
            this._composeTree();
            // NOTE: send a signal to insertion points that we have distributed
            // which informs effective children observers
            notifyContentObservers(this.shadyRoot);
          } else {
            if (!this.shadyRoot._hasDistributed) {
              TreeApi.Composed.clearChildNodes(this);
              this.appendChild(this.shadyRoot);
            } else {
              // simplified non-tree walk composition
              var children = this._composeNode(this);
              this._updateChildNodes(this, children);
            }
          }
          // NOTE: send a signal to any Polymer.dom node observers
          // to report the initial set of childNodes
          if (!this.shadyRoot._hasDistributed) {
            notifyInitialDistribution(this);
          }
          this.shadyRoot._hasDistributed = true;
        }
      },

      /**
       * Polyfill for Element.prototype.matches, which is sometimes still
       * prefixed.
       *
       * @method elementMatches
       * @param {string} selector Selector to test.
       * @param {Element=} node Element to test the selector against.
       * @return {boolean} Whether the element matches the selector.
       */
      elementMatches: function(selector, node) {
        // Alternatively we could just polyfill it somewhere.
        // Note that the arguments are reversed from what you might expect.
        node = node || this;
        return DomApi.matchesSelector.call(node, selector);
      },

      // Many of the following methods are all conceptually static, but they are
      // included here as "protected" methods to allow overriding.

      _resetDistribution: function() {
        // light children
        var children = TreeApi.Logical.getChildNodes(this);
        for (var i = 0; i < children.length; i++) {
          var child = children[i];
          if (child._destinationInsertionPoints) {
            child._destinationInsertionPoints = undefined;
          }
          if (isInsertionPoint(child)) {
            clearDistributedDestinationInsertionPoints(child);
          }
        }
        // insertion points
        var root = this.shadyRoot;
        var p$ = root._insertionPoints;
        for (var j = 0; j < p$.length; j++) {
          p$[j]._distributedNodes = [];
        }
      },

      // Gather the pool of nodes that should be distributed. We will combine
      // these with the "content root" to arrive at the composed tree.
      _collectPool: function() {
        var pool = [];
        var children = TreeApi.Logical.getChildNodes(this);
        for (var i = 0; i < children.length; i++) {
          var child = children[i];
          if (isInsertionPoint(child)) {
            pool.push.apply(pool, child._distributedNodes);
          } else {
            pool.push(child);
          }
        }
        return pool;
      },

      // perform "logical" distribution; note, no actual dom is moved here,
      // instead elements are distributed into a `content._distributedNodes`
      // array where applicable.
      _distributePool: function(node, pool) {
        var p$ = node._insertionPoints;
        for (var i=0, l=p$.length, p; (i<l) && (p=p$[i]); i++) {
          this._distributeInsertionPoint(p, pool);
          // provoke redistribution on insertion point parents
          // must do this on all candidate hosts since distribution in this
          // scope invalidates their distribution.
          maybeRedistributeParent(p, this);
        }
      },

      _distributeInsertionPoint: function(content, pool) {
        // distribute nodes from the pool that this selector matches
        var anyDistributed = false;
        for (var i=0, l=pool.length, node; i < l; i++) {
          node=pool[i];
          // skip nodes that were already used
          if (!node) {
            continue;
          }
          // distribute this node if it matches
          if (this._matchesContentSelect(node, content)) {
            distributeNodeInto(node, content);
            // remove this node from the pool
            pool[i] = undefined;
            // since at least one node matched, we won't need fallback content
            anyDistributed = true;
          }
        }
        // Fallback content if nothing was distributed here
        if (!anyDistributed) {
          var children = TreeApi.Logical.getChildNodes(content);
          for (var j = 0; j < children.length; j++) {
            distributeNodeInto(children[j], content);
          }
        }
      },

      // Reify dom such that it is at its correct rendering position
      // based on logical distribution.
      _composeTree: function() {
        this._updateChildNodes(this, this._composeNode(this));
        var p$ = this.shadyRoot._insertionPoints;
        for (var i=0, l=p$.length, p, parent; (i<l) && (p=p$[i]); i++) {
          parent = TreeApi.Logical.getParentNode(p);
          if (!parent._useContent && (parent !== this) &&
            (parent !== this.shadyRoot)) {
            this._updateChildNodes(parent, this._composeNode(parent));
          }
        }
      },

      // Returns the list of nodes which should be rendered inside `node`.
      _composeNode: function(node) {
        var children = [];
        var c$ = TreeApi.Logical.getChildNodes(node.shadyRoot || node);
        for (var i = 0; i < c$.length; i++) {
          var child = c$[i];
          if (isInsertionPoint(child)) {
            var distributedNodes = child._distributedNodes;
            for (var j = 0; j < distributedNodes.length; j++) {
              var distributedNode = distributedNodes[j];
              if (isFinalDestination(child, distributedNode)) {
                children.push(distributedNode);
              }
            }
          } else {
            children.push(child);
          }
        }
        return children;
      },

      // Ensures that the rendered node list inside `container` is `children`.
      _updateChildNodes: function(container, children) {
        var composed = TreeApi.Composed.getChildNodes(container);
        var splices =
          Polymer.ArraySplice.calculateSplices(children, composed);
        // process removals
        for (var i=0, d=0, s; (i<splices.length) && (s=splices[i]); i++) {
          for (var j=0, n; (j < s.removed.length) && (n=s.removed[j]); j++) {
            // check if the node is still where we expect it is before trying
            // to remove it; this can happen if Polymer.dom moves a node and 
            // then schedules its previous host for distribution resulting in
            // the node being removed here.
            if (TreeApi.Composed.getParentNode(n) === container) {
              TreeApi.Composed.removeChild(container, n);
            }
            composed.splice(s.index + d, 1);
          }
          d -= s.addedCount;
        }
        // process adds
        for (var i=0, s, next; (i<splices.length) && (s=splices[i]); i++) {
          next = composed[s.index];
          for (var j=s.index, n; j < s.index + s.addedCount; j++) {
            n = children[j];
            TreeApi.Composed.insertBefore(container, n, next);
            // TODO(sorvell): is this splice strictly needed?
            composed.splice(j, 0, n);
          }
        }
      },

      _matchesContentSelect: function(node, contentElement) {
        var select = contentElement.getAttribute('select');
        // no selector matches all nodes (including text)
        if (!select) {
          return true;
        }
        select = select.trim();
        // same thing if it had only whitespace
        if (!select) {
          return true;
        }
        // selectors can only match Elements
        if (!(node instanceof Element)) {
          return false;
        }
        // only valid selectors can match:
        //   TypeSelector
        //   *
        //   ClassSelector
        //   IDSelector
        //   AttributeSelector
        //   negation
        var validSelectors = /^(:not\()?[*.#[a-zA-Z_|]/;
        if (!validSelectors.test(select)) {
          return false;
        }
        return this.elementMatches(select, node);
      },

      // system override point
      _elementAdd: function() {},

      // system override point
      _elementRemove: function() {}

    });

    function distributeNodeInto(child, insertionPoint) {
      insertionPoint._distributedNodes.push(child);
      var points = child._destinationInsertionPoints;
      if (!points) {
        child._destinationInsertionPoints = [insertionPoint];
      } else {
        points.push(insertionPoint);
      }
    }

    function clearDistributedDestinationInsertionPoints(content) {
      var e$ = content._distributedNodes;
      if (e$) {
        for (var i=0; i < e$.length; i++) {
          var d = e$[i]._destinationInsertionPoints;
          if (d) {
            // this is +1 because these insertion points are *not* in this scope
            d.splice(d.indexOf(content)+1, d.length);
          }
        }
      }
    }

    // dirty a shadyRoot if a change may trigger reprojection!
    function maybeRedistributeParent(content, host) {
      // only get logical parent.
      var parent = TreeApi.Logical.getParentNode(content);
      if (parent && parent.shadyRoot &&
          DomApi.hasInsertionPoint(parent.shadyRoot) &&
          parent.shadyRoot._distributionClean) {
        parent.shadyRoot._distributionClean = false;
        host.shadyRoot._dirtyRoots.push(parent);
      }
    }

    function isFinalDestination(insertionPoint, node) {
      var points = node._destinationInsertionPoints;
      return points && points[points.length - 1] === insertionPoint;
    }

    function isInsertionPoint(node) {
      // TODO(jmesserly): we could add back 'shadow' support here.
      return node.localName == 'content';
    }

    // returns the host that's the top of this host's distribution tree
    function getTopDistributingHost(host) {
      while (host && hostNeedsRedistribution(host)) {
        host = host.domHost;
      }
      return host;
    }

    // Return true if a host's children includes
    // an insertion point that selects selectively
    function hostNeedsRedistribution(host) {
      var c$ = TreeApi.Logical.getChildNodes(host);
      for (var i=0, c; i < c$.length; i++) {
        c = c$[i];
        if (c.localName && c.localName === 'content') {
          return host.domHost;
        }
      }
    }

    function notifyContentObservers(root) {
      for (var i=0, c; i < root._insertionPoints.length; i++) {
        c = root._insertionPoints[i];
        if (DomApi.hasApi(c)) {
          Polymer.dom(c).notifyObserver();
        }
      }
    }

    function notifyInitialDistribution(host) {
      if (DomApi.hasApi(host)) {
        Polymer.dom(host).notifyObserver();
      }
    }

    var needsUpgrade = window.CustomElements && !CustomElements.useNative;

    function upgradeLogicalChildren(children) {
      if (needsUpgrade && children) {
        for (var i=0; i < children.length; i++) {
          CustomElements.upgrade(children[i]);
        }
      }
    }
  })();
/**
    Implements `shadyRoot` compatible dom scoping using native ShadowDOM.
  */

  // Transform styles if not using ShadowDOM or if flag is set.

  if (Polymer.Settings.useShadow) {

    Polymer.Base._addFeature({

      // no-op's when ShadowDOM is in use
      _poolContent: function() {},
      _beginDistribute: function() {},
      distributeContent: function() {},
      _distributeContent: function() {},
      _finishDistribute: function() {},
      
      // create a shadowRoot
      _createLocalRoot: function() {
        this.createShadowRoot();
        this.shadowRoot.appendChild(this.root);
        this.root = this.shadowRoot;
      }

    });

  };
Polymer.Async = {

  _currVal: 0,
  _lastVal: 0,
  _callbacks: [],
  _twiddleContent: 0,
  _twiddle: document.createTextNode(''),

  run: function (callback, waitTime) {
    if (waitTime > 0) {
      return ~setTimeout(callback, waitTime);
    } else {
      this._twiddle.textContent = this._twiddleContent++;
      this._callbacks.push(callback);
      return this._currVal++;
    }
  },

  cancel: function(handle) {
    if (handle < 0) {
      clearTimeout(~handle);
    } else {
      var idx = handle - this._lastVal;
      if (idx >= 0) {
        if (!this._callbacks[idx]) {
          throw 'invalid async handle: ' + handle;
        }
        this._callbacks[idx] = null;
      }
    }
  },

  _atEndOfMicrotask: function() {
    var len = this._callbacks.length;
    for (var i=0; i<len; i++) {
      var cb = this._callbacks[i];
      if (cb) {
        try {
          cb();
        } catch(e) {
          // Clear queue up to this point & start over after throwing
          i++;
          this._callbacks.splice(0, i);
          this._lastVal += i;
          this._twiddle.textContent = this._twiddleContent++;
          throw e;
        }
      }
    }
    this._callbacks.splice(0, len);
    this._lastVal += len;
  }
};

new window.MutationObserver(function() {
    Polymer.Async._atEndOfMicrotask();
  }).observe(Polymer.Async._twiddle, {characterData: true});
Polymer.Debounce = (function() {
  
  // usage
  
  // invoke cb.call(this) in 100ms, unless the job is re-registered,
  // which resets the timer
  // 
  // this.job = this.debounce(this.job, cb, 100)
  //
  // returns a handle which can be used to re-register a job

  var Async = Polymer.Async;
  
  var Debouncer = function(context) {
    this.context = context;
    var self = this;
    this.boundComplete = function() {
      self.complete();
    }
  };
  
  Debouncer.prototype = {
    go: function(callback, wait) {
      var h;
      this.finish = function() {
        Async.cancel(h);
      };
      h = Async.run(this.boundComplete, wait);
      this.callback = callback;
    },
    stop: function() {
      if (this.finish) {
        this.finish();
        this.finish = null;
      }
    },
    complete: function() {
      if (this.finish) {
        this.stop();
        this.callback.call(this.context);
      }
    }
  };

  function debounce(debouncer, callback, wait) {
    if (debouncer) {
      debouncer.stop();
    } else {
      debouncer = new Debouncer(this);
    }
    debouncer.go(callback, wait);
    return debouncer;
  }
  
  // exports 

  return debounce;
  
})();
Polymer.Base._addFeature({

    _setupDebouncers: function() {
      this._debouncers = {};
    },

    /**
     * Call `debounce` to collapse multiple requests for a named task into
     * one invocation which is made after the wait time has elapsed with
     * no new request.  If no wait time is given, the callback will be called
     * at microtask timing (guaranteed before paint).
     *
     *     debouncedClickAction: function(e) {
     *       // will not call `processClick` more than once per 100ms
     *       this.debounce('click', function() {
     *        this.processClick();
     *       }, 100);
     *     }
     *
     * @method debounce
     * @param {String} jobName String to indentify the debounce job.
     * @param {Function} callback Function that is called (with `this`
     *   context) when the wait time elapses.
     * @param {number} wait Optional wait time in milliseconds (ms) after the
     *   last signal that must elapse before invoking `callback`
     */
    debounce: function(jobName, callback, wait) {
      return this._debouncers[jobName] = Polymer.Debounce.call(this,
        this._debouncers[jobName], callback, wait);
    },

    /**
     * Returns whether a named debouncer is active.
     *
     * @method isDebouncerActive
     * @param {String} jobName The name of the debouncer started with `debounce`
     * @return {boolean} Whether the debouncer is active (has not yet fired).
     */
    isDebouncerActive: function(jobName) {
      var debouncer = this._debouncers[jobName];
      return !!(debouncer && debouncer.finish);
    },

    /**
     * Immediately calls the debouncer `callback` and inactivates it.
     *
     * @method flushDebouncer
     * @param {String} jobName The name of the debouncer started with `debounce`
     */
    flushDebouncer: function(jobName) {
      var debouncer = this._debouncers[jobName];
      if (debouncer) {
        debouncer.complete();
      }
    },

    /**
     * Cancels an active debouncer.  The `callback` will not be called.
     *
     * @method cancelDebouncer
     * @param {String} jobName The name of the debouncer started with `debounce`
     */
    cancelDebouncer: function(jobName) {
      var debouncer = this._debouncers[jobName];
      if (debouncer) {
        debouncer.stop();
      }
    }

  });
Polymer.DomModule = document.createElement('dom-module');

  Polymer.Base._addFeature({

    _registerFeatures: function() {
      // identity
      this._prepIs();
      // shared behaviors
      this._prepBehaviors();
      // factory
      this._prepConstructor();
      // template
      this._prepTemplate();
      // dom encapsulation
      this._prepShady();
      // fast access to property info
      this._prepPropertyInfo();
    },

    _prepBehavior: function(b) {
      this._addHostAttributes(b.hostAttributes);
    },

    _initFeatures: function() {
      this._registerHost();
      if (this._template) {
        // manage local dom
        this._poolContent();
        // host stack
        this._beginHosting();
        // instantiate template
        this._stampTemplate();
        // host stack
        this._endHosting();
      }
      // install host attributes
      this._marshalHostAttributes();
      // setup debouncers
      this._setupDebouncers();
      // instance shared behaviors
      this._marshalBehaviors();
      // top-down initial distribution, configuration, & ready callback
      this._tryReady();
    },

    _marshalBehavior: function(b) {
    }

  });
/**
 * Scans a template to produce an annotation list that that associates
 * metadata culled from markup with tree locations
 * metadata and information to associate the metadata with nodes in an instance.
 *
 * Supported expressions include:
 *
 * Double-mustache annotations in text content. The annotation must be the only
 * content in the tag, compound expressions are not supported.
 *
 *     <[tag]>{{annotation}}<[tag]>
 *
 * Double-escaped annotations in an attribute, either {{}} or [[]].
 *
 *     <[tag] someAttribute="{{annotation}}" another="[[annotation]]"><[tag]>
 *
 * `on-` style event declarations.
 *
 *     <[tag] on-<event-name>="annotation"><[tag]>
 *
 * Note that the `annotations` feature does not implement any behaviors
 * associated with these expressions, it only captures the data.
 *
 * Generated data-structure:
 *
 *     [
 *       {
 *         id: '<id>',
 *         events: [
 *           {
 *             name: '<name>'
 *             value: '<annotation>'
 *           }, ...
 *         ],
 *         bindings: [
 *           {
 *             kind: ['text'|'attribute'],
 *             mode: ['{'|'['],
 *             name: '<name>'
 *             value: '<annotation>'
 *           }, ...
 *         ],
 *         // TODO(sjmiles): this is annotation-parent, not node-parent
 *         parent: <reference to parent annotation object>,
 *         index: <integer index in parent's childNodes collection>
 *       },
 *       ...
 *     ]
 *
 * @class Template feature
 */

  // null-array (shared empty array to avoid null-checks)
  Polymer.nar = [];

  Polymer.Annotations = {

    // preprocess-time

    // construct and return a list of annotation records
    // by scanning `template`'s content
    //
    parseAnnotations: function(template) {
      var list = [];
      var content = template._content || template.content;
      this._parseNodeAnnotations(content, list,
        template.hasAttribute('strip-whitespace'));
      return list;
    },

    // add annotations gleaned from subtree at `node` to `list`
    _parseNodeAnnotations: function(node, list, stripWhiteSpace) {
      return node.nodeType === Node.TEXT_NODE ?
        this._parseTextNodeAnnotation(node, list) :
          // TODO(sjmiles): are there other nodes we may encounter
          // that are not TEXT_NODE but also not ELEMENT?
          this._parseElementAnnotations(node, list, stripWhiteSpace);
    },

    _bindingRegex: (function() {
      var IDENT  = '(?:' + '[a-zA-Z_$][\\w.:$-*]*' + ')';
      var NUMBER = '(?:' + '[-+]?[0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?' + ')';
      var SQUOTE_STRING = '(?:' + '\'(?:[^\'\\\\]|\\\\.)*\'' + ')';
      var DQUOTE_STRING = '(?:' + '"(?:[^"\\\\]|\\\\.)*"' + ')';
      var STRING = '(?:' + SQUOTE_STRING + '|' + DQUOTE_STRING + ')';
      var ARGUMENT = '(?:' + IDENT + '|' + NUMBER + '|' +  STRING + '\\s*' + ')';
      var ARGUMENTS = '(?:' + ARGUMENT + '(?:,\\s*' + ARGUMENT + ')*' + ')';
      var ARGUMENT_LIST = '(?:' + '\\(\\s*' +
                                    '(?:' + ARGUMENTS + '?' + ')' +
                                  '\\)\\s*' + ')';
      var BINDING = '(' + IDENT + '\\s*' + ARGUMENT_LIST + '?' + ')'; // Group 3
      var OPEN_BRACKET = '(\\[\\[|{{)' + '\\s*';
      var CLOSE_BRACKET = '(?:]]|}})';
      var NEGATE = '(?:(!)\\s*)?'; // Group 2
      var EXPRESSION = OPEN_BRACKET + NEGATE + BINDING + CLOSE_BRACKET;
      return new RegExp(EXPRESSION, "g");
    })(),

    // TODO(kschaaf): We could modify this to allow an escape mechanism by
    // looking for the escape sequence in each of the matches and converting
    // the part back to a literal type, and then bailing if only literals
    // were found
    _parseBindings: function(text) {
      var re = this._bindingRegex;
      var parts = [];
      var lastIndex = 0;
      var m;
      // Example: "literal1{{prop}}literal2[[!compute(foo,bar)]]final"
      // Regex matches:
      //        Iteration 1:  Iteration 2:
      // m[1]: '{{'          '[['
      // m[2]: ''            '!'
      // m[3]: 'prop'        'compute(foo,bar)'
      while ((m = re.exec(text)) !== null) {
        // Add literal part
        if (m.index > lastIndex) {
          parts.push({literal: text.slice(lastIndex, m.index)});
        }
        // Add binding part
        // Mode (one-way or two)
        var mode = m[1][0];
        var negate = Boolean(m[2]);
        var value = m[3].trim();
        var customEvent, notifyEvent, colon;
        if (mode == '{' && (colon = value.indexOf('::')) > 0) {
          notifyEvent = value.substring(colon + 2);
          value = value.substring(0, colon);
          customEvent = true;
        }
        parts.push({
          compoundIndex: parts.length,
          value: value,
          mode: mode,
          negate: negate,
          event: notifyEvent,
          customEvent: customEvent
        });
        lastIndex = re.lastIndex;
      }
      // Add a final literal part
      if (lastIndex && lastIndex < text.length) {
        var literal = text.substring(lastIndex);
        if (literal) {
          parts.push({
            literal: literal
          });
        }
      }
      if (parts.length) {
        return parts;
      }
    },

    _literalFromParts: function(parts) {
      var s = '';
      for (var i=0; i<parts.length; i++) {
        var literal = parts[i].literal;
        s += literal || '';
      }
      return s;
    },

    // add annotations gleaned from TextNode `node` to `list`
    _parseTextNodeAnnotation: function(node, list) {
      var parts = this._parseBindings(node.textContent);
      if (parts) {
        // Initialize the textContent with any literal parts
        // NOTE: default to a space here so the textNode remains; some browsers
        // (IE) evacipate an empty textNode following cloneNode/importNode.
        node.textContent = this._literalFromParts(parts) || ' ';
        var annote = {
          bindings: [{
            kind: 'text',
            name: 'textContent',
            parts: parts,
            isCompound: parts.length !== 1
          }]
        };
        list.push(annote);
        return annote;
      }
    },

    // add annotations gleaned from Element `node` to `list`
    _parseElementAnnotations: function(element, list, stripWhiteSpace) {
      var annote = {
        bindings: [],
        events: []
      };
      if (element.localName === 'content') {
        list._hasContent = true;
      }
      this._parseChildNodesAnnotations(element, annote, list, stripWhiteSpace);
      // TODO(sjmiles): is this for non-ELEMENT nodes? If so, we should
      // change the contract of this method, or filter these out above.
      if (element.attributes) {
        this._parseNodeAttributeAnnotations(element, annote, list);
        // TODO(sorvell): ad hoc callback for doing work on elements while
        // leveraging annotator's tree walk.
        // Consider adding an node callback registry and moving specific
        // processing out of this module.
        if (this.prepElement) {
          this.prepElement(element);
        }
      }
      if (annote.bindings.length || annote.events.length || annote.id) {
        list.push(annote);
      }
      return annote;
    },

    // add annotations gleaned from children of `root` to `list`, `root`'s
    // `annote` is supplied as it is the annote.parent of added annotations
    _parseChildNodesAnnotations: function(root, annote, list, stripWhiteSpace) {
      if (root.firstChild) {
        var node = root.firstChild;
        var i = 0;
        while (node) {
          var next = node.nextSibling;
          if (node.localName === 'template' &&
            !node.hasAttribute('preserve-content')) {
            this._parseTemplate(node, i, list, annote);
          }
          // collapse adjacent textNodes: fixes an IE issue that can cause
          // text nodes to be inexplicably split =(
          // note that root.normalize() should work but does not so we do this
          // manually.
          if (node.nodeType === Node.TEXT_NODE) {
            var n = next;
            while (n && (n.nodeType === Node.TEXT_NODE)) {
              node.textContent += n.textContent;
              next = n.nextSibling;
              root.removeChild(n);
              n = next;
            }
            // optionally strip whitespace
            if (stripWhiteSpace && !node.textContent.trim()) {
              root.removeChild(node);
              // decrement index since node is removed
              i--;
            }
          }
          // if this node didn't get evacipated, parse it.
          if (node.parentNode) {
            var childAnnotation = this._parseNodeAnnotations(node, list,
              stripWhiteSpace);
            if (childAnnotation) {
              childAnnotation.parent = annote;
              childAnnotation.index = i;
            }
          }
          node = next;
          i++;
        }
      }
    },

    // 1. Parse annotations from the template and memoize them on
    //    content._notes (recurses into nested templates)
    // 2. Remove template.content and store it in annotation list, where it
    //    will be the responsibility of the host to set it back to the template
    //    (this is both an optimization to avoid re-stamping nested template
    //    children and avoids a bug in Chrome where nested template children
    //    upgrade)
    _parseTemplate: function(node, index, list, parent) {
      // TODO(sjmiles): simply altering the .content reference didn't
      // work (there was some confusion, might need verification)
      var content = document.createDocumentFragment();
      content._notes = this.parseAnnotations(node);
      content.appendChild(node.content);
      // TODO(sjmiles): using `nar` to avoid unnecessary allocation;
      // in general the handling of these arrays needs some cleanup
      // in this module
      list.push({
        bindings: Polymer.nar,
        events: Polymer.nar,
        templateContent: content,
        parent: parent,
        index: index
      });
    },

    // add annotation data from attributes to the `annotation` for node `node`
    // TODO(sjmiles): the distinction between an `annotation` and
    // `annotation data` is not as clear as it could be
    _parseNodeAttributeAnnotations: function(node, annotation) {
      // Make copy of original attribute list, since the order may change
      // as attributes are added and removed
      var attrs = Array.prototype.slice.call(node.attributes);
      for (var i=attrs.length-1, a; (a=attrs[i]); i--) {
        var n = a.name;
        var v = a.value;
        var b;
        // events (on-*)
        if (n.slice(0, 3) === 'on-') {
          node.removeAttribute(n);
          annotation.events.push({
            name: n.slice(3),
            value: v
          });
        }
        // bindings (other attributes)
        else if (b = this._parseNodeAttributeAnnotation(node, n, v)) {
          annotation.bindings.push(b);
        }
        // static id
        else if (n === 'id') {
          annotation.id = v;
        }
      }
    },

    // construct annotation data from a generic attribute, or undefined
    _parseNodeAttributeAnnotation: function(node, name, value) {
      var parts = this._parseBindings(value);
      if (parts) {
        // Attribute or property
        var origName = name;
        var kind = 'property';
        if (name[name.length-1] == '$') {
          name = name.slice(0, -1);
          kind = 'attribute';
        }
        // Initialize attribute bindings with any literal parts
        var literal = this._literalFromParts(parts);
        if (literal && kind == 'attribute') {
          node.setAttribute(name, literal);
        }
        // Clear attribute before removing, since IE won't allow removing
        // `value` attribute if it previously had a value (can't
        // unconditionally set '' before removing since attributes with `$`
        // can't be set using setAttribute)
        if (node.localName === 'input' && origName === 'value') {
          node.setAttribute(origName, '');
        }
        // Remove annotation
        node.removeAttribute(origName);
        // Case hackery: attributes are lower-case, but bind targets
        // (properties) are case sensitive. Gambit is to map dash-case to
        // camel-case: `foo-bar` becomes `fooBar`.
        // Attribute bindings are excepted.
        if (kind === 'property') {
          name = Polymer.CaseMap.dashToCamelCase(name);
        }
        return {
          kind: kind,
          name: name,
          parts: parts,
          literal: literal,
          isCompound: parts.length !== 1
        };
      }
    },

    // instance-time

    findAnnotatedNode: function(root, annote) {
      // recursively ascend tree until we hit root
      var parent = annote.parent &&
        Polymer.Annotations.findAnnotatedNode(root, annote.parent);
      // unwind the stack, returning the indexed node at each level
      if (parent) {
        // note: marginally faster than indexing via childNodes 
        // (http://jsperf.com/childnodes-lookup)
        for (var n=parent.firstChild, i=0; n; n=n.nextSibling) {
          if (annote.index === i++) {
            return n;
          }
        }
      } else {
        return root;
      }
    }

  };
(function() {

    // path fixup for urls in cssText that's expected to 
    // come from a given ownerDocument
    function resolveCss(cssText, ownerDocument) {
      return cssText.replace(CSS_URL_RX, function(m, pre, url, post) {
        return pre + '\'' + 
          resolve(url.replace(/["']/g, ''), ownerDocument) + 
          '\'' + post;
      });
    }

    // url fixup for urls in an element's attributes made relative to 
    // ownerDoc's base url
    function resolveAttrs(element, ownerDocument) {
      for (var name in URL_ATTRS) {
        var a$ = URL_ATTRS[name];
        for (var i=0, l=a$.length, a, at, v; (i<l) && (a=a$[i]); i++) {
          if (name === '*' || element.localName === name) {
            at = element.attributes[a];
            v = at && at.value;
            if (v && (v.search(BINDING_RX) < 0)) {
              at.value = (a === 'style') ?
                resolveCss(v, ownerDocument) :
                resolve(v, ownerDocument);
            }
          }
        }
      }
    }

    function resolve(url, ownerDocument) {
      // do not resolve '#' links, they are used for routing
      if (url && url[0] === '#') {
        return url;
      }      
      var resolver = getUrlResolver(ownerDocument);
      resolver.href = url;
      return resolver.href || url;
    }

    var tempDoc;
    var tempDocBase;
    function resolveUrl(url, baseUri) {
      if (!tempDoc) {
        tempDoc = document.implementation.createHTMLDocument('temp');
        tempDocBase = tempDoc.createElement('base');
        tempDoc.head.appendChild(tempDocBase);
      }
      tempDocBase.href = baseUri;
      return resolve(url, tempDoc);
    }

    function getUrlResolver(ownerDocument) {
      return ownerDocument.__urlResolver || 
        (ownerDocument.__urlResolver = ownerDocument.createElement('a'));
    }

    var CSS_URL_RX = /(url\()([^)]*)(\))/g;
    var URL_ATTRS = {
      '*': ['href', 'src', 'style', 'url'],
      form: ['action']
    };
    var BINDING_RX = /\{\{|\[\[/;

    // exports
    Polymer.ResolveUrl = {
      resolveCss: resolveCss,
      resolveAttrs: resolveAttrs,
      resolveUrl: resolveUrl
    };

  })();
/**
 * Scans a template to produce an annotation object that stores expression
 * metadata along with information to associate the metadata with nodes in an
 * instance.
 *
 * Elements with `id` in the template are noted and marshaled into an
 * the `$` hash in an instance.
 *
 * Example
 *
 *     &lt;template>
 *       &lt;div id="foo">&lt;/div>
 *     &lt;/template>
 *     &lt;script>
 *      Polymer({
 *        task: function() {
 *          this.$.foo.style.color = 'red';
 *        }
 *      });
 *     &lt;/script>
 *
 * Other expressions that are noted include:
 *
 * Double-mustache annotations in text content. The annotation must be the only
 * content in the tag, compound expressions are not (currently) supported.
 *
 *     <[tag]>{{path.to.host.property}}<[tag]>
 *
 * Double-mustache annotations in an attribute.
 *
 *     <[tag] someAttribute="{{path.to.host.property}}"><[tag]>
 *
 * Only immediate host properties can automatically trigger side-effects.
 * Setting `host.path` in the example above triggers the binding, setting
 * `host.path.to.host.property` does not.
 *
 * `on-` style event declarations.
 *
 *     <[tag] on-<event-name>="{{hostMethodName}}"><[tag]>
 *
 * Note: **the `annotations` feature does not actually implement the behaviors
 * associated with these expressions, it only captures the data**.
 *
 * Other optional features contain actual data implementations.
 *
 * @class standard feature: annotations
 */

/*

Scans a template to produce an annotation map that stores expression metadata
and information that associates the metadata to nodes in a template instance.

Supported annotations are:

  * id attributes
  * binding annotations in text nodes
    * double-mustache expressions: {{expression}}
    * double-bracket expressions: [[expression]]
  * binding annotations in attributes
    * attribute-bind expressions: name="{{expression}} || [[expression]]"
    * property-bind expressions: name*="{{expression}} || [[expression]]"
    * property-bind expressions: name:="expression"
  * event annotations
    * event delegation directives: on-<eventName>="expression"

Generated data-structure:

  [
    {
      id: '<id>',
      events: [
        {
          mode: ['auto'|''],
          name: '<name>'
          value: '<expression>'
        }, ...
      ],
      bindings: [
        {
          kind: ['text'|'attribute'|'property'],
          mode: ['auto'|''],
          name: '<name>'
          value: '<expression>'
        }, ...
      ],
      // TODO(sjmiles): confusingly, this is annotation-parent, not node-parent
      parent: <reference to parent annotation>,
      index: <integer index in parent's childNodes collection>
    },
    ...
  ]

TODO(sjmiles): this module should produce either syntactic metadata
(e.g. double-mustache, double-bracket, star-attr), or semantic metadata
(e.g. manual-bind, auto-bind, property-bind). Right now it's half and half.

*/

  Polymer.Base._addFeature({

    // registration-time

    _prepAnnotations: function() {
      if (!this._template) {
        this._notes = [];
      } else {
        // TODO(sorvell): ad hoc method of plugging behavior into Annotations
        var self = this;
        Polymer.Annotations.prepElement = function(element) {
          self._prepElement(element);
        }
        if (this._template._content && this._template._content._notes) {
          this._notes = this._template._content._notes;
        }  else {
          this._notes = Polymer.Annotations.parseAnnotations(this._template);
          this._processAnnotations(this._notes);
        }
        Polymer.Annotations.prepElement = null;
      }
    },

    _processAnnotations: function(notes) {
      for (var i=0; i<notes.length; i++) {
        var note = notes[i];
        // Parse bindings for methods & path roots (models)
        for (var j=0; j<note.bindings.length; j++) {
          var b = note.bindings[j];
          for (var k=0; k<b.parts.length; k++) {
            var p = b.parts[k];
            if (!p.literal) {
              p.signature = this._parseMethod(p.value);
              if (!p.signature) {
                p.model = this._modelForPath(p.value);
              }
            }
          }
        }
        // Recurse into nested templates & bind parent props
        if (note.templateContent) {
          this._processAnnotations(note.templateContent._notes);
          var pp = note.templateContent._parentProps =
            this._discoverTemplateParentProps(note.templateContent._notes);
          var bindings = [];
          for (var prop in pp) {
            bindings.push({
              index: note.index,
              kind: 'property',
              name: '_parent_' + prop,
              parts: [{
                mode: '{',
                model: prop,
                value: prop
              }]
            });
          }
          note.bindings = note.bindings.concat(bindings);
        }
      }
    },

    // Finds all bindings in template content and stores the path roots in
    // the path members in content._parentProps. Each outer template merges
    // inner _parentProps to propagate inner parent property needs to outer
    // templates.
    _discoverTemplateParentProps: function(notes) {
      var pp = {};
      for (var i=0, n; (i<notes.length) && (n=notes[i]); i++) {
        // Find all bindings to parent.* and spread them into _parentPropChain
        for (var j=0, b$=n.bindings, b; (j<b$.length) && (b=b$[j]); j++) {
          for (var k=0, p$=b.parts, p; (k<p$.length) && (p=p$[k]); k++) {
            if (p.signature) {
              var args = p.signature.args;
              for (var kk=0; kk<args.length; kk++) {
                var model = args[kk].model;
                if (model) {
                  pp[model] = true;
                }
              }
            } else {
              if (p.model) {
                pp[p.model] = true;
              }
            }
          }
        }
        // Merge child _parentProps into this _parentProps
        if (n.templateContent) {
          var tpp = n.templateContent._parentProps;
          Polymer.Base.mixin(pp, tpp);
        }
      }
      return pp;
    },

    _prepElement: function(element) {
      Polymer.ResolveUrl.resolveAttrs(element, this._template.ownerDocument);
    },

    // instance-time

    _findAnnotatedNode: Polymer.Annotations.findAnnotatedNode,

    // marshal all teh things
    _marshalAnnotationReferences: function() {
      if (this._template) {
        this._marshalIdNodes();
        this._marshalAnnotatedNodes();
        this._marshalAnnotatedListeners();
      }
    },

    // push configuration references at configure time
    _configureAnnotationReferences: function(config) {
      var notes = this._notes;
      var nodes = this._nodes;
      for (var i=0; i<notes.length; i++) {
        var note = notes[i];
        var node = nodes[i];
        this._configureTemplateContent(note, node);
        this._configureCompoundBindings(note, node);
      }
    },

    // nested template contents have been stored prototypically to avoid
    // unnecessary duplication, here we put references to the
    // indirected contents onto the nested template instances
    _configureTemplateContent: function(note, node) {
      if (note.templateContent) {
        // note: we can rely on _nodes being set here and having the same
        // index as _notes
        node._content = note.templateContent;
      }
    },

    // Compound bindings utilize private storage on the node to store
    // the current state of each value that will be concatenated to generate
    // the final property/attribute/text value
    // Here we initialize the private storage array on the node with any
    // literal parts that won't change (could get fancy and use WeakMap),
    // and configure property bindings to children with the literal parts
    // (textContent and annotations were already initialized in the template)
    _configureCompoundBindings: function(note, node) {
      var bindings = note.bindings;
      for (var i=0; i<bindings.length; i++) {
        var binding = bindings[i];
        if (binding.isCompound) {
          // Create compound storage map
          var storage = node.__compoundStorage__ ||
            (node.__compoundStorage__ = {});
          var parts = binding.parts;
          // Copy literals from parts into storage for this binding
          var literals = new Array(parts.length);
          for (var j=0; j<parts.length; j++) {
            literals[j] = parts[j].literal;
          }
          var name = binding.name;
          storage[name] = literals;
          // Configure properties with their literal parts
          if (binding.literal && binding.kind == 'property') {
            if (node._configValue) {
              node._configValue(name, binding.literal);
            } else {
              node[name] = binding.literal;
            }
          }
        }
      }
    },

    // construct `$` map (from id annotations)
    _marshalIdNodes: function() {
      this.$ = {};
      for (var i=0, l=this._notes.length, a; (i<l) && (a=this._notes[i]); i++) {
        if (a.id) {
          this.$[a.id] = this._findAnnotatedNode(this.root, a);
        }
      }
    },

    // concretize `_nodes` map (from anonymous annotations)
    _marshalAnnotatedNodes: function() {
      if (this._notes && this._notes.length) {
        var r = new Array(this._notes.length);
        for (var i=0; i < this._notes.length; i++) {
          r[i] = this._findAnnotatedNode(this.root, this._notes[i]);
        }
        this._nodes = r;
      }
    },

    // install event listeners (from event annotations)
    _marshalAnnotatedListeners: function() {
      for (var i=0, l=this._notes.length, a; (i<l) && (a=this._notes[i]); i++) {
        if (a.events && a.events.length) {
          var node = this._findAnnotatedNode(this.root, a);
          for (var j=0, e$=a.events, e; (j<e$.length) && (e=e$[j]); j++) {
            this.listen(node, e.name, e.value);
          }
        }
      }
    }

  });
/**
   * Supports `listeners` object.
   *
   * Example:
   *
   *
   *     Polymer({
   *
   *       listeners: {
   *         // `click` events on the host are delegated to `clickHandler`
   *         'click': 'clickHandler'
   *       },
   *
   *       ...
   *
   *     });
   *
   *
   * @class standard feature: events
   *
   */

  Polymer.Base._addFeature({

    /**
     * Object containing entries specifying event listeners to create on each
     * instance of this element, where keys specify the event name and values
     * specify the name of the handler method to call on this prototype.
     *
     * Example:
     *
     *
     *     Polymer({
     *
     *       listeners: {
     *         // `click` events on the host are delegated to `clickHandler`
     *         'tap': 'tapHandler'
     *       },
     *
     *       ...
     *
     *     });
     */
    listeners: {},

    // TODO(sorvell): need to deprecate listening for a.b.
    // In the interim, we need to keep a map of listeners by node name
    // to avoid these string searches at instance time.
    _listenListeners: function(listeners) {
      var node, name, eventName;
      for (eventName in listeners) {
        if (eventName.indexOf('.') < 0) {
          node = this;
          name = eventName;
        } else {
          name = eventName.split('.');
          node = this.$[name[0]];
          name = name[1];
        }
        this.listen(node, name, listeners[eventName]);
      }
    },

    /**
     * Convenience method to add an event listener on a given element,
     * late bound to a named method on this element.
     *
     * @method listen
     * @param {Element} node Element to add event listener to.
     * @param {string} eventName Name of event to listen for.
     * @param {string} methodName Name of handler method on `this` to call.
     */
    listen: function(node, eventName, methodName) {
      var handler = this._recallEventHandler(this, eventName, node, methodName);
      // reuse cache'd handler
      if (!handler) {
        handler = this._createEventHandler(node, eventName, methodName);
      }
      // don't call _listen if we are already listening
      if (handler._listening) {
        return;
      }
      this._listen(node, eventName, handler);
      handler._listening = true;
    },

    _boundListenerKey: function(eventName, methodName) {
      return (eventName + ':' + methodName);
    },

    _recordEventHandler: function(host, eventName, target, methodName, handler) {
      var hbl = host.__boundListeners;
      if (!hbl) {
        hbl = host.__boundListeners = new WeakMap();
      }
      var bl = hbl.get(target);
      if (!bl) {
        bl = {};
        hbl.set(target, bl);
      }
      var key = this._boundListenerKey(eventName, methodName);
      bl[key] = handler;
    },

    _recallEventHandler: function(host, eventName, target, methodName) {
      var hbl = host.__boundListeners;
      if (!hbl) {
        return;
      }
      var bl = hbl.get(target);
      if (!bl) {
        return;
      }
      var key = this._boundListenerKey(eventName, methodName);
      return bl[key];
    },

    _createEventHandler: function(node, eventName, methodName) {
      var host = this;
      var handler = function(e) {
        if (host[methodName]) {
          host[methodName](e, e.detail);
        } else {
          host._warn(host._logf('_createEventHandler', 'listener method `' +
            methodName + '` not defined'));
        }
      };
      handler._listening = false;
      this._recordEventHandler(host, eventName, node, methodName, handler);
      return handler;
    },

    /**
     * Convenience method to remove an event listener from a given element,
     * late bound to a named method on this element.
     *
     * @method unlisten
     * @param {Element} node Element to remove event listener from.
     * @param {string} eventName Name of event to stop listening to.
     * @param {string} methodName Name of handler method on `this` to not call
     anymore.
     */
    unlisten: function(node, eventName, methodName) {
      // leave handler in map for cache purposes
      var handler = this._recallEventHandler(this, eventName, node, methodName);
      if (handler) {
        this._unlisten(node, eventName, handler);
        handler._listening = false;
      }
    },

    _listen: function(node, eventName, handler) {
      node.addEventListener(eventName, handler);
    },

    _unlisten: function(node, eventName, handler) {
      node.removeEventListener(eventName, handler);
    }
  });
(function() {

  'use strict';

  var wrap = Polymer.DomApi.wrap;

  // detect native touch action support
  var HAS_NATIVE_TA = typeof document.head.style.touchAction === 'string';
  var GESTURE_KEY = '__polymerGestures';
  var HANDLED_OBJ = '__polymerGesturesHandled';
  var TOUCH_ACTION = '__polymerGesturesTouchAction';
  // radius for tap and track
  var TAP_DISTANCE = 25;
  var TRACK_DISTANCE = 5;
  // number of last N track positions to keep
  var TRACK_LENGTH = 2;

  // Disabling "mouse" handlers for 2500ms is enough
  var MOUSE_TIMEOUT = 2500;
  var MOUSE_EVENTS = ['mousedown', 'mousemove', 'mouseup', 'click'];
  // an array of bitmask values for mapping MouseEvent.which to MouseEvent.buttons
  var MOUSE_WHICH_TO_BUTTONS = [0, 1, 4, 2];
  var MOUSE_HAS_BUTTONS = (function() {
    try {
      return new MouseEvent('test', {buttons: 1}).buttons === 1;
    } catch (e) {
      return false;
    }
  })();

  // Check for touch-only devices
  var IS_TOUCH_ONLY = navigator.userAgent.match(/iP(?:[oa]d|hone)|Android/);

  // touch will make synthetic mouse events
  // `preventDefault` on touchend will cancel them,
  // but this breaks `<input>` focus and link clicks
  // disable mouse handlers for MOUSE_TIMEOUT ms after
  // a touchend to ignore synthetic mouse events
  var mouseCanceller = function(mouseEvent) {
    // skip synthetic mouse events
    mouseEvent[HANDLED_OBJ] = {skip: true};
    // disable "ghost clicks"
    if (mouseEvent.type === 'click') {
      var path = Polymer.dom(mouseEvent).path;
      for (var i = 0; i < path.length; i++) {
        if (path[i] === POINTERSTATE.mouse.target) {
          return;
        }
      }
      mouseEvent.preventDefault();
      mouseEvent.stopPropagation();
    }
  };

  function setupTeardownMouseCanceller(setup) {
    for (var i = 0, en; i < MOUSE_EVENTS.length; i++) {
      en = MOUSE_EVENTS[i];
      if (setup) {
        document.addEventListener(en, mouseCanceller, true);
      } else {
        document.removeEventListener(en, mouseCanceller, true);
      }
    }
  }

  function ignoreMouse() {
    if (IS_TOUCH_ONLY) {
      return;
    }
    if (!POINTERSTATE.mouse.mouseIgnoreJob) {
      setupTeardownMouseCanceller(true);
    }
    var unset = function() {
      setupTeardownMouseCanceller();
      POINTERSTATE.mouse.target = null;
      POINTERSTATE.mouse.mouseIgnoreJob = null;
    };
    POINTERSTATE.mouse.mouseIgnoreJob =
      Polymer.Debounce(POINTERSTATE.mouse.mouseIgnoreJob, unset, MOUSE_TIMEOUT);
  }

  function hasLeftMouseButton(ev) {
    var type = ev.type;
    // exit early if the event is not a mouse event
    if (MOUSE_EVENTS.indexOf(type) === -1) {
      return false;
    }
    // ev.button is not reliable for mousemove (0 is overloaded as both left button and no buttons)
    // instead we use ev.buttons (bitmask of buttons) or fall back to ev.which (deprecated, 0 for no buttons, 1 for left button)
    if (type === 'mousemove') {
      // allow undefined for testing events
      var buttons = ev.buttons === undefined ? 1 : ev.buttons;
      if ((ev instanceof window.MouseEvent) && !MOUSE_HAS_BUTTONS) {
        buttons = MOUSE_WHICH_TO_BUTTONS[ev.which] || 0;
      }
      // buttons is a bitmask, check that the left button bit is set (1)
      return Boolean(buttons & 1);
    } else {
      // allow undefined for testing events
      var button = ev.button === undefined ? 0 : ev.button;
      // ev.button is 0 in mousedown/mouseup/click for left button activation
      return button === 0;
    }
  }

  function isSyntheticClick(ev) {
    if (ev.type === 'click') {
      // ev.detail is 0 for HTMLElement.click in most browsers
      if (ev.detail === 0) {
        return true;
      }
      // in the worst case, check that the x/y position of the click is within
      // the bounding box of the target of the event
      // Thanks IE 10 >:(
      var t = Gestures.findOriginalTarget(ev);
      var bcr = t.getBoundingClientRect();
      // use page x/y to account for scrolling
      var x = ev.pageX, y = ev.pageY;
      // ev is a synthetic click if the position is outside the bounding box of the target
      return !((x >= bcr.left && x <= bcr.right) && (y >= bcr.top && y <= bcr.bottom));
    }
    return false;
  }

  var POINTERSTATE = {
    mouse: {
      target: null,
      mouseIgnoreJob: null
    },
    touch: {
      x: 0,
      y: 0,
      id: -1,
      scrollDecided: false
    }
  };

  function firstTouchAction(ev) {
    var path = Polymer.dom(ev).path;
    var ta = 'auto';
    for (var i = 0, n; i < path.length; i++) {
      n = path[i];
      if (n[TOUCH_ACTION]) {
        ta = n[TOUCH_ACTION];
        break;
      }
    }
    return ta;
  }

  function trackDocument(stateObj, movefn, upfn) {
    stateObj.movefn = movefn;
    stateObj.upfn = upfn;
    document.addEventListener('mousemove', movefn);
    document.addEventListener('mouseup', upfn);
  }

  function untrackDocument(stateObj) {
    document.removeEventListener('mousemove', stateObj.movefn);
    document.removeEventListener('mouseup', stateObj.upfn);
    stateObj.movefn = null;
    stateObj.upfn = null;
  }

  var Gestures = {
    gestures: {},
    recognizers: [],

    deepTargetFind: function(x, y) {
      var node = document.elementFromPoint(x, y);
      var next = node;
      // this code path is only taken when native ShadowDOM is used
      // if there is a shadowroot, it may have a node at x/y
      // if there is not a shadowroot, exit the loop
      while (next && next.shadowRoot) {
        // if there is a node at x/y in the shadowroot, look deeper
        next = next.shadowRoot.elementFromPoint(x, y);
        if (next) {
          node = next;
        }
      }
      return node;
    },
    // a cheaper check than Polymer.dom(ev).path[0];
    findOriginalTarget: function(ev) {
      // shadowdom
      if (ev.path) {
        return ev.path[0];
      }
      // shadydom
      return ev.target;
    },
    handleNative: function(ev) {
      var handled;
      var type = ev.type;
      var node = wrap(ev.currentTarget);
      var gobj = node[GESTURE_KEY];
      if (!gobj) {
        return;
      }
      var gs = gobj[type];
      if (!gs) {
        return;
      }
      if (!ev[HANDLED_OBJ]) {
        ev[HANDLED_OBJ] = {};
        if (type.slice(0, 5) === 'touch') {
          var t = ev.changedTouches[0];
          if (type === 'touchstart') {
            // only handle the first finger
            if (ev.touches.length === 1) {
              POINTERSTATE.touch.id = t.identifier;
            }
          }
          if (POINTERSTATE.touch.id !== t.identifier) {
            return;
          }
          if (!HAS_NATIVE_TA) {
            if (type === 'touchstart' || type === 'touchmove') {
              Gestures.handleTouchAction(ev);
            }
          }
          if (type === 'touchend') {
            POINTERSTATE.mouse.target = Polymer.dom(ev).rootTarget;
            // ignore syntethic mouse events after a touch
            ignoreMouse(true);
          }
        }
      }
      handled = ev[HANDLED_OBJ];
      // used to ignore synthetic mouse events
      if (handled.skip) {
        return;
      }
      var recognizers = Gestures.recognizers;
      // reset recognizer state
      for (var i = 0, r; i < recognizers.length; i++) {
        r = recognizers[i];
        if (gs[r.name] && !handled[r.name]) {
          if (r.flow && r.flow.start.indexOf(ev.type) > -1) {
            if (r.reset) {
              r.reset();
            }
          }
        }
      }
      // enforce gesture recognizer order
      for (var i = 0, r; i < recognizers.length; i++) {
        r = recognizers[i];
        if (gs[r.name] && !handled[r.name]) {
          handled[r.name] = true;
          r[type](ev);
        }
      }
    },

    handleTouchAction: function(ev) {
      var t = ev.changedTouches[0];
      var type = ev.type;
      if (type === 'touchstart') {
        POINTERSTATE.touch.x = t.clientX;
        POINTERSTATE.touch.y = t.clientY;
        POINTERSTATE.touch.scrollDecided = false;
      } else if (type === 'touchmove') {
        if (POINTERSTATE.touch.scrollDecided) {
          return;
        }
        POINTERSTATE.touch.scrollDecided = true;
        var ta = firstTouchAction(ev);
        var prevent = false;
        var dx = Math.abs(POINTERSTATE.touch.x - t.clientX);
        var dy = Math.abs(POINTERSTATE.touch.y - t.clientY);
        if (!ev.cancelable) {
          // scrolling is happening
        } else if (ta === 'none') {
          prevent = true;
        } else if (ta === 'pan-x') {
          prevent = dy > dx;
        } else if (ta === 'pan-y') {
          prevent = dx > dy;
        }
        if (prevent) {
          ev.preventDefault();
        } else {
          Gestures.prevent('track');
        }
      }
    },

    // automate the event listeners for the native events
    add: function(node, evType, handler) {
      // SD polyfill: handle case where `node` is unwrapped, like `document`
      node = wrap(node);
      var recognizer = this.gestures[evType];
      var deps = recognizer.deps;
      var name = recognizer.name;
      var gobj = node[GESTURE_KEY];
      if (!gobj) {
        node[GESTURE_KEY] = gobj = {};
      }
      for (var i = 0, dep, gd; i < deps.length; i++) {
        dep = deps[i];
        // don't add mouse handlers on iOS because they cause gray selection overlays
        if (IS_TOUCH_ONLY && MOUSE_EVENTS.indexOf(dep) > -1) {
          continue;
        }
        gd = gobj[dep];
        if (!gd) {
          gobj[dep] = gd = {_count: 0};
        }
        if (gd._count === 0) {
          node.addEventListener(dep, this.handleNative);
        }
        gd[name] = (gd[name] || 0) + 1;
        gd._count = (gd._count || 0) + 1;
      }
      node.addEventListener(evType, handler);
      if (recognizer.touchAction) {
        this.setTouchAction(node, recognizer.touchAction);
      }
    },

    // automate event listener removal for native events
    remove: function(node, evType, handler) {
      // SD polyfill: handle case where `node` is unwrapped, like `document`
      node = wrap(node);
      var recognizer = this.gestures[evType];
      var deps = recognizer.deps;
      var name = recognizer.name;
      var gobj = node[GESTURE_KEY];
      if (gobj) {
        for (var i = 0, dep, gd; i < deps.length; i++) {
          dep = deps[i];
          gd = gobj[dep];
          if (gd && gd[name]) {
            gd[name] = (gd[name] || 1) - 1;
            gd._count = (gd._count || 1) - 1;
            if (gd._count === 0) {
              node.removeEventListener(dep, this.handleNative);
            }
          }
        }
      }
      node.removeEventListener(evType, handler);
    },

    register: function(recog) {
      this.recognizers.push(recog);
      for (var i = 0; i < recog.emits.length; i++) {
        this.gestures[recog.emits[i]] = recog;
      }
    },

    findRecognizerByEvent: function(evName) {
      for (var i = 0, r; i < this.recognizers.length; i++) {
        r = this.recognizers[i];
        for (var j = 0, n; j < r.emits.length; j++) {
          n = r.emits[j];
          if (n === evName) {
            return r;
          }
        }
      }
      return null;
    },

    // set scrolling direction on node to check later on first move
    // must call this before adding event listeners!
    setTouchAction: function(node, value) {
      if (HAS_NATIVE_TA) {
        node.style.touchAction = value;
      }
      node[TOUCH_ACTION] = value;
    },

    fire: function(target, type, detail) {
      var ev = Polymer.Base.fire(type, detail, {
        node: target,
        bubbles: true,
        cancelable: true
      });

      // forward `preventDefault` in a clean way
      if (ev.defaultPrevented) {
        var se = detail.sourceEvent;
        // sourceEvent may be a touch, which is not preventable this way
        if (se && se.preventDefault) {
          se.preventDefault();
        }
      }
    },

    prevent: function(evName) {
      var recognizer = this.findRecognizerByEvent(evName);
      if (recognizer.info) {
        recognizer.info.prevent = true;
      }
    }
  };

  Gestures.register({
    name: 'downup',
    deps: ['mousedown', 'touchstart', 'touchend'],
    flow: {
      start: ['mousedown', 'touchstart'],
      end: ['mouseup', 'touchend']
    },
    emits: ['down', 'up'],

    info: {
      movefn: null,
      upfn: null
    },

    reset: function() {
      untrackDocument(this.info);
    },

    mousedown: function(e) {
      if (!hasLeftMouseButton(e)) {
        return;
      }
      var t = Gestures.findOriginalTarget(e);
      var self = this;
      var movefn = function movefn(e) {
        if (!hasLeftMouseButton(e)) {
          self.fire('up', t, e);
          untrackDocument(self.info);
        }
      };
      var upfn = function upfn(e) {
        if (hasLeftMouseButton(e)) {
          self.fire('up', t, e);
        }
        untrackDocument(self.info);
      };
      trackDocument(this.info, movefn, upfn);
      this.fire('down', t, e);
    },
    touchstart: function(e) {
      this.fire('down', Gestures.findOriginalTarget(e), e.changedTouches[0]);
    },
    touchend: function(e) {
      this.fire('up', Gestures.findOriginalTarget(e), e.changedTouches[0]);
    },
    fire: function(type, target, event) {
      Gestures.fire(target, type, {
        x: event.clientX,
        y: event.clientY,
        sourceEvent: event,
        prevent: function(e) {
          return Gestures.prevent(e);
        }
      });
    }
  });

  Gestures.register({
    name: 'track',
    touchAction: 'none',
    deps: ['mousedown', 'touchstart', 'touchmove', 'touchend'],
    flow: {
      start: ['mousedown', 'touchstart'],
      end: ['mouseup', 'touchend']
    },
    emits: ['track'],

    info: {
      x: 0,
      y: 0,
      state: 'start',
      started: false,
      moves: [],
      addMove: function(move) {
        if (this.moves.length > TRACK_LENGTH) {
          this.moves.shift();
        }
        this.moves.push(move);
      },
      movefn: null,
      upfn: null,
      prevent: false
    },

    reset: function() {
      this.info.state = 'start';
      this.info.started = false;
      this.info.moves = [];
      this.info.x = 0;
      this.info.y = 0;
      this.info.prevent = false;
      untrackDocument(this.info);
    },

    hasMovedEnough: function(x, y) {
      if (this.info.prevent) {
        return false;
      }
      if (this.info.started) {
        return true;
      }
      var dx = Math.abs(this.info.x - x);
      var dy = Math.abs(this.info.y - y);
      return (dx >= TRACK_DISTANCE || dy >= TRACK_DISTANCE);
    },

    mousedown: function(e) {
      if (!hasLeftMouseButton(e)) {
        return;
      }
      var t = Gestures.findOriginalTarget(e);
      var self = this;
      var movefn = function movefn(e) {
        var x = e.clientX, y = e.clientY;
        if (self.hasMovedEnough(x, y)) {
          // first move is 'start', subsequent moves are 'move', mouseup is 'end'
          self.info.state = self.info.started ? (e.type === 'mouseup' ? 'end' : 'track') : 'start';
          self.info.addMove({x: x, y: y});
          if (!hasLeftMouseButton(e)) {
            // always fire "end"
            self.info.state = 'end';
            untrackDocument(self.info);
          }
          self.fire(t, e);
          self.info.started = true;
        }
      };
      var upfn = function upfn(e) {
        if (self.info.started) {
          Gestures.prevent('tap');
          movefn(e);
        }

        // remove the temporary listeners
        untrackDocument(self.info);
      };
      // add temporary document listeners as mouse retargets
      trackDocument(this.info, movefn, upfn);
      this.info.x = e.clientX;
      this.info.y = e.clientY;
    },

    touchstart: function(e) {
      var ct = e.changedTouches[0];
      this.info.x = ct.clientX;
      this.info.y = ct.clientY;
    },

    touchmove: function(e) {
      var t = Gestures.findOriginalTarget(e);
      var ct = e.changedTouches[0];
      var x = ct.clientX, y = ct.clientY;
      if (this.hasMovedEnough(x, y)) {
        this.info.addMove({x: x, y: y});
        this.fire(t, ct);
        this.info.state = 'track';
        this.info.started = true;
      }
    },

    touchend: function(e) {
      var t = Gestures.findOriginalTarget(e);
      var ct = e.changedTouches[0];
      // only trackend if track was started and not aborted
      if (this.info.started) {
        // iff tracking, always prevent tap
        Gestures.prevent('tap');
        // reset started state on up
        this.info.state = 'end';
        this.info.addMove({x: ct.clientX, y: ct.clientY});
        this.fire(t, ct);
      }
    },

    fire: function(target, touch) {
      var secondlast = this.info.moves[this.info.moves.length - 2];
      var lastmove = this.info.moves[this.info.moves.length - 1];
      var dx = lastmove.x - this.info.x;
      var dy = lastmove.y - this.info.y;
      var ddx, ddy = 0;
      if (secondlast) {
        ddx = lastmove.x - secondlast.x;
        ddy = lastmove.y - secondlast.y;
      }
      return Gestures.fire(target, 'track', {
        state: this.info.state,
        x: touch.clientX,
        y: touch.clientY,
        dx: dx,
        dy: dy,
        ddx: ddx,
        ddy: ddy,
        sourceEvent: touch,
        hover: function() {
          return Gestures.deepTargetFind(touch.clientX, touch.clientY);
        }
      });
    }

  });

  Gestures.register({
    name: 'tap',
    deps: ['mousedown', 'click', 'touchstart', 'touchend'],
    flow: {
      start: ['mousedown', 'touchstart'],
      end: ['click', 'touchend']
    },
    emits: ['tap'],
    info: {
      x: NaN,
      y: NaN,
      prevent: false
    },
    reset: function() {
      this.info.x = NaN;
      this.info.y = NaN;
      this.info.prevent = false;
    },
    save: function(e) {
      this.info.x = e.clientX;
      this.info.y = e.clientY;
    },

    mousedown: function(e) {
      if (hasLeftMouseButton(e)) {
        this.save(e);
      }
    },
    click: function(e) {
      if (hasLeftMouseButton(e)) {
        this.forward(e);
      }
    },

    touchstart: function(e) {
      this.save(e.changedTouches[0]);
    },
    touchend: function(e) {
      this.forward(e.changedTouches[0]);
    },

    forward: function(e) {
      var dx = Math.abs(e.clientX - this.info.x);
      var dy = Math.abs(e.clientY - this.info.y);
      var t = Gestures.findOriginalTarget(e);
      // dx,dy can be NaN if `click` has been simulated and there was no `down` for `start`
      if (isNaN(dx) || isNaN(dy) || (dx <= TAP_DISTANCE && dy <= TAP_DISTANCE) || isSyntheticClick(e)) {
        // prevent taps from being generated if an event has canceled them
        if (!this.info.prevent) {
          Gestures.fire(t, 'tap', {
            x: e.clientX,
            y: e.clientY,
            sourceEvent: e
          });
        }
      }
    }
  });

  var DIRECTION_MAP = {
    x: 'pan-x',
    y: 'pan-y',
    none: 'none',
    all: 'auto'
  };

  Polymer.Base._addFeature({

    _setupGestures: function() {
      this.__polymerGestures = null;
    },

    // override _listen to handle gestures
    _listen: function(node, eventName, handler) {
      if (Gestures.gestures[eventName]) {
        Gestures.add(node, eventName, handler);
      } else {
        node.addEventListener(eventName, handler);
      }
    },
    // override _unlisten to handle gestures
    _unlisten: function(node, eventName, handler) {
      if (Gestures.gestures[eventName]) {
        Gestures.remove(node, eventName, handler);
      } else {
        node.removeEventListener(eventName, handler);
      }
    },
    /**
     * Override scrolling behavior to all direction, one direction, or none.
     *
     * Valid scroll directions:
     *   - 'all': scroll in any direction
     *   - 'x': scroll only in the 'x' direction
     *   - 'y': scroll only in the 'y' direction
     *   - 'none': disable scrolling for this node
     *
     * @method setScrollDirection
     * @param {String=} direction Direction to allow scrolling
     * Defaults to `all`.
     * @param {HTMLElement=} node Element to apply scroll direction setting.
     * Defaults to `this`.
     */
    setScrollDirection: function(direction, node) {
      node = node || this;
      Gestures.setTouchAction(node, DIRECTION_MAP[direction] || 'auto');
    }
  });

  // export

  Polymer.Gestures = Gestures;

})();
Polymer.Base._addFeature({

    /**
     * Convenience method to run `querySelector` on this local DOM scope.
     *
     * This function calls `Polymer.dom(this.root).querySelector(slctr)`.
     *
     * @method $$
     * @param {string} slctr Selector to run on this local DOM scope
     * @return {Element} Element found by the selector, or null if not found.
     */
    $$: function(slctr) {
      return Polymer.dom(this.root).querySelector(slctr);
    },

    /**
     * Toggles a CSS class on or off.
     *
     * @method toggleClass
     * @param {String} name CSS class name
     * @param {boolean=} bool Boolean to force the class on or off.
     *    When unspecified, the state of the class will be reversed.
     * @param {HTMLElement=} node Node to target.  Defaults to `this`.
     */
    toggleClass: function(name, bool, node) {
      node = node || this;
      if (arguments.length == 1) {
        bool = !node.classList.contains(name);
      }
      if (bool) {
        Polymer.dom(node).classList.add(name);
      } else {
        Polymer.dom(node).classList.remove(name);
      }
    },

    /**
     * Toggles an HTML attribute on or off.
     *
     * @method toggleAttribute
     * @param {String} name HTML attribute name
     * @param {boolean=} bool Boolean to force the attribute on or off.
     *    When unspecified, the state of the attribute will be reversed.
     * @param {HTMLElement=} node Node to target.  Defaults to `this`.
     */
    toggleAttribute: function(name, bool, node) {
      node = node || this;
      if (arguments.length == 1) {
        bool = !node.hasAttribute(name);
      }
      if (bool) {
        Polymer.dom(node).setAttribute(name, '');
      } else {
        Polymer.dom(node).removeAttribute(name);
      }
    },

    /**
     * Removes a class from one node, and adds it to another.
     *
     * @method classFollows
     * @param {String} name CSS class name
     * @param {HTMLElement} toElement New element to add the class to.
     * @param {HTMLElement} fromElement Old element to remove the class from.
     */
    classFollows: function(name, toElement, fromElement) {
      if (fromElement) {
        Polymer.dom(fromElement).classList.remove(name);
      }
      if (toElement) {
        Polymer.dom(toElement).classList.add(name);
      }
    },

    /**
     * Removes an HTML attribute from one node, and adds it to another.
     *
     * @method attributeFollows
     * @param {String} name HTML attribute name
     * @param {HTMLElement} toElement New element to add the attribute to.
     * @param {HTMLElement} fromElement Old element to remove the attribute from.
     */
    attributeFollows: function(name, toElement, fromElement) {
      if (fromElement) {
        Polymer.dom(fromElement).removeAttribute(name);
      }
      if (toElement) {
        Polymer.dom(toElement).setAttribute(name, '');
      }
    },

    /**
     * Returns a list of nodes that are the effective childNodes. The effective
     * childNodes list is the same as the element's childNodes except that
     * any `<content>` elements are replaced with the list of nodes distributed
     * to the `<content>`, the result of its `getDistributedNodes` method.
     *
     * @method getEffectiveChildNodes
     * @return {Array<Node>} List of effctive child nodes.
     */
    getEffectiveChildNodes: function() {
      return Polymer.dom(this).getEffectiveChildNodes();
    },

    /**
     * Returns a list of elements that are the effective children. The effective
     * children list is the same as the element's children except that
     * any `<content>` elements are replaced with the list of elements
     * distributed to the `<content>`.
     *
     * @method getEffectiveChildren
     * @return {Array<Node>} List of effctive children.
     */
    getEffectiveChildren: function() {
      var list = Polymer.dom(this).getEffectiveChildNodes();
      return list.filter(function(n) {
        return (n.nodeType === Node.ELEMENT_NODE);
      });
    },

    /**
     * Returns a string of text content that is the concatenation of the
     * text content's of the element's effective childNodes (the elements
     * returned by <a href="#getEffectiveChildNodes>getEffectiveChildNodes</a>.
     *
     * @method getEffectiveTextContent
     * @return {Array<Node>} List of effctive children.
     */
    getEffectiveTextContent: function() {
      var cn = this.getEffectiveChildNodes();
      var tc = [];
      for (var i=0, c; c = cn[i]; i++) {
        if (c.nodeType !== Node.COMMENT_NODE) {
          tc.push(Polymer.dom(c).textContent);
        }
      }
      return tc.join('');
    },

    queryEffectiveChildren: function(slctr) {
      var e$ = Polymer.dom(this).queryDistributedElements(slctr);
      return e$ && e$[0];
    },

    queryAllEffectiveChildren: function(slctr) {
      return Polymer.dom(this).queryDistributedElements(slctr);
    },

    /**
     * Returns a list of nodes distributed to this element's `<content>`.
     *
     * If this element contains more than one `<content>` in its local DOM,
     * an optional selector may be passed to choose the desired content.
     *
     * @method getContentChildNodes
     * @param {String=} slctr CSS selector to choose the desired
     *   `<content>`.  Defaults to `content`.
     * @return {Array<Node>} List of distributed nodes for the `<content>`.
     */
    getContentChildNodes: function(slctr) {
      var content = Polymer.dom(this.root).querySelector(slctr || 'content');
      return content ? Polymer.dom(content).getDistributedNodes() : [];
    },

    /**
     * Returns a list of element children distributed to this element's
     * `<content>`.
     *
     * If this element contains more than one `<content>` in its
     * local DOM, an optional selector may be passed to choose the desired
     * content.  This method differs from `getContentChildNodes` in that only
     * elements are returned.
     *
     * @method getContentChildNodes
     * @param {String=} slctr CSS selector to choose the desired
     *   `<content>`.  Defaults to `content`.
     * @return {Array<HTMLElement>} List of distributed nodes for the
     *   `<content>`.
     */
    getContentChildren: function(slctr) {
      return this.getContentChildNodes(slctr).filter(function(n) {
        return (n.nodeType === Node.ELEMENT_NODE);
      });
    },


    /**
     * Dispatches a custom event with an optional detail value.
     *
     * @method fire
     * @param {String} type Name of event type.
     * @param {*=} detail Detail value containing event-specific
     *   payload.
     * @param {Object=} options Object specifying options.  These may include:
     *  `bubbles` (boolean, defaults to `true`),
     *  `cancelable` (boolean, defaults to false), and
     *  `node` on which to fire the event (HTMLElement, defaults to `this`).
     * @return {CustomEvent} The new event that was fired.
     */
    fire: function(type, detail, options) {
      options = options || Polymer.nob;
      var node = options.node || this;
      var detail = (detail === null || detail === undefined) ? {} : detail;
      var bubbles = options.bubbles === undefined ? true : options.bubbles;
      var cancelable = Boolean(options.cancelable);
      var useCache = options._useCache;
      var event = this._getEvent(type, bubbles, cancelable, useCache);
      event.detail = detail;
      if (useCache) {
        this.__eventCache[type] = null;
      }
      node.dispatchEvent(event);
      if (useCache) {
        this.__eventCache[type] = event;
      }
      return event;
    },

    __eventCache: {},

    // NOTE: We optionally cache event objects for efficiency during high
    // freq. opts. This option cannot be used for events which may have
    // `stopPropagation` called on them. On Chrome and Safari (but not FF)
    // if `stopPropagation` is called, the event cannot be reused. It does not
    // dispatch again.
    _getEvent: function(type, bubbles, cancelable, useCache) {
      var event = useCache && this.__eventCache[type];
      if (!event || ((event.bubbles != bubbles) ||
          (event.cancelable != cancelable))) {
        event = new Event(type, {
          bubbles: Boolean(bubbles),
          cancelable: cancelable
        });
      }
      return event;
    },


    /**
     * Runs a callback function asyncronously.
     *
     * By default (if no waitTime is specified), async callbacks are run at
     * microtask timing, which will occur before paint.
     *
     * @method async
     * @param {Function} callback The callback function to run, bound to `this`.
     * @param {number=} waitTime Time to wait before calling the
     *   `callback`.  If unspecified or 0, the callback will be run at microtask
     *   timing (before paint).
     * @return {number} Handle that may be used to cancel the async job.
     */
    async: function(callback, waitTime) {
      var self = this;
      return Polymer.Async.run(function() {
        callback.call(self);
      }, waitTime);
    },

    /**
     * Cancels an async operation started with `async`.
     *
     * @method cancelAsync
     * @param {number} handle Handle returned from original `async` call to
     *   cancel.
     */
    cancelAsync: function(handle) {
      Polymer.Async.cancel(handle);
    },

    /**
     * Removes an item from an array, if it exists.
     *
     * If the array is specified by path, a change notification is
     * generated, so that observers, data bindings and computed
     * properties watching that path can update.
     *
     * If the array is passed directly, **no change
     * notification is generated**.
     *
     * @method arrayDelete
     * @param {String|Array} path Path to array from which to remove the item
     *   (or the array itself).
     * @param {any} item Item to remove.
     * @return {Array} Array containing item removed.
     */
    arrayDelete: function(path, item) {
      var index;
      if (Array.isArray(path)) {
        index = path.indexOf(item);
        if (index >= 0) {
          return path.splice(index, 1);
        }
      } else {
        var arr = this._get(path);
        index = arr.indexOf(item);
        if (index >= 0) {
          return this.splice(path, index, 1);
        }
      }
    },

    /**
     * Cross-platform helper for setting an element's CSS `transform` property.
     *
     * @method transform
     * @param {String} transform Transform setting.
     * @param {HTMLElement=} node Element to apply the transform to.
     * Defaults to `this`
     */
    transform: function(transform, node) {
      node = node || this;
      node.style.webkitTransform = transform;
      node.style.transform = transform;
    },

    /**
     * Cross-platform helper for setting an element's CSS `translate3d`
     * property.
     *
     * @method translate3d
     * @param {number} x X offset.
     * @param {number} y Y offset.
     * @param {number} z Z offset.
     * @param {HTMLElement=} node Element to apply the transform to.
     * Defaults to `this`.
     */
    translate3d: function(x, y, z, node) {
      node = node || this;
      this.transform('translate3d(' + x + ',' + y + ',' + z + ')', node);
    },

    /**
     * Convenience method for importing an HTML document imperatively.
     *
     * This method creates a new `<link rel="import">` element with
     * the provided URL and appends it to the document to start loading.
     * In the `onload` callback, the `import` property of the `link`
     * element will contain the imported document contents.
     *
     * @method importHref
     * @param {string} href URL to document to load.
     * @param {Function} onload Callback to notify when an import successfully
     *   loaded.
     * @param {Function} onerror Callback to notify when an import
     *   unsuccessfully loaded.
     * @param {boolean} optAsync True if the import should be loaded `async`.
     *   Defaults to `false`.
     * @return {HTMLLinkElement} The link element for the URL to be loaded.
     */
    importHref: function(href, onload, onerror, optAsync) {
      var l = document.createElement('link');
      l.rel = 'import';
      l.href = href;

      optAsync = Boolean(optAsync);
      if (optAsync) {
        l.setAttribute('async', '');
      }

      var self = this;
      if (onload) {
        l.onload = function(e) {
          return onload.call(self, e);
        }
      }
      if (onerror) {
        l.onerror = function(e) {
          return onerror.call(self, e);
        }
      }
      document.head.appendChild(l);
      return l;
    },

    /**
     * Convenience method for creating an element and configuring it.
     *
     * @method create
     * @param {string} tag HTML element tag to create.
     * @param {Object} props Object of properties to configure on the
     *    instance.
     * @return {Element} Newly created and configured element.
     */
    create: function(tag, props) {
      var elt = document.createElement(tag);
      if (props) {
        for (var n in props) {
          elt[n] = props[n];
        }
      }
      return elt;
    },

    /**
     * Checks whether an element is in this element's light DOM tree.
     *
     * @method isLightDescendant
     * @param {?Node} node The element to be checked.
     * @return {Boolean} true if node is in this element's light DOM tree.
     */
    isLightDescendant: function(node) {
      return this !== node && this.contains(node) &&
          Polymer.dom(this).getOwnerRoot() === Polymer.dom(node).getOwnerRoot();
    },

    /**
     * Checks whether an element is in this element's local DOM tree.
     *
     * @method isLocalDescendant
     * @param {HTMLElement=} node The element to be checked.
     * @return {Boolean} true if node is in this element's local DOM tree.
     */
    isLocalDescendant: function(node) {
      return this.root === Polymer.dom(node).getOwnerRoot();
    }

  });
Polymer.Bind = {

    _dataEventCache: {},

    // for prototypes (usually)
    prepareModel: function(model) {
      Polymer.Base.mixin(model, this._modelApi);
    },

    _modelApi: {

      _notifyChange: function(source, event, value) {
        value = value === undefined ? this[source] : value;
        event = event || Polymer.CaseMap.camelToDashCase(source) + '-changed';
        this.fire(event, {value: value}, 
          {bubbles: false, cancelable: false, _useCache: true});
      },

      // TODO(sjmiles): removing _notifyListener from here breaks accessors.html
      // as a standalone lib. This is temporary, as standard/configure.html
      // installs it's own version on Polymer.Base, and we need that to work
      // right now.
      // NOTE: exists as a hook for processing listeners
      /*
      _notifyListener: function(fn, e) {
        // NOTE: pass e.target because e.target can get lost if this function
        // is queued asynchrously
        return fn.call(this, e, e.target);
      },
      */

      // Called from accessors, where effects is pre-stored
      // in the closure for the accessor for efficiency
      _propertySetter: function(property, value, effects, fromAbove) {
        var old = this.__data__[property];
        // NaN is always not equal to itself,
        // if old and value are both NaN we treat them as equal
        // x === x is 10x faster, and equivalent to !isNaN(x)
        if (old !== value && (old === old || value === value)) {
          this.__data__[property] = value;
          if (typeof value == 'object') {
            this._clearPath(property);
          }
          if (this._propertyChanged) {
            this._propertyChanged(property, value, old);
          }
          if (effects) {
            this._effectEffects(property, value, effects, old, fromAbove);
          }
        }
        return old;
      },

      // Called during _applyConfig (well-known downward data-flow hot path)
      // in order to avoid firing notify events
      // TODO(kschaaf): downward bindings (e.g. _applyEffectValue) should also
      // use non-notifying setters but right now that would require looking
      // up readOnly property config in the hot-path
      __setProperty: function(property, value, quiet, node) {
        node = node || this;
        var effects = node._propertyEffects && node._propertyEffects[property];
        if (effects) {
          node._propertySetter(property, value, effects, quiet);
        } else {
          node[property] = value;
        }
      },

      _effectEffects: function(property, value, effects, old, fromAbove) {
        for (var i=0, l=effects.length, fx; (i<l) && (fx=effects[i]); i++) {
          fx.fn.call(this, property, value, fx.effect, old, fromAbove);
        }
      },

      _clearPath: function(path) {
        for (var prop in this.__data__) {
          if (prop.indexOf(path + '.') === 0) {
            this.__data__[prop] = undefined;
          }
        }
      }

    },

    // a prepared model can acquire effects

    ensurePropertyEffects: function(model, property) {
      if (!model._propertyEffects) {
        model._propertyEffects = {};
      }
      var fx = model._propertyEffects[property];
      if (!fx) {
        fx = model._propertyEffects[property] = [];
      }
      return fx;
    },

    addPropertyEffect: function(model, property, kind, effect) {
      var fx = this.ensurePropertyEffects(model, property);
      var propEffect = {
        kind: kind,
        effect: effect,
        fn: Polymer.Bind['_' + kind + 'Effect']
      };
      fx.push(propEffect);
      return propEffect;
    },

    createBindings: function(model) {
      //console.group(model.is);
      // map of properties to effects
      var fx$ = model._propertyEffects;
      if (fx$) {
        // for each property with effects
        for (var n in fx$) {
          // array of effects
          var fx = fx$[n];
          // effects have priority
          fx.sort(this._sortPropertyEffects);
          // create accessors
          this._createAccessors(model, n, fx);
        }
      }
      //console.groupEnd();
    },

    _sortPropertyEffects: (function() {
      // TODO(sjmiles): EFFECT_ORDER buried this way is not ideal,
      // but presumably the sort method is going to be a hot path and not
      // have a `this`. There is also a problematic dependency on effect.kind
      // values here, which are otherwise pluggable.
      var EFFECT_ORDER = {
        'compute': 0,
        'annotation': 1,
        'computedAnnotation': 2,
        'reflect': 3,
        'notify': 4,
        'observer': 5,
        'complexObserver': 6,
        'function': 7
      };
      return function(a, b) {
        return EFFECT_ORDER[a.kind] - EFFECT_ORDER[b.kind];
      };
    })(),

    // create accessors that implement effects

    _createAccessors: function(model, property, effects) {
      var defun = {
        get: function() {
          // TODO(sjmiles): elide delegation for performance, good ROI?
          return this.__data__[property];
        }
      };
      var setter = function(value) {
        this._propertySetter(property, value, effects);
      };
      // ReadOnly properties have a private setter only
      // TODO(kschaaf): Per current Bind factoring, we shouldn't
      // be interrogating the prototype here
      // TODO(sorvell): we want to avoid using `getPropertyInfo` here, but
      // this requires more data in `_propertyInfo`
      var info = model.getPropertyInfo && model.getPropertyInfo(property);
      if (info && info.readOnly) {
        // Computed properties are read-only (no property setter), but also don't
        // need a private setter since they should not be called by the user
        if (!info.computed) {
          model['_set' + this.upper(property)] = setter;
        }
      } else {
        defun.set = setter;
      }
      Object.defineProperty(model, property, defun);
    },

    upper: function(name) {
      return name[0].toUpperCase() + name.substring(1);
    },

    _addAnnotatedListener: function(model, index, property, path, event) {
      if (!model._bindListeners) {
        model._bindListeners = [];
      }
      var fn = this._notedListenerFactory(property, path,
        this._isStructured(path));
      var eventName = event ||
        (Polymer.CaseMap.camelToDashCase(property) + '-changed');
      model._bindListeners.push({
        index: index,
        property: property,
        path: path,
        changedFn: fn,
        event: eventName
      });
    },

    _isStructured: function(path) {
      return path.indexOf('.') > 0;
    },

    _isEventBogus: function(e, target) {
      return e.path && e.path[0] !== target;
    },

    _notedListenerFactory: function(property, path, isStructured) {
      return function(target, value, targetPath) {
        if (targetPath) {
          this._notifyPath(this._fixPath(path, property, targetPath), value);
        } else {
          // TODO(sorvell): even though we have a `value` argument, we *must*
          // lookup the current value of the property. Multiple listeners and
          // queued events during configuration can theoretically lead to 
          // divergence of the passed value from the current value, but we 
          // really need to track down a specific case where this happens.
          value = target[property];
          if (!isStructured) {
            this[path] = value;
          } else {
            // TODO(kschaaf): dirty check avoids null references when the object has gone away
            if (this.__data__[path] != value) {
              this.set(path, value);
            }
          }
        }
      };
    },
    // for instances

    prepareInstance: function(inst) {
      inst.__data__ = Object.create(null);
    },

    setupBindListeners: function(inst) {
      var b$ = inst._bindListeners;
      for (var i=0, l=b$.length, info; (i<l) && (info=b$[i]); i++) {
        // Property listeners:
        // <node>.on.<property>-changed: <path]> = e.detail.value
        //console.log('[_setupBindListener]: [%s][%s] listening for [%s][%s-changed]', this.localName, info.path, info.id || info.index, info.property);
        //
        // TODO(sorvell): fix templatizer to support this before uncommenting
        // Optimization: only add bind listeners if the bound property is notifying...
        var node = inst._nodes[info.index];
        //var p = node._propertyInfo && node._propertyInfo[info.property];
        //if (node._prepParentProperties || !node._propertyInfo || (p && p.notify)) {
          this._addNotifyListener(node, inst, info.event, info.changedFn);
        //}
      };
    },

    // TODO(sorvell): note, adding these synchronously may impact performance,
    // measure and consider if we can defer until after first paint in some cases at least.
    _addNotifyListener: function(element, context, event, changedFn) {
      element.addEventListener(event, function(e) {
        return context._notifyListener(changedFn, e);
      });
    }
  };
Polymer.Base.extend(Polymer.Bind, {

    _shouldAddListener: function(effect) {
      return effect.name &&
             effect.kind != 'attribute' &&
             effect.kind != 'text' &&
             !effect.isCompound &&
             effect.parts[0].mode === '{' &&
             !effect.parts[0].negate;
    },

    _annotationEffect: function(source, value, effect) {
      if (source != effect.value) {
        value = this._get(effect.value);
        this.__data__[effect.value] = value;
      }
      var calc = effect.negate ? !value : value;
      // For better interop, dirty check before setting when custom events
      // are used, since the target element may not dirty check (e.g. <input>)
      if (!effect.customEvent ||
          this._nodes[effect.index][effect.name] !== calc) {
        return this._applyEffectValue(effect, calc);
      }
    },

    _reflectEffect: function(source, value, effect) {
      this.reflectPropertyToAttribute(source, effect.attribute, value);
    },

    _notifyEffect: function(source, value, effect, old, fromAbove) {
      if (!fromAbove) {
        this._notifyChange(source, effect.event, value);
      }
    },

    // Raw effect for extension
    _functionEffect: function(source, value, fn, old, fromAbove) {
      fn.call(this, source, value, old, fromAbove);
    },

    _observerEffect: function(source, value, effect, old) {
      var fn = this[effect.method];
      if (fn) {
        fn.call(this, value, old);
      } else {
        this._warn(this._logf('_observerEffect', 'observer method `' +
          effect.method + '` not defined'));
      }
    },

    _complexObserverEffect: function(source, value, effect) {
      var fn = this[effect.method];
      if (fn) {
        var args = Polymer.Bind._marshalArgs(this.__data__, effect, source, value);
        if (args) {
          fn.apply(this, args);
        }
      } else {
        this._warn(this._logf('_complexObserverEffect', 'observer method `' +
          effect.method + '` not defined'));
      }
    },

    _computeEffect: function(source, value, effect) {
      var args = Polymer.Bind._marshalArgs(this.__data__, effect, source, value);
      if (args) {
        var fn = this[effect.method];
        if (fn) {
          this.__setProperty(effect.name, fn.apply(this, args));
        } else {
          this._warn(this._logf('_computeEffect', 'compute method `' +
            effect.method + '` not defined'));
        }
      }
    },

    _annotatedComputationEffect: function(source, value, effect) {
      var computedHost = this._rootDataHost || this;
      var fn = computedHost[effect.method];
      if (fn) {
        var args = Polymer.Bind._marshalArgs(this.__data__, effect, source, value);
        if (args) {
          var computedvalue = fn.apply(computedHost, args);
          if (effect.negate) {
            computedvalue = !computedvalue;
          }
          this._applyEffectValue(effect, computedvalue);
        }
      } else {
        computedHost._warn(computedHost._logf('_annotatedComputationEffect',
          'compute method `' + effect.method + '` not defined'));
      }
    },

    // path & value are used to fill in wildcard descriptor when effect is
    // being called as a result of a path notification
    _marshalArgs: function(model, effect, path, value) {
      var values = [];
      var args = effect.args;
      for (var i=0, l=args.length; i<l; i++) {
        var arg = args[i];
        var name = arg.name;
        var v;
        if (arg.literal) {
          v = arg.value;
        } else if (arg.structured) {
          v = Polymer.Base._get(name, model);
        } else {
          v = model[name];
        }
        if (args.length > 1 && v === undefined) {
          return;
        }
        if (arg.wildcard) {
          // Only send the actual path changed info if the change that
          // caused the observer to run matched the wildcard
          var baseChanged = (name.indexOf(path + '.') === 0);
          var matches = (effect.trigger.name.indexOf(name) === 0 && !baseChanged);
          values[i] = {
            path: matches ? path : name,
            value: matches ? value : v,
            base: v
          };
        } else {
          values[i] = v;
        }
      }
      return values;
    }

  });
/**
   * Support for property side effects.
   *
   * Key for effect objects:
   *
   * property | ann | anCmp | cmp | obs | cplxOb | description
   * ---------|-----|-------|-----|-----|--------|----------------------------------------
   * method   |     | X     | X   | X   | X      | function name to call on instance
   * args     |     | X     | X   |     | X      | arg descriptors for triggers of fn
   * trigger  |     | X     | X   |     | X      | describes triggering dependency (one of args)
   * property |     |       | X   | X   |        | property for effect to set or get
   * name     | X   |       |     |     |        | annotation value (text inside {{...}})
   * kind     | X   | X     |     |     |        | binding type (property or attribute)
   * index    | X   | X     |     |     |        | node index to set
   *
   */

  Polymer.Base._addFeature({

    _addPropertyEffect: function(property, kind, effect) {
      var prop = Polymer.Bind.addPropertyEffect(this, property, kind, effect);
      // memoize path function for faster lookup.
      prop.pathFn = this['_' + prop.kind + 'PathEffect'];
    },

    // prototyping

    _prepEffects: function() {
      Polymer.Bind.prepareModel(this);
      this._addAnnotationEffects(this._notes);
    },

    _prepBindings: function() {
      Polymer.Bind.createBindings(this);
    },

    _addPropertyEffects: function(properties) {
      if (properties) {
        for (var p in properties) {
          var prop = properties[p];
          if (prop.observer) {
            this._addObserverEffect(p, prop.observer);
          }
          if (prop.computed) {
            // Computed properties are implicitly readOnly
            prop.readOnly = true;
            this._addComputedEffect(p, prop.computed);
          }
          if (prop.notify) {
            this._addPropertyEffect(p, 'notify', {
              event: Polymer.CaseMap.camelToDashCase(p) + '-changed'});
          }
          if (prop.reflectToAttribute) {
            this._addPropertyEffect(p, 'reflect', {
              attribute: Polymer.CaseMap.camelToDashCase(p)
            });
          }
          if (prop.readOnly) {
            // Ensure accessor is created
            Polymer.Bind.ensurePropertyEffects(this, p);
          }
        }
      }
    },

    _addComputedEffect: function(name, expression) {
      var sig = this._parseMethod(expression);
      for (var i=0, arg; (i<sig.args.length) && (arg=sig.args[i]); i++) {
        this._addPropertyEffect(arg.model, 'compute', {
          method: sig.method,
          args: sig.args,
          trigger: arg,
          name: name
        });
      }
    },

    _addObserverEffect: function(property, observer) {
      this._addPropertyEffect(property, 'observer', {
        method: observer,
        property: property
      });
    },

    _addComplexObserverEffects: function(observers) {
      if (observers) {
        for (var i=0, o; (i<observers.length) && (o=observers[i]); i++)  {
          this._addComplexObserverEffect(o);
        }
      }
    },

    _addComplexObserverEffect: function(observer) {
      var sig = this._parseMethod(observer);

      if (!sig) {
        throw new Error("Malformed observer expression '" + observer + "'");
      }

      for (var i=0, arg; (i<sig.args.length) && (arg=sig.args[i]); i++) {
        this._addPropertyEffect(arg.model, 'complexObserver', {
          method: sig.method,
          args: sig.args,
          trigger: arg
        });
      }
    },

    _addAnnotationEffects: function(notes) {
      // process annotations that have been parsed from template
      for (var i=0, note; (i<notes.length) && (note=notes[i]); i++)  {
        // where to find the node in the concretized list
        var b$ = note.bindings;
        for (var j=0, binding; (j<b$.length) && (binding=b$[j]); j++) {
          this._addAnnotationEffect(binding, i);
        }
      }
    },

    _addAnnotationEffect: function(note, index) {
      // TODO(sjmiles): annotations have 'effects' proper and 'listener'
      if (Polymer.Bind._shouldAddListener(note)) {
        // <node>.on.<dash-case-property>-changed: <path> = e.detail.value
        Polymer.Bind._addAnnotatedListener(this, index,
          note.name, note.parts[0].value, note.parts[0].event);
      }
      for (var i=0; i<note.parts.length; i++) {
        var part = note.parts[i];
        if (part.signature) {
          this._addAnnotatedComputationEffect(note, part, index);
        } else if (!part.literal) {
          // add 'annotation' binding effect for property 'model'
          this._addPropertyEffect(part.model, 'annotation', {
            kind: note.kind,
            index: index,
            name: note.name,
            value: part.value,
            isCompound: note.isCompound,
            compoundIndex: part.compoundIndex,
            event: part.event,
            customEvent: part.customEvent,
            negate: part.negate
          });
        }
      }
    },

    _addAnnotatedComputationEffect: function(note, part, index) {
      var sig = part.signature;
      if (sig.static) {
        this.__addAnnotatedComputationEffect('__static__', index, note, part, null);
      } else {
        for (var i=0, arg; (i<sig.args.length) && (arg=sig.args[i]); i++) {
          if (!arg.literal) {
            this.__addAnnotatedComputationEffect(arg.model, index, note, part,
              arg);
          }
        }
      }
    },

    __addAnnotatedComputationEffect: function(property, index, note, part, trigger) {
      this._addPropertyEffect(property, 'annotatedComputation', {
        index: index,
        isCompound: note.isCompound,
        compoundIndex: part.compoundIndex,
        kind: note.kind,
        name: note.name,
        negate: part.negate,
        method: part.signature.method,
        args: part.signature.args,
        trigger: trigger
      });
    },

    // method expressions are of the form: `name([arg1, arg2, .... argn])`
    _parseMethod: function(expression) {
      // tries to match valid javascript property names
      var m = expression.match(/([^\s]+?)\((.*)\)/);
      if (m) {
        var sig = { method: m[1], static: true };
        if (m[2].trim()) {
          // replace escaped commas with comma entity, split on un-escaped commas
          var args = m[2].replace(/\\,/g, '&comma;').split(',');
          return this._parseArgs(args, sig);
        } else {
          sig.args = Polymer.nar;
          return sig;
        }
      }
    },

    _parseArgs: function(argList, sig) {
      sig.args = argList.map(function(rawArg) {
        var arg = this._parseArg(rawArg);
        if (!arg.literal) {
          sig.static = false;
        }
        return arg;
      }, this);
      return sig;
    },

    _parseArg: function(rawArg) {
      // clean up whitespace
      var arg = rawArg.trim()
        // replace comma entity with comma
        .replace(/&comma;/g, ',')
        // repair extra escape sequences; note only commas strictly need
        // escaping, but we allow any other char to be escaped since its
        // likely users will do this
        .replace(/\\(.)/g, '\$1')
        ;
      // basic argument descriptor
      var a = {
        name: arg
      };
      // detect literal value (must be String or Number)
      var fc = arg[0];
      if (fc === '-') {
        fc = arg[1];
      }
      if (fc >= '0' && fc <= '9') {
        fc = '#';
      }
      switch(fc) {
        case "'":
        case '"':
          a.value = arg.slice(1, -1);
          a.literal = true;
          break;
        case '#':
          a.value = Number(arg);
          a.literal = true;
          break;
      }
      // if not literal, look for structured path
      if (!a.literal) {
        a.model = this._modelForPath(arg);
        // detect structured path (has dots)
        a.structured = arg.indexOf('.') > 0;
        if (a.structured) {
          a.wildcard = (arg.slice(-2) == '.*');
          if (a.wildcard) {
            a.name = arg.slice(0, -2);
          }
        }
      }
      return a;
    },

    // instancing
    _marshalInstanceEffects: function() {
      Polymer.Bind.prepareInstance(this);
      if (this._bindListeners) {
        Polymer.Bind.setupBindListeners(this);
      }
    },

    _applyEffectValue: function(info, value) {
      var node = this._nodes[info.index];
      var property = info.name;
      if (info.isCompound) {
        var storage = node.__compoundStorage__[property];
        storage[info.compoundIndex] = value;
        value = storage.join('');
      }
      // special processing for 'class' and 'className'; 'class' handled
      // when attr is serialized.
      if (info.kind == 'attribute') {
        this.serializeValueToAttribute(value, property, node);
      } else {
        // TODO(sorvell): consider pre-processing the following two string
        // comparisons in the hot path so this can be a boolean check
        if (property === 'className') {
          value = this._scopeElementClass(node, value);
        }
        // Some browsers serialize `undefined` to `"undefined"`
        if (property === 'textContent' ||
            (node.localName == 'input' && property == 'value')) {
          value = value == undefined ? '' : value;
        }
        // Ideally we would call setProperty using fromAbove: true to avoid
        // spinning the wheel needlessly, but we found that users were listening
        // for change events outside of bindings
        var pinfo;
        if (!node._propertyInfo || !(pinfo = node._propertyInfo[property]) ||
          !pinfo.readOnly) {
          this.__setProperty(property, value, false, node);
        }
      }
    },

    _executeStaticEffects: function() {
      if (this._propertyEffects && this._propertyEffects.__static__) {
        this._effectEffects('__static__', null, this._propertyEffects.__static__);
      }
    }

  });
/*
    Process inputs efficiently via a configure lifecycle callback.
    Configure is called top-down, host before local dom. Users should
    implement configure to supply a set of default values for the element by
    returning an object containing the properties and values to set.

    Configured values are not immediately set, instead they are set when
    an element becomes ready, after its local dom is ready. This ensures
    that any user change handlers are not called before ready time.

  */

  /*
  Implementation notes:

  Configured values are collected into _config. At ready time, properties
  are set to the values in _config. This ensures properties are set child
  before host and change handlers are called only at ready time. The host
  will reset a value already propagated to a child, but this is not
  inefficient because of dirty checking at the set point.

  Bind notification events are sent when properties are set at ready time
  and thus received by the host before it is ready. Since notifications result
  in property updates and this triggers side effects, handling notifications
  is deferred until ready time.

  In general, events can be heard before an element is ready. This may occur
  when a user sends an event in a change handler or listens to a data event
  directly (on-foo-changed).
  */

  Polymer.Base._addFeature({

    // storage for configuration
    _setupConfigure: function(initialConfig) {
      this._config = {};
      this._handlers = [];
      this._aboveConfig = null;
      if (initialConfig) {
        // don't accept undefined values in intialConfig
        for (var i in initialConfig) {
          if (initialConfig[i] !== undefined) {
            this._config[i] = initialConfig[i];
          }
        }
      }
    },

    // static attributes are deserialized into _config
    _marshalAttributes: function() {
      this._takeAttributesToModel(this._config);
    },

    _attributeChangedImpl: function(name) {
      var model = this._clientsReadied ? this : this._config;
      this._setAttributeToProperty(model, name);
    },

    // at configure time values are stored in _config
    _configValue: function(name, value) {
      var info = this._propertyInfo[name];
      if (!info || !info.readOnly) {
        this._config[name] = value;
      }
    },

    // Override polymer-mini thunk
    _beforeClientsReady: function() {
      this._configure();
    },

    // configure: returns user supplied default property values
    // combines with _config to create final property values
    _configure: function() {
      // some annotation data needs to be handed from host to client
      // e.g. hand template content stored in notes to children as part of
      // configure flow so templates have their content at ready time
      this._configureAnnotationReferences();
      // save copy of configuration that came from above
      this._aboveConfig = this.mixin({}, this._config);
      // get individual default values from property configs
      var config = {};
      // mixed-in behaviors
      for (var i=0; i < this.behaviors.length; i++) {
        this._configureProperties(this.behaviors[i].properties, config);
      }
      // prototypical behavior
      this._configureProperties(this.properties, config);
      // TODO(sorvell): it *may* be faster to loop over _propertyInfo but
      // there are some test issues.
      //this._configureProperties(this._propertyInfo, config);
      // override local configuration with configuration from above
      this.mixin(config, this._aboveConfig);
      // this is the new _config, which are the final values to be applied
      this._config = config;
      // pass configuration data to bindings
      if (this._clients && this._clients.length) {
        this._distributeConfig(this._config);
      }
    },

    _configureProperties: function(properties, config) {
      for (var i in properties) {
        var c = properties[i];
        // don't accept undefined values
        if (c.value !== undefined) {
          var value = c.value;
          if (typeof value == 'function') {
            // pass existing config values (this._config) to value function
            value = value.call(this, this._config);
          }
          config[i] = value;
        }
      }
    },

    // distribute config values to bound nodes.
    _distributeConfig: function(config) {
      var fx$ = this._propertyEffects;
      if (fx$) {
        for (var p in config) {
          var fx = fx$[p];
          if (fx) {
            for (var i=0, l=fx.length, x; (i<l) && (x=fx[i]); i++) {
              // TODO(kschaaf): compound bindings (as well as computed effects)
              // are excluded from top-down configure for now; to be revisited
              if (x.kind === 'annotation' && !x.isCompound) {
                var node = this._nodes[x.effect.index];
                // seeding configuration only
                if (node._configValue) {
                  var value = (p === x.effect.value) ? config[p] :
                    this._get(x.effect.value, config);
                  node._configValue(x.effect.name, value);
                }
              }
            }
          }
        }
      }
    },

    // Override polymer-mini thunk
    _afterClientsReady: function() {
      // process static effects, e.g. computations that have only literal arguments
      this._executeStaticEffects();
      this._applyConfig(this._config, this._aboveConfig);
      this._flushHandlers();
    },

    // NOTE: values are already propagated to children via
    // _distributeConfig so propagation triggered by effects here is
    // redundant, but safe due to dirty checking
    _applyConfig: function(config, aboveConfig) {
      for (var n in config) {
        // Don't stomp on values that may have been set by other side effects
        if (this[n] === undefined) {
          // Call _propertySet for any properties with accessors, which will
          // initialize read-only properties also; set quietly if value was
          // configured from above, as opposed to default
          this.__setProperty(n, config[n], n in aboveConfig);
        }
      }
    },

    // NOTE: Notifications can be processed before ready since
    // they are sent at *child* ready time. Since notifications cause side
    // effects and side effects must not be processed before ready time,
    // handling is queue/defered until then.
    _notifyListener: function(fn, e) {
      if (!Polymer.Bind._isEventBogus(e, e.target)) {
        var value, path;
        if (e.detail) {
          value = e.detail.value;
          path = e.detail.path;
        }
        if (!this._clientsReadied) {
          this._queueHandler([fn, e.target, value, path]);
        } else {
          return fn.call(this, e.target, value, path);
        }
      }
    },

    _queueHandler: function(args) {
      this._handlers.push(args);
    },

    _flushHandlers: function() {
      var h$ = this._handlers;
      for (var i=0, l=h$.length, h; (i<l) && (h=h$[i]); i++) {
        h[0].call(this, h[1], h[2], h[3]);
      }
      // reset handlers array
      //
      // If an element holds a reference to a CustomEvent with a detail
      // property, Chrome will leak memory across page refreshes
      // https://crbug.com/529941
      this._handlers = [];
    }

  });
/**
   * Changes to an object sub-field (aka "path") via a binding
   * (e.g. `<x-foo value="{{item.subfield}}"`) will notify other elements bound to
   * the same object automatically.
   *
   * When modifying a sub-field of an object imperatively
   * (e.g. `this.item.subfield = 42`), in order to have the new value propagated
   * to other elements, a special `set(path, value)` API is provided.
   * `set` sets the object field at the path specified, and then notifies the
   * binding system so that other elements bound to the same path will update.
   *
   * Example:
   *
   *     Polymer({
   *
   *       is: 'x-date',
   *
   *       properties: {
   *         date: {
   *           type: Object,
   *           notify: true
   *          }
   *       },
   *
   *       attached: function() {
   *         this.date = {};
   *         setInterval(function() {
   *           var d = new Date();
   *           // Required to notify elements bound to date of changes to sub-fields
   *           // this.date.seconds = d.getSeconds(); <-- Will not notify
   *           this.set('date.seconds', d.getSeconds());
   *           this.set('date.minutes', d.getMinutes());
   *           this.set('date.hours', d.getHours() % 12);
   *         }.bind(this), 1000);
   *       }
   *
   *     });
   *
   *  Allows bindings to `date` sub-fields to update on changes:
   *
   *     <x-date date="{{date}}"></x-date>
   *
   *     Hour: <span>{{date.hours}}</span>
   *     Min:  <span>{{date.minutes}}</span>
   *     Sec:  <span>{{date.seconds}}</span>
   *
   * @class data feature: path notification
   */

  (function() {
    // Using strict here to ensure fast argument manipulation in array methods
    'use strict';

    Polymer.Base._addFeature({
      /**
       * Notify that a path has changed.
       *
       * Example:
       *
       *     this.item.user.name = 'Bob';
       *     this.notifyPath('item.user.name', this.item.user.name);
       *
       * @param {string} path Path that should be notified.
       * @param {*} value Value of the specified path.
       * @param {boolean=} fromAbove When true, specifies that the change came
       *   from above this element and thus upward notification is not
       *   necessary.
       * @return {boolean} Returns true if notification actually took place,
       *   based on a dirty check of whether the new value was already known.
      */
      notifyPath: function(path, value, fromAbove) {
        // Convert any array indices to keys before notifying path
        var info = {};
        this._get(path, this, info);
        // Notify change to key-based path
        if (info.path) {
          this._notifyPath(info.path, value, fromAbove);
        }
      },

      // Note: this implemetation only accepts key-based array paths
      _notifyPath: function(path, value, fromAbove) {
        var old = this._propertySetter(path, value);
        // manual dirty checking for now...
        // NaN is always not equal to itself,
        // if old and value are both NaN we treat them as equal
        // x === x is 10x faster, and equivalent to !isNaN(x)
        if (old !== value && (old === old || value === value)) {
          // console.group((this.localName || this.dataHost.id + '-' + this.dataHost.dataHost.index) + '#' + (this.id || this.index) + ' ' + path, value);
          // Take path effects at this level for exact path matches,
          // and notify down for any bindings to a subset of this path
          this._pathEffector(path, value);
          // Send event to notify the path change upwards
          // Optimization: don't notify up if we know the notification
          // is coming from above already (avoid wasted event dispatch)
          if (!fromAbove) {
            // TODO(sorvell): should only notify if notify: true?
            this._notifyPathUp(path, value);
          }
          // console.groupEnd((this.localName || this.dataHost.id + '-' + this.dataHost.dataHost.index) + '#' + (this.id || this.index) + ' ' + path, value);
          return true;
        }
      },

      /**
        Converts a path to an array of path parts.  A path may be specified
        as a dotted string or an array of one or more dotted strings (or numbers,
        for number-valued keys).
      */
      _getPathParts: function(path) {
        if (Array.isArray(path)) {
          var parts = [];
          for (var i=0; i<path.length; i++) {
            var args = path[i].toString().split('.');
            for (var j=0; j<args.length; j++) {
              parts.push(args[j]);
            }
          }
          return parts;
        } else {
          return path.toString().split('.');
        }
      },

      /**
       * Convienence method for setting a value to a path and notifying any
       * elements bound to the same path.
       *
       * Note, if any part in the path except for the last is undefined,
       * this method does nothing (this method does not throw when
       * dereferencing undefined paths).
       *
       * @method set
       * @param {(string|Array<(string|number)>)} path Path to the value
       *   to write.  The path may be specified as a string (e.g. `foo.bar.baz`)
       *   or an array of path parts (e.g. `['foo.bar', 'baz']`).  Note that
       *   bracketed expressions are not supported; string-based path parts
       *   *must* be separated by dots.  Note that when dereferencing array
       *   indices, the index may be used as a dotted part directly
       *   (e.g. `users.12.name` or `['users', 12, 'name']`).
       * @param {*} value Value to set at the specified path.
       * @param {Object=} root Root object from which the path is evaluated.
      */
      set: function(path, value, root) {
        var prop = root || this;
        var parts = this._getPathParts(path);
        var array;
        var last = parts[parts.length-1];
        if (parts.length > 1) {
          // Loop over path parts[0..n-2] and dereference
          for (var i=0; i<parts.length-1; i++) {
            var part = parts[i];
            if (array && part[0] == '#') {
              // Part was key; lookup item in collection
              prop = Polymer.Collection.get(array).getItem(part);
            } else {
              // Get item from simple property dereference
              prop = prop[part];
              if (array && (parseInt(part, 10) == part)) {
                // Translate array indices to collection keys for path notificaiton
                parts[i] = Polymer.Collection.get(array).getKey(prop);
              }
            }
            if (!prop) {
              return;
            }
            // Cache previous part if it is an array
            array = Array.isArray(prop) ? prop : null;
          }
          // Special handling when last part is a array item: need to replace
          // item in collection associated with key for that item
          if (array) {
            var coll = Polymer.Collection.get(array);
            if (last[0] == '#') {
              // Part was key; lookup item in collection
              var key = last;
              var old = coll.getItem(key);
              // Update last part from key to index: O(n) lookup unavoidable
              last = array.indexOf(old);
              // Replace item associated with key in collection
              coll.setItem(key, value);
            } else if (parseInt(last, 10) == last) {
              // Dereference index & lookup collection key
              var old = prop[last];
              var key = coll.getKey(old);
              // Translate array indices to collection keys for path notificaiton
              parts[i] = key;
              // Replace item associated with key in collection
              coll.setItem(key, value);
            }
          }
          // Set value to object at end of path
          prop[last] = value;
          // Notify observers of path change
          if (!root) {
            this._notifyPath(parts.join('.'), value);
          }
        } else {
          // Simple property set
          prop[path] = value;
        }
      },

      /**
       * Convienence method for reading a value from a path.
       *
       * Note, if any part in the path is undefined, this method returns
       * `undefined` (this method does not throw when dereferencing undefined
       * paths).
       *
       * @method get
       * @param {(string|Array<(string|number)>)} path Path to the value
       *   to read.  The path may be specified as a string (e.g. `foo.bar.baz`)
       *   or an array of path parts (e.g. `['foo.bar', 'baz']`).  Note that
       *   bracketed expressions are not supported; string-based path parts
       *   *must* be separated by dots.  Note that when dereferencing array
       *   indices, the index may be used as a dotted part directly
       *   (e.g. `users.12.name` or `['users', 12, 'name']`).
       * @param {Object=} root Root object from which the path is evaluated.
       * @return {*} Value at the path, or `undefined` if any part of the path
       *   is undefined.
       */
      get: function(path, root) {
        return this._get(path, root);
      },

      // If `info` object is supplied, a `path` property will be added to it
      // containing the path with array indices converted to keys, for use
      // by the private _notifyPath / _notifySplice implementations
      _get: function(path, root, info) {
        var prop = root || this;
        var parts = this._getPathParts(path);
        var array;
        // Loop over path parts[0..n-1] and dereference
        for (var i=0; i<parts.length; i++) {
          if (!prop) {
            return;
          }
          var part = parts[i];
          if (array && part[0] == '#') {
            // Part was key; lookup item in collection
            prop = Polymer.Collection.get(array).getItem(part);
          } else {
            // Get item from simple property dereference
            prop = prop[part];
            if (info && array && (parseInt(part, 10) == part)) {
              // Translate array indices to collection keys for path notificaiton
              parts[i] = Polymer.Collection.get(array).getKey(prop);
            }
          }
          // Cache previous part if it is an array
          array = Array.isArray(prop) ? prop : null;
        }
        if (info) {
          info.path = parts.join('.');
        }
        return prop;
      },

      _pathEffector: function(path, value) {
        // get root property
        var model = this._modelForPath(path);
        // search property effects of the root property for 'annotation' effects
        var fx$ = this._propertyEffects && this._propertyEffects[model];
        if (fx$) {
          for (var i=0, fx; (i<fx$.length) && (fx=fx$[i]); i++) {
            // use memoized path functions
            var fxFn = fx.pathFn;
            if (fxFn) {
              fxFn.call(this, path, value, fx.effect);
            }
          }
        }
        // notify runtime-bound paths
        if (this._boundPaths) {
          this._notifyBoundPaths(path, value);
        }
      },

      _annotationPathEffect: function(path, value, effect) {
        if (effect.value === path || effect.value.indexOf(path + '.') === 0) {
          // TODO(sorvell): ideally the effect function is on this prototype
          // so we don't have to call it like this.
          Polymer.Bind._annotationEffect.call(this, path, value, effect);
        } else if ((path.indexOf(effect.value + '.') === 0) && !effect.negate) {
          // locate the bound node
          var node = this._nodes[effect.index];
          if (node && node._notifyPath) {
            var p = this._fixPath(effect.name , effect.value, path);
            node._notifyPath(p, value, true);
          }
        }
      },

      _complexObserverPathEffect: function(path, value, effect) {
        if (this._pathMatchesEffect(path, effect)) {
          Polymer.Bind._complexObserverEffect.call(this, path, value, effect);
        }
      },

      _computePathEffect: function(path, value, effect) {
        if (this._pathMatchesEffect(path, effect)) {
          Polymer.Bind._computeEffect.call(this, path, value, effect);
        }
      },

      _annotatedComputationPathEffect: function(path, value, effect) {
        if (this._pathMatchesEffect(path, effect)) {
          Polymer.Bind._annotatedComputationEffect.call(this, path, value, effect);
        }
      },

      _pathMatchesEffect: function(path, effect) {
        var effectArg = effect.trigger.name;
        return (effectArg == path) ||
          (effectArg.indexOf(path + '.') === 0) ||
          (effect.trigger.wildcard && path.indexOf(effectArg) === 0);
      },

      /**
       * Aliases one data path as another, such that path notifications from one
       * are routed to the other.
       *
       * @method linkPaths
       * @param {string} to Target path to link.
       * @param {string} from Source path to link.
       */
      linkPaths: function(to, from) {
        this._boundPaths = this._boundPaths || {};
        if (from) {
          this._boundPaths[to] = from;
          // this.set(to, this._get(from));
        } else {
          this.unlinkPaths(to);
          // this.set(to, from);
        }
      },

      /**
       * Removes a data path alias previously established with `linkPaths`.
       *
       * Note, the path to unlink should be the target (`to`) used when
       * linking the paths.
       *
       * @method unlinkPaths
       * @param {string} path Target path to unlink.
       */
      unlinkPaths: function(path) {
        if (this._boundPaths) {
          delete this._boundPaths[path];
        }
      },

      _notifyBoundPaths: function(path, value) {
        for (var a in this._boundPaths) {
          var b = this._boundPaths[a];
          if (path.indexOf(a + '.') == 0) {
            this._notifyPath(this._fixPath(b, a, path), value);
          } else if (path.indexOf(b + '.') == 0) {
            this._notifyPath(this._fixPath(a, b, path), value);
          }
        }
      },

      _fixPath: function(property, root, path) {
        return property + path.slice(root.length);
      },

      _notifyPathUp: function(path, value) {
        var rootName = this._modelForPath(path);
        var dashCaseName = Polymer.CaseMap.camelToDashCase(rootName);
        var eventName = dashCaseName + this._EVENT_CHANGED;
        // use a cached event here (_useCache: true) for efficiency
        this.fire(eventName, {
          path: path,
          value: value
        }, {bubbles: false, _useCache: true});
      },

      _modelForPath: function(path) {
        var dot = path.indexOf('.');
        return (dot < 0) ? path : path.slice(0, dot);
      },

      _EVENT_CHANGED: '-changed',

      /**
       * Notify that an array has changed.
       *
       * Example:
       *
       *     this.items = [ {name: 'Jim'}, {name: 'Todd'}, {name: 'Bill'} ];
       *     ...
       *     this.items.splice(1, 1, {name: 'Sam'});
       *     this.items.push({name: 'Bob'});
       *     this.notifySplices('items', [
       *       { index: 1, removed: [{name: 'Todd'}], addedCount: 1, obect: this.items, type: 'splice' },
       *       { index: 3, removed: [], addedCount: 1, object: this.items, type: 'splice'}
       *     ]);
       *
       * @param {string} path Path that should be notified.
       * @param {Array} splices Array of splice records indicating ordered
       *   changes that occurred to the array. Each record should have the
       *   following fields:
       *    * index: index at which the change occurred
       *    * removed: array of items that were removed from this index
       *    * addedCount: number of new items added at this index
       *    * object: a reference to the array in question
       *    * type: the string literal 'splice'
       *
       *   Note that splice records _must_ be normalized such that they are
       *   reported in index order (raw results from `Object.observe` are not
       *   ordered and must be normalized/merged before notifying).
      */
      notifySplices: function(path, splices) {
        var info = {};
        var array = this._get(path, this, info);
        // Notify change to key-based path
        this._notifySplices(array, info.path, splices);
      },

      // Note: this implemetation only accepts key-based array paths
      _notifySplices: function(array, path, splices) {
        var change = {
          keySplices: Polymer.Collection.applySplices(array, splices),
          indexSplices: splices
        };
        if (!array.hasOwnProperty('splices')) {
          Object.defineProperty(array, 'splices',
            {configurable: true, writable: true});
        }
        array.splices = change;
        this._notifyPath(path + '.splices', change);
        this._notifyPath(path + '.length', array.length);
        // Null here to allow potentially large splice records to be GC'ed
        change.keySplices = null;
        change.indexSplices = null;
      },

      _notifySplice: function(array, path, index, added, removed) {
        this._notifySplices(array, path, [{
          index: index,
          addedCount: added,
          removed: removed,
          object: array,
          type: 'splice'
        }]);
      },

      /**
       * Adds items onto the end of the array at the path specified.
       *
       * The arguments after `path` and return value match that of
       * `Array.prototype.push`.
       *
       * This method notifies other paths to the same array that a
       * splice occurred to the array.
       *
       * @method push
       * @param {String} path Path to array.
       * @param {...any} var_args Items to push onto array
       * @return {number} New length of the array.
       */
      push: function(path) {
        var info = {};
        var array = this._get(path, this, info);
        var args = Array.prototype.slice.call(arguments, 1);
        var len = array.length;
        var ret = array.push.apply(array, args);
        if (args.length) {
          this._notifySplice(array, info.path, len, args.length, []);
        }
        return ret;
      },

      /**
       * Removes an item from the end of array at the path specified.
       *
       * The arguments after `path` and return value match that of
       * `Array.prototype.pop`.
       *
       * This method notifies other paths to the same array that a
       * splice occurred to the array.
       *
       * @method pop
       * @param {String} path Path to array.
       * @return {any} Item that was removed.
       */
      pop: function(path) {
        var info = {};
        var array = this._get(path, this, info);
        var hadLength = Boolean(array.length);
        var args = Array.prototype.slice.call(arguments, 1);
        var ret = array.pop.apply(array, args);
        if (hadLength) {
          this._notifySplice(array, info.path, array.length, 0, [ret]);
        }
        return ret;
      },

      /**
       * Starting from the start index specified, removes 0 or more items
       * from the array and inserts 0 or more new itms in their place.
       *
       * The arguments after `path` and return value match that of
       * `Array.prototype.splice`.
       *
       * This method notifies other paths to the same array that a
       * splice occurred to the array.
       *
       * @method splice
       * @param {String} path Path to array.
       * @param {number} start Index from which to start removing/inserting.
       * @param {number} deleteCount Number of items to remove.
       * @param {...any} var_args Items to insert into array.
       * @return {Array} Array of removed items.
       */
      splice: function(path, start, deleteCount) {
        var info = {};
        var array = this._get(path, this, info);
        // Normalize fancy native splice handling of crazy start values
        if (start < 0) {
          start = array.length - Math.floor(-start);
        } else {
          start = Math.floor(start);
        }
        if (!start) {
          start = 0;
        }
        var args = Array.prototype.slice.call(arguments, 1);
        var ret = array.splice.apply(array, args);
        var addedCount = Math.max(args.length - 2, 0);
        if (addedCount || ret.length) {
          this._notifySplice(array, info.path, start, addedCount, ret);
        }
        return ret;
      },

      /**
       * Removes an item from the beginning of array at the path specified.
       *
       * The arguments after `path` and return value match that of
       * `Array.prototype.pop`.
       *
       * This method notifies other paths to the same array that a
       * splice occurred to the array.
       *
       * @method shift
       * @param {String} path Path to array.
       * @return {any} Item that was removed.
       */
      shift: function(path) {
        var info = {};
        var array = this._get(path, this, info);
        var hadLength = Boolean(array.length);
        var args = Array.prototype.slice.call(arguments, 1);
        var ret = array.shift.apply(array, args);
        if (hadLength) {
          this._notifySplice(array, info.path, 0, 0, [ret]);
        }
        return ret;
      },

      /**
       * Adds items onto the beginning of the array at the path specified.
       *
       * The arguments after `path` and return value match that of
       * `Array.prototype.push`.
       *
       * This method notifies other paths to the same array that a
       * splice occurred to the array.
       *
       * @method unshift
       * @param {String} path Path to array.
       * @param {...any} var_args Items to insert info array
       * @return {number} New length of the array.
       */
      unshift: function(path) {
        var info = {};
        var array = this._get(path, this, info);
        var args = Array.prototype.slice.call(arguments, 1);
        var ret = array.unshift.apply(array, args);
        if (args.length) {
          this._notifySplice(array, info.path, 0, args.length, []);
        }
        return ret;
      },

      // TODO(kschaaf): This is the path analogue to Polymer.Bind.prepareModel,
      // which provides API for path-based notification on elements with property
      // effects; this should be re-factored along with the Bind lib, either all on
      // Base or all in Bind (see issue https://github.com/Polymer/polymer/issues/2547).
      prepareModelNotifyPath: function(model) {
        this.mixin(model, {
          fire: Polymer.Base.fire,
          _getEvent: Polymer.Base._getEvent,
          __eventCache: Polymer.Base.__eventCache,
          notifyPath: Polymer.Base.notifyPath,
          _get: Polymer.Base._get,
          _EVENT_CHANGED: Polymer.Base._EVENT_CHANGED,
          _notifyPath: Polymer.Base._notifyPath,
          _notifyPathUp: Polymer.Base._notifyPathUp,
          _pathEffector: Polymer.Base._pathEffector,
          _annotationPathEffect: Polymer.Base._annotationPathEffect,
          _complexObserverPathEffect: Polymer.Base._complexObserverPathEffect,
          _annotatedComputationPathEffect: Polymer.Base._annotatedComputationPathEffect,
          _computePathEffect: Polymer.Base._computePathEffect,
          _modelForPath: Polymer.Base._modelForPath,
          _pathMatchesEffect: Polymer.Base._pathMatchesEffect,
          _notifyBoundPaths: Polymer.Base._notifyBoundPaths,
          _getPathParts: Polymer.Base._getPathParts
        });
      }

    });

  })();
Polymer.Base._addFeature({

    /**
     * Rewrites a given URL relative to the original location of the document
     * containing the `dom-module` for this element.  This method will return
     * the same URL before and after vulcanization.
     *
     * @method resolveUrl
     * @param {string} url URL to resolve.
     * @return {string} Rewritten URL relative to the import
     */
    resolveUrl: function(url) {
      // TODO(sorvell): do we want to put the module reference on the prototype?
      var module = Polymer.DomModule.import(this.is);
      var root = '';
      if (module) {
        var assetPath = module.getAttribute('assetpath') || '';
        root = Polymer.ResolveUrl.resolveUrl(assetPath, module.ownerDocument.baseURI);
      }
      return Polymer.ResolveUrl.resolveUrl(url, root);
    }

  });
/*
  Extremely simple css parser. Intended to be not more than what we need
  and definitely not necessarily correct =).
*/
Polymer.CssParse = (function() {

  return {
    // given a string of css, return a simple rule tree
    parse: function(text) {
      text = this._clean(text);
      return this._parseCss(this._lex(text), text);
    },

    // remove stuff we don't care about that may hinder parsing
    _clean: function (cssText) {
      return cssText.replace(this._rx.comments, '').replace(this._rx.port, '');
    },

    // super simple {...} lexer that returns a node tree
    _lex: function(text) {
      var root = {start: 0, end: text.length};
      var n = root;
      for (var i=0, l=text.length; i < l; i++) {
        switch (text[i]) {
          case this.OPEN_BRACE:
            //console.group(i);
            if (!n.rules) {
              n.rules = [];
            }
            var p = n;
            var previous = p.rules[p.rules.length-1];
            n = {start: i+1, parent: p, previous: previous};
            p.rules.push(n);
            break;
          case this.CLOSE_BRACE:
            //console.groupEnd(n.start);
            n.end = i+1;
            n = n.parent || root;
            break;
        }
      }
      return root;
    },

    // add selectors/cssText to node tree
    _parseCss: function(node, text) {
      var t = text.substring(node.start, node.end-1);
      node.parsedCssText = node.cssText = t.trim();
      if (node.parent) {
        var ss = node.previous ? node.previous.end : node.parent.start;
        t = text.substring(ss, node.start-1);
        t = this._expandUnicodeEscapes(t);
        t = t.replace(this._rx.multipleSpaces, ' ');
        // TODO(sorvell): ad hoc; make selector include only after last ;
        // helps with mixin syntax
        t = t.substring(t.lastIndexOf(';')+1);
        var s = node.parsedSelector = node.selector = t.trim();
        node.atRule = (s.indexOf(this.AT_START) === 0);
        // note, support a subset of rule types...
        if (node.atRule) {
          if (s.indexOf(this.MEDIA_START) === 0) {
            node.type = this.types.MEDIA_RULE;
          } else if (s.match(this._rx.keyframesRule)) {
            node.type = this.types.KEYFRAMES_RULE;
          }
        } else {
          if (s.indexOf(this.VAR_START) === 0) {
            node.type = this.types.MIXIN_RULE;
          } else {
            node.type = this.types.STYLE_RULE;
          }
        }
      }
      var r$ = node.rules;
      if (r$) {
        for (var i=0, l=r$.length, r; (i<l) && (r=r$[i]); i++) {
          this._parseCss(r, text);
        }
      }
      return node;
    },

    // conversion of sort unicode escapes with spaces like `\33 ` (and longer) into
    // expanded form that doesn't require trailing space `\000033`
    _expandUnicodeEscapes : function(s) {
      return s.replace(/\\([0-9a-f]{1,6})\s/gi, function() {
        var code = arguments[1], repeat = 6 - code.length;
        while (repeat--) {
          code = '0' + code;
        }
        return '\\' + code;
      });
    },

    // stringify parsed css.
    stringify: function(node, preserveProperties, text) {
      text = text || '';
      // calc rule cssText
      var cssText = '';
      if (node.cssText || node.rules) {
        var r$ = node.rules;
        if (r$ && (preserveProperties || !this._hasMixinRules(r$))) {
          for (var i=0, l=r$.length, r; (i<l) && (r=r$[i]); i++) {
            cssText = this.stringify(r, preserveProperties, cssText);
          }
        } else {
          cssText = preserveProperties ? node.cssText :
            this.removeCustomProps(node.cssText);
          cssText = cssText.trim();
          if (cssText) {
            cssText = '  ' + cssText + '\n';
          }
        }
      }
      // emit rule if there is cssText
      if (cssText) {
        if (node.selector) {
          text += node.selector + ' ' + this.OPEN_BRACE + '\n';
        }
        text += cssText;
        if (node.selector) {
          text += this.CLOSE_BRACE + '\n\n';
        }
      }
      return text;
    },

    _hasMixinRules: function(rules) {
      return rules[0].selector.indexOf(this.VAR_START) === 0;
    },

    removeCustomProps: function(cssText) {
      cssText = this.removeCustomPropAssignment(cssText);
      return this.removeCustomPropApply(cssText);
    },

    removeCustomPropAssignment: function(cssText) {
      return cssText
        .replace(this._rx.customProp, '')
        .replace(this._rx.mixinProp, '');
    },

    removeCustomPropApply: function(cssText) {
      return cssText
        .replace(this._rx.mixinApply, '')
        .replace(this._rx.varApply, '');
    },

    types: {
      STYLE_RULE: 1,
      KEYFRAMES_RULE: 7,
      MEDIA_RULE: 4,
      MIXIN_RULE: 1000
    },

    OPEN_BRACE: '{',
    CLOSE_BRACE: '}',

    // helper regexp's
    _rx: {
      comments: /\/\*[^*]*\*+([^/*][^*]*\*+)*\//gim,
      port: /@import[^;]*;/gim,
      customProp: /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?(?:[;\n]|$)/gim,
      mixinProp:  /(?:^[^;\-\s}]+)?--[^;{}]*?:[^{};]*?{[^}]*?}(?:[;\n]|$)?/gim,
      mixinApply: /@apply[\s]*\([^)]*?\)[\s]*(?:[;\n]|$)?/gim,
      varApply: /[^;:]*?:[^;]*?var\([^;]*\)(?:[;\n]|$)?/gim,
      keyframesRule: /^@[^\s]*keyframes/,
      multipleSpaces: /\s+/g
    },

    VAR_START: '--',
    MEDIA_START: '@media',
    AT_START: '@'

  };

})();
Polymer.StyleUtil = (function() {

    return {

      MODULE_STYLES_SELECTOR: 'style, link[rel=import][type~=css], template',
      INCLUDE_ATTR: 'include',

      toCssText: function(rules, callback, preserveProperties) {
        if (typeof rules === 'string') {
          rules = this.parser.parse(rules);
        }
        if (callback) {
          this.forEachStyleRule(rules, callback);
        }
        return this.parser.stringify(rules, preserveProperties);
      },

      forRulesInStyles: function(styles, callback) {
        if (styles) {
          for (var i=0, l=styles.length, s; (i<l) && (s=styles[i]); i++) {
            this.forEachStyleRule(this.rulesForStyle(s), callback);
          }
        }
      },

      rulesForStyle: function(style) {
        if (!style.__cssRules && style.textContent) {
          style.__cssRules =  this.parser.parse(style.textContent);
        }
        return style.__cssRules;
      },

      forEachStyleRule: function(node, callback) {
        if (!node) {
          return;
        }
        var skipRules = false;
        if (node.type === this.ruleTypes.STYLE_RULE) {
          callback(node);
        } else if (node.type === this.ruleTypes.KEYFRAMES_RULE ||
            node.type === this.ruleTypes.MIXIN_RULE) {
          skipRules = true;
        }
        var r$ = node.rules;
        if (r$ && !skipRules) {
          for (var i=0, l=r$.length, r; (i<l) && (r=r$[i]); i++) {
            this.forEachStyleRule(r, callback);
          }
        }
      },

      // add a string of cssText to the document.
      applyCss: function(cssText, moniker, target, afterNode) {
        var style = document.createElement('style');
        if (moniker) {
          style.setAttribute('scope', moniker);
        }
        style.textContent = cssText;
        target = target || document.head;
        if (!afterNode) {
          var n$ = target.querySelectorAll('style[scope]');
          afterNode = n$[n$.length-1];
        }
        target.insertBefore(style,
          (afterNode && afterNode.nextSibling) || target.firstChild);
        return style;
      },

      cssFromModules: function(moduleIds, warnIfNotFound) {
        var modules = moduleIds.trim().split(' ');
        var cssText = '';
        for (var i=0; i < modules.length; i++) {
          cssText += this.cssFromModule(modules[i], warnIfNotFound);
        }
        return cssText;
      },

      // returns cssText of styles in a given module; also un-applies any
      // styles that apply to the document.
      cssFromModule: function(moduleId, warnIfNotFound) {
        var m = Polymer.DomModule.import(moduleId);
        if (m && !m._cssText) {
          m._cssText = this.cssFromElement(m);
        }
        if (!m && warnIfNotFound) {
          console.warn('Could not find style data in module named', moduleId);
        }
        return m && m._cssText || '';
      },

      // support lots of ways to discover css...
      cssFromElement: function(element) {
        var cssText = '';
        // if element is a template, get content from its .content
        var content = element.content || element;
        var e$ = Polymer.TreeApi.arrayCopy(
          content.querySelectorAll(this.MODULE_STYLES_SELECTOR));
        for (var i=0, e; i < e$.length; i++) {
          e = e$[i];
          // look inside templates for elements
          if (e.localName === 'template') {
            cssText += this.cssFromElement(e);
          } else {
            // style elements inside dom-modules will apply to the main document
            // we don't want this, so we remove them here.
            if (e.localName === 'style') {
              var include = e.getAttribute(this.INCLUDE_ATTR);
              // now support module refs on 'styling' elements
              if (include) {
                cssText += this.cssFromModules(include, true);
              }
              // get style element applied to main doc via HTMLImports polyfill
              e = e.__appliedElement || e;
              e.parentNode.removeChild(e);
              cssText += this.resolveCss(e.textContent, element.ownerDocument);
            // it's an import, assume this is a text file of css content.
            // TODO(sorvell): plan is to deprecate this way to get styles;
            // remember to add deprecation warning when this is done.
            } else if (e.import && e.import.body) {
              cssText += this.resolveCss(e.import.body.textContent, e.import);
            }
          }
        }
        return cssText;
      },

      resolveCss: Polymer.ResolveUrl.resolveCss,
      parser: Polymer.CssParse,
      ruleTypes: Polymer.CssParse.types

    };

  })();
Polymer.StyleTransformer = (function() {

    var nativeShadow = Polymer.Settings.useNativeShadow;
    var styleUtil = Polymer.StyleUtil;

    /* Transforms ShadowDOM styling into ShadyDOM styling

     * scoping:

        * elements in scope get scoping selector class="x-foo-scope"
        * selectors re-written as follows:

          div button -> div.x-foo-scope button.x-foo-scope

     * :host -> scopeName

     * :host(...) -> scopeName...

     * ::content -> ' ' NOTE: requires use of scoping selector and selectors
       cannot otherwise be scoped:
       e.g. :host ::content > .bar -> x-foo > .bar

     * ::shadow, /deep/: processed similar to ::content

     * :host-context(...): scopeName..., ... scopeName

    */
    var api = {

      // Given a node and scope name, add a scoping class to each node
      // in the tree. This facilitates transforming css into scoped rules.
      dom: function(node, scope, useAttr, shouldRemoveScope) {
        this._transformDom(node, scope || '', useAttr, shouldRemoveScope);
      },

      _transformDom: function(node, selector, useAttr, shouldRemoveScope) {
        if (node.setAttribute) {
          this.element(node, selector, useAttr, shouldRemoveScope);
        }
        var c$ = Polymer.dom(node).childNodes;
        for (var i=0; i<c$.length; i++) {
          this._transformDom(c$[i], selector, useAttr, shouldRemoveScope);
        }
      },

      element: function(element, scope, useAttr, shouldRemoveScope) {
        if (useAttr) {
          if (shouldRemoveScope) {
            element.removeAttribute(SCOPE_NAME);
          } else {
            element.setAttribute(SCOPE_NAME, scope);
          }
        } else {
          // note: if using classes, we add both the general 'style-scope' class
          // as well as the specific scope. This enables easy filtering of all
          // `style-scope` elements
          if (scope) {
            // note: svg on IE does not have classList so fallback to class
            if (element.classList) {
              if (shouldRemoveScope) {
                element.classList.remove(SCOPE_NAME);
                element.classList.remove(scope);
              } else {
                element.classList.add(SCOPE_NAME);
                element.classList.add(scope);
              }
            } else if (element.getAttribute) {
              var c = element.getAttribute(CLASS);
              if (shouldRemoveScope) {
                if (c) {
                  element.setAttribute(CLASS, c.replace(SCOPE_NAME, '')
                    .replace(scope, ''));
                }
              } else {
                element.setAttribute(CLASS, (c ? c + ' ' : '') +
                  SCOPE_NAME + ' ' + scope);
              }
            }
          }
        }
      },

      elementStyles: function(element, callback) {
        var styles = element._styles;
        var cssText = '';
        for (var i=0, l=styles.length, s; (i<l) && (s=styles[i]); i++) {
          var rules = styleUtil.rulesForStyle(s);
          cssText += nativeShadow ?
            styleUtil.toCssText(rules, callback) :
            this.css(rules, element.is, element.extends, callback,
            element._scopeCssViaAttr) + '\n\n';
        }
        return cssText.trim();
      },

      // Given a string of cssText and a scoping string (scope), returns
      // a string of scoped css where each selector is transformed to include
      // a class created from the scope. ShadowDOM selectors are also transformed
      // (e.g. :host) to use the scoping selector.
      css: function(rules, scope, ext, callback, useAttr) {
        var hostScope = this._calcHostScope(scope, ext);
        scope = this._calcElementScope(scope, useAttr);
        var self = this;
        return styleUtil.toCssText(rules, function(rule) {
          if (!rule.isScoped) {
            self.rule(rule, scope, hostScope);
            rule.isScoped = true;
          }
          if (callback) {
            callback(rule, scope, hostScope);
          }
        });
      },

      _calcElementScope: function (scope, useAttr) {
        if (scope) {
          return useAttr ?
            CSS_ATTR_PREFIX + scope + CSS_ATTR_SUFFIX :
            CSS_CLASS_PREFIX + scope;
        } else {
          return '';
        }
      },

      _calcHostScope: function(scope, ext) {
        return ext ? '[is=' +  scope + ']' : scope;
      },

      rule: function (rule, scope, hostScope) {
        this._transformRule(rule, this._transformComplexSelector,
          scope, hostScope);
      },

      // transforms a css rule to a scoped rule.
      _transformRule: function(rule, transformer, scope, hostScope) {
        var p$ = rule.selector.split(COMPLEX_SELECTOR_SEP);
        for (var i=0, l=p$.length, p; (i<l) && (p=p$[i]); i++) {
          p$[i] = transformer.call(this, p, scope, hostScope);
        }
        // NOTE: save transformedSelector for subsequent matching of elements
        // against selectors (e.g. when calculating style properties)
        rule.selector = rule.transformedSelector =
          p$.join(COMPLEX_SELECTOR_SEP);
      },

      _transformComplexSelector: function(selector, scope, hostScope) {
        var stop = false;
        var hostContext = false;
        var self = this;
        selector = selector.replace(SIMPLE_SELECTOR_SEP, function(m, c, s) {
          if (!stop) {
            var info = self._transformCompoundSelector(s, c, scope, hostScope);
            stop = stop || info.stop;
            hostContext = hostContext || info.hostContext;
            c = info.combinator;
            s = info.value;
          } else {
            s = s.replace(SCOPE_JUMP, ' ');
          }
          return c + s;
        });
        if (hostContext) {
          selector = selector.replace(HOST_CONTEXT_PAREN,
            function(m, pre, paren, post) {
              return pre + paren + ' ' + hostScope + post +
                COMPLEX_SELECTOR_SEP + ' ' + pre + hostScope + paren + post;
             });
        }
        return selector;
      },

      _transformCompoundSelector: function(selector, combinator, scope, hostScope) {
        // replace :host with host scoping class
        var jumpIndex = selector.search(SCOPE_JUMP);
        var hostContext = false;
        if (selector.indexOf(HOST_CONTEXT) >=0) {
          hostContext = true;
        } else if (selector.indexOf(HOST) >=0) {
          // :host(...) -> scopeName...
          selector = selector.replace(HOST_PAREN, function(m, host, paren) {
            return hostScope + paren;
          });
          // now normal :host
          selector = selector.replace(HOST, hostScope);
        // replace other selectors with scoping class
        } else if (jumpIndex !== 0) {
          selector = scope ? this._transformSimpleSelector(selector, scope) :
            selector;
        }
        // remove left-side combinator when dealing with ::content.
        if (selector.indexOf(CONTENT) >= 0) {
          combinator = '';
        }
        // process scope jumping selectors up to the scope jump and then stop
        // e.g. .zonk ::content > .foo ==> .zonk.scope > .foo
        var stop;
        if (jumpIndex >= 0) {
          selector = selector.replace(SCOPE_JUMP, ' ');
          stop = true;
        }
        return {value: selector, combinator: combinator, stop: stop,
          hostContext: hostContext};
      },

      _transformSimpleSelector: function(selector, scope) {
        var p$ = selector.split(PSEUDO_PREFIX);
        p$[0] += scope;
        return p$.join(PSEUDO_PREFIX);
      },

      documentRule: function(rule) {
        // reset selector in case this is redone.
        rule.selector = rule.parsedSelector;
        this.normalizeRootSelector(rule);
        if (!nativeShadow) {
          this._transformRule(rule, this._transformDocumentSelector);
        }
      },

      normalizeRootSelector: function(rule) {
        if (rule.selector === ROOT) {
          rule.selector = 'body';
        }
      },

      _transformDocumentSelector: function(selector) {
        return selector.match(SCOPE_JUMP) ?
          this._transformComplexSelector(selector, SCOPE_DOC_SELECTOR) :
          this._transformSimpleSelector(selector.trim(), SCOPE_DOC_SELECTOR);
      },

      SCOPE_NAME: 'style-scope'
    };

    var SCOPE_NAME = api.SCOPE_NAME;
    var SCOPE_DOC_SELECTOR = ':not([' + SCOPE_NAME + '])' +
      ':not(.' + SCOPE_NAME + ')';
    var COMPLEX_SELECTOR_SEP = ',';
    var SIMPLE_SELECTOR_SEP = /(^|[\s>+~]+)([^\s>+~]+)/g;
    var HOST = ':host';
    var ROOT = ':root';
    // NOTE: this supports 1 nested () pair for things like
    // :host(:not([selected]), more general support requires
    // parsing which seems like overkill
    var HOST_PAREN = /(\:host)(?:\(((?:\([^)(]*\)|[^)(]*)+?)\))/g;
    var HOST_CONTEXT = ':host-context';
    var HOST_CONTEXT_PAREN = /(.*)(?::host-context)(?:\(((?:\([^)(]*\)|[^)(]*)+?)\))(.*)/;
    var CONTENT = '::content';
    var SCOPE_JUMP = /::content|::shadow|\/deep\//;
    var CSS_CLASS_PREFIX = '.';
    var CSS_ATTR_PREFIX = '[' + SCOPE_NAME + '~=';
    var CSS_ATTR_SUFFIX = ']';
    var PSEUDO_PREFIX = ':';
    var CLASS = 'class';

    // exports
    return api;

  })();
Polymer.StyleExtends = (function() {

  var styleUtil = Polymer.StyleUtil;

  return {
    
    hasExtends: function(cssText) {
      return Boolean(cssText.match(this.rx.EXTEND));
    },

    transform: function(style) {
      var rules = styleUtil.rulesForStyle(style);
      var self = this;
      styleUtil.forEachStyleRule(rules, function(rule) {
        var map = self._mapRule(rule);
        if (rule.parent) {
          var m;
          while (m = self.rx.EXTEND.exec(rule.cssText)) {
            var extend = m[1];
            var extendor = self._findExtendor(extend, rule);
            if (extendor) {
              self._extendRule(rule, extendor);
            }
          }
        }
        rule.cssText = rule.cssText.replace(self.rx.EXTEND, '');
      });
      // strip unused % selectors
      return styleUtil.toCssText(rules, function(rule) {
        if (rule.selector.match(self.rx.STRIP)) {
          rule.cssText = '';
        }
      }, true);
    },

    _mapRule: function(rule) {
      if (rule.parent) {
        var map = rule.parent.map || (rule.parent.map = {});
        var parts = rule.selector.split(',');
        for (var i=0, p; i < parts.length; i++) {
          p = parts[i];
          map[p.trim()] = rule;
        }
        return map;
      }
    },

    _findExtendor: function(extend, rule) {
      return rule.parent && rule.parent.map && rule.parent.map[extend] ||
        this._findExtendor(extend, rule.parent);
    },

    _extendRule: function(target, source) {
      if (target.parent !== source.parent) {
        this._cloneAndAddRuleToParent(source, target.parent);
      }
      target.extends = target.extends || [];
      target.extends.push(source);
      // TODO: this misses `%foo, .bar` as an unetended selector but
      // this seems rare and could possibly be unsupported.
      source.selector = source.selector.replace(this.rx.STRIP, '');
      source.selector = (source.selector && source.selector + ',\n') + 
        target.selector;
      if (source.extends) {
        source.extends.forEach(function(e) {
          this._extendRule(target, e);
        }, this);
      }
    },

    _cloneAndAddRuleToParent: function(rule, parent) {
      rule = Object.create(rule);
      rule.parent = parent;
      if (rule.extends) {
        rule.extends = rule.extends.slice();
      }
      parent.rules.push(rule);
    },

    rx: {
      EXTEND: /@extends\(([^)]*)\)\s*?;/gim,
      STRIP: /%[^,]*$/
    }

  };

})();
(function() {

    var prepElement = Polymer.Base._prepElement;
    var nativeShadow = Polymer.Settings.useNativeShadow;

    var styleUtil = Polymer.StyleUtil;
    var styleTransformer = Polymer.StyleTransformer;
    var styleExtends = Polymer.StyleExtends;

    Polymer.Base._addFeature({

      _prepElement: function(element) {
        if (this._encapsulateStyle) {
          styleTransformer.element(element, this.is,
            this._scopeCssViaAttr);
        }
        prepElement.call(this, element);
      },

      _prepStyles: function() {
        if (this._encapsulateStyle === undefined) {
          this._encapsulateStyle = !nativeShadow &&
            Boolean(this._template);
        }
        if (this._template) {
          this._styles = this._collectStyles();
          var cssText = styleTransformer.elementStyles(this);
          if (cssText) {
            var style = styleUtil.applyCss(cssText, this.is,
              nativeShadow ? this._template.content : null);
            // keep track of style when in document scope (polyfill) so we can
            // attach property styles after it.
            if (!nativeShadow) {
              this._scopeStyle = style;
            }
          }
        } else {
          this._styles = [];
        }
      },

      // search for extra style modules via `styleModules`
      // TODO(sorvell): consider dropping support for `styleModules`
      _collectStyles: function() {
        var styles = [];
        var cssText = '', m$ = this.styleModules;
        if (m$) {
          for (var i=0, l=m$.length, m; (i<l) && (m=m$[i]); i++) {
            cssText += styleUtil.cssFromModule(m);
          }
        }
        cssText += styleUtil.cssFromModule(this.is);
        // check if we have a disconnected template and add styles from that
        // if so; if our template has no parent or is not in our dom-module...
        var p = this._template && this._template.parentNode;
        if (this._template && (!p || p.id.toLowerCase() !== this.is)) {
          cssText += styleUtil.cssFromElement(this._template);
        }
        if (cssText) {
          var style = document.createElement('style');
          style.textContent = cssText;
          // extends!!
          if (styleExtends.hasExtends(style.textContent)) {
            // TODO(sorvell): variable is not used, should it update `style.textContent`?
            cssText = styleExtends.transform(style);
          }
          styles.push(style);
        }
        return styles;
      },

      // instance-y
      // add scoping class whenever an element is added to localDOM
      _elementAdd: function(node) {
        if (this._encapsulateStyle) {
          // If __styleScoped is set, this is a one-time optimization to
          // avoid scoping pre-scoped document fragments
          if (node.__styleScoped) {
            node.__styleScoped = false;
          } else {
            styleTransformer.dom(node, this.is, this._scopeCssViaAttr);
          }
        }
      },

      // remove scoping class whenever an element is removed from localDOM
      _elementRemove: function(node) {
        if (this._encapsulateStyle) {
          styleTransformer.dom(node, this.is, this._scopeCssViaAttr, true);
        }
      },

      /**
       * Apply style scoping to the specified `container` and all its
       * descendants. If `shouldObserve` is true, changes to the container are
       * monitored via mutation observer and scoping is applied.
       *
       * This method is useful for ensuring proper local DOM CSS scoping
       * for elements created in this local DOM scope, but out of the
       * control of this element (i.e., by a 3rd-party library)
       * when running in non-native Shadow DOM environments.
       *
       * @method scopeSubtree
       * @param {Element} container Element to scope.
       * @param {boolean} shouldObserve When true, monitors the container
       *   for changes and re-applies scoping for any future changes.
       */
      scopeSubtree: function(container, shouldObserve) {
        if (nativeShadow) {
          return;
        }
        var self = this;
        var scopify = function(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            var className = node.getAttribute('class');
            node.setAttribute('class', self._scopeElementClass(node, className));
            var n$ = node.querySelectorAll('*');
            for (var i=0, n; (i<n$.length) && (n=n$[i]); i++) {
              className = n.getAttribute('class');
              n.setAttribute('class', self._scopeElementClass(n, className));
            }
          }
        };
        scopify(container);
        if (shouldObserve) {
          var mo = new MutationObserver(function(mxns) {
            for (var i=0, m; (i<mxns.length) && (m=mxns[i]); i++) {
              if (m.addedNodes) {
                for (var j=0; j < m.addedNodes.length; j++) {
                  scopify(m.addedNodes[j]);
                }
              }
            }
          });
          mo.observe(container, {childList: true, subtree: true});
          return mo;
        }
      }

    });

  })();
Polymer.StyleProperties = (function() {
    'use strict';

    var nativeShadow = Polymer.Settings.useNativeShadow;
    var matchesSelector = Polymer.DomApi.matchesSelector;
    var styleUtil = Polymer.StyleUtil;
    var styleTransformer = Polymer.StyleTransformer;

    return {

      // decorates styles with rule info and returns an array of used style
      // property names
      decorateStyles: function(styles) {
        var self = this, props = {};
        styleUtil.forRulesInStyles(styles, function(rule) {
          self.decorateRule(rule);
          self.collectPropertiesInCssText(rule.propertyInfo.cssText, props);
        });
        // return this list of property names *consumes* in these styles.
        var names = [];
        for (var i in props) {
          names.push(i);
        }
        return names;
      },

      // decorate a single rule with property info
      decorateRule: function(rule) {
        if (rule.propertyInfo) {
          return rule.propertyInfo;
        }
        var info = {}, properties = {};
        var hasProperties = this.collectProperties(rule, properties);
        if (hasProperties) {
          info.properties = properties;
          // TODO(sorvell): workaround parser seeing mixins as additional rules
          rule.rules = null;
        }
        info.cssText = this.collectCssText(rule);
        rule.propertyInfo = info;
        return info;
      },

      // collects the custom properties from a rule's cssText
      collectProperties: function(rule, properties) {
        var info = rule.propertyInfo;
        if (info) {
          if (info.properties) {
            Polymer.Base.mixin(properties, info.properties);
            return true;
          }
        } else {
          var m, rx = this.rx.VAR_ASSIGN;
          var cssText = rule.parsedCssText;
          var any;
          while (m = rx.exec(cssText)) {
            // note: group 2 is var, 3 is mixin
            properties[m[1]] = (m[2] || m[3]).trim();
            any = true;
          }
          return any;
        }
      },

      // returns cssText of properties that consume variables/mixins
      collectCssText: function(rule) {
        var customCssText = '';
        var cssText = rule.parsedCssText;
        // NOTE: we support consumption inside mixin assignment
        // but not production, so strip out {...}
        cssText = cssText.replace(this.rx.BRACKETED, '')
          .replace(this.rx.VAR_ASSIGN, '');
        var parts = cssText.split(';');
        for (var i=0, p; i<parts.length; i++) {
          p = parts[i];
          if (p.match(this.rx.MIXIN_MATCH) || p.match(this.rx.VAR_MATCH)) {
            customCssText += p + ';\n';
          }
        }
        return customCssText;
      },

      collectPropertiesInCssText: function(cssText, props) {
        var m;
        while (m = this.rx.VAR_CAPTURE.exec(cssText)) {
          props[m[1]] = true;
          var def = m[2];
          if (def && def.match(this.rx.IS_VAR)) {
            props[def] = true;
          }
        }
      },

      // turns custom properties into realized values.
      reify: function(props) {
        // big perf optimization here: reify only *own* properties
        // since this object has __proto__ of the element's scope properties
        var names = Object.getOwnPropertyNames(props);
        for (var i=0, n; i < names.length; i++) {
          n = names[i];
          props[n] = this.valueForProperty(props[n], props);
        }
      },

      // given a property value, returns the reified value
      // a property value may be:
      // (1) a literal value like: red or 5px;
      // (2) a variable value like: var(--a), var(--a, red), or var(--a, --b);
      // (3) a literal mixin value like { properties }. Each of these properties
      // can have values that are: (a) literal, (b) variables, (c) @apply mixins.
      valueForProperty: function(property, props) {
        // case (1) default
        // case (3) defines a mixin and we have to reify the internals
        if (property) {
          if (property.indexOf(';') >=0) {
            property = this.valueForProperties(property, props);
          } else {
            // case (2) variable
            var self = this;
            var fn = function(all, prefix, value, fallback) {
              var propertyValue = (self.valueForProperty(props[value], props) ||
                (props[fallback] ?
                self.valueForProperty(props[fallback], props) :
                fallback));
              return prefix + (propertyValue || '');
            };
            property = property.replace(this.rx.VAR_MATCH, fn);
          }
        }
        return property && property.trim() || '';
      },

      // note: we do not yet support mixin within mixin
      valueForProperties: function(property, props) {
        var parts = property.split(';');
        for (var i=0, p, m; i<parts.length; i++) {
          if (p = parts[i]) {
            m = p.match(this.rx.MIXIN_MATCH);
            if (m) {
              p = this.valueForProperty(props[m[1]], props);
            } else {
              var pp = p.split(':');
              if (pp[1]) {
                pp[1] = pp[1].trim();
                pp[1] = this.valueForProperty(pp[1], props) || pp[1];
              }
              p = pp.join(':');
            }
            parts[i] = (p && p.lastIndexOf(';') === p.length - 1) ?
              // strip trailing ;
              p.slice(0, -1) :
              p || '';
          }
        }
        return parts.join(';');
      },

      applyProperties: function(rule, props) {
        var output = '';
        // dynamically added sheets may not be decorated so ensure they are.
        if (!rule.propertyInfo) {
          this.decorateRule(rule);
        }
        if (rule.propertyInfo.cssText) {
          output = this.valueForProperties(rule.propertyInfo.cssText, props);
        }
        rule.cssText = output;
      },

      // Test if the rules in these styles matches the given `element` and if so,
      // collect any custom properties into `props`.
      propertyDataFromStyles: function(styles, element) {
        var props = {}, self = this;
        // generates a unique key for these matches
        var o = [], i = 0;
        styleUtil.forRulesInStyles(styles, function(rule) {
          // TODO(sorvell): we could trim the set of rules at declaration
          // time to only include ones that have properties
          if (!rule.propertyInfo) {
            self.decorateRule(rule);
          }
          // match element against transformedSelector: selector may contain
          // unwanted uniquification and parsedSelector does not directly match
          // for :host selectors.
          if (element && rule.propertyInfo.properties &&
              matchesSelector.call(element, rule.transformedSelector
                || rule.parsedSelector)) {
            self.collectProperties(rule, props);
            // produce numeric key for these matches for lookup
            addToBitMask(i, o);
          }
          i++;
        });
        return {properties: props, key: o};
      },

      // Test if a rule matches scope criteria (* or :root) and if so,
      // collect any custom properties into `props`.
      scopePropertiesFromStyles: function(styles) {
        if (!styles._scopeStyleProperties) {
          styles._scopeStyleProperties =
            this.selectedPropertiesFromStyles(styles, this.SCOPE_SELECTORS);
        }
        return styles._scopeStyleProperties;
      },

      // Test if a rule matches host criteria (:host) and if so,
      // collect any custom properties into `props`.
      //
      // TODO(sorvell): this should change to collecting properties from any
      // :host(...) and then matching these against self.
      hostPropertiesFromStyles: function(styles) {
        if (!styles._hostStyleProperties) {
          styles._hostStyleProperties =
            this.selectedPropertiesFromStyles(styles, this.HOST_SELECTORS);
        }
        return styles._hostStyleProperties;
      },

      selectedPropertiesFromStyles: function(styles, selectors) {
        var props = {}, self = this;
        styleUtil.forRulesInStyles(styles, function(rule) {
          if (!rule.propertyInfo) {
            self.decorateRule(rule);
          }
          for (var i=0; i < selectors.length; i++) {
            if (rule.parsedSelector === selectors[i]) {
              self.collectProperties(rule, props);
              return;
            }
          }
        });
        return props;
      },

      transformStyles: function(element, properties, scopeSelector) {
        var self = this;
        var hostSelector = styleTransformer
          ._calcHostScope(element.is, element.extends);
        var rxHostSelector = element.extends ?
          '\\' + hostSelector.slice(0, -1) + '\\]' :
          hostSelector;
        var hostRx = new RegExp(this.rx.HOST_PREFIX + rxHostSelector +
          this.rx.HOST_SUFFIX);
        return styleTransformer.elementStyles(element, function(rule) {
          self.applyProperties(rule, properties);
          if (rule.cssText && !nativeShadow) {
            self._scopeSelector(rule, hostRx, hostSelector,
              element._scopeCssViaAttr, scopeSelector);
          }
        });
      },

      // Strategy: x scope shim a selector e.g. to scope `.x-foo-42` (via classes):
      // non-host selector: .a.x-foo -> .x-foo-42 .a.x-foo
      // host selector: x-foo.wide -> x-foo.x-foo-42.wide
      _scopeSelector: function(rule, hostRx, hostSelector, viaAttr, scopeId) {
        rule.transformedSelector = rule.transformedSelector || rule.selector;
        var selector = rule.transformedSelector;
        var scope = viaAttr ? '[' + styleTransformer.SCOPE_NAME + '~=' +
          scopeId + ']' :
          '.' + scopeId;
        var parts = selector.split(',');
        for (var i=0, l=parts.length, p; (i<l) && (p=parts[i]); i++) {
          parts[i] = p.match(hostRx) ?
            p.replace(hostSelector, hostSelector + scope) :
            scope + ' ' + p;
        }
        rule.selector = parts.join(',');
      },

      applyElementScopeSelector: function(element, selector, old, viaAttr) {
        var c = viaAttr ? element.getAttribute(styleTransformer.SCOPE_NAME) :
          (element.getAttribute('class') || '');
        var v = old ? c.replace(old, selector) :
          (c ? c + ' ' : '') + this.XSCOPE_NAME + ' ' + selector;
        if (c !== v) {
          if (viaAttr) {
            element.setAttribute(styleTransformer.SCOPE_NAME, v);
          } else {
            element.setAttribute('class', v);
          }
        }
      },

      applyElementStyle: function(element, properties, selector, style) {
        // calculate cssText to apply
        var cssText = style ? style.textContent || '' :
          this.transformStyles(element, properties, selector);
        // if shady and we have a cached style that is not style, decrement
        var s = element._customStyle;
        if (s && !nativeShadow && (s !== style)) {
          s._useCount--;
          if (s._useCount <= 0 && s.parentNode) {
            s.parentNode.removeChild(s);
          }
        }
        // apply styling always under native or if we generated style
        // or the cached style is not in document(!)
        if (nativeShadow || (!style || !style.parentNode)) {
          // update existing style only under native
          if (nativeShadow && element._customStyle) {
            element._customStyle.textContent = cssText;
            style = element._customStyle;
          // otherwise, if we have css to apply, do so
          } else if (cssText) {
            // apply css after the scope style of the element to help with
            // style precedence rules.
            style = styleUtil.applyCss(cssText, selector,
              nativeShadow ? element.root : null, element._scopeStyle);
          }
        }
        // ensure this style is our custom style and increment its use count.
        if (style) {
          style._useCount = style._useCount || 0;
          // increment use count if we changed styles
          if (element._customStyle != style) {
            style._useCount++;
          }
          element._customStyle = style;
        }
        return style;
      },

      // customStyle properties are applied if they are truthy or 0. Otherwise,
      // they are skipped; this allows properties previously set in customStyle
      // to be easily reset to inherited values.
      mixinCustomStyle: function(props, customStyle) {
        var v;
        for (var i in customStyle) {
          v = customStyle[i];
          if (v || v === 0) {
            props[i] = v;
          }
        }
      },

      rx: {
        VAR_ASSIGN: /(?:^|[;\s{]\s*)(--[\w-]*?)\s*:\s*(?:([^;{]*)|{([^}]*)})(?:(?=[;\s}])|$)/gi,
        MIXIN_MATCH: /(?:^|\W+)@apply[\s]*\(([^)]*)\)/i,
        // note, this supports:
        // var(--a)
        // var(--a, --b)
        // var(--a, fallback-literal)
        // var(--a, fallback-literal(with-one-nested-parentheses))
        VAR_MATCH: /(^|\W+)var\([\s]*([^,)]*)[\s]*,?[\s]*((?:[^,)]*)|(?:[^;]*\([^;)]*\)))[\s]*?\)/gi,
        VAR_CAPTURE: /\([\s]*(--[^,\s)]*)(?:,[\s]*(--[^,\s)]*))?(?:\)|,)/gi,
        IS_VAR: /^--/,
        BRACKETED: /\{[^}]*\}/g,
        HOST_PREFIX: '(?:^|[^.#[:])',
        HOST_SUFFIX: '($|[.:[\\s>+~])'
      },

      HOST_SELECTORS: [':host'],
      SCOPE_SELECTORS: [':root'],
      XSCOPE_NAME: 'x-scope'

    };

    function addToBitMask(n, bits) {
      var o = parseInt(n / 32);
      var v = 1 << (n % 32);
      bits[o] = (bits[o] || 0) | v;
    }

  })();
(function() {

  Polymer.StyleCache = function() {
    this.cache = {};
  };

  Polymer.StyleCache.prototype = {
    
    MAX: 100,

    store: function(is, data, keyValues, keyStyles) {
      data.keyValues = keyValues;
      data.styles = keyStyles;
      var s$ = this.cache[is] = this.cache[is] || [];
      s$.push(data);
      if (s$.length > this.MAX) {
        s$.shift();
      }
    },

    retrieve: function(is, keyValues, keyStyles) {
      var cache = this.cache[is];
      if (cache) {
        // look through cache backwards as most recent push is last.
        for (var i=cache.length-1, data; i >= 0; i--) {
          data = cache[i];
          if (keyStyles === data.styles &&
              this._objectsEqual(keyValues, data.keyValues)) {
            return data;
          }
        }
      }
    },

    clear: function() {
      this.cache = {};
    },

    // note, this is intentially limited to support just the cases we need
    // right now. The objects we're checking here are either objects that must 
    // always have the same keys OR arrays.
    _objectsEqual: function(target, source) {
      var t, s;
      for (var i in target) {
        t = target[i], s = source[i];
        if (!(typeof t === 'object' && t ? this._objectsStrictlyEqual(t, s) : 
            t === s)) {
          return false;
        }
      }
      if (Array.isArray(target)) {
        return target.length === source.length;
      }
      return true;
    },

    _objectsStrictlyEqual: function(target, source) {
      return this._objectsEqual(target, source) && 
        this._objectsEqual(source, target);
    }

  };

})();
Polymer.StyleDefaults = (function() {

    var styleProperties = Polymer.StyleProperties;
    var styleUtil = Polymer.StyleUtil;
    var StyleCache = Polymer.StyleCache;

    var api = {

      _styles: [],
      _properties: null,
      customStyle: {},
      _styleCache: new StyleCache(),

      addStyle: function(style) {
        this._styles.push(style);
        this._properties = null;
      },

      // NOTE: this object can be used as a styling scope so it has an api
      // similar to that of an element wrt style properties
      get _styleProperties() {
        if (!this._properties) {
          // force rules to reparse since they may be out of date
          styleProperties.decorateStyles(this._styles);
          // NOTE: reset cache for own properties; it may have been set when
          // an element in an import applied styles (e.g. custom-style)
          this._styles._scopeStyleProperties = null;
          this._properties = styleProperties
            .scopePropertiesFromStyles(this._styles);
          // mixin customStyle
          styleProperties.mixinCustomStyle(this._properties, this.customStyle);
          styleProperties.reify(this._properties);
        }
        return this._properties;
      },

      _needsStyleProperties: function() {},

      _computeStyleProperties: function() {
        return this._styleProperties;
      },

      /**
       * Re-evaluates and applies custom CSS properties to all elements in the
       * document based on dynamic changes, such as adding or removing classes.
       *
       * For performance reasons, Polymer's custom CSS property shim relies
       * on this explicit signal from the user to indicate when changes have
       * been made that affect the values of custom properties.
       *
       * @method updateStyles
       * @param {Object=} properties Properties object which is mixed into 
       * the document root `customStyle` property. This argument provides a 
       * shortcut for setting `customStyle` and then calling `updateStyles`.
      */
      updateStyles: function(properties) {
        // force properties update.
        this._properties = null;
        if (properties) {
          Polymer.Base.mixin(this.customStyle, properties);
        }
        // invalidate the cache
        this._styleCache.clear();
        // update any custom-styles we are tracking
        for (var i=0, s; i < this._styles.length; i++) {
          s = this._styles[i];
          s = s.__importElement || s;
          s._apply();
        }
      }

    };

    // exports
    return api;

  })();
(function() {
    'use strict';

    var serializeValueToAttribute = Polymer.Base.serializeValueToAttribute;

    var propertyUtils = Polymer.StyleProperties;
    var styleTransformer = Polymer.StyleTransformer;
    var styleUtil = Polymer.StyleUtil;
    var styleDefaults = Polymer.StyleDefaults;

    var nativeShadow = Polymer.Settings.useNativeShadow;

    Polymer.Base._addFeature({

      _prepStyleProperties: function() {
        // note: an element should produce an x-scope stylesheet
        // if it has any _stylePropertyNames
        this._ownStylePropertyNames = this._styles ?
          propertyUtils.decorateStyles(this._styles) :
          null;
      },

      /**
       * An element's style properties can be directly modified by
       * setting key-value pairs in `customStyle` on the element
       * (analogous to setting `style`) and then calling `updateStyles()`.
       *
       */
      customStyle: null,

      /**
     * Returns the computed style value for the given property.
     * @param {String} property
     * @return {String} the computed value
     */
      getComputedStyleValue: function(property) {
        return this._styleProperties && this._styleProperties[property] ||
          getComputedStyle(this).getPropertyValue(property);
      },

      // here we have an instance time spot to put custom property data
      _setupStyleProperties: function() {
        this.customStyle = {};
        this._styleCache = null;
        this._styleProperties = null;
        this._scopeSelector = null;
        this._ownStyleProperties = null;
        this._customStyle = null;
      },

      _needsStyleProperties: function() {
        return Boolean(this._ownStylePropertyNames &&
          this._ownStylePropertyNames.length);
      },

      _beforeAttached: function() {
        // note: do this once automatically,
        // then requires calling `updateStyles`
        if (!this._scopeSelector && this._needsStyleProperties()) {
          this._updateStyleProperties();
        }
      },

      _findStyleHost: function() {
        var e = this, root;
        while (root = Polymer.dom(e).getOwnerRoot()) {
          if (Polymer.isInstance(root.host)) {
            return root.host;
          }
          e = root.host;
        }
        return styleDefaults;
      },

      _updateStyleProperties: function() {
        var info, scope = this._findStyleHost();
        // install cache in host if it doesn't exist.
        if (!scope._styleCache) {
          scope._styleCache = new Polymer.StyleCache();
        }
        var scopeData = propertyUtils
          .propertyDataFromStyles(scope._styles, this);
        // look in scope cache
        scopeData.key.customStyle = this.customStyle;
        info = scope._styleCache.retrieve(this.is, scopeData.key, this._styles);
        // compute style properties (fast path, if cache hit)
        var scopeCached = Boolean(info);
        if (scopeCached) {
          // when scope cached, we can safely take style propertis out of the
          // scope cache because they are only for this scope.
          this._styleProperties = info._styleProperties;
        } else {
          this._computeStyleProperties(scopeData.properties);
        }
        this._computeOwnStyleProperties();
        // cache miss, do work!
        if (!scopeCached) {
          // and look in 2ndary global cache
          info = styleCache.retrieve(this.is,
            this._ownStyleProperties, this._styles);
        }
        var globalCached = Boolean(info) && !scopeCached;
        // now we have properties and a cached style if one
        // is available.
        var style = this._applyStyleProperties(info);
        // no cache so store in cache
        //console.warn(this.is, scopeCached, globalCached, info && info._scopeSelector);
        if (!scopeCached) {
          // create an info object for caching
          // TODO(sorvell): clone style node when using native Shadow DOM
          // so a style used in a root does not itself get stored in the cache
          // This can lead to incorrect sharing, but should be fixed
          // in `Polymer.StyleProperties.applyElementStyle`
          style = style && nativeShadow ? style.cloneNode(true) : style;
          info = {
            style: style,
            _scopeSelector: this._scopeSelector,
            _styleProperties: this._styleProperties
          };
          scopeData.key.customStyle = {};
          this.mixin(scopeData.key.customStyle, this.customStyle);
          scope._styleCache.store(this.is, info, scopeData.key, this._styles);
          if (!globalCached) {
            // save in global cache
            styleCache.store(this.is, Object.create(info), this._ownStyleProperties,
            this._styles);
          }
        }
      },

      _computeStyleProperties: function(scopeProps) {
        // get scope and make sure it has properties
        var scope = this._findStyleHost();
        // force scope to compute properties if they don't exist or if forcing
        // and it doesn't need properties
        if (!scope._styleProperties) {
          scope._computeStyleProperties();
        }
        // start with scope style properties
        var props = Object.create(scope._styleProperties);
        // mixin own host properties (lower specifity than scope props)
        this.mixin(props, propertyUtils.hostPropertiesFromStyles(this._styles));
        // mixin properties matching this element in scope
        scopeProps = scopeProps ||
          propertyUtils.propertyDataFromStyles(scope._styles, this).properties;
        this.mixin(props, scopeProps);
        // finally mixin properties inherent to this element
        this.mixin(props,
          propertyUtils.scopePropertiesFromStyles(this._styles));
        propertyUtils.mixinCustomStyle(props, this.customStyle);
        // reify properties (note: only does own properties)
        propertyUtils.reify(props);
        this._styleProperties = props;
      },

      _computeOwnStyleProperties: function() {
        var props = {};
        for (var i=0, n; i < this._ownStylePropertyNames.length; i++) {
          n = this._ownStylePropertyNames[i];
          props[n] = this._styleProperties[n];
        }
        this._ownStyleProperties = props;
      },

      _scopeCount: 0,

      _applyStyleProperties: function(info) {
        // update scope selector (needed for style transformation)
        var oldScopeSelector = this._scopeSelector;
        // note, the scope selector is incremented per class counter
        this._scopeSelector = info ? info._scopeSelector :
          this.is + '-' + this.__proto__._scopeCount++;
        var style = propertyUtils.applyElementStyle(this,
          this._styleProperties, this._scopeSelector, info && info.style);
        // apply scope selector
        if (!nativeShadow) {
          propertyUtils.applyElementScopeSelector(this, this._scopeSelector,
            oldScopeSelector, this._scopeCssViaAttr);
        }
        return style;
      },

      serializeValueToAttribute: function(value, attribute, node) {
        // override to ensure whenever classes are set, we need to shim them.
        node = node || this;
        if (attribute === 'class' && !nativeShadow) {
          // host needed to scope styling.
          // Under Shady DOM, domHost is safe to use here because we know it
          // is a Polymer element
          var host = node === this ? (this.domHost || this.dataHost) : this;
          if (host) {
            value = host._scopeElementClass(node, value);
          }
        }
        // note: using Polymer.dom here ensures that any attribute sets
        // will provoke distribution if necessary; do this iff necessary
        node = (this.shadyRoot && this.shadyRoot._hasDistributed) ?
          Polymer.dom(node) : node;
        serializeValueToAttribute.call(this, value, attribute, node);
      },

      _scopeElementClass: function(element, selector) {
        if (!nativeShadow && !this._scopeCssViaAttr) {
          selector += (selector ? ' ' : '') + SCOPE_NAME + ' ' + this.is +
            (element._scopeSelector ? ' ' +  XSCOPE_NAME + ' ' +
            element._scopeSelector : '');
        }
        return selector;
      },

      /**
       * Re-evaluates and applies custom CSS properties based on dynamic
       * changes to this element's scope, such as adding or removing classes
       * in this element's local DOM.
       *
       * For performance reasons, Polymer's custom CSS property shim relies
       * on this explicit signal from the user to indicate when changes have
       * been made that affect the values of custom properties.
       *
       * @method updateStyles
       * @param {Object=} properties Properties object which is mixed into
       * the element's `customStyle` property. This argument provides a shortcut
       * for setting `customStyle` and then calling `updateStyles`.
      */
      updateStyles: function(properties) {
        if (this.isAttached) {
          if (properties) {
            this.mixin(this.customStyle, properties);
          }
          // skip applying properties to self if not used
          if (this._needsStyleProperties()) {
            this._updateStyleProperties();
          // when an element doesn't use style properties, its own properties
          // should be invalidated so elements down the tree update ok.
          } else {
            this._styleProperties = null;
          }
          if (this._styleCache) {
            this._styleCache.clear();
          }
          // always apply properties to root
          this._updateRootStyles();
        }
      },

      _updateRootStyles: function(root) {
        root = root || this.root;
        var c$ = Polymer.dom(root)._query(function(e) {
          return e.shadyRoot || e.shadowRoot;
        });
        for (var i=0, l= c$.length, c; (i<l) && (c=c$[i]); i++) {
          if (c.updateStyles) {
            c.updateStyles();
          }
        }
      }

    });

    /**
     * Force all custom elements using cross scope custom properties,
     * to update styling.
     */
    Polymer.updateStyles = function(properties) {
      // update default/custom styles
      styleDefaults.updateStyles(properties);
      // search the document for elements to update
      Polymer.Base._updateRootStyles(document);
    };

    var styleCache = new Polymer.StyleCache();
    Polymer.customStyleCache = styleCache;

    var SCOPE_NAME = styleTransformer.SCOPE_NAME;
    var XSCOPE_NAME = propertyUtils.XSCOPE_NAME;

  })();
Polymer.Base._addFeature({

    _registerFeatures: function() {
      // identity
      this._prepIs();
      // factory
      this._prepConstructor();
      // template
      this._prepTemplate();
      // styles
      this._prepStyles();
      // style properties
      this._prepStyleProperties();
      // template markup
      this._prepAnnotations();
      // accessors
      this._prepEffects();
      // shared behaviors
      this._prepBehaviors();
      // fast access to property info
      this._prepPropertyInfo();
      // accessors part 2
      this._prepBindings();
      // dom encapsulation
      this._prepShady();
    },

    _prepBehavior: function(b) {
      this._addPropertyEffects(b.properties);
      this._addComplexObserverEffects(b.observers);
      this._addHostAttributes(b.hostAttributes);
    },

    _initFeatures: function() {
      // setup gestures
      this._setupGestures();
      // manage configuration
      this._setupConfigure();
      // setup style properties
      this._setupStyleProperties();
      // setup debouncers
      this._setupDebouncers();
      // setup shady
      this._setupShady();
      this._registerHost();
      if (this._template) {
        // manage local dom
        this._poolContent();
        // host stack
        this._beginHosting();
        // instantiate template
        this._stampTemplate();
        // host stack
        this._endHosting();
        // concretize template references
        this._marshalAnnotationReferences();
      }
      // concretize effects on instance
      this._marshalInstanceEffects();
      // acquire instance behaviors
      this._marshalBehaviors();
      /*
      TODO(sorvell): It's *slightly() more efficient to marshal attributes prior 
      to installing hostAttributes, but then hostAttributes must be separately
      funneled to configure, which is cumbersome.
      Since this delta seems hard to measure we will not bother atm.
      */
      // install host attributes
      this._marshalHostAttributes();
      // acquire initial instance attribute values
      this._marshalAttributes();
      // top-down initial distribution, configuration, & ready callback
      this._tryReady();
    },

    _marshalBehavior: function(b) {
      // establish listeners on instance
      if (b.listeners) {
        this._listenListeners(b.listeners);
      }
    }

  });
(function() {

  var nativeShadow = Polymer.Settings.useNativeShadow;
  var propertyUtils = Polymer.StyleProperties;
  var styleUtil = Polymer.StyleUtil;
  var cssParse = Polymer.CssParse;
  var styleDefaults = Polymer.StyleDefaults;
  var styleTransformer = Polymer.StyleTransformer;

  Polymer({

    is: 'custom-style',
    extends: 'style',
    _template: null,

    properties: {
      // include is a property so that it deserializes
      /**
       * Specify `include` to identify a `dom-module` containing style data which
       * should be used within the `custom-style`. By using `include` style data
       * may be shared between multiple different `custom-style` elements.
       */
      include: String
    },

    ready: function() {
      // NOTE: we cannot just check attached because custom elements in
      // HTMLImports do not get attached.
      this._tryApply();
    },

    attached: function() {
      this._tryApply();
    },

    _tryApply: function() {
      if (!this._appliesToDocument) {
        // only apply variables iff this style is not inside a dom-module
        if (this.parentNode &&
          (this.parentNode.localName !== 'dom-module')) {
          this._appliesToDocument = true;
          // used applied element from HTMLImports polyfill or this
          var e = this.__appliedElement || this;
          styleDefaults.addStyle(e);
          // we may not have any textContent yet due to parser yielding
          // if so, wait until we do...
          if (e.textContent || this.include) {
            this._apply(true);
          } else {
            var self = this;
            var observer = new MutationObserver(function() {
              observer.disconnect();
              self._apply(true);
            });
            observer.observe(e, {childList: true});
          }
        }
      }
    },

    // polyfill this style with root scoping and
    // apply custom properties!
    _apply: function(deferProperties) {
      // used applied element from HTMLImports polyfill or this
      var e = this.__appliedElement || this;
      if (this.include) {
        e.textContent = styleUtil.cssFromModules(this.include, true) +
          e.textContent;
      }
      if (e.textContent) {
        styleUtil.forEachStyleRule(styleUtil.rulesForStyle(e), function(rule) {
          styleTransformer.documentRule(rule);
        });
        // Allow all custom-styles defined in this turn to register
        // before applying any properties. This helps ensure that all properties
        // are defined before any are consumed.
        // Premature application of properties can occur in 2 cases:
        // (1) A property `--foo` is consumed in a custom-style
        // before another custom-style produces `--foo`.
        // In general, we require custom properties to be defined before being
        // used in elements so supporting this for custom-style
        // is dubious but is slightly more like native properties where this
        // is supported.
        // (2) A set of in order styles (A, B) are re-ordered due to a parser
        // yield that makes A wait for textContent. This reorders its
        // `_apply` after B.
        // This case should only occur with native webcomponents.
        var self = this;
        var fn = function fn() {
          self._applyCustomProperties(e);
        }
        if (this._pendingApplyProperties) {
          cancelAnimationFrame(this._pendingApplyProperties);
          this._pendingApplyProperties = null;
        }
        if (deferProperties) {
          this._pendingApplyProperties = requestAnimationFrame(fn);
        } else {
          fn();
        }
      }
    },

    _applyCustomProperties: function(element) {
      this._computeStyleProperties();
      var props = this._styleProperties;
      var rules = styleUtil.rulesForStyle(element);
      element.textContent = styleUtil.toCssText(rules, function(rule) {
        var css = rule.cssText = rule.parsedCssText;
        if (rule.propertyInfo && rule.propertyInfo.cssText) {
          // remove property assignments
          // so next function isn't confused
          // NOTE: we have 3 categories of css:
          // (1) normal properties,
          // (2) custom property assignments (--foo: red;),
          // (3) custom property usage: border: var(--foo); @apply(--foo);
          // In elements, 1 and 3 are separated for efficiency; here they
          // are not and this makes this case unique.
          css = cssParse.removeCustomPropAssignment(css);
          // replace with reified properties, scenario is same as mixin
          rule.cssText = propertyUtils.valueForProperties(css, props);
        }
      });
    }

  });

})();
/**
   * The `Polymer.Templatizer` behavior adds methods to generate instances of
   * templates that are each managed by an anonymous `Polymer.Base` instance.
   *
   * Example:
   *
   *     // Get a template from somewhere, e.g. light DOM
   *     var template = Polymer.dom(this).querySelector('template');
   *     // Prepare the template
   *     this.templatize(template);
   *     // Instance the template with an initial data model
   *     var instance = this.stamp({myProp: 'initial'});
   *     // Insert the instance's DOM somewhere, e.g. light DOM
   *     Polymer.dom(this).appendChild(instance.root);
   *     // Changing a property on the instance will propagate to bindings
   *     // in the template
   *     instance.myProp = 'new value';
   *
   * Users of `Templatizer` may need to implement the following abstract
   * API's to determine how properties and paths from the host should be
   * forwarded into to instances:
   *
   *     _forwardParentProp: function(prop, value)
   *     _forwardParentPath: function(path, value)
   *
   * Likewise, users may implement these additional abstract API's to determine
   * how instance-specific properties that change on the instance should be
   * forwarded out to the host, if necessary.
   *
   *     _forwardInstanceProp: function(inst, prop, value)
   *     _forwardInstancePath: function(inst, path, value)
   *
   * In order to determine which properties are instance-specific and require
   * custom forwarding via `_forwardInstanceProp`/`_forwardInstancePath`,
   * define an `_instanceProps` map containing keys for each instance prop,
   * for example:
   *
   *     _instanceProps: {
   *       item: true,
   *       index: true
   *     }
   *
   * Any properties used in the template that are not defined in _instanceProp
   * will be forwarded out to the host automatically.
   *
   * Users should also implement the following abstract function to show or
   * hide any DOM generated using `stamp`:
   *
   *     _showHideChildren: function(shouldHide)
   *
   * @polymerBehavior
   */
  Polymer.Templatizer = {

    properties: {
      __hideTemplateChildren__: {
        observer: '_showHideChildren'
      }
    },

    // Extension point for overrides
    _instanceProps: Polymer.nob,

    _parentPropPrefix: '_parent_',

    /**
     * Prepares a template containing Polymer bindings by generating
     * a constructor for an anonymous `Polymer.Base` subclass to serve as the
     * binding context for the provided template.
     *
     * Use `this.stamp` to create instances of the template context containing
     * a `root` fragment that may be stamped into the DOM.
     *
     * @method templatize
     * @param {HTMLTemplateElement} template The template to process.
     */
    templatize: function(template) {
      this._templatized = template;
      // TODO(sjmiles): supply _alternate_ content reference missing from root
      // templates (not nested). `_content` exists to provide content sharing
      // for nested templates.
      if (!template._content) {
        template._content = template.content;
      }
      // fast path if template's anonymous class has been memoized
      if (template._content._ctor) {
        this.ctor = template._content._ctor;
        //console.log('Templatizer.templatize: using memoized archetype');
        // forward parent properties to archetype
        this._prepParentProperties(this.ctor.prototype, template);
        return;
      }
      // `archetype` is the prototype of the anonymous
      // class created by the templatizer
      var archetype = Object.create(Polymer.Base);
      // normally Annotations.parseAnnotations(template) but
      // archetypes do special caching
      this._customPrepAnnotations(archetype, template);

      // forward parent properties to archetype
      this._prepParentProperties(archetype, template);

      // setup accessors
      archetype._prepEffects();
      this._customPrepEffects(archetype);
      archetype._prepBehaviors();
      archetype._prepPropertyInfo();
      archetype._prepBindings();

      // boilerplate code
      archetype._notifyPathUp = this._notifyPathUpImpl;
      archetype._scopeElementClass = this._scopeElementClassImpl;
      archetype.listen = this._listenImpl;
      archetype._showHideChildren = this._showHideChildrenImpl;
      archetype.__setPropertyOrig = this.__setProperty;
      archetype.__setProperty = this.__setPropertyImpl;
      // boilerplate code
      var _constructor = this._constructorImpl;
      var ctor = function TemplateInstance(model, host) {
        _constructor.call(this, model, host);
      };
      // standard references
      ctor.prototype = archetype;
      archetype.constructor = ctor;
      // TODO(sjmiles): constructor cache?
      template._content._ctor = ctor;
      // TODO(sjmiles): choose less general name
      this.ctor = ctor;
    },

    _getRootDataHost: function() {
      return (this.dataHost && this.dataHost._rootDataHost) || this.dataHost;
    },

    _showHideChildrenImpl: function(hide) {
      var c = this._children;
      for (var i=0; i<c.length; i++) {
        var n = c[i];
        // Ignore non-changes
        if (Boolean(hide) != Boolean(n.__hideTemplateChildren__)) {
          if (n.nodeType === Node.TEXT_NODE) {
            if (hide) {
              n.__polymerTextContent__ = n.textContent;
              n.textContent = '';
            } else {
              n.textContent = n.__polymerTextContent__;
            }
          } else if (n.style) {
            if (hide) {
              n.__polymerDisplay__ = n.style.display;
              n.style.display = 'none';
            } else {
              n.style.display = n.__polymerDisplay__;
            }
          }
        }
        n.__hideTemplateChildren__ = hide;
      }
    },

    __setPropertyImpl: function(property, value, fromAbove, node) {
      if (node && node.__hideTemplateChildren__ && property == 'textContent') {
        property = '__polymerTextContent__';
      }
      this.__setPropertyOrig(property, value, fromAbove, node);
    },

    _debounceTemplate: function(fn) {
      Polymer.dom.addDebouncer(this.debounce('_debounceTemplate', fn));
    },

    _flushTemplates: function(debouncerExpired) {
      Polymer.dom.flush();
    },

    _customPrepEffects: function(archetype) {
      var parentProps = archetype._parentProps;
      for (var prop in parentProps) {
        archetype._addPropertyEffect(prop, 'function',
          this._createHostPropEffector(prop));
      }
      for (var prop in this._instanceProps) {
        archetype._addPropertyEffect(prop, 'function',
          this._createInstancePropEffector(prop));
      }
    },

    _customPrepAnnotations: function(archetype, template) {
      archetype._template = template;
      var c = template._content;
      if (!c._notes) {
        var rootDataHost = archetype._rootDataHost;
        if (rootDataHost) {
          Polymer.Annotations.prepElement = function() {
            rootDataHost._prepElement();
          }
        }
        c._notes = Polymer.Annotations.parseAnnotations(template);
        Polymer.Annotations.prepElement = null;
        this._processAnnotations(c._notes);
      }
      archetype._notes = c._notes;
      archetype._parentProps = c._parentProps;
    },

    // Sets up accessors on the template to call abstract _forwardParentProp
    // API that should be implemented by Templatizer users to get parent
    // properties to their template instances.  These accessors are memoized
    // on the archetype and copied to instances.
    _prepParentProperties: function(archetype, template) {
      var parentProps = this._parentProps = archetype._parentProps;
      if (this._forwardParentProp && parentProps) {
        // Prototype setup (memoized on archetype)
        var proto = archetype._parentPropProto;
        var prop;
        if (!proto) {
          for (prop in this._instanceProps) {
            delete parentProps[prop];
          }
          proto = archetype._parentPropProto = Object.create(null);
          if (template != this) {
            // Assumption: if `this` isn't the template being templatized,
            // assume that the template is not a Poylmer.Base, so prep it
            // for binding
            Polymer.Bind.prepareModel(proto);
            Polymer.Base.prepareModelNotifyPath(proto);
          }
          // Create accessors for each parent prop that forward the property
          // to template instances through abstract _forwardParentProp API
          // that should be implemented by Templatizer users
          for (prop in parentProps) {
            var parentProp = this._parentPropPrefix + prop;
            // TODO(sorvell): remove reference Bind library functions here.
            // Needed for effect optimization.
            var effects = [{
              kind: 'function',
              effect: this._createForwardPropEffector(prop),
              fn: Polymer.Bind._functionEffect
            }, {
              kind: 'notify',
              fn: Polymer.Bind._notifyEffect,
              effect: {event:
                Polymer.CaseMap.camelToDashCase(parentProp) + '-changed'}
            }];
            Polymer.Bind._createAccessors(proto, parentProp, effects);
          }
        }
        // capture this reference for use below
        var self = this;
        // Instance setup
        if (template != this) {
          Polymer.Bind.prepareInstance(template);
          template._forwardParentProp = function(source, value) {
            self._forwardParentProp(source, value);
          }
        }
        this._extendTemplate(template, proto);
        template._pathEffector = function(path, value, fromAbove) {
          return self._pathEffectorImpl(path, value, fromAbove);
        }
      }
    },

    _createForwardPropEffector: function(prop) {
      return function(source, value) {
        this._forwardParentProp(prop, value);
      };
    },

    _createHostPropEffector: function(prop) {
      var prefix = this._parentPropPrefix;
      return function(source, value) {
        this.dataHost._templatized[prefix + prop] = value;
      };
    },

    _createInstancePropEffector: function(prop) {
      return function(source, value, old, fromAbove) {
        if (!fromAbove) {
          this.dataHost._forwardInstanceProp(this, prop, value);
        }
      };
    },

    // Similar to Polymer.Base.extend, but retains any previously set instance
    // values (_propertySetter back on instance once accessor is installed)
    _extendTemplate: function(template, proto) {
      var n$ = Object.getOwnPropertyNames(proto);
      for (var i=0, n; (i<n$.length) && (n=n$[i]); i++) {
        var val = template[n];
        var pd = Object.getOwnPropertyDescriptor(proto, n);
        Object.defineProperty(template, n, pd);
        if (val !== undefined) {
          template._propertySetter(n, val);
        }
      }
    },

    // Extension points for Templatizer sub-classes
    _showHideChildren: function(hidden) { },
    _forwardInstancePath: function(inst, path, value) { },
    _forwardInstanceProp: function(inst, prop, value) { },
    // Defined-check rather than thunk used to avoid unnecessary work for these:
    // _forwardParentPath: function(path, value) { },
    // _forwardParentProp: function(prop, value) { },

    _notifyPathUpImpl: function(path, value) {
      var dataHost = this.dataHost;
      var dot = path.indexOf('.');
      var root = dot < 0 ? path : path.slice(0, dot);
      // Call extension point for Templatizer sub-classes
      dataHost._forwardInstancePath.call(dataHost, this, path, value);
      if (root in dataHost._parentProps) {
        dataHost._templatized.notifyPath(dataHost._parentPropPrefix + path, value);
      }
    },

    // Overrides Base notify-path module
    _pathEffectorImpl: function(path, value, fromAbove) {
      if (this._forwardParentPath) {
        if (path.indexOf(this._parentPropPrefix) === 0) {
          var subPath = path.substring(this._parentPropPrefix.length);
          var model = this._modelForPath(subPath);
          if (model in this._parentProps) {
            this._forwardParentPath(subPath, value);
          }
        }
      }
      Polymer.Base._pathEffector.call(this._templatized, path, value, fromAbove);
    },

    _constructorImpl: function(model, host) {
      this._rootDataHost = host._getRootDataHost();
      this._setupConfigure(model);
      this._registerHost(host);
      this._beginHosting();
      this.root = this.instanceTemplate(this._template);
      this.root.__noContent = !this._notes._hasContent;
      this.root.__styleScoped = true;
      this._endHosting();
      this._marshalAnnotatedNodes();
      this._marshalInstanceEffects();
      this._marshalAnnotatedListeners();
      // each row is a document fragment which is lost when we appendChild,
      // so we have to track each child individually
      var children = [];
      for (var n = this.root.firstChild; n; n=n.nextSibling) {
        children.push(n);
        n._templateInstance = this;
      }
      // Since archetype overrides Base/HTMLElement, Safari complains
      // when accessing `children`
      this._children = children;
      // Ensure newly stamped nodes reflect host's hidden state
      if (host.__hideTemplateChildren__) {
        this._showHideChildren(true);
      }
      // ready self and children
      this._tryReady();
    },

    // Decorate events with model (template instance)
    _listenImpl: function(node, eventName, methodName) {
      var model = this;
      var host = this._rootDataHost;
      var handler = host._createEventHandler(node, eventName, methodName);
      var decorated = function(e) {
        e.model = model;
        handler(e);
      };
      host._listen(node, eventName, decorated);
    },

    _scopeElementClassImpl: function(node, value) {
      var host = this._rootDataHost;
      if (host) {
        return host._scopeElementClass(node, value);
      }
    },

    /**
     * Creates an instance of the template previously processed via
     * a call to `templatize`.
     *
     * The object returned is an anonymous subclass of Polymer.Base that
     * has accessors generated to manage data in the template.  The DOM for
     * the instance is contained in a DocumentFragment called `root` on
     * the instance returned and must be manually inserted into the DOM
     * by the user.
     *
     * Note that a call to `templatize` must be called once before using
     * `stamp`.
     *
     * @method stamp
     * @param {Object=} model An object containing key/values to serve as the
     *   initial data configuration for the instance.  Note that properties
     *   from the host used in the template are automatically copied into
     *   the model.
     * @return {Polymer.Base} The Polymer.Base instance to manage the template
     *   instance.
     */
    stamp: function(model) {
      model = model || {};
      if (this._parentProps) {
        var templatized = this._templatized;
        for (var prop in this._parentProps) {
          model[prop] = templatized[this._parentPropPrefix + prop];
        }
      }
      return new this.ctor(model, this);
    },

    /**
     * Returns the template "model" associated with a given element, which
     * serves as the binding scope for the template instance the element is
     * contained in. A template model is an instance of `Polymer.Base`, and
     * should be used to manipulate data associated with this template instance.
     *
     * Example:
     *
     *   var model = modelForElement(el);
     *   if (model.index < 10) {
     *     model.set('item.checked', true);
     *   }
     *
     * @method modelForElement
     * @param {HTMLElement} el Element for which to return a template model.
     * @return {Object<Polymer.Base>} Model representing the binding scope for
     *   the element.
     */
    modelForElement: function(el) {
      var model;
      while (el) {
        // An element with a _templateInstance marks the top boundary
        // of a scope; walk up until we find one, and then ensure that
        // its dataHost matches `this`, meaning this dom-repeat stamped it
        if (model = el._templateInstance) {
          // Found an element stamped by another template; keep walking up
          // from its dataHost
          if (model.dataHost != this) {
            el = model.dataHost;
          } else {
            return model;
          }
        } else {
          // Still in a template scope, keep going up until
          // a _templateInstance is found
          el = el.parentNode;
        }
      }
    }

  };
/**
   * Creates a pseudo-custom-element that maps property values to bindings
   * in DOM.
   * 
   * `stamp` method creates an instance of the pseudo-element. The instance
   * references a document-fragment containing the stamped and bound dom
   * via it's `root` property. 
   *  
   */
  Polymer({

    is: 'dom-template',
    extends: 'template',
    _template: null,

    behaviors: [
      Polymer.Templatizer
    ],

    ready: function() {
      this.templatize(this);
    }

  });
Polymer._collections = new WeakMap();

  Polymer.Collection = function(userArray) {
    Polymer._collections.set(userArray, this);
    this.userArray = userArray;
    this.store = userArray.slice();
    this.initMap();
  };

  Polymer.Collection.prototype = {

    constructor: Polymer.Collection,

    initMap: function() {
      var omap = this.omap = new WeakMap();
      var pmap = this.pmap = {};
      var s = this.store;
      for (var i=0; i<s.length; i++) {
        var item = s[i];
        if (item && typeof item == 'object') {
          omap.set(item, i);
        } else {
          pmap[item] = i;
        }
      }
    },

    add: function(item) {
      var key = this.store.push(item) - 1;
      if (item && typeof item == 'object') {
        this.omap.set(item, key);
      } else {
        this.pmap[item] = key;
      }
      return '#' + key;
    },

    removeKey: function(key) {
      if (key = this._parseKey(key)) {
        this._removeFromMap(this.store[key]);
        delete this.store[key];
      }
    },

    _removeFromMap: function(item) {
      if (item && typeof item == 'object') {
        this.omap.delete(item);
      } else {
        delete this.pmap[item];
      }
    },

    remove: function(item) {
      var key = this.getKey(item);
      this.removeKey(key);
      return key;
    },

    getKey: function(item) {
      var key;
      if (item && typeof item == 'object') {
        key = this.omap.get(item);
      } else {
        key = this.pmap[item];
      }
      if (key != undefined) {
        return '#' + key;
      }
    },

    getKeys: function() {
      return Object.keys(this.store).map(function(key) {
        return '#' + key;
      });
    },

    _parseKey: function(key) {
      if (key && key[0] == '#') {
        return key.slice(1);
      }
    },

    setItem: function(key, item) {
      if (key = this._parseKey(key)) {
        var old = this.store[key];
        if (old) {
          this._removeFromMap(old);
        }
        if (item && typeof item == 'object') {
          this.omap.set(item, key);
        } else {
          this.pmap[item] = key;
        }
        this.store[key] = item;
      }
    },

    getItem: function(key) {
      if (key = this._parseKey(key)) {
        return this.store[key];
      }
    },

    getItems: function() {
      var items = [], store = this.store;
      for (var key in store) {
        items.push(store[key]);
      }
      return items;
    },

    // Accepts an array of standard splice records (index, addedCount, removed
    // array), and performs two key actions:
    // 1. Applies the splice to the collection: adds newly added items to the
    //    store which generates a unique key for it, and removes removed items
    //    (and their key) from the store
    // 2. Generates a "keySplices" record (in contrast to the input
    //    "indexSplices"), which contains an array of added and removed keys
    //    corresponding to the added/removed items
    _applySplices: function(splices) {
      // Dedupe added and removed keys to a final added/removed map
      var keyMap = {}, key;
      for (var i=0, s; (i<splices.length) && (s=splices[i]); i++) {
        s.addedKeys = [];
        for (var j=0; j<s.removed.length; j++) {
          key = this.getKey(s.removed[j]);
          keyMap[key] = keyMap[key] ? null : -1;
        }
        for (var j=0; j<s.addedCount; j++) {
          var item = this.userArray[s.index + j];
          key = this.getKey(item);
          key = (key === undefined) ? this.add(item) : key;
          keyMap[key] = keyMap[key] ? null : 1;
          // Add an "addedKeys" array to indexSplices to capture keys associated
          // with added items, since references to added items can be lost by
          // further changes to the array by the time the splice is consumed
          s.addedKeys.push(key);
        }
      }
      // Convert added/removed key map to added/removed arrays
      var removed = [];
      var added = [];
      for (var key in keyMap) {
        if (keyMap[key] < 0) {
          this.removeKey(key);
          removed.push(key);
        }
        if (keyMap[key] > 0) {
          added.push(key);
        }
      }
      return [{
        removed: removed,
        added: added
      }];
    }

  };

  Polymer.Collection.get = function(userArray) {
    return Polymer._collections.get(userArray) ||
      new Polymer.Collection(userArray);
  };

  Polymer.Collection.applySplices = function(userArray, splices) {
    // Only apply splices & generate keySplices if the array already has a
    // backing Collection, meaning there is an element monitoring its keys;
    // Splices that happen before the collection has been created must be
    // discarded to avoid double-entries
    var coll = Polymer._collections.get(userArray);
    return coll ? coll._applySplices(splices) : null;
  };
Polymer({

    is: 'dom-repeat',
    extends: 'template',
    _template: null,

    /**
     * Fired whenever DOM is added or removed by this template (by
     * default, rendering occurs lazily).  To force immediate rendering, call
     * `render`.
     *
     * @event dom-change
     */

    properties: {

      /**
       * An array containing items determining how many instances of the template
       * to stamp and that that each template instance should bind to.
       */
      items: {
        type: Array
      },

      /**
       * The name of the variable to add to the binding scope for the array
       * element associated with a given template instance.
       */
      as: {
        type: String,
        value: 'item'
      },

      /**
       * The name of the variable to add to the binding scope with the index
       * for the inst.  If `sort` is provided, the index will reflect the
       * sorted order (rather than the original array order).
       */
      indexAs: {
        type: String,
        value: 'index'
      },

      /**
       * A function that should determine the sort order of the items.  This
       * property should either be provided as a string, indicating a method
       * name on the element's host, or else be an actual function.  The
       * function should match the sort function passed to `Array.sort`.
       * Using a sort function has no effect on the underlying `items` array.
       */
      sort: {
        type: Function,
        observer: '_sortChanged'
      },

      /**
       * A function that can be used to filter items out of the view.  This
       * property should either be provided as a string, indicating a method
       * name on the element's host, or else be an actual function.  The
       * function should match the sort function passed to `Array.filter`.
       * Using a filter function has no effect on the underlying `items` array.
       */
      filter: {
        type: Function,
        observer: '_filterChanged'
      },

      /**
       * When using a `filter` or `sort` function, the `observe` property
       * should be set to a space-separated list of the names of item
       * sub-fields that should trigger a re-sort or re-filter when changed.
       * These should generally be fields of `item` that the sort or filter
       * function depends on.
       */
      observe: {
        type: String,
        observer: '_observeChanged'
      },

      /**
       * When using a `filter` or `sort` function, the `delay` property
       * determines a debounce time after a change to observed item
       * properties that must pass before the filter or sort is re-run.
       * This is useful in rate-limiting shuffing of the view when
       * item changes may be frequent.
       */
      delay: Number,

      /**
       * Count of currently rendered items after `filter` (if any) has been applied.
       * If "chunking mode" is enabled, `renderedItemCount` is updated each time a 
       * set of template instances is rendered.
       * 
       */
      renderedItemCount: {
        type: Number,
        notify: true,
        readOnly: true
      },

      /**
       * Defines an initial count of template instances to render after setting
       * the `items` array, before the next paint, and puts the `dom-repeat`
       * into "chunking mode".  The remaining items will be created and rendered
       * incrementally at each animation frame therof until all instances have
       * been rendered.
       */
      initialCount: {
        type: Number,
        observer: '_initializeChunking'
      },

      /**
       * When `initialCount` is used, this property defines a frame rate to
       * target by throttling the number of instances rendered each frame to
       * not exceed the budget for the target frame rate.  Setting this to a
       * higher number will allow lower latency and higher throughput for
       * things like event handlers, but will result in a longer time for the
       * remaining items to complete rendering.
       */
      targetFramerate: {
        type: Number,
        value: 20
      },

      _targetFrameTime: {
        type: Number,
        computed: '_computeFrameTime(targetFramerate)'
      }

    },

    behaviors: [
      Polymer.Templatizer
    ],

    observers: [
      '_itemsChanged(items.*)'
    ],

    created: function() {
      this._instances = [];
      this._pool = [];
      this._limit = Infinity;
      var self = this;
      this._boundRenderChunk = function() {
        self._renderChunk();
      };
    },

    detached: function() {
      this.__isDetached = true;
      for (var i=0; i<this._instances.length; i++) {
        this._detachInstance(i);
      }
    },

    attached: function() {
      // only perform attachment if the element was previously detached.
      if (this.__isDetached) {
        this.__isDetached = false;
        var parent = Polymer.dom(Polymer.dom(this).parentNode);
        for (var i=0; i<this._instances.length; i++) {
          this._attachInstance(i, parent);
        }
      }
    },

    ready: function() {
      // Template instance props that should be excluded from forwarding
      this._instanceProps = {
        __key__: true
      };
      this._instanceProps[this.as] = true;
      this._instanceProps[this.indexAs] = true;
      // Templatizing (generating the instance constructor) needs to wait
      // until ready, since won't have its template content handed back to
      // it until then
      if (!this.ctor) {
        this.templatize(this);
      }
    },

    _sortChanged: function(sort) {
      var dataHost = this._getRootDataHost();
      this._sortFn = sort && (typeof sort == 'function' ? sort :
        function() { return dataHost[sort].apply(dataHost, arguments); });
      this._needFullRefresh = true;
      if (this.items) {
        this._debounceTemplate(this._render);
      }
    },

    _filterChanged: function(filter) {
      var dataHost = this._getRootDataHost();
      this._filterFn = filter && (typeof filter == 'function' ? filter :
        function() { return dataHost[filter].apply(dataHost, arguments); });
      this._needFullRefresh = true;
      if (this.items) {
        this._debounceTemplate(this._render);
      }
    },

    _computeFrameTime: function(rate) {
      return Math.ceil(1000/rate);
    },

    _initializeChunking: function() {
      if (this.initialCount) {
        this._limit = this.initialCount;
        this._chunkCount = this.initialCount;
        this._lastChunkTime = performance.now();
      }
    },

    _tryRenderChunk: function() {
      // Debounced so that multiple calls through `_render` between animation
      // frames only queue one new rAF (e.g. array mutation & chunked render)
      if (this.items && this._limit < this.items.length) {
        this.debounce('renderChunk', this._requestRenderChunk);
      }
    },

    _requestRenderChunk: function() {
      requestAnimationFrame(this._boundRenderChunk);
    },

    _renderChunk: function() {
      // Simple auto chunkSize throttling algorithm based on feedback loop:
      // measure actual time between frames and scale chunk count by ratio
      // of target/actual frame time
      var currChunkTime = performance.now();
      var ratio = this._targetFrameTime / (currChunkTime - this._lastChunkTime);
      this._chunkCount = Math.round(this._chunkCount * ratio) || 1;
      this._limit += this._chunkCount;
      this._lastChunkTime = currChunkTime;
      this._debounceTemplate(this._render);
    },

    _observeChanged: function() {
      this._observePaths = this.observe &&
        this.observe.replace('.*', '.').split(' ');
    },

    _itemsChanged: function(change) {
      if (change.path == 'items') {
        if (Array.isArray(this.items)) {
          this.collection = Polymer.Collection.get(this.items);
        } else if (!this.items) {
          this.collection = null;
        } else {
          this._error(this._logf('dom-repeat', 'expected array for `items`,' +
            ' found', this.items));
        }
        this._keySplices = [];
        this._indexSplices = [];
        this._needFullRefresh = true;
        this._initializeChunking();
        this._debounceTemplate(this._render);
      } else if (change.path == 'items.splices') {
        this._keySplices = this._keySplices.concat(change.value.keySplices);
        this._indexSplices = this._indexSplices.concat(change.value.indexSplices);
        this._debounceTemplate(this._render);
      } else { // items.*
        // slice off 'items.' ('items.'.length == 6)
        var subpath = change.path.slice(6);
        this._forwardItemPath(subpath, change.value);
        this._checkObservedPaths(subpath);
      }
    },

    _checkObservedPaths: function(path) {
      if (this._observePaths) {
        path = path.substring(path.indexOf('.') + 1);
        var paths = this._observePaths;
        for (var i=0; i<paths.length; i++) {
          if (path.indexOf(paths[i]) === 0) {
            // TODO(kschaaf): interim solution: ideally this is just an incremental
            // insertion sort of the changed item
            this._needFullRefresh = true;
            if (this.delay) {
              this.debounce('render', this._render, this.delay);
            } else {
              this._debounceTemplate(this._render);
            }
            return;
          }
        }
      }
    },

    /**
     * Forces the element to render its content. Normally rendering is
     * asynchronous to a provoking change. This is done for efficiency so
     * that multiple changes trigger only a single render. The render method
     * should be called if, for example, template rendering is required to
     * validate application state.
     */
    render: function() {
      // Queue this repeater, then flush all in order
      this._needFullRefresh = true;
      this._debounceTemplate(this._render);
      this._flushTemplates();
    },

    _render: function() {
      var c = this.collection;
      // Choose rendering path: full vs. incremental using splices
      if (this._needFullRefresh) {
        // Full refresh when items, sort, or filter change, or when render() called
        this._applyFullRefresh();
        this._needFullRefresh = false;
      } else if (this._keySplices.length) {
        // Incremental refresh when splices were queued
        if (this._sortFn) {
          this._applySplicesUserSort(this._keySplices);
        } else {
          if (this._filterFn) {
            // TODK(kschaaf): Filtering using array sort takes slow path
            this._applyFullRefresh();
          } else {
            this._applySplicesArrayOrder(this._indexSplices);
          }
        }
      } else {
        // Otherwise only limit changed; no change to instances, just need to
        // upgrade more placeholders to instances
      }
      this._keySplices = [];
      this._indexSplices = [];
      // Update final _keyToInstIdx and instance indices, and
      // upgrade/downgrade placeholders
      var keyToIdx = this._keyToInstIdx = {};
      for (var i=this._instances.length-1; i>=0; i--) {
        var inst = this._instances[i];
        if (inst.isPlaceholder && i<this._limit) {
          inst = this._insertInstance(i, inst.__key__);
        } else if (!inst.isPlaceholder && i>=this._limit) {
          inst = this._downgradeInstance(i, inst.__key__);
        }
        keyToIdx[inst.__key__] = i;
        if (!inst.isPlaceholder) {
          inst.__setProperty(this.indexAs, i, true);
        }
      }
      // Reset the pool
      // TODO(kschaaf): Reuse pool across turns and nested templates
      // Requires updating parentProps and dealing with the fact that path
      // notifications won't reach instances sitting in the pool, which
      // could result in out-of-sync instances since simply re-setting
      // `item` may not be sufficient if the pooled instance happens to be
      // the same item.
      this._pool.length = 0;
      // Set rendered item count 
      this._setRenderedItemCount(this._instances.length);
      // Notify users
      this.fire('dom-change');
      // Check to see if we need to render more items
      this._tryRenderChunk();
    },

    // Render method 1: full refesh
    // ----
    // Full list of keys is pulled from the collection, then sorted, filtered,
    // and iterated to create (or reuse) existing instances
    _applyFullRefresh: function() {
      var c = this.collection;
      // Start with unordered keys for user sort,
      // or get them in array order for array order
      var keys;
      if (this._sortFn) {
        keys = c ? c.getKeys() : [];
      } else {
        keys = [];
        var items = this.items;
        if (items) {
          for (var i=0; i<items.length; i++) {
            keys.push(c.getKey(items[i]));
          }
        }
      }
      // capture reference for use in filter/sort fn's
      var self = this;
      // Apply user filter to keys
      if (this._filterFn) {
        keys = keys.filter(function(a) {
          return self._filterFn(c.getItem(a));
        });
      }
      // Apply user sort to keys
      if (this._sortFn) {
        keys.sort(function(a, b) {
          return self._sortFn(c.getItem(a), c.getItem(b));
        });
      }
      // Generate instances and assign items and keys
      for (var i=0; i<keys.length; i++) {
        var key = keys[i];
        var inst = this._instances[i];
        if (inst) {
          inst.__key__ = key;
          if (!inst.isPlaceholder && i < this._limit) {
            inst.__setProperty(this.as, c.getItem(key), true);
          }
        } else if (i < this._limit) {
          this._insertInstance(i, key);
        } else {
          this._insertPlaceholder(i, key);
        }
      }
      // Remove any extra instances from previous state
      for (var j=this._instances.length-1; j>=i; j--) {
        this._detachAndRemoveInstance(j);
      }
    },

    _numericSort: function(a, b) {
      return a - b;
    },

    // Render method 2: incremental update using splices with user sort applied
    // ----
    // Removed/added keys are deduped, all removed rows are detached and pooled
    // first, and added rows are insertion-sorted into place using user sort
    _applySplicesUserSort: function(splices) {
      var c = this.collection;
      var instances = this._instances;
      var keyMap = {};
      // Dedupe added and removed keys to a final added/removed map
      for (var i=0, s; (i<splices.length) && (s=splices[i]); i++) {
        for (var j=0; j<s.removed.length; j++) {
          var key = s.removed[j];
          keyMap[key] = keyMap[key] ? null : -1;
        }
        for (var j=0; j<s.added.length; j++) {
          var key = s.added[j];
          keyMap[key] = keyMap[key] ? null : 1;
        }
      }
      // Convert added/removed key map to added/removed arrays
      var removedIdxs = [];
      var addedKeys = [];
      for (var key in keyMap) {
        if (keyMap[key] === -1) {
          removedIdxs.push(this._keyToInstIdx[key]);
        }
        if (keyMap[key] === 1) {
          addedKeys.push(key);
        }
      }
      // Remove & pool removed instances
      if (removedIdxs.length) {
        // Sort removed instances idx's then remove backwards,
        // so we don't invalidate instance index
        // use numeric sort, default .sort is alphabetic
        removedIdxs.sort(this._numericSort);
        for (var i=removedIdxs.length-1; i>=0 ; i--) {
          var idx = removedIdxs[i];
          // Removed idx may be undefined if item was previously filtered out
          if (idx !== undefined) {
            this._detachAndRemoveInstance(idx);
          }
        }
      }
      // capture reference for use in filter/sort fn's
      var self = this;
      // Add instances for added keys
      if (addedKeys.length) {
        // Filter added keys
        if (this._filterFn) {
          addedKeys = addedKeys.filter(function(a) {
            return self._filterFn(c.getItem(a));
          });
        }
        // Sort added keys
        addedKeys.sort(function(a, b) {
          return self._sortFn(c.getItem(a), c.getItem(b));
        });
        // Insertion-sort new instances into place (from pool or newly created)
        var start = 0;
        for (var i=0; i<addedKeys.length; i++) {
          start = this._insertRowUserSort(start, addedKeys[i]);
        }
      }
    },

    _insertRowUserSort: function(start, key) {
      var c = this.collection;
      var item = c.getItem(key);
      var end = this._instances.length - 1;
      var idx = -1;
      // Binary search for insertion point
      while (start <= end) {
        var mid = (start + end) >> 1;
        var midKey = this._instances[mid].__key__;
        var cmp = this._sortFn(c.getItem(midKey), item);
        if (cmp < 0) {
          start = mid + 1;
        } else if (cmp > 0) {
          end = mid - 1;
        } else {
          idx = mid;
          break;
        }
      }
      if (idx < 0) {
        idx = end + 1;
      }
      // Insert instance at insertion point
      this._insertPlaceholder(idx, key);
      return idx;
    },

    // Render method 3: incremental update using splices with array order
    // ----
    // Splices are processed in order; removed rows are pooled, and added
    // rows are as placeholders, and placeholders are updated to
    // actual rows at the end to take full advantage of removed rows
    _applySplicesArrayOrder: function(splices) {
      var c = this.collection;
      for (var i=0, s; (i<splices.length) && (s=splices[i]); i++) {
        // Detach & pool removed instances
        for (var j=0; j<s.removed.length; j++) {
          this._detachAndRemoveInstance(s.index);
        }
        for (var j=0; j<s.addedKeys.length; j++) {
          this._insertPlaceholder(s.index+j, s.addedKeys[j]);
        }
      }
    },

    _detachInstance: function(idx) {
      var inst = this._instances[idx];
      if (!inst.isPlaceholder) {
        for (var i=0; i<inst._children.length; i++) {
          var el = inst._children[i];
          Polymer.dom(inst.root).appendChild(el);
        }
        return inst;
      }
    },

    _attachInstance: function(idx, parent) {
      var inst = this._instances[idx];
      if (!inst.isPlaceholder) {
        parent.insertBefore(inst.root, this);
      }
    },

    _detachAndRemoveInstance: function(idx) {
      var inst = this._detachInstance(idx);
      if (inst) {
        this._pool.push(inst);
      }
      this._instances.splice(idx, 1);
    },

    _insertPlaceholder: function(idx, key) {
      this._instances.splice(idx, 0, {
        isPlaceholder: true,
        __key__: key
      });
    },

    _stampInstance: function(idx, key) {
      var model = {
        __key__: key
      };
      model[this.as] = this.collection.getItem(key);
      model[this.indexAs] = idx;
      return this.stamp(model);
    },

    _insertInstance: function(idx, key) {
      var inst = this._pool.pop();
      if (inst) {
        // TODO(kschaaf): If the pool is shared across turns, parentProps
        // need to be re-set to reused instances in addition to item/key
        inst.__setProperty(this.as, this.collection.getItem(key), true);
        inst.__setProperty('__key__', key, true);
      } else {
        inst = this._stampInstance(idx, key);
      }
      var beforeRow = this._instances[idx + 1];
      var beforeNode = beforeRow && !beforeRow.isPlaceholder ? beforeRow._children[0] : this;
      var parentNode = Polymer.dom(this).parentNode;
      Polymer.dom(parentNode).insertBefore(inst.root, beforeNode);
      this._instances[idx] = inst;
      return inst;
    },

    _downgradeInstance: function(idx, key) {
      var inst = this._detachInstance(idx);
      if (inst) {
        this._pool.push(inst);
      }
      inst = {
        isPlaceholder: true,
        __key__: key
      };
      this._instances[idx] = inst;
      return inst;
    },

    // Implements extension point from Templatizer mixin
    _showHideChildren: function(hidden) {
      for (var i=0; i<this._instances.length; i++) {
        this._instances[i]._showHideChildren(hidden);
      }
    },

    // Called as a side effect of a template item change, responsible
    // for notifying items.<key-for-inst> change up to host
    _forwardInstanceProp: function(inst, prop, value) {
      if (prop == this.as) {
        var idx;
        if (this._sortFn || this._filterFn) {
          // Known slow lookup: when sorted/filtered, there is no way to
          // efficiently memoize the array index and keep it in sync with array
          // mutations, so we need to look the item up in the array
          // This can happen e.g. when array of strings is repeated into inputs
          idx = this.items.indexOf(this.collection.getItem(inst.__key__));
        } else {
          // When there is no sort/filter, the view index is the array index
          idx = inst[this.indexAs];
        }
        this.set('items.' + idx, value);
      }
    },

    // Implements extension point from Templatizer
    // Called as a side effect of a template instance path change, responsible
    // for notifying items.<key-for-inst>.<path> change up to host
    _forwardInstancePath: function(inst, path, value) {
      if (path.indexOf(this.as + '.') === 0) {
        this._notifyPath('items.' + inst.__key__ + '.' +
          path.slice(this.as.length + 1), value);
      }
    },

    // Implements extension point from Templatizer mixin
    // Called as side-effect of a host property change, responsible for
    // notifying parent path change on each inst
    _forwardParentProp: function(prop, value) {
      var i$ = this._instances;
      for (var i=0, inst; (i<i$.length) && (inst=i$[i]); i++) {
        if (!inst.isPlaceholder) {
          inst.__setProperty(prop, value, true);
        }
      }
    },

    // Implements extension point from Templatizer
    // Called as side-effect of a host path change, responsible for
    // notifying parent path change on each inst
    _forwardParentPath: function(path, value) {
      var i$ = this._instances;
      for (var i=0, inst; (i<i$.length) && (inst=i$[i]); i++) {
        if (!inst.isPlaceholder) {
          inst._notifyPath(path, value, true);
        }
      }
    },

    // Called as a side effect of a host items.<key>.<path> path change,
    // responsible for notifying item.<path> changes to inst for key
    _forwardItemPath: function(path, value) {
      if (this._keyToInstIdx) {
        var dot = path.indexOf('.');
        var key = path.substring(0, dot < 0 ? path.length : dot);
        var idx = this._keyToInstIdx[key];
        var inst = this._instances[idx];
        if (inst && !inst.isPlaceholder) {
          if (dot >= 0) {
            path = this.as + '.' + path.substring(dot+1);
            inst._notifyPath(path, value, true);
          } else {
            inst.__setProperty(this.as, value, true);
          }
        }
      }
    },

    /**
     * Returns the item associated with a given element stamped by
     * this `dom-repeat`.
     *
     * Note, to modify sub-properties of the item,
     * `modelForElement(el).set('item.<sub-prop>', value)`
     * should be used.
     *
     * @method itemForElement
     * @param {HTMLElement} el Element for which to return the item.
     * @return {any} Item associated with the element.
     */
    itemForElement: function(el) {
      var instance = this.modelForElement(el);
      return instance && instance[this.as];
    },

    /**
     * Returns the `Polymer.Collection` key associated with a given
     * element stamped by this `dom-repeat`.
     *
     * @method keyForElement
     * @param {HTMLElement} el Element for which to return the key.
     * @return {any} Key associated with the element.
     */
    keyForElement: function(el) {
      var instance = this.modelForElement(el);
      return instance && instance.__key__;
    },

    /**
     * Returns the inst index for a given element stamped by this `dom-repeat`.
     * If `sort` is provided, the index will reflect the sorted order (rather
     * than the original array order).
     *
     * @method indexForElement
     * @param {HTMLElement} el Element for which to return the index.
     * @return {any} Row index associated with the element (note this may
     *   not correspond to the array index if a user `sort` is applied).
     */
    indexForElement: function(el) {
      var instance = this.modelForElement(el);
      return instance && instance[this.indexAs];
    }

  });
Polymer({
    is: 'array-selector',
    _template: null,

    properties: {

      /**
       * An array containing items from which selection will be made.
       */
      items: {
        type: Array,
        observer: 'clearSelection'
      },

      /**
       * When `true`, multiple items may be selected at once (in this case,
       * `selected` is an array of currently selected items).  When `false`,
       * only one item may be selected at a time.
       */
      multi: {
        type: Boolean,
        value: false,
        observer: 'clearSelection'
      },

      /**
       * When `multi` is true, this is an array that contains any selected.
       * When `multi` is false, this is the currently selected item, or `null`
       * if no item is selected.
       */
      selected: {
        type: Object,
        notify: true
      },

      /**
       * When `multi` is false, this is the currently selected item, or `null`
       * if no item is selected.
       */
      selectedItem: {
        type: Object,
        notify: true
      },

      /**
       * When `true`, calling `select` on an item that is already selected
       * will deselect the item.
       */
      toggle: {
        type: Boolean,
        value: false
      }
    },

    /**
     * Clears the selection state.
     *
     * @method clearSelection
     */
    clearSelection: function() {
      // Unbind previous selection
      if (Array.isArray(this.selected)) {
        for (var i=0; i<this.selected.length; i++) {
          this.unlinkPaths('selected.' + i);
        }
      } else {
        this.unlinkPaths('selected');
        this.unlinkPaths('selectedItem');
      }
      // Initialize selection
      if (this.multi) {
        if (!this.selected || this.selected.length) {
          this.selected = [];
          this._selectedColl = Polymer.Collection.get(this.selected);
        }
      } else {
        this.selected = null;
        this._selectedColl = null;
      }
      this.selectedItem = null;
    },

    /**
     * Returns whether the item is currently selected.
     *
     * @method isSelected
     * @param {*} item Item from `items` array to test
     * @return {boolean} Whether the item is selected
     */
    isSelected: function(item) {
      if (this.multi) {
        return this._selectedColl.getKey(item) !== undefined;
      } else {
        return this.selected == item;
      }
    },

    /**
     * Deselects the given item if it is already selected.
     *
     * @method isSelected
     * @param {*} item Item from `items` array to deselect
     */
    deselect: function(item) {
      if (this.multi) {
        if (this.isSelected(item)) {
          var skey = this._selectedColl.getKey(item);
          this.arrayDelete('selected', item);
          this.unlinkPaths('selected.' + skey);
        }
      } else {
        this.selected = null;
        this.selectedItem = null;
        this.unlinkPaths('selected');
        this.unlinkPaths('selectedItem');
      }
    },

    /**
     * Selects the given item.  When `toggle` is true, this will automatically
     * deselect the item if already selected.
     *
     * @method isSelected
     * @param {*} item Item from `items` array to select
     */
    select: function(item) {
      var icol = Polymer.Collection.get(this.items);
      var key = icol.getKey(item);
      if (this.multi) {
        if (this.isSelected(item)) {
          if (this.toggle) {
            this.deselect(item);
          }
        } else {
          this.push('selected', item);
          var skey = this._selectedColl.getKey(item);
          this.linkPaths('selected.' + skey, 'items.' + key);
        }
      } else {
        if (this.toggle && item == this.selected) {
          this.deselect();
        } else {
          this.selected = item;
          this.selectedItem = item;
          this.linkPaths('selected', 'items.' + key);
          this.linkPaths('selectedItem', 'items.' + key);
        }
      }
    }

  });
/**
   * Stamps the template iff the `if` property is truthy.
   *
   * When `if` becomes falsey, the stamped content is hidden but not
   * removed from dom. When `if` subsequently becomes truthy again, the content
   * is simply re-shown. This approach is used due to its favorable performance
   * characteristics: the expense of creating template content is paid only
   * once and lazily.
   *
   * Set the `restamp` property to true to force the stamped content to be
   * created / destroyed when the `if` condition changes.
   */
  Polymer({

    is: 'dom-if',
    extends: 'template',
    _template: null,

    /**
     * Fired whenever DOM is added or removed/hidden by this template (by
     * default, rendering occurs lazily).  To force immediate rendering, call
     * `render`.
     *
     * @event dom-change
     */

    properties: {

      /**
       * A boolean indicating whether this template should stamp.
       */
      'if': {
        type: Boolean,
        value: false,
        observer: '_queueRender'
      },

      /**
       * When true, elements will be removed from DOM and discarded when `if`
       * becomes false and re-created and added back to the DOM when `if`
       * becomes true.  By default, stamped elements will be hidden but left
       * in the DOM when `if` becomes false, which is generally results
       * in better performance.
       */
      restamp: {
        type: Boolean,
        value: false,
        observer: '_queueRender'
      }

    },

    behaviors: [
      Polymer.Templatizer
    ],

    _queueRender: function() {
      this._debounceTemplate(this._render);
    },

    detached: function() {
      if (!this.parentNode ||
          (this.parentNode.nodeType == Node.DOCUMENT_FRAGMENT_NODE &&
           (!Polymer.Settings.hasShadow ||
            !(this.parentNode instanceof ShadowRoot)))) {
        this._teardownInstance();
      }
    },

    attached: function() {
      if (this.if && this.ctor) {
        // NOTE: ideally should not be async, but node can be attached
        // when shady dom is in the act of distributing/composing so push it out
        this.async(this._ensureInstance);
      }
    },

    /**
     * Forces the element to render its content. Normally rendering is
     * asynchronous to a provoking change. This is done for efficiency so
     * that multiple changes trigger only a single render. The render method
     * should be called if, for example, template rendering is required to
     * validate application state.
     */
    render: function() {
      this._flushTemplates();
    },

    _render: function() {
      if (this.if) {
        if (!this.ctor) {
          this.templatize(this);
        }
        this._ensureInstance();
        this._showHideChildren();
      } else if (this.restamp) {
        this._teardownInstance();
      }
      if (!this.restamp && this._instance) {
        this._showHideChildren();
      }
      if (this.if != this._lastIf) {
        this.fire('dom-change');
        this._lastIf = this.if;
      }
    },

    _ensureInstance: function() {
      var parentNode = Polymer.dom(this).parentNode;
      // Guard against element being detached while render was queued
      if (parentNode) {
        var parent = Polymer.dom(parentNode);
        if (!this._instance) {
          this._instance = this.stamp();
          var root = this._instance.root;
          parent.insertBefore(root, this);
        } else {
          var c$ = this._instance._children;
          if (c$ && c$.length) {
            // Detect case where dom-if was re-attached in new position
            var lastChild = Polymer.dom(this).previousSibling;
            if (lastChild !== c$[c$.length-1]) {
              for (var i=0, n; (i<c$.length) && (n=c$[i]); i++) {
                parent.insertBefore(n, this);
              }
            }
          }
        }
      }
    },

    _teardownInstance: function() {
      if (this._instance) {
        var c$ = this._instance._children;
        if (c$ && c$.length) {
          // use first child parent, for case when dom-if may have been detached
          var parent = Polymer.dom(Polymer.dom(c$[0]).parentNode);
          for (var i=0, n; (i<c$.length) && (n=c$[i]); i++) {
            parent.removeChild(n);
          }
        }
        this._instance = null;
      }
    },

    _showHideChildren: function() {
      var hidden = this.__hideTemplateChildren__ || !this.if;
      if (this._instance) {
        this._instance._showHideChildren(hidden);
      }
    },

    // Implements extension point from Templatizer mixin
    // Called as side-effect of a host property change, responsible for
    // notifying parent.<prop> path change on instance
    _forwardParentProp: function(prop, value) {
      if (this._instance) {
        this._instance[prop] = value;
      }
    },

    // Implements extension point from Templatizer
    // Called as side-effect of a host path change, responsible for
    // notifying parent.<path> path change on each row
    _forwardParentPath: function(path, value) {
      if (this._instance) {
        this._instance._notifyPath(path, value, true);
      }
    }

  });
Polymer({

    /**
     * Fired whenever DOM is stamped by this template (rendering
     * will be deferred until all HTML imports have resolved).
     *
     * @event dom-change
     */

    is: 'dom-bind',

    extends: 'template',
    _template: null,

    created: function() {
      // Ensure dom-bind doesn't stamp until all possible dependencies
      // have resolved
      var self = this;
      Polymer.RenderStatus.whenReady(function() {
        self._markImportsReady();
      });
    },

    _ensureReady: function() {
      if (!this._readied) {
        this._readySelf();
      }
    },

    _markImportsReady: function() {
      this._importsReady = true;
      this._ensureReady();
    },

    _registerFeatures: function() {
      this._prepConstructor();
    },

    _insertChildren: function() {
      var parentDom = Polymer.dom(Polymer.dom(this).parentNode);
      parentDom.insertBefore(this.root, this);
    },

    _removeChildren: function() {
      if (this._children) {
        for (var i=0; i<this._children.length; i++) {
          this.root.appendChild(this._children[i]);
        }
      }
    },

    _initFeatures: function() {
      // defer _initFeatures and stamping until after attached, to support
      // document.createElement('template', 'dom-bind') use case,
      // where template content is filled in after creation
    },

    // avoid scoping elements as we expect dom-bind output to be in the main
    // document
    _scopeElementClass: function(element, selector) {
      if (this.dataHost) {
        return this.dataHost._scopeElementClass(element, selector);
      } else {
        return selector;
      }
    },

    _prepConfigure: function() {
      var config = {};
      for (var prop in this._propertyEffects) {
        config[prop] = this[prop];
      }
      // Pass values set before attached as initialConfig to _setupConfigure
      var setupConfigure = this._setupConfigure;
      this._setupConfigure = function() {
        setupConfigure.call(this, config);
      };
    },

    attached: function() {
      if (this._importsReady) {
        this.render();
      }
    },

    detached: function() {
      this._removeChildren();
    },

    /**
     * Forces the element to render its content. This is typically only
     * necessary to call if HTMLImports with the async attribute are used.
     */
    render: function() {
      this._ensureReady();
      if (!this._children) {
        this._template = this;
        this._prepAnnotations();
        this._prepEffects();
        this._prepBehaviors();
        this._prepConfigure();
        this._prepBindings();
        this._prepPropertyInfo();
        Polymer.Base._initFeatures.call(this);
        this._children = Polymer.TreeApi.arrayCopyChildNodes(this.root);
      }
      this._insertChildren();
      this.fire('dom-change');
    }

  });
//if ('serviceWorker' in navigator) {
//  navigator.serviceWorker.register('sw.js');
//}
/*!
 * money.js / fx() v0.2
 * Copyright 2014 Open Exchange Rates
 *
 * JavaScript library for realtime currency conversion and exchange rate calculation.
 *
 * Freely distributable under the MIT license.
 * Portions of money.js are inspired by or borrowed from underscore.js
 *
 * For details, examples and documentation:
 * http://openexchangerates.github.io/money.js/
 */
(function(root, undefined) {

	// Create a safe reference to the money.js object for use below.
	var fx = function(obj) {
		return new fxWrapper(obj);
	};

	// Current version.
	fx.version = '0.2';


	/* --- Setup --- */

	// fxSetup can be defined before loading money.js, to set the exchange rates and the base
	// (and default from/to) currencies - or the rates can be loaded in later if needed.
	var fxSetup = root.fxSetup || {
		rates : {},
		base : ""
	};

	// Object containing exchange rates relative to the fx.base currency, eg { "GBP" : "0.64" }
	fx.rates = fxSetup.rates;

	// Default exchange rate base currency (eg "USD"), which all the exchange rates are relative to
	fx.base = fxSetup.base;

	// Default from / to currencies for conversion via fx.convert():
	fx.settings = {
		from : fxSetup.from || fx.base,
		to : fxSetup.to || fx.base
	};


	/* --- Conversion --- */

	// The base function of the library: converts a value from one currency to another
	var convert = fx.convert = function(val, opts) {
		// Convert arrays recursively
		if (typeof val === 'object' && val.length) {
			for (var i = 0; i< val.length; i++ ) {
				val[i] = convert(val[i], opts);
			}
			return val;
		}

		// Make sure we gots some opts
		opts = opts || {};

		// We need to know the `from` and `to` currencies
		if( !opts.from ) opts.from = fx.settings.from;
		if( !opts.to ) opts.to = fx.settings.to;

		// Multiple the value by the exchange rate
		return val * getRate( opts.to, opts.from );
	};

	// Returns the exchange rate to `target` currency from `base` currency
	var getRate = function(to, from) {
		// Save bytes in minified version
		var rates = fx.rates;

		// Make sure the base rate is in the rates object:
		rates[fx.base] = 1;

		// Throw an error if either rate isn't in the rates array
		if ( !rates[to] || !rates[from] ) throw "fx error";

		// If `from` currency === fx.base, return the basic exchange rate for the `to` currency
		if ( from === fx.base ) {
			return rates[to];
		}

		// If `to` currency === fx.base, return the basic inverse rate of the `from` currency
		if ( to === fx.base ) {
			return 1 / rates[from];
		}

		// Otherwise, return the `to` rate multipled by the inverse of the `from` rate to get the
		// relative exchange rate between the two currencies
		return rates[to] * (1 / rates[from]);
	};


	/* --- OOP wrapper and chaining --- */

	// If fx(val) is called as a function, it returns a wrapped object that can be used OO-style
	var fxWrapper = function(val) {
		// Experimental: parse strings to pull out currency code and value:
		if ( typeof	val === "string" ) {
			this._v = parseFloat(val.replace(/[^0-9-.]/g, ""));
			this._fx = val.replace(/([^A-Za-z])/g, "");
		} else {
			this._v = val;
		}
	};

	// Expose `wrapper.prototype` as `fx.prototype`
	var fxProto = fx.prototype = fxWrapper.prototype;

	// fx(val).convert(opts) does the same thing as fx.convert(val, opts)
	fxProto.convert = function() {
		var args = Array.prototype.slice.call(arguments);
		args.unshift(this._v);
		return convert.apply(fx, args);
	};

	// fx(val).from(currency) returns a wrapped `fx` where the value has been converted from
	// `currency` to the `fx.base` currency. Should be followed by `.to(otherCurrency)`
	fxProto.from = function(currency) {
		var wrapped = fx(convert(this._v, {from: currency, to: fx.base}));
		wrapped._fx = fx.base;
		return wrapped;
	};

	// fx(val).to(currency) returns the value, converted from `fx.base` to `currency`
	fxProto.to = function(currency) {
		return convert(this._v, {from: this._fx ? this._fx : fx.settings.from, to: currency});
	};


	/* --- Module Definition --- */

	// Export the fx object for CommonJS. If being loaded as an AMD module, define it as such.
	// Otherwise, just add `fx` to the global object
	if (typeof exports !== 'undefined') {
		if (typeof module !== 'undefined' && module.exports) {
			exports = module.exports = fx;
		}
		exports.fx = fx;
	} else if (typeof define === 'function' && define.amd) {
		// Return the library as an AMD module:
		define([], function() {
			return fx;
		});
	} else {
		// Use fx.noConflict to restore `fx` back to its original value before money.js loaded.
		// Returns a reference to the library's `fx` object; e.g. `var money = fx.noConflict();`
		fx.noConflict = (function(previousFx) {
			return function() {
				// Reset the value of the root's `fx` variable:
				root.fx = previousFx;
				// Delete the noConflict function:
				fx.noConflict = undefined;
				// Return reference to the library to re-assign it:
				return fx;
			};
		})(root.fx);

		// Declare `fx` on the root (global/window) object:
		root['fx'] = fx;
	}

	// Root will be `window` in browser or `global` on the server:
}(this));
Polymer({
  is: 'money-rate',
  properties: {
    rate: {
      type: String,
      readOnly: true,
    },

    ts: {
      type: String,
      readOnly: true
    },

    need: {
      type: String,
    },

    have: {
      type: String,
    },

    observers: [
      '_getRate(need, have)'
    ]
  },

  ready: function() {
    this._setRate('???');
    this._getRate(this.from, this.to).then(e => console.log("Done setting rate.", this.rate));
  },

  _getRate: function(need, have) {
    var elem = this;
    return fetch('https://api.fixer.io/latest').then(function(response) {
      if (!response.ok) {
        return '???';
      }
      console.log("Date is: ", response.headers.get('X-API-Request-Date'));

      return response.json().then(function(data) {
        fx.rates = data.rates;
        elem._setTs(data.date);
        elem._updateRates();
      });
    });
  },

  _updateRates: function() {
    var price = fx.convert(100, { from: this.need, to: this.have })
    this._setRate(Math.round(price)/100+ "");
  }
});
Polymer({

    is: 'iron-media-query',

    properties: {

      /**
       * The Boolean return value of the media query.
       */
      queryMatches: {
        type: Boolean,
        value: false,
        readOnly: true,
        notify: true
      },

      /**
       * The CSS media query to evaluate.
       */
      query: {
        type: String,
        observer: 'queryChanged'
      },

      /**
       * If true, the query attribute is assumed to be a complete media query
       * string rather than a single media feature.
       */
      full: {
        type: Boolean,
        value: false
      },

      /**
       * @type {function(MediaQueryList)}
       */
      _boundMQHandler: {
        value: function() {
          return this.queryHandler.bind(this);
        }
      },

      /**
       * @type {MediaQueryList}
       */
      _mq: {
        value: null
      }
    },

    attached: function() {
      this.style.display = 'none';
      this.queryChanged();
    },

    detached: function() {
      this._remove();
    },

    _add: function() {
      if (this._mq) {
        this._mq.addListener(this._boundMQHandler);
      }
    },

    _remove: function() {
      if (this._mq) {
        this._mq.removeListener(this._boundMQHandler);
      }
      this._mq = null;
    },

    queryChanged: function() {
      this._remove();
      var query = this.query;
      if (!query) {
        return;
      }
      if (!this.full && query[0] !== '(') {
        query = '(' + query + ')';
      }
      this._mq = window.matchMedia(query);
      this._add();
      this.queryHandler(this._mq);
    },

    queryHandler: function(mq) {
      this._setQueryMatches(mq.matches);
    }

  });
/**
   * @param {!Function} selectCallback
   * @constructor
   */
  Polymer.IronSelection = function(selectCallback) {
    this.selection = [];
    this.selectCallback = selectCallback;
  };

  Polymer.IronSelection.prototype = {

    /**
     * Retrieves the selected item(s).
     *
     * @method get
     * @returns Returns the selected item(s). If the multi property is true,
     * `get` will return an array, otherwise it will return
     * the selected item or undefined if there is no selection.
     */
    get: function() {
      return this.multi ? this.selection.slice() : this.selection[0];
    },

    /**
     * Clears all the selection except the ones indicated.
     *
     * @method clear
     * @param {Array} excludes items to be excluded.
     */
    clear: function(excludes) {
      this.selection.slice().forEach(function(item) {
        if (!excludes || excludes.indexOf(item) < 0) {
          this.setItemSelected(item, false);
        }
      }, this);
    },

    /**
     * Indicates if a given item is selected.
     *
     * @method isSelected
     * @param {*} item The item whose selection state should be checked.
     * @returns Returns true if `item` is selected.
     */
    isSelected: function(item) {
      return this.selection.indexOf(item) >= 0;
    },

    /**
     * Sets the selection state for a given item to either selected or deselected.
     *
     * @method setItemSelected
     * @param {*} item The item to select.
     * @param {boolean} isSelected True for selected, false for deselected.
     */
    setItemSelected: function(item, isSelected) {
      if (item != null) {
        if (isSelected) {
          this.selection.push(item);
        } else {
          var i = this.selection.indexOf(item);
          if (i >= 0) {
            this.selection.splice(i, 1);
          }
        }
        if (this.selectCallback) {
          this.selectCallback(item, isSelected);
        }
      }
    },

    /**
     * Sets the selection state for a given item. If the `multi` property
     * is true, then the selected state of `item` will be toggled; otherwise
     * the `item` will be selected.
     *
     * @method select
     * @param {*} item The item to select.
     */
    select: function(item) {
      if (this.multi) {
        this.toggle(item);
      } else if (this.get() !== item) {
        this.setItemSelected(this.get(), false);
        this.setItemSelected(item, true);
      }
    },

    /**
     * Toggles the selection state for `item`.
     *
     * @method toggle
     * @param {*} item The item to toggle.
     */
    toggle: function(item) {
      this.setItemSelected(item, !this.isSelected(item));
    }

  };
/** @polymerBehavior */
  Polymer.IronSelectableBehavior = {

      /**
       * Fired when iron-selector is activated (selected or deselected).
       * It is fired before the selected items are changed.
       * Cancel the event to abort selection.
       *
       * @event iron-activate
       */

      /**
       * Fired when an item is selected
       *
       * @event iron-select
       */

      /**
       * Fired when an item is deselected
       *
       * @event iron-deselect
       */

      /**
       * Fired when the list of selectable items changes (e.g., items are
       * added or removed). The detail of the event is a list of mutation
       * records that describe what changed.
       *
       * @event iron-items-changed
       */

    properties: {

      /**
       * If you want to use the attribute value of an element for `selected` instead of the index,
       * set this to the name of the attribute.
       */
      attrForSelected: {
        type: String,
        value: null
      },

      /**
       * Gets or sets the selected element. The default is to use the index of the item.
       * @type {string|number}
       */
      selected: {
        type: String,
        notify: true
      },

      /**
       * Returns the currently selected item.
       *
       * @type {?Object}
       */
      selectedItem: {
        type: Object,
        readOnly: true,
        notify: true
      },

      /**
       * The event that fires from items when they are selected. Selectable
       * will listen for this event from items and update the selection state.
       * Set to empty string to listen to no events.
       */
      activateEvent: {
        type: String,
        value: 'tap',
        observer: '_activateEventChanged'
      },

      /**
       * This is a CSS selector string.  If this is set, only items that match the CSS selector
       * are selectable.
       */
      selectable: String,

      /**
       * The class to set on elements when selected.
       */
      selectedClass: {
        type: String,
        value: 'iron-selected'
      },

      /**
       * The attribute to set on elements when selected.
       */
      selectedAttribute: {
        type: String,
        value: null
      },

      /**
       * The list of items from which a selection can be made.
       */
      items: {
        type: Array,
        readOnly: true,
        notify: true,
        value: function() {
          return [];
        }
      },

      /**
       * The set of excluded elements where the key is the `localName`
       * of the element that will be ignored from the item list.
       *
       * @default {template: 1}
       */
      _excludedLocalNames: {
        type: Object,
        value: function() {
          return {
            'template': 1
          };
        }
      }
    },

    observers: [
      '_updateSelected(attrForSelected, selected)'
    ],

    created: function() {
      this._bindFilterItem = this._filterItem.bind(this);
      this._selection = new Polymer.IronSelection(this._applySelection.bind(this));
    },

    attached: function() {
      this._observer = this._observeItems(this);
      this._updateItems();
      if (!this._shouldUpdateSelection) {
        this._updateSelected(this.attrForSelected,this.selected)
      }
      this._addListener(this.activateEvent);
    },

    detached: function() {
      if (this._observer) {
        Polymer.dom(this).unobserveNodes(this._observer);
      }
      this._removeListener(this.activateEvent);
    },

    /**
     * Returns the index of the given item.
     *
     * @method indexOf
     * @param {Object} item
     * @returns Returns the index of the item
     */
    indexOf: function(item) {
      return this.items.indexOf(item);
    },

    /**
     * Selects the given value.
     *
     * @method select
     * @param {string|number} value the value to select.
     */
    select: function(value) {
      this.selected = value;
    },

    /**
     * Selects the previous item.
     *
     * @method selectPrevious
     */
    selectPrevious: function() {
      var length = this.items.length;
      var index = (Number(this._valueToIndex(this.selected)) - 1 + length) % length;
      this.selected = this._indexToValue(index);
    },

    /**
     * Selects the next item.
     *
     * @method selectNext
     */
    selectNext: function() {
      var index = (Number(this._valueToIndex(this.selected)) + 1) % this.items.length;
      this.selected = this._indexToValue(index);
    },

    /**
     * Force a synchronous update of the `items` property.
     *
     * NOTE: Consider listening for the `iron-items-changed` event to respond to
     * updates to the set of selectable items after updates to the DOM list and
     * selection state have been made.
     *
     * WARNING: If you are using this method, you should probably consider an
     * alternate approach. Synchronously querying for items is potentially
     * slow for many use cases. The `items` property will update asynchronously
     * on its own to reflect selectable items in the DOM.
     */
    forceSynchronousItemUpdate: function() {
      this._updateItems();
    },

    get _shouldUpdateSelection() {
      return this.selected != null;
    },

    _addListener: function(eventName) {
      this.listen(this, eventName, '_activateHandler');
    },

    _removeListener: function(eventName) {
      this.unlisten(this, eventName, '_activateHandler');
    },

    _activateEventChanged: function(eventName, old) {
      this._removeListener(old);
      this._addListener(eventName);
    },

    _updateItems: function() {
      var nodes = Polymer.dom(this).queryDistributedElements(this.selectable || '*');
      nodes = Array.prototype.filter.call(nodes, this._bindFilterItem);
      this._setItems(nodes);
    },

    _updateSelected: function() {
      this._selectSelected(this.selected);
    },

    _selectSelected: function(selected) {
      this._selection.select(this._valueToItem(this.selected));
    },

    _filterItem: function(node) {
      return !this._excludedLocalNames[node.localName];
    },

    _valueToItem: function(value) {
      return (value == null) ? null : this.items[this._valueToIndex(value)];
    },

    _valueToIndex: function(value) {
      if (this.attrForSelected) {
        for (var i = 0, item; item = this.items[i]; i++) {
          if (this._valueForItem(item) == value) {
            return i;
          }
        }
      } else {
        return Number(value);
      }
    },

    _indexToValue: function(index) {
      if (this.attrForSelected) {
        var item = this.items[index];
        if (item) {
          return this._valueForItem(item);
        }
      } else {
        return index;
      }
    },

    _valueForItem: function(item) {
      return item[this.attrForSelected] || item.getAttribute(this.attrForSelected);
    },

    _applySelection: function(item, isSelected) {
      if (this.selectedClass) {
        this.toggleClass(this.selectedClass, isSelected, item);
      }
      if (this.selectedAttribute) {
        this.toggleAttribute(this.selectedAttribute, isSelected, item);
      }
      this._selectionChange();
      this.fire('iron-' + (isSelected ? 'select' : 'deselect'), {item: item});
    },

    _selectionChange: function() {
      this._setSelectedItem(this._selection.get());
    },

    // observe items change under the given node.
    _observeItems: function(node) {
      return Polymer.dom(node).observeNodes(function(mutations) {
        this._updateItems();

        if (this._shouldUpdateSelection) {
          this._updateSelected();
        }

        // Let other interested parties know about the change so that
        // we don't have to recreate mutation observers everywher.
        this.fire('iron-items-changed', mutations, {
          bubbles: false,
          cancelable: false
        });
      });
    },

    _activateHandler: function(e) {
      var t = e.target;
      var items = this.items;
      while (t && t != this) {
        var i = items.indexOf(t);
        if (i >= 0) {
          var value = this._indexToValue(i);
          this._itemActivate(value, t);
          return;
        }
        t = t.parentNode;
      }
    },

    _itemActivate: function(value, item) {
      if (!this.fire('iron-activate',
          {selected: value, item: item}, {cancelable: true}).defaultPrevented) {
        this.select(value);
      }
    }

  };
/** @polymerBehavior Polymer.IronMultiSelectableBehavior */
  Polymer.IronMultiSelectableBehaviorImpl = {
    properties: {

      /**
       * If true, multiple selections are allowed.
       */
      multi: {
        type: Boolean,
        value: false,
        observer: 'multiChanged'
      },

      /**
       * Gets or sets the selected elements. This is used instead of `selected` when `multi`
       * is true.
       */
      selectedValues: {
        type: Array,
        notify: true
      },

      /**
       * Returns an array of currently selected items.
       */
      selectedItems: {
        type: Array,
        readOnly: true,
        notify: true
      },

    },

    observers: [
      '_updateSelected(attrForSelected, selectedValues)'
    ],

    /**
     * Selects the given value. If the `multi` property is true, then the selected state of the
     * `value` will be toggled; otherwise the `value` will be selected.
     *
     * @method select
     * @param {string|number} value the value to select.
     */
    select: function(value) {
      if (this.multi) {
        if (this.selectedValues) {
          this._toggleSelected(value);
        } else {
          this.selectedValues = [value];
        }
      } else {
        this.selected = value;
      }
    },

    multiChanged: function(multi) {
      this._selection.multi = multi;
    },

    get _shouldUpdateSelection() {
      return this.selected != null ||
        (this.selectedValues != null && this.selectedValues.length);
    },

    _updateSelected: function() {
      if (this.multi) {
        this._selectMulti(this.selectedValues);
      } else {
        this._selectSelected(this.selected);
      }
    },

    _selectMulti: function(values) {
      this._selection.clear();
      if (values) {
        for (var i = 0; i < values.length; i++) {
          this._selection.setItemSelected(this._valueToItem(values[i]), true);
        }
      }
    },

    _selectionChange: function() {
      var s = this._selection.get();
      if (this.multi) {
        this._setSelectedItems(s);
      } else {
        this._setSelectedItems([s]);
        this._setSelectedItem(s);
      }
    },

    _toggleSelected: function(value) {
      var i = this.selectedValues.indexOf(value);
      var unselected = i < 0;
      if (unselected) {
        this.push('selectedValues',value);
      } else {
        this.splice('selectedValues',i,1);
      }
      this._selection.setItemSelected(this._valueToItem(value), unselected);
    }
  };

  /** @polymerBehavior */
  Polymer.IronMultiSelectableBehavior = [
    Polymer.IronSelectableBehavior,
    Polymer.IronMultiSelectableBehaviorImpl
  ];
/**
  `iron-selector` is an element which can be used to manage a list of elements
  that can be selected.  Tapping on the item will make the item selected.  The `selected` indicates
  which item is being selected.  The default is to use the index of the item.

  Example:

      <iron-selector selected="0">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </iron-selector>

  If you want to use the attribute value of an element for `selected` instead of the index,
  set `attrForSelected` to the name of the attribute.  For example, if you want to select item by
  `name`, set `attrForSelected` to `name`.

  Example:

      <iron-selector attr-for-selected="name" selected="foo">
        <div name="foo">Foo</div>
        <div name="bar">Bar</div>
        <div name="zot">Zot</div>
      </iron-selector>

  `iron-selector` is not styled. Use the `iron-selected` CSS class to style the selected element.

  Example:

      <style>
        .iron-selected {
          background: #eee;
        }
      </style>

      ...

      <iron-selector selected="0">
        <div>Item 1</div>
        <div>Item 2</div>
        <div>Item 3</div>
      </iron-selector>

  @demo demo/index.html
  */

  Polymer({

    is: 'iron-selector',

    behaviors: [
      Polymer.IronMultiSelectableBehavior
    ]

  });
/**
   * `IronResizableBehavior` is a behavior that can be used in Polymer elements to
   * coordinate the flow of resize events between "resizers" (elements that control the
   * size or hidden state of their children) and "resizables" (elements that need to be
   * notified when they are resized or un-hidden by their parents in order to take
   * action on their new measurements).
   * 
   * Elements that perform measurement should add the `IronResizableBehavior` behavior to
   * their element definition and listen for the `iron-resize` event on themselves.
   * This event will be fired when they become showing after having been hidden,
   * when they are resized explicitly by another resizable, or when the window has been
   * resized.
   * 
   * Note, the `iron-resize` event is non-bubbling.
   *
   * @polymerBehavior Polymer.IronResizableBehavior
   * @demo demo/index.html
   **/
  Polymer.IronResizableBehavior = {
    properties: {
      /**
       * The closest ancestor element that implements `IronResizableBehavior`.
       */
      _parentResizable: {
        type: Object,
        observer: '_parentResizableChanged'
      },

      /**
       * True if this element is currently notifying its descedant elements of
       * resize.
       */
      _notifyingDescendant: {
        type: Boolean,
        value: false
      }
    },

    listeners: {
      'iron-request-resize-notifications': '_onIronRequestResizeNotifications'
    },

    created: function() {
      // We don't really need property effects on these, and also we want them
      // to be created before the `_parentResizable` observer fires:
      this._interestedResizables = [];
      this._boundNotifyResize = this.notifyResize.bind(this);
    },

    attached: function() {
      this.fire('iron-request-resize-notifications', null, {
        node: this,
        bubbles: true,
        cancelable: true
      });

      if (!this._parentResizable) {
        window.addEventListener('resize', this._boundNotifyResize);
        this.notifyResize();
      }
    },

    detached: function() {
      if (this._parentResizable) {
        this._parentResizable.stopResizeNotificationsFor(this);
      } else {
        window.removeEventListener('resize', this._boundNotifyResize);
      }

      this._parentResizable = null;
    },

    /**
     * Can be called to manually notify a resizable and its descendant
     * resizables of a resize change.
     */
    notifyResize: function() {
      if (!this.isAttached) {
        return;
      }

      this._interestedResizables.forEach(function(resizable) {
        if (this.resizerShouldNotify(resizable)) {
          this._notifyDescendant(resizable);
        }
      }, this);

      this._fireResize();
    },

    /**
     * Used to assign the closest resizable ancestor to this resizable
     * if the ancestor detects a request for notifications.
     */
    assignParentResizable: function(parentResizable) {
      this._parentResizable = parentResizable;
    },

    /**
     * Used to remove a resizable descendant from the list of descendants
     * that should be notified of a resize change.
     */
    stopResizeNotificationsFor: function(target) {
      var index = this._interestedResizables.indexOf(target);

      if (index > -1) {
        this._interestedResizables.splice(index, 1);
        this.unlisten(target, 'iron-resize', '_onDescendantIronResize');
      }
    },

    /**
     * This method can be overridden to filter nested elements that should or
     * should not be notified by the current element. Return true if an element
     * should be notified, or false if it should not be notified.
     *
     * @param {HTMLElement} element A candidate descendant element that
     * implements `IronResizableBehavior`.
     * @return {boolean} True if the `element` should be notified of resize.
     */
    resizerShouldNotify: function(element) { return true; },

    _onDescendantIronResize: function(event) {
      if (this._notifyingDescendant) {
        event.stopPropagation();
        return;
      }

      // NOTE(cdata): In ShadowDOM, event retargetting makes echoing of the
      // otherwise non-bubbling event "just work." We do it manually here for
      // the case where Polymer is not using shadow roots for whatever reason:
      if (!Polymer.Settings.useShadow) {
        this._fireResize();
      }
    },

    _fireResize: function() {
      this.fire('iron-resize', null, {
        node: this,
        bubbles: false
      });
    },

    _onIronRequestResizeNotifications: function(event) {
      var target = event.path ? event.path[0] : event.target;

      if (target === this) {
        return;
      }

      if (this._interestedResizables.indexOf(target) === -1) {
        this._interestedResizables.push(target);
        this.listen(target, 'iron-resize', '_onDescendantIronResize');
      }

      target.assignParentResizable(this);
      this._notifyDescendant(target);

      event.stopPropagation();
    },

    _parentResizableChanged: function(parentResizable) {
      if (parentResizable) {
        window.removeEventListener('resize', this._boundNotifyResize);
      }
    },

    _notifyDescendant: function(descendant) {
      // NOTE(cdata): In IE10, attached is fired on children first, so it's
      // important not to notify them if the parent is not attached yet (or
      // else they will get redundantly notified when the parent attaches).
      if (!this.isAttached) {
        return;
      }

      this._notifyingDescendant = true;
      descendant.notifyResize();
      this._notifyingDescendant = false;
    }
  };
(function() {
      'use strict';

      // this would be the only `paper-drawer-panel` in
      // the whole app that can be in `dragging` state
      var sharedPanel = null;

      function classNames(obj) {
        var classes = [];
        for (var key in obj) {
          if (obj.hasOwnProperty(key) && obj[key]) {
            classes.push(key);
          }
        }

        return classes.join(' ');
      }

      Polymer({

        is: 'paper-drawer-panel',

        behaviors: [Polymer.IronResizableBehavior],

        /**
         * Fired when the narrow layout changes.
         *
         * @event paper-responsive-change {{narrow: boolean}} detail -
         *     narrow: true if the panel is in narrow layout.
         */

        /**
         * Fired when the a panel is selected.
         *
         * Listening for this event is an alternative to observing changes in the `selected` attribute.
         * This event is fired both when a panel is selected.
         *
         * @event iron-select {{item: Object}} detail -
         *     item: The panel that the event refers to.
         */

        /**
         * Fired when a panel is deselected.
         *
         * Listening for this event is an alternative to observing changes in the `selected` attribute.
         * This event is fired both when a panel is deselected.
         *
         * @event iron-deselect {{item: Object}} detail -
         *     item: The panel that the event refers to.
         */
        properties: {

          /**
           * The panel to be selected when `paper-drawer-panel` changes to narrow
           * layout.
           */
          defaultSelected: {
            type: String,
            value: 'main'
          },

          /**
           * If true, swipe from the edge is disabled.
           */
          disableEdgeSwipe: {
            type: Boolean,
            value: false
          },

          /**
           * If true, swipe to open/close the drawer is disabled.
           */
          disableSwipe: {
            type: Boolean,
            value: false
          },

          /**
           * Whether the user is dragging the drawer interactively.
           */
          dragging: {
            type: Boolean,
            value: false,
            readOnly: true,
            notify: true
          },

          /**
           * Width of the drawer panel.
           */
          drawerWidth: {
            type: String,
            value: '256px'
          },

          /**
           * How many pixels on the side of the screen are sensitive to edge
           * swipes and peek.
           */
          edgeSwipeSensitivity: {
            type: Number,
            value: 30
          },

          /**
           * If true, ignore `responsiveWidth` setting and force the narrow layout.
           */
          forceNarrow: {
            type: Boolean,
            value: false
          },

          /**
           * Whether the browser has support for the transform CSS property.
           */
          hasTransform: {
            type: Boolean,
            value: function() {
              return 'transform' in this.style;
            }
          },

          /**
           * Whether the browser has support for the will-change CSS property.
           */
          hasWillChange: {
            type: Boolean,
            value: function() {
              return 'willChange' in this.style;
            }
          },

          /**
           * Returns true if the panel is in narrow layout.  This is useful if you
           * need to show/hide elements based on the layout.
           */
          narrow: {
            reflectToAttribute: true,
            type: Boolean,
            value: false,
            readOnly: true,
            notify: true
          },

          /**
           * Whether the drawer is peeking out from the edge.
           */
          peeking: {
            type: Boolean,
            value: false,
            readOnly: true,
            notify: true
          },

          /**
           * Max-width when the panel changes to narrow layout.
           */
          responsiveWidth: {
            type: String,
            value: '600px'
          },

          /**
           * If true, position the drawer to the right.
           */
          rightDrawer: {
            type: Boolean,
            value: false
          },

          /**
           * The panel that is being selected. `drawer` for the drawer panel and
           * `main` for the main panel.
           */
          selected: {
            reflectToAttribute: true,
            notify: true,
            type: String,
            value: null
          },

          /**
           * The attribute on elements that should toggle the drawer on tap, also elements will
           * automatically be hidden in wide layout.
           */
          drawerToggleAttribute: {
            type: String,
            value: 'paper-drawer-toggle'
          },

          /**
           * Whether the transition is enabled.
           */
          _transition: {
            type: Boolean,
            value: false
          },

        },

        listeners: {
          tap: '_onTap',
          track: '_onTrack',
          down: '_downHandler',
          up: '_upHandler'
        },

        observers: [
          '_forceNarrowChanged(forceNarrow, defaultSelected)'
        ],

        /**
         * Toggles the panel open and closed.
         *
         * @method togglePanel
         */
        togglePanel: function() {
          if (this._isMainSelected()) {
            this.openDrawer();
          } else {
            this.closeDrawer();
          }
        },

        /**
         * Opens the drawer.
         *
         * @method openDrawer
         */
        openDrawer: function() {
          this.selected = 'drawer';
        },

        /**
         * Closes the drawer.
         *
         * @method closeDrawer
         */
        closeDrawer: function() {
          this.selected = 'main';
        },

        ready: function() {
          // Avoid transition at the beginning e.g. page loads and enable
          // transitions only after the element is rendered and ready.
          this._transition = true;
        },

        _onMainTransitionEnd: function (e) {
          if (e.currentTarget === this.$.main && (e.propertyName === 'left' || e.propertyName === 'right')) {
            this.notifyResize();
          }
        },

        _computeIronSelectorClass: function(narrow, transition, dragging, rightDrawer, peeking) {
          return classNames({
            dragging: dragging,
            'narrow-layout': narrow,
            'right-drawer': rightDrawer,
            'left-drawer': !rightDrawer,
            transition: transition,
            peeking: peeking
          });
        },

        _computeDrawerStyle: function(drawerWidth) {
          return 'width:' + drawerWidth + ';';
        },

        _computeMainStyle: function(narrow, rightDrawer, drawerWidth) {
          var style = '';

          style += 'left:' + ((narrow || rightDrawer) ? '0' : drawerWidth) + ';';

          if (rightDrawer) {
            style += 'right:' + (narrow ? '' : drawerWidth) + ';';
          }

          return style;
        },

        _computeMediaQuery: function(forceNarrow, responsiveWidth) {
          return forceNarrow ? '' : '(max-width: ' + responsiveWidth + ')';
        },

        _computeSwipeOverlayHidden: function(narrow, disableEdgeSwipe) {
          return !narrow || disableEdgeSwipe;
        },

        _onTrack: function(event) {
          if (sharedPanel && this !== sharedPanel) {
            return;
          }
          switch (event.detail.state) {
            case 'start':
              this._trackStart(event);
              break;
            case 'track':
              this._trackX(event);
              break;
            case 'end':
              this._trackEnd(event);
              break;
          }

        },

        _responsiveChange: function(narrow) {
          this._setNarrow(narrow);

          if (this.narrow) {
            this.selected = this.defaultSelected;
          }

          this.setScrollDirection(this._swipeAllowed() ? 'y' : 'all');
          this.fire('paper-responsive-change', {narrow: this.narrow});
        },

        _onQueryMatchesChanged: function(event) {
          this._responsiveChange(event.detail.value);
        },

        _forceNarrowChanged: function() {
          // set the narrow mode only if we reached the `responsiveWidth`
          this._responsiveChange(this.forceNarrow || this.$.mq.queryMatches);
        },

        _swipeAllowed: function() {
          return this.narrow && !this.disableSwipe;
        },

        _isMainSelected: function() {
          return this.selected === 'main';
        },

        _startEdgePeek: function() {
          this.width = this.$.drawer.offsetWidth;
          this._moveDrawer(this._translateXForDeltaX(this.rightDrawer ?
              -this.edgeSwipeSensitivity : this.edgeSwipeSensitivity));
          this._setPeeking(true);
        },

        _stopEdgePeek: function() {
          if (this.peeking) {
            this._setPeeking(false);
            this._moveDrawer(null);
          }
        },

        _downHandler: function(event) {
          if (!this.dragging && this._isMainSelected() && this._isEdgeTouch(event) && !sharedPanel) {
            this._startEdgePeek();
            // cancel selection
            event.preventDefault();
            // grab this panel
            sharedPanel = this;
          }
        },

        _upHandler: function() {
          this._stopEdgePeek();
          // release the panel
          sharedPanel = null;
        },

        _onTap: function(event) {
          var targetElement = Polymer.dom(event).localTarget;
          var isTargetToggleElement = targetElement &&
            this.drawerToggleAttribute &&
            targetElement.hasAttribute(this.drawerToggleAttribute);

          if (isTargetToggleElement) {
            this.togglePanel();
          }
        },

        _isEdgeTouch: function(event) {
          var x = event.detail.x;

          return !this.disableEdgeSwipe && this._swipeAllowed() &&
            (this.rightDrawer ?
              x >= this.offsetWidth - this.edgeSwipeSensitivity :
              x <= this.edgeSwipeSensitivity);
        },

        _trackStart: function(event) {
          if (this._swipeAllowed()) {
            sharedPanel = this;
            this._setDragging(true);

            if (this._isMainSelected()) {
              this._setDragging(this.peeking || this._isEdgeTouch(event));
            }

            if (this.dragging) {
              this.width = this.$.drawer.offsetWidth;
              this._transition = false;
            }
          }
        },

        _translateXForDeltaX: function(deltaX) {
          var isMain = this._isMainSelected();

          if (this.rightDrawer) {
            return Math.max(0, isMain ? this.width + deltaX : deltaX);
          } else {
            return Math.min(0, isMain ? deltaX - this.width : deltaX);
          }
        },

        _trackX: function(event) {
          if (this.dragging) {
            var dx = event.detail.dx;

            if (this.peeking) {
              if (Math.abs(dx) <= this.edgeSwipeSensitivity) {
                // Ignore trackx until we move past the edge peek.
                return;
              }
              this._setPeeking(false);
            }

            this._moveDrawer(this._translateXForDeltaX(dx));
          }
        },

        _trackEnd: function(event) {
          if (this.dragging) {
            var xDirection = event.detail.dx > 0;

            this._setDragging(false);
            this._transition = true;
            sharedPanel = null;
            this._moveDrawer(null);

            if (this.rightDrawer) {
              this[xDirection ? 'closeDrawer' : 'openDrawer']();
            } else {
              this[xDirection ? 'openDrawer' : 'closeDrawer']();
            }
          }
        },

        _transformForTranslateX: function(translateX) {
          if (translateX === null) {
            return '';
          }

          return this.hasWillChange ? 'translateX(' + translateX + 'px)' :
              'translate3d(' + translateX + 'px, 0, 0)';
        },

        _moveDrawer: function(translateX) {
          this.transform(this._transformForTranslateX(translateX), this.$.drawer);
        }

      });
    }());
(function() {
      'use strict';

      var SHADOW_WHEN_SCROLLING = 1;
      var SHADOW_ALWAYS = 2;
      var MODE_CONFIGS = {
        outerScroll: {
          'scroll': true
        },

        shadowMode: {
          'standard': SHADOW_ALWAYS,
          'waterfall': SHADOW_WHEN_SCROLLING,
          'waterfall-tall': SHADOW_WHEN_SCROLLING
        },

        tallMode: {
          'waterfall-tall': true
        }
      };

      Polymer({
        is: 'paper-header-panel',

        /**
         * Fired when the content has been scrolled.  `event.detail.target` returns
         * the scrollable element which you can use to access scroll info such as
         * `scrollTop`.
         *
         *     <paper-header-panel on-content-scroll="scrollHandler">
         *       ...
         *     </paper-header-panel>
         *
         *
         *     scrollHandler: function(event) {
         *       var scroller = event.detail.target;
         *       console.log(scroller.scrollTop);
         *     }
         *
         * @event content-scroll
         */

        properties: {
          /**
           * Controls header and scrolling behavior. Options are
           * `standard`, `seamed`, `waterfall`, `waterfall-tall`, `scroll` and
           * `cover`. Default is `standard`.
           *
           * `standard`: The header is a step above the panel. The header will consume the
           * panel at the point of entry, preventing it from passing through to the
           * opposite side.
           *
           * `seamed`: The header is presented as seamed with the panel.
           *
           * `waterfall`: Similar to standard mode, but header is initially presented as
           * seamed with panel, but then separates to form the step.
           *
           * `waterfall-tall`: The header is initially taller (`tall` class is added to
           * the header).  As the user scrolls, the header separates (forming an edge)
           * while condensing (`tall` class is removed from the header).
           *
           * `scroll`: The header keeps its seam with the panel, and is pushed off screen.
           *
           * `cover`: The panel covers the whole `paper-header-panel` including the
           * header. This allows user to style the panel in such a way that the panel is
           * partially covering the header.
           *
           *     <paper-header-panel mode="cover">
           *       <paper-toolbar class="tall">
           *         <paper-icon-button icon="menu"></paper-icon-button>
           *       </paper-toolbar>
           *       <div class="content"></div>
           *     </paper-header-panel>
           */
          mode: {
            type: String,
            value: 'standard',
            observer: '_modeChanged',
            reflectToAttribute: true
          },

          /**
           * If true, the drop-shadow is always shown no matter what mode is set to.
           */
          shadow: {
            type: Boolean,
            value: false
          },

          /**
           * The class used in waterfall-tall mode.  Change this if the header
           * accepts a different class for toggling height, e.g. "medium-tall"
           */
          tallClass: {
            type: String,
            value: 'tall'
          },

          /**
           * If true, the scroller is at the top
           */
          atTop: {
            type: Boolean,
            value: true,
            readOnly: true
          }
        },

        observers: [
          '_computeDropShadowHidden(atTop, mode, shadow)'
        ],

        ready: function() {
          this.scrollHandler = this._scroll.bind(this);
        },

        attached: function() {
          this._addListener();
          // Run `scroll` logic once to initialize class names, etc.
          this._keepScrollingState();
        },

        detached: function() {
          this._removeListener();
        },

        /**
         * Returns the header element
         *
         * @property header
         * @type Object
         */
        get header() {
          return Polymer.dom(this.$.headerContent).getDistributedNodes()[0];
        },

        /**
         * Returns the scrollable element.
         *
         * @property scroller
         * @type Object
         */
        get scroller() {
          return this._getScrollerForMode(this.mode);
        },

        /**
         * Returns true if the scroller has a visible shadow.
         *
         * @property visibleShadow
         * @type Boolean
         */
        get visibleShadow() {
          return this.$.dropShadow.classList.contains('has-shadow');
        },

        _computeDropShadowHidden: function(atTop, mode, shadow) {
          var shadowMode = MODE_CONFIGS.shadowMode[mode];

          if (this.shadow) {
            this.toggleClass('has-shadow', true, this.$.dropShadow);
          } else if (shadowMode === SHADOW_ALWAYS) {
            this.toggleClass('has-shadow', true, this.$.dropShadow);
          } else if (shadowMode === SHADOW_WHEN_SCROLLING && !atTop) {
            this.toggleClass('has-shadow', true, this.$.dropShadow);
          } else {
            this.toggleClass('has-shadow', false, this.$.dropShadow);
          }
        },

        _computeMainContainerClass: function(mode) {
          // TODO:  It will be useful to have a utility for classes
          // e.g. Polymer.Utils.classes({ foo: true });

          var classes = {};

          classes['flex'] = mode !== 'cover';

          return Object.keys(classes).filter(
            function(className) {
              return classes[className];
            }).join(' ');
        },

        _addListener: function() {
          this.scroller.addEventListener('scroll', this.scrollHandler, false);
        },

        _removeListener: function() {
          this.scroller.removeEventListener('scroll', this.scrollHandler);
        },

        _modeChanged: function(newMode, oldMode) {
          var configs = MODE_CONFIGS;
          var header = this.header;
          var animateDuration = 200;

          if (header) {
            // in tallMode it may add tallClass to the header; so do the cleanup
            // when mode is changed from tallMode to not tallMode
            if (configs.tallMode[oldMode] && !configs.tallMode[newMode]) {
              header.classList.remove(this.tallClass);
              this.async(function() {
                header.classList.remove('animate');
              }, animateDuration);
            } else {
              header.classList.toggle('animate', configs.tallMode[newMode]);
            }
          }
          this._keepScrollingState();
        },

        _keepScrollingState: function() {
          var main = this.scroller;
          var header = this.header;

          this._setAtTop(main.scrollTop === 0);

          if (header && this.tallClass && MODE_CONFIGS.tallMode[this.mode]) {
            this.toggleClass(this.tallClass, this.atTop ||
                header.classList.contains(this.tallClass) &&
                main.scrollHeight < this.offsetHeight, header);
          }
        },

        _scroll: function() {
          this._keepScrollingState();
          this.fire('content-scroll', {target: this.scroller}, {bubbles: false});
        },

        _getScrollerForMode: function(mode) {
          return MODE_CONFIGS.outerScroll[mode] ?
              this : this.$.mainContainer;
        }
      });
    })();
(function() {

    // monostate data
    var metaDatas = {};
    var metaArrays = {};
    var singleton = null;

    Polymer.IronMeta = Polymer({

      is: 'iron-meta',

      properties: {

        /**
         * The type of meta-data.  All meta-data of the same type is stored
         * together.
         */
        type: {
          type: String,
          value: 'default',
          observer: '_typeChanged'
        },

        /**
         * The key used to store `value` under the `type` namespace.
         */
        key: {
          type: String,
          observer: '_keyChanged'
        },

        /**
         * The meta-data to store or retrieve.
         */
        value: {
          type: Object,
          notify: true,
          observer: '_valueChanged'
        },

        /**
         * If true, `value` is set to the iron-meta instance itself.
         */
         self: {
          type: Boolean,
          observer: '_selfChanged'
        },

        /**
         * Array of all meta-data values for the given type.
         */
        list: {
          type: Array,
          notify: true
        }

      },

      hostAttributes: {
        hidden: true
      },

      /**
       * Only runs if someone invokes the factory/constructor directly
       * e.g. `new Polymer.IronMeta()`
       *
       * @param {{type: (string|undefined), key: (string|undefined), value}=} config
       */
      factoryImpl: function(config) {
        if (config) {
          for (var n in config) {
            switch(n) {
              case 'type':
              case 'key':
              case 'value':
                this[n] = config[n];
                break;
            }
          }
        }
      },

      created: function() {
        // TODO(sjmiles): good for debugging?
        this._metaDatas = metaDatas;
        this._metaArrays = metaArrays;
      },

      _keyChanged: function(key, old) {
        this._resetRegistration(old);
      },

      _valueChanged: function(value) {
        this._resetRegistration(this.key);
      },

      _selfChanged: function(self) {
        if (self) {
          this.value = this;
        }
      },

      _typeChanged: function(type) {
        this._unregisterKey(this.key);
        if (!metaDatas[type]) {
          metaDatas[type] = {};
        }
        this._metaData = metaDatas[type];
        if (!metaArrays[type]) {
          metaArrays[type] = [];
        }
        this.list = metaArrays[type];
        this._registerKeyValue(this.key, this.value);
      },

      /**
       * Retrieves meta data value by key.
       *
       * @method byKey
       * @param {string} key The key of the meta-data to be returned.
       * @return {*}
       */
      byKey: function(key) {
        return this._metaData && this._metaData[key];
      },

      _resetRegistration: function(oldKey) {
        this._unregisterKey(oldKey);
        this._registerKeyValue(this.key, this.value);
      },

      _unregisterKey: function(key) {
        this._unregister(key, this._metaData, this.list);
      },

      _registerKeyValue: function(key, value) {
        this._register(key, value, this._metaData, this.list);
      },

      _register: function(key, value, data, list) {
        if (key && data && value !== undefined) {
          data[key] = value;
          list.push(value);
        }
      },

      _unregister: function(key, data, list) {
        if (key && data) {
          if (key in data) {
            var value = data[key];
            delete data[key];
            this.arrayDelete(list, value);
          }
        }
      }

    });

    Polymer.IronMeta.getIronMeta = function getIronMeta() {
       if (singleton === null) {
         singleton = new Polymer.IronMeta();
       }
       return singleton;
     };

    /**
    `iron-meta-query` can be used to access infomation stored in `iron-meta`.

    Examples:

    If I create an instance like this:

        <iron-meta key="info" value="foo/bar"></iron-meta>

    Note that value="foo/bar" is the metadata I've defined. I could define more
    attributes or use child nodes to define additional metadata.

    Now I can access that element (and it's metadata) from any `iron-meta-query` instance:

         var value = new Polymer.IronMetaQuery({key: 'info'}).value;

    @group Polymer Iron Elements
    @element iron-meta-query
    */
    Polymer.IronMetaQuery = Polymer({

      is: 'iron-meta-query',

      properties: {

        /**
         * The type of meta-data.  All meta-data of the same type is stored
         * together.
         */
        type: {
          type: String,
          value: 'default',
          observer: '_typeChanged'
        },

        /**
         * Specifies a key to use for retrieving `value` from the `type`
         * namespace.
         */
        key: {
          type: String,
          observer: '_keyChanged'
        },

        /**
         * The meta-data to store or retrieve.
         */
        value: {
          type: Object,
          notify: true,
          readOnly: true
        },

        /**
         * Array of all meta-data values for the given type.
         */
        list: {
          type: Array,
          notify: true
        }

      },

      /**
       * Actually a factory method, not a true constructor. Only runs if
       * someone invokes it directly (via `new Polymer.IronMeta()`);
       *
       * @param {{type: (string|undefined), key: (string|undefined)}=} config
       */
      factoryImpl: function(config) {
        if (config) {
          for (var n in config) {
            switch(n) {
              case 'type':
              case 'key':
                this[n] = config[n];
                break;
            }
          }
        }
      },

      created: function() {
        // TODO(sjmiles): good for debugging?
        this._metaDatas = metaDatas;
        this._metaArrays = metaArrays;
      },

      _keyChanged: function(key) {
        this._setValue(this._metaData && this._metaData[key]);
      },

      _typeChanged: function(type) {
        this._metaData = metaDatas[type];
        this.list = metaArrays[type];
        if (this.key) {
          this._keyChanged(this.key);
        }
      },

      /**
       * Retrieves meta data value by key.
       * @param {string} key The key of the meta-data to be returned.
       * @return {*}
       */
      byKey: function(key) {
        return this._metaData && this._metaData[key];
      }

    });

  })();
Polymer({

      is: 'iron-icon',

      properties: {

        /**
         * The name of the icon to use. The name should be of the form:
         * `iconset_name:icon_name`.
         */
        icon: {
          type: String,
          observer: '_iconChanged'
        },

        /**
         * The name of the theme to used, if one is specified by the
         * iconset.
         */
        theme: {
          type: String,
          observer: '_updateIcon'
        },

        /**
         * If using iron-icon without an iconset, you can set the src to be
         * the URL of an individual icon image file. Note that this will take
         * precedence over a given icon attribute.
         */
        src: {
          type: String,
          observer: '_srcChanged'
        },

        /**
         * @type {!Polymer.IronMeta}
         */
        _meta: {
          value: Polymer.Base.create('iron-meta', {type: 'iconset'})
        }

      },

      _DEFAULT_ICONSET: 'icons',

      _iconChanged: function(icon) {
        var parts = (icon || '').split(':');
        this._iconName = parts.pop();
        this._iconsetName = parts.pop() || this._DEFAULT_ICONSET;
        this._updateIcon();
      },

      _srcChanged: function(src) {
        this._updateIcon();
      },

      _usesIconset: function() {
        return this.icon || !this.src;
      },

      /** @suppress {visibility} */
      _updateIcon: function() {
        if (this._usesIconset()) {
          if (this._iconsetName) {
            this._iconset = /** @type {?Polymer.Iconset} */ (
              this._meta.byKey(this._iconsetName));
            if (this._iconset) {
              this._iconset.applyIcon(this, this._iconName, this.theme);
              this.unlisten(window, 'iron-iconset-added', '_updateIcon');
            } else {
              this.listen(window, 'iron-iconset-added', '_updateIcon');
            }
          }
        } else {
          if (!this._img) {
            this._img = document.createElement('img');
            this._img.style.width = '100%';
            this._img.style.height = '100%';
            this._img.draggable = false;
          }
          this._img.src = this.src;
          Polymer.dom(this.root).appendChild(this._img);
        }
      }

    });
(function() {
    'use strict';

    /**
     * Chrome uses an older version of DOM Level 3 Keyboard Events
     *
     * Most keys are labeled as text, but some are Unicode codepoints.
     * Values taken from: http://www.w3.org/TR/2007/WD-DOM-Level-3-Events-20071221/keyset.html#KeySet-Set
     */
    var KEY_IDENTIFIER = {
      'U+0008': 'backspace',
      'U+0009': 'tab',
      'U+001B': 'esc',
      'U+0020': 'space',
      'U+007F': 'del'
    };

    /**
     * Special table for KeyboardEvent.keyCode.
     * KeyboardEvent.keyIdentifier is better, and KeyBoardEvent.key is even better
     * than that.
     *
     * Values from: https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent.keyCode#Value_of_keyCode
     */
    var KEY_CODE = {
      8: 'backspace',
      9: 'tab',
      13: 'enter',
      27: 'esc',
      33: 'pageup',
      34: 'pagedown',
      35: 'end',
      36: 'home',
      32: 'space',
      37: 'left',
      38: 'up',
      39: 'right',
      40: 'down',
      46: 'del',
      106: '*'
    };

    /**
     * MODIFIER_KEYS maps the short name for modifier keys used in a key
     * combo string to the property name that references those same keys
     * in a KeyboardEvent instance.
     */
    var MODIFIER_KEYS = {
      'shift': 'shiftKey',
      'ctrl': 'ctrlKey',
      'alt': 'altKey',
      'meta': 'metaKey'
    };

    /**
     * KeyboardEvent.key is mostly represented by printable character made by
     * the keyboard, with unprintable keys labeled nicely.
     *
     * However, on OS X, Alt+char can make a Unicode character that follows an
     * Apple-specific mapping. In this case, we fall back to .keyCode.
     */
    var KEY_CHAR = /[a-z0-9*]/;

    /**
     * Matches a keyIdentifier string.
     */
    var IDENT_CHAR = /U\+/;

    /**
     * Matches arrow keys in Gecko 27.0+
     */
    var ARROW_KEY = /^arrow/;

    /**
     * Matches space keys everywhere (notably including IE10's exceptional name
     * `spacebar`).
     */
    var SPACE_KEY = /^space(bar)?/;

    /**
     * Transforms the key.
     * @param {string} key The KeyBoardEvent.key
     * @param {Boolean} [noSpecialChars] Limits the transformation to
     * alpha-numeric characters.
     */
    function transformKey(key, noSpecialChars) {
      var validKey = '';
      if (key) {
        var lKey = key.toLowerCase();
        if (lKey === ' ' || SPACE_KEY.test(lKey)) {
          validKey = 'space';
        } else if (lKey.length == 1) {
          if (!noSpecialChars || KEY_CHAR.test(lKey)) {
            validKey = lKey;
          }
        } else if (ARROW_KEY.test(lKey)) {
          validKey = lKey.replace('arrow', '');
        } else if (lKey == 'multiply') {
          // numpad '*' can map to Multiply on IE/Windows
          validKey = '*';
        } else {
          validKey = lKey;
        }
      }
      return validKey;
    }

    function transformKeyIdentifier(keyIdent) {
      var validKey = '';
      if (keyIdent) {
        if (keyIdent in KEY_IDENTIFIER) {
          validKey = KEY_IDENTIFIER[keyIdent];
        } else if (IDENT_CHAR.test(keyIdent)) {
          keyIdent = parseInt(keyIdent.replace('U+', '0x'), 16);
          validKey = String.fromCharCode(keyIdent).toLowerCase();
        } else {
          validKey = keyIdent.toLowerCase();
        }
      }
      return validKey;
    }

    function transformKeyCode(keyCode) {
      var validKey = '';
      if (Number(keyCode)) {
        if (keyCode >= 65 && keyCode <= 90) {
          // ascii a-z
          // lowercase is 32 offset from uppercase
          validKey = String.fromCharCode(32 + keyCode);
        } else if (keyCode >= 112 && keyCode <= 123) {
          // function keys f1-f12
          validKey = 'f' + (keyCode - 112);
        } else if (keyCode >= 48 && keyCode <= 57) {
          // top 0-9 keys
          validKey = String(48 - keyCode);
        } else if (keyCode >= 96 && keyCode <= 105) {
          // num pad 0-9
          validKey = String(96 - keyCode);
        } else {
          validKey = KEY_CODE[keyCode];
        }
      }
      return validKey;
    }

    /**
      * Calculates the normalized key for a KeyboardEvent.
      * @param {KeyboardEvent} keyEvent
      * @param {Boolean} [noSpecialChars] Set to true to limit keyEvent.key
      * transformation to alpha-numeric chars. This is useful with key
      * combinations like shift + 2, which on FF for MacOS produces
      * keyEvent.key = @
      * To get 2 returned, set noSpecialChars = true
      * To get @ returned, set noSpecialChars = false
     */
    function normalizedKeyForEvent(keyEvent, noSpecialChars) {
      // Fall back from .key, to .keyIdentifier, to .keyCode, and then to
      // .detail.key to support artificial keyboard events.
      return transformKey(keyEvent.key, noSpecialChars) ||
        transformKeyIdentifier(keyEvent.keyIdentifier) ||
        transformKeyCode(keyEvent.keyCode) ||
        transformKey(keyEvent.detail.key, noSpecialChars) || '';
    }

    function keyComboMatchesEvent(keyCombo, event) {
      // For combos with modifiers we support only alpha-numeric keys
      var keyEvent = normalizedKeyForEvent(event, keyCombo.hasModifiers);
      return keyEvent === keyCombo.key &&
        (!keyCombo.hasModifiers || (
          !!event.shiftKey === !!keyCombo.shiftKey &&
          !!event.ctrlKey === !!keyCombo.ctrlKey &&
          !!event.altKey === !!keyCombo.altKey &&
          !!event.metaKey === !!keyCombo.metaKey)
        );
    }

    function parseKeyComboString(keyComboString) {
      if (keyComboString.length === 1) {
        return {
          combo: keyComboString,
          key: keyComboString,
          event: 'keydown'
        };
      }
      return keyComboString.split('+').reduce(function(parsedKeyCombo, keyComboPart) {
        var eventParts = keyComboPart.split(':');
        var keyName = eventParts[0];
        var event = eventParts[1];

        if (keyName in MODIFIER_KEYS) {
          parsedKeyCombo[MODIFIER_KEYS[keyName]] = true;
          parsedKeyCombo.hasModifiers = true;
        } else {
          parsedKeyCombo.key = keyName;
          parsedKeyCombo.event = event || 'keydown';
        }

        return parsedKeyCombo;
      }, {
        combo: keyComboString.split(':').shift()
      });
    }

    function parseEventString(eventString) {
      return eventString.trim().split(' ').map(function(keyComboString) {
        return parseKeyComboString(keyComboString);
      });
    }

    /**
     * `Polymer.IronA11yKeysBehavior` provides a normalized interface for processing
     * keyboard commands that pertain to [WAI-ARIA best practices](http://www.w3.org/TR/wai-aria-practices/#kbd_general_binding).
     * The element takes care of browser differences with respect to Keyboard events
     * and uses an expressive syntax to filter key presses.
     *
     * Use the `keyBindings` prototype property to express what combination of keys
     * will trigger the event to fire.
     *
     * Use the `key-event-target` attribute to set up event handlers on a specific
     * node.
     * The `keys-pressed` event will fire when one of the key combinations set with the
     * `keys` property is pressed.
     *
     * @demo demo/index.html
     * @polymerBehavior
     */
    Polymer.IronA11yKeysBehavior = {
      properties: {
        /**
         * The HTMLElement that will be firing relevant KeyboardEvents.
         */
        keyEventTarget: {
          type: Object,
          value: function() {
            return this;
          }
        },

        /**
         * If true, this property will cause the implementing element to
         * automatically stop propagation on any handled KeyboardEvents.
         */
        stopKeyboardEventPropagation: {
          type: Boolean,
          value: false
        },

        _boundKeyHandlers: {
          type: Array,
          value: function() {
            return [];
          }
        },

        // We use this due to a limitation in IE10 where instances will have
        // own properties of everything on the "prototype".
        _imperativeKeyBindings: {
          type: Object,
          value: function() {
            return {};
          }
        }
      },

      observers: [
        '_resetKeyEventListeners(keyEventTarget, _boundKeyHandlers)'
      ],

      keyBindings: {},

      registered: function() {
        this._prepKeyBindings();
      },

      attached: function() {
        this._listenKeyEventListeners();
      },

      detached: function() {
        this._unlistenKeyEventListeners();
      },

      /**
       * Can be used to imperatively add a key binding to the implementing
       * element. This is the imperative equivalent of declaring a keybinding
       * in the `keyBindings` prototype property.
       */
      addOwnKeyBinding: function(eventString, handlerName) {
        this._imperativeKeyBindings[eventString] = handlerName;
        this._prepKeyBindings();
        this._resetKeyEventListeners();
      },

      /**
       * When called, will remove all imperatively-added key bindings.
       */
      removeOwnKeyBindings: function() {
        this._imperativeKeyBindings = {};
        this._prepKeyBindings();
        this._resetKeyEventListeners();
      },

      keyboardEventMatchesKeys: function(event, eventString) {
        var keyCombos = parseEventString(eventString);
        for (var i = 0; i < keyCombos.length; ++i) {
          if (keyComboMatchesEvent(keyCombos[i], event)) {
            return true;
          }
        }
        return false;
      },

      _collectKeyBindings: function() {
        var keyBindings = this.behaviors.map(function(behavior) {
          return behavior.keyBindings;
        });

        if (keyBindings.indexOf(this.keyBindings) === -1) {
          keyBindings.push(this.keyBindings);
        }

        return keyBindings;
      },

      _prepKeyBindings: function() {
        this._keyBindings = {};

        this._collectKeyBindings().forEach(function(keyBindings) {
          for (var eventString in keyBindings) {
            this._addKeyBinding(eventString, keyBindings[eventString]);
          }
        }, this);

        for (var eventString in this._imperativeKeyBindings) {
          this._addKeyBinding(eventString, this._imperativeKeyBindings[eventString]);
        }

        // Give precedence to combos with modifiers to be checked first.
        for (var eventName in this._keyBindings) {
          this._keyBindings[eventName].sort(function (kb1, kb2) {
            var b1 = kb1[0].hasModifiers;
            var b2 = kb2[0].hasModifiers;
            return (b1 === b2) ? 0 : b1 ? -1 : 1;
          })
        }
      },

      _addKeyBinding: function(eventString, handlerName) {
        parseEventString(eventString).forEach(function(keyCombo) {
          this._keyBindings[keyCombo.event] =
            this._keyBindings[keyCombo.event] || [];

          this._keyBindings[keyCombo.event].push([
            keyCombo,
            handlerName
          ]);
        }, this);
      },

      _resetKeyEventListeners: function() {
        this._unlistenKeyEventListeners();

        if (this.isAttached) {
          this._listenKeyEventListeners();
        }
      },

      _listenKeyEventListeners: function() {
        Object.keys(this._keyBindings).forEach(function(eventName) {
          var keyBindings = this._keyBindings[eventName];
          var boundKeyHandler = this._onKeyBindingEvent.bind(this, keyBindings);

          this._boundKeyHandlers.push([this.keyEventTarget, eventName, boundKeyHandler]);

          this.keyEventTarget.addEventListener(eventName, boundKeyHandler);
        }, this);
      },

      _unlistenKeyEventListeners: function() {
        var keyHandlerTuple;
        var keyEventTarget;
        var eventName;
        var boundKeyHandler;

        while (this._boundKeyHandlers.length) {
          // My kingdom for block-scope binding and destructuring assignment..
          keyHandlerTuple = this._boundKeyHandlers.pop();
          keyEventTarget = keyHandlerTuple[0];
          eventName = keyHandlerTuple[1];
          boundKeyHandler = keyHandlerTuple[2];

          keyEventTarget.removeEventListener(eventName, boundKeyHandler);
        }
      },

      _onKeyBindingEvent: function(keyBindings, event) {
        if (this.stopKeyboardEventPropagation) {
          event.stopPropagation();
        }

        // if event has been already prevented, don't do anything
        if (event.defaultPrevented) {
          return;
        }

        for (var i = 0; i < keyBindings.length; i++) {
          var keyCombo = keyBindings[i][0];
          var handlerName = keyBindings[i][1];
          if (keyComboMatchesEvent(keyCombo, event)) {
            this._triggerKeyHandler(keyCombo, handlerName, event);
            // exit the loop if eventDefault was prevented
            if (event.defaultPrevented) {
              return;
            }
          }
        }
      },

      _triggerKeyHandler: function(keyCombo, handlerName, keyboardEvent) {
        var detail = Object.create(keyCombo);
        detail.keyboardEvent = keyboardEvent;
        var event = new CustomEvent(keyCombo.event, {
          detail: detail,
          cancelable: true
        });
        this[handlerName].call(this, event);
        if (event.defaultPrevented) {
          keyboardEvent.preventDefault();
        }
      }
    };
  })();
/**
   * @demo demo/index.html
   * @polymerBehavior
   */
  Polymer.IronControlState = {

    properties: {

      /**
       * If true, the element currently has focus.
       */
      focused: {
        type: Boolean,
        value: false,
        notify: true,
        readOnly: true,
        reflectToAttribute: true
      },

      /**
       * If true, the user cannot interact with this element.
       */
      disabled: {
        type: Boolean,
        value: false,
        notify: true,
        observer: '_disabledChanged',
        reflectToAttribute: true
      },

      _oldTabIndex: {
        type: Number
      },

      _boundFocusBlurHandler: {
        type: Function,
        value: function() {
          return this._focusBlurHandler.bind(this);
        }
      }

    },

    observers: [
      '_changedControlState(focused, disabled)'
    ],

    ready: function() {
      this.addEventListener('focus', this._boundFocusBlurHandler, true);
      this.addEventListener('blur', this._boundFocusBlurHandler, true);
    },

    _focusBlurHandler: function(event) {
      // NOTE(cdata):  if we are in ShadowDOM land, `event.target` will
      // eventually become `this` due to retargeting; if we are not in
      // ShadowDOM land, `event.target` will eventually become `this` due
      // to the second conditional which fires a synthetic event (that is also
      // handled). In either case, we can disregard `event.path`.

      if (event.target === this) {
        this._setFocused(event.type === 'focus');
      } else if (!this.shadowRoot && !this.isLightDescendant(event.target)) {
        this.fire(event.type, {sourceEvent: event}, {
          node: this,
          bubbles: event.bubbles,
          cancelable: event.cancelable
        });
      }
    },

    _disabledChanged: function(disabled, old) {
      this.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      this.style.pointerEvents = disabled ? 'none' : '';
      if (disabled) {
        this._oldTabIndex = this.tabIndex;
        this.focused = false;
        this.tabIndex = -1;
      } else if (this._oldTabIndex !== undefined) {
        this.tabIndex = this._oldTabIndex;
      }
    },

    _changedControlState: function() {
      // _controlStateChanged is abstract, follow-on behaviors may implement it
      if (this._controlStateChanged) {
        this._controlStateChanged();
      }
    }

  };
/**
   * @demo demo/index.html
   * @polymerBehavior Polymer.IronButtonState
   */
  Polymer.IronButtonStateImpl = {

    properties: {

      /**
       * If true, the user is currently holding down the button.
       */
      pressed: {
        type: Boolean,
        readOnly: true,
        value: false,
        reflectToAttribute: true,
        observer: '_pressedChanged'
      },

      /**
       * If true, the button toggles the active state with each tap or press
       * of the spacebar.
       */
      toggles: {
        type: Boolean,
        value: false,
        reflectToAttribute: true
      },

      /**
       * If true, the button is a toggle and is currently in the active state.
       */
      active: {
        type: Boolean,
        value: false,
        notify: true,
        reflectToAttribute: true
      },

      /**
       * True if the element is currently being pressed by a "pointer," which
       * is loosely defined as mouse or touch input (but specifically excluding
       * keyboard input).
       */
      pointerDown: {
        type: Boolean,
        readOnly: true,
        value: false
      },

      /**
       * True if the input device that caused the element to receive focus
       * was a keyboard.
       */
      receivedFocusFromKeyboard: {
        type: Boolean,
        readOnly: true
      },

      /**
       * The aria attribute to be set if the button is a toggle and in the
       * active state.
       */
      ariaActiveAttribute: {
        type: String,
        value: 'aria-pressed',
        observer: '_ariaActiveAttributeChanged'
      }
    },

    listeners: {
      down: '_downHandler',
      up: '_upHandler',
      tap: '_tapHandler'
    },

    observers: [
      '_detectKeyboardFocus(focused)',
      '_activeChanged(active, ariaActiveAttribute)'
    ],

    keyBindings: {
      'enter:keydown': '_asyncClick',
      'space:keydown': '_spaceKeyDownHandler',
      'space:keyup': '_spaceKeyUpHandler',
    },

    _mouseEventRe: /^mouse/,

    _tapHandler: function() {
      if (this.toggles) {
       // a tap is needed to toggle the active state
        this._userActivate(!this.active);
      } else {
        this.active = false;
      }
    },

    _detectKeyboardFocus: function(focused) {
      this._setReceivedFocusFromKeyboard(!this.pointerDown && focused);
    },

    // to emulate native checkbox, (de-)activations from a user interaction fire
    // 'change' events
    _userActivate: function(active) {
      if (this.active !== active) {
        this.active = active;
        this.fire('change');
      }
    },

    _downHandler: function(event) {
      this._setPointerDown(true);
      this._setPressed(true);
      this._setReceivedFocusFromKeyboard(false);
    },

    _upHandler: function() {
      this._setPointerDown(false);
      this._setPressed(false);
    },

    /**
     * @param {!KeyboardEvent} event .
     */
    _spaceKeyDownHandler: function(event) {
      var keyboardEvent = event.detail.keyboardEvent;
      var target = Polymer.dom(keyboardEvent).localTarget;

      // Ignore the event if this is coming from a focused light child, since that
      // element will deal with it.
      if (this.isLightDescendant(/** @type {Node} */(target)))
        return;

      keyboardEvent.preventDefault();
      keyboardEvent.stopImmediatePropagation();
      this._setPressed(true);
    },

    /**
     * @param {!KeyboardEvent} event .
     */
    _spaceKeyUpHandler: function(event) {
      var keyboardEvent = event.detail.keyboardEvent;
      var target = Polymer.dom(keyboardEvent).localTarget;

      // Ignore the event if this is coming from a focused light child, since that
      // element will deal with it.
      if (this.isLightDescendant(/** @type {Node} */(target)))
        return;

      if (this.pressed) {
        this._asyncClick();
      }
      this._setPressed(false);
    },

    // trigger click asynchronously, the asynchrony is useful to allow one
    // event handler to unwind before triggering another event
    _asyncClick: function() {
      this.async(function() {
        this.click();
      }, 1);
    },

    // any of these changes are considered a change to button state

    _pressedChanged: function(pressed) {
      this._changedButtonState();
    },

    _ariaActiveAttributeChanged: function(value, oldValue) {
      if (oldValue && oldValue != value && this.hasAttribute(oldValue)) {
        this.removeAttribute(oldValue);
      }
    },

    _activeChanged: function(active, ariaActiveAttribute) {
      if (this.toggles) {
        this.setAttribute(this.ariaActiveAttribute,
                          active ? 'true' : 'false');
      } else {
        this.removeAttribute(this.ariaActiveAttribute);
      }
      this._changedButtonState();
    },

    _controlStateChanged: function() {
      if (this.disabled) {
        this._setPressed(false);
      } else {
        this._changedButtonState();
      }
    },

    // provide hook for follow-on behaviors to react to button-state

    _changedButtonState: function() {
      if (this._buttonStateChanged) {
        this._buttonStateChanged(); // abstract
      }
    }

  };

  /** @polymerBehavior */
  Polymer.IronButtonState = [
    Polymer.IronA11yKeysBehavior,
    Polymer.IronButtonStateImpl
  ];
(function() {
    var Utility = {
      distance: function(x1, y1, x2, y2) {
        var xDelta = (x1 - x2);
        var yDelta = (y1 - y2);

        return Math.sqrt(xDelta * xDelta + yDelta * yDelta);
      },

      now: window.performance && window.performance.now ?
          window.performance.now.bind(window.performance) : Date.now
    };

    /**
     * @param {HTMLElement} element
     * @constructor
     */
    function ElementMetrics(element) {
      this.element = element;
      this.width = this.boundingRect.width;
      this.height = this.boundingRect.height;

      this.size = Math.max(this.width, this.height);
    }

    ElementMetrics.prototype = {
      get boundingRect () {
        return this.element.getBoundingClientRect();
      },

      furthestCornerDistanceFrom: function(x, y) {
        var topLeft = Utility.distance(x, y, 0, 0);
        var topRight = Utility.distance(x, y, this.width, 0);
        var bottomLeft = Utility.distance(x, y, 0, this.height);
        var bottomRight = Utility.distance(x, y, this.width, this.height);

        return Math.max(topLeft, topRight, bottomLeft, bottomRight);
      }
    };

    /**
     * @param {HTMLElement} element
     * @constructor
     */
    function Ripple(element) {
      this.element = element;
      this.color = window.getComputedStyle(element).color;

      this.wave = document.createElement('div');
      this.waveContainer = document.createElement('div');
      this.wave.style.backgroundColor = this.color;
      this.wave.classList.add('wave');
      this.waveContainer.classList.add('wave-container');
      Polymer.dom(this.waveContainer).appendChild(this.wave);

      this.resetInteractionState();
    }

    Ripple.MAX_RADIUS = 300;

    Ripple.prototype = {
      get recenters() {
        return this.element.recenters;
      },

      get center() {
        return this.element.center;
      },

      get mouseDownElapsed() {
        var elapsed;

        if (!this.mouseDownStart) {
          return 0;
        }

        elapsed = Utility.now() - this.mouseDownStart;

        if (this.mouseUpStart) {
          elapsed -= this.mouseUpElapsed;
        }

        return elapsed;
      },

      get mouseUpElapsed() {
        return this.mouseUpStart ?
          Utility.now () - this.mouseUpStart : 0;
      },

      get mouseDownElapsedSeconds() {
        return this.mouseDownElapsed / 1000;
      },

      get mouseUpElapsedSeconds() {
        return this.mouseUpElapsed / 1000;
      },

      get mouseInteractionSeconds() {
        return this.mouseDownElapsedSeconds + this.mouseUpElapsedSeconds;
      },

      get initialOpacity() {
        return this.element.initialOpacity;
      },

      get opacityDecayVelocity() {
        return this.element.opacityDecayVelocity;
      },

      get radius() {
        var width2 = this.containerMetrics.width * this.containerMetrics.width;
        var height2 = this.containerMetrics.height * this.containerMetrics.height;
        var waveRadius = Math.min(
          Math.sqrt(width2 + height2),
          Ripple.MAX_RADIUS
        ) * 1.1 + 5;

        var duration = 1.1 - 0.2 * (waveRadius / Ripple.MAX_RADIUS);
        var timeNow = this.mouseInteractionSeconds / duration;
        var size = waveRadius * (1 - Math.pow(80, -timeNow));

        return Math.abs(size);
      },

      get opacity() {
        if (!this.mouseUpStart) {
          return this.initialOpacity;
        }

        return Math.max(
          0,
          this.initialOpacity - this.mouseUpElapsedSeconds * this.opacityDecayVelocity
        );
      },

      get outerOpacity() {
        // Linear increase in background opacity, capped at the opacity
        // of the wavefront (waveOpacity).
        var outerOpacity = this.mouseUpElapsedSeconds * 0.3;
        var waveOpacity = this.opacity;

        return Math.max(
          0,
          Math.min(outerOpacity, waveOpacity)
        );
      },

      get isOpacityFullyDecayed() {
        return this.opacity < 0.01 &&
          this.radius >= Math.min(this.maxRadius, Ripple.MAX_RADIUS);
      },

      get isRestingAtMaxRadius() {
        return this.opacity >= this.initialOpacity &&
          this.radius >= Math.min(this.maxRadius, Ripple.MAX_RADIUS);
      },

      get isAnimationComplete() {
        return this.mouseUpStart ?
          this.isOpacityFullyDecayed : this.isRestingAtMaxRadius;
      },

      get translationFraction() {
        return Math.min(
          1,
          this.radius / this.containerMetrics.size * 2 / Math.sqrt(2)
        );
      },

      get xNow() {
        if (this.xEnd) {
          return this.xStart + this.translationFraction * (this.xEnd - this.xStart);
        }

        return this.xStart;
      },

      get yNow() {
        if (this.yEnd) {
          return this.yStart + this.translationFraction * (this.yEnd - this.yStart);
        }

        return this.yStart;
      },

      get isMouseDown() {
        return this.mouseDownStart && !this.mouseUpStart;
      },

      resetInteractionState: function() {
        this.maxRadius = 0;
        this.mouseDownStart = 0;
        this.mouseUpStart = 0;

        this.xStart = 0;
        this.yStart = 0;
        this.xEnd = 0;
        this.yEnd = 0;
        this.slideDistance = 0;

        this.containerMetrics = new ElementMetrics(this.element);
      },

      draw: function() {
        var scale;
        var translateString;
        var dx;
        var dy;

        this.wave.style.opacity = this.opacity;

        scale = this.radius / (this.containerMetrics.size / 2);
        dx = this.xNow - (this.containerMetrics.width / 2);
        dy = this.yNow - (this.containerMetrics.height / 2);


        // 2d transform for safari because of border-radius and overflow:hidden clipping bug.
        // https://bugs.webkit.org/show_bug.cgi?id=98538
        this.waveContainer.style.webkitTransform = 'translate(' + dx + 'px, ' + dy + 'px)';
        this.waveContainer.style.transform = 'translate3d(' + dx + 'px, ' + dy + 'px, 0)';
        this.wave.style.webkitTransform = 'scale(' + scale + ',' + scale + ')';
        this.wave.style.transform = 'scale3d(' + scale + ',' + scale + ',1)';
      },

      /** @param {Event=} event */
      downAction: function(event) {
        var xCenter = this.containerMetrics.width / 2;
        var yCenter = this.containerMetrics.height / 2;

        this.resetInteractionState();
        this.mouseDownStart = Utility.now();

        if (this.center) {
          this.xStart = xCenter;
          this.yStart = yCenter;
          this.slideDistance = Utility.distance(
            this.xStart, this.yStart, this.xEnd, this.yEnd
          );
        } else {
          this.xStart = event ?
              event.detail.x - this.containerMetrics.boundingRect.left :
              this.containerMetrics.width / 2;
          this.yStart = event ?
              event.detail.y - this.containerMetrics.boundingRect.top :
              this.containerMetrics.height / 2;
        }

        if (this.recenters) {
          this.xEnd = xCenter;
          this.yEnd = yCenter;
          this.slideDistance = Utility.distance(
            this.xStart, this.yStart, this.xEnd, this.yEnd
          );
        }

        this.maxRadius = this.containerMetrics.furthestCornerDistanceFrom(
          this.xStart,
          this.yStart
        );

        this.waveContainer.style.top =
          (this.containerMetrics.height - this.containerMetrics.size) / 2 + 'px';
        this.waveContainer.style.left =
          (this.containerMetrics.width - this.containerMetrics.size) / 2 + 'px';

        this.waveContainer.style.width = this.containerMetrics.size + 'px';
        this.waveContainer.style.height = this.containerMetrics.size + 'px';
      },

      /** @param {Event=} event */
      upAction: function(event) {
        if (!this.isMouseDown) {
          return;
        }

        this.mouseUpStart = Utility.now();
      },

      remove: function() {
        Polymer.dom(this.waveContainer.parentNode).removeChild(
          this.waveContainer
        );
      }
    };

    Polymer({
      is: 'paper-ripple',

      behaviors: [
        Polymer.IronA11yKeysBehavior
      ],

      properties: {
        /**
         * The initial opacity set on the wave.
         *
         * @attribute initialOpacity
         * @type number
         * @default 0.25
         */
        initialOpacity: {
          type: Number,
          value: 0.25
        },

        /**
         * How fast (opacity per second) the wave fades out.
         *
         * @attribute opacityDecayVelocity
         * @type number
         * @default 0.8
         */
        opacityDecayVelocity: {
          type: Number,
          value: 0.8
        },

        /**
         * If true, ripples will exhibit a gravitational pull towards
         * the center of their container as they fade away.
         *
         * @attribute recenters
         * @type boolean
         * @default false
         */
        recenters: {
          type: Boolean,
          value: false
        },

        /**
         * If true, ripples will center inside its container
         *
         * @attribute recenters
         * @type boolean
         * @default false
         */
        center: {
          type: Boolean,
          value: false
        },

        /**
         * A list of the visual ripples.
         *
         * @attribute ripples
         * @type Array
         * @default []
         */
        ripples: {
          type: Array,
          value: function() {
            return [];
          }
        },

        /**
         * True when there are visible ripples animating within the
         * element.
         */
        animating: {
          type: Boolean,
          readOnly: true,
          reflectToAttribute: true,
          value: false
        },

        /**
         * If true, the ripple will remain in the "down" state until `holdDown`
         * is set to false again.
         */
        holdDown: {
          type: Boolean,
          value: false,
          observer: '_holdDownChanged'
        },

        /**
         * If true, the ripple will not generate a ripple effect
         * via pointer interaction.
         * Calling ripple's imperative api like `simulatedRipple` will
         * still generate the ripple effect.
         */
        noink: {
          type: Boolean,
          value: false
        },

        _animating: {
          type: Boolean
        },

        _boundAnimate: {
          type: Function,
          value: function() {
            return this.animate.bind(this);
          }
        }
      },

      get target () {
        var ownerRoot = Polymer.dom(this).getOwnerRoot();
        var target;

        if (this.parentNode.nodeType == 11) { // DOCUMENT_FRAGMENT_NODE
          target = ownerRoot.host;
        } else {
          target = this.parentNode;
        }

        return target;
      },

      keyBindings: {
        'enter:keydown': '_onEnterKeydown',
        'space:keydown': '_onSpaceKeydown',
        'space:keyup': '_onSpaceKeyup'
      },

      attached: function() {
        // Set up a11yKeysBehavior to listen to key events on the target,
        // so that space and enter activate the ripple even if the target doesn't
        // handle key events. The key handlers deal with `noink` themselves.
        this.keyEventTarget = this.target;
        this.listen(this.target, 'up', 'uiUpAction');
        this.listen(this.target, 'down', 'uiDownAction');
      },

      detached: function() {
        this.unlisten(this.target, 'up', 'uiUpAction');
        this.unlisten(this.target, 'down', 'uiDownAction');
      },

      get shouldKeepAnimating () {
        for (var index = 0; index < this.ripples.length; ++index) {
          if (!this.ripples[index].isAnimationComplete) {
            return true;
          }
        }

        return false;
      },

      simulatedRipple: function() {
        this.downAction(null);

        // Please see polymer/polymer#1305
        this.async(function() {
          this.upAction();
        }, 1);
      },

      /**
       * Provokes a ripple down effect via a UI event,
       * respecting the `noink` property.
       * @param {Event=} event
       */
      uiDownAction: function(event) {
        if (!this.noink) {
          this.downAction(event);
        }
      },

      /**
       * Provokes a ripple down effect via a UI event,
       * *not* respecting the `noink` property.
       * @param {Event=} event
       */
      downAction: function(event) {
        if (this.holdDown && this.ripples.length > 0) {
          return;
        }

        var ripple = this.addRipple();

        ripple.downAction(event);

        if (!this._animating) {
          this.animate();
        }
      },

      /**
       * Provokes a ripple up effect via a UI event,
       * respecting the `noink` property.
       * @param {Event=} event
       */
      uiUpAction: function(event) {
        if (!this.noink) {
          this.upAction(event);
        }
      },

      /**
       * Provokes a ripple up effect via a UI event,
       * *not* respecting the `noink` property.
       * @param {Event=} event
       */
      upAction: function(event) {
        if (this.holdDown) {
          return;
        }

        this.ripples.forEach(function(ripple) {
          ripple.upAction(event);
        });

        this.animate();
      },

      onAnimationComplete: function() {
        this._animating = false;
        this.$.background.style.backgroundColor = null;
        this.fire('transitionend');
      },

      addRipple: function() {
        var ripple = new Ripple(this);

        Polymer.dom(this.$.waves).appendChild(ripple.waveContainer);
        this.$.background.style.backgroundColor = ripple.color;
        this.ripples.push(ripple);

        this._setAnimating(true);

        return ripple;
      },

      removeRipple: function(ripple) {
        var rippleIndex = this.ripples.indexOf(ripple);

        if (rippleIndex < 0) {
          return;
        }

        this.ripples.splice(rippleIndex, 1);

        ripple.remove();

        if (!this.ripples.length) {
          this._setAnimating(false);
        }
      },

      animate: function() {
        var index;
        var ripple;

        this._animating = true;

        for (index = 0; index < this.ripples.length; ++index) {
          ripple = this.ripples[index];

          ripple.draw();

          this.$.background.style.opacity = ripple.outerOpacity;

          if (ripple.isOpacityFullyDecayed && !ripple.isRestingAtMaxRadius) {
            this.removeRipple(ripple);
          }
        }

        if (!this.shouldKeepAnimating && this.ripples.length === 0) {
          this.onAnimationComplete();
        } else {
          window.requestAnimationFrame(this._boundAnimate);
        }
      },

      _onEnterKeydown: function() {
        this.uiDownAction();
        this.async(this.uiUpAction, 1);
      },

      _onSpaceKeydown: function() {
        this.uiDownAction();
      },

      _onSpaceKeyup: function() {
        this.uiUpAction();
      },

      // note: holdDown does not respect noink since it can be a focus based
      // effect.
      _holdDownChanged: function(newVal, oldVal) {
        if (oldVal === undefined) {
          return;
        }
        if (newVal) {
          this.downAction();
        } else {
          this.upAction();
        }
      }

      /**
      Fired when the animation finishes.
      This is useful if you want to wait until
      the ripple animation finishes to perform some action.

      @event transitionend
      @param {{node: Object}} detail Contains the animated node.
      */
    });
  })();
/**
   * `Polymer.PaperRippleBehavior` dynamically implements a ripple
   * when the element has focus via pointer or keyboard.
   *
   * NOTE: This behavior is intended to be used in conjunction with and after
   * `Polymer.IronButtonState` and `Polymer.IronControlState`.
   *
   * @polymerBehavior Polymer.PaperRippleBehavior
   */
  Polymer.PaperRippleBehavior = {

    properties: {
      /**
       * If true, the element will not produce a ripple effect when interacted
       * with via the pointer.
       */
      noink: {
        type: Boolean,
        observer: '_noinkChanged'
      },

      /**
       * @type {Element|undefined}
       */
      _rippleContainer: {
        type: Object,
      }
    },

    /**
     * Ensures a `<paper-ripple>` element is available when the element is
     * focused.
     */
    _buttonStateChanged: function() {
      if (this.focused) {
        this.ensureRipple();
      }
    },

    /**
     * In addition to the functionality provided in `IronButtonState`, ensures
     * a ripple effect is created when the element is in a `pressed` state.
     */
    _downHandler: function(event) {
      Polymer.IronButtonStateImpl._downHandler.call(this, event);
      if (this.pressed) {
        this.ensureRipple(event);
      }
    },

    /**
     * Ensures this element contains a ripple effect. For startup efficiency
     * the ripple effect is dynamically on demand when needed.
     * @param {!Event=} optTriggeringEvent (optional) event that triggered the
     * ripple.
     */
    ensureRipple: function(optTriggeringEvent) {
      if (!this.hasRipple()) {
        this._ripple = this._createRipple();
        this._ripple.noink = this.noink;
        var rippleContainer = this._rippleContainer || this.root;
        if (rippleContainer) {
          Polymer.dom(rippleContainer).appendChild(this._ripple);
        }
        if (optTriggeringEvent) {
          // Check if the event happened inside of the ripple container
          // Fall back to host instead of the root because distributed text
          // nodes are not valid event targets
          var domContainer = Polymer.dom(this._rippleContainer || this);
          var target = Polymer.dom(optTriggeringEvent).rootTarget;
          if (domContainer.deepContains( /** @type {Node} */(target))) {
            this._ripple.uiDownAction(optTriggeringEvent);
          }
        }
      }
    },

    /**
     * Returns the `<paper-ripple>` element used by this element to create
     * ripple effects. The element's ripple is created on demand, when
     * necessary, and calling this method will force the
     * ripple to be created.
     */
    getRipple: function() {
      this.ensureRipple();
      return this._ripple;
    },

    /**
     * Returns true if this element currently contains a ripple effect.
     * @return {boolean}
     */
    hasRipple: function() {
      return Boolean(this._ripple);
    },

    /**
     * Create the element's ripple effect via creating a `<paper-ripple>`.
     * Override this method to customize the ripple element.
     * @return {!PaperRippleElement} Returns a `<paper-ripple>` element.
     */
    _createRipple: function() {
      return /** @type {!PaperRippleElement} */ (
          document.createElement('paper-ripple'));
    },

    _noinkChanged: function(noink) {
      if (this.hasRipple()) {
        this._ripple.noink = noink;
      }
    }

  };
/** @polymerBehavior Polymer.PaperButtonBehavior */
  Polymer.PaperButtonBehaviorImpl = {

    properties: {

      /**
       * The z-depth of this element, from 0-5. Setting to 0 will remove the
       * shadow, and each increasing number greater than 0 will be "deeper"
       * than the last.
       *
       * @attribute elevation
       * @type number
       * @default 1
       */
      elevation: {
        type: Number,
        reflectToAttribute: true,
        readOnly: true
      }

    },

    observers: [
      '_calculateElevation(focused, disabled, active, pressed, receivedFocusFromKeyboard)',
      '_computeKeyboardClass(receivedFocusFromKeyboard)'
    ],

    hostAttributes: {
      role: 'button',
      tabindex: '0',
      animated: true
    },

    _calculateElevation: function() {
      var e = 1;
      if (this.disabled) {
        e = 0;
      } else if (this.active || this.pressed) {
        e = 4;
      } else if (this.receivedFocusFromKeyboard) {
        e = 3;
      }
      this._setElevation(e);
    },

    _computeKeyboardClass: function(receivedFocusFromKeyboard) {
      this.toggleClass('keyboard-focus', receivedFocusFromKeyboard);
    },

    /**
     * In addition to `IronButtonState` behavior, when space key goes down,
     * create a ripple down effect.
     *
     * @param {!KeyboardEvent} event .
     */
    _spaceKeyDownHandler: function(event) {
      Polymer.IronButtonStateImpl._spaceKeyDownHandler.call(this, event);
      // Ensure that there is at most one ripple when the space key is held down.
      if (this.hasRipple() && this.getRipple().ripples.length < 1) {
        this._ripple.uiDownAction();
      }
    },

    /**
     * In addition to `IronButtonState` behavior, when space key goes up,
     * create a ripple up effect.
     *
     * @param {!KeyboardEvent} event .
     */
    _spaceKeyUpHandler: function(event) {
      Polymer.IronButtonStateImpl._spaceKeyUpHandler.call(this, event);
      if (this.hasRipple()) {
        this._ripple.uiUpAction();
      }
    }

  };

  /** @polymerBehavior */
  Polymer.PaperButtonBehavior = [
    Polymer.IronButtonState,
    Polymer.IronControlState,
    Polymer.PaperRippleBehavior,
    Polymer.PaperButtonBehaviorImpl
  ];
/**
   * `Polymer.PaperInkyFocusBehavior` implements a ripple when the element has keyboard focus.
   *
   * @polymerBehavior Polymer.PaperInkyFocusBehavior
   */
  Polymer.PaperInkyFocusBehaviorImpl = {

    observers: [
      '_focusedChanged(receivedFocusFromKeyboard)'
    ],

    _focusedChanged: function(receivedFocusFromKeyboard) {
      if (receivedFocusFromKeyboard) {
        this.ensureRipple();
      }
      if (this.hasRipple()) {
        this._ripple.holdDown = receivedFocusFromKeyboard;
      }
    },

    _createRipple: function() {
      var ripple = Polymer.PaperRippleBehavior._createRipple();
      ripple.id = 'ink';
      ripple.setAttribute('center', '');
      ripple.classList.add('circle');
      return ripple;
    }

  };

  /** @polymerBehavior Polymer.PaperInkyFocusBehavior */
  Polymer.PaperInkyFocusBehavior = [
    Polymer.IronButtonState,
    Polymer.IronControlState,
    Polymer.PaperRippleBehavior,
    Polymer.PaperInkyFocusBehaviorImpl
  ];
Polymer({
      is: 'paper-icon-button',

      hostAttributes: {
        role: 'button',
        tabindex: '0'
      },

      behaviors: [
        Polymer.PaperInkyFocusBehavior
      ],

      properties: {
        /**
         * The URL of an image for the icon. If the src property is specified,
         * the icon property should not be.
         */
        src: {
          type: String
        },

        /**
         * Specifies the icon name or index in the set of icons available in
         * the icon's icon set. If the icon property is specified,
         * the src property should not be.
         */
        icon: {
          type: String
        },

        /**
         * Specifies the alternate text for the button, for accessibility.
         */
        alt: {
          type: String,
          observer: "_altChanged"
        }
      },

      _altChanged: function(newValue, oldValue) {
        var label = this.getAttribute('aria-label');

        // Don't stomp over a user-set aria-label.
        if (!label || oldValue == label) {
          this.setAttribute('aria-label', newValue);
        }
      }
    });
Polymer({
    is: 'paper-material',

    properties: {
      /**
       * The z-depth of this element, from 0-5. Setting to 0 will remove the
       * shadow, and each increasing number greater than 0 will be "deeper"
       * than the last.
       *
       * @attribute elevation
       * @type number
       * @default 1
       */
      elevation: {
        type: Number,
        reflectToAttribute: true,
        value: 1
      },

      /**
       * Set this to true to animate the shadow when setting a new
       * `elevation` value.
       *
       * @attribute animated
       * @type boolean
       * @default false
       */
      animated: {
        type: Boolean,
        reflectToAttribute: true,
        value: false
      }
    }
  });
Polymer({
      is: 'paper-toolbar',

      hostAttributes: {
        'role': 'toolbar'
      },

      properties: {
        /**
         * Controls how the items are aligned horizontally when they are placed
         * at the bottom.
         * Options are `start`, `center`, `end`, `justified` and `around`.
         */
        bottomJustify: {
          type: String,
          value: ''
        },

        /**
         * Controls how the items are aligned horizontally.
         * Options are `start`, `center`, `end`, `justified` and `around`.
         */
        justify: {
          type: String,
          value: ''
        },

        /**
         * Controls how the items are aligned horizontally when they are placed
         * in the middle.
         * Options are `start`, `center`, `end`, `justified` and `around`.
         */
        middleJustify: {
          type: String,
          value: ''
        }

      },

      attached: function() {
        this._observer = this._observe(this);
        this._updateAriaLabelledBy();
      },

      detached: function() {
        if (this._observer) {
          this._observer.disconnect();
        }
      },

      _observe: function(node) {
        var observer = new MutationObserver(function() {
          this._updateAriaLabelledBy();
        }.bind(this));
        observer.observe(node, {
          childList: true,
          subtree: true
        });
        return observer;
      },

      _updateAriaLabelledBy: function() {
        var labelledBy = [];
        var contents = Polymer.dom(this.root).querySelectorAll('content');
        for (var content, index = 0; content = contents[index]; index++) {
          var nodes = Polymer.dom(content).getDistributedNodes();
          for (var node, jndex = 0; node = nodes[jndex]; jndex++) {
            if (node.classList && node.classList.contains('title')) {
              if (node.id) {
                labelledBy.push(node.id);
              } else {
                var id = 'paper-toolbar-label-' + Math.floor(Math.random() * 10000);
                node.id = id;
                labelledBy.push(id);
              }
            }
          }
        }
        if (labelledBy.length > 0) {
          this.setAttribute('aria-labelledby', labelledBy.join(' '));
        }
      },

      _computeBarExtraClasses: function(barJustify) {
        if (!barJustify) return '';

        return barJustify + (barJustify === 'justified' ? '' : '-justified');
      }
    });
/**
   * The `iron-iconset-svg` element allows users to define their own icon sets
   * that contain svg icons. The svg icon elements should be children of the
   * `iron-iconset-svg` element. Multiple icons should be given distinct id's.
   *
   * Using svg elements to create icons has a few advantages over traditional
   * bitmap graphics like jpg or png. Icons that use svg are vector based so
   * they are resolution independent and should look good on any device. They
   * are stylable via css. Icons can be themed, colorized, and even animated.
   *
   * Example:
   *
   *     <iron-iconset-svg name="my-svg-icons" size="24">
   *       <svg>
   *         <defs>
   *           <g id="shape">
   *             <rect x="12" y="0" width="12" height="24" />
   *             <circle cx="12" cy="12" r="12" />
   *           </g>
   *         </defs>
   *       </svg>
   *     </iron-iconset-svg>
   *
   * This will automatically register the icon set "my-svg-icons" to the iconset
   * database.  To use these icons from within another element, make a
   * `iron-iconset` element and call the `byId` method
   * to retrieve a given iconset. To apply a particular icon inside an
   * element use the `applyIcon` method. For example:
   *
   *     iconset.applyIcon(iconNode, 'car');
   *
   * @element iron-iconset-svg
   * @demo demo/index.html
   * @implements {Polymer.Iconset}
   */
  Polymer({
    is: 'iron-iconset-svg',

    properties: {

      /**
       * The name of the iconset.
       */
      name: {
        type: String,
        observer: '_nameChanged'
      },

      /**
       * The size of an individual icon. Note that icons must be square.
       */
      size: {
        type: Number,
        value: 24
      }

    },

    attached: function() {
      this.style.display = 'none';
    },

    /**
     * Construct an array of all icon names in this iconset.
     *
     * @return {!Array} Array of icon names.
     */
    getIconNames: function() {
      this._icons = this._createIconMap();
      return Object.keys(this._icons).map(function(n) {
        return this.name + ':' + n;
      }, this);
    },

    /**
     * Applies an icon to the given element.
     *
     * An svg icon is prepended to the element's shadowRoot if it exists,
     * otherwise to the element itself.
     *
     * @method applyIcon
     * @param {Element} element Element to which the icon is applied.
     * @param {string} iconName Name of the icon to apply.
     * @return {?Element} The svg element which renders the icon.
     */
    applyIcon: function(element, iconName) {
      // insert svg element into shadow root, if it exists
      element = element.root || element;
      // Remove old svg element
      this.removeIcon(element);
      // install new svg element
      var svg = this._cloneIcon(iconName);
      if (svg) {
        var pde = Polymer.dom(element);
        pde.insertBefore(svg, pde.childNodes[0]);
        return element._svgIcon = svg;
      }
      return null;
    },

    /**
     * Remove an icon from the given element by undoing the changes effected
     * by `applyIcon`.
     *
     * @param {Element} element The element from which the icon is removed.
     */
    removeIcon: function(element) {
      // Remove old svg element
      if (element._svgIcon) {
        Polymer.dom(element).removeChild(element._svgIcon);
        element._svgIcon = null;
      }
    },

    /**
     *
     * When name is changed, register iconset metadata
     *
     */
    _nameChanged: function() {
      new Polymer.IronMeta({type: 'iconset', key: this.name, value: this});
      this.async(function() {
        this.fire('iron-iconset-added', this, {node: window});
      });
    },

    /**
     * Create a map of child SVG elements by id.
     *
     * @return {!Object} Map of id's to SVG elements.
     */
    _createIconMap: function() {
      // Objects chained to Object.prototype (`{}`) have members. Specifically,
      // on FF there is a `watch` method that confuses the icon map, so we
      // need to use a null-based object here.
      var icons = Object.create(null);
      Polymer.dom(this).querySelectorAll('[id]')
        .forEach(function(icon) {
          icons[icon.id] = icon;
        });
      return icons;
    },

    /**
     * Produce installable clone of the SVG element matching `id` in this
     * iconset, or `undefined` if there is no matching element.
     *
     * @return {Element} Returns an installable clone of the SVG element
     * matching `id`.
     */
    _cloneIcon: function(id) {
      // create the icon map on-demand, since the iconset itself has no discrete
      // signal to know when it's children are fully parsed
      this._icons = this._icons || this._createIconMap();
      return this._prepareSvgClone(this._icons[id], this.size);
    },

    /**
     * @param {Element} sourceSvg
     * @param {number} size
     * @return {Element}
     */
    _prepareSvgClone: function(sourceSvg, size) {
      if (sourceSvg) {
        var content = sourceSvg.cloneNode(true),
            svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'),
            viewBox = content.getAttribute('viewBox') || '0 0 ' + size + ' ' + size;
        svg.setAttribute('viewBox', viewBox);
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        // TODO(dfreedm): `pointer-events: none` works around https://crbug.com/370136
        // TODO(sjmiles): inline style may not be ideal, but avoids requiring a shadow-root
        svg.style.cssText = 'pointer-events: none; display: block; width: 100%; height: 100%;';
        svg.appendChild(content).removeAttribute('id');
        return svg;
      }
      return null;
    }

  });
/**
   * The `<platinum-sw-register>` element handles
   * [service worker](http://www.html5rocks.com/en/tutorials/service-worker/introduction/)
   * registration, reflects the overall service worker state, and coordinates the configuration
   * provided by other Service Worker Elements.
   * `<platinum-sw-register>` is used as a parent element for child elements in the
   * `<platinum-sw-*>` group.
   *
   *     <platinum-sw-register skip-waiting
   *                           clients-claim
   *                           auto-register
   *                           state="{{state}}"
   *                           on-service-worker-error="handleSWError"
   *                           on-service-worker-updated="handleSWUpdated"
   *                           on-service-worker-installed="handleSWInstalled">
   *       ...one or more <platinum-sw-*> children which share the service worker registration...
   *     </platinum-sw-register>
   *
   * Please see https://github.com/PolymerElements/platinum-sw#top-level-sw-importjs for a
   * *crucial* prerequisite file you must create before `<platinum-sw-register>` can be used!
   *
   * @demo demo/index.html An offline-capable eReader demo.
   */
  Polymer({
    is: 'platinum-sw-register',

    // Used as an "emergency" switch if we make breaking changes in the way <platinum-sw-register>
    // talks to service-worker.js. Otherwise, it shouldn't need to change, and isn't meant to be
    // kept in sync with the element's release number.
    _version: '1.0',

    /**
     * Fired when the initial service worker installation completes successfully.
     * The service worker will normally only be installed once, the first time a page with a
     * `<platinum-sw-register>` element is visited in a given browser. If the same page is visited
     * again, the existing service worker will be reused, and there won't be another
     * `service-worker-installed` fired.
     *
     * @event service-worker-installed
     * @param {String} A message indicating that the installation succeeded.
     */

    /**
     * Fired when the service worker update flow completes successfully.
     * If you make changes to your `<platinum-sw-register>` configuration (i.e. by adding in new
     * `<platinum-sw-*>` child elements, or changing their attributes), users who had the old
     * service worker installed will get the update installed when they see the modified elements.
     *
     * @event service-worker-updated
     * @param {String} A message indicating that the update succeeded.
     */

    /**
     * Fired when an error prevents the service worker installation from completing.
     *
     * @event service-worker-error
     * @param {String} A message indicating what went wrong.
     */

    properties: {
      /**
       * Whether this element should automatically register the corresponding service worker as
       * soon as its added to a page.
       *
       * If set to `false`, then the service worker won't be automatically registered, and you
       * must call this element's `register()` method if you want service worker functionality.
       * This is useful if, for example, the service worker needs to be configured using
       * information that isn't immediately available at the time the page loads.
       *
       * If set to `true`, the service worker will be automatically registered without having to
       * call any methods.
       */
      autoRegister: {
        type: Boolean,
        value: false
      },

      /**
       * The URI used as a base when constructing relative paths to service worker helper libraries
       * that need to be loaded.
       *
       * This can normally be kept set to the default, which will use the directory containing this
       * element as the base. However, if you [Vulcanize](https://github.com/polymer/vulcanize) your
       * elements, then the default base might not be appropriate anymore. This will allow you to
       * override it.
       *
       * See https://github.com/PolymerElements/platinum-sw#relative-paths--vulcanization for more
       * information.
       */
      baseUri: {
        type: String,
        // Grab the URI of this file to use as a base when resolving relative paths.
        // See https://github.com/webcomponents/webcomponentsjs/blob/88240ba9ef4cebb1579e07f7888c7b58ec017a39/src/HTMLImports/base.js#L31
        // for background on document._currentScript. We want to support document.currentScript
        // as well, on the off chance that the polyfills aren't loaded.
        // Fallback to './' as a default, though current browsers that don't support
        // document.currentScript also don't support service workers.
        value: document._currentScript ? document._currentScript.baseURI :
          (document.currentScript ? document.currentScript.baseURI : './')
      },

      /**
       * Whether the activated service worker should [take immediate control](https://slightlyoff.github.io/ServiceWorker/spec/service_worker/#clients-claim-method)
       * of any pages under its scope.
       *
       * If this is `false`, the service worker won't have any effect until the next time the page
       * is visited/reloaded.
       * If this is `true`, it will take control and start handling events for the current page
       * (and any pages under the same scope open in other tabs/windows) as soon it's active.
       * @see {@link https://slightlyoff.github.io/ServiceWorker/spec/service_worker/#clients-claim-method}
       */
      clientsClaim: {
        type: Boolean,
        value: false
      },

      /**
       * The service worker script that is [registered](https://slightlyoff.github.io/ServiceWorker/spec/service_worker/#navigator-service-worker-register).
       * The script *should* be located at the top level of your site, to ensure that it is able
       * to control all the pages on your site.
       *
       * It's *strongly* recommended that you create a top-level file named `sw-import.js`
       * containing only:
       *
       * `importScripts('bower_components/platinum-sw/service-worker.js');`
       *
       * (adjust to match the path where your `platinum-sw` element directory can be found).
       *
       * This will ensure that your service worker script contains everything needed to play
       * nicely with the Service Worker Elements group.
       *
       * @see {@link https://slightlyoff.github.io/ServiceWorker/spec/service_worker/#navigator-service-worker-register}
       */
      href: {
        type: String,
        value: 'sw-import.js'
      },

      /**
       * Whether the page should be automatically reloaded (via `window.location.reload()`) when
       * the service worker is successfully installed.
       *
       * While it's perfectly valid to continue using a page with a freshly installed service
       * worker, it's a common pattern to want to reload it immediately following the install.
       * This ensures that, for example, if you're using a `<platinum-sw-cache>` with an on the
       * fly caching strategy, it will get a chance to intercept all the requests needed to render
       * your page and store them in the cache.
       *
       * If you don't immediately reload your page, then any resources that were loaded before the
       * service worker was installed (e.g. this `platinum-sw-register.html` file) won't be present
       * in the cache until the next time the page is loaded.
       *
       * Note that this reload will only happen when a service worker is installed for the first
       * time. If the service worker is subsequently updated, it won't trigger another reload.
       */
      reloadOnInstall: {
        type: Boolean,
        value: false
      },

      /**
       * By default, the service worker will use a scope that applies to all pages at the same
       * directory level or lower. This is almost certainly what you want, as illustrated by the
       * following hypothetical serving setup:
       *
       * ```
       * /root/
       *   service-worker.js
       *   index.html
       *   subdir1/
       *     index.html
       *   subdir2/
       *     index.html
       * ```
       *
       * So by default, registering `/root/service-worker.js` will cause the service worker's scope
       * to cover `/root/index.html`, `/root/subdir1/index.html`, and /root/subdir2/index.html`.
       *
       * If, for some reason, you need to register `/root/service-worker.js` from within
       * `/root/subdir1/index.html`, *and* you want that registration to only cover
       * `/root/subdir1/**`, you can override this `scope` property and set it to `'./'`.
       *
       * There is more context about default scopes and how scope overrides work in
       * [this Stack Overflow](http://stackoverflow.com/a/33881341/385997) response.
       *
       * @see {@link https://slightlyoff.github.io/ServiceWorker/spec/service_worker/#navigator-service-worker-register}
       */
      scope: {
        type: String,
        value: null
      },

      /**
       * Whether an updated service worker should [bypass the `waiting` state](https://slightlyoff.github.io/ServiceWorker/spec/service_worker/#service-worker-global-scope-skipwaiting)
       * and immediately become `active`.
       *
       * Normally, during an update, the new service worker stays in the
       * `waiting` state until the current page and any other tabs/windows that are using the old
       * service worker are unloaded.
       *
       * If this is `false`, an updated service worker won't be activated until all instances of
       * the old server worker have been unloaded.
       *
       * If this is `true`, an updated service worker will become `active` immediately.
       * @see {@link https://slightlyoff.github.io/ServiceWorker/spec/service_worker/#service-worker-global-scope-skipwaiting}
       */
      skipWaiting: {
        type: Boolean,
        value: false
      },

      /**
       * The current state of the service worker registered by this element.
       *
       * One of:
       * - 'installed'
       * - 'updated'
       * - 'error'
       * - 'unsupported'
       */
      state: {
        notify: true,
        readOnly: true,
        type: String
      }
    },

    /**
     * Registers the service worker based on the configuration options in this element and any
     * child elements.
     *
     * If you set the `autoRegister` property to `true`, then this method is called automatically
     * at page load.
     * It can be useful to set `autoRegister` to `false` and then explicitly call this method if
     * there are options that are only configured after the page is loaded.
     */
    register: function() {
      if ('serviceWorker' in navigator) {
        this._constructServiceWorkerUrl().then(function(serviceWorkerUrl) {
          this._registerServiceWorker(serviceWorkerUrl);
        }.bind(this));
      } else {
        this._setState('unsupported');
        this.fire('service-worker-error', 'Service workers are not available in the current browser.');
      }
    },

    _constructServiceWorkerUrl: function() {
      var paramsPromises = [];
      var children = Polymer.dom(this).children;
      var baseUri = new URL(this.baseUri, window.location.href);

      for (var i = 0; i < children.length; i++) {
        if (typeof children[i]._getParameters === 'function') {
          paramsPromises.push(children[i]._getParameters(baseUri));
        }
      }

      return Promise.all(paramsPromises).then(function(paramsResolutions) {
        var params = {
          baseURI: baseUri,
          version: this._version
        };

        paramsResolutions.forEach(function(childParams) {
          Object.keys(childParams).forEach(function(key) {
            if (Array.isArray(params[key])) {
              params[key] = params[key].concat(childParams[key]);
            } else {
              params[key] = [].concat(childParams[key]);
            }
          });
        });

        return params;
      }.bind(this)).then(function(params) {
        if (params.importscriptLate) {
          if (params.importscript) {
            params.importscript = params.importscript.concat(params.importscriptLate);
          } else {
            params.importscript = params.importscriptLate;
          }
        }

        if (params.importscript) {
          params.importscript = this._unique(params.importscript);
        }

        // We've already concatenated importscriptLate, so don't include it in the serialized URL.
        delete params.importscriptLate;

        params.clientsClaim = this.clientsClaim;
        params.skipWaiting = this.skipWaiting;

        var serviceWorkerUrl = new URL(this.href, window.location);
        // It's very important to ensure that the serialization is stable.
        // Serializing the same settings should always produce the same URL.
        // Serializing different settings should always produce a different URL.
        // This ensures that the service worker upgrade flow is triggered when settings change.
        serviceWorkerUrl.search = this._serializeUrlParams(params);

        return serviceWorkerUrl;
      }.bind(this));
    },

    _unique: function(arr) {
      return arr.filter(function(item, index) {
        return arr.indexOf(item) === index;
      });
    },

    _serializeUrlParams: function(params) {
      return Object.keys(params).sort().map(function(key) {
        // encodeURIComponent(['a', 'b']) => 'a%2Cb',
        // so this will still work when the values are Arrays.
        // TODO: It won't work if the values in the Arrays have ',' characters in them.
        return encodeURIComponent(key) + "=" + encodeURIComponent(params[key]);
      }).join('&');
    },

    _registerServiceWorker: function(serviceWorkerUrl) {
      var options = this.scope ? {scope: this.scope} : null;
      navigator.serviceWorker.register(serviceWorkerUrl, options).then(function(registration) {
        if (registration.active) {
          this._setState('installed');
        }

        registration.onupdatefound = function() {
          var installingWorker = registration.installing;
          installingWorker.onstatechange = function() {
            switch (installingWorker.state) {
              case 'installed':
                if (navigator.serviceWorker.controller) {
                  this._setState('updated');
                  this.fire('service-worker-updated',
                    'A new service worker was installed, replacing the old service worker.');
                } else {
                  if (this.reloadOnInstall) {
                    window.location.reload();
                  } else {
                    this._setState('installed');
                    this.fire('service-worker-installed', 'A new service worker was installed.');
                  }
                }
              break;

              case 'redundant':
                this._setState('error');
                this.fire('service-worker-error', 'The installing service worker became redundant.');
              break;
            }
          }.bind(this);
        }.bind(this);
      }.bind(this)).catch(function(error) {
        this._setState('error');
        this.fire('service-worker-error', error.toString());
        if (error.name === 'NetworkError') {
          var location = serviceWorkerUrl.origin + serviceWorkerUrl.pathname;
          console.error('A valid service worker script was not found at ' + location + '\n' +
            'To learn how to fix this, please see\n' +
            'https://github.com/PolymerElements/platinum-sw#top-level-sw-importjs');
        }
      }.bind(this));
    },

    attached: function() {
      if (this.autoRegister) {
        this.async(this.register);
      }
    }
  });
/**
   * The `<platinum-sw-cache>` element makes it easy to precache specific resources, perform runtime
   * caching, and serve your cached resources when a network is unavailable.
   * Under the hood, the [sw-toolbox](https://github.com/googlechrome/sw-toolbox) library is used
   * for all the caching and request handling logic.
   * `<platinum-sw-cache>` needs to be a child element of `<platinum-sw-register>`.
   * A simple, yet useful configuration is
   *
   *     <platinum-sw-register auto-register>
   *       <platinum-sw-cache></platinum-sw-cache>
   *     </platinum-sw-register>
   *
   * This is enough to have all of the resources your site uses cached at runtime, both local and
   * cross-origin.
   * (It uses the default `defaultCacheStrategy` of "networkFirst".)
   * When there's a network available, visits to your site will go against the network copy of the
   * resources, but if someone visits your site when they're offline, all the cached resources will
   * be used.
   *
   * @demo demo/index.html An offline-capable eReader demo.
   */
  Polymer({
    is: 'platinum-sw-cache',

    properties: {
      /**
       * Used to configure `<platinum-sw-precache>` behavior via a JSON file instead of via
       * attributes. This can come in handy when the configuration (e.g. which files to precache)
       * depends on the results of a build script.
       *
       * If configuration for the same properties are provided in both the JSON file and via the
       * element's attributes, then in general the JSON file's values take precedence. The one
       * exception is the `precache` property. Any values in the element's `precache` attribute will
       * be concatenated with the values in the JSON file's `precache` property and the set of files
       * that are precached will be the union of the two.
       *
       * There's one additional option, `precacheFingerprint`, that can be set in the JSON. If using
       * a build script that might output a large number of files to precache, its recommended
       * that your build script generate a unique "fingerprint" of the files. Any changes to the
       * `precacheFingerprint` value will result in the underlying service worker kicking off the
       * process of caching the files listed in `precache`.
       * While there are a few different strategies for generating an appropriate
       * `precacheFingerprint` value, a process that makes sense is to use a stable hash of the
       * serialized `precache` array. That way, any changes to the list of files in `precache`
       * will result in a new `precacheFingerprint` value.
       * If your build script is Node.js based, one way to generate this hash is:
       *
       *     var md5 = require('crypto').createHash('md5');
       *     md5.update(JSON.stringify(precache));
       *     var precacheFingerprint = md5.digest('hex');
       *
       * Alternatively, you could use something like the
       * [SHA-1 signature](http://stackoverflow.com/questions/1161869/how-to-get-sha-of-the-latest-commit-from-remote-git-repository)
       * of your latest `git` commit for the `precacheFingerprint` value.
       *
       * An example file may look like:
       *
       *     {
       *       "cacheId": "my-cache-id",
       *       "defaultCacheStrategy": "fastest",
       *       "disabled": false,
       *       "precache": ["file1.html", "file2.css"],
       *       "precacheFingerprint": "FINGERPRINT_OF_FILES_IN_PRECACHE"
       *     }
       */
      cacheConfigFile: String,

      /**
       * An id used to construct the name for the
       * [Cache](https://slightlyoff.github.io/ServiceWorker/spec/service_worker/#cache)
       * in which all the resources will be stored.
       *
       * If nothing is provided, the default value set in
       * [`toolbox.options.cacheName`](https://github.com/GoogleChrome/sw-toolbox/blob/8763dcc9fbc9352d58f184050e2131c42f7b6d68/lib/options.js#L28)
       * will be used.
       *
       * The `cacheId` is combined with the service worker's scope to construct the cache name, so
       * two `<platinum-sw-cache>` elements that are associated with different scopes will use
       * different caches.
       */
      cacheId: String,

      /**
       * The caching strategy used for all requests, both for local and cross-origin resources.
       *
       * For a list of strategies, see the [`sw-toolbox` documentation](https://github.com/GoogleChrome/sw-toolbox#built-in-handlers).
       * Specify a strategy as a string, without the "toolbox" prefix. E.g., for
       * `toolbox.networkFirst`, set `defaultCacheStrategy` to "networkFirst".
       *
       * Note that the "cacheFirst" and "cacheOnly" strategies are not recommended, and may be
       * explicitly prevented in a future release. More information can be found at
       * https://github.com/PolymerElements/platinum-sw#cacheonly--cachefirst-defaultcachestrategy-considered-harmful
       *
       * @see {@link https://github.com/GoogleChrome/sw-toolbox#built-in-handlers}
       */
      defaultCacheStrategy: {
        type: String,
        value: 'networkFirst'
      },

      /**
       * If set to true, this element will not set up service worker caching. This is useful to
       * conditionally enable or disable caching depending on the build environment.
       */
      disabled: {
        type: Boolean,
        value: false
      },

      /**
       * Used to provide a list of URLs that are always precached as soon as the service worker is
       * installed. Corresponds to  [`sw-toolbox`'s `precache()` method](https://github.com/GoogleChrome/sw-toolbox#toolboxprecachearrayofurls).
       *
       * This is useful for URLs that that wouldn't necessarily be picked up by runtime caching,
       * i.e. a list of resources that are needed by one of the subpages of your site, or a list of
       * resources that are only loaded via user interaction.
       *
       * `precache` can be used in conjunction with `cacheConfigFile`, and the two arrays will be
       * concatenated.
       *
       * @see {@link https://github.com/GoogleChrome/sw-toolbox#toolboxprecachearrayofurls}
       */
      precache: {
        type: Array,
        value: function() { return []; }
      }
    },

    _getParameters: function(baseURI) {
      return new Promise(function(resolve) {
        var params = {
          importscriptLate: new URL('bootstrap/sw-toolbox-setup.js', baseURI).href,
          defaultCacheStrategy: this.defaultCacheStrategy,
          precache: this.precache
        };

        if (this.cacheConfigFile) {
          params.cacheConfigFile = this.cacheConfigFile;
          window.fetch(this.cacheConfigFile).then(function(response) {
            if (!response.ok) {
              throw Error('unable to load ' + this.cacheConfigFile);
            }
            return response.json();
          }.bind(this)).then(function(config) {
            this.disabled = config.disabled;
            if (this.disabled) {
              // Use an empty set of parameters to effectively disable caching.
              params = {};
            } else {
              // If there's a hash of the list of files to precache provided in the config file,
              // then copy that over to the params that will be used to construct the service worker
              // URL. This works around the issue where a potentially large number of precache
              // files could result in a longer URL than a browser will allow.
              // The actual list of files to precache (in config.precache) will be dealt by the
              // service worker during the install phase, so we can ignore it here.
              // See https://github.com/PolymerElements/platinum-sw/issues/53
              if (config.precacheFingerprint) {
                params.precacheFingerprint = config.precacheFingerprint;
              } else {
                params.precache = params.precache.concat(config.precache);
              }
              params.cacheId = config.cacheId || params.cacheId;
              params.defaultCacheStrategy = config.defaultCacheStrategy ||
                params.defaultCacheStrategy;
            }
          }.bind(this)).catch(function(error) {
            console.info('Skipping precaching: ' + error.message);
          }).then(function() {
            resolve(params);
          });
        } else {
          resolve(params);
        }
      }.bind(this));
    }
  });
Polymer({
  is: 'pwa-main',
  properties: {
    requestPending: {
      type: Boolean,
      value: false,
    },
  },

  ready: function() {
  }
});